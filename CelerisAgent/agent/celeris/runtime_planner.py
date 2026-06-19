from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

from agent.celeris.runtime_controls import (
    command_definition,
    normalize_runtime_commands,
    runtime_command_schema,
    runtime_panel_catalog_text,
    runtime_panel_ids,
    runtime_registry_subset_text,
)
from agent.openai_client import call_openai_for_role, extract_response_text, model_for
from agent.progress import record_progress


def plan_runtime_control_action(message: str, state: dict[str, Any], job_dir: Path) -> dict[str, Any]:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        fallback = deterministic_example_fallback_action(message)
        if fallback:
            return fallback
        return runtime_fallback_action("heuristic", None, "OPENAI_API_KEY is not set.")

    model = model_for("specialist")
    try:
        route = plan_runtime_panels(api_key, model, message, state, job_dir)
        record_progress(
            job_dir,
            "runtime_panel_router_result",
            f"Runtime router selected {', '.join(step.get('panel') for step in route.get('steps') or []) or 'no panel'}.",
            {
                "model": route.get("planner", {}).get("model"),
                "response_id": route.get("planner", {}).get("response_id"),
                "steps": route.get("steps"),
                "reason": route.get("brief_reason"),
            },
        )
        commands: list[dict[str, Any]] = []
        missing_information: list[str] = []
        panel_results: list[dict[str, Any]] = []
        pending_linear_structure: dict[str, Any] | None = None
        for index, step in enumerate(route.get("steps") or []):
            panel = step.get("panel")
            instruction = step.get("instruction") or message
            if panel not in runtime_panel_ids():
                continue
            record_progress(
                job_dir,
                "runtime_panel_planner",
                f"Planning runtime commands for {panel}.",
                {"step": index + 1, "panel": panel, "instruction": instruction, "model": model_for("specialist")},
            )
            result = plan_runtime_panel_commands(api_key, model, panel, instruction, message, state, job_dir)
            panel_commands = normalize_runtime_commands(result.get("runtime_commands") or [])
            commands.extend(panel_commands)
            missing_information.extend(str(item) for item in result.get("missing_information") or [] if str(item).strip())
            if result.get("linear_structure_form"):
                pending_linear_structure = result.get("linear_structure_form")
            panel_results.append(
                {
                    "panel": panel,
                    "instruction": instruction,
                    "commands": panel_commands,
                    "missing_information": result.get("missing_information") or [],
                    "linear_structure_form": result.get("linear_structure_form"),
                    "planner": result.get("planner"),
                    "reason": result.get("brief_reason"),
                }
            )
            record_progress(
                job_dir,
                "runtime_panel_result",
                f"Runtime {panel} planner returned {len(panel_commands)} command(s).",
                panel_results[-1],
            )
        return {
            "type": "control_running_simulation",
            "workflow_sequence": ["celeris_runtime_control"],
            "runtime_commands": normalize_runtime_commands(commands),
            "missing_information": missing_information,
            "workflow_hooks": [],
            "celeris_config": {},
            "celeris_config_explicit_fields": [],
            "options": {},
            "dem_request_patch": {},
            "url": None,
            "source_request": None,
            "assistant_intent_summary": route.get("brief_reason") or "Runtime CELERIS control request.",
            "brief_reason": route.get("brief_reason") or "",
            "planner": {
                "mode": "openai_runtime_router",
                "router": route.get("planner"),
                "panels": [step.get("panel") for step in route.get("steps") or []],
                "panel_results": panel_results,
            },
            "pending_linear_structure": pending_linear_structure,
        }
    except Exception as exc:
        return runtime_fallback_action("heuristic_fallback", model, str(exc))


def plan_runtime_panels(api_key: str, model: str, message: str, state: dict[str, Any], job_dir: Path) -> dict[str, Any]:
    schema = runtime_panel_route_schema()
    payload = {
        "model": model,
        "input": [
            {
                "role": "developer",
                "content": [
                    {
                        "type": "input_text",
                        "text": (
                            "You are the runtime-control panel router for a running or launchable CELERIS WebGPU interface. "
                            "Return only the ordered runtime panels needed for this user request. Do not invent command arguments here. "
                            "Preserve the raw user intent in each step instruction. A single user prompt may require multiple ordered panels. "
                            "Be decisive: choose the most likely panel instead of asking the user to choose when an action is plausible. "
                            "If the user request closely matches a catalog example, choose that example's panel. "
                            "Use examples for built-in example loading, simulation for pause/resume, visualization for plotting and view controls, "
                            "design for surface-cover components and linear structures, and mods for click-edits to active bathy/topo, friction, "
                            "passive tracer source, or free-surface fields. Use boundary for boundary-condition controls, incident-wave type, "
                            "incident wave height/period/direction, and requests such as sine wave or TMA spectrum changes. "
                            "Use sediment for sediment transport on/off state and Sediment Class 1 grain size, porosity, specific gravity, "
                            "erosion psi, or critical Shields parameters. "
                            "Use timeseries for wave gauges, probes, time-series plots, time-series duration, time-series location placement, "
                            "or requests to close, hide, remove, clear, disable, or turn off a time-series plot/gauge/probe. "
                            "For generic current-surface edits, choose mods only when has_celeris_runner is true. "
                            "If no runtime panel can reasonably apply, return no steps and explain why in brief_reason.\n\n"
                            f"Available runtime panels:\n{runtime_panel_catalog_text()}"
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
                                "workflow_state": state.get("workflow_state"),
                                "has_celeris_runner": bool((state.get("celeris_run") or {}).get("runner_url")),
                                "pending_mods_edit": state.get("pending_mods_edit"),
                                "pending_linear_structure": state.get("pending_linear_structure"),
                                "runtime_state": state.get("runtime_state"),
                                "recent_transcript": read_recent_transcript(job_dir),
                            },
                            ensure_ascii=True,
                        ),
                    }
                ],
            },
        ],
        "text": {"format": {"type": "json_schema", "name": "celeris_runtime_panel_route", "schema": schema, "strict": True}},
    }
    data = call_openai_for_role(payload, api_key, "specialist", timeout=60)
    route = json.loads(extract_response_text(data))
    steps = []
    for step in route.get("steps") or []:
        panel = str(step.get("panel") or "")
        if panel not in runtime_panel_ids():
            continue
        steps.append({"panel": panel, "instruction": str(step.get("instruction") or message)})
    route["steps"] = steps
    route["planner"] = {"mode": "openai", "model": data.get("_celeris_model", model), "response_id": data.get("id")}
    return route


def plan_runtime_panel_commands(
    api_key: str,
    model: str,
    panel: str,
    instruction: str,
    raw_message: str,
    state: dict[str, Any],
    job_dir: Path,
) -> dict[str, Any]:
    schema = runtime_panel_action_schema(panel)
    payload = {
        "model": model,
        "input": [
            {
                "role": "developer",
                "content": [
                    {
                        "type": "input_text",
                        "text": (
                            f"You are the CELERIS runtime-control planner for the {panel} panel only. "
                            "Return semantic runtime_commands using only the commands and valid values in the provided registry subset. "
                            "Do not emit commands from any other panel. Do not invent arbitrary property writes or HTML IDs. "
                            "If this panel needs required user values before a command can be prepared, return no commands and concise missing_information. "
                            "For design linear structures, require crest elevation, crest width, and side slope before prepare_linear_structure. "
                            "For design linear structures, always fill linear_structure_form with the best current structured values, using pending_linear_structure "
                            "from state plus the raw user message. Treat a follow-up such as 'the side slope should be 1/2' as a correction/completion "
                            "of the pending linear structure when pending_linear_structure exists. "
                            "If any are missing or malformed, return no commands and one missing_information item. "
                            "Make that item conversational and preserve the partial values already supplied. "
                            "For example, if crest elevation is 1 m and crest width is 2 m but side slope is missing or malformed, say: "
                            "\"To add a structure, I need crest elevation, crest width, and side slope. I have current values of "
                            "crest elevation (1 m) and crest width (2 m). Please provide side slope.\" "
                            "If no required values are usable, say: \"To add a structure, I need crest elevation, crest width, and side slope - for example "
                            "\\\"add a breakwater with crest elevation of 1m, crest width of 2 m, and side slope of 1/2\\\".\" "
                            "For mods click-edits, prepare values first with mods.prepare_click_edit; activate only after explicit confirmation of pending values. "
                            "For examples, if the user asks only to run/load/start an example without naming one, choose ventura_harbor_ca_wind_waves. "
                            "For visualization, one prompt may require multiple commands, such as colormap plus vector arrows. "
                            "For boundary, one prompt may require multiple commands, such as incident wave type plus height, period, and direction.\n\n"
                            "For sediment, one prompt may require multiple commands, such as turning sediment transport on and setting d50 and porosity. "
                            "Leave unspecified sediment parameters unchanged; do not ask for confirmation for simple sediment parameter updates.\n\n"
                            "For timeseries, one prompt may require multiple commands, such as setting count plus preparing click placement. "
                            "If the user asks to close, hide, remove, clear, disable, or turn off a time-series plot, gauge, probe, or sensor, "
                            "emit timeseries.set_count with time_series_count = 0 and do not emit simulation-stop commands. "
                            "Use set_location_xy only for explicit model x/y coordinates. For visual or named locations, use prepare_click_location "
                            "and tell the user to right-click the desired time-series location in Design Mode. "
                            "The available time-series properties are active gauge count, plotted/saved duration in seconds, selected location index, "
                            "and gauge x/y locations. If the user asks to add another/add one more time series without giving a number, use "
                            "runtime_state.timeseries.count as the current count, set the new count to current_count + 1, and prepare that new "
                            "location_index for right-click placement. If no current count is known, use 1. Leave omitted location_index null only "
                            "when the user's intended gauge is the currently selected or first gauge.\n\n"
                            f"Registry subset:\n{runtime_registry_subset_text([panel])}"
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
                                "panel_instruction": instruction,
                                "raw_user_message": raw_message,
                                "workflow_state": state.get("workflow_state"),
                                "has_celeris_runner": bool((state.get("celeris_run") or {}).get("runner_url")),
                                "pending_mods_edit": state.get("pending_mods_edit"),
                                "pending_linear_structure": state.get("pending_linear_structure"),
                                "runtime_state": state.get("runtime_state"),
                                "recent_transcript": read_recent_transcript(job_dir),
                            },
                            ensure_ascii=True,
                        ),
                    }
                ],
            },
        ],
        "text": {"format": {"type": "json_schema", "name": "celeris_runtime_panel_action", "schema": schema, "strict": True}},
    }
    data = call_openai_for_role(payload, api_key, "specialist", timeout=60)
    result = json.loads(extract_response_text(data))
    result["runtime_commands"] = normalize_runtime_commands(result.get("runtime_commands") or [])
    result["missing_information"] = normalize_runtime_missing_information(
        panel,
        result.get("missing_information") or [],
        instruction=instruction,
        raw_message=raw_message,
    )
    result["linear_structure_form"] = normalize_linear_structure_form(result.get("linear_structure_form"))
    result["planner"] = {"mode": "openai", "model": data.get("_celeris_model", model), "response_id": data.get("id")}
    return result


def runtime_panel_route_schema() -> dict[str, Any]:
    panels = runtime_panel_ids()
    return {
        "type": "object",
        "properties": {
            "steps": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "panel": {"type": "string", "enum": panels},
                        "instruction": {"type": "string"},
                    },
                    "required": ["panel", "instruction"],
                    "additionalProperties": False,
                },
            },
            "brief_reason": {"type": "string"},
        },
        "required": ["steps", "brief_reason"],
        "additionalProperties": False,
    }


def runtime_panel_action_schema(panel: str) -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "runtime_commands": runtime_command_schema([panel]),
            "missing_information": {"type": "array", "items": {"type": "string"}},
            "linear_structure_form": {
                "type": ["object", "null"],
                "properties": {
                    "structure_label": {"type": ["string", "null"]},
                    "crest_elevation_m": {"type": ["number", "null"]},
                    "crest_width_m": {"type": ["number", "null"]},
                    "side_slope": {"type": ["number", "null"]},
                    "missing_fields": {
                        "type": "array",
                        "items": {"type": "string", "enum": ["crest_elevation_m", "crest_width_m", "side_slope"]},
                    },
                },
                "required": ["structure_label", "crest_elevation_m", "crest_width_m", "side_slope", "missing_fields"],
                "additionalProperties": False,
            },
            "assistant_intent_summary": {"type": "string"},
            "brief_reason": {"type": "string"},
        },
        "required": ["runtime_commands", "missing_information", "linear_structure_form", "assistant_intent_summary", "brief_reason"],
        "additionalProperties": False,
    }


def runtime_fallback_action(mode: str, model: str | None, error: str) -> dict[str, Any]:
    return {
        "type": "control_running_simulation",
        "workflow_sequence": ["celeris_runtime_control"],
        "runtime_commands": [],
        "missing_information": ["I could not plan a supported runtime control from this request."],
        "workflow_hooks": [],
        "celeris_config": {},
        "celeris_config_explicit_fields": [],
        "options": {},
        "dem_request_patch": {},
        "url": None,
        "source_request": None,
        "assistant_intent_summary": "Runtime control planning failed.",
        "brief_reason": error,
        "planner": {"mode": mode, "model": model, "error": error},
    }


def deterministic_example_fallback_action(message: str) -> dict[str, Any] | None:
    """Plan built-in example launches from the runtime registry when no LLM key is available."""
    command = command_definition("examples", "run_example")
    values = command.get("values") if command else None
    if not isinstance(values, list):
        return None
    message_tokens = normalized_tokens(message)
    if not message_tokens.intersection({"example", "examples", "run", "load", "start", "launch"}):
        return None
    default_key = "ventura_harbor_ca_wind_waves"
    generic_tokens = {
        "a",
        "an",
        "the",
        "example",
        "examples",
        "run",
        "load",
        "start",
        "launch",
        "please",
    }
    query_tokens = message_tokens - generic_tokens
    if not query_tokens:
        selected_key = default_key
    else:
        best_key = None
        best_score = 0
        for item in values:
            key = str(item.get("key") or "")
            candidate_text = " ".join(
                str(part)
                for part in (item.get("key"), item.get("label"), item.get("example_folder"))
                if part
            )
            candidate_tokens = normalized_tokens(candidate_text)
            score = len(query_tokens & candidate_tokens)
            if "high" in query_tokens and "order" in query_tokens and {"high", "order"} <= candidate_tokens:
                score += 2
            if "tsunami" in query_tokens and "tsunami" in candidate_tokens:
                score += 2
            if score > best_score:
                best_score = score
                best_key = key
        selected_key = best_key if best_key and best_score > 0 else None
    if not selected_key:
        return None
    commands = normalize_runtime_commands(
        [
            {
                "namespace": "examples",
                "action": "run_example",
                "args": {"example": selected_key},
            }
        ]
    )
    if not commands:
        return None
    return {
        "type": "control_running_simulation",
        "workflow_sequence": ["celeris_runtime_control"],
        "runtime_commands": commands,
        "missing_information": [],
        "workflow_hooks": [],
        "celeris_config": {},
        "celeris_config_explicit_fields": [],
        "options": {},
        "dem_request_patch": {},
        "url": None,
        "source_request": None,
        "assistant_intent_summary": "Built-in CELERIS example request.",
        "brief_reason": "Matched a built-in example from the runtime registry without an OpenAI API key.",
        "planner": {"mode": "deterministic_example_fallback", "model": None},
    }


def normalized_tokens(text: str) -> set[str]:
    return {token for token in re.split(r"[^a-z0-9]+", text.lower()) if token}


def normalize_runtime_missing_information(
    panel: str,
    items: list[Any],
    instruction: str = "",
    raw_message: str = "",
) -> list[str]:
    text_items = [str(item).strip() for item in items if str(item).strip()]
    if panel == "design":
        lower = " ".join(text_items).lower()
        partial_text = linear_structure_partial_missing_information_text(f"{raw_message}\n{instruction}")
        if partial_text and any(key in lower for key in ("crest", "side", "slope", "linear", "structure")):
            return [partial_text]
        if all(key in lower for key in ("crest_elevation", "crest_width", "side_slope")):
            return [linear_structure_missing_information_text()]
        if "crest" in lower and "side" in lower and "slope" in lower:
            return [linear_structure_missing_information_text()]
    return text_items


def linear_structure_missing_information_text() -> str:
    return (
        "To add a structure, I need crest elevation, crest width, and side slope - for example "
        '"add a breakwater with crest elevation of 1m, crest width of 2 m, and side slope of 1/2".'
    )


def normalize_linear_structure_form(form: Any) -> dict[str, Any] | None:
    if not isinstance(form, dict):
        return None
    normalized = {
        "structure_label": form.get("structure_label") if form.get("structure_label") else None,
        "crest_elevation_m": numeric_or_none(form.get("crest_elevation_m")),
        "crest_width_m": numeric_or_none(form.get("crest_width_m")),
        "side_slope": numeric_or_none(form.get("side_slope")),
        "missing_fields": [],
    }
    missing = []
    for field in ("crest_elevation_m", "crest_width_m", "side_slope"):
        if normalized[field] is None:
            missing.append(field)
    normalized["missing_fields"] = missing
    if not normalized["structure_label"]:
        normalized["structure_label"] = "linear structure"
    if not any(normalized[field] is not None for field in ("crest_elevation_m", "crest_width_m", "side_slope")):
        return None
    return normalized


def numeric_or_none(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    if not (numeric == numeric):
        return None
    return numeric


def linear_structure_partial_missing_information_text(text: str) -> str | None:
    values = extract_linear_structure_values(text)
    present = []
    missing = []
    if values.get("crest_elevation_m") is None:
        missing.append("crest elevation")
    else:
        present.append(f"crest elevation ({format_number(values['crest_elevation_m'])} m)")
    if values.get("crest_width_m") is None:
        missing.append("crest width")
    else:
        present.append(f"crest width ({format_number(values['crest_width_m'])} m)")
    if values.get("side_slope") is None:
        missing.append("side slope")
    else:
        present.append(f"side slope ({format_number(values['side_slope'])})")
    if not present or not missing:
        return None
    return (
        "To add a structure, I need crest elevation, crest width, and side slope. "
        f"I have current values of {join_phrase(present)}. "
        f"Please provide {join_phrase(missing)}."
    )


def extract_linear_structure_values(text: str) -> dict[str, float | None]:
    return {
        "crest_elevation_m": extract_first_number(text, r"crest\s+elevation(?:\s+of)?\s*"),
        "crest_width_m": extract_first_number(text, r"crest\s+width(?:\s+of)?\s*"),
        "side_slope": extract_slope_value(text),
    }


def extract_first_number(text: str, prefix_pattern: str) -> float | None:
    match = re.search(prefix_pattern + r"(-?\d+(?:\.\d+)?)", text, flags=re.IGNORECASE)
    if not match:
        return None
    try:
        return float(match.group(1))
    except ValueError:
        return None


def extract_slope_value(text: str) -> float | None:
    match = re.search(
        r"side\s+slope(?:\s+of)?\s*(-?\d+(?:\.\d+)?)(?:\s*/\s*(-?\d+(?:\.\d+)?))?",
        text,
        flags=re.IGNORECASE,
    )
    if not match:
        return None
    numerator = float(match.group(1))
    denominator_text = match.group(2)
    if denominator_text is None:
        if text[match.end():].lstrip().startswith("/"):
            return None
        return numerator
    denominator = float(denominator_text)
    if denominator == 0:
        return None
    return numerator / denominator


def format_number(value: float) -> str:
    return f"{float(value):g}"


def join_phrase(items: list[str]) -> str:
    if len(items) <= 1:
        return items[0] if items else ""
    if len(items) == 2:
        return f"{items[0]} and {items[1]}"
    return f"{', '.join(items[:-1])}, and {items[-1]}"


def read_recent_transcript(job_dir: Path, limit: int = 8) -> str:
    path = job_dir / "transcript.jsonl"
    if not path.exists():
        return ""
    rendered: list[str] = []
    for line in path.read_text(encoding="utf-8").splitlines()[-limit:]:
        try:
            item = json.loads(line)
        except Exception:
            continue
        rendered.append(f"{item.get('role')}: {item.get('text')}")
    return "\n".join(rendered)
