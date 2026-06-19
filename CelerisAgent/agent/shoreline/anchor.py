from __future__ import annotations

from functools import lru_cache
import math
from pathlib import Path
from typing import Any

from agent.config import ROOT
from agent.geo import lat_degrees_to_meters, lon_degrees_to_meters


SHORELINE_ROOT = ROOT / "shoreline_database"
OSM_COASTLINE = SHORELINE_ROOT / "lines.shp"
NATURAL_EARTH_COASTLINE = SHORELINE_ROOT / "ne_10m_coastline.shp"
SEARCH_RADII_M = (2_000.0, 5_000.0, 10_000.0, 25_000.0, 50_000.0)
MAX_ANCHOR_DISTANCE_FACTOR = 0.75
MAX_ANCHOR_DISTANCE_M = 25_000.0


def anchor_center_to_shoreline(
    dem_request: dict[str, Any],
    center: dict[str, Any],
    width_m: float,
    height_m: float,
) -> dict[str, Any]:
    if not should_anchor_to_shoreline(dem_request, center):
        return center

    lon = center.get("lon")
    lat = center.get("lat")
    if lon is None or lat is None:
        return center

    try:
        anchor = nearest_shoreline_point(float(lon), float(lat), max(width_m, height_m))
    except Exception as exc:
        anchored = dict(center)
        anchored["shoreline_anchor"] = {
            "status": "failed",
            "reason": str(exc),
        }
        anchored["needs_geographic_review"] = True
        anchored["review_reason"] = f"Local shoreline anchoring failed: {exc}"
        return anchored

    if not anchor:
        anchored = dict(center)
        anchored["shoreline_anchor"] = {
            "status": "not_found",
            "searched_radii_m": list(SEARCH_RADII_M),
        }
        anchored["needs_geographic_review"] = True
        anchored["review_reason"] = "No local OSM or Natural Earth shoreline was found near the resolved AOI center."
        return anchored

    max_allowed = min(MAX_ANCHOR_DISTANCE_M, max(1_500.0, MAX_ANCHOR_DISTANCE_FACTOR * max(width_m, height_m)))
    if anchor["distance_m"] > max_allowed:
        anchored = dict(center)
        anchored["shoreline_anchor"] = {
            **anchor,
            "status": "rejected_too_far",
            "max_allowed_distance_m": max_allowed,
        }
        anchored["needs_geographic_review"] = True
        anchored["review_reason"] = (
            f"Nearest local shoreline is {anchor['distance_m']:.0f} m from the resolved center, "
            f"beyond the {max_allowed:.0f} m anchoring threshold."
        )
        return anchored

    return {
        **center,
        "lon": anchor["lon"],
        "lat": anchor["lat"],
        "label": f"{center.get('label') or dem_request.get('location') or 'AOI'} shoreline anchor",
        "source": "local_shoreline_anchor",
        "pre_shoreline_anchor_center": {
            "lon": float(lon),
            "lat": float(lat),
            "label": center.get("label"),
            "source": center.get("source"),
        },
        "shoreline_anchor": {
            **anchor,
            "status": "applied",
            "policy": "default coastal DEM center snapped to nearest local shoreline",
        },
        "confidence": center.get("confidence") or "medium",
        "reason": append_reason(center.get("reason"), f"Snapped to nearest {anchor['dataset_label']} shoreline {anchor['distance_m']:.0f} m from the resolved center."),
    }


def should_anchor_to_shoreline(dem_request: dict[str, Any], center: dict[str, Any]) -> bool:
    if dem_request.get("spatial_resolution_locked"):
        return False
    if dem_request.get("shoreline_anchor") is False or dem_request.get("snap_to_shoreline") is False:
        return False
    if center.get("source") in {"aoi_bbox_wgs84", "locked_dem_request", "local_shoreline_anchor"}:
        return False
    return True


def nearest_shoreline_point(lon: float, lat: float, domain_max_m: float) -> dict[str, Any] | None:
    datasets = (
        ("osm_coastline", "OSM coastline", OSM_COASTLINE),
        ("natural_earth_10m_coastline", "Natural Earth 10m coastline", NATURAL_EARTH_COASTLINE),
    )
    for source_id, label, path in datasets:
        if not path.exists():
            continue
        for radius_m in SEARCH_RADII_M:
            if radius_m < min(2_000.0, 0.25 * domain_max_m):
                continue
            candidates = load_candidate_geometries(str(path), lon, lat, radius_m)
            if not candidates:
                continue
            nearest = nearest_point_from_geometries(candidates, lon, lat)
            if nearest:
                return {
                    **nearest,
                    "source": source_id,
                    "dataset_label": label,
                    "search_radius_m": radius_m,
                    "feature_count": len(candidates),
                }
    return None


@lru_cache(maxsize=256)
def load_candidate_geometries(path: str, lon: float, lat: float, radius_m: float) -> tuple[Any, ...]:
    try:
        import geopandas as gpd
    except Exception as exc:
        raise RuntimeError("Local shoreline anchoring requires geopandas, shapely, and pyproj.") from exc

    query_lon = round(float(lon), 4)
    query_lat = round(float(lat), 4)
    radius = float(radius_m)
    dlon = abs(radius / max(lon_degrees_to_meters(1.0, query_lat), 1.0))
    dlat = abs(radius / max(lat_degrees_to_meters(1.0), 1.0))
    bbox = (query_lon - dlon, query_lat - dlat, query_lon + dlon, query_lat + dlat)
    try:
        gdf = gpd.read_file(path, bbox=bbox)
    except Exception as exc:
        raise RuntimeError(f"Could not read shoreline file {Path(path).name}: {exc}") from exc
    if gdf.empty:
        return ()
    return tuple(geom for geom in gdf.geometry if geom is not None and not geom.is_empty)


def nearest_point_from_geometries(geometries: tuple[Any, ...], lon: float, lat: float) -> dict[str, Any] | None:
    from pyproj import Transformer
    from shapely.geometry import Point
    from shapely.ops import nearest_points, transform

    epsg = local_utm_epsg(lon, lat)
    to_local = Transformer.from_crs("EPSG:4326", epsg, always_xy=True).transform
    to_wgs84 = Transformer.from_crs(epsg, "EPSG:4326", always_xy=True).transform
    point_local = transform(to_local, Point(lon, lat))
    best = None
    for index, geom in enumerate(geometries):
        geom_local = transform(to_local, geom)
        _p0, shoreline_point = nearest_points(point_local, geom_local)
        distance = float(point_local.distance(shoreline_point))
        if best is None or distance < best["distance_m"]:
            shoreline_wgs84 = transform(to_wgs84, shoreline_point)
            best = {
                "lon": float(shoreline_wgs84.x),
                "lat": float(shoreline_wgs84.y),
                "distance_m": distance,
                "feature_index": index,
                "local_projection": epsg,
            }
    return best


def local_utm_epsg(lon: float, lat: float) -> str:
    zone = int(math.floor((lon + 180.0) / 6.0) + 1)
    zone = max(1, min(zone, 60))
    return f"EPSG:{32600 + zone if lat >= 0 else 32700 + zone}"


def append_reason(existing: Any, addition: str) -> str:
    text = str(existing or "").strip()
    if text:
        return f"{text} {addition}"
    return addition
