from __future__ import annotations

import math
import os
import re
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

import requests

from agent.config import CACHE
from agent.dem.export import artifact
from agent.dem.workflow import normalize_attachments
from agent.io_utils import read_json, write_json
from agent.sources.aoi import aoi_resolution_steps, resolve_aoi
from agent.sources.common import USER_AGENT, normalize_name


VIEWER_URL = "https://topotools.cr.usgs.gov/topobathy_viewer/"
WCS_ENDPOINT = "https://dmsdata.cr.usgs.gov/geoserver/wcs"
CATALOG_PATH = CACHE / "coned_wcs_catalog.json"
WCS_NS = {
    "wcs": "http://www.opengis.net/wcs/2.0",
    "gml": "http://www.opengis.net/gml/3.2",
}
DEFAULT_MAX_NATIVE_SOURCE_CELLS = 10_000_000


def retrieve_coned_wcs_dem(job_dir: Path, dem_request: dict[str, Any], options: dict[str, Any] | None = None) -> dict[str, Any]:
    options = dict(options or {})
    aoi = resolve_aoi(dem_request)
    catalog = load_coned_catalog()
    candidates = find_covering_layers(catalog["layers"], aoi["bbox_wgs84"])
    source_search = {
        "source": "usgs_coned_wcs",
        "viewer_url": VIEWER_URL,
        "wcs_endpoint": WCS_ENDPOINT,
        "aoi": aoi,
        "catalog_layer_count": len(catalog["layers"]),
        "candidate_count": len(candidates),
        "candidates": candidates[:20],
        "selection": None,
    }
    selected_path = [
        "parse_dem_request",
        "resolve_aoi_center",
        *aoi_resolution_steps(aoi),
        "build_aoi_bbox",
        "route_online_dem_source_tiers",
        "usgs_coned_wcs_catalog_match",
    ]
    if not candidates:
        write_json(job_dir / "work" / "usgs_coned_wcs_candidates.json", source_search)
        return {
            "status": "source_not_found",
            "selected_path": selected_path,
            "artifacts": [],
            "validation": None,
            "source_search": source_search,
            "source_retrieval": {
                "method": "not_downloaded",
                "reason": "no_coned_wcs_coverage_for_aoi",
            },
        }

    selected = candidates[0]
    source_search["selection"] = {"reason": "smallest_covering_coned_wcs_layer", "layer_name": selected["name"]}
    write_json(job_dir / "work" / "usgs_coned_wcs_candidates.json", source_search)
    try:
        description = describe_coverage(selected)
        selected_path.append("usgs_coned_wcs_describe")
        if not described_coverage_intersects_aoi(aoi, description):
            retrieval = {
                "method": "not_downloaded",
                "reason": "described_coned_coverage_does_not_intersect_aoi",
                "layer_name": selected["name"],
                "coverage_id": description["coverage_id"],
                "service_crs": description["crs"],
                "service_bounds": description["bounds"],
            }
            write_json(job_dir / "work" / "usgs_coned_wcs_service_bounds_miss.json", retrieval)
            return {
                "status": "source_not_found",
                "selected_path": [*selected_path, "usgs_coned_wcs_service_bounds_miss"],
                "artifacts": [],
                "validation": None,
                "source_search": source_search,
                "source_retrieval": retrieval,
            }
        size_check = estimate_native_grid_size(aoi, description)
        max_cells = max_native_source_cells()
        if size_check["cell_count"] > max_cells and not dem_request.get("approve_large_native_extraction"):
            retrieval = {
                "method": "not_downloaded",
                "reason": "estimated_native_grid_too_large_requires_confirmation",
                "layer_name": selected["name"],
                "native_resolution_xy_m": size_check["native_resolution_xy_m"],
                "estimated_width": size_check["width"],
                "estimated_height": size_check["height"],
                "estimated_cell_count": size_check["cell_count"],
                "max_native_source_cells": max_cells,
                "native_vertical_datum": "NAVD88",
            }
            write_json(job_dir / "work" / "usgs_coned_wcs_size_guard.json", retrieval)
            return {
                "status": "needs_user_confirmation",
                "selected_path": [*selected_path, "estimate_native_grid_size", "await_large_download_confirmation"],
                "artifacts": [],
                "validation": None,
                "source_search": source_search,
                "source_retrieval": retrieval,
            }
        exported = export_coverage(job_dir, aoi, selected, description)
        selected_path.append("usgs_coned_wcs_extract")
    except Exception as exc:
        failure = {
            "method": "not_downloaded",
            "reason": "coned_wcs_extract_failed",
            "error": str(exc),
            "layer_name": selected["name"],
        }
        write_json(job_dir / "work" / "usgs_coned_wcs_failure.json", failure)
        return {
            "status": "source_candidates_ready",
            "selected_path": [*selected_path, "coned_wcs_failed"],
            "artifacts": [],
            "validation": None,
            "source_search": source_search,
            "source_retrieval": failure,
        }

    dx = exported["grid_spacing_m"]["dx"]
    dy = exported["grid_spacing_m"]["dy"]
    source_georeferencing = {
        "source": "usgs_coned_wcs",
        "viewer_url": VIEWER_URL,
        "wcs_endpoint": WCS_ENDPOINT,
        "layer_id": selected["id"],
        "layer_name": selected["name"],
        "coverage_id": description["coverage_id"],
        "source_resolution_type": "service_native",
        "service_crs": description["crs"],
        "service_bounds": description["bounds"],
        "source_bbox_wgs84": aoi["bbox_wgs84"],
        "source_bbox_service_crs": exported["subset_bbox"],
        "service_grid_spacing_m": exported["grid_spacing_m"],
        "native_format": description.get("native_format"),
        "vertical_datum": "NAVD88",
        "z_units": "meters",
    }
    options["vertical_datum"] = options.get("vertical_datum") or "NAVD88"
    options["z_units"] = options.get("z_units") or "meters"
    options["max_cells"] = 0
    options["output_grid"] = "local_meters"
    options["output_dx_m"] = dx
    options["output_dy_m"] = dy
    options["output_crs"] = "LOCAL_METERS"
    options["source_georeferencing"] = source_georeferencing

    result = normalize_attachments(job_dir, [exported["path"]], options)
    raw_artifact = artifact(job_dir, exported["path"], "source_geotiff", "USGS CoNED WCS GeoTIFF")
    result["artifacts"] = [raw_artifact, *result.get("artifacts", [])]
    result["selected_path"] = [*selected_path, *result["selected_path"]]
    result["source_search"] = source_search
    result["source_retrieval"] = {
        "method": "usgs_coned_wcs_getcoverage",
        "tier": 2,
        "source": "usgs_coned_wcs",
        "candidate_name": selected["name"],
        "layer_id": selected["id"],
        "layer_name": selected["name"],
        "coverage_id": description["coverage_id"],
        "request_url": exported["request_url"],
        "downloaded_file": str(exported["path"]),
        "native_resolution_m": max(dx, dy),
        "native_resolution_xy_m": exported["grid_spacing_m"],
        "native_vertical_datum": "NAVD88",
        "source_resolution_type": "service_native",
        "service_crs": description["crs"],
        "width": exported.get("width"),
        "height": exported.get("height"),
    }
    write_json(
        job_dir / "work" / "usgs_coned_wcs_retrieval.json",
        {
            "candidate": selected,
            "coverage_description": description,
            "export": {key: str(value) if isinstance(value, Path) else value for key, value in exported.items()},
            "source_georeferencing": source_georeferencing,
        },
    )
    return result


def load_coned_catalog(force_refresh: bool = False) -> dict[str, Any]:
    if not force_refresh:
        cached = read_json(CATALOG_PATH, default={})
        if cached.get("layers"):
            return cached
    html = requests.get(VIEWER_URL, headers={"User-Agent": USER_AGENT}, timeout=30).text
    match = re.search(r'src="(main\.[^"]+\.js)"', html)
    if not match:
        raise RuntimeError("Could not find CoNED viewer main JavaScript bundle.")
    js_url = f"{VIEWER_URL.rstrip('/')}/{match.group(1)}"
    js = requests.get(js_url, headers={"User-Agent": USER_AGENT}, timeout=60).text
    layers = parse_viewer_layers(js)
    catalog = {
        "source": "usgs_coned_project_viewer",
        "viewer_url": VIEWER_URL,
        "bundle_url": js_url,
        "wcs_endpoint": WCS_ENDPOINT,
        "layers": layers,
    }
    write_json(CATALOG_PATH, catalog)
    return catalog


def parse_viewer_layers(js: str) -> list[dict[str, Any]]:
    pattern = re.compile(
        r'\{type:"layer",id:"([^"]+)",name:"(topo:[^"]+)",title:"TBDEM".*?extent:\[([^\]]+)\].*?srs:"([^"]+)"',
        re.DOTALL,
    )
    layers_by_name: dict[str, dict[str, Any]] = {}
    for match in pattern.finditer(js):
        layer_id, name, extent_raw, srs = match.groups()
        extent = [float(part) for part in extent_raw.split(",")]
        layer = {
            "id": layer_id,
            "name": name,
            "coverage_id": name.replace(":", "__"),
            "title": title_from_layer_name(name),
            "extent_epsg3857": extent,
            "srs": srs,
            "wcs_endpoint": WCS_ENDPOINT,
            "area_m2": abs((extent[2] - extent[0]) * (extent[3] - extent[1])),
        }
        previous = layers_by_name.get(name)
        if previous is None or preferred_layer_id(layer_id, previous["id"]):
            layers_by_name[name] = layer
    return sorted(layers_by_name.values(), key=lambda item: item["name"])


def preferred_layer_id(candidate_id: str, previous_id: str) -> bool:
    if candidate_id.startswith("all") and not previous_id.startswith("all"):
        return True
    return False


def title_from_layer_name(name: str) -> str:
    return name.removeprefix("topo:").replace("_", " ")


def find_covering_layers(layers: list[dict[str, Any]], bbox_wgs84: list[float]) -> list[dict[str, Any]]:
    bbox = webmercator_bbox_from_wgs84(bbox_wgs84)
    matches = []
    for layer in layers:
        extent = layer["extent_epsg3857"]
        contains = extent[0] <= bbox[0] and extent[1] <= bbox[1] and extent[2] >= bbox[2] and extent[3] >= bbox[3]
        intersects = not (extent[2] < bbox[0] or extent[0] > bbox[2] or extent[3] < bbox[1] or extent[1] > bbox[3])
        if contains or intersects:
            item = dict(layer)
            item["coverage"] = {
                "contains_aoi": contains,
                "intersects_aoi": intersects,
                "request_bbox_epsg3857": bbox,
            }
            matches.append(item)
    matches.sort(key=lambda item: (not item["coverage"]["contains_aoi"], item["area_m2"], item["name"]))
    return matches


def describe_coverage(layer: dict[str, Any]) -> dict[str, Any]:
    params = {
        "service": "WCS",
        "request": "DescribeCoverage",
        "version": "2.0.1",
        "coverageId": layer["name"],
    }
    response = requests.get(WCS_ENDPOINT, headers={"User-Agent": USER_AGENT}, params=params, timeout=30)
    response.raise_for_status()
    root = ET.fromstring(response.content)
    coverage = root.find(".//wcs:CoverageDescription", WCS_NS)
    if coverage is None:
        raise RuntimeError("WCS DescribeCoverage did not return a CoverageDescription.")
    coverage_id = coverage.findtext("wcs:CoverageId", namespaces=WCS_NS) or layer["coverage_id"]
    envelope = coverage.find(".//gml:Envelope", WCS_NS)
    if envelope is None:
        raise RuntimeError("WCS DescribeCoverage did not include an envelope.")
    lower = parse_float_pair(envelope.findtext("gml:lowerCorner", namespaces=WCS_NS))
    upper = parse_float_pair(envelope.findtext("gml:upperCorner", namespaces=WCS_NS))
    axis_labels = (envelope.attrib.get("axisLabels") or "X Y").split()
    offsets = [parse_float_pair(item.text) for item in coverage.findall(".//gml:offsetVector", WCS_NS)]
    dx = vector_length(offsets[0]) if len(offsets) > 0 else None
    dy = vector_length(offsets[1]) if len(offsets) > 1 else dx
    return {
        "coverage_id": coverage_id,
        "requested_layer_name": layer["name"],
        "crs": crs_from_srs_name(envelope.attrib.get("srsName")),
        "srs_name": envelope.attrib.get("srsName"),
        "axis_labels": axis_labels,
        "bounds": [lower[0], lower[1], upper[0], upper[1]],
        "grid_spacing_m": {"dx": dx, "dy": dy},
        "native_format": coverage.findtext("wcs:ServiceParameters/wcs:nativeFormat", namespaces=WCS_NS),
    }


def estimate_native_grid_size(aoi: dict[str, Any], description: dict[str, Any]) -> dict[str, Any]:
    spacing = description.get("grid_spacing_m") or {}
    dx = float(spacing.get("dx") or 0.0)
    dy = float(spacing.get("dy") or dx or 0.0)
    if dx <= 0.0 or dy <= 0.0:
        return {
            "width": 0,
            "height": 0,
            "cell_count": 0,
            "native_resolution_xy_m": {"dx": dx, "dy": dy},
        }
    width = max(2, int(math.ceil(float(aoi["domain_width_m"]) / dx)))
    height = max(2, int(math.ceil(float(aoi["domain_height_m"]) / dy)))
    return {
        "width": width,
        "height": height,
        "cell_count": width * height,
        "native_resolution_xy_m": {"dx": dx, "dy": dy},
    }


def described_coverage_intersects_aoi(aoi: dict[str, Any], description: dict[str, Any]) -> bool:
    if description.get("crs") != "EPSG:3857":
        return True
    request_bbox = webmercator_bbox_from_wgs84(aoi["bbox_wgs84"])
    coverage_bbox = description.get("bounds") or []
    if len(coverage_bbox) != 4:
        return True
    return not (
        coverage_bbox[2] < request_bbox[0]
        or coverage_bbox[0] > request_bbox[2]
        or coverage_bbox[3] < request_bbox[1]
        or coverage_bbox[1] > request_bbox[3]
    )


def max_native_source_cells() -> int:
    raw = os.environ.get("CELERIS_MAX_NATIVE_SOURCE_CELLS")
    if raw:
        try:
            value = int(raw)
            if value > 0:
                return value
        except ValueError:
            pass
    return DEFAULT_MAX_NATIVE_SOURCE_CELLS


def export_coverage(job_dir: Path, aoi: dict[str, Any], layer: dict[str, Any], description: dict[str, Any]) -> dict[str, Any]:
    subset_bbox = webmercator_bbox_from_wgs84(aoi["bbox_wgs84"])
    axis_x = description.get("axis_labels", ["X", "Y"])[0]
    axis_y = description.get("axis_labels", ["X", "Y"])[1]
    params = [
        ("SERVICE", "WCS"),
        ("REQUEST", "GetCoverage"),
        ("VERSION", "2.0.1"),
        ("CoverageId", description["coverage_id"]),
        ("format", "image/tiff"),
        ("subset", f"{axis_x}({subset_bbox[0]},{subset_bbox[2]})"),
        ("subset", f"{axis_y}({subset_bbox[1]},{subset_bbox[3]})"),
    ]
    downloads = job_dir / "downloads"
    downloads.mkdir(parents=True, exist_ok=True)
    dst = downloads / f"usgs_coned_wcs_{safe_layer_filename(layer['id'])}.tif"
    with requests.get(WCS_ENDPOINT, headers={"User-Agent": USER_AGENT}, params=params, stream=True, timeout=180) as response:
        response.raise_for_status()
        chunks = response.iter_content(1024 * 1024)
        first_chunk = next(chunks, b"")
        if first_chunk.lstrip().startswith(b"<?xml"):
            error_path = job_dir / "work" / "usgs_coned_wcs_error.xml"
            with error_path.open("wb") as out:
                out.write(first_chunk)
                for chunk in chunks:
                    if chunk:
                        out.write(chunk)
            raise RuntimeError(f"WCS GetCoverage returned XML error payload: {error_path}")
        with dst.open("wb") as out:
            out.write(first_chunk)
            for chunk in chunks:
                if chunk:
                    out.write(chunk)
        request_url = response.url

    width = height = None
    try:
        import rasterio

        with rasterio.open(dst) as ds:
            width = ds.width
            height = ds.height
            dx = abs(float(ds.transform.a)) or description["grid_spacing_m"]["dx"]
            dy = abs(float(ds.transform.e)) or description["grid_spacing_m"]["dy"]
    except Exception:
        dx = description["grid_spacing_m"]["dx"]
        dy = description["grid_spacing_m"]["dy"]
    return {
        "path": dst,
        "request_url": request_url,
        "subset_bbox": subset_bbox,
        "grid_spacing_m": {"dx": dx, "dy": dy},
        "width": width,
        "height": height,
    }


def webmercator_bbox_from_wgs84(bbox: list[float]) -> list[float]:
    min_lon, min_lat, max_lon, max_lat = bbox
    x0, y0 = lonlat_to_webmercator(min_lon, min_lat)
    x1, y1 = lonlat_to_webmercator(max_lon, max_lat)
    return [min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1)]


def lonlat_to_webmercator(lon: float, lat: float) -> tuple[float, float]:
    radius = 6_378_137.0
    clipped_lat = max(min(lat, 85.05112878), -85.05112878)
    x = radius * math.radians(lon)
    y = radius * math.log(math.tan(math.pi / 4.0 + math.radians(clipped_lat) / 2.0))
    return x, y


def parse_float_pair(text: str | None) -> list[float]:
    if not text:
        raise RuntimeError("Expected a numeric coordinate pair.")
    return [float(value) for value in text.split()]


def vector_length(values: list[float]) -> float:
    return math.sqrt(sum(value * value for value in values))


def crs_from_srs_name(srs_name: str | None) -> str | None:
    if not srs_name:
        return None
    match = re.search(r"/EPSG/0/(\d+)$", srs_name)
    if match:
        return f"EPSG:{match.group(1)}"
    return srs_name


def safe_layer_filename(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", normalize_name(value).replace(" ", "_")).strip("_") or "coverage"
