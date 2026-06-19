# agent/research.py

General direct-answer research layer for CelerisAgent.

Responsibilities:

- Answer direct user questions that are not themselves workflow execution requests.
- Provide local CELERIS usage notes to the direct-answer LLM so questions such as Explorer mode navigation or available time-series controls can be answered from repository documentation without web search.
- Use OpenAI web search when the user asks to find, look up, retrieve, verify, or determine external/current information.
- Apply the shared direct-answer topical guard from `agent/prompt_policy.py`, including the no-web-search rule for out-of-scope general questions.
- For USGS earthquake source extraction, gather deterministic ComCat event-detail evidence before the LLM answer. This includes event products, newest finite-fault geometry, moment tensor nodal planes, finite-fault content URLs, FFM slip summaries, and moment-equivalent uniform slip for the simplified Okada source.
- Return source-backed answers with useful parameters, units, URLs, uncertainty, and missing fields.
- Return structured extracted parameters and a proposed state patch when values map cleanly to known agent state.
- When a downloadable USGS `FFM.geojson` is available, preserve its URL and product metadata in the proposed patch so config generation can ask the user which source model to use.
- Prefer authoritative primary sources such as USGS, NOAA, government agencies, official product pages, journals, and data repositories.

Non-responsibilities:

- Do not mutate job state.
- Do not generate DEMs, CELERIS inputs, runtime commands, or other artifacts.
- Do not invent missing parameters. Prefer authoritative values first, then clearly label derived physical estimates when the workflow needs a complete source model.

Structured patches:

- Research may propose a patch for `celeris_config.initial_condition`.
- Finite-fault geometry should be preferred over moment-tensor nodal-plane guesses when available.
- Do not map USGS finite-fault `model-length` / `model-width` directly to `initial_condition.length_km` / `width_km`; those are inversion-plane dimensions.
- When `FFM.geojson` is available, derive effective rupture dimensions from the active slipped subfault patch. The current deterministic first-pass threshold is slip >= 10 percent of maximum finite-fault slip.
- For `initial_condition.slip_m`, use moment-equivalent uniform slip from `M0 = mu * area * slip` over that effective rupture area, while recording USGS maximum slip separately in notes.
- Also store `initial_condition.source_model = single_rectangle` and `initial_condition.finite_fault.selection = unconfirmed` when a downloadable finite-fault grid exists. The research layer records availability; it does not choose between the finite-fault subfault source and the simplified single-rectangle average source.
- The patch is stored in `state.last_research.proposed_patch` with source and confidence metadata.
- The patch is not applied during direct research.
- A later user command such as "use those values" or "apply the USGS parameters" should be interpreted by the LLM orchestrator. If the LLM routes that turn to config generation, deterministic code merges recognized patch fields.
- If the current config-generation turn already contains a concrete source choice (`finite_fault.selection = finite_fault` or `single_rectangle`), that current user choice must survive the research patch merge. The reusable research patch's default `unconfirmed` value must not overwrite an explicit current-turn selection.
- Unrecognized targets remain answer-only until a deterministic merge path is implemented.

Typical use:

- "Find information about the earthquake parameters online, for example at the USGS site."
- "Can you verify the NOAA datum for this dataset?"
- "Look up the published wave buoy station metadata."

If research results should drive a workflow, the user should follow up with an explicit command such as "use those values to create the earthquake initial condition."
