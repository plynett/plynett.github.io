# Backend Source Map

The Python backend is organized by workflow domain. Keep LLM interpretation in planner/orchestrator modules and deterministic work in source, DEM, CELERIS, imagery, and shoreline modules.

## Entry Points

- `app.py`: process entry point; delegates to `agent.server`.
- `agent/server.py`: HTTP server, static root CELERIS file serving, CelerisAgent static files under `/CelerisAgent/`, chat API under `/CelerisAgent/api/`, artifact/case/configuration-archive download endpoints, lightweight auth endpoints, admin access-request and feedback endpoints, and direct non-LLM endpoints such as embedded simulation close.
- `agent/config.py`: workspace paths and environment-derived settings.
- `agent/auth.py`: file-backed testing auth for approved users, sessions, request-access submissions, admin approval that creates password-hashed users, user feedback submissions, and optional SMTP notification to the configured admin email or approved user. Auth is disabled until a local users file exists or `CELERIS_AUTH_MODE=required` is set. SMTP notification uses `CELERIS_ADMIN_EMAIL`, `CELERIS_SMTP_HOST`, `CELERIS_SMTP_PORT`, `CELERIS_SMTP_USER`, `CELERIS_SMTP_PASSWORD`, and `CELERIS_SMTP_FROM`. Approved users get the beta password from `CELERIS_APPROVED_USER_PASSWORD`, defaulting to the current shared testing password.

## Chat And Orchestration

- `agent/chat.py`: top-level chat turn orchestration and workflow sequencing. Appends a deterministic "Next to run a simulation" footer to each assistant response based on current job artifacts/state. Carries planner explicit-field metadata into internal config state so default values can be distinguished from user-specified config values. Stores pending mods-container click-edit values until the user confirms activation, and stores pending linear-structure setup values until the user supplies missing crest elevation, crest width, or side slope. If the runtime LLM returns a complete linear-structure form but omits the `design.prepare_linear_structure` command, `chat.py` deterministically queues that command from the structured form rather than asking again. Routes `plan_runtime_control` steps through the runtime sub-orchestrator before command execution, and preserves that runtime route when the planner returns runtime commands so a later generic close/stop normalizer cannot clear the embedded runner. Maintains a `runtime_state` projection from queued runtime commands so status answers can report active running-simulation controls separately from pre-runtime config defaults, including boundary, sediment, and time-series state. The exact Santa Cruz Harbor example-prompt request from the UI is answered deterministically with a fixed prompt sequence and no planner call.
- `agent/orchestrator.py`: high-level LLM routing across catalog/status/DEM/config/runtime/simulation actions. Receives structured research state, runtime state, and pending runtime forms so route decisions are LLM-owned rather than keyword-owned. Applies narrow safety normalization so explicit stop/close requests are the only route to simulation stop, pending mods confirmations return to runtime control, and running-simulation boundary/wave/time-series edits stay in runtime control unless the user explicitly asks to regenerate CELERIS files or close the embedded runner itself. The LLM is instructed to route runtime usage questions such as Explorer navigation to direct answers and runtime property/catalog questions to local control catalogs. Direct-answer scope policy is loaded from `agent/prompt_policy.py`.
- `agent/chat_planner.py`: specialist LLM planning and fallback planning. Receives structured research state so it can explicitly emit coordinates or config values when the conversation asks to use researched information. Returns `celeris_config_explicit_fields` to identify config values, such as `dx`/`dy`, that the current user message explicitly specified.
- `agent/chat_state.py`: persistent job state, transcript, request merge helpers.
- `agent/chat_hooks.py`: deterministic state mutation hooks requested by the LLM.
- `agent/chat_responses.py`: assistant response text derived from state and artifacts.
- `agent/chat_utils.py`: small chat helper functions.
- `agent/openai_client.py`: OpenAI Responses API wrapper and `gpt-5.4` planner model policy.
- `agent/prompt_policy.py`: shared prompt-policy fragments used by multiple LLM layers, including the canonical direct-answer topical guard.
- `agent/progress.py`: per-job progress events shown in the frontend while `/CelerisAgent/api/chat` is running.
- `agent/job_queue.py`: optional Redis/RQ queue adapter. In `auto` mode it falls back to synchronous local execution when Redis/RQ is unavailable; in `rq` mode queue availability is required.
- `agent/worker.py`: RQ worker entrypoint that reads a persisted chat request from the job workspace, runs `handle_chat()`, and writes `work/result.json` for the result endpoint.
- `agent/thread_archive.py`: deterministic export/restore of portable configuration archives. It packages generated outputs, JSON provenance, state, transcript, and a markdown thread summary; uploaded archives restore into the current job after validation and URL regeneration.
- `agent/research_context.py`: LLM-only relevance gate for deciding whether prior structured research should be exposed to the next planner turn. It does not encode geographic phrase rules; it asks the specialist model whether the current message refers to the same prior research object.
- `agent/catalog.py`: deterministic catalog answers for examples, runtime controls, and current state. Current-state answers prefer active `runtime_state` values, such as the current built-in example, boundary-container incident-wave parameters, and sediment-container settings, over pre-runtime config-generation defaults when an embedded runner is active.
- `agent/registry.py`: JSON registry loading.
- `agent/io_utils.py`: JSON and filesystem helpers.
- `agent/geo.py`: WGS84, meter, and degree-span bounding-box conversion helpers.
- `agent/research.py`: general direct-answer research layer with local CELERIS usage notes and optional OpenAI web search for finding/verifying external parameters and unknowns.
- `docs/earthquake_parameter_extraction.md`: USGS-focused instructions for extracting earthquake event, moment-tensor, and finite-fault parameters into structured state patches.

## DEM Workflow

- `agent/dem/types.py`: bathymetry grid dataclasses.
- `agent/dem/loaders.py`: GeoTIFF, NetCDF, ASCII, text/XYZ, MAT, NumPy, and ZIP loading. GeoTIFF loading records raster metadata such as band count, data type, color interpretation, and units so validation can distinguish elevation rasters from imagery. MATLAB bathymetry loading preserves `pcolor(x,y,h)` orientation, uses supplied `x`/`y` as primary axes, and preserves `lon`/`lat` as separate geographic mapping axes when present.
- `agent/dem/processing.py`: nodata, unit, sign, and grid normalization.
- `agent/dem/export.py`: `celeris_bathy.mat`, manifest, and preview export. Geographic axes are written as both `x`/`y` and `lon`/`lat` so later config generation and overlays can preserve WGS84 mapping.
- `agent/dem/validation.py`: deterministic DEM artifact checks, including hard rejection of image-like rasters such as RGB GeoTIFFs uploaded as DEMs.
- `agent/dem/workflow.py`: high-level DEM standardization workflow.

## Source Retrieval

- `agent/sources/aoi.py`: AOI bbox construction and state grounding, including exact WGS84 bbox creation for explicit longitude/latitude degree-span domains.
- `agent/sources/aoi_llm.py`: LLM-assisted geographic target and event-location resolution from evidence, including coastal targets and global DEM requests.
- `agent/sources/aoi_geocoder.py`: geocoder and evidence collection.
- `agent/sources/common.py`: shared source constants.
- `agent/sources/noaa_dav.py`: NOAA Data Access Viewer search/download/export.
- `agent/sources/coned_wcs.py`: USGS CoNED WCS discovery and extraction.
- `agent/sources/public_gridded.py`: public NOAA ImageServer fallback that queries NOAA DEM Global Mosaic for the best available gridded raster over the AOI, with CRM Mosaic and ETOPO 2022 Bedrock 15 arcseconds clipped GeoTIFF exports as fallbacks or explicit named-source paths.
- `agent/sources/tiered.py`: tiered DEM source policy.

## CELERIS Input And Runtime

- `agent/celeris/request.py`: LLM-normalized CELERIS config request, including explicit no-incident-wave state through `incident_wave_forcing = false`.
- `agent/celeris/waves.py`: `waves.txt` generation and periodic wave-component fitting. See [celeris_waves_py.md](celeris_waves_py.md).
- `agent/celeris/workflow.py`: `config.json`, `bathy.txt`, `waves.txt`, and case manifest generation.
- `agent/celeris/earthquake_ic.py`: optional earthquake initial free-surface generation for `etaInitCond.txt`.
- `agent/celeris/okada.py`: validated Okada DC3D helper functions for single-rectangle and USGS finite-fault earthquake source surfaces.
- `agent/celeris/launch.py`: local CELERIS runner URL and state.
- `agent/celeris/runtime_planner.py`: runtime-control sub-orchestrator. It routes running-simulation requests to panel groups, then asks panel-specific LLM planners to return validated semantic commands and, for design linear structures, a structured partial form when required values are missing or malformed. Supported panel groups include examples, simulation, visualization, design, mods, boundary, sediment, and timeseries.
- `agent/celeris/runtime_controls.py`: runtime command planning/validation from registry. See [celeris_runtime_controls_py.md](celeris_runtime_controls_py.md).

## Imagery And Shoreline

- `agent/imagery/overlay.py`: satellite overlay image generation from final model-domain extents. It uses preserved final model lon/lat axes when available, otherwise maps local model meters onto the extracted/requested DEM WGS84 bbox rather than the full source coverage bbox.
- `agent/shoreline/anchor.py`: deterministic local shoreline anchoring using OSM/Natural Earth geometry.

## Compatibility Scripts

- `scripts/tiered_dem_retrieval.py`: CLI/debug wrapper for tiered DEM retrieval.
- `scripts/create_user.py`: local helper for manually approving testing users by creating or updating password-hashed records in `workspace/auth/users.json`.
- `scripts/validate_usgs_okada_deformation.py`: developer diagnostic comparing local finite-fault Okada deformation against USGS `surface_deformation.disp`.

Avoid adding phrase-specific geographic rules to any backend script. Geographic intent should come from the LLM plus deterministic evidence, then deterministic code should execute the selected structured operation.
