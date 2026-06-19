from __future__ import annotations

from io import BytesIO
import math
import os
from pathlib import Path
from typing import Any

from PIL import Image
import requests

from agent.dem.export import artifact
from agent.io_utils import read_json, write_json


EOX_WMS_URL = "https://tiles.maps.eox.at/wms"
EOX_LAYER = "s2cloudless"
ESRI_TILE_URL = "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
WEB_MERCATOR_RADIUS_M = 6_378_137.0
WEB_MERCATOR_ORIGIN_SHIFT_M = math.pi * WEB_MERCATOR_RADIUS_M
WEB_MERCATOR_MAX_LAT = 85.05112878
MAX_OVERLAY_SIDE_PX = 8192
TARGET_GSD_M = 5.0
TILE_MAX_PX = 2000
REQUEST_TIMEOUT_SECONDS = 45


def build_domain_georeferencing(job_dir: Path, model: dict[str, Any]) -> dict[str, Any]:
    model_bbox_wgs84 = model.get("bbox_wgs84")
    if valid_bbox(model_bbox_wgs84):
        model_bbox_local = [
            float(model["x_min"]),
            float(model["y_min"]),
            float(model["x_max"]),
            float(model["y_max"]),
        ]
        bbox_wgs84 = normalize_wgs84_bbox(model_bbox_wgs84)
        return {
            "status": "ok",
            "local_crs": "LOCAL_METERS",
            "source_crs": "EPSG:4326",
            "bbox_wgs84": bbox_wgs84,
            "bbox_source_crs": bbox_wgs84,
            "model_bbox_local_m": model_bbox_local,
            "source_local_bbox_m": model_bbox_local,
            "source_bbox_wgs84": bbox_wgs84,
            "source_bbox_source_crs": bbox_wgs84,
            "source_georeferencing": {
                "source": "final_model_lon_lat_axes",
                "coordinate_mapping": model.get("coordinate_mapping"),
            },
            "transform_note": "Final CELERIS lon/lat axes were preserved from a geographic DEM and used directly for the overlay bbox.",
        }

    dem_manifest_path = job_dir / "outputs" / "dem_manifest.json"
    if not dem_manifest_path.exists():
        return {
            "status": "missing_dem_manifest",
            "message": "dem_manifest.json is required to resolve the satellite overlay domain.",
        }

    dem_manifest = read_json(dem_manifest_path)
    dem = dem_manifest.get("dem") or {}
    source_geo = find_source_georeferencing(dem)
    source_bbox_wgs84 = selected_domain_bbox_wgs84(source_geo)
    if not valid_bbox(source_bbox_wgs84):
        return {
            "status": "missing_source_bbox_wgs84",
            "message": "The DEM manifest does not contain a usable WGS84 source bbox.",
            "source_georeferencing": source_geo,
        }

    shape = dem.get("shape") or []
    if len(shape) != 2:
        return {
            "status": "missing_source_shape",
            "message": "The DEM manifest does not contain the source DEM shape.",
            "source_georeferencing": source_geo,
        }

    rows, cols = int(shape[0]), int(shape[1])
    source_dx = float(dem.get("dx") or model.get("dx") or 1.0)
    source_dy = float(dem.get("dy") or model.get("dy") or 1.0)
    source_local_bbox = [0.0, 0.0, max(0.0, (cols - 1) * source_dx), max(0.0, (rows - 1) * source_dy)]
    model_bbox_local = [
        float(model["x_min"]),
        float(model["y_min"]),
        float(model["x_max"]),
        float(model["y_max"]),
    ]

    source_crs = "EPSG:4326"
    source_bbox_crs = source_bbox_wgs84

    model_bbox_crs = interpolate_bbox(source_bbox_crs, source_local_bbox, model_bbox_local)
    model_bbox_wgs84 = transform_bbox_to_wgs84(model_bbox_crs, source_crs)
    if not valid_bbox(model_bbox_wgs84):
        model_bbox_wgs84 = interpolate_bbox(source_bbox_wgs84, source_local_bbox, model_bbox_local)

    return {
        "status": "ok",
        "local_crs": "LOCAL_METERS",
        "source_crs": source_crs,
        "bbox_wgs84": normalize_wgs84_bbox(model_bbox_wgs84),
        "bbox_source_crs": [float(value) for value in model_bbox_crs],
        "model_bbox_local_m": model_bbox_local,
        "source_local_bbox_m": source_local_bbox,
        "source_bbox_wgs84": [float(value) for value in source_bbox_wgs84],
        "source_bbox_source_crs": [float(value) for value in source_bbox_crs],
        "source_georeferencing": source_geo,
        "transform_note": "Axis-aligned local meter model bounds mapped proportionally onto the extracted/requested DEM WGS84 bbox.",
    }


def selected_domain_bbox_wgs84(source_geo: dict[str, Any]) -> Any:
    return (
        source_geo.get("extracted_bbox_wgs84")
        or source_geo.get("requested_bbox_wgs84")
        or source_geo.get("source_bbox_wgs84")
    )


def generate_satellite_overlay(
    job_dir: Path,
    domain_georeferencing: dict[str, Any],
    max_side_px: int | None = None,
    target_gsd_m: float | None = None,
) -> dict[str, Any]:
    selected_path = ["satellite_overlay_generation", "resolve_overlay_domain_georeferencing"]
    if domain_georeferencing.get("status") != "ok":
        return overlay_unavailable(
            selected_path,
            "OVERLAY_GEOREFERENCING_MISSING",
            domain_georeferencing.get("message") or "Domain georeferencing is unavailable.",
            {"domain_georeferencing": domain_georeferencing},
        )

    bbox_wgs84 = domain_georeferencing.get("bbox_wgs84")
    if not valid_bbox(bbox_wgs84):
        return overlay_unavailable(
            selected_path,
            "OVERLAY_BBOX_MISSING",
            "The resolved domain georeferencing does not contain a usable WGS84 bbox.",
            {"domain_georeferencing": domain_georeferencing},
        )

    max_side_px = int(max_side_px or os.environ.get("CELERIS_OVERLAY_MAX_SIDE_PX") or MAX_OVERLAY_SIDE_PX)
    target_gsd_m = float(target_gsd_m or os.environ.get("CELERIS_OVERLAY_TARGET_GSD_M") or TARGET_GSD_M)
    bbox_wgs84 = normalize_wgs84_bbox(bbox_wgs84)
    source_errors: list[str] = []
    try:
        image, summary = fetch_esri_world_imagery(bbox_wgs84, max_side_px=max_side_px)
    except Exception as exc:
        source_errors.append(f"Esri World Imagery failed: {exc}")
        try:
            image, summary = fetch_eox_sentinel2_cloudless(
                bbox_wgs84,
                max_side_px=max_side_px,
                target_gsd_m=target_gsd_m,
            )
        except Exception as fallback_exc:
            source_errors.append(f"EOX Sentinel-2 cloudless failed: {fallback_exc}")
            return overlay_unavailable(
                [*selected_path, "fetch_satellite_overlay"],
                "OVERLAY_DOWNLOAD_FAILED",
                "Satellite overlay download failed: " + " | ".join(source_errors),
                {"bbox_wgs84": bbox_wgs84, "sources": ["esri_world_imagery", "eox_sentinel2_cloudless"]},
            )

    out_dir = job_dir / "outputs"
    overlay_path = out_dir / "overlay.jpg"
    image.save(overlay_path, format="JPEG", quality=100, optimize=True)
    selected_path.extend(["fetch_satellite_overlay", "write_overlay_jpg"])
    source = summary.pop("source")

    overlay_manifest = {
        "schema_version": "0.1.0",
        "filename": "overlay.jpg",
        "source": source,
        "source_errors": source_errors,
        "domain_georeferencing": domain_georeferencing,
        "output": {
            "path": "outputs/overlay.jpg",
            "width_px": image.width,
            "height_px": image.height,
            "max_side_px": max_side_px,
            "target_gsd_m": target_gsd_m,
            **summary,
        },
    }
    manifest_path = out_dir / "overlay_manifest.json"
    write_json(manifest_path, overlay_manifest)
    selected_path.append("write_overlay_manifest")

    artifacts = [
        artifact(job_dir, overlay_path, "satellite_overlay_jpg", "Satellite overlay.jpg"),
        artifact(job_dir, manifest_path, "satellite_overlay_manifest", "Satellite overlay manifest"),
    ]
    checks = [
        {
            "level": "info",
            "code": "SATELLITE_OVERLAY_GENERATED",
            "message": f"overlay.jpg was generated at {image.width} by {image.height} pixels for the final CELERIS domain.",
            "details": {
                "bbox_wgs84": overlay_manifest["domain_georeferencing"]["bbox_wgs84"],
                "width_px": image.width,
                "height_px": image.height,
                "source": source,
            },
        }
    ]
    if summary.get("failed_tiles"):
        checks.append(
            {
                "level": "warning",
                "code": "SATELLITE_OVERLAY_PARTIAL_TILES",
                "message": "Some satellite overlay tiles failed and were left as black pixels.",
                "details": {"failed_tiles": summary["failed_tiles"], "tile_count": summary["tile_count"]},
            }
        )
    return {
        "status": "completed",
        "selected_path": selected_path,
        "validation": validation_report("warning" if summary.get("failed_tiles") else "ok", checks),
        "artifacts": artifacts,
        "overlay": overlay_manifest,
    }


def fetch_eox_sentinel2_cloudless(
    bbox_wgs84: list[float],
    max_side_px: int,
    target_gsd_m: float,
) -> tuple[Image.Image, dict[str, Any]]:
    min_lon, min_lat, max_lon, max_lat = bbox_wgs84
    lat0 = (min_lat + max_lat) / 2.0
    meters_per_degree_lat = 111_132.0
    meters_per_degree_lon = 111_320.0 * max(math.cos(math.radians(lat0)), 0.01)
    width_m = max((max_lon - min_lon) * meters_per_degree_lon, target_gsd_m)
    height_m = max((max_lat - min_lat) * meters_per_degree_lat, target_gsd_m)

    width_px = max(1, int(math.ceil(width_m / target_gsd_m)))
    height_px = max(1, int(math.ceil(height_m / target_gsd_m)))
    long_side = max(width_px, height_px)
    if long_side > max_side_px:
        scale = max_side_px / float(long_side)
        width_px = max(1, int(round(width_px * scale)))
        height_px = max(1, int(round(height_px * scale)))

    image = Image.new("RGB", (width_px, height_px), (0, 0, 0))
    failed_tiles: list[dict[str, Any]] = []
    tile_count = 0
    for row0 in range(0, height_px, TILE_MAX_PX):
        row1 = min(height_px, row0 + TILE_MAX_PX)
        for col0 in range(0, width_px, TILE_MAX_PX):
            col1 = min(width_px, col0 + TILE_MAX_PX)
            tile_count += 1
            tile_bbox = [
                min_lon + (max_lon - min_lon) * col0 / width_px,
                max_lat - (max_lat - min_lat) * row1 / height_px,
                min_lon + (max_lon - min_lon) * col1 / width_px,
                max_lat - (max_lat - min_lat) * row0 / height_px,
            ]
            tile_width = col1 - col0
            tile_height = row1 - row0
            try:
                tile = fetch_wms_tile(tile_bbox, tile_width, tile_height)
                image.paste(tile, (col0, row0))
            except Exception as exc:
                failed_tiles.append({"row0": row0, "col0": col0, "width": tile_width, "height": tile_height, "error": str(exc)})

    if failed_tiles and len(failed_tiles) == tile_count:
        raise RuntimeError(f"All {tile_count} WMS overlay tiles failed. First error: {failed_tiles[0]['error']}")

    return image, {
        "source": {
            "provider": "EOX",
            "service": EOX_WMS_URL,
            "layer": EOX_LAYER,
            "description": "Sentinel-2 cloudless WMS mosaic",
            "attribution": "Contains modified Copernicus Sentinel data processed by EOX.",
        },
        "bbox_wgs84": bbox_wgs84,
        "width_m_approx": width_m,
        "height_m_approx": height_m,
        "effective_gsd_x_m": width_m / width_px,
        "effective_gsd_y_m": height_m / height_px,
        "tile_count": tile_count,
        "failed_tiles": failed_tiles,
        "wms_version": "1.1.1",
        "wms_crs": "EPSG:4326",
    }


def fetch_esri_world_imagery(bbox_wgs84: list[float], max_side_px: int) -> tuple[Image.Image, dict[str, Any]]:
    min_lon, min_lat, max_lon, max_lat = bbox_wgs84
    min_x, min_y = lon_lat_to_web_mercator(min_lon, min_lat)
    max_x, max_y = lon_lat_to_web_mercator(max_lon, max_lat)
    mercator_bbox = [min(min_x, max_x), min(min_y, max_y), max(min_x, max_x), max(min_y, max_y)]
    zoom, pixel_bbox = choose_esri_zoom(mercator_bbox, max_side_px)
    px0, py0, px1, py1 = pixel_bbox
    output_width = max(1, min(max_side_px, int(round(px1 - px0))))
    output_height = max(1, min(max_side_px, int(round(py1 - py0))))

    tile_min_x = int(math.floor(px0 / 256.0))
    tile_max_x = int(math.floor((px1 - 1.0) / 256.0))
    tile_min_y = int(math.floor(py0 / 256.0))
    tile_max_y = int(math.floor((py1 - 1.0) / 256.0))
    tiles_x = tile_max_x - tile_min_x + 1
    tiles_y = tile_max_y - tile_min_y + 1
    tile_count = tiles_x * tiles_y
    if tile_count <= 0:
        raise RuntimeError("Resolved Esri tile range is empty.")

    mosaic = Image.new("RGB", (tiles_x * 256, tiles_y * 256), (0, 0, 0))
    failed_tiles: list[dict[str, Any]] = []
    for tile_y in range(tile_min_y, tile_max_y + 1):
        for tile_x in range(tile_min_x, tile_max_x + 1):
            try:
                tile = fetch_esri_tile(zoom, tile_x, tile_y)
                mosaic.paste(tile, ((tile_x - tile_min_x) * 256, (tile_y - tile_min_y) * 256))
            except Exception as exc:
                failed_tiles.append({"z": zoom, "x": tile_x, "y": tile_y, "error": str(exc)})

    if failed_tiles and len(failed_tiles) == tile_count:
        raise RuntimeError(f"All {tile_count} Esri tiles failed. First error: {failed_tiles[0]['error']}")

    crop_box = (
        int(math.floor(px0 - tile_min_x * 256)),
        int(math.floor(py0 - tile_min_y * 256)),
        int(math.ceil(px1 - tile_min_x * 256)),
        int(math.ceil(py1 - tile_min_y * 256)),
    )
    image = mosaic.crop(crop_box)
    if image.size != (output_width, output_height):
        image = image.resize((output_width, output_height), Image.Resampling.BICUBIC)

    width_m = mercator_bbox[2] - mercator_bbox[0]
    height_m = mercator_bbox[3] - mercator_bbox[1]
    return image, {
        "source": {
            "provider": "Esri",
            "service": "ArcGIS World Imagery MapServer tiles",
            "url_template": ESRI_TILE_URL,
            "description": "World Imagery Web Mercator tile mosaic",
            "attribution": "Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community.",
        },
        "bbox_wgs84": bbox_wgs84,
        "bbox_epsg3857": mercator_bbox,
        "zoom": zoom,
        "width_m_webmercator": width_m,
        "height_m_webmercator": height_m,
        "effective_gsd_x_m": width_m / output_width,
        "effective_gsd_y_m": height_m / output_height,
        "tile_count": tile_count,
        "failed_tiles": failed_tiles,
        "tile_scheme": "ArcGIS Web Mercator XYZ-compatible rows/columns",
    }


def choose_esri_zoom(mercator_bbox: list[float], max_side_px: int) -> tuple[int, tuple[float, float, float, float]]:
    max_zoom = int(os.environ.get("CELERIS_OVERLAY_ESRI_MAX_ZOOM") or 18)
    max_tiles = int(os.environ.get("CELERIS_OVERLAY_MAX_TILES") or 256)
    best_zoom = 0
    best_pixels = mercator_bbox_to_pixels(mercator_bbox, 0)
    for zoom in range(max_zoom + 1):
        pixels = mercator_bbox_to_pixels(mercator_bbox, zoom)
        px0, py0, px1, py1 = pixels
        width = px1 - px0
        height = py1 - py0
        tile_count = (
            int(math.floor((px1 - 1.0) / 256.0))
            - int(math.floor(px0 / 256.0))
            + 1
        ) * (
            int(math.floor((py1 - 1.0) / 256.0))
            - int(math.floor(py0 / 256.0))
            + 1
        )
        if max(width, height) <= max_side_px and tile_count <= max_tiles:
            best_zoom = zoom
            best_pixels = pixels
    return best_zoom, best_pixels


def mercator_bbox_to_pixels(mercator_bbox: list[float], zoom: int) -> tuple[float, float, float, float]:
    min_x, min_y, max_x, max_y = mercator_bbox
    px0, py1 = web_mercator_to_global_pixel(min_x, min_y, zoom)
    px1, py0 = web_mercator_to_global_pixel(max_x, max_y, zoom)
    return min(px0, px1), min(py0, py1), max(px0, px1), max(py0, py1)


def web_mercator_to_global_pixel(x: float, y: float, zoom: int) -> tuple[float, float]:
    map_size = 256.0 * (2**zoom)
    px = (x + WEB_MERCATOR_ORIGIN_SHIFT_M) / (2.0 * WEB_MERCATOR_ORIGIN_SHIFT_M) * map_size
    py = (WEB_MERCATOR_ORIGIN_SHIFT_M - y) / (2.0 * WEB_MERCATOR_ORIGIN_SHIFT_M) * map_size
    return px, py


def lon_lat_to_web_mercator(lon: float, lat: float) -> tuple[float, float]:
    lat = max(-WEB_MERCATOR_MAX_LAT, min(WEB_MERCATOR_MAX_LAT, float(lat)))
    x = WEB_MERCATOR_RADIUS_M * math.radians(float(lon))
    y = WEB_MERCATOR_RADIUS_M * math.log(math.tan(math.pi / 4.0 + math.radians(lat) / 2.0))
    return x, y


def fetch_esri_tile(zoom: int, tile_x: int, tile_y: int) -> Image.Image:
    url = ESRI_TILE_URL.format(z=zoom, y=tile_y, x=tile_x)
    response = requests.get(
        url,
        timeout=REQUEST_TIMEOUT_SECONDS,
        headers={"User-Agent": "CelerisAgent/0.1 satellite overlay generator"},
    )
    response.raise_for_status()
    content_type = response.headers.get("Content-Type", "")
    if "image" not in content_type.lower():
        text = response.text[:400].replace("\n", " ")
        raise RuntimeError(f"Esri tile returned non-image content ({content_type}): {text}")
    return Image.open(BytesIO(response.content)).convert("RGB")


def fetch_wms_tile(bbox_wgs84: list[float], output_width: int, output_height: int) -> Image.Image:
    request_width = max(256, int(output_width))
    request_height = max(256, int(output_height))
    try:
        return request_wms_tile(bbox_wgs84, request_width, request_height, output_width, output_height)
    except Exception:
        retry_width = max(256, int(request_width * 0.75))
        retry_height = max(256, int(request_height * 0.75))
        return request_wms_tile(bbox_wgs84, retry_width, retry_height, output_width, output_height)


def request_wms_tile(
    bbox_wgs84: list[float],
    request_width: int,
    request_height: int,
    output_width: int,
    output_height: int,
) -> Image.Image:
    params = {
        "SERVICE": "WMS",
        "VERSION": "1.1.1",
        "REQUEST": "GetMap",
        "LAYERS": EOX_LAYER,
        "STYLES": "",
        "FORMAT": "image/jpeg",
        "SRS": "EPSG:4326",
        "BBOX": ",".join(f"{value:.10f}" for value in bbox_wgs84),
        "WIDTH": str(request_width),
        "HEIGHT": str(request_height),
    }
    response = requests.get(
        EOX_WMS_URL,
        params=params,
        timeout=REQUEST_TIMEOUT_SECONDS,
        headers={"User-Agent": "CelerisAgent/0.1 satellite overlay generator"},
    )
    response.raise_for_status()
    content_type = response.headers.get("Content-Type", "")
    if "image" not in content_type.lower():
        text = response.text[:400].replace("\n", " ")
        raise RuntimeError(f"WMS returned non-image content ({content_type}): {text}")
    image = Image.open(BytesIO(response.content)).convert("RGB")
    if image.size != (output_width, output_height):
        image = image.resize((output_width, output_height), Image.Resampling.BICUBIC)
    return image


def find_source_georeferencing(dem: dict[str, Any]) -> dict[str, Any]:
    metadata = dem.get("metadata") or {}
    if isinstance(metadata.get("source_georeferencing"), dict):
        return metadata["source_georeferencing"]
    for value in metadata.values():
        if isinstance(value, dict) and (
            value.get("source_bbox_wgs84") or value.get("extracted_bbox_wgs84") or value.get("requested_bbox_wgs84")
        ):
            return value
    return {}


def interpolate_bbox(source_bbox: list[Any], source_local_bbox: list[float], target_local_bbox: list[float]) -> list[float]:
    sx0, sy0, sx1, sy1 = [float(value) for value in source_bbox]
    lx0, ly0, lx1, ly1 = source_local_bbox
    tx0, ty0, tx1, ty1 = target_local_bbox
    rx0 = ratio(tx0, lx0, lx1)
    rx1 = ratio(tx1, lx0, lx1)
    ry0 = ratio(ty0, ly0, ly1)
    ry1 = ratio(ty1, ly0, ly1)
    return [
        sx0 + (sx1 - sx0) * rx0,
        sy0 + (sy1 - sy0) * ry0,
        sx0 + (sx1 - sx0) * rx1,
        sy0 + (sy1 - sy0) * ry1,
    ]


def ratio(value: float, low: float, high: float) -> float:
    if high == low:
        return 0.0
    return min(1.0, max(0.0, (value - low) / (high - low)))


def transform_bbox_to_wgs84(bbox: list[float], source_crs: str | None) -> list[float]:
    if not source_crs or source_crs.upper() in {"EPSG:4326", "CRS:84", "WGS84"}:
        return [float(value) for value in bbox]
    try:
        from rasterio.warp import transform_bounds

        return list(transform_bounds(source_crs, "EPSG:4326", *bbox, densify_pts=21))
    except Exception:
        return []


def normalize_wgs84_bbox(bbox: list[Any]) -> list[float]:
    min_lon, min_lat, max_lon, max_lat = [float(value) for value in bbox]
    min_lon = normalize_lon(min_lon)
    max_lon = normalize_lon(max_lon)
    return [
        min(min_lon, max_lon),
        max(-90.0, min(min_lat, max_lat)),
        max(min_lon, max_lon),
        min(90.0, max(min_lat, max_lat)),
    ]


def normalize_lon(value: float) -> float:
    return ((float(value) + 180.0) % 360.0) - 180.0


def valid_bbox(value: Any) -> bool:
    if not isinstance(value, list | tuple) or len(value) != 4:
        return False
    try:
        vals = [float(item) for item in value]
    except (TypeError, ValueError):
        return False
    return all(math.isfinite(item) for item in vals) and vals[0] != vals[2] and vals[1] != vals[3]


def overlay_unavailable(selected_path: list[str], code: str, message: str, details: dict[str, Any]) -> dict[str, Any]:
    check = {"level": "warning", "code": code, "message": message, "details": details}
    return {
        "status": "unavailable",
        "selected_path": selected_path,
        "validation": validation_report("warning", [check]),
        "artifacts": [],
        "overlay": None,
    }


def validation_report(status: str, checks: list[dict[str, Any]]) -> dict[str, Any]:
    return {"status": status, "checks": checks}
