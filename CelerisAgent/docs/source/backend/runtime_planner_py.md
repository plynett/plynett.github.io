# `agent/celeris/runtime_planner.py`

[Source](../../../agent/celeris/runtime_planner.py)

## What This File Owns

This module plans runtime CELERIS controls after the high-level chat orchestrator has selected `plan_runtime_control`.

It has two LLM passes:

1. A runtime panel router chooses ordered panel groups such as `examples`, `simulation`, `visualization`, `design`, `mods`, `boundary`, `sediment`, and `timeseries`.
2. A panel-specific planner receives only that panel's registry subset and JSON schema, then returns semantic `runtime_commands`.

The panel router receives compact examples from the runtime command registry and should choose the matching panel when a request closely matches a registry example.

This keeps the command catalog extensible as more root CELERIS panels are exposed. Natural-language interpretation stays with the LLM; deterministic code validates the selected structured command names and values against `registry/celeris_runtime_controls.json`.

When `OPENAI_API_KEY` is not configured, the planner has a narrow deterministic fallback for built-in example launch requests. It matches user text against the existing `examples.run_example` registry labels, keys, and example folders, then emits the validated example command. This fallback is intentionally limited to registry-defined built-in examples and does not replace LLM interpretation for DEM geography, source selection, simulation setup, or running-control requests outside the example catalog.

For design-panel linear structures, missing required values should be reported conversationally. If the user supplied a usable crest elevation and crest width but gave a malformed side slope, the planner should ask only for side slope and repeat the usable values it already has rather than restarting the whole request.

The panel action schema includes `linear_structure_form`. The LLM fills that form from the raw user message plus any `state.pending_linear_structure`. `chat.py` stores incomplete forms in job state and clears them once `design.prepare_linear_structure` is queued. The backend has a narrow normalization fallback for this three-field linear-structure case so terse planner output remains readable, but natural-language continuation such as "the side slope should be 1/2" is interpreted by the LLM against the pending form.

Sediment-panel requests may emit multiple commands in one turn, such as enabling sediment transport and setting D50 and porosity. Unspecified sediment parameters are left unchanged.

Time-series-panel requests may emit multiple commands in one turn, such as setting the active gauge count and preparing right-click placement. Explicit model x/y coordinates should become `timeseries.set_location_xy`; visual or named locations should become `timeseries.prepare_click_location` so the user can right-click the gauge location in Design Mode. The planner receives `state.runtime_state` so follow-ups such as "add another time series" can increment the current active count and prepare the new slot. Requests to close, hide, remove, clear, disable, or turn off a time-series plot/gauge/probe should become `timeseries.set_count` with `time_series_count = 0`, not simulation-stop. The time-series properties exposed to the LLM are active gauge count, plotted/saved duration in seconds, selected location index, and gauge x/y locations.
