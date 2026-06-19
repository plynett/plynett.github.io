from __future__ import annotations

from pathlib import Path
import os
import re
import time
from typing import Any

from agent.catalog import available_examples_text, available_runtime_controls_text, current_state_text
from agent.chat_hooks import apply_workflow_hooks, workflow_hook_text
from agent.chat_planner import message_mentions_celeris_stop, normalize_action_for_context, plan_chat_action
from agent.chat_responses import (
    help_text,
    last_source_intent,
    response_for_celeris_config_result,
    response_for_celeris_launch_result,
    response_for_celeris_stop_result,
    response_for_dem_result,
    response_for_source_result,
    source_plan_text,
)
from agent.chat_state import build_source_plan, empty_dem_request, infer_dem_request_patch, infer_options, merge_dem_request
from agent.celeris.launch import prepare_celeris_launch
from agent.chat_utils import attachment_message, chat_message, now, valid_job_id
from agent.celeris.request import celeris_config_missing, default_celeris_config, infer_celeris_config, merge_celeris_config
from agent.celeris.runtime_controls import (
    dedupe_runtime_commands,
    example_key_from_commands,
    example_layout,
    fill_mods_activation_from_pending,
    mods_confirmation_text,
    mods_pending_edit_from_command,
    normalize_runtime_commands,
    runtime_commands_text,
    update_runtime_state_from_commands,
)
from agent.celeris.runtime_planner import plan_runtime_control_action
from agent.celeris.workflow import generate_celeris_inputs
from agent.config import JOBS, ensure_dirs
from agent.dem.workflow import normalize_attachments, normalize_direct_url
from agent.io_utils import append_jsonl, new_job_id, read_json, write_json
from agent.openai_client import model_for
from agent.orchestrator import orchestrate_chat_turn
from agent.progress import finish_progress, record_progress, reset_progress
from agent.research import (
    answer_direct_question_with_research,
    apply_research_patch_to_celeris_config,
)
from agent.research_context import assess_and_record_research_context
from agent.sources.tiered import retrieve_tiered_dem
from agent.thread_archive import is_thread_archive, restore_thread_archive


SANTA_CRUZ_EXAMPLE_PROMPT = "Give me an example set of prompts to generate a wave simulation for Santa Cruz Harbor, CA"
SANTA_CRUZ_EXAMPLE_RESPONSE = "\n\n".join(
    [
        "**Prompt 1:** Create a DEM for Santa Cruz Harbor, centered on the shoreline near the Harbor, with a domain size of 1.5 km (East-West) by 2 km (North-South).",
        "**Once created, you can use the Local Content window to move and change the DEM extents.**",
        "**Hit Update Grid if you want to change the DEM.**",
        "**Prompt 2:** Generate the Celeris configuration files, with waves coming from the south, with height of 2m and period of 20 seconds. Use a grid size of 2 m.",
        "**At this stage you can modify many various input parameters, such as boundary conditions, sea level shift, and plotting properties**",
        "**Prompt 3:** Run the simulation",
        "**Once the simulation is running, you can change basic plotting properties using the menus above (or to the left) of the simulation window. For more detailed changes, ask the agent - for example:**",
        "**Prompt 4:** Add time-averaged velocity arrows to the plot",
        "**Prompt 5:** I would like to add a breakwater, with crest elevation of 1 m, crest width of 2m, and side slope of 1/2.",
        "**You will then be asked by the agent to right-click on the simulation window to define the endpoints of the structure**",
        "**Prompt 6:** Change the incident waves to a single harmonic, with height 3m, period 18 sec, and direction from the south (90 degrees)",
        "**Prompt 7:** Change the waves back to a spectrum",
    ]
)


def make_job(job_id: str | None = None) -> Path:
    ensure_dirs()
    jid = job_id if job_id and valid_job_id(job_id) else new_job_id()
    job_dir = JOBS / jid
    for sub in ("attachments", "downloads", "work", "outputs", "logs"):
        (job_dir / sub).mkdir(parents=True, exist_ok=True)
    if not (job_dir / "state.json").exists():
        write_json(
            job_dir / "state.json",
            {
                "job_id": jid,
                "created_at": now(),
                "updated_at": now(),
                "mode": "chat",
                "workflow_state": "waiting_for_instruction",
                "artifacts": [],
                "validation": None,
                "selected_path": [],
                "last_intent": None,
                "dem_request": empty_dem_request(),
                "celeris_config": default_celeris_config(),
            },
        )
    return job_dir


def handle_chat(job_id: str | None, message: str, attachments: list[Path], options: dict[str, Any] | None = None) -> dict[str, Any]:
    job_dir = make_job(job_id)
    reset_progress(job_dir)
    record_progress(
        job_dir,
        "request_received",
        "Received chat request and prepared the job workspace.",
        {
            "attachments": [path.name for path in attachments],
            "has_message": bool(message.strip()),
            "message": message,
        },
    )
    state = read_json(job_dir / "state.json")
    user_msg = chat_message("user", message or attachment_message(attachments), attachments=[p.name for p in attachments])
    archive_restored = False
    user_message_appended = False

    try:
        archive = next((path for path in attachments if is_thread_archive(path)), None)
        if archive:
            record_progress(job_dir, "restore_thread_archive", "Restoring uploaded CelerisAgent configuration archive.", {"filename": archive.name})
            restore_result = restore_thread_archive(job_dir, archive)
            state = restore_result["state"]
            assistant_text = restore_result["message"]
            archive_restored = True
        else:
            append_jsonl(job_dir / "transcript.jsonl", user_msg)
            user_message_appended = True
            assistant_text = run_chat_turn(job_dir, state, message, attachments, options)
    except Exception as exc:
        if not user_message_appended:
            append_jsonl(job_dir / "transcript.jsonl", user_msg)
            user_message_appended = True
        record_progress(job_dir, "workflow_error", f"Workflow error: {exc}", {"error": str(exc)})
        assistant_text = f"I hit a workflow error: {exc}. I have kept the job folder intact so the failure can be inspected."
        state.update(
            {
                "workflow_state": "failed",
                "last_error": str(exc),
                "validation": {
                    "status": "error",
                    "checks": [{"level": "error", "code": "CHAT_WORKFLOW_EXCEPTION", "message": str(exc), "details": {}}],
                },
            }
        )

    state["updated_at"] = now()
    assistant_text = append_simulation_requirements_footer(assistant_text, job_dir, state)
    write_json(job_dir / "state.json", state)
    if archive_restored and not user_message_appended:
        append_jsonl(job_dir / "transcript.jsonl", user_msg)
        user_message_appended = True
    assistant_msg = chat_message("assistant", assistant_text)
    append_jsonl(job_dir / "transcript.jsonl", assistant_msg)
    finish_progress(job_dir, "failed" if state.get("workflow_state") == "failed" else "completed")
    return {"job_id": job_dir.name, "messages": [user_msg, assistant_msg], "state": state}


def append_simulation_requirements_footer(text: str, job_dir: Path, state: dict[str, Any]) -> str:
    if state.pop("_suppress_footer_once", False):
        return text
    if text == SANTA_CRUZ_EXAMPLE_RESPONSE:
        return text
    footer = simulation_requirements_text(job_dir, state)
    if not footer:
        return text
    return f"{text}\n\nNext to run a simulation: {footer}"


def simulation_requirements_text(job_dir: Path, state: dict[str, Any]) -> str:
    outputs = job_dir / "outputs"
    has_dem = (outputs / "celeris_bathy.mat").exists()
    required_case_files = {
        "config.json": outputs / "config.json",
        "bathy.txt": outputs / "bathy.txt",
        "waves.txt": outputs / "waves.txt",
    }
    missing_case_files = [name for name, path in required_case_files.items() if not path.exists()]
    if (state.get("celeris_run") or {}).get("runner_url"):
        return "nothing else is needed; the CELERIS runner is already loaded for this job."
    if not has_dem:
        missing = missing_source_details(state)
        return f"create or attach a DEM so `celeris_bathy.mat` exists{missing}."
    if missing_case_files:
        if has_research_patch_for_config(state):
            return "generate the CELERIS input files."
        config_missing = celeris_config_missing(state.get("celeris_config") or default_celeris_config())
        if config_missing:
            return f"provide {', '.join(config_missing)}, then generate the CELERIS input files."
        return f"generate the CELERIS input files; missing `{', '.join(missing_case_files)}`."
    validation = state.get("validation") or {}
    if validation.get("status") == "error" or state.get("workflow_state") in {"failed", "needs_review"}:
        return "resolve the current validation issue, then launch the CELERIS runner."
    return "all required case files exist; say `run the simulation` to launch CELERIS."


def missing_source_details(state: dict[str, Any]) -> str:
    source_plan = state.get("source_plan") or {}
    missing = ((source_plan.get("plan") or {}).get("missing_information") or state.get("missing_information") or [])
    if not missing:
        return ""
    return f" after providing {', '.join(str(item) for item in missing)}"


def run_chat_turn(
    job_dir: Path,
    state: dict[str, Any],
    message: str,
    attachments: list[Path],
    options: dict[str, Any] | None,
) -> str:
    turn_started = time.perf_counter()
    timings: dict[str, Any] = {}
    state["last_turn_timing"] = timings
    if message.strip() == SANTA_CRUZ_EXAMPLE_PROMPT and not attachments:
        state.update({"workflow_state": "answered_question", "last_intent": "santa_cruz_example_prompts"})
        record_progress(job_dir, "direct_example_prompts", "Returned the deterministic Santa Cruz Harbor example prompt sequence.", {})
        timings["total_turn_seconds"] = round(time.perf_counter() - turn_started, 3)
        return SANTA_CRUZ_EXAMPLE_RESPONSE
    research_assessment = assess_and_record_research_context(message, state)
    if research_assessment:
        record_progress(
            job_dir,
            "research_context",
            "Checked whether prior structured research applies to this turn.",
            {
                "relevant": research_assessment.get("relevant"),
                "reason": research_assessment.get("reason"),
                "model": research_assessment.get("model"),
            },
        )
    orchestrator_started = time.perf_counter()
    record_progress(
        job_dir,
        "orchestrator",
        "Calling the high-level LLM orchestrator.",
        {
            "model_role": "orchestrator",
            "model": model_for("orchestrator"),
            "message": message,
            "workflow_state": state.get("workflow_state"),
            "has_attachments": bool(attachments),
        },
    )
    turn_plan = orchestrate_chat_turn(message, attachments, state, job_dir)
    if message_mentions_celeris_stop(message):
        turn_plan["route"] = "multi_action"
        turn_plan["steps"] = [{"route": "plan_simulation_stop", "instruction": message, "depends_on": [], "allow_continue_on_warning": True}]
        turn_plan["brief_reason"] = "Stop/close simulation requests execute only the simulation-stop workflow."
    timings["orchestrate_chat_turn_seconds"] = round(time.perf_counter() - orchestrator_started, 3)
    state["turn_plan"] = turn_plan
    record_progress(
        job_dir,
        "orchestrator_result",
        f"Orchestrator selected route {turn_plan.get('route') or 'specialist_steps'}.",
        {
            "planner": turn_plan.get("planner", {}),
            "route": turn_plan.get("route"),
            "steps": [{"route": step.get("route"), "instruction": step.get("instruction")} for step in (turn_plan.get("steps") or [])],
            "turn_plan_response": compact_turn_plan_for_progress(turn_plan),
        },
    )
    direct_response = handle_direct_turn_plan(job_dir, state, turn_plan, message)
    if direct_response is not None:
        record_progress(job_dir, "direct_response", "Answered directly from orchestrator route or local catalog/state.", {"route": turn_plan.get("route")})
        timings["total_turn_seconds"] = round(time.perf_counter() - turn_started, 3)
        return direct_response

    responses: list[str] = []
    steps = turn_plan.get("steps") or []
    if not steps:
        record_progress(job_dir, "help_response", "No executable workflow steps were selected; returning general help.")
        state.update({"workflow_state": "waiting_for_instruction", "last_intent": "general_help", "planner": turn_plan.get("planner", {})})
        timings["total_turn_seconds"] = round(time.perf_counter() - turn_started, 3)
        return help_text()
    queued_runtime_commands: list[dict[str, Any]] = []
    for index, step in enumerate(steps):
        step_started = time.perf_counter()
        step_message = step.get("instruction") or message
        record_progress(
            job_dir,
            "workflow_step",
            f"Starting step {index + 1}: {step.get('route') or 'unknown_route'}.",
            {"step": index + 1, "route": step.get("route"), "instruction": step_message},
        )
        direct_step_response = handle_direct_turn_plan(
            job_dir,
            state,
            {
                "route": step.get("route"),
                "answer": None,
                "clarification_question": step_message if step.get("route") == "ask_clarification" else None,
                "planner": turn_plan.get("planner", {}),
            },
            step_message,
        )
        if direct_step_response is not None:
            record_progress(job_dir, "workflow_step_direct", f"Step {index + 1} answered directly.", {"step": index + 1, "route": step.get("route")})
            responses.append(direct_step_response)
            timings[f"execute_step_{index + 1}_seconds"] = round(time.perf_counter() - step_started, 3)
            continue
        planner_started = time.perf_counter()
        record_progress(
            job_dir,
            "specialist_planner",
            f"Calling specialist LLM planner for step {index + 1}.",
            {
                "step": index + 1,
                "route": step.get("route"),
                "model": model_for("specialist"),
                "instruction": step_message,
                "workflow_state": state.get("workflow_state"),
            },
        )
        if step.get("route") == "plan_runtime_control":
            action = plan_runtime_control_action(step_message, state, job_dir)
        else:
            action = plan_chat_action(step_message, attachments if index == 0 else [], state, job_dir)
        timings[f"plan_step_{index + 1}_seconds"] = round(time.perf_counter() - planner_started, 3)
        action = force_action_for_route(action, step.get("route"), step_message)
        record_progress(
            job_dir,
            "specialist_result",
            f"Specialist selected action {action.get('type')}.",
            {
                "step": index + 1,
                "route": step.get("route"),
                "action_type": action.get("type"),
                "planner": action.get("planner", {}),
                "workflow_sequence": action.get("workflow_sequence"),
                "workflow_hooks": action.get("workflow_hooks"),
                "dem_request_patch": action.get("dem_request_patch"),
                "celeris_config": compact_celeris_config_for_progress(action.get("celeris_config")),
                "runtime_commands": action.get("runtime_commands"),
                "specialist_response": compact_action_for_progress(action),
            },
        )
        record_progress(job_dir, "execute_action", f"Executing action {action.get('type')}.", {"step": index + 1, "action_type": action.get("type")})
        execution_message = message if step.get("route") == "plan_runtime_control" else step_message
        response = execute_planned_action(
            job_dir=job_dir,
            state=state,
            message=execution_message,
            attachments=attachments if index == 0 else [],
            options=options,
            action=action,
            turn_started=turn_started,
        )
        responses.append(response)
        runtime_control = state.get("runtime_control") or {}
        runtime_commands = runtime_control.get("commands") or []
        if runtime_commands:
            queued_runtime_commands.extend(runtime_commands)
        timings[f"execute_step_{index + 1}_seconds"] = round(time.perf_counter() - step_started, 3)
        if state.get("workflow_state") in {"needs_source_selection", "needs_user_confirmation", "failed", "needs_celeris_config", "needs_dem", "needs_review"}:
            record_progress(job_dir, "workflow_blocked", f"Workflow paused at state {state.get('workflow_state')}.", {"step": index + 1, "workflow_state": state.get("workflow_state")})
            state["pending_turn_plan"] = {
                "steps": steps,
                "current_step": index,
                "blocked_reason": state.get("workflow_state"),
                "created_from_message": message,
            }
            break
    queued_runtime_commands = dedupe_runtime_commands(queued_runtime_commands)
    if queued_runtime_commands and (state.get("celeris_run") or {}).get("runner_url"):
        state["runtime_control"] = {
            "id": f"runtime_{int(time.time() * 1000)}",
            "commands": queued_runtime_commands,
        }
        validation = state.get("validation") or {}
        checks = validation.get("checks") or []
        if checks:
            checks[-1].setdefault("details", {})["runtime_commands"] = queued_runtime_commands
        if steps and all(step.get("route") == "plan_runtime_control" for step in steps):
            responses = [runtime_commands_text(queued_runtime_commands)]
    state["planner"] = {
        "orchestrator": turn_plan.get("planner", {}),
        "last_specialist": state.get("planner", {}),
    }
    timings["total_turn_seconds"] = round(time.perf_counter() - turn_started, 3)
    record_progress(job_dir, "turn_complete", "Chat turn completed.", {"total_turn_seconds": timings["total_turn_seconds"], "workflow_state": state.get("workflow_state")})
    return " ".join(item for item in responses if item)


def execute_planned_action(
    job_dir: Path,
    state: dict[str, Any],
    message: str,
    attachments: list[Path],
    options: dict[str, Any] | None,
    action: dict[str, Any],
    turn_started: float,
) -> str:
    timings: dict[str, Any] = state.setdefault("last_turn_timing", {})
    action.setdefault("workflow_hooks", [])
    action = normalize_action_for_context(action, message, attachments, state)
    action = force_action_for_route(action, action.get("_orchestrator_route"), message)
    if action["type"] == "stop_celeris_simulation":
        action["dem_request_patch"] = {}
        action["workflow_hooks"] = []
        action["celeris_config"] = state.get("celeris_config") or default_celeris_config()

    dem_request = merge_dem_request(
        state.get("dem_request") or empty_dem_request(),
        action.get("dem_request_patch") or {},
    )
    applied_hooks = apply_workflow_hooks(dem_request, action.get("workflow_hooks") or [])
    state["dem_request"] = dem_request
    state["workflow_hooks"] = applied_hooks
    celeris_config = merge_celeris_config(
        state.get("celeris_config") or default_celeris_config(),
        action.get("celeris_config") or {},
    )
    applied_research_patch = None
    if action.get("type") == "generate_celeris_config" and has_research_patch_for_config(state):
        celeris_config, applied_research_patch = apply_research_patch_to_celeris_config(celeris_config, state)
        if applied_research_patch:
            record_progress(
                job_dir,
                "apply_research_patch",
                "Applied previously researched structured values to the CELERIS config request.",
                applied_research_patch,
            )
    state["celeris_config"] = celeris_config
    if applied_research_patch:
        state["last_research_applied"] = applied_research_patch
    explicit_fields = set(celeris_config.get("_explicit_fields") or [])
    explicit_fields.update(action.get("celeris_config_explicit_fields") or [])
    celeris_config["_explicit_fields"] = sorted(explicit_fields)

    run_options = options or action.get("options") or infer_options(message)
    if action["type"] == "normalize_attachments":
        record_progress(job_dir, "normalize_attachments", "Loading and standardizing attached DEM files.", {"file_count": len(attachments)})
        return handle_attachment_turn(job_dir, state, attachments, run_options, action)
    if action["type"] == "normalize_url":
        record_progress(job_dir, "normalize_url", "Downloading and standardizing DEM from direct URL.", {"url": action.get("url")})
        return handle_url_turn(job_dir, state, action["url"], run_options, action)
    if action["type"] == "source_plan":
        record_progress(
            job_dir,
            "source_plan",
            "Building DEM source plan and checking required AOI details.",
            {"dem_request": compact_dem_request_for_progress(dem_request), "options": run_options, "applied_hooks": applied_hooks},
        )
        response = handle_source_turn(job_dir, state, dem_request, run_options, action, applied_hooks)
        return response
    if action["type"] == "generate_celeris_config":
        record_progress(
            job_dir,
            "celeris_config",
            "Generating CELERIS config.json, bathy.txt, and waves.txt.",
            {"celeris_config": compact_celeris_config_for_progress(celeris_config)},
        )
        response = handle_celeris_config_turn(job_dir, state, celeris_config, action)
        if applied_research_patch:
            response = f"{research_patch_applied_text(applied_research_patch)} {response}"
        return response
    if action["type"] == "run_celeris_simulation":
        record_progress(job_dir, "celeris_launch", "Preparing local CELERIS runner URL for the generated case.")
        response = handle_celeris_launch_turn(job_dir, state, action)
        return response
    if action["type"] == "stop_celeris_simulation":
        record_progress(job_dir, "celeris_stop", "Closing the embedded CELERIS runner panel.")
        response = handle_celeris_stop_turn(state, action)
        return response
    if action["type"] == "control_running_simulation":
        record_progress(
            job_dir,
            "runtime_control",
            "Normalizing and queuing runtime controls for the embedded simulation.",
            {"runtime_commands": action.get("runtime_commands"), "has_runner": bool((state.get("celeris_run") or {}).get("runner_url"))},
        )
        response = handle_celeris_runtime_control_turn(state, action, message)
        return response

    state.update({"workflow_state": "waiting_for_instruction", "last_intent": "general_help", "planner": action.get("planner", {})})
    return help_text()


def has_research_patch_for_config(state: dict[str, Any]) -> bool:
    research = state.get("last_research") or {}
    patch = research.get("proposed_patch") or {}
    return patch.get("target") == "celeris_config.initial_condition" and bool(patch.get("initial_condition"))


def handle_direct_turn_plan(job_dir: Path, state: dict[str, Any], turn_plan: dict[str, Any], message: str | None = None) -> str | None:
    route = turn_plan.get("route")
    if route == "list_available_examples":
        text = available_examples_text()
    elif route == "list_available_controls":
        text = available_runtime_controls_text()
    elif route == "inspect_current_state":
        text = current_state_text(state)
    elif route == "ask_clarification":
        text = turn_plan.get("clarification_question") or "What detail should I use before continuing?"
    elif route == "answer_question":
        record_progress(
            job_dir,
            "direct_research",
            "Calling the direct-answer LLM. Online web search is available when the question asks for current or source-backed information.",
            {"message": message, "model": model_for("specialist")},
        )
        research = answer_direct_question_with_research(job_dir, message or "", state, turn_plan)
        record_progress(
            job_dir,
            "direct_research_result",
            f"Direct-answer research completed with mode {research.get('mode')}.",
            {key: research.get(key) for key in ("mode", "model", "response_id", "error") if research.get(key)},
        )
        text = research.get("answer") or turn_plan.get("answer") or help_text()
        state["last_research"] = {
            key: research.get(key)
            for key in (
                "mode",
                "model",
                "response_id",
                "error",
                "extracted_parameters",
                "proposed_patch",
                "missing_fields",
                "sources",
            )
            if research.get(key) not in (None, "", [], {})
        }
        state.pop("last_research_hidden", None)
        state.pop("last_research_context_assessment", None)
    else:
        return None
    if message and route == "ask_clarification":
        state["dem_request"] = merge_dem_request(state.get("dem_request") or empty_dem_request(), infer_dem_request_patch(message))
        state["celeris_config"] = merge_celeris_config(state.get("celeris_config") or default_celeris_config(), infer_celeris_config(message, state.get("celeris_config")))
    state.update(
        {
            "workflow_state": "waiting_for_instruction",
            "last_intent": route,
            "selected_path": ["orchestrator", route],
            "planner": turn_plan.get("planner", {}),
        }
    )
    return text


def force_action_for_route(action: dict[str, Any], route: str | None, message: str) -> dict[str, Any]:
    route = route or ""
    if route == "plan_runtime_control" or action.get("runtime_commands"):
        route = "plan_runtime_control"
    elif message_mentions_celeris_stop(message):
        route = "plan_simulation_stop"
    if route == "plan_simulation_launch" and mentions_builtin_example(message):
        route = "plan_runtime_control"
    if route:
        action["_orchestrator_route"] = route
    if route == "plan_dem_workflow":
        if action.get("type") not in {"normalize_attachments", "normalize_url"}:
            action["type"] = "source_plan"
            action["source_request"] = action.get("source_request") or message
            action["workflow_sequence"] = ["dem_retrieval"]
    elif route == "plan_celeris_config":
        action["type"] = "generate_celeris_config"
        action["workflow_sequence"] = ["celeris_config_generation"]
    elif route == "plan_runtime_control":
        action["type"] = "control_running_simulation"
        action["workflow_sequence"] = ["celeris_runtime_control"]
    elif route == "plan_simulation_launch":
        action["type"] = "run_celeris_simulation"
        action["workflow_sequence"] = ["celeris_simulation_launch"]
    elif route == "plan_simulation_stop":
        action["type"] = "stop_celeris_simulation"
        action["workflow_sequence"] = ["celeris_simulation_stop"]
    return action


def mentions_builtin_example(message: str) -> bool:
    lower = (message or "").lower()
    return "example" in lower and any(word in lower for word in ("run", "load", "start", "show", "open"))


def handle_attachment_turn(
    job_dir: Path,
    state: dict[str, Any],
    attachments: list[Path],
    options: dict[str, Any],
    action: dict[str, Any],
) -> str:
    result = normalize_attachments(job_dir, attachments, options)
    state.update(
        {
            "workflow_state": result["status"],
            "artifacts": result["artifacts"],
            "validation": result["validation"],
            "selected_path": result["selected_path"],
            "last_intent": "normalize_uploaded_dem",
            "planner": action.get("planner", {}),
            "dem_summary": result.get("summary"),
        }
    )
    return response_for_dem_result(result)


def handle_url_turn(job_dir: Path, state: dict[str, Any], url: str, options: dict[str, Any], action: dict[str, Any]) -> str:
    result = normalize_direct_url(job_dir, url, options)
    state.update(
        {
            "workflow_state": result["status"],
            "artifacts": result["artifacts"],
            "validation": result["validation"],
            "selected_path": result["selected_path"],
            "last_intent": "normalize_dem_url",
            "planner": action.get("planner", {}),
            "dem_summary": result.get("summary"),
        }
    )
    return response_for_dem_result(result, source="the DEM URL")


def handle_celeris_config_turn(
    job_dir: Path,
    state: dict[str, Any],
    celeris_config: dict[str, Any],
    action: dict[str, Any],
) -> str:
    generation_config = apply_dem_context_to_initial_condition(celeris_config, state)
    result = generate_celeris_inputs(job_dir, generation_config, progress_callback=lambda stage, detail, data=None: record_progress(job_dir, stage, detail, data or {}))
    apply_celeris_config_result(state, result, action)
    response = response_for_celeris_config_result(result)
    if result.get("status") == "completed" and "celeris_simulation_launch" in (action.get("workflow_sequence") or []):
        launch_result = prepare_celeris_launch(job_dir)
        apply_celeris_launch_result(state, launch_result, action)
        response = f"{response} Then, {response_for_celeris_launch_result(launch_result)}"
    return response


def research_patch_applied_text(applied_patch: dict[str, Any]) -> str:
    fields = ", ".join(applied_patch.get("applied_fields") or [])
    confidence = applied_patch.get("confidence") or "unknown"
    target = applied_patch.get("target") or "state"
    return f"Applied researched values to {target} ({confidence} confidence; fields: {fields})."


def handle_celeris_launch_turn(job_dir: Path, state: dict[str, Any], action: dict[str, Any]) -> str:
    result = prepare_celeris_launch(job_dir)
    apply_celeris_launch_result(state, result, action)
    return response_for_celeris_launch_result(result)


def handle_celeris_stop_turn(state: dict[str, Any], action: dict[str, Any]) -> str:
    result = {
        "status": "simulation_closed",
        "had_active_runner": bool((state.get("celeris_run") or {}).get("runner_url")),
        "selected_path": ["stop_embedded_celeris_runner", "clear_simulation_panel"],
        "validation": {
            "status": "ok",
            "checks": [
                {
                    "level": "info",
                    "code": "CELERIS_RUNNER_CLOSED",
                    "message": "The embedded CELERIS simulation panel was cleared for this job.",
                    "details": {},
                }
            ],
        },
    }
    state.update(
        {
            "workflow_state": result["status"],
            "validation": result["validation"],
            "selected_path": result["selected_path"],
            "last_intent": "stop_celeris_simulation",
            "planner": action.get("planner", {}),
            "celeris_run": None,
        }
    )
    return response_for_celeris_stop_result(result)


def handle_celeris_runtime_control_turn(state: dict[str, Any], action: dict[str, Any], message: str = "") -> str:
    commands = normalize_runtime_commands(action.get("runtime_commands") or [])
    missing_information = [str(item) for item in action.get("missing_information") or [] if str(item).strip()]
    pending_mods_edit = state.get("pending_mods_edit")
    action_linear_structure = action.get("pending_linear_structure")
    pending_linear_structure = action_linear_structure or state.get("pending_linear_structure")
    if pending_mods_edit and message_confirms_pending_mods_edit(message):
        commands = [
            command
            for command in commands
            if not (command.get("namespace") == "mods" and command.get("action") == "prepare_click_edit")
        ]
        if not any(command.get("namespace") == "mods" and command.get("action") == "activate_click_edit" for command in commands):
            commands.append(
                {
                    "namespace": "mods",
                    "action": "activate_click_edit",
                    "args": {
                        "surface": pending_mods_edit.get("surface"),
                        "change_mode": pending_mods_edit.get("change_mode"),
                        "amount": pending_mods_edit.get("amount"),
                        "radius_m": pending_mods_edit.get("radius_m"),
                    },
                }
            )
    prepare_mods_commands = [
        command
        for command in commands
        if command.get("namespace") == "mods" and command.get("action") == "prepare_click_edit"
    ]
    if prepare_mods_commands:
        pending = mods_pending_edit_from_command(prepare_mods_commands[-1])
        state["pending_mods_edit"] = pending
        state.update(
            {
                "workflow_state": "needs_user_confirmation",
                "validation": {
                    "status": "ok",
                    "checks": [
                        {
                            "level": "info",
                            "code": "CELERIS_MODS_EDIT_PREPARED",
                            "message": "A click-edit operation is prepared and waiting for user confirmation.",
                            "details": pending,
                        }
                    ],
                },
                "selected_path": ["parse_runtime_control_request", "prepare_mods_click_edit", "ask_user_to_confirm_edit_values"],
                "last_intent": "control_running_simulation",
                "planner": action.get("planner", {}),
                "runtime_control": None,
            }
        )
        return mods_confirmation_text(pending)
    filled_commands: list[dict[str, Any]] = []
    for command in commands:
        if command.get("namespace") == "mods" and command.get("action") == "activate_click_edit":
            filled = fill_mods_activation_from_pending(command, pending_mods_edit)
            if filled:
                filled_commands.append(filled)
            else:
                missing_information.append("Prepare the edit values first, then confirm them before canvas editing is enabled.")
        else:
            filled_commands.append(command)
    commands = filled_commands
    if not commands and action_linear_structure and linear_structure_form_complete(action_linear_structure):
        commands.append(linear_structure_command_from_form(action_linear_structure))
        missing_information = []
        pending_linear_structure = None
    if any(command.get("namespace") == "design" and command.get("action") == "prepare_linear_structure" for command in commands):
        state.pop("pending_linear_structure", None)
    elif pending_linear_structure:
        state["pending_linear_structure"] = pending_linear_structure
    has_example_command = any(command.get("namespace") == "examples" and command.get("action") == "run_example" for command in commands)
    selected_example = example_key_from_commands(commands)
    selected_example_layout = example_layout(selected_example) if selected_example else None
    if has_example_command and not (state.get("celeris_run") or {}).get("runner_url"):
        runner_base_url = os.environ.get("CELERIS_RUNNER_BASE_URL", "http://127.0.0.1:8765/agent.html").strip() or "http://127.0.0.1:8765/agent.html"
        separator = "&" if "?" in runner_base_url else "?"
        state["celeris_run"] = {
            "mode": "local_root_celeris_examples",
            "runner_base_url": runner_base_url,
            "runner_url": f"{runner_base_url}{separator}t={int(time.time() * 1000)}",
            "autostart": False,
            "layout": selected_example_layout or {"orientation": "landscape", "width_m": None, "height_m": None},
        }
    elif has_example_command and selected_example_layout and (state.get("celeris_run") or {}).get("runner_url"):
        current_run = dict(state.get("celeris_run") or {})
        current_run["mode"] = current_run.get("mode") or "local_root_celeris_examples"
        current_run["layout"] = selected_example_layout
        state["celeris_run"] = current_run
    had_active_runner = bool((state.get("celeris_run") or {}).get("runner_url"))
    result = {
        "status": "runtime_control_queued" if commands and had_active_runner else "runtime_control_unavailable",
        "selected_path": [
            "parse_runtime_control_request",
            *(["prepare_local_celeris_runner_url"] if has_example_command else []),
            "queue_celeris_runtime_command",
        ],
        "runtime_commands": commands,
        "validation": {
            "status": "ok" if commands and had_active_runner else "warning",
            "checks": [
                {
                    "level": "info" if commands and had_active_runner else "warning",
                    "code": "CELERIS_RUNTIME_COMMAND_QUEUED" if commands and had_active_runner else "CELERIS_RUNTIME_COMMAND_NOT_APPLIED",
                    "message": "Runtime command queued for the embedded CELERIS runner."
                    if commands and had_active_runner
                    else "No active embedded CELERIS runner or no supported runtime command was available.",
                    "details": {"runtime_commands": commands, "had_active_runner": had_active_runner},
                }
            ],
        },
    }
    state.update(
        {
            "workflow_state": result["status"],
            "validation": result["validation"],
            "selected_path": result["selected_path"],
            "last_intent": "control_running_simulation",
            "planner": action.get("planner", {}),
            "runtime_control": {
                "id": f"runtime_{int(time.time() * 1000)}",
                "commands": commands,
            }
            if commands and had_active_runner
            else None,
        }
    )
    if commands and had_active_runner:
        update_runtime_state_from_commands(state, commands)
    if commands and any(command.get("namespace") == "mods" and command.get("action") == "activate_click_edit" for command in commands):
        state.pop("pending_mods_edit", None)
    if not commands and pending_linear_structure:
        return linear_structure_pending_text(pending_linear_structure)
    if not commands and missing_information:
        return " ".join(missing_information)
    if not had_active_runner:
        return "I can change runtime CELERIS controls after a simulation is running in the embedded panel."
    return runtime_commands_text(commands)


def linear_structure_form_complete(form: dict[str, Any]) -> bool:
    if not form:
        return False
    if form.get("missing_fields"):
        return False
    return all(form.get(field) is not None for field in ("crest_elevation_m", "crest_width_m", "side_slope"))


def linear_structure_command_from_form(form: dict[str, Any]) -> dict[str, Any]:
    return {
        "namespace": "design",
        "action": "prepare_linear_structure",
        "args": {
            "structure_label": form.get("structure_label") or "linear structure",
            "crest_elevation_m": form.get("crest_elevation_m"),
            "crest_width_m": form.get("crest_width_m"),
            "side_slope": form.get("side_slope"),
        },
    }


def message_confirms_pending_mods_edit(message: str) -> bool:
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


def linear_structure_pending_text(form: dict[str, Any]) -> str:
    present: list[str] = []
    missing: list[str] = []
    value_labels = {
        "crest_elevation_m": "crest elevation",
        "crest_width_m": "crest width",
        "side_slope": "side slope",
    }
    for field, label in value_labels.items():
        value = form.get(field)
        if value is None:
            missing.append(label)
            continue
        unit = " m" if field in {"crest_elevation_m", "crest_width_m"} else ""
        present.append(f"{label} ({float(value):g}{unit})")
    if not present or not missing:
        return "To add a structure, I need crest elevation, crest width, and side slope."
    return (
        "To add a structure, I need crest elevation, crest width, and side slope. "
        f"I have current values of {join_phrase(present)}. "
        f"Please provide {join_phrase(missing)}."
    )


def join_phrase(items: list[str]) -> str:
    if len(items) <= 1:
        return items[0] if items else ""
    if len(items) == 2:
        return f"{items[0]} and {items[1]}"
    return f"{', '.join(items[:-1])}, and {items[-1]}"


def apply_celeris_launch_result(state: dict[str, Any], result: dict[str, Any], action: dict[str, Any]) -> None:
    state.update(
        {
            "workflow_state": result["status"],
            "validation": result.get("validation"),
            "selected_path": result.get("selected_path", []),
            "last_intent": "run_celeris_simulation",
            "planner": action.get("planner", {}),
            "celeris_run": result.get("celeris_run"),
        }
    )


def apply_celeris_config_result(
    state: dict[str, Any],
    result: dict[str, Any],
    action: dict[str, Any],
    selected_path_prefix: list[str] | None = None,
) -> None:
    existing_artifacts = [
        item
        for item in state.get("artifacts", [])
        if item.get("type")
        not in {
            "celeris_config_json",
            "celeris_bathy_txt",
            "celeris_waves_txt",
            "celeris_case_manifest",
            "satellite_overlay_jpg",
            "satellite_overlay_manifest",
            "celeris_eta_initial_condition",
            "earthquake_ic_preview_png",
            "earthquake_ic_manifest",
        }
    ]
    selected_path = result.get("selected_path", [])
    if selected_path_prefix:
        selected_path = [*selected_path_prefix, *selected_path]
    state.update(
        {
            "workflow_state": result["status"],
            "artifacts": [*existing_artifacts, *result.get("artifacts", [])],
            "validation": result.get("validation"),
            "selected_path": selected_path,
            "last_intent": "generate_celeris_inputs",
            "planner": action.get("planner", {}),
            "celeris_config": result.get("config") or state.get("celeris_config"),
            "celeris_summary": result.get("summary"),
            "celeris_wave_summary": result.get("wave_summary"),
            "celeris_initial_condition": result.get("initial_condition"),
        }
    )


def apply_dem_context_to_initial_condition(celeris_config: dict[str, Any], state: dict[str, Any]) -> dict[str, Any]:
    config = dict(celeris_config)
    initial_condition = dict(config.get("initial_condition") or {})
    if initial_condition.get("enabled") and initial_condition.get("type") == "earthquake_okada":
        dem_request = state.get("dem_request") or {}
        if initial_condition.get("center_lon") is None and dem_request.get("center_lon") is not None:
            initial_condition["center_lon"] = dem_request.get("center_lon")
        if initial_condition.get("center_lat") is None and dem_request.get("center_lat") is not None:
            initial_condition["center_lat"] = dem_request.get("center_lat")
        if not initial_condition.get("event_name"):
            initial_condition["event_name"] = dem_request.get("center_description") or dem_request.get("location")
        if initial_condition.get("center_lon") is None or initial_condition.get("center_lat") is None:
            initial_condition["coordinate_reference"] = "domain_center"
    config["initial_condition"] = initial_condition
    return config


def handle_source_turn(
    job_dir: Path,
    state: dict[str, Any],
    dem_request: dict[str, Any],
    options: dict[str, Any],
    action: dict[str, Any],
    applied_hooks: list[dict[str, Any]],
) -> str:
    source_plan = build_source_plan(dem_request, action)
    if source_plan["plan"]["missing_information"]:
        record_progress(
            job_dir,
            "source_plan_missing_info",
            "DEM source plan needs more information before retrieval.",
            {
                "missing": source_plan["plan"]["missing_information"],
                "source_plan": source_plan.get("plan"),
                "dem_request": compact_dem_request_for_progress(dem_request),
            },
        )
        assistant_text = source_plan_text(source_plan)
        if applied_hooks:
            assistant_text = f"{workflow_hook_text(applied_hooks)} {assistant_text}"
        state.update(
            {
                "workflow_state": "needs_source_selection",
                "last_intent": "create_dem_from_sources",
                "planner": action.get("planner", {}),
                "source_plan": source_plan,
                "selected_path": ["parse_dem_request", "rank_dem_sources", "ask_for_aoi_or_source"],
            }
        )
        return assistant_text

    retrieval_started = time.perf_counter()
    record_progress(
        job_dir,
        "dem_retrieval",
        "Running tiered DEM retrieval: user-specified DAV, CoNED WCS, SLR DEM, then public NOAA gridded sources.",
        {
            "source_path": source_plan.get("plan", {}).get("ranked_sources"),
            "dem_request": compact_dem_request_for_progress(dem_request),
            "options": options,
        },
    )
    result = retrieve_tiered_dem(job_dir, dem_request, options)
    (state.get("last_turn_timing") or {})["retrieve_tiered_dem_seconds"] = round(time.perf_counter() - retrieval_started, 3)
    record_progress(
        job_dir,
        "dem_retrieval_result",
        f"DEM retrieval finished with status {result.get('status')}.",
        {
            "status": result.get("status"),
            "selected_path": result.get("selected_path", []),
            "seconds": (state.get("last_turn_timing") or {}).get("retrieve_tiered_dem_seconds"),
            "source_retrieval": result.get("source_retrieval"),
            "summary": result.get("summary"),
            "artifact_count": len(result.get("artifacts", [])),
        },
    )
    source_search = result.get("source_search") or {}
    update_dem_request_from_resolved_aoi(dem_request, source_search)
    geographic_review = add_geographic_review_warning(result)
    state["dem_request"] = dem_request
    assistant_text = response_for_source_result(result)
    if geographic_review:
        assistant_text = f"{assistant_text} {geographic_review}"
    if applied_hooks:
        assistant_text = f"{workflow_hook_text(applied_hooks)} {assistant_text}"
    state.update(
        {
            "workflow_state": result["status"],
            "artifacts": result.get("artifacts", []),
            "validation": result.get("validation"),
            "selected_path": result["selected_path"],
            "last_intent": last_source_intent(result),
            "planner": action.get("planner", {}),
            "source_plan": source_plan,
            "source_search": source_search,
            "source_retrieval": result.get("source_retrieval"),
            "tier_attempts": result.get("tier_attempts"),
            "dem_summary": result.get("summary"),
        }
    )
    if should_run_celeris_after_source(action, result):
        config_started = time.perf_counter()
        record_progress(
            job_dir,
            "celeris_config_after_dem",
            "DEM completed; now generating CELERIS input files.",
            {"celeris_config": compact_celeris_config_for_progress(state.get("celeris_config") or default_celeris_config())},
        )
        config_result = generate_celeris_inputs(
            job_dir,
            state.get("celeris_config") or default_celeris_config(),
            progress_callback=lambda stage, detail, data=None: record_progress(job_dir, stage, detail, data or {}),
        )
        (state.get("last_turn_timing") or {})["generate_celeris_inputs_seconds"] = round(time.perf_counter() - config_started, 3)
        record_progress(
            job_dir,
            "celeris_config_result",
            f"CELERIS input generation finished with status {config_result.get('status')}.",
            {
                "status": config_result.get("status"),
                "seconds": (state.get("last_turn_timing") or {}).get("generate_celeris_inputs_seconds"),
                "summary": config_result.get("summary"),
                "artifact_count": len(config_result.get("artifacts", [])),
            },
        )
        apply_celeris_config_result(state, config_result, action, selected_path_prefix=result["selected_path"])
        assistant_text = f"{assistant_text} Then, {response_for_celeris_config_result(config_result)}"
    return assistant_text


def should_run_celeris_after_source(action: dict[str, Any], result: dict[str, Any]) -> bool:
    if "celeris_config_generation" not in (action.get("workflow_sequence") or []):
        return False
    if result.get("status") != "completed":
        return False
    return any(item.get("type") == "celeris_bathy_mat" for item in result.get("artifacts", []))


def update_dem_request_from_resolved_aoi(dem_request: dict[str, Any], source_search: dict[str, Any]) -> None:
    aoi = source_search.get("aoi") or {}
    center = aoi.get("center") or {}
    if center.get("lon") is not None and center.get("lat") is not None:
        dem_request["center_lon"] = center["lon"]
        dem_request["center_lat"] = center["lat"]
    if aoi.get("bbox_wgs84"):
        dem_request["aoi_bbox_wgs84"] = aoi["bbox_wgs84"]
    if aoi.get("domain_width_m") is not None and aoi.get("domain_height_m") is not None:
        dem_request["domain_width_m"] = aoi["domain_width_m"]
        dem_request["domain_height_m"] = aoi["domain_height_m"]
    if aoi.get("domain_width_deg") is not None and aoi.get("domain_height_deg") is not None:
        dem_request["domain_width_deg"] = aoi["domain_width_deg"]
        dem_request["domain_height_deg"] = aoi["domain_height_deg"]


def add_geographic_review_warning(result: dict[str, Any]) -> str | None:
    source_search = result.get("source_search") or {}
    center = ((source_search.get("aoi") or {}).get("center") or {})
    if not center:
        return None
    needs_review = bool(center.get("needs_geographic_review"))
    ungrounded = center.get("source") in {"llm_text_georesolver", "llm_georesolver"} and not center.get("grounding_candidate")
    if not (needs_review or ungrounded):
        return None
    message = (
        "Geographic review recommended: the AOI center was resolved from LLM geographic reasoning "
        "without a directly accepted map/geocoder feature. Check the Regional and Local Context maps before using this DEM."
    )
    validation = result.get("validation")
    if isinstance(validation, dict):
        checks = validation.setdefault("checks", [])
        if not any(item.get("code") == "GEOGRAPHIC_CENTER_UNGROUNDED" for item in checks):
            checks.append(
                {
                    "level": "warning",
                    "code": "GEOGRAPHIC_CENTER_UNGROUNDED",
                    "message": message,
                    "details": {
                        "center_lon": center.get("lon"),
                        "center_lat": center.get("lat"),
                        "label": center.get("label"),
                        "source": center.get("source"),
                        "confidence": center.get("confidence"),
                        "reason": center.get("reason"),
                    },
                }
            )
            if validation.get("status") == "ok":
                validation["status"] = "warning"
    return message


def compact_turn_plan_for_progress(turn_plan: dict[str, Any]) -> dict[str, Any]:
    return {
        "route": turn_plan.get("route"),
        "answer": truncate_for_progress(turn_plan.get("answer")),
        "clarification_question": turn_plan.get("clarification_question"),
        "steps": [
            {
                "route": step.get("route"),
                "instruction": truncate_for_progress(step.get("instruction")),
            }
            for step in (turn_plan.get("steps") or [])
        ],
        "planner": turn_plan.get("planner"),
    }


def compact_action_for_progress(action: dict[str, Any]) -> dict[str, Any]:
    keys = [
        "type",
        "workflow_sequence",
        "source_request",
        "url",
        "workflow_hooks",
        "dem_request_patch",
        "runtime_commands",
        "_orchestrator_route",
    ]
    compact = {key: truncate_for_progress(action.get(key)) for key in keys if action.get(key) not in (None, "", [], {})}
    if action.get("celeris_config"):
        compact["celeris_config"] = compact_celeris_config_for_progress(action.get("celeris_config"))
    compact["planner"] = action.get("planner")
    return compact


def compact_dem_request_for_progress(dem_request: dict[str, Any] | None) -> dict[str, Any]:
    if not dem_request:
        return {}
    keys = [
        "location",
        "center_description",
        "center_lon",
        "center_lat",
        "domain_width_m",
        "domain_height_m",
        "domain_width_deg",
        "domain_height_deg",
        "target_resolution_m",
        "vertical_datum",
        "source_dataset_hint",
        "aoi_bbox_wgs84",
        "preferred_sources",
    ]
    return {key: dem_request.get(key) for key in keys if dem_request.get(key) not in (None, "", [], {})}


def compact_celeris_config_for_progress(config: dict[str, Any] | None) -> dict[str, Any]:
    if not config:
        return {}
    keys = [
        "dx",
        "dy",
        "NLSW_or_Bous",
        "Hmo",
        "Tp",
        "Thetap",
        "wave_boundary",
        "north_boundary_type",
        "south_boundary_type",
        "east_boundary_type",
        "west_boundary_type",
        "Courant",
        "base_depth",
    ]
    compact = {key: config.get(key) for key in keys if config.get(key) not in (None, "", [], {})}
    initial_condition = config.get("initial_condition") or {}
    if initial_condition.get("enabled"):
        compact["initial_condition"] = {
            key: initial_condition.get(key)
            for key in (
                "type",
                "event_name",
                "center_lon",
                "center_lat",
                "depth_km",
                "strike_deg",
                "dip_deg",
                "rake_deg",
                "length_km",
                "width_km",
                "slip_m",
            )
            if initial_condition.get(key) not in (None, "", [], {})
        }
    return compact


def truncate_for_progress(value: Any, max_chars: int = 1200) -> Any:
    if isinstance(value, str):
        return value if len(value) <= max_chars else f"{value[:max_chars]}..."
    if isinstance(value, list):
        return [truncate_for_progress(item, max_chars=max_chars) for item in value[:20]]
    if isinstance(value, dict):
        return {str(key): truncate_for_progress(item, max_chars=max_chars) for key, item in list(value.items())[:30]}
    return value
