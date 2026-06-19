from __future__ import annotations

import json
import math
import os
import re
from pathlib import Path
from typing import Any

import requests

from agent.dem.export import artifact
from agent.dem.workflow import normalize_attachments
from agent.io_utils import write_json
from agent.sources.aoi import aoi_resolution_steps, resolve_aoi
from agent.sources.common import USER_AGENT, normalize_name


DATAVIEWER_API = "https://coast.noaa.gov/dataviewer/api/v1"
CONED_DATASET_NAME = "1929 - 2017 USGS CoNED Topobathy DEM"
SLR_DATASET_NAME = "NOAA Sea Level Rise Viewer DEM"
DEFAULT_DATASET_PREFERENCE = [
    CONED_DATASET_NAME,
    SLR_DATASET_NAME,
]
DOWNLOADABLE_SUFFIXES = {".tif", ".tiff", ".zip", ".nc", ".cdf", ".asc", ".grd", ".txt", ".csv", ".xyz", ".mat", ".npy", ".npz"}
DEFAULT_MAX_NATIVE_SOURCE_CELLS = 10_000_000


def retrieve_noaa_dem(
    job_dir: Path,
    dem_request: dict[str, Any],
    options: dict[str, Any] | None = None,
    *,
    dataset_preference: list[str] | None = None,
    strict_dataset: bool = False,
    search_label: str = "noaa_dav_candidates",
) -> dict[str, Any]:
    """Search NOAA DAV and, when possible, export a GeoTIFF through ArcGIS ImageServer."""
    options = dict(options or {})
    source_search = search_noaa_dav(job_dir, dem_request, data_types=["DEM"], search_label=search_label)
    candidate, selection = choose_dem_candidate(source_search["candidates"], dem_request, dataset_preference, strict_dataset)
    source_search["selection"] = selection
    write_json(job_dir / "work" / f"{search_label}.json", source_search)
    selected_path = [
        "parse_dem_request",
        "resolve_aoi_center",
        *aoi_resolution_steps(source_search["aoi"]),
        "build_aoi_bbox",
        "noaa_dav_search_missions",
        "rank_noaa_dav_candidates",
    ]

    if candidate is None:
        return {
            "status": "source_candidates_ready",
            "selected_path": selected_path,
            "artifacts": [],
            "validation": None,
            "source_search": source_search,
            "source_retrieval": None,
        }

    if not candidate.get("image_service_url"):
        return {
            "status": "source_candidates_ready",
            "selected_path": [*selected_path, "no_direct_raster_export"],
            "artifacts": [],
            "validation": None,
            "source_search": source_search,
            "source_retrieval": {
                "method": "not_downloaded",
                "reason": "selected_dem_requires_bulk_tile_download",
                "candidate_id": candidate["id"],
                "candidate_name": candidate["name"],
                "native_resolution_m": candidate.get("native_resolution_m"),
                "native_vertical_datum": candidate.get("native_vertical_datum"),
                "bulk_links": candidate.get("bulk_links", []),
            },
        }

    size_guard = native_grid_size_guard(source_search["aoi"], candidate, dem_request)
    if size_guard:
        return {
            "status": "needs_user_confirmation",
            "selected_path": [*selected_path, "estimate_native_grid_size", "await_large_download_confirmation"],
            "artifacts": [],
            "validation": None,
            "source_search": source_search,
            "source_retrieval": size_guard,
        }

    exported = export_arcgis_image_service(job_dir, source_search["aoi"], candidate, dem_request)
    native_resolution = exported["native_resolution_m"]
    native_vertical_datum = candidate.get("native_vertical_datum") or dem_request.get("vertical_datum")
    options["vertical_datum"] = native_vertical_datum
    options["max_cells"] = 0
    options["output_grid"] = "local_meters"
    options["output_dx_m"] = native_resolution
    options["output_dy_m"] = native_resolution
    options["output_crs"] = "LOCAL_METERS"
    options["source_georeferencing"] = exported["source_georeferencing"]

    result = normalize_attachments(job_dir, [exported["path"]], options)
    raw_artifact = artifact(job_dir, exported["path"], "source_geotiff", "NOAA exported GeoTIFF")
    result["artifacts"] = [raw_artifact, *result.get("artifacts", [])]
    result["selected_path"] = [*selected_path, "noaa_arcgis_export_image", *result["selected_path"]]
    result["source_search"] = source_search
    result["source_retrieval"] = {
        "method": "arcgis_image_service_export",
        "candidate_id": candidate["id"],
        "candidate_name": candidate["name"],
        "image_service_url": candidate["image_service_url"],
        "export_url": exported["export_url"],
        "download_url": exported["download_url"],
        "downloaded_file": str(exported["path"]),
        "selection_reason": selection.get("reason"),
        "native_resolution_m": native_resolution,
        "native_vertical_datum": native_vertical_datum,
        "width": exported["width"],
        "height": exported["height"],
    }
    return result


def retrieve_noaa_slr_dem(job_dir: Path, dem_request: dict[str, Any], options: dict[str, Any] | None = None) -> dict[str, Any]:
    request = dict(dem_request)
    request["source_dataset_hint"] = SLR_DATASET_NAME
    result = retrieve_noaa_dem(
        job_dir,
        request,
        options,
        dataset_preference=[SLR_DATASET_NAME],
        strict_dataset=True,
        search_label="noaa_slr_viewer_dem_candidates",
    )
    result["selected_path"] = ["route_online_dem_source_tiers", "noaa_slr_viewer_dem_search", *result.get("selected_path", [])]
    if result.get("source_retrieval"):
        result["source_retrieval"]["tier"] = 2
        result["source_retrieval"]["source"] = "noaa_slr_viewer_dem"
    return result


def retrieve_user_specified_dav_dataset(job_dir: Path, dem_request: dict[str, Any], options: dict[str, Any] | None = None) -> dict[str, Any]:
    """Tier 1: find and retrieve a user-specified DAV dataset when possible."""
    options = dict(options or {})
    source_search = search_noaa_dav(job_dir, dem_request, data_types=["DEM", "Lidar"], search_label="noaa_dav_user_dataset_candidates")
    candidate, selection = choose_user_specified_candidate(source_search["candidates"], dem_request)
    source_search["selection"] = selection
    write_json(job_dir / "work" / "noaa_dav_user_dataset_candidates.json", source_search)
    selected_path = [
        "parse_dem_request",
        "resolve_aoi_center",
        *aoi_resolution_steps(source_search["aoi"]),
        "build_aoi_bbox",
        "route_online_dem_source_tiers",
        "noaa_dav_search_user_dataset",
        "rank_user_specified_dav_dataset",
    ]
    if candidate is None:
        return {
            "status": "source_not_found",
            "selected_path": selected_path,
            "artifacts": [],
            "validation": None,
            "source_search": source_search,
            "source_retrieval": {
                "method": "not_downloaded",
                "reason": "user_specified_dataset_not_found",
                "requested_dataset": dem_request.get("source_dataset_hint"),
            },
        }

    if candidate.get("data_type") == "DEM" and candidate.get("image_service_url"):
        result = export_and_normalize_dav_dem(job_dir, source_search, candidate, selection, dem_request, options, selected_path)
        result["source_retrieval"]["tier"] = 1
        result["source_retrieval"]["source"] = "noaa_digital_coast"
        return result

    download_link = choose_download_link(candidate)
    if not download_link:
        return {
            "status": "source_candidates_ready",
            "selected_path": [*selected_path, "needs_download_handler"],
            "artifacts": [],
            "validation": None,
            "source_search": source_search,
            "source_retrieval": {
                "method": "not_downloaded",
                "reason": "matched_dataset_has_no_direct_download_link",
                "candidate_id": candidate.get("id"),
                "candidate_name": candidate.get("name"),
                "candidate_data_type": candidate.get("data_type"),
                "links": candidate.get("links", []),
            },
        }

    download = download_dav_link(job_dir, download_link["url"], candidate)
    retrieval_metadata = {
        "method": "full_dataset_download",
        "tier": 1,
        "source": "noaa_digital_coast",
        "candidate_id": candidate.get("id"),
        "candidate_name": candidate.get("name"),
        "candidate_data_type": candidate.get("data_type"),
        "download_label": download_link.get("label"),
        "download_url": download_link.get("url"),
        "downloaded_file": str(download["path"]),
        "download_size_bytes": download.get("size_bytes"),
        "estimated_size_bytes": download.get("estimated_size_bytes"),
        "download_notice": download.get("notice"),
        "native_resolution_m": candidate.get("native_resolution_m"),
        "native_vertical_datum": candidate.get("native_vertical_datum"),
    }
    write_json(job_dir / "work" / "noaa_dav_full_dataset_download.json", {"candidate": candidate, "retrieval": retrieval_metadata})
    raw_artifact = artifact(job_dir, download["path"], "source_download", "Downloaded DAV source dataset")
    if candidate.get("data_type") == "DEM" and is_supported_download_for_normalization(download["path"]):
        native_resolution = candidate.get("native_resolution_m") or _number(dem_request.get("target_resolution_m"))
        if native_resolution:
            options["output_grid"] = "local_meters"
            options["output_dx_m"] = native_resolution
            options["output_dy_m"] = native_resolution
            options["output_crs"] = "LOCAL_METERS"
        if candidate.get("native_vertical_datum"):
            options["vertical_datum"] = candidate["native_vertical_datum"]
        options["max_cells"] = 0
        options["source_georeferencing"] = {
            "source": "noaa_digital_coast",
            "source_bbox_wgs84": source_search["aoi"]["bbox_wgs84"],
            "source_resolution_type": "archive_native",
            "native_resolution_m": native_resolution,
            "native_vertical_datum": candidate.get("native_vertical_datum"),
            "full_dataset_download": retrieval_metadata,
        }
        result = normalize_attachments(job_dir, [download["path"]], options)
        result["artifacts"] = [raw_artifact, *result.get("artifacts", [])]
        result["selected_path"] = [*selected_path, "noaa_dav_full_dataset_download", *result["selected_path"]]
        result["source_search"] = source_search
        result["source_retrieval"] = retrieval_metadata
        return result

    return {
        "status": "source_data_staged",
        "selected_path": [*selected_path, "noaa_dav_full_dataset_download", "await_rasterization_or_loader"],
        "artifacts": [raw_artifact],
        "validation": None,
        "source_search": source_search,
        "source_retrieval": {
            **retrieval_metadata,
            "reason": "downloaded_source_is_not_a_supported_raster_dem" if candidate.get("data_type") == "DEM" else "downloaded_source_requires_lidar_gridding",
        },
    }


def search_noaa_dav(
    job_dir: Path,
    dem_request: dict[str, Any],
    *,
    data_types: list[str] | None = None,
    search_label: str = "noaa_dav_candidates",
) -> dict[str, Any]:
    aoi = resolve_aoi(dem_request)
    data_types = data_types or ["DEM"]
    payload = {
        "aoi": bbox_to_dav_wkt(aoi["bbox_wgs84"]),
        "published": "true",
        "dataTypes": data_types,
        "dialect": "arcgis",
    }
    response = requests.post(
        f"{DATAVIEWER_API}/search/missions",
        headers={"User-Agent": USER_AGENT},
        json=payload,
        timeout=60,
    )
    response.raise_for_status()
    data = response.json()
    candidates = [candidate_from_feature(item, dem_request) for item in data.get("features", [])]
    candidates = [item for item in candidates if item.get("data_type") in set(data_types)]
    candidates.sort(key=lambda item: candidate_sort_key(item, dem_request), reverse=True)
    search = {
        "source": "noaa_digital_coast_data_access_viewer",
        "api_base": DATAVIEWER_API,
        "endpoint": "/search/missions",
        "request_payload": payload,
        "aoi": aoi,
        "candidate_count": len(candidates),
        "candidates": candidates,
    }
    write_json(job_dir / "work" / f"{search_label}.json", search)
    return search


def bbox_to_dav_wkt(bbox: list[float]) -> str:
    min_lon, min_lat, max_lon, max_lat = bbox
    coords = [
        (min_lon, min_lat),
        (min_lon, max_lat),
        (max_lon, max_lat),
        (max_lon, min_lat),
        (min_lon, min_lat),
    ]
    rendered = ",".join(f"{lon:.10f} {lat:.10f}" for lon, lat in coords)
    return f"SRID=4269;POLYGON(({rendered}))"


def candidate_from_feature(feature: dict[str, Any], dem_request: dict[str, Any]) -> dict[str, Any]:
    attrs = feature.get("attributes", {})
    links = parse_external_links(attrs.get("ExternalProviderLink"))
    image_service_url = image_service_url_from_attrs(attrs)
    candidate = {
        "id": attrs.get("ID") or attrs.get("OBJECTID_1"),
        "parent_mission_id": attrs.get("parentMissionId"),
        "name": attrs.get("Name"),
        "data_type": attrs.get("DataType"),
        "data_type_id": attrs.get("DataTypeID"),
        "year": attrs.get("Year"),
        "resolution_m": _number(attrs.get("Resolution")),
        "cell_size_m": _number(attrs.get("CellSizeM")),
        "native_resolution_m": _number(attrs.get("CellSizeM")) or _number(attrs.get("Resolution")),
        "native_vertical_datum": attrs.get("NativeVdatum"),
        "tide_controlled": attrs.get("TideControlled"),
        "vertical_accuracy": attrs.get("Vertical_Accuracy"),
        "provider": attrs.get("provider_results_name") or attrs.get("provider_results"),
        "centroid": attrs.get("centroid"),
        "image_service_url": image_service_url,
        "links": links,
        "bulk_links": [link for link in links if str(link.get("label", "")).lower().startswith("bulk download")],
        "custom_download_links": [link for link in links if "custom download" in str(link.get("label", "")).lower()],
        "metadata_links": [link for link in links if "metadata" in str(link.get("label", "")).lower()],
    }
    candidate["score"] = score_candidate(candidate, dem_request)
    candidate["selection_notes"] = selection_notes(candidate, dem_request)
    return candidate


def parse_external_links(raw: str | None) -> list[dict[str, Any]]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []
    links = []
    for item in data.get("links", []):
        links.append(
            {
                "mission_id": item.get("missionId"),
                "url": item.get("link"),
                "label": item.get("label") or item.get("altlabel"),
                "service_id": item.get("serviceID"),
            }
        )
    return links


def image_service_url_from_attrs(attrs: dict[str, Any]) -> str | None:
    server = attrs.get("ImageService_Server")
    service = attrs.get("ImageService_Service")
    if not server or not service:
        return None
    return f"{str(server).rstrip('/')}/{str(service).lstrip('/')}"


def score_candidate(candidate: dict[str, Any], dem_request: dict[str, Any]) -> float:
    score = 0.0
    if candidate.get("data_type") == "DEM":
        score += 40.0
    if candidate.get("image_service_url"):
        score += 25.0
    if candidate.get("bulk_links"):
        score += 8.0
    requested_datum = str(dem_request.get("vertical_datum") or "").upper()
    native_datum = str(candidate.get("native_vertical_datum") or "").upper()
    if requested_datum and native_datum == requested_datum:
        score += 20.0
    native = candidate.get("native_resolution_m")
    if native:
        score += max(0.0, 12.0 - min(float(native), 12.0))
    year = _number(candidate.get("year"))
    if year:
        score += min(max((year - 2000.0) / 10.0, 0.0), 4.0)
    return round(score, 3)


def candidate_sort_key(candidate: dict[str, Any], dem_request: dict[str, Any]) -> tuple[float, float]:
    selected, selection = is_preferred_candidate(candidate, dem_request)
    preference = 1000.0 - selection["order"] if selected else 0.0
    return preference, float(candidate.get("score") or 0.0)


def selection_notes(candidate: dict[str, Any], dem_request: dict[str, Any]) -> list[str]:
    notes = []
    if candidate.get("image_service_url"):
        notes.append("direct ArcGIS ImageServer export is available")
    if candidate.get("bulk_links"):
        notes.append("bulk download link is available")
    cell = candidate.get("native_resolution_m")
    if cell:
        notes.append(f"native cell size {cell:g} m")
    datum = candidate.get("native_vertical_datum")
    if datum:
        notes.append(f"native vertical datum {datum}")
    return notes


def choose_dem_candidate(
    candidates: list[dict[str, Any]],
    dem_request: dict[str, Any],
    dataset_preference: list[str] | None = None,
    strict_dataset: bool = False,
) -> tuple[dict[str, Any] | None, dict[str, Any]]:
    dem_candidates = [item for item in candidates if item.get("data_type") == "DEM"]
    for candidate in dem_candidates:
        selected, selection = is_preferred_candidate(candidate, dem_request, dataset_preference)
        if selected:
            return candidate, selection
    if strict_dataset:
        return None, {
            "reason": "strict_dataset_not_found",
            "order": 998,
            "matched_hint": None,
            "requested_dataset": dem_request.get("source_dataset_hint") or (dataset_preference or [None])[0],
        }
    if not dem_candidates:
        return None, {"reason": "no_dem_candidates", "order": 999, "matched_hint": None}
    candidate = sorted(dem_candidates, key=lambda item: item["score"], reverse=True)[0]
    return candidate, {"reason": "best_available_dem_after_preferred_names_missing", "order": 999, "matched_hint": None}


def choose_user_specified_candidate(candidates: list[dict[str, Any]], dem_request: dict[str, Any]) -> tuple[dict[str, Any] | None, dict[str, Any]]:
    hint = dem_request.get("source_dataset_hint")
    if not hint:
        return None, {"reason": "no_user_dataset_hint", "matched_hint": None}
    matches = []
    for candidate in candidates:
        if user_dataset_matches(candidate, str(hint)):
            score = float(candidate.get("score") or 0.0)
            if candidate.get("data_type") == "DEM":
                score += 10.0
            if candidate.get("image_service_url"):
                score += 8.0
            if choose_download_link(candidate):
                score += 4.0
            matches.append((score, candidate))
    if not matches:
        return None, {"reason": "user_specified_dataset_not_found", "matched_hint": hint}
    matches.sort(key=lambda item: item[0], reverse=True)
    return matches[0][1], {"reason": "user_specified_dataset", "matched_hint": hint, "score": round(matches[0][0], 3)}


def user_dataset_matches(candidate: dict[str, Any], hint: str) -> bool:
    values = [
        candidate.get("name"),
        candidate.get("provider"),
        candidate.get("id"),
        *(link.get("label") for link in candidate.get("links", [])),
        *(link.get("url") for link in candidate.get("links", [])),
    ]
    return any(name_matches(str(value), hint) for value in values if value)


def is_preferred_candidate(candidate: dict[str, Any], dem_request: dict[str, Any], dataset_preference: list[str] | None = None) -> tuple[bool, dict[str, Any]]:
    hint = dem_request.get("source_dataset_hint")
    if hint and name_matches(candidate.get("name"), str(hint)):
        return True, {"reason": "user_specified_dataset", "order": 0, "matched_hint": hint}
    for index, preferred in enumerate(dataset_preference or DEFAULT_DATASET_PREFERENCE, start=1):
        if name_matches(candidate.get("name"), preferred):
            return True, {"reason": "default_dataset_preference", "order": index, "matched_hint": preferred}
    return False, {"reason": "not_preferred", "order": 999, "matched_hint": None}


def name_matches(name: str | None, hint: str) -> bool:
    if not name or not hint:
        return False
    haystack = normalize_name(name)
    needle = normalize_name(hint)
    if needle in haystack or haystack in needle:
        return True
    tokens = [token for token in needle.split() if len(token) > 2]
    return bool(tokens) and all(token in haystack for token in tokens)


def export_arcgis_image_service(
    job_dir: Path,
    aoi: dict[str, Any],
    candidate: dict[str, Any],
    dem_request: dict[str, Any],
) -> dict[str, Any]:
    native_resolution = candidate.get("native_resolution_m") or _number(dem_request.get("target_resolution_m"))
    if not native_resolution:
        raise ValueError(f"No native resolution was available for {candidate.get('name')}.")
    width = max(2, int(round(float(aoi["domain_width_m"]) / native_resolution)))
    height = max(2, int(round(float(aoi["domain_height_m"]) / native_resolution)))
    export_endpoint = f"{candidate['image_service_url'].rstrip('/')}/exportImage"
    params = {
        "f": "json",
        "bbox": ",".join(f"{value:.10f}" for value in aoi["bbox_wgs84"]),
        "bboxSR": "4326",
        "imageSR": "4326",
        "size": f"{width},{height}",
        "format": "tiff",
        "pixelType": "F32",
    }
    response = requests.get(export_endpoint, headers={"User-Agent": USER_AGENT}, params=params, timeout=60)
    response.raise_for_status()
    export_data = response.json()
    if "error" in export_data:
        raise RuntimeError(f"ArcGIS export failed: {export_data['error']}")

    downloads = job_dir / "downloads"
    downloads.mkdir(parents=True, exist_ok=True)
    filename = safe_source_filename(candidate["name"], candidate["id"])
    dst = downloads / filename
    image_params = dict(params)
    image_params["f"] = "image"
    with requests.get(export_endpoint, headers={"User-Agent": USER_AGENT}, params=image_params, stream=True, timeout=120) as raster_response:
        raster_response.raise_for_status()
        content_type = raster_response.headers.get("Content-Type", "")
        if "tiff" not in content_type.lower():
            raise RuntimeError(f"ArcGIS direct export returned {content_type or 'an unknown content type'} instead of image/tiff.")
        with dst.open("wb") as out:
            for chunk in raster_response.iter_content(1024 * 1024):
                if chunk:
                    out.write(chunk)

    source_georeferencing = {
        "source_crs": "EPSG:4326",
        "source_bbox_wgs84": aoi["bbox_wgs84"],
        "source_center": aoi["center"],
        "native_resolution_m": native_resolution,
        "native_vertical_datum": candidate.get("native_vertical_datum"),
        "requested_resolution_m": dem_request.get("target_resolution_m"),
        "local_grid_note": "CELERIS output x/y are local meters; source bbox is preserved in metadata.",
    }
    write_json(
        job_dir / "work" / "noaa_arcgis_export.json",
        {
            "candidate": candidate,
            "request_params": params,
            "export_response": export_data,
            "download_url": raster_response.url,
            "downloaded_file": str(dst),
            "source_georeferencing": source_georeferencing,
        },
    )
    return {
        "path": dst,
        "export_url": response.url,
        "download_url": raster_response.url,
        "width": width,
        "height": height,
        "native_resolution_m": native_resolution,
        "source_georeferencing": source_georeferencing,
    }


def export_and_normalize_dav_dem(
    job_dir: Path,
    source_search: dict[str, Any],
    candidate: dict[str, Any],
    selection: dict[str, Any],
    dem_request: dict[str, Any],
    options: dict[str, Any],
    selected_path: list[str],
) -> dict[str, Any]:
    size_guard = native_grid_size_guard(source_search["aoi"], candidate, dem_request)
    if size_guard:
        size_guard["tier"] = 1
        size_guard["source"] = "noaa_digital_coast"
        return {
            "status": "needs_user_confirmation",
            "selected_path": [*selected_path, "estimate_native_grid_size", "await_large_download_confirmation"],
            "artifacts": [],
            "validation": None,
            "source_search": source_search,
            "source_retrieval": size_guard,
        }
    exported = export_arcgis_image_service(job_dir, source_search["aoi"], candidate, dem_request)
    native_resolution = exported["native_resolution_m"]
    native_vertical_datum = candidate.get("native_vertical_datum") or dem_request.get("vertical_datum")
    options["vertical_datum"] = native_vertical_datum
    options["max_cells"] = 0
    options["output_grid"] = "local_meters"
    options["output_dx_m"] = native_resolution
    options["output_dy_m"] = native_resolution
    options["output_crs"] = "LOCAL_METERS"
    options["source_georeferencing"] = exported["source_georeferencing"]

    result = normalize_attachments(job_dir, [exported["path"]], options)
    raw_artifact = artifact(job_dir, exported["path"], "source_geotiff", "NOAA exported GeoTIFF")
    result["artifacts"] = [raw_artifact, *result.get("artifacts", [])]
    result["selected_path"] = [*selected_path, "noaa_arcgis_export_image", *result["selected_path"]]
    result["source_search"] = source_search
    result["source_retrieval"] = {
        "method": "arcgis_image_service_export",
        "candidate_id": candidate["id"],
        "candidate_name": candidate["name"],
        "image_service_url": candidate["image_service_url"],
        "export_url": exported["export_url"],
        "download_url": exported["download_url"],
        "downloaded_file": str(exported["path"]),
        "selection_reason": selection.get("reason"),
        "native_resolution_m": native_resolution,
        "native_vertical_datum": native_vertical_datum,
        "width": exported["width"],
        "height": exported["height"],
    }
    return result


def choose_download_link(candidate: dict[str, Any]) -> dict[str, Any] | None:
    links = candidate.get("links", [])
    scored = []
    for link in links:
        url = str(link.get("url") or "")
        label = str(link.get("label") or "")
        lower_url = url.lower()
        lower_label = label.lower()
        if not url.startswith(("http://", "https://")):
            continue
        score = 0
        if "bulk download" in lower_label:
            score += 50
        if any(lower_url.split("?", 1)[0].endswith(suffix) for suffix in DOWNLOADABLE_SUFFIXES):
            score += 40
        if "download" in lower_label or "download" in lower_url:
            score += 20
        if any(term in lower_label for term in ("metadata", "report", "viewer")):
            score -= 30
        if score > 0:
            scored.append((score, link))
    if not scored:
        return None
    scored.sort(key=lambda item: item[0], reverse=True)
    return scored[0][1]


def download_dav_link(job_dir: Path, url: str, candidate: dict[str, Any]) -> dict[str, Any]:
    estimated_size = estimate_download_size(url)
    notice = size_notice(estimated_size)
    filename = filename_from_url(url) or f"dav_dataset_{candidate.get('id') or 'download'}"
    dst = job_dir / "downloads" / safe_download_filename(filename)
    dst.parent.mkdir(parents=True, exist_ok=True)
    with requests.get(url, headers={"User-Agent": USER_AGENT}, stream=True, timeout=120) as response:
        response.raise_for_status()
        content_type = response.headers.get("Content-Type", "")
        if "text/html" in content_type.lower() and not Path(dst.name).suffix:
            raise RuntimeError(f"DAV download link returned HTML instead of a file: {url}")
        with dst.open("wb") as out:
            for chunk in response.iter_content(1024 * 1024):
                if chunk:
                    out.write(chunk)
    return {
        "path": dst,
        "size_bytes": dst.stat().st_size,
        "estimated_size_bytes": estimated_size,
        "notice": notice,
    }


def estimate_download_size(url: str) -> int | None:
    try:
        response = requests.head(url, headers={"User-Agent": USER_AGENT}, allow_redirects=True, timeout=20)
        if response.ok and response.headers.get("Content-Length"):
            return int(response.headers["Content-Length"])
    except Exception:
        return None
    return None


def size_notice(size_bytes: int | None) -> str | None:
    if not size_bytes:
        return None
    if size_bytes >= 1024**3:
        return f"Estimated download size is {size_bytes / 1024**3:.2f} GB; this may take some time."
    if size_bytes >= 100 * 1024**2:
        return f"Estimated download size is {size_bytes / 1024**2:.1f} MB; this may take some time."
    return f"Estimated download size is {size_bytes / 1024**2:.1f} MB."


def filename_from_url(url: str) -> str | None:
    from urllib.parse import unquote, urlparse

    name = Path(unquote(urlparse(url).path)).name
    return name or None


def safe_download_filename(name: str) -> str:
    stem = re.sub(r"[^A-Za-z0-9._-]+", "_", Path(name).name).strip("._")
    return stem or "dav_download.bin"


def is_supported_download_for_normalization(path: Path) -> bool:
    suffix = path.suffix.lower()
    return suffix in DOWNLOADABLE_SUFFIXES


def native_grid_size_guard(aoi: dict[str, Any], candidate: dict[str, Any], dem_request: dict[str, Any]) -> dict[str, Any] | None:
    native_resolution = candidate.get("native_resolution_m") or _number(dem_request.get("target_resolution_m"))
    if not native_resolution:
        return None
    width = max(2, int(math.ceil(float(aoi["domain_width_m"]) / float(native_resolution))))
    height = max(2, int(math.ceil(float(aoi["domain_height_m"]) / float(native_resolution))))
    cell_count = width * height
    max_cells = max_native_source_cells()
    if cell_count <= max_cells or dem_request.get("approve_large_native_extraction"):
        return None
    return {
        "method": "not_downloaded",
        "reason": "estimated_native_grid_too_large_requires_confirmation",
        "candidate_id": candidate.get("id"),
        "candidate_name": candidate.get("name"),
        "image_service_url": candidate.get("image_service_url"),
        "native_resolution_m": native_resolution,
        "native_vertical_datum": candidate.get("native_vertical_datum"),
        "estimated_width": width,
        "estimated_height": height,
        "estimated_cell_count": cell_count,
        "max_native_source_cells": max_cells,
    }


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


def safe_source_filename(name: str | None, candidate_id: Any) -> str:
    stem = re.sub(r"[^A-Za-z0-9._-]+", "_", str(name or "noaa_dem")).strip("_")
    return f"noaa_dav_{candidate_id}_{stem[:80]}.tif"


def _number(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None
