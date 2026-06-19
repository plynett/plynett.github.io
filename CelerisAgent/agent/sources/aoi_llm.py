from __future__ import annotations

import json
import os
from typing import Any

from agent.config import ROOT
from agent.openai_client import call_openai_for_role, extract_response_text, model_for


def adjudicate_geographic_resolution(
    request_context: dict[str, Any],
    web_result: dict[str, Any],
    grounded_result: dict[str, Any],
    separation_m: float,
) -> dict[str, Any] | None:
    schema = {
        "type": "object",
        "properties": {
            "can_resolve": {"type": "boolean"},
            "selected_source": {"type": "string", "enum": ["web", "grounded", "revised", "needs_review"]},
            "lon": {"type": ["number", "null"]},
            "lat": {"type": ["number", "null"]},
            "label": {"type": ["string", "null"]},
            "confidence": {"type": "string", "enum": ["low", "medium", "high"]},
            "reason": {"type": "string"},
        },
        "required": ["can_resolve", "selected_source", "lon", "lat", "label", "confidence", "reason"],
        "additionalProperties": False,
    }
    instructions = load_geographic_resolution_instructions()
    payload = {
        "model": model_for("geographic"),
        "input": [
            {
                "role": "developer",
                "content": [
                    {
                        "type": "input_text",
                        "text": (
                            "Adjudicate conflicting coastal DEM center candidates. The user's natural-language request is authoritative. "
                            "Choose the coordinate that best represents the practical DEM target, especially the physical shoreline, inlet, pass, "
                            "harbor opening, or waterbody-ocean connection when that is requested. "
                            "Do not prefer a candidate merely because it has an official name or high confidence. Named-feature, GNIS, TopoZone, "
                            "or geocoder coordinates may be representative centroids or channel midpoints; reject them when they do not land on "
                            "the physical target implied by the user. For ocean/gulf/sea connection requests, prefer the seaward opening or midpoint "
                            "of the seaward jetty/breakwater/barrier-island gap, so the requested DEM box would straddle the inner waterbody and open water. "
                            "If both supplied candidates are wrong but the correct target is clear, "
                            "return selected_source=revised with a corrected lon/lat. Return needs_review only when ambiguity remains.\n\n"
                            f"{instructions}"
                        ),
                    }
                ],
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": json.dumps(
                            {
                                "request_context": request_context,
                                "candidate_web": web_result,
                                "candidate_grounded": grounded_result,
                                "candidate_separation_m": round(separation_m, 1),
                            },
                            ensure_ascii=True,
                        ),
                    }
                ],
            },
        ],
        "text": {"format": {"type": "json_schema", "name": "geo_resolution_adjudication", "schema": schema, "strict": True}},
    }
    try:
        data = call_openai_for_role(payload, os.environ["OPENAI_API_KEY"], "geographic")
        selected = json.loads(extract_response_text(data))
    except Exception:
        return None
    if not selected.get("can_resolve") or selected.get("lon") is None or selected.get("lat") is None:
        return None

    result = {
        "lon": float(selected["lon"]),
        "lat": float(selected["lat"]),
        "label": selected.get("label") or request_context.get("center_description") or request_context.get("location"),
        "source": f"llm_resolution_adjudicator_{selected.get('selected_source')}",
        "confidence": selected.get("confidence"),
        "reason": selected.get("reason"),
        "alternate_centers": [
            {
                "source": web_result.get("source"),
                "lon": web_result.get("lon"),
                "lat": web_result.get("lat"),
                "label": web_result.get("label"),
                "confidence": web_result.get("confidence"),
            },
            {
                "source": grounded_result.get("source"),
                "lon": grounded_result.get("lon"),
                "lat": grounded_result.get("lat"),
                "label": grounded_result.get("label"),
                "confidence": grounded_result.get("confidence"),
            },
        ],
        "candidate_separation_m": round(separation_m, 1),
    }
    if selected.get("selected_source") == "web":
        result["resolution_evidence"] = web_result.get("resolution_evidence") or []
        result["rejected_candidates"] = web_result.get("rejected_candidates") or []
    if selected.get("selected_source") == "grounded" and grounded_result.get("grounding_candidate"):
        result["grounding_candidate"] = grounded_result.get("grounding_candidate")
    result["needs_geographic_review"] = True
    result["review_reason"] = (
        selected.get("reason")
        if selected.get("selected_source") == "needs_review" or selected.get("confidence") != "high"
        else "Resolver candidates disagreed beyond the domain-scale threshold; LLM adjudicated the center, but analyst map review is required."
    )
    if selected.get("selected_source") == "needs_review" or selected.get("confidence") != "high":
        result["needs_geographic_review"] = True
        result["review_reason"] = selected.get("reason")
    return result


def resolve_coastal_feature_with_openai_tools(request_context: dict[str, Any]) -> dict[str, Any] | None:
    if not os.environ.get("OPENAI_API_KEY"):
        return None
    instructions = load_geographic_resolution_instructions()
    schema = {
        "type": "object",
        "properties": {
            "can_resolve": {"type": "boolean"},
            "status": {"type": "string", "enum": ["ready", "needs_review", "needs_user_choice"]},
            "lon": {"type": ["number", "null"]},
            "lat": {"type": ["number", "null"]},
            "label": {"type": ["string", "null"]},
            "target_feature_type": {"type": ["string", "null"]},
            "confidence": {"type": "string", "enum": ["low", "medium", "high"]},
            "reason": {"type": "string"},
            "evidence": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"},
                        "url": {"type": ["string", "null"]},
                        "summary": {"type": "string"},
                    },
                    "required": ["title", "url", "summary"],
                    "additionalProperties": False,
                },
                "maxItems": 6,
            },
            "rejected_candidates": {
                "type": "array",
                "items": {"type": "string"},
                "maxItems": 8,
            },
        },
        "required": [
            "can_resolve",
            "status",
            "lon",
            "lat",
            "label",
            "target_feature_type",
            "confidence",
            "reason",
            "evidence",
            "rejected_candidates",
        ],
        "additionalProperties": False,
    }
    payload = {
        "model": model_for("geographic"),
        "tools": [{"type": "web_search"}],
        "tool_choice": "auto",
        "input": [
            {
                "role": "developer",
                "content": [
                    {
                        "type": "input_text",
                        "text": (
                            "You are a GIS resolver for a CELERIS DEM workflow. "
                            "Use web search when needed to resolve the functional geographic target, including recent events, earthquakes, and non-US/global ETOPO fallback requests. "
                            "Do not return a city centroid, harbor centroid, administrative label, business, school, marina office, buoy, or far offshore channel endpoint "
                            "when the user asks for an entrance, inlet mouth, harbor mouth, pass, outlet, or where a waterbody meets the ocean. "
                            "For those targets, identify the practical shoreline/breakwater opening connecting the inner waterbody to the receiving water. "
                            "Coordinates from named-feature pages, GNIS-style records, TopoZone, or geocoders can be representative centroids or channel midpoints; "
                            "use them only when they actually match the requested physical target. If the named feature is a channel, entrance, inlet, or pass, "
                            "reason about which end or opening is relevant to the user's DEM center instead of copying the representative coordinate. "
                            "For a harbor, bay, inlet, river mouth, pass, or waterway that meets an ocean, gulf, sea, or open coast, prefer the seaward opening "
                            "or midpoint of the seaward jetty/breakwater/barrier-island gap. A DEM box centered there should straddle both the inner waterbody/channel "
                            "and the receiving ocean/gulf/sea, not an inland harbor basin, bridge, named-channel midpoint, or inner bay/roadstead. "
                            "Return status=ready only when you have enough evidence for a kilometer-scale DEM center. "
                            "Return needs_review when you can provide a plausible center but evidence is weak or source descriptions conflict. "
                            "Return needs_user_choice when multiple plausible entrances or target interpretations exist. "
                            "Include short evidence and rejection reasons.\n\n"
                            f"{instructions}"
                        ),
                    }
                ],
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": json.dumps(
                            {
                                "request_context": request_context,
                                "task": "Resolve the practical DEM center for this natural-language target.",
                            },
                            ensure_ascii=True,
                        ),
                    }
                ],
            },
        ],
        "text": {"format": {"type": "json_schema", "name": "coastal_feature_resolution", "schema": schema, "strict": True}},
    }
    try:
        data = call_openai_for_role(payload, os.environ["OPENAI_API_KEY"], "geographic", timeout=20)
        selected = json.loads(extract_response_text(data))
    except Exception:
        return None
    if not selected.get("can_resolve") or selected.get("lon") is None or selected.get("lat") is None:
        return None
    result = {
        "lon": float(selected["lon"]),
        "lat": float(selected["lat"]),
        "label": selected.get("label") or request_context.get("center_description") or request_context.get("location"),
        "source": "openai_web_geographic_resolver",
        "confidence": selected.get("confidence"),
        "reason": selected.get("reason"),
        "target_feature_type": selected.get("target_feature_type"),
        "resolution_evidence": selected.get("evidence") or [],
        "rejected_candidates": selected.get("rejected_candidates") or [],
        "resolver_status": selected.get("status"),
    }
    if selected.get("status") != "ready" or selected.get("confidence") != "high":
        result["needs_geographic_review"] = True
        result["review_reason"] = selected.get("reason")
    return result


def selection_uses_linear_candidate_centroid(selected: dict[str, Any], candidates: list[dict[str, Any]]) -> bool:
    candidate_index = selected.get("candidate_index")
    if not isinstance(candidate_index, int) or candidate_index < 0 or candidate_index >= len(candidates):
        return False
    candidate = candidates[candidate_index]
    geometry_type = ((candidate.get("geometry") or {}).get("type") or "").lower()
    if "line" not in geometry_type:
        return False
    try:
        selected_lon = float(selected["lon"])
        selected_lat = float(selected["lat"])
        candidate_lon = float(candidate["lon"])
        candidate_lat = float(candidate["lat"])
    except (TypeError, ValueError, KeyError):
        return False
    return abs(selected_lon - candidate_lon) < 1e-7 and abs(selected_lat - candidate_lat) < 1e-7

def plan_geographic_search(request_context: dict[str, Any]) -> dict[str, Any] | None:
    instructions = load_geographic_resolution_instructions()
    schema = {
        "type": "object",
        "properties": {
            "should_resolve": {"type": "boolean"},
            "target_description": {"type": "string"},
            "queries": {"type": "array", "items": {"type": "string"}, "minItems": 0, "maxItems": 8},
            "reason": {"type": "string"},
        },
        "required": ["should_resolve", "target_description", "queries", "reason"],
        "additionalProperties": False,
    }
    payload = {
        "model": model_for("geographic"),
        "input": [
            {
                "role": "developer",
                "content": [
                    {
                        "type": "input_text",
                        "text": (
                            "You are the geographic-intelligence stage for a DEM workflow. "
                            "Interpret the user's requested location and target feature, then create concise geocoder search queries. "
                            "Do not output final coordinates from memory. Do not rely on keyword rules. "
                            "Return queries that are likely to retrieve map evidence for the exact requested feature and its broader place.\n\n"
                            f"{instructions}"
                        ),
                    }
                ],
            },
            {"role": "user", "content": [{"type": "input_text", "text": json.dumps(request_context, ensure_ascii=True)}]},
        ],
        "text": {"format": {"type": "json_schema", "name": "geo_search_plan", "schema": schema, "strict": True}},
    }
    try:
        data = call_openai_for_role(payload, os.environ["OPENAI_API_KEY"], "geographic")
        return json.loads(extract_response_text(data))
    except Exception:
        return None

def select_line_geometry_center_with_llm(request_context: dict[str, Any], plan: dict[str, Any], candidates: list[dict[str, Any]]) -> dict[str, Any] | None:
    line_candidates = []
    for index, candidate in enumerate(candidates):
        geometry = candidate.get("geometry") or {}
        if "line" in str(geometry.get("type") or "").lower() and geometry.get("derived_points"):
            item = dict(candidate)
            item["candidate_index"] = index
            line_candidates.append(item)
    if not line_candidates:
        return None

    schema = geo_selection_schema()
    instructions = load_geographic_resolution_instructions()
    payload = {
        "model": model_for("geographic"),
        "input": [
            {
                "role": "developer",
                "content": [
                    {
                        "type": "input_text",
                        "text": (
                            "Select a DEM center from line-geometry evidence only when the mapped line directly represents the user's requested coastal target. "
                            "Return the original candidate_index field from the selected line candidate. "
                            "The candidate lon/lat is a representative point and is usually not the right answer for an endpoint/opening request. "
                            "Use the geometry.derived_points lon_lat values directly when a first endpoint, last endpoint, or sample point best matches the user's requested harbor entrance, inlet mouth, pass, outlet, or waterway-open-water connection. "
                            "For requests involving an ocean, gulf, sea, or open coast, select the seaward endpoint/opening if the line geometry supports it. "
                            "Return can_resolve=false if the line geometry does not clearly represent the requested target or if you cannot infer which derived point is the practical DEM center.\n\n"
                            f"{instructions}"
                        ),
                    }
                ],
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": json.dumps(
                            {"request_context": request_context, "search_plan": plan, "line_candidates": line_candidates},
                            ensure_ascii=True,
                        ),
                    }
                ],
            },
        ],
        "text": {"format": {"type": "json_schema", "name": "line_geometry_center_selection", "schema": schema, "strict": True}},
    }
    try:
        data = call_openai_for_role(payload, os.environ["OPENAI_API_KEY"], "geographic")
        selected = json.loads(extract_response_text(data))
    except Exception:
        return None
    if not selected.get("can_resolve") or selected.get("lon") is None or selected.get("lat") is None:
        return None
    return selected


def select_geographic_center_with_llm(request_context: dict[str, Any], plan: dict[str, Any], candidates: list[dict[str, Any]]) -> dict[str, Any] | None:
    instructions = load_geographic_resolution_instructions()
    schema = {
        "type": "object",
        "properties": {
            "can_resolve": {"type": "boolean"},
            "lon": {"type": ["number", "null"]},
            "lat": {"type": ["number", "null"]},
            "label": {"type": ["string", "null"]},
            "candidate_index": {"type": ["integer", "null"]},
            "confidence": {"type": "string", "enum": ["low", "medium", "high"]},
            "reason": {"type": "string"},
        },
        "required": ["can_resolve", "lon", "lat", "label", "candidate_index", "confidence", "reason"],
        "additionalProperties": False,
    }
    payload = {
        "model": model_for("geographic"),
        "input": [
            {
                "role": "developer",
                "content": [
                    {
                        "type": "input_text",
                        "text": (
                            "Choose the final DEM grid center from map/geocoder evidence. "
                            "The user intent is authoritative. Use candidate names, classes, types, bounding boxes, and geometry summaries as evidence. "
                            "You may choose a candidate centroid, a geometry endpoint, a point along a geometry, or another coordinate derived from the evidence. "
                            "For line and multiline geometries, the candidate lon/lat is often only a representative point; if the user asks for a specific part of the feature, derive that point from first/last coordinates or other geometry evidence. "
                            "Geometry derived_points are valid selectable DEM centers; use their lon_lat values directly when a named endpoint, seaward endpoint, or sampled point best matches the request. "
                            "When a line geometry represents a channel, entrance, pass, or waterway and the user asks where it meets an ocean/gulf/sea/open coast, inspect first/last/sample coordinates and prefer the seaward endpoint or seaward opening over the line's representative midpoint. "
                            "For coastal DEM entrances and mouths, prefer the practical shoreline or breakwater opening over a far offshore navigation-channel endpoint or inland channel endpoint. "
                            "Reject candidates that do not represent the requested place or feature, even if they are the only map candidates. "
                            "If candidates are weak or unrelated, use general geographic knowledge when you can resolve the requested point with medium or high confidence. "
                            "If the evidence is insufficient, return can_resolve=false instead of guessing.\n\n"
                            f"{instructions}"
                        ),
                    }
                ],
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": json.dumps(
                            {"request_context": request_context, "search_plan": plan, "candidates": candidates},
                            ensure_ascii=True,
                        ),
                    }
                ],
            },
        ],
        "text": {"format": {"type": "json_schema", "name": "geo_center_selection", "schema": schema, "strict": True}},
    }
    try:
        data = call_openai_for_role(payload, os.environ["OPENAI_API_KEY"], "geographic")
        return json.loads(extract_response_text(data))
    except Exception:
        return None


def check_geographic_selection_with_llm(
    request_context: dict[str, Any],
    plan: dict[str, Any],
    candidates: list[dict[str, Any]],
    selected: dict[str, Any],
) -> dict[str, Any] | None:
    schema = geo_selection_schema()
    instructions = load_geographic_resolution_instructions()
    payload = {
        "model": model_for("geographic"),
        "input": [
            {
                "role": "developer",
                "content": [
                    {
                        "type": "input_text",
                        "text": (
                            "Audit a proposed DEM center against the user's geographic intent and the map evidence. "
                            "If the proposed point is correct, return it unchanged. If it picks the wrong feature, wrong endpoint, "
                            "or stale center, correct it using the candidates and geometry. If the evidence is insufficient, "
                            "For line and multiline geometries, treat the candidate lon/lat as a representative point, not automatically as the requested target; correct it when the user's requested point is a specific part of the mapped feature. "
                            "Geometry derived_points are valid correction targets; use their lon_lat values directly when they better match the requested endpoint/opening. "
                            "If the mapped line has first/last/sample coordinates and the request is for the point where the waterway meets an ocean/gulf/sea/open coast, prefer the seaward endpoint/opening when the geometry supports it. "
                            "For coastal DEM entrances and mouths, correct far offshore navigation-channel endpoints or inland channel endpoints to the practical shoreline or breakwater opening when the evidence supports it. "
                            "use general geographic knowledge only when confidence is medium or high. Reject candidates that do not represent "
                            "the requested place or feature, even if they are the only candidates.\n\n"
                            f"{instructions}"
                        ),
                    }
                ],
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": json.dumps(
                            {
                                "request_context": request_context,
                                "search_plan": plan,
                                "candidates": candidates,
                                "proposed_selection": selected,
                            },
                            ensure_ascii=True,
                        ),
                    }
                ],
            },
        ],
        "text": {"format": {"type": "json_schema", "name": "geo_center_audit", "schema": schema, "strict": True}},
    }
    try:
        data = call_openai_for_role(payload, os.environ["OPENAI_API_KEY"], "geographic")
        return json.loads(extract_response_text(data))
    except Exception:
        return None


def resolve_geographic_center_from_text_with_llm(request_context: dict[str, Any], plan: dict[str, Any] | None = None) -> dict[str, Any] | None:
    schema = geo_selection_schema()
    instructions = load_geographic_resolution_instructions()
    payload = {
        "model": model_for("geographic"),
        "input": [
            {
                "role": "developer",
                "content": [
                    {
                        "type": "input_text",
                        "text": (
                            "Resolve the requested DEM center directly from the natural-language place, event, or target-feature description. "
                            "Use your geographic knowledge when the request identifies a well-known feature or when map candidates were unavailable or insufficient. "
                            "Return a practical WGS84 lon/lat for centering a DEM grid. If you are not at least medium-confidence, return can_resolve=false.\n\n"
                            f"{instructions}"
                        ),
                    }
                ],
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": json.dumps({"request_context": request_context, "search_plan": plan or {}}, ensure_ascii=True),
                    }
                ],
            },
        ],
        "text": {"format": {"type": "json_schema", "name": "geo_center_text_resolution", "schema": schema, "strict": True}},
    }
    try:
        data = call_openai_for_role(payload, os.environ["OPENAI_API_KEY"], "geographic")
        selected = json.loads(extract_response_text(data))
        if selected.get("can_resolve") and selected.get("lon") is not None and selected.get("lat") is not None:
            return {
                "lon": float(selected["lon"]),
                "lat": float(selected["lat"]),
                "label": selected.get("label") or request_context.get("center_description") or request_context.get("location"),
                "source": "llm_text_georesolver",
                "confidence": selected.get("confidence"),
                "reason": selected.get("reason"),
                "search_plan": plan or {},
                "needs_geographic_review": True,
                "review_reason": "Resolved from LLM text reasoning without accepted map/geocoder grounding.",
            }
    except Exception:
        return None
    return None


def geo_selection_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "can_resolve": {"type": "boolean"},
            "lon": {"type": ["number", "null"]},
            "lat": {"type": ["number", "null"]},
            "label": {"type": ["string", "null"]},
            "candidate_index": {"type": ["integer", "null"]},
            "confidence": {"type": "string", "enum": ["low", "medium", "high"]},
            "reason": {"type": "string"},
        },
        "required": ["can_resolve", "lon", "lat", "label", "candidate_index", "confidence", "reason"],
        "additionalProperties": False,
    }


def load_geographic_resolution_instructions() -> str:
    path = ROOT / "docs" / "geographic_resolution.md"
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8")
