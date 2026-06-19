from __future__ import annotations

import copy
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeoutError
import json
import os
from typing import Any

from agent.geo import bbox_from_center, bbox_from_center_degrees, lat_degrees_to_meters, lon_degrees_to_meters, normalize_bbox_wgs84
from agent.shoreline.anchor import anchor_center_to_shoreline
from agent.sources.aoi_geocoder import (
    center_distance_m,
    collect_geocoder_candidates,
    geocode_first_match,
    geocoder_queries,
    number_or_none,
)
from agent.sources.aoi_llm import (
    adjudicate_geographic_resolution,
    check_geographic_selection_with_llm,
    plan_geographic_search,
    resolve_coastal_feature_with_openai_tools,
    resolve_geographic_center_from_text_with_llm,
    select_geographic_center_with_llm,
    select_line_geometry_center_with_llm,
    selection_uses_linear_candidate_centroid,
)


WEB_RESOLVER_SELECTED_WAIT_SECONDS = 2
WEB_RESOLVER_FALLBACK_WAIT_SECONDS = 3
TEXT_RESOLVER_FALLBACK_WAIT_SECONDS = 6
AOI_CACHE: dict[str, dict[str, Any]] = {}


def resolve_aoi(dem_request: dict[str, Any]) -> dict[str, Any]:
    cache_key = aoi_cache_key(dem_request)
    cached = AOI_CACHE.get(cache_key)
    if cached:
        return copy.deepcopy(cached)

    result = resolve_aoi_uncached(dem_request)
    AOI_CACHE[cache_key] = copy.deepcopy(result)
    return result


def resolve_aoi_uncached(dem_request: dict[str, Any]) -> dict[str, Any]:
    bbox = dem_request.get("aoi_bbox_wgs84")
    if isinstance(bbox, list) and len(bbox) == 4:
        min_lon, min_lat, max_lon, max_lat = normalize_bbox_wgs84(bbox)
        center_lat = (min_lat + max_lat) / 2.0
        width_m = lon_degrees_to_meters(max_lon - min_lon, center_lat)
        height_m = lat_degrees_to_meters(max_lat - min_lat)
        center = {
            "lon": (min_lon + max_lon) / 2.0,
            "lat": center_lat,
            "label": dem_request.get("center_description") or "AOI bbox center",
            "source": "aoi_bbox_wgs84",
        }
        grounded = None if dem_request.get("spatial_resolution_locked") else resolve_geographic_center(dem_request, current_center=center)
        if grounded and center_distance_m(center["lon"], center["lat"], grounded["lon"], grounded["lat"]) > max(100.0, 0.05 * max(width_m, height_m)):
            grounded = dict(grounded)
            grounded["recentered_from"] = center
            grounded["source"] = f"{grounded.get('source', 'llm_georesolver')}_bbox_recenter"
            bbox = bbox_from_center(grounded["lon"], grounded["lat"], width_m, height_m)
            return {
                "center": grounded,
                "domain_width_m": width_m,
                "domain_height_m": height_m,
                "bbox_wgs84": bbox,
            }
        return {
            "center": center,
            "domain_width_m": width_m,
            "domain_height_m": height_m,
            "bbox_wgs84": [min_lon, min_lat, max_lon, max_lat],
        }

    width_deg = optional_float(dem_request, "domain_width_deg")
    height_deg = optional_float(dem_request, "domain_height_deg")
    if width_deg is not None and height_deg is not None:
        center = resolve_center(dem_request)
        bbox = bbox_from_center_degrees(center["lon"], center["lat"], width_deg, height_deg)
        min_lon, min_lat, max_lon, max_lat = normalize_bbox_wgs84(bbox)
        center_lat = (min_lat + max_lat) / 2.0
        width_m = lon_degrees_to_meters(max_lon - min_lon, center_lat)
        height_m = lat_degrees_to_meters(max_lat - min_lat)
        return {
            "center": center,
            "domain_width_m": width_m,
            "domain_height_m": height_m,
            "domain_width_deg": max_lon - min_lon,
            "domain_height_deg": max_lat - min_lat,
            "bbox_wgs84": [min_lon, min_lat, max_lon, max_lat],
        }

    width = required_float(dem_request, "domain_width_m")
    height = required_float(dem_request, "domain_height_m")
    center = resolve_center(dem_request)
    center = anchor_center_to_shoreline(dem_request, center, width, height)
    bbox = bbox_from_center(center["lon"], center["lat"], width, height)
    return {
        "center": center,
        "domain_width_m": width,
        "domain_height_m": height,
        "bbox_wgs84": bbox,
    }


def aoi_resolution_steps(aoi: dict[str, Any]) -> list[str]:
    center = aoi.get("center") or {}
    shoreline_anchor = center.get("shoreline_anchor") or {}
    if shoreline_anchor:
        return ["resolve_shoreline_anchor"]
    return []


def aoi_cache_key(dem_request: dict[str, Any]) -> str:
    fields = {
        "version": 4,
        "location": dem_request.get("location"),
        "center_description": dem_request.get("center_description"),
        "center_lon": dem_request.get("center_lon"),
        "center_lat": dem_request.get("center_lat"),
        "aoi_bbox_wgs84": dem_request.get("aoi_bbox_wgs84"),
        "domain_width_m": dem_request.get("domain_width_m"),
        "domain_height_m": dem_request.get("domain_height_m"),
        "domain_width_deg": dem_request.get("domain_width_deg"),
        "domain_height_deg": dem_request.get("domain_height_deg"),
        "spatial_resolution_locked": dem_request.get("spatial_resolution_locked"),
    }
    return json.dumps(fields, sort_keys=True, default=str)


def resolve_center(dem_request: dict[str, Any]) -> dict[str, Any]:
    lon = dem_request.get("center_lon")
    lat = dem_request.get("center_lat")
    if lon is not None and lat is not None and dem_request.get("spatial_resolution_locked"):
        return {"lon": float(lon), "lat": float(lat), "label": dem_request.get("center_description") or "locked center", "source": "locked_dem_request"}

    grounded = resolve_geographic_center(dem_request)
    if grounded:
        return grounded

    if lon is not None and lat is not None:
        return {"lon": float(lon), "lat": float(lat), "label": dem_request.get("center_description") or "request center", "source": "dem_request"}

    query_parts = [dem_request.get("center_description"), dem_request.get("location")]
    query = ", ".join(str(part).strip() for part in query_parts if part)
    fallback = geocode_first_match(query)
    if fallback:
        return fallback
    raise ValueError(f"Could not resolve AOI center from: {query or 'empty location'}")


def resolve_geographic_center(dem_request: dict[str, Any], current_center: dict[str, Any] | None = None) -> dict[str, Any] | None:
    if not os.environ.get("OPENAI_API_KEY"):
        return None
    request_context = georesolution_request_context(dem_request, current_center)
    executor = ThreadPoolExecutor(max_workers=3)
    tool_future = executor.submit(resolve_coastal_feature_with_openai_tools, request_context)
    plan_future = executor.submit(plan_geographic_search, request_context)
    direct_future = executor.submit(resolve_geographic_center_from_text_with_llm, request_context)
    try:
        plan = future_result(plan_future)
        selected_result = resolve_geographic_center_from_plan(request_context, plan)
        wait_seconds = WEB_RESOLVER_FALLBACK_WAIT_SECONDS if selected_result is None or selected_result == "no_plan" else WEB_RESOLVER_SELECTED_WAIT_SECONDS
        tool_resolved = future_result(tool_future, timeout=wait_seconds)
        direct_resolved = future_result(direct_future, timeout=0)
    finally:
        executor.shutdown(wait=False, cancel_futures=True)
    if selected_result == "no_plan":
        if tool_resolved:
            return tool_resolved
        return direct_resolved or future_result(direct_future, timeout=TEXT_RESOLVER_FALLBACK_WAIT_SECONDS)
    if selected_result is None:
        if tool_resolved:
            result = dict(tool_resolved)
            result["needs_geographic_review"] = True
            result["review_reason"] = "No map/geocoder candidates were available to cross-check the web-resolved AOI center."
            return result
        return direct_resolved or future_result(direct_future, timeout=TEXT_RESOLVER_FALLBACK_WAIT_SECONDS)
    return choose_geographic_resolution(request_context, tool_resolved, selected_result)


def future_result(future, timeout: float | None = None) -> Any:
    try:
        return future.result(timeout=timeout)
    except (Exception, FutureTimeoutError):
        return None


def resolve_geographic_center_from_plan(request_context: dict[str, Any], plan: dict[str, Any] | None) -> dict[str, Any] | str | None:
    if not plan or not plan.get("should_resolve"):
        return "no_plan"
    queries = geocoder_queries(request_context, plan)
    candidates = collect_geocoder_candidates(queries)
    if not candidates:
        return None
    selected = select_line_geometry_center_with_llm(request_context, plan, candidates) or select_geographic_center_with_llm(request_context, plan, candidates)
    if selected and selected.get("can_resolve") and selected.get("lon") is not None and selected.get("lat") is not None:
        needs_audit = (
            bool(request_context.get("has_prior_center_under_review"))
            or selected.get("confidence") != "high"
            or selection_uses_linear_candidate_centroid(selected, candidates)
        )
        if needs_audit:
            checked = check_geographic_selection_with_llm(request_context, plan, candidates, selected)
            if checked and checked.get("can_resolve") and checked.get("lon") is not None and checked.get("lat") is not None:
                selected = checked
        result = {
            "lon": float(selected["lon"]),
            "lat": float(selected["lat"]),
            "label": selected.get("label") or plan.get("target_description") or request_context.get("center_description") or request_context.get("location"),
            "source": "llm_georesolver",
            "confidence": selected.get("confidence"),
            "reason": selected.get("reason"),
            "search_plan": plan,
        }
        candidate_index = selected.get("candidate_index")
        if isinstance(candidate_index, int) and 0 <= candidate_index < len(candidates):
            result["grounding_candidate"] = candidates[candidate_index]
            if candidates[candidate_index].get("license"):
                result["license"] = candidates[candidate_index]["license"]
        else:
            result["needs_geographic_review"] = True
            result["review_reason"] = "No map/geocoder candidate was accepted as the final geographic target."
        return result
    return resolve_geographic_center_from_text_with_llm(request_context, plan)


def choose_geographic_resolution(
    request_context: dict[str, Any],
    web_result: dict[str, Any] | None,
    grounded_result: dict[str, Any] | None,
) -> dict[str, Any] | None:
    if not web_result:
        return grounded_result
    if not grounded_result:
        return web_result
    if web_result.get("confidence") != "high" or web_result.get("needs_geographic_review"):
        return grounded_result

    try:
        separation_m = center_distance_m(
            float(web_result["lon"]),
            float(web_result["lat"]),
            float(grounded_result["lon"]),
            float(grounded_result["lat"]),
        )
    except (TypeError, ValueError, KeyError):
        return grounded_result

    domain_max_m = max(number_or_none(request_context.get("domain_width_m")) or 0.0, number_or_none(request_context.get("domain_height_m")) or 0.0)
    agreement_threshold_m = max(1500.0, 0.75 * domain_max_m)
    if separation_m <= agreement_threshold_m:
        chosen = dict(web_result)
        chosen["agreement_check"] = {
            "alternate_source": grounded_result.get("source"),
            "alternate_lon": grounded_result.get("lon"),
            "alternate_lat": grounded_result.get("lat"),
            "separation_m": round(separation_m, 1),
            "threshold_m": round(agreement_threshold_m, 1),
        }
        if grounded_result.get("needs_geographic_review") or grounded_result.get("source") in {"llm_text_georesolver"}:
            chosen["needs_geographic_review"] = True
            chosen["review_reason"] = "Web resolver agreed only with an ungrounded text fallback; inspect the context maps before using this AOI."
        return chosen

    if grounded_result.get("confidence") == "high" and grounded_result_has_line_geometry(grounded_result):
        chosen = dict(grounded_result)
        chosen["agreement_check"] = {
            "alternate_source": web_result.get("source"),
            "alternate_lon": web_result.get("lon"),
            "alternate_lat": web_result.get("lat"),
            "separation_m": round(separation_m, 1),
            "threshold_m": round(agreement_threshold_m, 1),
            "decision": "preferred accepted map line geometry over conflicting web-derived coordinate",
        }
        return chosen

    adjudicated = adjudicate_geographic_resolution(request_context, web_result, grounded_result, separation_m)
    if adjudicated:
        return adjudicated

    chosen = dict(grounded_result)
    chosen["needs_geographic_review"] = True
    chosen["review_reason"] = (
        f"OpenAI web resolver and map/geocoder resolver disagreed by {round(separation_m)} m; "
        "using the map/geocoder-grounded center for DEM retrieval and flagging review."
    )
    chosen["rejected_alternate_center"] = {
        "source": web_result.get("source"),
        "lon": web_result.get("lon"),
        "lat": web_result.get("lat"),
        "label": web_result.get("label"),
        "confidence": web_result.get("confidence"),
        "reason": web_result.get("reason"),
        "separation_m": round(separation_m, 1),
    }
    return chosen


def grounded_result_has_line_geometry(result: dict[str, Any]) -> bool:
    geometry_type = (((result.get("grounding_candidate") or {}).get("geometry") or {}).get("type") or "").lower()
    return "line" in geometry_type


def georesolution_request_context(dem_request: dict[str, Any], current_center: dict[str, Any] | None = None) -> dict[str, Any]:
    context = {
        "location": dem_request.get("location"),
        "center_description": clean_center_description(dem_request.get("center_description")),
        "domain_width_m": dem_request.get("domain_width_m"),
        "domain_height_m": dem_request.get("domain_height_m"),
        "domain_width_deg": dem_request.get("domain_width_deg"),
        "domain_height_deg": dem_request.get("domain_height_deg"),
        "notes": dem_request.get("notes") or [],
    }
    scale_lat = None
    if current_center and current_center.get("lat") is not None:
        scale_lat = float(current_center["lat"])
    elif dem_request.get("center_lat") is not None:
        scale_lat = float(dem_request["center_lat"])
    if scale_lat is not None and not context.get("domain_width_m") and not context.get("domain_height_m"):
        width_deg = number_or_none(context.get("domain_width_deg"))
        height_deg = number_or_none(context.get("domain_height_deg"))
        if width_deg and height_deg:
            context["domain_width_m"] = lon_degrees_to_meters(width_deg, scale_lat)
            context["domain_height_m"] = lat_degrees_to_meters(height_deg)
    if current_center:
        context["has_prior_center_under_review"] = True
    return context


def clean_center_description(value: Any) -> str | None:
    if value in (None, ""):
        return None
    text = str(value)
    for marker in ("with LLM-selected grid bounds",):
        text = text.replace(marker, "")
    return " ".join(text.split()) or None


def required_float(data: dict[str, Any], key: str) -> float:
    value = data.get(key)
    if value is None:
        raise ValueError(f"Missing required DEM request field: {key}")
    return float(value)


def optional_float(data: dict[str, Any], key: str) -> float | None:
    value = data.get(key)
    if value in (None, ""):
        return None
    return float(value)
