from __future__ import annotations

import math
import re
from urllib.parse import urlencode
from pathlib import Path
from typing import Any

import requests

from agent.dem.export import artifact
from agent.dem.workflow import normalize_attachments
from agent.geo import lat_degrees_to_meters, lon_degrees_to_meters
from agent.io_utils import write_json
from agent.sources.aoi import aoi_resolution_steps, resolve_aoi
from agent.sources.common import USER_AGENT, normalize_name


GLOBAL_MOSAIC_IMAGE_SERVER = "https://gis.ngdc.noaa.gov/arcgis/rest/services/DEM_mosaics/DEM_global_mosaic/ImageServer"

GRID_EXTRACT_DATASETS = [
    {
        "id": "noaa_crm_mosaic",
        "name": "CRM Mosaic",
        "label": "Coastal Relief Model (CRM) Mosaic",
        "source": "noaa_coastal_relief_model",
        "resolution_degrees": 0.0008333333333333334,
        "max_dimensions": 10_000,
        "vertical_datum": "EGM2008/MSL",
        "coverage": "US coastal CRM mosaic; empty regions fall through to ETOPO.",
        "url_template": (
            "https://gis.ngdc.noaa.gov/arcgis/rest/services/DEM_mosaics/CRM_mosaic/ImageServer/exportImage"
            "?bbox=${bbox}&bboxSR=4326&size=${width},${height}&imageSR=4326&format=tiff"
            "&pixelType=F32&interpolation=+RSP_NearestNeighbor&compression=LZ77"
            "&renderingRule={\"rasterFunction\":\"none\"}&f=image"
        ),
    },
    {
        "id": "noaa_etopo_2022_bedrock_15s",
        "name": "ETOPO_2022 (Bedrock; 15 arcseconds)",
        "label": "ETOPO 2022 Bedrock 15 arcseconds",
        "source": "noaa_etopo_2022",
        "resolution_degrees": 0.004166666666666667,
        "max_dimensions": 10_000,
        "vertical_datum": "EGM2008",
        "coverage": "Global",
        "url_template": (
            "https://gis.ngdc.noaa.gov/arcgis/rest/services/DEM_mosaics/DEM_all/ImageServer/exportImage"
            "?bbox=${bbox}&bboxSR=4326&size=${width},${height}&imageSR=4326&format=tiff"
            "&pixelType=F32&interpolation=+RSP_NearestNeighbor&compression=LZ77"
            "&renderingRule={\"rasterFunction\":\"none\"}"
            "&mosaicRule={\"where\":\"Name='ETOPO_2022_v1_15s_bed_elev'\"}&f=image"
        ),
    },
]


def retrieve_public_gridded_dem(job_dir: Path, dem_request: dict[str, Any], options: dict[str, Any] | None = None) -> dict[str, Any]:
    """Retrieve a DEM from public NOAA Grid Extract ImageServer datasets."""
    options = dict(options or {})
    source_search = search_public_gridded_sources(job_dir, dem_request)
    selected_path = [
        "parse_dem_request",
        "resolve_aoi_center",
        *aoi_resolution_steps(source_search["aoi"]),
        "build_aoi_bbox",
        "public_noaa_gridded_search",
        "rank_public_noaa_gridded",
    ]
    attempts: list[dict[str, Any]] = []
    for candidate in source_search["candidates"]:
        try:
            exported = export_grid_extract_dataset(job_dir, source_search["aoi"], candidate)
            result = normalize_public_grid(job_dir, exported, candidate, source_search, dem_request, options, selected_path)
            attempts.append(summarize_public_attempt(candidate, result))
            if (result.get("validation") or {}).get("status") != "error":
                source_search["selected_candidate"] = candidate
                source_search["retrieval_attempts"] = attempts
                result["source_search"] = source_search
                write_json(job_dir / "work" / "public_noaa_gridded_candidates.json", source_search)
                return result
        except Exception as exc:
            attempts.append(
                {
                    "candidate_id": candidate["id"],
                    "candidate_name": candidate["name"],
                    "status": "source_attempt_failed",
                    "error": str(exc),
                }
            )

    source_search["retrieval_attempts"] = attempts
    write_json(job_dir / "work" / "public_noaa_gridded_candidates.json", source_search)
    return {
        "status": "source_not_found",
        "selected_path": [*selected_path, "public_noaa_gridded_extract_failed"],
        "artifacts": [],
        "validation": None,
        "source_search": source_search,
        "source_retrieval": {
            "method": "not_downloaded",
            "reason": "public_noaa_gridded_sources_failed",
            "attempts": attempts,
        },
    }


def search_public_gridded_sources(job_dir: Path, dem_request: dict[str, Any]) -> dict[str, Any]:
    aoi = resolve_aoi(dem_request)
    candidates = select_candidates(dem_request)
    if include_global_mosaic_candidates(dem_request):
        candidates = [*query_global_mosaic_candidates(aoi), *candidates]
    candidates = [{**candidate, "grid_size": estimate_grid_size(candidate, aoi)} for candidate in candidates]
    candidates = [candidate for candidate in candidates if not exceeds_dataset_limit(candidate)]
    search = {
        "source": "public_noaa_gridded",
        "source_family": "NOAA Grid Extract ArcGIS ImageServer",
        "aoi": aoi,
        "candidate_count": len(candidates),
        "candidates": candidates,
        "selected_candidate": None,
    }
    write_json(job_dir / "work" / "public_noaa_gridded_candidates.json", search)
    return search


def select_candidates(dem_request: dict[str, Any]) -> list[dict[str, Any]]:
    hint_text = " ".join(
        str(value or "")
        for value in [
            dem_request.get("source_dataset_hint"),
            *(dem_request.get("preferred_sources") or []),
        ]
    )
    normalized_hint = normalize_name(hint_text)
    if "etopo" in normalized_hint:
        return [candidate for candidate in GRID_EXTRACT_DATASETS if "etopo" in candidate["id"]]
    if "crm" in normalized_hint or "coastal relief" in normalized_hint:
        return [candidate for candidate in GRID_EXTRACT_DATASETS if "crm" in candidate["id"]]
    return list(GRID_EXTRACT_DATASETS)


def include_global_mosaic_candidates(dem_request: dict[str, Any]) -> bool:
    hint_text = " ".join(
        str(value or "")
        for value in [
            dem_request.get("source_dataset_hint"),
            *(dem_request.get("preferred_sources") or []),
        ]
    )
    normalized_hint = normalize_name(hint_text)
    if "etopo" in normalized_hint or "crm" in normalized_hint or "coastal relief" in normalized_hint:
        return False
    return True


def query_global_mosaic_candidates(aoi: dict[str, Any]) -> list[dict[str, Any]]:
    bbox = aoi["bbox_wgs84"]
    params = {
        "f": "json",
        "geometry": ",".join(f"{value:.10f}" for value in bbox),
        "geometryType": "esriGeometryEnvelope",
        "inSR": "4326",
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": "OBJECTID,Name,DemName,CellsizeArcseconds,VerticalDatum,ZOrder,LowPS,HighPS",
        "returnGeometry": "false",
        "resultRecordCount": "100",
    }
    try:
        response = requests.get(f"{GLOBAL_MOSAIC_IMAGE_SERVER}/query", headers={"User-Agent": USER_AGENT}, params=params, timeout=60)
        response.raise_for_status()
        data = response.json()
    except Exception:
        return []
    records = [feature.get("attributes") or {} for feature in data.get("features", [])]
    source_records = [record for record in records if is_global_mosaic_source_record(record)]
    if not source_records:
        return []
    source_records.sort(key=global_mosaic_sort_key)
    best = source_records[0]
    resolution_arcsec = float(best["CellsizeArcseconds"])
    name = str(best.get("DemName") or best.get("Name") or "best available NOAA DEM")
    return [
        {
            "id": "noaa_dem_global_mosaic_best",
            "name": f"NOAA DEM Global Mosaic - {name}",
            "label": f"NOAA DEM Global Mosaic best available ({name}; {resolution_arcsec:g} arcseconds)",
            "source": "noaa_dem_global_mosaic",
            "resolution_degrees": resolution_arcsec / 3600.0,
            "max_dimensions": 20_000,
            "vertical_datum": best.get("VerticalDatum") or "source native",
            "coverage": "Best available NOAA DEM Global Mosaic raster over the requested AOI.",
            "service_url": GLOBAL_MOSAIC_IMAGE_SERVER,
            "catalog_item": {
                "objectid": best.get("OBJECTID"),
                "name": best.get("Name"),
                "dem_name": best.get("DemName"),
                "cellsize_arcseconds": best.get("CellsizeArcseconds"),
                "vertical_datum": best.get("VerticalDatum"),
                "z_order": best.get("ZOrder"),
            },
        }
    ]


def is_global_mosaic_source_record(record: dict[str, Any]) -> bool:
    name = str(record.get("Name") or "")
    cellsize = record.get("CellsizeArcseconds")
    if name.startswith("Ov_") or cellsize in (None, ""):
        return False
    try:
        return float(cellsize) > 0.0
    except (TypeError, ValueError):
        return False


def global_mosaic_sort_key(record: dict[str, Any]) -> tuple[float, float]:
    cellsize = float(record.get("CellsizeArcseconds") or 999999.0)
    z_order = float(record.get("ZOrder") or 999999999.0)
    return cellsize, z_order


def estimate_grid_size(candidate: dict[str, Any], aoi: dict[str, Any]) -> dict[str, Any]:
    extent = snap_bbox_to_resolution(aoi["bbox_wgs84"], candidate["resolution_degrees"])
    width = max(2, int(round((extent[2] - extent[0]) / candidate["resolution_degrees"])))
    height = max(2, int(round((extent[3] - extent[1]) / candidate["resolution_degrees"])))
    return {
        "bbox_wgs84": extent,
        "width": width,
        "height": height,
        "cell_count": width * height,
    }


def exceeds_dataset_limit(candidate: dict[str, Any]) -> bool:
    grid_size = candidate["grid_size"]
    limit = int(candidate.get("max_dimensions") or 0)
    return bool(limit and (grid_size["width"] > limit or grid_size["height"] > limit))


def export_grid_extract_dataset(job_dir: Path, aoi: dict[str, Any], candidate: dict[str, Any]) -> dict[str, Any]:
    grid_size = candidate["grid_size"]
    url = build_export_url(candidate, grid_size["bbox_wgs84"], grid_size["width"], grid_size["height"])
    downloads = job_dir / "downloads"
    downloads.mkdir(parents=True, exist_ok=True)
    dst = downloads / safe_filename(f"public_noaa_{candidate['id']}.tif")

    with requests.get(url, headers={"User-Agent": USER_AGENT}, stream=True, timeout=180) as response:
        response.raise_for_status()
        content_type = response.headers.get("Content-Type", "")
        if "json" in content_type.lower() or "html" in content_type.lower() or "text" in content_type.lower():
            raise RuntimeError(f"NOAA Grid Extract returned {content_type or 'text'} instead of GeoTIFF.")
        with dst.open("wb") as out:
            for chunk in response.iter_content(1024 * 1024):
                if chunk:
                    out.write(chunk)

    if dst.stat().st_size == 0:
        raise RuntimeError("NOAA Grid Extract returned an empty GeoTIFF.")

    source_georeferencing = {
        "source": "public_noaa_gridded",
        "source_dataset_id": candidate["id"],
        "source_dataset_name": candidate["name"],
        "source_family": "NOAA Grid Extract ArcGIS ImageServer",
        "source_bbox_wgs84": grid_size["bbox_wgs84"],
        "requested_bbox_wgs84": aoi["bbox_wgs84"],
        "source_center": aoi["center"],
        "source_resolution_type": "service_native",
        "native_resolution_degrees": candidate["resolution_degrees"],
        "native_resolution_m_approx": native_resolution_m(candidate, aoi),
        "native_vertical_datum": candidate["vertical_datum"],
        "local_grid_note": "CELERIS output x/y are local meters; source bbox is preserved in metadata.",
        "source_catalog_item": candidate.get("catalog_item"),
    }
    retrieval = {
        "method": "noaa_grid_extract_arcgis_image_service",
        "source": "public_noaa_gridded",
        "candidate_id": candidate["id"],
        "candidate_name": candidate["name"],
        "export_url": url,
        "downloaded_file": str(dst),
        "width": grid_size["width"],
        "height": grid_size["height"],
        "native_resolution_degrees": candidate["resolution_degrees"],
        "native_resolution_m_approx": source_georeferencing["native_resolution_m_approx"],
        "native_vertical_datum": candidate["vertical_datum"],
        "source_georeferencing": source_georeferencing,
    }
    write_json(job_dir / "work" / f"public_noaa_gridded_{candidate['id']}.json", retrieval)
    return {"path": dst, "retrieval": retrieval, "source_georeferencing": source_georeferencing}


def normalize_public_grid(
    job_dir: Path,
    exported: dict[str, Any],
    candidate: dict[str, Any],
    source_search: dict[str, Any],
    dem_request: dict[str, Any],
    options: dict[str, Any],
    selected_path: list[str],
) -> dict[str, Any]:
    normalized_options = dict(options)
    resolution_m = exported["source_georeferencing"]["native_resolution_m_approx"]
    normalized_options["max_cells"] = 0
    normalized_options["vertical_datum"] = candidate["vertical_datum"]
    normalized_options["z_units"] = "meters"
    normalized_options["output_grid"] = "local_meters"
    normalized_options["output_dx_m"] = resolution_m["dx"]
    normalized_options["output_dy_m"] = resolution_m["dy"]
    normalized_options["output_crs"] = "LOCAL_METERS"
    normalized_options["source_georeferencing"] = exported["source_georeferencing"]

    result = normalize_attachments(job_dir, [exported["path"]], normalized_options)
    raw_artifact = artifact(job_dir, exported["path"], "source_geotiff", f"NOAA public gridded GeoTIFF: {candidate['label']}")
    result["artifacts"] = [raw_artifact, *result.get("artifacts", [])]
    result["selected_path"] = [*selected_path, "public_noaa_gridded_extract", *result["selected_path"]]
    result["source_search"] = source_search
    result["source_retrieval"] = exported["retrieval"]
    return result


def summarize_public_attempt(candidate: dict[str, Any], result: dict[str, Any]) -> dict[str, Any]:
    validation = result.get("validation") or {}
    retrieval = result.get("source_retrieval") or {}
    return {
        "candidate_id": candidate["id"],
        "candidate_name": candidate["name"],
        "status": result.get("status"),
        "validation_status": validation.get("status"),
        "downloaded_file": retrieval.get("downloaded_file"),
    }


def snap_bbox_to_resolution(bbox: list[float], resolution: float) -> list[float]:
    min_lon, min_lat, max_lon, max_lat = [float(value) for value in bbox]
    return [
        snap_to_grid(min_lon, resolution),
        snap_to_grid(min_lat, resolution),
        snap_to_grid(max_lon, resolution),
        snap_to_grid(max_lat, resolution),
    ]


def snap_to_grid(value: float, resolution: float) -> float:
    if value < 0:
        return -math.ceil(abs(value) / resolution) * resolution
    return math.ceil(value / resolution) * resolution


def populate_url_template(template: str, bbox: list[float], width: int, height: int) -> str:
    rendered_bbox = ",".join(f"{value:.5f}" for value in bbox)
    return template.replace("${bbox}", rendered_bbox).replace("${width}", str(width)).replace("${height}", str(height))


def build_export_url(candidate: dict[str, Any], bbox: list[float], width: int, height: int) -> str:
    if candidate.get("url_template"):
        return populate_url_template(candidate["url_template"], bbox, width, height)
    service_url = str(candidate["service_url"]).rstrip("/")
    params = {
        "bbox": ",".join(f"{value:.10f}" for value in bbox),
        "bboxSR": "4326",
        "size": f"{width},{height}",
        "imageSR": "4326",
        "format": "tiff",
        "pixelType": "F32",
        "interpolation": "+RSP_NearestNeighbor",
        "compression": "LZ77",
        "renderingRule": '{"rasterFunction":"none"}',
        "f": "image",
    }
    return f"{service_url}/exportImage?{urlencode(params)}"


def native_resolution_m(candidate: dict[str, Any], aoi: dict[str, Any]) -> dict[str, Any]:
    resolution = float(candidate["resolution_degrees"])
    center_lat = float((aoi["bbox_wgs84"][1] + aoi["bbox_wgs84"][3]) / 2.0)
    return {
        "dx": lon_degrees_to_meters(resolution, center_lat),
        "dy": lat_degrees_to_meters(resolution),
        "note": "Approximate meters computed from geographic degree spacing at AOI center latitude.",
    }


def safe_filename(name: str) -> str:
    stem = re.sub(r"[^A-Za-z0-9._-]+", "_", Path(name).name).strip("._")
    return stem or "public_noaa_grid.tif"
