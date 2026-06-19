# Conversation Orchestration

CelerisAgent uses a two-level planning structure with a runtime-control sub-orchestrator.

The first pass is the high-level orchestrator in `agent/orchestrator.py`. It returns a compact turn plan with either a direct conversational route or an ordered list of specialist steps. Direct routes answer catalog, status, clarification, and general workflow questions without running DEM/config/runtime scripts.

The orchestrator should be decisive. If the user asks to create, modify, run, stop, or control something, it should normally route to the most likely specialist workflow instead of asking the user to choose among plausible options. Clarification at this level is reserved for cases where no useful workflow route can be selected, the request is internally contradictory, or proceeding could unintentionally overwrite/replace existing work.

Decisive routing should still follow the user's requested action. Do not add prerequisite steps the user did not ask for. For example, if the user asks only to create CELERIS inputs and no DEM is available, route to `plan_celeris_config`; the config specialist can report the missing DEM instead of the orchestrator silently switching to DEM retrieval.

This decisiveness is the target behavior. Future changes should not make the orchestrator more hesitant, option-heavy, or clarification-first unless the user explicitly asks for that behavioral change. If an actionable prompt can plausibly be routed, route it and let the specialist planner plus deterministic validation handle assumptions, defaults, warnings, or downstream blockers.

Planner quality is more important than planner latency for this prototype. `OPENAI_ORCHESTRATOR_MODEL`, `OPENAI_SPECIALIST_MODEL`, `OPENAI_GEOGRAPHIC_MODEL`, and `OPENAI_ESCALATION_MODEL` should all default to `gpt-5.4`. Do not switch the orchestrator, specialist, or geographic planner defaults back to mini/nano models unless the user explicitly requests a speed-first experiment.

Planner calls use the role-specific model first, then retry with the legacy `OPENAI_MODEL` and escalation model if the role-specific model is unavailable to the current API project. In normal development, all of these should resolve to `gpt-5.4`.

Specialist steps are executed in order by `chat.py`. Each step receives a narrowed instruction and is then planned by the matching specialist backend. DEM, CELERIS config, launch, and stop steps use `plan_chat_action()` with the action family forced from the orchestrator route so each step stays scoped:

- `plan_dem_workflow`
- `plan_celeris_config`
- `plan_runtime_control`
- `plan_simulation_launch`
- `plan_simulation_stop`

`plan_runtime_control` uses an additional runtime sub-orchestrator in `agent/celeris/runtime_planner.py`. That planner first routes the raw user request to one or more CELERIS runtime panels, then calls a panel-specific runtime planner with only that panel's registry subset and JSON schema. This prevents the runtime planner from carrying the full growing command catalog in every prompt while still allowing one user message to produce multiple ordered runtime actions.

Runtime specialists may store narrow pending forms in job state when a workflow is mid-step. For example, the design-panel linear-structure planner stores `pending_linear_structure` when crest elevation, crest width, or side slope is missing or malformed. Follow-up corrections are routed back to `plan_runtime_control`, and the LLM receives the pending form plus the raw follow-up text so it can complete the same structure setup instead of treating the reply as an unrelated command.

The mods-container click-edit workflow stores `pending_mods_edit` after preparing values. A follow-up confirmation such as the UI button text "Use These Values" is routed back to `plan_runtime_control`; deterministic execution then converts the pending edit to `mods.activate_click_edit` and clears the pending form.

Runtime panel routing is LLM-owned and currently uses these panel groups:

- `examples`
- `simulation`
- `visualization`
- `design`
- `mods`
- `boundary`

The deterministic runtime registry remains the source of truth for command names, argument names, valid values, HTML control IDs, and command order. The runtime sub-orchestrator may choose panels and panel commands; deterministic code only validates, normalizes, queues, and applies those structured choices.

When an embedded CELERIS runner is active, boundary and incident-wave edits such as sponge layers, periodic boundaries, single-harmonic waves, spectra, wave height, period, or incident angle should route to `plan_runtime_control` unless the user explicitly asks to generate or regenerate `config.json`, `bathy.txt`, `waves.txt`, or CELERIS input files. This keeps running-simulation edits from accidentally rewriting the case setup.

Simulation stop/close is intentionally narrow. Route to `plan_simulation_stop` only when the user explicitly asks to stop, close, hide, remove, dismiss, or clear the embedded simulation runner or panel. Pause, resume, and state/status inspection are runtime or direct-state actions, not stop actions. Closing, hiding, removing, clearing, disabling, or turning off a time-series plot/gauge/probe is a `plan_runtime_control` request for the time-series panel, not a simulation-stop request. If a prompt combines a runtime action with a status request, execute the runtime action first and then inspect current state.

If a step blocks on missing information, confirmation, review, or failure, downstream steps are not run. The remaining turn plan is preserved in `state["pending_turn_plan"]` for later continuation.

Catalog routes such as built-in examples and runtime controls are answered from local registries through `agent/catalog.py`; they should not invoke workflow execution.

Status-only questions, including current running-simulation settings, should stay on `inspect_current_state` and should not run an empty runtime-control step. If the user combines a runtime change with a status request, the orchestrator may still plan the runtime control first and inspect state afterward.

Direct-answer scope policy is loaded from `agent/prompt_policy.py` by both the orchestrator and direct-answer research layer. The orchestrator should route out-of-scope general questions to `answer_question`; any fallback `answer` text must follow the shared policy rather than duplicating local wording.

In OpenAI-enabled operation, do not add post-LLM keyword gates that reinterpret generic words such as "use", "apply", "earthquake", "DEM", or "run" to override the route selected by the orchestrator. Deterministic code may validate and execute the structured route/action, handle direct attachments/URLs, and provide no-API fallback heuristics, but conversational language interpretation belongs to the LLM planners.

Pass structured research state, including `state.last_research`, into both orchestrator and specialist planner prompts. If a later step should use researched coordinates or parameters, the LLM must choose that relationship and return explicit structured fields such as `center_lon`, `center_lat`, or `celeris_config.initial_condition`; scripts should not infer it from generic wording.

When the workflow is blocked on a narrow confirmation state such as `needs_initial_condition_source_choice`, the specialist may use a constrained LLM resolver that receives the raw user reply and the valid structured options. This is still language interpretation by the LLM; deterministic code only applies the returned enum to state and should not grow phrase-specific confirmation rules.
