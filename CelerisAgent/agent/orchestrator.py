from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

from agent.chat_utils import find_url
from agent.config import ROOT
from agent.openai_client import call_openai_for_role, extract_response_text, model_for
from agent.prompt_policy import direct_answer_scope_policy
from agent.research_context import state_for_planning


WORKFLOW_ROUTES = {
    "plan_dem_workflow",
    "plan_celeris_config",
    "plan_runtime_control",
    "plan_simulation_launch",
    "plan_simulation_stop",
}

DIRECT_ROUTES = {
    "answer_question",
    "ask_clarification",
    "list_available_examples",
    "list_available_controls",
    "inspect_current_state",
}


def orchestrate_chat_turn(message: str, attachments: list[Path], state: dict[str, Any], job_dir: Path) -> dict[str, Any]:
    api_key = os.environ.get("OPENAI_API_KEY")
    model = model_for("orchestrator")
    planning_state = state_for_planning(message, state)
    if not api_key:
        return heuristic_turn_plan(message, attachments, planning_state, mode="heuristic")

    payload = {
        "model": model,
        "input": [
            {
                "role": "developer",
                "content": [
                    {
                        "type": "input_text",
                        "text": (
                            "You are the high-level orchestrator for a conversational CELERIS setup and runtime agent. "
                            "Return an ordered turn plan, not detailed DEM/config/runtime parameters. "
                            "Split a user prompt into sequential specialist steps when it asks for multiple actions. "
                            "Do not execute workflows yourself and do not invent low-level runtime command args. "
                            f"{direct_answer_scope_policy(orchestrator=True)} "
                            "Use direct routes for questions, catalog requests, state inspection, or clarification. "
                            "If the user asks what runtime control properties, settings, or configuration fields are available, including "
                            "time-series properties such as duration/count/location, use list_available_controls rather than answer_question. "
                            "For requests asking to find, look up, retrieve, verify, or determine information online, use answer_question; "
                            "a downstream direct-answer research pass will use web search and produce the actual answer. "
                            "If a workflow request depends on current or external facts that are not already explicit in state, "
                            "such as the location of a recent earthquake, first add an answer_question step to resolve the needed facts, "
                            "then add the workflow step that uses those structured research results. "
                            "If the user asks to use, apply, assign, store, update, or fill parameters from prior research, route to plan_celeris_config "
                            "when the stored values target CELERIS config or initial-condition state. "
                            "If prior config generation asked whether to use a USGS finite-fault solution or a simple single-rectangle source, "
                            "route the user's choice to plan_celeris_config so the specialist can set the structured source-model fields. "
                            "If a previous runtime-control response asked the user to confirm mods-container click-edit values and the user says to use, accept, or confirm those values, route to plan_runtime_control. "
                            "If pending_linear_structure exists and the user gives a correction or a missing structure value, route to plan_runtime_control. "
                            "Use workflow routes only when the user asks to create/modify/run/control something. "
                            "Be decisive. Do not ask clarification merely because several reasonable choices exist or details are incomplete. "
                            "If the user asks to create, modify, run, stop, or control something, choose the most likely workflow route and let the specialist planner make reasonable assumptions, use defaults, or invoke deterministic validation. "
                            "Use ask_clarification only when no useful workflow action can be selected, when the request is internally contradictory, or when proceeding could overwrite/replace existing work in a way the user did not clearly request. "
                            "For DEM followed by CELERIS inputs, return two ordered steps: plan_dem_workflow then plan_celeris_config. "
                            "Earthquake/Okada/initial-free-surface requests are CELERIS config-generation work unless the user also asks for a new DEM. "
                            "If the user asks to run, load, or start a built-in example, route that as plan_runtime_control, not plan_simulation_launch. "
                            "Only route to plan_simulation_stop when the user explicitly asks to stop, close, hide, remove, dismiss, or clear the embedded simulation runner or panel. "
                            "If the user asks to close, hide, remove, clear, disable, or turn off a time-series plot, gauge, probe, or sensor while a simulation is running, "
                            "route to plan_runtime_control for the time-series controls; do not route to plan_simulation_stop unless the embedded runner/panel/canvas itself is the object. "
                            "Never route pause, resume, status, or state-inspection requests to plan_simulation_stop. "
                            "If the user asks only for current settings, current status, or current state, use inspect_current_state only; do not add a runtime-control step. "
                            "If the user asks how to use a running-simulation mode or control, such as Explorer navigation, route to answer_question; do not treat it as a runtime-control command unless the user asks to change or activate something. "
                            "If the user asks for a runtime change and current state/status in the same prompt, return plan_runtime_control followed by inspect_current_state. "
                            "If the user asks to run/start/launch the current case while also specifying grid spacing, simulation parameters, waves, boundaries, "
                            "or after a prior research result that contains CELERIS initial-condition values, return plan_celeris_config followed by plan_simulation_launch. "
                            "For multiple runtime changes, return one or more plan_runtime_control steps in the user's requested order. "
                            "When a simulation is already running and the user asks to add surface cover components, engineered design components, "
                            "linear structures such as breakwaters, dunes, seawalls, revetments, or berms, or mods-container click edits to "
                            "bathy/topo/DEM, bottom friction, passive tracer/contaminant sources, or water/free-surface elevation, route to plan_runtime_control. "
                            "When a simulation is already running and the user asks to change boundary types, sponge layers, periodic boundaries, "
                            "incident-wave boundaries, incident wave type, sine waves, wave spectra, wave height, wave period, or incident angle/direction, "
                            "route to plan_runtime_control. When no simulation is running, keep wave and boundary setup in CELERIS config generation. "
                            "When a simulation is already running and the user asks to turn sediment transport on/off or change sediment D50, porosity, "
                            "specific gravity, erosion psi, or critical Shields parameters, route to plan_runtime_control. "
                            "When a simulation is already running and the user asks to add, move, place, configure, close, hide, remove, clear, disable, turn off, or plot time series, wave gauges, "
                            "gauges, probes, sensors, or time-series duration, route to plan_runtime_control. "
                            "Only when a simulation is already running, a generic request such as 'modify the DEM', 'change the DEM', 'edit the bathy', "
                            "or similar should be treated as editing the current running surface through mods-container runtime control, not as replacing "
                            "the case DEM. When no simulation is running, keep the normal DEM workflow behavior for these prompts: ask for or use a location, "
                            "dataset, uploaded file, or URL to create/replace the DEM. Route to DEM retrieval when the user clearly asks for a different "
                            "location, dataset, uploaded file, or URL. "
                            "Do not add prerequisite steps the user did not ask for. If the user asks for CELERIS inputs/config but no DEM is available, route to plan_celeris_config and let that specialist report the missing DEM. "
                            "Attachments and direct URLs should route to plan_dem_workflow.\n\n"
                            f"Capability summary:\n{capability_summary()}"
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
                                "attachments": [p.name for p in attachments],
                                "workflow_state": planning_state.get("workflow_state"),
                                "dem_request": planning_state.get("dem_request"),
                                "celeris_config": planning_state.get("celeris_config"),
                                "pending_mods_edit": planning_state.get("pending_mods_edit"),
                                "pending_linear_structure": planning_state.get("pending_linear_structure"),
                                "runtime_state": planning_state.get("runtime_state"),
                                "last_research": planning_state.get("last_research"),
                                "last_research_hidden": planning_state.get("last_research_hidden"),
                                "has_celeris_runner": bool((planning_state.get("celeris_run") or {}).get("runner_url")),
                                "has_artifacts": [item.get("type") for item in planning_state.get("artifacts") or []],
                                "recent_transcript": read_recent_transcript(job_dir),
                            },
                            ensure_ascii=True,
                        ),
                    }
                ],
            },
        ],
        "text": {"format": {"type": "json_schema", "name": "celeris_turn_plan", "schema": turn_plan_schema(), "strict": True}},
    }
    try:
        data = call_openai_for_role(payload, api_key, "orchestrator", timeout=60)
        plan = json.loads(extract_response_text(data))
        return normalize_turn_plan(plan, message, attachments, planning_state, {"mode": "openai", "model": data.get("_celeris_model", model), "response_id": data.get("id")})
    except Exception as exc:
        plan = heuristic_turn_plan(message, attachments, planning_state, mode="heuristic_fallback")
        plan["planner"]["error"] = str(exc)
        return plan


def turn_plan_schema() -> dict[str, Any]:
    route_enum = sorted([*DIRECT_ROUTES, *WORKFLOW_ROUTES, "multi_action"])
    return {
        "type": "object",
        "properties": {
            "route": {"type": "string", "enum": route_enum},
            "steps": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "route": {"type": "string", "enum": sorted([*DIRECT_ROUTES, *WORKFLOW_ROUTES])},
                        "instruction": {"type": "string"},
                        "depends_on": {"type": "array", "items": {"type": "integer"}},
                        "allow_continue_on_warning": {"type": "boolean"},
                    },
                    "required": ["route", "instruction", "depends_on", "allow_continue_on_warning"],
                    "additionalProperties": False,
                },
            },
            "answer": {"type": ["string", "null"]},
            "clarification_question": {"type": ["string", "null"]},
            "brief_reason": {"type": "string"},
        },
        "required": ["route", "steps", "answer", "clarification_question", "brief_reason"],
        "additionalProperties": False,
    }


def normalize_turn_plan(
    plan: dict[str, Any],
    message: str,
    attachments: list[Path],
    state: dict[str, Any],
    planner: dict[str, Any],
) -> dict[str, Any]:
    route = str(plan.get("route") or "answer_question")
    steps = []
    for step in plan.get("steps") or []:
        step_route = str(step.get("route") or "")
        if step_route not in DIRECT_ROUTES and step_route not in WORKFLOW_ROUTES:
            continue
        steps.append(
            {
                "route": step_route,
                "instruction": str(step.get("instruction") or message),
                "depends_on": [int(item) for item in step.get("depends_on") or [] if isinstance(item, int)],
                "allow_continue_on_warning": bool(step.get("allow_continue_on_warning")),
            }
        )
    if attachments or find_url(message):
        route = "multi_action"
        steps = [{"route": "plan_dem_workflow", "instruction": message, "depends_on": [], "allow_continue_on_warning": False}]
    if message_mentions_celeris_stop(message):
        route = "multi_action"
        steps = [{"route": "plan_simulation_stop", "instruction": message, "depends_on": [], "allow_continue_on_warning": True}]
    else:
        steps = [step for step in steps if step["route"] != "plan_simulation_stop"]
        if route == "plan_simulation_stop":
            steps = heuristic_steps(message, state)
            route = "multi_action" if steps else "answer_question"
    if state.get("pending_mods_edit") and message_confirms_pending_runtime_action(message):
        route = "multi_action"
        steps = [{"route": "plan_runtime_control", "instruction": message, "depends_on": [], "allow_continue_on_warning": True}]
    if message_requests_state_inspection(message) and not message_requests_runtime_change(message):
        route = "inspect_current_state"
        steps = []
    if runtime_boundary_or_wave_request(message, state) and not explicit_config_generation_request(message):
        converted = False
        for step in steps:
            if step["route"] == "plan_celeris_config":
                step["route"] = "plan_runtime_control"
                step["allow_continue_on_warning"] = True
                converted = True
        if converted:
            route = "multi_action"
    if runtime_control_request(message, state) and message_requests_state_inspection(message) and message_requests_runtime_change(message):
        if not any(step["route"] == "plan_runtime_control" for step in steps):
            steps.insert(0, {"route": "plan_runtime_control", "instruction": message, "depends_on": [], "allow_continue_on_warning": True})
        if not any(step["route"] == "inspect_current_state" for step in steps):
            steps.append({"route": "inspect_current_state", "instruction": message, "depends_on": [len(steps) - 1], "allow_continue_on_warning": True})
        route = "multi_action"
    if route in WORKFLOW_ROUTES and not steps:
        steps = [{"route": route, "instruction": message, "depends_on": [], "allow_continue_on_warning": False}]
        route = "multi_action"
    if route in DIRECT_ROUTES and route != "ask_clarification":
        steps = []
    if route not in DIRECT_ROUTES and route != "multi_action":
        route = "multi_action" if steps else "answer_question"
    return {
        "route": route,
        "steps": steps,
        "answer": plan.get("answer"),
        "clarification_question": plan.get("clarification_question"),
        "brief_reason": str(plan.get("brief_reason") or ""),
        "planner": planner,
    }


def message_mentions_celeris_stop(message: str) -> bool:
    lower = (message or "").lower()
    target = any(word in lower for word in ("simulation", "sim", "runner", "webgpu", "iframe", "panel"))
    command = any(word in lower for word in ("stop", "close", "hide", "remove", "dismiss", "clear"))
    return target and command


def runtime_control_request(message: str, state: dict[str, Any]) -> bool:
    return bool((state.get("celeris_run") or {}).get("runner_url")) and (
        runtime_boundary_or_wave_request(message, state) or runtime_visual_or_simulation_request(message)
        or runtime_sediment_request(message, state)
        or runtime_timeseries_request(message, state)
    )


def runtime_visual_or_simulation_request(message: str) -> bool:
    lower = (message or "").lower()
    return any(
        term in lower
        for term in (
            "colormap",
            "colorbar",
            "arrow",
            "pause",
            "resume",
            "unpause",
        )
    )


def runtime_boundary_or_wave_request(message: str, state: dict[str, Any]) -> bool:
    if not (state.get("celeris_run") or {}).get("runner_url"):
        return False
    lower = (message or "").lower()
    return any(
        term in lower
        for term in (
            "boundary",
            "sponge",
            "periodic",
            "incident wave",
            "single harmonic",
            "sine wave",
            "spectrum",
            "wave height",
            "wave period",
            "incident angle",
            "incident direction",
            "waves to",
            "wave to",
        )
    )


def runtime_sediment_request(message: str, state: dict[str, Any]) -> bool:
    if not (state.get("celeris_run") or {}).get("runner_url"):
        return False
    lower = (message or "").lower()
    return any(
        term in lower
        for term in (
            "sediment",
            "sed trans",
            "sedtrans",
            "d50",
            "grain size",
            "porosity",
            "specific gravity",
            "shields",
            "erosion psi",
            "transport model",
        )
    )


def runtime_timeseries_request(message: str, state: dict[str, Any]) -> bool:
    if not (state.get("celeris_run") or {}).get("runner_url"):
        return False
    lower = (message or "").lower()
    return any(
        term in lower
        for term in (
            "time series",
            "timeseries",
            "wave gauge",
            "gauge",
            "probe",
            "sensor",
        )
    )


def explicit_config_generation_request(message: str) -> bool:
    lower = (message or "").lower()
    return any(
        term in lower
        for term in (
            "generate the celeris input",
            "generate celeris input",
            "create the celeris input",
            "create celeris input",
            "generate the input files",
            "create the input files",
            "config.json",
            "bathy.txt",
            "waves.txt",
        )
    )


def message_requests_state_inspection(message: str) -> bool:
    lower = (message or "").lower()
    return any(
        phrase in lower
        for phrase in (
            "current state",
            "current status",
            "tell me the state",
            "tell me the current",
            "what files",
            "created so far",
            "what are the current",
            "current wave",
        )
    )


def message_requests_runtime_change(message: str) -> bool:
    lower = (message or "").lower()
    return any(
        term in lower
        for term in (
            "set ",
            "change ",
            "turn ",
            "enable",
            "disable",
            "pause",
            "resume",
            "unpause",
            "run ",
            "load ",
            "start ",
            "add ",
            "modify ",
            "activate",
            "use ",
        )
    )


def message_confirms_pending_runtime_action(message: str) -> bool:
    text = f" {re.sub(r'[^a-z0-9]+', ' ', str(message or '').strip().lower()).strip()} "
    if not text.strip():
        return False
    confirmation_phrases = {
        "use these values",
        "use those values",
        "these values are good",
        "those values are good",
        "values are good",
        "looks good",
        "that looks good",
        "confirm",
        "confirmed",
        "yes",
        "ok",
        "okay",
        "activate",
        "enable",
        "start editing",
        "start the edit",
        "turn it on",
    }
    return any(f" {phrase} " in text for phrase in confirmation_phrases)


def heuristic_turn_plan(message: str, attachments: list[Path], state: dict[str, Any], mode: str) -> dict[str, Any]:
    if attachments or find_url(message):
        route = "multi_action"
        steps = [{"route": "plan_dem_workflow", "instruction": message, "depends_on": [], "allow_continue_on_warning": False}]
    else:
        lower = (message or "").lower()
        if "example" in lower and any(word in lower for word in ("available", "list", "what", "show")):
            route, steps = "list_available_examples", []
        elif any(phrase in lower for phrase in ("what can i change", "available controls", "what controls", "runtime controls")):
            route, steps = "list_available_controls", []
        elif message_requests_state_inspection(message):
            route, steps = "inspect_current_state", []
        else:
            steps = heuristic_steps(message, state)
            route = "multi_action" if steps else "answer_question"
    return {
        "route": route,
        "steps": steps,
        "answer": None,
        "clarification_question": None,
        "brief_reason": "Heuristic route selection.",
        "planner": {"mode": mode, "model": None},
    }


def heuristic_steps(message: str, state: dict[str, Any]) -> list[dict[str, Any]]:
    lower = (message or "").lower()
    steps: list[dict[str, Any]] = []
    wants_dem = message_mentions_dem_request(message)
    wants_config = message_mentions_config_request(message)
    has_research_patch = ((state.get("last_research") or {}).get("proposed_patch") or {}).get("target") == "celeris_config.initial_condition"
    wants_run = any(term in lower for term in ("run", "launch", "start", "execute")) and any(term in lower for term in ("simulation", "sim", "case"))
    run_has_config_edits = wants_run and (
        has_research_patch
        or any(term in lower for term in ("grid", "dx", "dy", "resolution", "wave", "boundary", "nlsw", "boussinesq", "meter", "metre", " m "))
    )
    wants_stop = message_mentions_celeris_stop(message)
    wants_example_run = "example" in lower and any(term in lower for term in ("run", "load", "start", "open"))
    wants_runtime = runtime_control_request(message, state)
    if wants_dem:
        steps.append({"route": "plan_dem_workflow", "instruction": message, "depends_on": [], "allow_continue_on_warning": False})
    if wants_config or run_has_config_edits:
        steps.append({"route": "plan_celeris_config", "instruction": message, "depends_on": [0] if steps else [], "allow_continue_on_warning": False})
    if wants_run:
        steps.append({"route": "plan_simulation_launch", "instruction": message, "depends_on": [len(steps) - 1] if steps else [], "allow_continue_on_warning": False})
    if wants_stop:
        steps.append({"route": "plan_simulation_stop", "instruction": message, "depends_on": [], "allow_continue_on_warning": True})
    if wants_example_run or wants_runtime:
        steps.append({"route": "plan_runtime_control", "instruction": message, "depends_on": [], "allow_continue_on_warning": True})
    if wants_runtime and message_requests_state_inspection(message) and message_requests_runtime_change(message):
        steps.append({"route": "inspect_current_state", "instruction": message, "depends_on": [len(steps) - 1], "allow_continue_on_warning": True})
    return steps


def message_mentions_config_request(message: str) -> bool:
    lower = (message or "").lower()
    return any(term in lower for term in ("celeris input", "celeris inputs", "config.json", "bathy.txt", "waves.txt", "wave setup", "earthquake initial", "initial free surface", "okada", "tsunami initial"))


def message_mentions_dem_request(message: str) -> bool:
    lower = (message or "").lower()
    return any(term in lower for term in ("dem", "bathymetry", "topography", "topobathy", "topo-bathy"))


def capability_summary() -> str:
    return (
        "Direct routes: list built-in examples, list runtime controls, inspect current job state, answer general workflow questions, ask clarification. "
        "Workflow routes: DEM retrieval/intake, CELERIS config generation including optional earthquake initial free-surface files, simulation launch/stop, runtime controls for examples/pause/visualization/fullscreen/design components. "
        "Specialists receive narrowed instructions and produce low-level structured actions."
    )


def read_recent_transcript(job_dir: Path, limit: int = 6) -> str:
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
