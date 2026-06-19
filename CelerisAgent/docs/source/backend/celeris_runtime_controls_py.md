# `agent/celeris/runtime_controls.py`

[Source](../../../agent/celeris/runtime_controls.py)

## What This File Owns

This module loads `registry/celeris_runtime_controls.json` and turns the registry into the LLM-facing runtime-command schema, normalized command objects, deduplication keys, response text, and example-layout metadata.

Runtime command arguments may be either the older single `arg_name` form or the newer `arguments` list form. The newer form supports multi-argument commands such as `design.prepare_linear_structure`, where crest elevation, crest width, and side slope must be carried together.

When a time-series `set_count` command is followed by a placement/edit command with no explicit `location_index`, normalization fills that index from the newly requested count. This keeps structured multi-command plans such as "set count to 2 and prepare placement" from accidentally editing the previously selected gauge.

The schema helper can return either the full runtime command schema or a panel-scoped schema. Panel-scoped schemas are used by `agent/celeris/runtime_planner.py` so each runtime panel planner sees only the commands it can emit, while normalization still expands commands into the full argument shape expected by the frontend bridge.

`runtime_panel_catalog()` exposes compact examples from the command registry for the first-stage runtime panel router. These examples are not separate phrase rules; they are LLM context derived from the same registry used for validated runtime commands.

## Design Controls

The design-container commands are semantic runtime controls. They should preserve LLM intent as structured arguments and never expose arbitrary `calc_constants` writes. Surface-cover commands validate component keys against the first seven allowed design components. Linear-structure commands preserve the user-confirmed workflow: prepare cross-section, confirm start point, confirm end point and add.

`runtime_commands_text()` formats the user-facing queued-command summary from registry templates. For optional surface-cover radius/friction values, omitted values are rendered as registry defaults, such as `default 100 m` or the selected component's default friction, because the chat response is generated before the iframe applies the command.

## Mods Controls

The mods-container workflow uses two semantic commands. `mods.prepare_click_edit` is stored by the chat backend as a pending edit and is not sent to the iframe, because click editing is destructive once active. `mods.activate_click_edit` can omit arguments; the backend fills omitted values from the pending edit state, queues the command for root CELERIS, and clears the pending edit.

## Boundary Controls

The boundary-container commands are semantic runtime controls for side boundary types, incident wave type, and incident wave parameters. `runtime_commands_text()` has a small formatter for partial incident-wave parameter updates so responses list only the height, period, and/or direction values the user actually changed.

`update_runtime_state_from_commands()` projects queued runtime commands into `state.runtime_state`. This state is not a second source of user intent; it is a deterministic snapshot derived from validated LLM-selected runtime commands.

- `state.runtime_state.example` records the currently queued/running built-in example from `examples.run_example`.
- `state.runtime_state.boundary` records active running-simulation incident-wave type, height, period, direction, and boundary types without confusing them with pre-runtime `celeris_config` fields such as `Hmo`, `Tp`, and `Thetap`.
- `state.runtime_state.sediment` records active sediment transport on/off state and Class 1 sediment parameter updates from sediment-container commands.
- `state.runtime_state.timeseries` records active gauge count, duration, selected gauge index, placement mode, and explicit x/y gauge locations from time-series-container commands. Runtime planning uses this projection for follow-up requests such as adding another time series gauge.

Status answers use this projection to report active running-simulation controls.
