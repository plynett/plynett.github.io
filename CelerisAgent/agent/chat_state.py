from __future__ import annotations

import re
from typing import Any

from agent.registry import load_registry


SOURCE_ALIASES = {
    "usgs coned wcs": "usgs_coned_wcs",
    "coned wcs": "usgs_coned_wcs",
    "coned": "usgs_coned_wcs",
    "1929 2017 usgs coned topobathy dem": "usgs_coned_wcs",
    "noaa sea level rise viewer dem": "noaa_slr_viewer_dem",
    "sea level rise viewer dem": "noaa_slr_viewer_dem",
    "slr": "noaa_slr_viewer_dem",
    "noaa slr": "noaa_slr_viewer_dem",
    "noaa digital coast": "noaa_digital_coast",
    "dav": "noaa_digital_coast",
    "data access viewer": "noaa_digital_coast",
    "noaa grid extract": "public_noaa_gridded",
    "public noaa gridded": "public_noaa_gridded",
    "noaa dem global mosaic": "noaa_dem_global_mosaic",
    "dem global mosaic": "noaa_dem_global_mosaic",
    "cudem": "noaa_dem_global_mosaic",
    "cudem 1 9 arc second": "noaa_dem_global_mosaic",
    "cudem 1 3 arc second": "noaa_dem_global_mosaic",
    "etopo": "etopo",
    "crm": "crm",
    "coastal relief model": "crm",
    "gebco": "gebco",
}


def empty_dem_request() -> dict[str, Any]:
    return {
        "location": None,
        "center_description": None,
        "center_lon": None,
        "center_lat": None,
        "aoi_bbox_wgs84": None,
        "source_dataset_hint": None,
        "domain_width_m": None,
        "domain_height_m": None,
        "domain_width_deg": None,
        "domain_height_deg": None,
        "target_resolution_m": None,
        "vertical_datum": None,
        "horizontal_crs": None,
        "preferred_sources": [],
        "notes": [],
        "spatial_resolution_locked": False,
        "approve_large_native_extraction": False,
    }


def dem_request_patch_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "location": {"type": ["string", "null"]},
            "center_description": {"type": ["string", "null"]},
            "center_lon": {"type": ["number", "null"]},
            "center_lat": {"type": ["number", "null"]},
            "aoi_bbox_wgs84": {
                "type": ["array", "null"],
                "items": {"type": "number"},
                "minItems": 4,
                "maxItems": 4,
            },
            "source_dataset_hint": {"type": ["string", "null"]},
            "domain_width_m": {"type": ["number", "null"]},
            "domain_height_m": {"type": ["number", "null"]},
            "domain_width_deg": {"type": ["number", "null"]},
            "domain_height_deg": {"type": ["number", "null"]},
            "target_resolution_m": {"type": ["number", "null"]},
            "vertical_datum": {"type": ["string", "null"]},
            "horizontal_crs": {"type": ["string", "null"]},
            "preferred_sources": {"type": "array", "items": {"type": "string"}},
            "notes": {"type": "array", "items": {"type": "string"}},
            "approve_large_native_extraction": {"type": "boolean"},
        },
        "required": [
            "location",
            "center_description",
            "center_lon",
            "center_lat",
            "aoi_bbox_wgs84",
            "source_dataset_hint",
            "domain_width_m",
            "domain_height_m",
            "domain_width_deg",
            "domain_height_deg",
            "target_resolution_m",
            "vertical_datum",
            "horizontal_crs",
            "preferred_sources",
            "notes",
            "approve_large_native_extraction",
        ],
        "additionalProperties": False,
    }


def workflow_hooks_schema() -> dict[str, Any]:
    return {
        "type": "array",
        "items": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "enum": [
                        "translate_aoi_m",
                        "extend_domain_m",
                        "set_domain_extents_m",
                        "set_aoi_bbox_wgs84",
                        "set_preferred_sources",
                        "clear_source_dataset_hint",
                        "rerun_source_retrieval",
                        "approve_large_native_extraction",
                    ],
                },
                "dx_m": {"type": ["number", "null"]},
                "dy_m": {"type": ["number", "null"]},
                "north_m": {"type": ["number", "null"]},
                "south_m": {"type": ["number", "null"]},
                "east_m": {"type": ["number", "null"]},
                "west_m": {"type": ["number", "null"]},
                "bbox_wgs84": {
                    "type": ["array", "null"],
                    "items": {"type": "number"},
                    "minItems": 4,
                    "maxItems": 4,
                },
                "sources": {"type": "array", "items": {"type": "string"}},
                "reason": {"type": "string"},
            },
            "required": ["name", "dx_m", "dy_m", "north_m", "south_m", "east_m", "west_m", "bbox_wgs84", "sources", "reason"],
            "additionalProperties": False,
        },
    }


def merge_dem_request(existing: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    merged = empty_dem_request()
    merged.update(existing or {})
    merged["preferred_sources"] = dedupe([normalize_source_id(value) for value in (merged.get("preferred_sources") or [])])
    invalidate_stale_spatial_state(merged, patch)
    for key in ("location", "center_description", "source_dataset_hint", "vertical_datum", "horizontal_crs"):
        value = patch.get(key)
        if value not in (None, ""):
            if key == "source_dataset_hint" and normalize_source_id(value) == "usgs_coned_wcs":
                merged["source_dataset_hint"] = None
                current = merged.get("preferred_sources") or []
                if "usgs_coned_wcs" not in current:
                    current.append("usgs_coned_wcs")
                merged["preferred_sources"] = current
            else:
                merged[key] = value
    for key in ("center_lon", "center_lat", "domain_width_m", "domain_height_m", "domain_width_deg", "domain_height_deg", "target_resolution_m"):
        value = patch.get(key)
        if value not in (None, ""):
            merged[key] = float(value)
    if patch.get("approve_large_native_extraction") is True:
        merged["approve_large_native_extraction"] = True
    bbox = patch.get("aoi_bbox_wgs84")
    if isinstance(bbox, list) and len(bbox) == 4:
        merged["aoi_bbox_wgs84"] = [float(value) for value in bbox]
    for key in ("preferred_sources", "notes"):
        values = patch.get(key) or []
        if isinstance(values, list):
            current = merged.get(key) or []
            for value in values:
                if key == "preferred_sources":
                    value = normalize_source_id(value)
                if value and value not in current:
                    current.append(value)
            merged[key] = current
    return merged


def invalidate_stale_spatial_state(merged: dict[str, Any], patch: dict[str, Any]) -> None:
    location_changed = patch_changes_text_field(merged, patch, "location")
    center_changed = patch_changes_text_field(merged, patch, "center_description")
    domain_changed = any(patch_changes_number_field(merged, patch, key) for key in ("domain_width_m", "domain_height_m", "domain_width_deg", "domain_height_deg"))
    has_explicit_bbox = isinstance(patch.get("aoi_bbox_wgs84"), list) and len(patch["aoi_bbox_wgs84"]) == 4
    has_explicit_center = patch.get("center_lon") not in (None, "") and patch.get("center_lat") not in (None, "")

    if has_explicit_bbox:
        return
    if location_changed or center_changed:
        merged["aoi_bbox_wgs84"] = None
        merged["spatial_resolution_locked"] = False
        merged["approve_large_native_extraction"] = False
        if not has_explicit_center:
            merged["center_lon"] = None
            merged["center_lat"] = None
        merged["notes"] = []
    elif domain_changed:
        merged["aoi_bbox_wgs84"] = None
        merged["approve_large_native_extraction"] = False


def patch_changes_text_field(merged: dict[str, Any], patch: dict[str, Any], key: str) -> bool:
    value = patch.get(key)
    if value in (None, ""):
        return False
    current = merged.get(key)
    return bool(current) and normalize_text(value) != normalize_text(current)


def patch_changes_number_field(merged: dict[str, Any], patch: dict[str, Any], key: str) -> bool:
    value = patch.get(key)
    current = merged.get(key)
    if value in (None, "") or current in (None, ""):
        return False
    try:
        return abs(float(value) - float(current)) > 1e-9
    except (TypeError, ValueError):
        return False


def normalize_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip().lower())


def infer_dem_request_patch(message: str) -> dict[str, Any]:
    lower = message.lower()
    patch = empty_dem_request()
    if "santa cruz" in lower and "wharf" in lower:
        patch["location"] = patch["location"] or "Santa Cruz Harbor"
        patch["center_description"] = "Santa Cruz Wharf"
    elif "santa cruz" in lower and "harbor" in lower:
        patch["location"] = "Santa Cruz Harbor"
    elif "santa cruz" in lower:
        patch["location"] = "Santa Cruz"

    dataset_hint = infer_source_dataset_hint(message)
    if dataset_hint:
        patch["source_dataset_hint"] = dataset_hint

    center_match = re.search(r"center(?:ed)?\s+(?:near|at|on)?\s+(.+?)(?:\s+with|\s+and|\s+domain|\s*$)", message, flags=re.IGNORECASE)
    if center_match:
        patch["center_description"] = center_match.group(1).strip(" .")

    res_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:m|meter|meters)\s+resolution", lower)
    if not res_match:
        res_match = re.search(r"resolution\s+(?:of\s+)?(\d+(?:\.\d+)?)\s*(?:m|meter|meters)", lower)
    if res_match:
        patch["target_resolution_m"] = float(res_match.group(1))

    domain_match = re.search(
        r"(\d+(?:\.\d+)?)\s*(km|kilometer|kilometers|m|meter|meters)\s*(?:by|x)\s*(\d+(?:\.\d+)?)\s*(km|kilometer|kilometers|m|meter|meters)",
        lower,
    )
    if domain_match:
        patch["domain_width_m"] = convert_to_meters(float(domain_match.group(1)), domain_match.group(2))
        patch["domain_height_m"] = convert_to_meters(float(domain_match.group(3)), domain_match.group(4))

    degree_pair_match = re.search(
        r"(\d+(?:\.\d+)?)\s*(?:deg|degree|degrees)\s*(?:by|x)\s*(\d+(?:\.\d+)?)\s*(?:deg|degree|degrees)",
        lower,
    )
    if degree_pair_match:
        patch["domain_width_deg"] = float(degree_pair_match.group(1))
        patch["domain_height_deg"] = float(degree_pair_match.group(2))
    else:
        degree_side_match = re.search(
            r"(\d+(?:\.\d+)?)\s*(?:deg|degree|degrees)\s+(?:on|per|each)\s+(?:a\s+)?side",
            lower,
        )
        if degree_side_match:
            side_deg = float(degree_side_match.group(1))
            patch["domain_width_deg"] = side_deg
            patch["domain_height_deg"] = side_deg

    for datum in ("navd88", "mllw", "msl", "mhw", "egm96", "egm2008"):
        if datum in lower:
            patch["vertical_datum"] = datum.upper()
            break

    epsg = re.search(r"epsg[: ]?(\d+)", lower)
    if epsg:
        patch["horizontal_crs"] = f"EPSG:{epsg.group(1)}"

    preferred = []
    if "noaa" in lower:
        preferred.append("noaa_digital_coast")
    if "usgs" in lower:
        preferred.append("usgs_coned_wcs")
    if "etopo" in lower:
        preferred.append("etopo")
    if "crm" in lower or "coastal relief model" in lower:
        preferred.append("crm")
    if "cudem" in lower or "dem global mosaic" in lower:
        preferred.append("noaa_dem_global_mosaic")
    if "grid extract" in lower:
        preferred.append("public_noaa_gridded")
    patch["preferred_sources"] = preferred
    return patch


def infer_source_dataset_hint(message: str) -> str | None:
    lower = message.lower()
    if "coned" in lower:
        return "1929 - 2017 USGS CoNED Topobathy DEM"
    if "sea level rise" in lower or "slr" in lower:
        return "NOAA Sea Level Rise Viewer DEM"
    for pattern in (
        r"(?:data\s*source|datasource|dataset|source)\s*(?:named|called|=|:)?\s*[\"']([^\"']+)[\"']",
        r"(?:use|download|from)\s+[\"']([^\"']+dem[^\"']*)[\"']",
    ):
        match = re.search(pattern, message, flags=re.IGNORECASE)
        if match:
            return match.group(1).strip()
    return None


def infer_options(message: str) -> dict[str, Any]:
    lower = message.lower()
    options: dict[str, Any] = {"sign_mode": "auto", "max_cells": 1_500_000}
    if "invert" in lower or "depth positive" in lower:
        options["sign_mode"] = "invert"
    if "fill nodata" in lower or "fill void" in lower:
        options["fill_nodata"] = True
    epsg = re.search(r"epsg[: ]?(\d+)", lower)
    if epsg:
        options["crs_override"] = f"EPSG:{epsg.group(1)}"
    for datum in ("navd88", "mllw", "msl", "egm96", "egm2008"):
        if datum in lower:
            options["vertical_datum"] = datum.upper()
            break
    return options


def build_source_plan(dem_request: dict[str, Any], action: dict[str, Any]) -> dict[str, Any]:
    missing = missing_dem_fields(dem_request)
    return {
        "mode": action.get("planner", {}).get("mode", "local"),
        "plan": {
            "intent": "create_dem_from_sources",
            "location": dem_request.get("location"),
            "center_description": dem_request.get("center_description"),
            "center_lon": dem_request.get("center_lon"),
            "center_lat": dem_request.get("center_lat"),
            "aoi_bbox_wgs84": dem_request.get("aoi_bbox_wgs84"),
            "source_dataset_hint": dem_request.get("source_dataset_hint"),
            "domain_width_m": dem_request.get("domain_width_m"),
            "domain_height_m": dem_request.get("domain_height_m"),
            "domain_width_deg": dem_request.get("domain_width_deg"),
            "domain_height_deg": dem_request.get("domain_height_deg"),
            "target_resolution_m": dem_request.get("target_resolution_m"),
            "vertical_datum": dem_request.get("vertical_datum"),
            "horizontal_crs": dem_request.get("horizontal_crs"),
            "approve_large_native_extraction": dem_request.get("approve_large_native_extraction"),
            "recommended_sources": rank_sources(dem_request),
            "missing_information": missing,
        },
        "registry": load_registry(),
    }


def dem_patch_has_content(patch: dict[str, Any]) -> bool:
    for key in (
        "location",
        "center_description",
        "center_lon",
        "center_lat",
        "aoi_bbox_wgs84",
        "source_dataset_hint",
        "domain_width_m",
        "domain_height_m",
        "domain_width_deg",
        "domain_height_deg",
        "target_resolution_m",
        "vertical_datum",
        "horizontal_crs",
        "approve_large_native_extraction",
    ):
        if patch.get(key) not in (None, ""):
            return True
    return bool(patch.get("preferred_sources"))


def message_mentions_dem_workflow(message: str) -> bool:
    lower = message.lower()
    return any(word in lower for word in ("dem", "bathy", "bathymetry", "topography", "noaa", "usgs", "gebco", "download", "retrieve", "create", "approve", "approval", "confirm", "proceed"))


def missing_dem_fields(dem_request: dict[str, Any]) -> list[str]:
    missing: list[str] = []
    if not dem_request.get("location"):
        missing.append("location")
    has_bbox = bool(dem_request.get("aoi_bbox_wgs84"))
    has_center = bool(
        dem_request.get("center_description")
        or (dem_request.get("center_lon") is not None and dem_request.get("center_lat") is not None)
    )
    has_meter_domain = bool(dem_request.get("domain_width_m") and dem_request.get("domain_height_m"))
    has_degree_domain = bool(dem_request.get("domain_width_deg") and dem_request.get("domain_height_deg"))
    has_center_domain = bool(has_center and (has_meter_domain or has_degree_domain))
    if not has_bbox and not has_center_domain:
        missing.append("AOI as bounding box, polygon, or center plus domain size")
    return missing


def rank_sources(dem_request: dict[str, Any]) -> list[str]:
    if dem_request.get("source_dataset_hint"):
        return ["noaa_digital_coast", "usgs_coned_wcs", "noaa_slr_viewer_dem", "public_noaa_gridded"]
    if dem_request.get("preferred_sources"):
        preferred = [normalize_source_id(value) for value in dem_request["preferred_sources"]]
        ranked = []
        if "noaa_digital_coast" in preferred:
            ranked.append("noaa_digital_coast")
        if "usgs_coned_wcs" in preferred:
            ranked.append("usgs_coned_wcs")
        if "noaa_slr_viewer_dem" in preferred:
            ranked.append("noaa_slr_viewer_dem")
        if any(value in preferred for value in ("public_noaa_gridded", "etopo", "crm", "noaa_grid_extract", "noaa_dem_global_mosaic")):
            ranked.append("public_noaa_gridded")
        ranked.extend(["noaa_slr_viewer_dem", "public_noaa_gridded"])
        return dedupe(ranked)
    location = (dem_request.get("location") or "").lower()
    if any(term in location for term in ("santa cruz", "california", "florida", "harbor", "beach")):
        return ["usgs_coned_wcs", "noaa_slr_viewer_dem", "public_noaa_gridded"]
    return ["public_noaa_gridded"]


def dedupe(values: list[str]) -> list[str]:
    seen = set()
    result = []
    for value in values:
        if value not in seen:
            seen.add(value)
            result.append(value)
    return result


def normalize_source_id(value: Any) -> str:
    raw = str(value or "").strip()
    key = re.sub(r"[^a-z0-9]+", " ", raw.lower()).strip()
    return SOURCE_ALIASES.get(key, raw)


def convert_to_meters(value: float, unit: str) -> float:
    unit = unit.lower()
    if unit.startswith("km") or unit.startswith("kilometer"):
        return value * 1000.0
    return value
