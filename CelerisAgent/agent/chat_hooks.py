from __future__ import annotations

from typing import Any

from agent.chat_state import dedupe, normalize_source_id
from agent.geo import lat_degrees_to_meters, lon_degrees_to_meters, normalize_bbox_wgs84, translate_lon_lat


def apply_workflow_hooks(dem_request: dict[str, Any], hooks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    applied: list[dict[str, Any]] = []
    for hook in hooks:
        if not isinstance(hook, dict):
            continue
        name = hook.get("name")
        if name == "translate_aoi_m":
            applied.append(apply_translate_aoi_hook(dem_request, hook))
        elif name == "extend_domain_m":
            applied.append(apply_extend_domain_hook(dem_request, hook))
        elif name == "set_domain_extents_m":
            applied.append(apply_set_domain_extents_hook(dem_request, hook))
        elif name == "set_aoi_bbox_wgs84":
            applied.append(apply_set_aoi_bbox_hook(dem_request, hook))
        elif name == "set_preferred_sources":
            sources = [normalize_source_id(value) for value in hook.get("sources", []) if value]
            if sources:
                dem_request["preferred_sources"] = dedupe(sources)
                if "usgs_coned_wcs" in dem_request["preferred_sources"]:
                    dem_request["source_dataset_hint"] = None
                applied.append({"name": name, "sources": dem_request["preferred_sources"], "reason": hook.get("reason")})
        elif name == "clear_source_dataset_hint":
            dem_request["source_dataset_hint"] = None
            applied.append({"name": name, "reason": hook.get("reason")})
        elif name == "rerun_source_retrieval":
            applied.append({"name": name, "reason": hook.get("reason")})
        elif name == "approve_large_native_extraction":
            dem_request["approve_large_native_extraction"] = True
            applied.append({"name": name, "status": "applied", "reason": hook.get("reason")})
    return [item for item in applied if item]


def apply_translate_aoi_hook(dem_request: dict[str, Any], hook: dict[str, Any]) -> dict[str, Any]:
    dx_m = float(hook.get("dx_m") or 0.0)
    dy_m = float(hook.get("dy_m") or 0.0)
    lon = dem_request.get("center_lon")
    lat = dem_request.get("center_lat")
    if lon is None or lat is None:
        return {"name": "translate_aoi_m", "status": "skipped_no_resolved_center", "dx_m": dx_m, "dy_m": dy_m, "reason": hook.get("reason")}
    new_lon, new_lat = translate_lon_lat(float(lon), float(lat), dx_m, dy_m)
    dem_request["center_lon"] = new_lon
    dem_request["center_lat"] = new_lat
    dem_request["aoi_bbox_wgs84"] = None
    dem_request["spatial_resolution_locked"] = True
    old_description = dem_request.get("center_description") or "previous center"
    dem_request["center_description"] = f"{old_description} shifted {format_shift(dx_m, dy_m)}"
    return {
        "name": "translate_aoi_m",
        "status": "applied",
        "dx_m": dx_m,
        "dy_m": dy_m,
        "old_center": {"lon": lon, "lat": lat},
        "new_center": {"lon": new_lon, "lat": new_lat},
        "reason": hook.get("reason"),
    }


def apply_extend_domain_hook(dem_request: dict[str, Any], hook: dict[str, Any]) -> dict[str, Any]:
    north_m = max(float(hook.get("north_m") or 0.0), 0.0)
    south_m = max(float(hook.get("south_m") or 0.0), 0.0)
    east_m = max(float(hook.get("east_m") or 0.0), 0.0)
    west_m = max(float(hook.get("west_m") or 0.0), 0.0)
    width = dem_request.get("domain_width_m")
    height = dem_request.get("domain_height_m")
    if width is None or height is None:
        return {
            "name": "extend_domain_m",
            "status": "skipped_no_domain",
            "north_m": north_m,
            "south_m": south_m,
            "east_m": east_m,
            "west_m": west_m,
            "reason": hook.get("reason"),
        }

    old_width = float(width)
    old_height = float(height)
    new_width = old_width + east_m + west_m
    new_height = old_height + north_m + south_m
    dem_request["domain_width_m"] = new_width
    dem_request["domain_height_m"] = new_height
    dem_request["aoi_bbox_wgs84"] = None

    dx_m = (east_m - west_m) / 2.0
    dy_m = (north_m - south_m) / 2.0
    lon = dem_request.get("center_lon")
    lat = dem_request.get("center_lat")
    new_lon = lon
    new_lat = lat
    if lon is not None and lat is not None and (dx_m or dy_m):
        new_lon, new_lat = translate_lon_lat(float(lon), float(lat), dx_m, dy_m)
        dem_request["center_lon"] = new_lon
        dem_request["center_lat"] = new_lat
    if lon is not None and lat is not None:
        dem_request["spatial_resolution_locked"] = True
    old_description = dem_request.get("center_description") or "previous center"
    dem_request["center_description"] = f"{old_description} with domain extended {format_extension(north_m, south_m, east_m, west_m)}"
    return {
        "name": "extend_domain_m",
        "status": "applied",
        "north_m": north_m,
        "south_m": south_m,
        "east_m": east_m,
        "west_m": west_m,
        "center_shift_m": {"dx_m": dx_m, "dy_m": dy_m},
        "old_domain": {"width_m": old_width, "height_m": old_height},
        "new_domain": {"width_m": new_width, "height_m": new_height},
        "old_center": {"lon": lon, "lat": lat},
        "new_center": {"lon": new_lon, "lat": new_lat},
        "reason": hook.get("reason"),
    }


def apply_set_domain_extents_hook(dem_request: dict[str, Any], hook: dict[str, Any]) -> dict[str, Any]:
    north_m = nonnegative_or_none(hook.get("north_m"))
    south_m = nonnegative_or_none(hook.get("south_m"))
    east_m = nonnegative_or_none(hook.get("east_m"))
    west_m = nonnegative_or_none(hook.get("west_m"))
    old_width = float(dem_request.get("domain_width_m") or 0.0)
    old_height = float(dem_request.get("domain_height_m") or 0.0)
    if east_m is None and west_m is None and old_width:
        east_m = old_width / 2.0
        west_m = old_width / 2.0
    if north_m is None and south_m is None and old_height:
        north_m = old_height / 2.0
        south_m = old_height / 2.0
    east_m = east_m if east_m is not None else 0.0
    west_m = west_m if west_m is not None else 0.0
    north_m = north_m if north_m is not None else 0.0
    south_m = south_m if south_m is not None else 0.0
    if east_m + west_m <= 0.0 or north_m + south_m <= 0.0:
        return {
            "name": "set_domain_extents_m",
            "status": "skipped_incomplete_extents",
            "north_m": north_m,
            "south_m": south_m,
            "east_m": east_m,
            "west_m": west_m,
            "reason": hook.get("reason"),
        }

    lon = dem_request.get("center_lon")
    lat = dem_request.get("center_lat")
    dx_m = (east_m - west_m) / 2.0
    dy_m = (north_m - south_m) / 2.0
    new_lon = lon
    new_lat = lat
    if lon is not None and lat is not None and (dx_m or dy_m):
        new_lon, new_lat = translate_lon_lat(float(lon), float(lat), dx_m, dy_m)
        dem_request["center_lon"] = new_lon
        dem_request["center_lat"] = new_lat
    if lon is not None and lat is not None:
        dem_request["spatial_resolution_locked"] = True
    dem_request["domain_width_m"] = east_m + west_m
    dem_request["domain_height_m"] = north_m + south_m
    dem_request["aoi_bbox_wgs84"] = None
    old_description = dem_request.get("center_description") or "previous anchor"
    dem_request["center_description"] = f"{old_description} with domain extents set to {format_extension(north_m, south_m, east_m, west_m)}"
    return {
        "name": "set_domain_extents_m",
        "status": "applied",
        "north_m": north_m,
        "south_m": south_m,
        "east_m": east_m,
        "west_m": west_m,
        "center_shift_m": {"dx_m": dx_m, "dy_m": dy_m},
        "old_domain": {"width_m": old_width or None, "height_m": old_height or None},
        "new_domain": {"width_m": east_m + west_m, "height_m": north_m + south_m},
        "old_center": {"lon": lon, "lat": lat},
        "new_center": {"lon": new_lon, "lat": new_lat},
        "reason": hook.get("reason"),
    }


def apply_set_aoi_bbox_hook(dem_request: dict[str, Any], hook: dict[str, Any]) -> dict[str, Any]:
    bbox = hook.get("bbox_wgs84")
    if not isinstance(bbox, list) or len(bbox) != 4:
        return {"name": "set_aoi_bbox_wgs84", "status": "skipped_no_bbox", "reason": hook.get("reason")}

    min_lon, min_lat, max_lon, max_lat = normalize_bbox_wgs84(bbox)
    center_lon = (min_lon + max_lon) / 2.0
    center_lat = (min_lat + max_lat) / 2.0
    width_m = lon_degrees_to_meters(max_lon - min_lon, center_lat)
    height_m = lat_degrees_to_meters(max_lat - min_lat)
    old_bbox = dem_request.get("aoi_bbox_wgs84")
    old_center = {"lon": dem_request.get("center_lon"), "lat": dem_request.get("center_lat")}
    old_domain = {"width_m": dem_request.get("domain_width_m"), "height_m": dem_request.get("domain_height_m")}

    dem_request["aoi_bbox_wgs84"] = [min_lon, min_lat, max_lon, max_lat]
    dem_request["center_lon"] = center_lon
    dem_request["center_lat"] = center_lat
    dem_request["spatial_resolution_locked"] = True
    dem_request["domain_width_m"] = width_m
    dem_request["domain_height_m"] = height_m
    old_description = dem_request.get("center_description") or dem_request.get("location") or "AOI"
    dem_request["center_description"] = f"{old_description} with LLM-selected grid bounds"

    return {
        "name": "set_aoi_bbox_wgs84",
        "status": "applied",
        "old_bbox_wgs84": old_bbox,
        "new_bbox_wgs84": dem_request["aoi_bbox_wgs84"],
        "old_center": old_center,
        "new_center": {"lon": center_lon, "lat": center_lat},
        "old_domain": old_domain,
        "new_domain": {"width_m": width_m, "height_m": height_m},
        "reason": hook.get("reason"),
    }


def workflow_hook_text(applied_hooks: list[dict[str, Any]]) -> str:
    parts = []
    for hook in applied_hooks:
        if hook.get("name") == "translate_aoi_m" and hook.get("status") == "applied":
            parts.append(f"Applied AOI shift: {format_shift(float(hook.get('dx_m') or 0.0), float(hook.get('dy_m') or 0.0))}.")
        elif hook.get("name") == "extend_domain_m" and hook.get("status") == "applied":
            parts.append(
                "Extended domain: "
                f"{format_extension(float(hook.get('north_m') or 0.0), float(hook.get('south_m') or 0.0), float(hook.get('east_m') or 0.0), float(hook.get('west_m') or 0.0))}."
            )
        elif hook.get("name") == "set_domain_extents_m" and hook.get("status") == "applied":
            parts.append(
                "Set domain extents: "
                f"{format_extension(float(hook.get('north_m') or 0.0), float(hook.get('south_m') or 0.0), float(hook.get('east_m') or 0.0), float(hook.get('west_m') or 0.0))}."
            )
        elif hook.get("name") == "set_aoi_bbox_wgs84" and hook.get("status") == "applied":
            domain = hook.get("new_domain") or {}
            parts.append(
                "Set AOI grid bounds from the conversation: "
                f"{float(domain.get('width_m') or 0.0):.0f} m by {float(domain.get('height_m') or 0.0):.0f} m."
            )
        elif hook.get("name") == "set_preferred_sources" and hook.get("sources"):
            parts.append(f"Updated source path: {', '.join(hook['sources'])}.")
        elif hook.get("name") == "clear_source_dataset_hint":
            parts.append("Cleared the prior dataset hint.")
        elif hook.get("name") == "approve_large_native_extraction" and hook.get("status") == "applied":
            parts.append("Approved large native-resolution extraction for the current AOI.")
    return " ".join(parts)


def nonnegative_or_none(value: Any) -> float | None:
    if value is None:
        return None
    return max(float(value), 0.0)


def format_shift(dx_m: float, dy_m: float) -> str:
    parts = []
    if dx_m:
        parts.append(f"{abs(dx_m):g} m {'east' if dx_m > 0 else 'west'}")
    if dy_m:
        parts.append(f"{abs(dy_m):g} m {'north' if dy_m > 0 else 'south'}")
    return " and ".join(parts) if parts else "0 m"


def format_extension(north_m: float, south_m: float, east_m: float, west_m: float) -> str:
    parts = []
    if north_m:
        parts.append(f"{north_m:g} m north")
    if south_m:
        parts.append(f"{south_m:g} m south")
    if east_m:
        parts.append(f"{east_m:g} m east")
    if west_m:
        parts.append(f"{west_m:g} m west")
    return ", ".join(parts) if parts else "0 m"
