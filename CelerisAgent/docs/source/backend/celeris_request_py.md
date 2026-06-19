# `agent/celeris/request.py`

Owns the structured CELERIS config request that the LLM planner returns and deterministic code merges across chat turns.

Responsibilities:

- Provide default high-level CELERIS control values.
- Provide the JSON schema used by the specialist planner for `celeris_config`.
- Merge incoming planner output with existing job state without dropping known config fields.
- Normalize wave boundary settings, tsunami defaults, and earthquake initial-condition settings.
- Preserve internal `_explicit_fields` metadata from the planner so the generator can distinguish explicit user `dx`/`dy` values from schema/default values.
- Carry startup visualization config fields such as `colorVal_min`, `colorVal_max`, `colorMap_choice`, `surfaceToPlot`, overlays, arrows, logos, and view mode.

Earthquake initial-condition state:

- `initial_condition.source_model` selects `single_rectangle` or `usgs_finite_fault`.
- `initial_condition.finite_fault` stores downloadable USGS finite-fault metadata when research finds an `FFM.geojson` product.
- `finite_fault.selection = unconfirmed` means config generation should ask the user whether to use the finite-fault subfault solution or the simplified single-rectangle source.
- `finite_fault.selection = finite_fault` with `source_model = usgs_finite_fault` lets the finite-fault generator run.
- `finite_fault.selection = single_rectangle` with `source_model = single_rectangle` keeps the existing simplified source path.

Do not add natural-language keyword logic here for choosing between source models in OpenAI-enabled operation. The LLM planner should set these structured fields from the conversation.

Grid-spacing intent:

- The specialist planner returns a complete `celeris_config`, so numeric `dx`/`dy` values alone do not prove the user explicitly requested them.
- The planner also returns `celeris_config_explicit_fields`; include `dx` and/or `dy` only when the current user message explicitly specifies CELERIS grid spacing or model resolution.
- Config generation uses that metadata to default unspecified directions to DEM-native spacing, no finer than `2 m`.

Startup visualization intent:

- If the user requests initial/startup visualization settings while generating input files and the simulation is not already running, the planner should set the corresponding `celeris_config` fields and include those field names in `celeris_config_explicit_fields`.
- Runtime visualization changes for an already-running embedded simulation should still go through runtime controls instead of rewriting generated config files.
