from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

from agent.config import ROOT
from agent.celeris.request import merge_celeris_config, merge_initial_condition
from agent.openai_client import call_openai_for_role, extract_response_text, model_for
from agent.prompt_policy import direct_answer_scope_policy


def answer_direct_question_with_research(
    job_dir: Path,
    message: str,
    state: dict[str, Any],
    turn_plan: dict[str, Any] | None = None,
) -> dict[str, Any]:
    usgs_evidence = deterministic_usgs_earthquake_evidence(message)
    if usgs_evidence.get("status") == "resolved" and usgs_evidence.get("finite_fault"):
        return deterministic_usgs_research_response(usgs_evidence)

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return {
            "mode": "fallback",
            "answer": (turn_plan or {}).get("answer") or "I can answer that after an OpenAI API key is configured for online research.",
        }

    prompt = {
        "current_user_message": message,
        "workflow_state": state.get("workflow_state"),
        "dem_request": compact_state_value(state.get("dem_request")),
        "celeris_config": compact_state_value(state.get("celeris_config")),
        "recent_transcript": read_recent_transcript(job_dir),
        "orchestrator_plan": compact_state_value(turn_plan or {}),
        "deterministic_usgs_evidence": usgs_evidence,
        "local_celeris_usage_notes": load_local_celeris_usage_notes(),
    }
    payload = {
        "model": model_for("specialist"),
        "tools": [{"type": "web_search"}],
        "tool_choice": "auto",
        "input": [
            {
                "role": "developer",
                "content": [
                    {
                        "type": "input_text",
                        "text": (
                            "You answer direct user questions inside a conversational CELERIS setup agent. "
                            f"{direct_answer_scope_policy()} "
                            "When the user asks to find, look up, retrieve, determine, fill in, verify, or update unknown information from online sources, "
                            "use web search and cite authoritative evidence. This is a general research capability, not an earthquake-specific tool. "
                            "For questions about how to use local CELERIS controls, answer from local_celeris_usage_notes when relevant and do not use web search. "
                            "By default, keep direct answers to about 10 lines or less unless the user asks for more detail. "
                            "For parameter-finding requests, return a concise summary plus a structured list of usable parameter values when available. "
                            "Include units, source names, URLs, and uncertainty or missing fields. Prefer authoritative primary sources such as USGS, NOAA, "
                            "government agencies, journal/data repositories, or official product pages. "
                            "If the user has not identified a specific event, station, dataset, product, or other target and none is clear from job state, "
                            "do not choose an arbitrary online example as if it were the requested target. Instead explain the authoritative sources and fields, "
                            "then ask for the identifier/name/date/location needed to retrieve actual values. "
                            "When deterministic_usgs_evidence is present and has status='resolved', use it as primary structured evidence. "
                            "For USGS earthquake source extraction, a complete CELERIS initial_condition should use finite-fault model geometry when available. "
                            "If the finite-fault product provides model strike/dip/rake, map those directly. Do not map model length/width directly to rupture dimensions; use deterministic effective rupture dimensions when available. "
                            "For a single-uniform-slip Okada approximation, prefer the deterministic finite_fault.uniform_moment_equivalent_slip_m field for slip_m, "
                            "and mention USGS maximum_slip_m separately in notes. "
                            "Do not claim that a workflow was executed, do not modify job state, and do not invent parameters that are not supported by evidence. "
                            "If the findings can be applied to a later DEM/config/runtime workflow, end with a short sentence describing the next command the user could give. "
                            "Return the human answer and any extracted values in the required structured schema.\n\n"
                            f"{load_research_instructions()}"
                        ),
                    }
                ],
            },
            {"role": "user", "content": [{"type": "input_text", "text": json.dumps(prompt, ensure_ascii=True)}]},
        ],
        "text": {"format": {"type": "json_schema", "name": "direct_research_answer", "schema": research_schema(), "strict": True}},
    }
    try:
        data = call_openai_for_role(payload, api_key, "specialist", timeout=90)
        parsed = json.loads(extract_response_text(data))
        return {
            "mode": "openai_web_research",
            "model": data.get("_celeris_model", model_for("specialist")),
            "response_id": data.get("id"),
            "answer": str(parsed.get("answer") or "").strip(),
            "extracted_parameters": parsed.get("extracted_parameters") or [],
            "proposed_patch": normalize_proposed_patch(parsed.get("proposed_patch") or {}),
            "missing_fields": parsed.get("missing_fields") or [],
            "sources": parsed.get("sources") or [],
        }
    except Exception as exc:
        fallback = (turn_plan or {}).get("answer")
        return {
            "mode": "error_fallback",
            "error": str(exc),
            "answer": fallback or f"I could not complete the online research call: {exc}",
        }

def research_schema() -> dict[str, Any]:
    nullable_number = {"type": ["number", "null"]}
    nullable_string = {"type": ["string", "null"]}
    initial_condition_patch = {
        "type": "object",
        "properties": {
            "type": nullable_string,
            "enabled": {"type": ["boolean", "null"]},
            "source_model": nullable_string,
            "event_name": nullable_string,
            "center_lon": nullable_number,
            "center_lat": nullable_number,
            "coordinate_reference": nullable_string,
            "depth_km": nullable_number,
            "strike_deg": nullable_number,
            "dip_deg": nullable_number,
            "rake_deg": nullable_number,
            "length_km": nullable_number,
            "width_km": nullable_number,
            "slip_m": nullable_number,
            "magnitude_mw": nullable_number,
            "rigidity_pa": nullable_number,
            "poisson_ratio": nullable_number,
            "finite_fault": {
                "type": "object",
                "properties": {
                    "available": {"type": ["boolean", "null"]},
                    "selection": nullable_string,
                    "source": nullable_string,
                    "url": nullable_string,
                    "surface_deformation_url": nullable_string,
                    "event_id": nullable_string,
                    "product_code": nullable_string,
                    "review_status": nullable_string,
                    "subfault_count": {"type": ["integer", "null"]},
                    "slip_count": {"type": ["integer", "null"]},
                    "subfault_length_km": nullable_number,
                    "subfault_width_km": nullable_number,
                    "maximum_slip_m": nullable_number,
                },
                "required": [
                    "available",
                    "selection",
                    "source",
                    "url",
                    "surface_deformation_url",
                    "event_id",
                    "product_code",
                    "review_status",
                    "subfault_count",
                    "slip_count",
                    "subfault_length_km",
                    "subfault_width_km",
                    "maximum_slip_m",
                ],
                "additionalProperties": False,
            },
            "notes": {"type": "array", "items": {"type": "string"}},
        },
        "required": [
            "type",
            "enabled",
            "source_model",
            "event_name",
            "center_lon",
            "center_lat",
            "coordinate_reference",
            "depth_km",
            "strike_deg",
            "dip_deg",
            "rake_deg",
            "length_km",
            "width_km",
            "slip_m",
            "magnitude_mw",
            "rigidity_pa",
            "poisson_ratio",
            "finite_fault",
            "notes",
        ],
        "additionalProperties": False,
    }
    return {
        "type": "object",
        "properties": {
            "answer": {"type": "string"},
            "extracted_parameters": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "label": {"type": "string"},
                        "target_path": nullable_string,
                        "value": nullable_string,
                        "units": nullable_string,
                        "source_name": nullable_string,
                        "source_url": nullable_string,
                        "confidence": {"type": "string", "enum": ["none", "low", "medium", "high"]},
                        "notes": {"type": "string"},
                    },
                    "required": ["label", "target_path", "value", "units", "source_name", "source_url", "confidence", "notes"],
                    "additionalProperties": False,
                },
            },
            "proposed_patch": {
                "type": "object",
                "properties": {
                    "target": {"type": "string", "enum": ["none", "celeris_config.initial_condition"]},
                    "confidence": {"type": "string", "enum": ["none", "low", "medium", "high"]},
                    "initial_condition": initial_condition_patch,
                    "apply_summary": {"type": "string"},
                },
                "required": ["target", "confidence", "initial_condition", "apply_summary"],
                "additionalProperties": False,
            },
            "missing_fields": {"type": "array", "items": {"type": "string"}},
            "sources": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "url": {"type": ["string", "null"]},
                        "fields": {"type": "array", "items": {"type": "string"}},
                    },
                    "required": ["name", "url", "fields"],
                    "additionalProperties": False,
                },
            },
        },
        "required": ["answer", "extracted_parameters", "proposed_patch", "missing_fields", "sources"],
        "additionalProperties": False,
    }


def normalize_proposed_patch(value: dict[str, Any]) -> dict[str, Any]:
    target = value.get("target") if isinstance(value, dict) else "none"
    confidence = value.get("confidence") if isinstance(value, dict) else "none"
    initial_condition = value.get("initial_condition") if isinstance(value, dict) else {}
    patch = {
        key: item
        for key, item in (initial_condition or {}).items()
        if item not in (None, "", [], {}) and key
    }
    if target != "celeris_config.initial_condition" or not patch:
        return {"target": "none", "confidence": "none", "initial_condition": {}, "apply_summary": ""}
    patch["enabled"] = True
    patch["type"] = "earthquake_okada"
    return {
        "target": "celeris_config.initial_condition",
        "confidence": confidence if confidence in {"low", "medium", "high"} else "low",
        "initial_condition": patch,
        "apply_summary": value.get("apply_summary") or "Apply researched parameters to the earthquake initial condition.",
    }


def apply_research_patch_to_celeris_config(config: dict[str, Any], state: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any] | None]:
    research = state.get("last_research") or {}
    patch_info = research.get("proposed_patch") or {}
    if patch_info.get("target") != "celeris_config.initial_condition":
        return config, None
    patch = patch_info.get("initial_condition") or {}
    if not patch:
        return config, None
    prior_initial_condition = ((state.get("celeris_config") or {}).get("initial_condition") or {})
    prior_finite_fault = prior_initial_condition.get("finite_fault") or {}
    prior_selection = prior_finite_fault.get("selection") if prior_finite_fault.get("selection") in {"finite_fault", "single_rectangle"} else None
    prior_source_model = prior_initial_condition.get("source_model") if prior_initial_condition.get("source_model") in {"single_rectangle", "usgs_finite_fault"} else None
    current_initial_condition = config.get("initial_condition") or {}
    current_finite_fault = current_initial_condition.get("finite_fault") or {}
    current_selection = current_finite_fault.get("selection") if current_finite_fault.get("selection") in {"finite_fault", "single_rectangle"} else None
    current_source_model = current_initial_condition.get("source_model") if current_initial_condition.get("source_model") in {"single_rectangle", "usgs_finite_fault"} else None
    preserve_source_choice = state.get("workflow_state") == "needs_initial_condition_source_choice" or bool(prior_selection) or bool(current_selection)
    explicit_source_model = (
        (current_source_model or prior_source_model)
        if preserve_source_choice
        else None
    )
    explicit_selection = (
        (current_selection or prior_selection)
        if preserve_source_choice
        else None
    )
    merged_config = merge_celeris_config(config, {"initial_condition": merge_initial_condition(config.get("initial_condition"), patch)})
    if explicit_selection:
        merged_config["initial_condition"]["finite_fault"]["selection"] = explicit_selection
    if explicit_source_model:
        merged_config["initial_condition"]["source_model"] = explicit_source_model
    if explicit_selection == "finite_fault":
        merged_config["initial_condition"]["source_model"] = "usgs_finite_fault"
    elif explicit_selection == "single_rectangle":
        merged_config["initial_condition"]["source_model"] = "single_rectangle"
    return merged_config, {
        "target": patch_info.get("target"),
        "confidence": patch_info.get("confidence"),
        "applied_fields": sorted(patch.keys()),
        "apply_summary": patch_info.get("apply_summary"),
    }


def load_research_instructions() -> str:
    parts = []
    for path in (ROOT / "docs" / "earthquake_parameter_extraction.md",):
        if path.exists():
            parts.append(f"## {path.name}\n{path.read_text(encoding='utf-8')}")
    return "\n\n".join(parts)


def load_local_celeris_usage_notes() -> str:
    parts = []
    for path in (
        ROOT / "docs" / "source" / "root_celeris_main_js.md",
        ROOT / "docs" / "celeris_runtime_controls.md",
    ):
        if path.exists():
            parts.append(f"## {path.name}\n{path.read_text(encoding='utf-8')}")
    return "\n\n".join(parts)


def compact_state_value(value: Any, max_chars: int = 2500) -> Any:
    if isinstance(value, str):
        return value if len(value) <= max_chars else f"{value[:max_chars]}..."
    if isinstance(value, list):
        return [compact_state_value(item, max_chars=max_chars) for item in value[:20]]
    if isinstance(value, dict):
        return {str(key): compact_state_value(item, max_chars=max_chars) for key, item in list(value.items())[:40]}
    return value


def read_recent_transcript(job_dir: Path, limit: int = 8) -> str:
    path = job_dir / "transcript.jsonl"
    if not path.exists():
        return ""
    rendered = []
    for line in path.read_text(encoding="utf-8").splitlines()[-limit:]:
        try:
            item = json.loads(line)
            rendered.append(f"{item.get('role')}: {item.get('text')}")
        except Exception:
            continue
    return "\n".join(rendered)


def deterministic_usgs_earthquake_evidence(message: str) -> dict[str, Any]:
    lower = (message or "").lower()
    if not any(term in lower for term in ("earthquake", "usgs", "moment tensor", "finite fault", "fault")):
        return {"status": "not_applicable"}
    event_id = usgs_event_id_from_text(message)
    if not event_id:
        event_id = search_usgs_event_id(message)
    if not event_id:
        return {"status": "event_not_resolved"}
    try:
        return extract_usgs_event_products(event_id)
    except Exception as exc:
        return {"status": "error", "event_id": event_id, "error": str(exc)}


def deterministic_usgs_research_response(evidence: dict[str, Any]) -> dict[str, Any]:
    event = evidence.get("event") or {}
    finite = evidence.get("finite_fault") or {}
    moment = evidence.get("moment_tensor") or {}
    event_id = evidence.get("event_id")
    event_url = evidence.get("event_url")
    ff_urls = finite.get("content_urls") or {}
    source_url = event_url or f"https://earthquake.usgs.gov/earthquakes/eventpage/{event_id}"
    finite_url = ff_urls.get("FFM.geojson") or source_url
    title = event.get("title") or event.get("place") or f"USGS event {event_id}"
    magnitude = finite.get("derived_magnitude") or event.get("magnitude")
    model_length_km = finite.get("model_length_km")
    model_width_km = finite.get("model_width_km")
    length_km = finite.get("effective_rupture_length_km") or model_length_km
    width_km = finite.get("effective_rupture_width_km") or model_width_km
    slip_m = finite.get("uniform_moment_equivalent_slip_m")
    max_slip_m = finite.get("maximum_slip_m")
    ffm = finite.get("ffm_geojson_summary") or {}
    patch = {
        "type": "earthquake_okada",
        "enabled": True,
        "source_model": "single_rectangle",
        "event_name": f"{title} ({event_id})",
        "center_lon": event.get("longitude"),
        "center_lat": event.get("latitude"),
        "coordinate_reference": "hypocenter",
        "depth_km": event.get("depth_km"),
        "strike_deg": finite.get("model_strike_deg"),
        "dip_deg": finite.get("model_dip_deg"),
        "rake_deg": finite.get("model_rake_deg"),
        "length_km": length_km,
        "width_km": width_km,
        "slip_m": slip_m,
        "magnitude_mw": magnitude,
        "rigidity_pa": finite.get("rigidity_pa_assumed_for_uniform_slip"),
        "poisson_ratio": 0.25,
        "finite_fault": {
            "available": bool(ff_urls.get("FFM.geojson")),
            "selection": "unconfirmed" if ff_urls.get("FFM.geojson") else "not_available",
            "source": "usgs_finite_fault_ffm_geojson" if ff_urls.get("FFM.geojson") else None,
            "url": ff_urls.get("FFM.geojson"),
            "surface_deformation_url": ff_urls.get("surface_deformation.disp"),
            "event_id": event_id,
            "product_code": finite.get("code"),
            "review_status": finite.get("review_status"),
            "subfault_count": ffm.get("subfault_count") if ffm else None,
            "slip_count": ffm.get("slip_count") if ffm else None,
            "subfault_length_km": (ffm.get("active_patch_10pct_max_slip") or {}).get("subfault_length_km") if ffm else None,
            "subfault_width_km": (ffm.get("active_patch_10pct_max_slip") or {}).get("subfault_width_km") if ffm else None,
            "maximum_slip_m": max_slip_m,
        },
        "notes": [
            f"USGS event ID: {event_id}",
            f"Origin time (UTC): {event.get('time_utc')}",
            f"Finite-fault product code: {finite.get('code')} ({finite.get('review_status') or 'review status not listed'}), updated {finite.get('update_time_utc')}.",
            f"Finite-fault inversion plane dimensions: {model_length_km} km by {model_width_km} km; not used directly as physical rupture length/width.",
            f"Effective rupture patch dimensions use the FFM subfault patch with slip >= 10% of maximum slip: {length_km} km by {width_km} km.",
            f"Finite-fault model top depth: {finite.get('model_top_km')} km.",
            f"USGS maximum finite-fault slip: {max_slip_m} m; CELERIS slip_m uses moment-equivalent uniform slip for the simplified rectangle.",
            f"FFM.geojson subfault slip mean: {ffm.get('slip_arithmetic_mean_m')} m across {ffm.get('slip_count')} slip cells." if ffm else "FFM.geojson subfault summary unavailable.",
        ],
    }
    extracted = [
        research_parameter("USGS event ID", None, event_id, None, "USGS ComCat event detail", source_url, "high", "Resolved from USGS event detail GeoJSON."),
        research_parameter("event_name", "celeris_config.initial_condition.event_name", title, None, "USGS ComCat event detail", source_url, "high", "USGS event title."),
        research_parameter("origin_time_utc", None, event.get("time_utc"), "UTC", "USGS ComCat event detail", source_url, "high", "USGS event origin time."),
        research_parameter("center_lat", "celeris_config.initial_condition.center_lat", event.get("latitude"), "degrees_north", "USGS ComCat event detail", source_url, "high", "Hypocenter latitude."),
        research_parameter("center_lon", "celeris_config.initial_condition.center_lon", event.get("longitude"), "degrees_east", "USGS ComCat event detail", source_url, "high", "Hypocenter longitude."),
        research_parameter("depth_km", "celeris_config.initial_condition.depth_km", event.get("depth_km"), "km", "USGS ComCat event detail", source_url, "high", "Catalog hypocenter depth."),
        research_parameter("magnitude_mw", "celeris_config.initial_condition.magnitude_mw", magnitude, "Mw", "USGS finite-fault product", finite_url, "high", "Finite-fault derived magnitude when available."),
        research_parameter("strike_deg", "celeris_config.initial_condition.strike_deg", finite.get("model_strike_deg"), "degrees", "USGS finite-fault product", finite_url, "high", "Finite-fault model strike."),
        research_parameter("dip_deg", "celeris_config.initial_condition.dip_deg", finite.get("model_dip_deg"), "degrees", "USGS finite-fault product", finite_url, "high", "Finite-fault model dip."),
        research_parameter("rake_deg", "celeris_config.initial_condition.rake_deg", finite.get("model_rake_deg"), "degrees", "USGS finite-fault product", finite_url, "high", "Finite-fault model rake."),
        research_parameter("finite_fault_model_length_km", None, model_length_km, "km", "USGS finite-fault product", finite_url, "high", "Finite-fault inversion plane length; not directly used as CELERIS rupture length."),
        research_parameter("finite_fault_model_width_km", None, model_width_km, "km", "USGS finite-fault product", finite_url, "high", "Finite-fault inversion plane width; not directly used as CELERIS rupture width."),
        research_parameter("length_km", "celeris_config.initial_condition.length_km", length_km, "km", "Derived from USGS FFM slip distribution", finite_url, "medium", "Effective slipped-patch length using cells with slip >= 10% of maximum USGS finite-fault slip."),
        research_parameter("width_km", "celeris_config.initial_condition.width_km", width_km, "km", "Derived from USGS FFM slip distribution", finite_url, "medium", "Effective slipped-patch width using cells with slip >= 10% of maximum USGS finite-fault slip."),
        research_parameter("slip_m", "celeris_config.initial_condition.slip_m", slip_m, "m", "Derived from USGS finite-fault Mw and area", finite_url, "medium", "Moment-equivalent uniform slip for a single-rectangle Okada approximation."),
        research_parameter("maximum_slip_m", None, max_slip_m, "m", "USGS finite-fault product", finite_url, "high", "USGS maximum finite-fault slip; recorded in notes, not used as uniform slip_m."),
    ]
    nodal_note = ""
    if moment:
        nodal_note = (
            f" Moment tensor nodal planes are also available: NP1 {moment.get('nodal_plane_1')}, "
            f"NP2 {moment.get('nodal_plane_2')}; finite-fault geometry is preferred for the source patch."
        )
    answer = (
        f"I resolved a complete USGS finite-fault source for **{title}** (`{event_id}`). "
        f"Catalog origin: {event.get('time_utc')}, hypocenter {event.get('latitude')} N, {event.get('longitude')} E, "
        f"depth {event.get('depth_km')} km, magnitude {event.get('magnitude')} {event.get('magnitude_type')}. "
        f"The newest USGS finite-fault product `{finite.get('code')}` is {finite.get('review_status') or 'available'} and gives "
        f"an inversion plane {model_length_km} km by {model_width_km} km, strike {finite.get('model_strike_deg')} deg, "
        f"dip {finite.get('model_dip_deg')} deg, rake {finite.get('model_rake_deg')} deg, "
        f"and maximum slip {max_slip_m} m. I did not use the full inversion plane as the physical rupture rectangle. "
        f"For CELERIS' simplified single-rectangle Okada source, I used the effective slipped patch "
        f"{length_km} km by {width_km} km from cells with slip >= 10% of maximum slip, and calculated "
        f"a moment-equivalent uniform slip of {slip_m:.3g} m from Mw {magnitude}, area {length_km} x {width_km} km, "
        f"and rigidity {finite.get('rigidity_pa_assumed_for_uniform_slip'):.3g} Pa. "
        f"The FFM grid summary has {ffm.get('subfault_count')} subfaults, arithmetic mean slip "
        f"{ffm.get('slip_arithmetic_mean_m'):.3g} m, and total moment {ffm.get('total_subfault_moment_nm'):.3g} N-m."
        f"{nodal_note}"
        f" A downloadable USGS finite-fault grid is available; when generating the tsunami initial condition, ask whether to use the finite-fault subfault solution or the simplified single-rectangle average source."
    )
    return {
        "mode": "deterministic_usgs_research",
        "model": "deterministic_usgs_products",
        "answer": answer,
        "extracted_parameters": extracted,
        "proposed_patch": {
            "target": "celeris_config.initial_condition",
            "confidence": "high",
            "initial_condition": patch,
            "apply_summary": "Apply complete USGS finite-fault source parameters to the CELERIS earthquake initial condition.",
        },
        "missing_fields": [],
        "sources": [
            {"name": "USGS ComCat event detail", "url": source_url, "fields": ["event", "origin", "products"]},
            {"name": "USGS finite-fault product", "url": finite_url, "fields": ["model geometry", "maximum slip", "FFM slip grid"]},
        ],
    }


def research_parameter(label: str, target_path: str | None, value: Any, units: str | None, source_name: str, source_url: str | None, confidence: str, notes: str) -> dict[str, Any]:
    return {
        "label": label,
        "target_path": target_path,
        "value": None if value is None else str(value),
        "units": units,
        "source_name": source_name,
        "source_url": source_url,
        "confidence": confidence,
        "notes": notes,
    }


def usgs_event_id_from_text(message: str) -> str | None:
    match = re.search(r"\b(us[0-9][a-z0-9]+)\b", message or "", flags=re.IGNORECASE)
    return match.group(1).lower() if match else None


def search_usgs_event_id(message: str) -> str | None:
    import requests
    from datetime import datetime, timedelta, timezone

    lower = (message or "").lower()
    mag_match = re.search(r"\b(?:mw|m)\s*([0-9]+(?:\.[0-9]+)?)\b", lower)
    min_mag = max(6.5, float(mag_match.group(1)) - 0.4) if mag_match else 7.0
    end = datetime.now(timezone.utc) + timedelta(days=1)
    start = end - timedelta(days=30)
    params = {
        "format": "geojson",
        "starttime": start.date().isoformat(),
        "endtime": end.date().isoformat(),
        "minmagnitude": f"{min_mag:.1f}",
        "orderby": "magnitude",
        "limit": 20,
    }
    if "philippines" in lower or "mindanao" in lower or "kablalan" in lower:
        params.update({"latitude": 12.8797, "longitude": 121.7740, "maxradiuskm": 2500})
    url = f"https://earthquake.usgs.gov/fdsnws/event/1/query?{urlencode(params)}"
    response = requests.get(url, timeout=30)
    response.raise_for_status()
    features = response.json().get("features") or []
    if not features:
        return None
    if "philippines" in lower or "mindanao" in lower or "kablalan" in lower:
        for feature in features:
            place = str((feature.get("properties") or {}).get("place") or "").lower()
            if "philippines" in place or "mindanao" in place or "kablalan" in place:
                return feature.get("id")
    return features[0].get("id")


def extract_usgs_event_products(event_id: str) -> dict[str, Any]:
    import math
    import requests

    url = f"https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&eventid={event_id}"
    response = requests.get(url, timeout=30)
    response.raise_for_status()
    data = response.json()
    properties = data.get("properties") or {}
    geometry = data.get("geometry") or {}
    coordinates = geometry.get("coordinates") or [None, None, None]
    products = properties.get("products") or {}
    finite_fault = newest_product(products.get("finite-fault") or [])
    moment_tensor = newest_product(products.get("moment-tensor") or [], prefer_code="mww")
    evidence: dict[str, Any] = {
        "status": "resolved",
        "event_id": data.get("id") or event_id,
        "event_url": f"https://earthquake.usgs.gov/earthquakes/eventpage/{event_id}",
        "event": {
            "title": properties.get("title"),
            "place": properties.get("place"),
            "time_utc": epoch_ms_to_iso(properties.get("time")),
            "longitude": coordinates[0] if len(coordinates) > 0 else None,
            "latitude": coordinates[1] if len(coordinates) > 1 else None,
            "depth_km": coordinates[2] if len(coordinates) > 2 else None,
            "magnitude": properties.get("mag"),
            "magnitude_type": properties.get("magType"),
        },
        "product_keys": sorted(products.keys()),
    }
    if moment_tensor:
        mt_props = moment_tensor.get("properties") or {}
        evidence["moment_tensor"] = {
            "source": moment_tensor.get("source"),
            "code": moment_tensor.get("code"),
            "update_time_utc": epoch_ms_to_iso(moment_tensor.get("updateTime")),
            "derived_magnitude": number_or_none(mt_props.get("derived-magnitude")),
            "derived_magnitude_type": mt_props.get("derived-magnitude-type"),
            "depth_km": number_or_none(mt_props.get("derived-depth") or mt_props.get("depth")),
            "nodal_plane_1": {
                "strike_deg": number_or_none(mt_props.get("nodal-plane-1-strike")),
                "dip_deg": number_or_none(mt_props.get("nodal-plane-1-dip")),
                "rake_deg": number_or_none(mt_props.get("nodal-plane-1-rake")),
            },
            "nodal_plane_2": {
                "strike_deg": number_or_none(mt_props.get("nodal-plane-2-strike")),
                "dip_deg": number_or_none(mt_props.get("nodal-plane-2-dip")),
                "rake_deg": number_or_none(mt_props.get("nodal-plane-2-rake")),
            },
        }
    if finite_fault:
        ff_props = finite_fault.get("properties") or {}
        length_km = number_or_none(ff_props.get("model-length"))
        width_km = number_or_none(ff_props.get("model-width"))
        mw = number_or_none(ff_props.get("derived-magnitude")) or number_or_none(properties.get("mag"))
        rigidity_pa = 30_000_000_000.0
        moment_nm = 10 ** (1.5 * mw + 9.1) if mw is not None else None
        ffm_summary = finite_fault_grid_summary(finite_fault, length_km, width_km)
        active_patch = (ffm_summary or {}).get("active_patch_10pct_max_slip") or {}
        rupture_length_km = active_patch.get("effective_length_km")
        rupture_width_km = active_patch.get("effective_width_km")
        uniform_slip_m = None
        if moment_nm is not None and rupture_length_km and rupture_width_km:
            uniform_slip_m = moment_nm / (rigidity_pa * rupture_length_km * 1000.0 * rupture_width_km * 1000.0)
        evidence["finite_fault"] = {
            "source": finite_fault.get("source"),
            "code": finite_fault.get("code"),
            "review_status": ff_props.get("review-status"),
            "update_time_utc": epoch_ms_to_iso(finite_fault.get("updateTime")),
            "derived_magnitude": mw,
            "derived_magnitude_type": ff_props.get("derived-magnitude-type"),
            "model_length_km": length_km,
            "model_width_km": width_km,
            "effective_rupture_length_km": rupture_length_km,
            "effective_rupture_width_km": rupture_width_km,
            "model_strike_deg": number_or_none(ff_props.get("model-strike")),
            "model_dip_deg": number_or_none(ff_props.get("model-dip")),
            "model_rake_deg": number_or_none(ff_props.get("model-rake")),
            "model_top_km": number_or_none(ff_props.get("model-top")),
            "maximum_slip_m": number_or_none(ff_props.get("maximum-slip")),
            "average_rupture_velocity_km_s": number_or_none(ff_props.get("average-rupture-velocity")),
            "average_rise_time_s": number_or_none(ff_props.get("average-rise-time")),
            "hypocenter_x_km": number_or_none(ff_props.get("hypocenter-x")),
            "hypocenter_z_km": number_or_none(ff_props.get("hypocenter-z")),
            "moment_nm": moment_nm,
            "rigidity_pa_assumed_for_uniform_slip": rigidity_pa,
            "uniform_moment_equivalent_slip_m": uniform_slip_m,
            "ffm_geojson_summary": ffm_summary,
            "content_urls": content_urls(finite_fault, ["FFM.geojson", "complete_inversion.fsp", "surface_deformation.disp", "slip.png", "CMTSOLUTION"]),
        }
    return evidence


def newest_product(products: list[dict[str, Any]], prefer_code: str | None = None) -> dict[str, Any] | None:
    if not products:
        return None
    ranked = list(products)
    if prefer_code:
        preferred = [item for item in ranked if prefer_code.lower() in str(item.get("code") or "").lower()]
        if preferred:
            ranked = preferred
    ranked.sort(key=lambda item: int(item.get("updateTime") or 0), reverse=True)
    return ranked[0]


def finite_fault_grid_summary(product: dict[str, Any], model_length_km: float | None = None, model_width_km: float | None = None) -> dict[str, Any] | None:
    import requests

    url = (((product.get("contents") or {}).get("FFM.geojson") or {}).get("url"))
    if not url:
        return None
    response = requests.get(url, timeout=30)
    response.raise_for_status()
    features = response.json().get("features") or []
    slips = []
    moments = []
    for feature in features:
        props = feature.get("properties") or {}
        slip = number_or_none(props.get("slip"))
        moment = number_or_none(props.get("sf_moment"))
        if slip is not None:
            slips.append(slip)
        if moment is not None:
            moments.append(moment)
    if not slips:
        return {"subfault_count": len(features), "slip_count": 0}
    summary = {
        "subfault_count": len(features),
        "slip_count": len(slips),
        "slip_min_m": min(slips),
        "slip_max_m": max(slips),
        "slip_arithmetic_mean_m": sum(slips) / len(slips),
        "total_subfault_moment_nm": sum(moments) if moments else None,
    }
    active_patch = active_patch_summary(features, slips, moments, model_length_km, model_width_km)
    if active_patch:
        summary["active_patch_10pct_max_slip"] = active_patch
    return summary


def active_patch_summary(
    features: list[dict[str, Any]],
    slips: list[float],
    moments: list[float],
    model_length_km: float | None,
    model_width_km: float | None,
) -> dict[str, Any] | None:
    if not features or not slips or not model_length_km or not model_width_km:
        return None
    nx, nz = infer_subfault_grid_shape(len(features), model_length_km, model_width_km)
    if nx <= 0 or nz <= 0:
        return None
    threshold = 0.10 * max(slips)
    active = [index for index, slip in enumerate(slips) if slip >= threshold]
    if not active:
        return None
    cols = [index % nx for index in active]
    rows = [index // nx for index in active]
    dx = float(model_length_km) / nx
    dz = float(model_width_km) / nz
    total_moment = sum(moments) if moments else None
    active_moment = sum(moments[index] for index in active) if moments and len(moments) == len(features) else None
    return {
        "definition": "Bounding subfault-index patch for cells with slip >= 10% of maximum USGS finite-fault slip.",
        "threshold_slip_m": threshold,
        "active_subfault_count": len(active),
        "nx": nx,
        "nz": nz,
        "subfault_length_km": dx,
        "subfault_width_km": dz,
        "effective_length_km": (max(cols) - min(cols) + 1) * dx,
        "effective_width_km": (max(rows) - min(rows) + 1) * dz,
        "moment_fraction": active_moment / total_moment if active_moment is not None and total_moment else None,
    }


def infer_subfault_grid_shape(count: int, model_length_km: float, model_width_km: float) -> tuple[int, int]:
    pairs = []
    for nx in range(1, count + 1):
        if count % nx == 0:
            nz = count // nx
            pairs.append((nx, nz))
    if not pairs:
        return 0, 0
    return min(
        pairs,
        key=lambda pair: (
            abs((float(model_length_km) / pair[0]) - (float(model_width_km) / pair[1])),
            abs(pair[0] - pair[1]),
        ),
    )


def content_urls(product: dict[str, Any], names: list[str]) -> dict[str, str]:
    contents = product.get("contents") or {}
    urls = {}
    for name in names:
        url = (contents.get(name) or {}).get("url")
        if url:
            urls[name] = url
    return urls


def epoch_ms_to_iso(value: Any) -> str | None:
    if value is None:
        return None
    from datetime import datetime, timezone

    return datetime.fromtimestamp(float(value) / 1000.0, tz=timezone.utc).isoformat()


def number_or_none(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None
