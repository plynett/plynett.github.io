from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from agent.chat_state import (
    dem_patch_has_content,
    dem_request_patch_schema,
    empty_dem_request,
    infer_dem_request_patch,
    infer_options,
    message_mentions_dem_workflow,
    workflow_hooks_schema,
)
from agent.chat_utils import find_url
from agent.celeris.request import (
    celeris_config_schema,
    default_celeris_config,
    infer_celeris_config,
    message_mentions_celeris_config,
)
from agent.celeris.runtime_controls import normalize_runtime_commands, runtime_command_schema
from agent.config import ROOT
from agent.openai_client import call_openai_for_role, extract_response_text, model_for
from agent.registry import load_registry
from agent.research_context import state_for_planning


def plan_chat_action(message: str, attachments: list[Path], state: dict[str, Any], job_dir: Path) -> dict[str, Any]:
    api_key = os.environ.get("OPENAI_API_KEY")
    model = model_for("specialist")
    planning_state = state_for_planning(message, state)
    if not api_key:
        action = choose_action(message, attachments)
        action["options"] = infer_options(message)
        action["dem_request_patch"] = infer_dem_request_patch(message)
        action["celeris_config"] = infer_celeris_config(message, planning_state.get("celeris_config"))
        action["missing_information"] = []
        action["workflow_hooks"] = []
        action["runtime_commands"] = []
        action["workflow_sequence"] = infer_workflow_sequence(message, action["type"])
        action["planner"] = {"mode": "heuristic", "model": None}
        return action

    schema = chat_action_schema()
    attachment_names = [p.name for p in attachments]
    registry = load_registry()
    prompt_docs = load_prompt_docs()
    transcript = read_recent_transcript(job_dir)
    payload = {
        "model": model,
        "input": [
            {
                "role": "developer",
                "content": [
                    {
                        "type": "input_text",
                        "text": (
                            "You route a CELERIS voice/text-to-simulation chat turn through a controlled script graph. "
                            "Follow the local project instructions below. Return only the structured action. "
                            "The current user message is the authoritative natural-language input; preserve the user's full geographic intent "
                            "in the structured output without collapsing it to a generic place label. "
                            "For relative edits like shifting, resizing, source switching, or rerunning with the same AOI, "
                            "use workflow_hooks so deterministic local code applies the change before source retrieval. "
                            "Use set_aoi_bbox_wgs84 when the user explicitly provides or corrects final grid bounds. "
                            "When the user describes a geographic target in natural language, preserve that target in "
                            "location and center_description so the geographic-resolution node can resolve it. Do not merely rerun retrieval "
                            "when the user says the current domain is spatially wrong. "
                            "If current structured research state contains relevant coordinates or source parameters, use that state when the "
                            "current user message asks for it; do not require deterministic scripts to infer that relationship from generic words. "
                            "When you choose to use structured research coordinates, copy the numeric longitude/latitude exactly into "
                            "center_lon and center_lat. Do not round them, replace them with an event-region centroid, or infer a new point "
                            "unless the user explicitly asks for a different reference point. "
                            "For quantified offsets like '100 m offshore', keep the AOI anchored to the named feature and "
                            "apply only that approximate offset seaward. A 1 km coastal box centered 100 m offshore should "
                            "usually still include shoreline or harbor structures unless the user explicitly asks for an offshore-only domain. "
                            "Use set_domain_extents_m when the user conversationally defines final grid extents, such as "
                            "'set the north edge 500 m from the inlet and south edge 300 m from it'. Use extend_domain_m only when the user clearly "
                            "means add/grow beyond the current boundary by that amount. "
                            "For CELERIS input/config generation, return a complete celeris_config object every turn by merging "
                            "the user's latest request with the current celeris_config state and documented defaults. "
                            "Also populate celeris_config_explicit_fields with only the CELERIS config fields the user explicitly "
                            "specified in the current message. Include dx and/or dy only when the user explicitly gives CELERIS "
                            "grid spacing, model resolution, or directional grid spacing in the current message. Do not mark dx/dy "
                            "explicit just because defaults or prior state provide values. "
                            "When the user requests startup visualization settings while generating CELERIS inputs/config files "
                            "and the simulation is not already running, put those settings into celeris_config and mark the matching "
                            "fields explicit. For example, 'initial colorscale from -0.5 to 0.5' means colorVal_min=-0.5 and "
                            "colorVal_max=0.5; colormap requests map to colorMap_choice; plot-property requests map to surfaceToPlot; "
                            "arrow, overlay, logo, and view-mode startup requests map to their same config property names. "
                            "For earthquake or tsunami initial-condition requests, set celeris_config.initial_condition.enabled=true "
                            "and type='earthquake_okada'. If the user omits parameters, use the documented large subduction-zone defaults: "
                            "depth_km=15, dip_deg=10, rake_deg=90, length_km=400, width_km=150, slip_m=10, "
                            "rigidity_pa=30000000000, poisson_ratio=0.25. Preserve any user-provided strike, center, magnitude, "
                            "or event name. If the user does not specify an earthquake center, leave center_lon/center_lat null so "
                            "the deterministic generator can use the current DEM/domain center. "
                            "When structured research state says a finite-fault grid is available and selection is unconfirmed, "
                            "preserve that metadata. If the user chooses the finite-fault solution, set "
                            "celeris_config.initial_condition.source_model='usgs_finite_fault' and finite_fault.selection='finite_fault'. "
                            "If the user chooses the simple/single-rectangle/average source, set source_model='single_rectangle' "
                            "and finite_fault.selection='single_rectangle'. "
                            "For requests containing multiple stages, populate workflow_sequence in the order the deterministic graph should run. "
                            "For example, if the user asks to create a DEM and then create CELERIS inputs, return type=source_plan and "
                            "workflow_sequence=['dem_retrieval','celeris_config_generation']; do not collapse the request to only one stage. "
                            "When the user explicitly names a public gridded source such as ETOPO, NOAA CRM, CUDEM, or NOAA DEM Global Mosaic, preserve that specific "
                            "source in dem_request_patch.preferred_sources and any set_preferred_sources hook; do not collapse a named "
                            "source to the generic public_noaa_gridded fallback. "
                            "If the user asks for config.json, bathy.txt, waves.txt, CELERIS inputs, or wave setup, choose "
                            "generate_celeris_config only when a DEM already exists or the user is not also asking to create/retrieve a DEM. "
                            "For DEM domain sizes expressed in degrees, such as '3 degrees on a side' or '2 deg by 1 deg', "
                            "do not convert them to meters in the planner. Set domain_width_deg for longitude span and "
                            "domain_height_deg for latitude span. Deterministic AOI code will build the exact WGS84 bbox "
                            "from the resolved center and then derive approximate meter dimensions for source extraction. "
                            "Use domain_width_m/domain_height_m only for meter, kilometer, foot, or mile-sized Cartesian domains. "
                            "If the user asks to run, launch, start, or execute the simulation after CELERIS inputs exist, choose "
                            "run_celeris_simulation with workflow_sequence=['celeris_simulation_launch']. "
                            "If the user asks to stop, close, hide, or remove the embedded simulation runner/panel, choose "
                            "stop_celeris_simulation with workflow_sequence=['celeris_simulation_stop']. "
                            "If the user asks to close, hide, remove, clear, disable, or turn off a time-series plot, gauge, probe, or sensor while a simulation is running, choose "
                            "control_running_simulation with workflow_sequence=['celeris_runtime_control']; do not choose stop_celeris_simulation unless the embedded runner/panel/canvas itself is the object. "
                            "If the user asks to run, load, or start a built-in CELERIS example, choose control_running_simulation "
                            "with workflow_sequence=['celeris_runtime_control'] and return an examples.run_example runtime command. "
                            "If no specific example is named, choose ventura_harbor_ca_wind_waves as the default first-dropdown example. "
                            "If the user asks to change the visualization or controls of the already-running embedded simulation, choose "
                            "control_running_simulation with workflow_sequence=['celeris_runtime_control'] and return runtime_commands from the documented runtime controls. "
                            "For an already-running simulation, if the user asks to add a linear structure such as a breakwater, dune, seawall, levee, berm, or revetment "
                            "but omits crest elevation, crest width, or side slope, return control_running_simulation with no runtime_commands and set missing_information "
                            "to: To add a structure, I need crest elevation, crest width, and side slope - for example \"add a breakwater with crest elevation of 1m, crest width of 2 m, and side slope of 1/2\". "
                            "Only for an already-running simulation, if the user asks to modify/change/edit bathy/topo/DEM, bottom friction, passive tracer/contaminant/pollution sources, "
                            "or water/free-surface elevation, use the mods-container runtime controls unless the user explicitly asks for a replacement DEM from a new location, dataset, upload, or URL. "
                            "Only for an already-running simulation, if the user asks to turn sediment transport on/off or change sediment D50, porosity, specific gravity, erosion psi, or critical Shields, use sediment-container runtime controls. "
                            "Only for an already-running simulation, if the user asks to add, move, place, configure, close, hide, remove, clear, disable, turn off, or plot time series, wave gauges, gauges, probes, sensors, or time-series duration, use time-series-container runtime controls. "
                            "Generic requests such as 'modify the DEM' or 'change the DEM' should default to editing the current Bathymetry/Topography surface, with optional values left null, only when a runner is active. "
                            "When no simulation is running, generic DEM change requests should stay in the DEM workflow and request or use replacement DEM source details. "
                            "Return mods.prepare_click_edit first so the backend can show and confirm the surface, change mode, amount/value, and lengthscale before enabling edits. "
                            "When the user explicitly confirms the prepared edit values or asks to activate/enable/start the prepared edit, return mods.activate_click_edit; omitted values will be filled from pending state. "
                            "Do not treat a repeated request like 'modify the DEM' or 'change the DEM' as confirmation; prepare or refresh the pending edit instead. "
                            "The user must provide wave direction before files are generated only when incident wave forcing is enabled. "
                            "If the user asks for no incident waves, no incoming waves, a tsunami initial-value run without boundary forcing, "
                            "or otherwise indicates that waves should not be loaded from a boundary, set incident_wave_forcing=false, leave "
                            "wave_boundary/Thetap/wave_direction fields null, and use sponge layers unless the user explicitly overrides boundary types. "
                            "Do not ask for wave direction in that no-incident-wave case. "
                            "Use the CELERIS direction convention: Thetap=0 from west, 90 from south, 180 from east, 270 from north. "
                            "Set exactly one *_boundary_type to 2 for the incoming wave boundary, and set all other boundaries to 0 unless the user explicitly overrides them.\n\n"
                            f"{prompt_docs}\n\n"
                            f"Script registry:\n{registry}"
                        ),
                    }
                ],
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": (
                            f"Current user message: {message}\n"
                            f"Attachments: {attachment_names}\n"
                            f"Current workflow state: {planning_state.get('workflow_state')}\n"
                            f"Accumulated DEM request state: {planning_state.get('dem_request') or empty_dem_request()}\n"
                            f"Accumulated CELERIS config state: {planning_state.get('celeris_config') or default_celeris_config()}\n"
                            f"Pending mods click-edit state: {planning_state.get('pending_mods_edit') or {}}\n"
                            f"Structured research state: {planning_state.get('last_research') or {}}\n"
                            f"Structured research hidden: {planning_state.get('last_research_hidden') or {}}\n"
                            f"Recent transcript:\n{transcript}\n"
                            "Return the structured action."
                        ),
                    }
                ],
            },
        ],
        "text": {"format": {"type": "json_schema", "name": "celeris_chat_action", "schema": schema, "strict": True}},
    }
    try:
        data = call_openai_for_role(payload, api_key, "specialist")
        action = json.loads(extract_response_text(data))
        action.setdefault("celeris_config", default_celeris_config())
        action["runtime_commands"] = normalize_runtime_commands(action.get("runtime_commands") or [])
        action["workflow_sequence"] = normalize_workflow_sequence(action.get("workflow_sequence"), message, action.get("type"))
        action["celeris_config_explicit_fields"] = normalize_celeris_explicit_fields(action.get("celeris_config_explicit_fields"))
        action["planner"] = {"mode": "openai", "model": data.get("_celeris_model", model), "response_id": data.get("id"), "reason": action.get("brief_reason")}
        if action["type"] == "normalize_url" and not action.get("url"):
            fallback_url = find_url(message)
            if fallback_url:
                action["url"] = fallback_url
        maybe_complete_area_aoi(api_key, data.get("_celeris_model", model), message, planning_state, action)
        maybe_complete_finite_fault_source_choice(api_key, data.get("_celeris_model", model), message, planning_state, action, job_dir)
        return action
    except Exception as exc:
        action = choose_action(message, attachments)
        action["options"] = infer_options(message)
        action["dem_request_patch"] = infer_dem_request_patch(message)
        action["celeris_config"] = infer_celeris_config(message, planning_state.get("celeris_config"))
        action["missing_information"] = []
        action["workflow_hooks"] = []
        action["runtime_commands"] = []
        action["workflow_sequence"] = infer_workflow_sequence(message, action["type"])
        action["celeris_config_explicit_fields"] = []
        action["planner"] = {"mode": "heuristic_fallback", "model": model, "error": str(exc)}
        return action


def normalize_action_for_context(action: dict[str, Any], message: str, attachments: list[Path], state: dict[str, Any] | None = None) -> dict[str, Any]:
    if attachments:
        action["type"] = "normalize_attachments"
        action["workflow_sequence"] = ["dem_intake"]
        return action
    url = find_url(message)
    if url:
        action["type"] = "normalize_url"
        action["url"] = action.get("url") or url
        action["workflow_sequence"] = ["dem_intake"]
        return action
    action["workflow_sequence"] = normalize_workflow_sequence(action.get("workflow_sequence"), message, action.get("type"))
    action["runtime_commands"] = normalize_runtime_commands(action.get("runtime_commands") or [])
    action["celeris_config_explicit_fields"] = normalize_celeris_explicit_fields(action.get("celeris_config_explicit_fields"))
    if "celeris_simulation_stop" in action["workflow_sequence"] or message_mentions_celeris_stop(message):
        action["type"] = "stop_celeris_simulation"
        action["workflow_sequence"] = ["celeris_simulation_stop"]
        planner = action.get("planner") or {}
        planner["action_guard"] = "celeris_stop"
        action["planner"] = planner
        return action
    if action.get("type") == "control_running_simulation":
        action["workflow_sequence"] = ["celeris_runtime_control"]
        return action
    if "celeris_config_generation" in action["workflow_sequence"]:
        action["celeris_config"] = infer_celeris_config(
            message,
            action.get("celeris_config") or (state or {}).get("celeris_config"),
        )
    if action.get("type") == "source_plan" and message_prefers_celeris_config(message):
        action["type"] = "generate_celeris_config"
        action["celeris_config"] = infer_celeris_config(message, (state or {}).get("celeris_config"))
        action["workflow_sequence"] = ["celeris_config_generation"]
        planner = action.get("planner") or {}
        planner["action_guard"] = "source_plan_to_celeris_config"
        action["planner"] = planner
    if action.get("type") == "help" and message_mentions_celeris_config(message):
        action["type"] = "generate_celeris_config"
        action["celeris_config"] = infer_celeris_config(message, (state or {}).get("celeris_config"))
        action["workflow_sequence"] = ["celeris_config_generation"]
        planner = action.get("planner") or {}
        planner["action_guard"] = "help_to_celeris_config"
        action["planner"] = planner
    if action.get("type") == "help" and message_mentions_celeris_run(message):
        action["type"] = "run_celeris_simulation"
        action["workflow_sequence"] = ["celeris_simulation_launch"]
        planner = action.get("planner") or {}
        planner["action_guard"] = "help_to_celeris_launch"
        action["planner"] = planner
    if action.get("type") == "help" and message_mentions_celeris_stop(message):
        action["type"] = "stop_celeris_simulation"
        action["workflow_sequence"] = ["celeris_simulation_stop"]
        planner = action.get("planner") or {}
        planner["action_guard"] = "help_to_celeris_stop"
        action["planner"] = planner
    if action.get("type") == "help":
        patch = action.get("dem_request_patch") or {}
        if dem_patch_has_content(patch) or message_mentions_dem_workflow(message):
            action["type"] = "source_plan"
            action["source_request"] = action.get("source_request") or message
            action["workflow_sequence"] = normalize_workflow_sequence(action.get("workflow_sequence"), message, action.get("type"))
            planner = action.get("planner") or {}
            planner["action_guard"] = "help_to_source_plan"
            action["planner"] = planner
    if is_large_extraction_approval(message, state):
        action["type"] = "source_plan"
        action["source_request"] = action.get("source_request") or message
        action["workflow_sequence"] = ["dem_retrieval"]
        action.setdefault("dem_request_patch", {})
        action["dem_request_patch"]["approve_large_native_extraction"] = True
        hooks = action.setdefault("workflow_hooks", [])
        if not any(hook.get("name") == "approve_large_native_extraction" for hook in hooks):
            hooks.append(
                {
                    "name": "approve_large_native_extraction",
                    "dx_m": None,
                    "dy_m": None,
                    "north_m": None,
                    "south_m": None,
                    "east_m": None,
                    "west_m": None,
                    "bbox_wgs84": None,
                    "sources": [],
                    "reason": "User explicitly approved the large native-resolution extraction.",
                }
            )
        planner = action.get("planner") or {}
        planner["action_guard"] = "large_extraction_approval"
        action["planner"] = planner
    return action


def is_large_extraction_approval(message: str, state: dict[str, Any] | None) -> bool:
    lower = (message or "").lower()
    if not any(word in lower for word in ("approve", "approved", "confirm", "confirmed", "proceed", "go ahead", "yes")):
        return False
    if not state or state.get("workflow_state") != "needs_user_confirmation":
        return False
    retrieval = state.get("source_retrieval") or {}
    if retrieval.get("reason") == "estimated_native_grid_too_large_requires_confirmation":
        return True
    for attempt in state.get("tier_attempts") or []:
        if attempt.get("retrieval_reason") == "estimated_native_grid_too_large_requires_confirmation":
            return True
    return False


def maybe_complete_area_aoi(api_key: str, model: str, message: str, state: dict[str, Any], action: dict[str, Any]) -> None:
    if action.get("type") != "source_plan":
        return
    patch = action.get("dem_request_patch") or {}
    if has_spatial_definition(patch):
        return
    existing = state.get("dem_request") or empty_dem_request()
    if has_spatial_definition(existing):
        return
    if not (patch.get("location") or patch.get("center_description")):
        return

    schema = {
        "type": "object",
        "properties": {
            "should_set_aoi": {"type": "boolean"},
            "bbox_wgs84": {"type": ["array", "null"], "items": {"type": "number"}, "minItems": 4, "maxItems": 4},
            "label": {"type": ["string", "null"]},
            "confidence": {"type": "string", "enum": ["low", "medium", "high"]},
            "reason": {"type": "string"},
        },
        "required": ["should_set_aoi", "bbox_wgs84", "label", "confidence", "reason"],
        "additionalProperties": False,
    }
    payload = {
        "model": model,
        "tools": [{"type": "web_search"}],
        "tool_choice": "auto",
        "input": [
            {
                "role": "developer",
                "content": [
                    {
                        "type": "input_text",
                        "text": (
                            "You decide whether a DEM request with no numeric domain nevertheless defines an AOI because the user asked "
                            "to cover an entire named coastal feature, port, harbor, bay, island, facility, or geographic area. "
                            "If the user likely expects the entire named feature to be covered and you can estimate a practical WGS84 bounding box, return it. "
                            "Return bbox_wgs84 as [min_lon, min_lat, max_lon, max_lat]. Include a modest margin suitable for DEM retrieval. "
                            "Do not set an AOI for vague requests like 'near X', 'for X Harbor', or 'at X' unless the wording clearly asks to cover the whole feature. "
                            "If unsure, return should_set_aoi=false so the app can ask for dimensions."
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
                                "current_user_message": message,
                                "dem_request_patch": patch,
                                "existing_dem_request": existing,
                            },
                            ensure_ascii=True,
                        ),
                    }
                ],
            },
        ],
        "text": {"format": {"type": "json_schema", "name": "area_aoi_completion", "schema": schema, "strict": True}},
    }
    try:
        data = call_openai_for_role(payload, api_key, "specialist", timeout=60)
        result = json.loads(extract_response_text(data))
    except Exception:
        return
    bbox = result.get("bbox_wgs84")
    if not result.get("should_set_aoi") or not isinstance(bbox, list) or len(bbox) != 4:
        return
    try:
        patch["aoi_bbox_wgs84"] = [float(value) for value in bbox]
    except (TypeError, ValueError):
        return
    if result.get("label"):
        patch["center_description"] = result["label"]
    notes = patch.setdefault("notes", [])
    notes.append(f"AOI bbox inferred for whole-feature coverage: {result.get('reason')}")
    planner = action.get("planner") or {}
    planner["area_aoi_completion"] = {
        "mode": "openai_web",
        "confidence": result.get("confidence"),
        "reason": result.get("reason"),
    }
    action["planner"] = planner
    action["dem_request_patch"] = patch


def has_spatial_definition(data: dict[str, Any]) -> bool:
    if isinstance(data.get("aoi_bbox_wgs84"), list) and len(data["aoi_bbox_wgs84"]) == 4:
        return True
    return bool((data.get("domain_width_m") and data.get("domain_height_m")) or (data.get("domain_width_deg") and data.get("domain_height_deg")))


def maybe_complete_finite_fault_source_choice(api_key: str, model: str, message: str, state: dict[str, Any], action: dict[str, Any], job_dir: Path) -> None:
    current_config = action.get("celeris_config") or state.get("celeris_config") or default_celeris_config()
    initial_condition = current_config.get("initial_condition") or {}
    finite_fault = initial_condition.get("finite_fault") or {}
    if not (finite_fault.get("available") and finite_fault.get("url") and finite_fault.get("selection") == "unconfirmed"):
        return
    schema = {
        "type": "object",
        "properties": {
            "selection": {"type": "string", "enum": ["finite_fault", "single_rectangle", "unresolved"]},
            "reason": {"type": "string"},
        },
        "required": ["selection", "reason"],
        "additionalProperties": False,
    }
    payload = {
        "model": model,
        "input": [
            {
                "role": "developer",
                "content": [
                    {
                        "type": "input_text",
                        "text": (
                            "Resolve a pending CELERIS earthquake source-model confirmation. "
                            "The previous assistant question asked whether to use a downloadable USGS finite-fault subfault solution "
                            "or a simplified single-rectangle average source. Interpret the raw user reply and return only the structured choice. "
                            "Choose finite_fault when the user wants the finite-fault, subfault, gridded, detailed, or USGS solution. "
                            "Choose single_rectangle when the user wants the simple, average, rectangle, or Okada approximation. "
                            "Choose unresolved only if the reply does not answer that choice."
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
                                "current_user_message": message,
                                "pending_choice": {
                                    "finite_fault_option": finite_fault,
                                    "single_rectangle_option": {
                                        "length_km": initial_condition.get("length_km"),
                                        "width_km": initial_condition.get("width_km"),
                                        "slip_m": initial_condition.get("slip_m"),
                                    },
                                },
                                "recent_transcript": read_recent_transcript(job_dir),
                            },
                            ensure_ascii=True,
                        ),
                    }
                ],
            },
        ],
        "text": {"format": {"type": "json_schema", "name": "finite_fault_source_choice", "schema": schema, "strict": True}},
    }
    try:
        data = call_openai_for_role(payload, api_key, "specialist", timeout=45)
        result = json.loads(extract_response_text(data))
    except Exception:
        return
    selection = result.get("selection")
    if selection not in {"finite_fault", "single_rectangle"}:
        return
    config = json.loads(json.dumps(current_config))
    config.setdefault("initial_condition", default_celeris_config()["initial_condition"])
    config["initial_condition"].setdefault("finite_fault", finite_fault)
    config["initial_condition"]["finite_fault"]["selection"] = selection
    config["initial_condition"]["source_model"] = "usgs_finite_fault" if selection == "finite_fault" else "single_rectangle"
    action["type"] = "generate_celeris_config"
    action["workflow_sequence"] = ["celeris_config_generation"]
    action["celeris_config"] = config
    planner = action.get("planner") or {}
    planner["source_choice_resolver"] = {
        "mode": "openai",
        "model": data.get("_celeris_model", model),
        "response_id": data.get("id"),
        "selection": selection,
        "reason": result.get("reason"),
    }
    action["planner"] = planner


def chat_action_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "type": {"type": "string", "enum": ["normalize_attachments", "normalize_url", "source_plan", "generate_celeris_config", "run_celeris_simulation", "stop_celeris_simulation", "control_running_simulation", "help"]},
            "url": {"type": ["string", "null"]},
            "source_request": {"type": ["string", "null"]},
            "dem_request_patch": dem_request_patch_schema(),
            "celeris_config": celeris_config_schema(),
            "celeris_config_explicit_fields": {
                "type": "array",
                "items": {
                    "type": "string",
                    "enum": sorted(default_celeris_config().keys()),
                },
            },
            "workflow_sequence": {
                "type": "array",
                "items": {"type": "string", "enum": ["dem_intake", "dem_retrieval", "celeris_config_generation", "celeris_simulation_launch", "celeris_simulation_stop", "celeris_runtime_control", "help"]},
            },
            "options": {
                "type": "object",
                "properties": {
                    "sign_mode": {"type": "string", "enum": ["auto", "as_is", "invert"]},
                    "fill_nodata": {"type": "boolean"},
                    "crs_override": {"type": ["string", "null"]},
                    "vertical_datum": {"type": ["string", "null"]},
                    "z_units": {"type": ["string", "null"]},
                    "z_scale": {"type": "number"},
                    "max_cells": {"type": "integer"},
                    "variable": {"type": ["string", "null"]},
                },
                "required": ["sign_mode", "fill_nodata", "crs_override", "vertical_datum", "z_units", "z_scale", "max_cells", "variable"],
                "additionalProperties": False,
            },
            "missing_information": {"type": "array", "items": {"type": "string"}},
            "workflow_hooks": workflow_hooks_schema(),
            "runtime_commands": runtime_command_schema(),
            "assistant_intent_summary": {"type": "string"},
            "brief_reason": {"type": "string"},
        },
        "required": [
            "type",
            "url",
            "source_request",
            "dem_request_patch",
            "celeris_config",
            "celeris_config_explicit_fields",
            "workflow_sequence",
            "options",
            "missing_information",
            "workflow_hooks",
            "runtime_commands",
            "assistant_intent_summary",
            "brief_reason",
        ],
        "additionalProperties": False,
    }


def normalize_celeris_explicit_fields(value: Any) -> list[str]:
    allowed = set(default_celeris_config().keys())
    fields: list[str] = []
    for item in value or []:
        text = str(item)
        if text in allowed and text not in fields:
            fields.append(text)
    return fields


def choose_action(message: str, attachments: list[Path]) -> dict[str, str]:
    if attachments:
        return {"type": "normalize_attachments"}
    url = find_url(message)
    if url:
        return {"type": "normalize_url", "url": url}
    lower = message.lower()
    if message_mentions_celeris_stop(message):
        return {"type": "stop_celeris_simulation"}
    if message_prefers_celeris_config(message):
        return {"type": "generate_celeris_config"}
    if message_mentions_celeris_run(message):
        return {"type": "run_celeris_simulation"}
    if any(word in lower for word in ("dem", "bathy", "bathymetry", "topography", "noaa", "usgs", "gebco", "download", "retrieve", "create")):
        return {"type": "source_plan"}
    return {"type": "help"}


def normalize_workflow_sequence(value: Any, message: str, action_type: str | None) -> list[str]:
    allowed = {"dem_intake", "dem_retrieval", "celeris_config_generation", "celeris_simulation_launch", "celeris_simulation_stop", "celeris_runtime_control", "help"}
    sequence = [str(item) for item in value or [] if str(item) in allowed]
    inferred = infer_workflow_sequence(message, action_type)
    for item in inferred:
        if item not in sequence:
            sequence.append(item)
    if not sequence:
        sequence = inferred or ["help"]
    if "dem_retrieval" in sequence and "celeris_config_generation" in sequence:
        sequence = [item for item in sequence if item != "help"]
        sequence.sort(key={"dem_intake": 0, "dem_retrieval": 1, "celeris_config_generation": 2, "celeris_simulation_launch": 3, "celeris_simulation_stop": 4, "celeris_runtime_control": 5}.get)
    return sequence


def infer_workflow_sequence(message: str, action_type: str | None) -> list[str]:
    lower = (message or "").lower()
    wants_config = message_mentions_celeris_config(message)
    wants_run = message_mentions_celeris_run(message)
    wants_stop = message_mentions_celeris_stop(message)
    wants_dem = explicit_dem_retrieval_requested(lower) or (action_type == "source_plan" and not message_prefers_celeris_config(message))
    if action_type in {"normalize_attachments", "normalize_url"}:
        return ["dem_intake"]
    if action_type == "control_running_simulation":
        return ["celeris_runtime_control"]
    if action_type == "stop_celeris_simulation" or wants_stop:
        return ["celeris_simulation_stop"]
    if wants_dem and wants_config:
        return ["dem_retrieval", "celeris_config_generation"]
    if action_type == "source_plan" or wants_dem:
        return ["dem_retrieval"]
    if action_type == "generate_celeris_config" or wants_config:
        sequence = ["celeris_config_generation"]
        if wants_run:
            sequence.append("celeris_simulation_launch")
        return sequence
    if action_type == "run_celeris_simulation" or wants_run:
        return ["celeris_simulation_launch"]
    return ["help"]


def message_prefers_celeris_config(message: str) -> bool:
    if not message_mentions_celeris_config(message):
        return False
    lower = (message or "").lower()
    return not explicit_dem_retrieval_requested(lower)


def explicit_dem_retrieval_requested(lower: str) -> bool:
    return any(
        phrase in lower
        for phrase in (
            "create a dem",
            "create dem",
            "retrieve dem",
            "download dem",
            "coastal dem",
            "source dem",
            "dem of",
            "dem for",
            "bathy data",
            "bathymetry data",
        )
    )


def message_mentions_celeris_run(message: str) -> bool:
    lower = (message or "").lower()
    return "simulation" in lower and any(word in lower for word in ("run", "start", "launch", "execute"))


def message_mentions_celeris_stop(message: str) -> bool:
    lower = (message or "").lower()
    target = any(word in lower for word in ("simulation", "sim", "runner", "webgpu", "iframe", "panel"))
    command = any(word in lower for word in ("stop", "close", "hide", "remove", "dismiss", "clear"))
    return target and command


def load_prompt_docs() -> str:
    parts = []
    for path in (
        ROOT / "docs" / "agent_behavior.md",
        ROOT / "docs" / "geographic_resolution.md",
        ROOT / "docs" / "dem_workflow.md",
        ROOT / "docs" / "celeris_config_generation.md",
        ROOT / "docs" / "celeris_runtime_controls.md",
        ROOT / "docs" / "noaa_digital_coast.md",
        ROOT / "docs" / "usgs_coned_wcs.md",
    ):
        if path.exists():
            parts.append(f"## {path.name}\n{path.read_text(encoding='utf-8')}")
    return "\n\n".join(parts)




def read_recent_transcript(job_dir: Path, limit: int = 8) -> str:
    path = job_dir / "transcript.jsonl"
    if not path.exists():
        return ""
    lines = path.read_text(encoding="utf-8").splitlines()[-limit:]
    rendered = []
    for line in lines:
        try:
            item = json.loads(line)
            rendered.append(f"{item.get('role')}: {item.get('text')}")
        except Exception:
            continue
    return "\n".join(rendered)
