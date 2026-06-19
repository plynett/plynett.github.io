# `agent/celeris/workflow.py`

Generates deterministic CELERIS case files from the current bathymetry and structured config request.

Responsibilities:

- Load `outputs/celeris_bathy.mat`.
- Interpolate bathymetry to the requested CELERIS model grid.
- Read `celeris_bathy.mat` through the same DEM MATLAB loader used for uploads, preserving `pcolor(x,y,h)` orientation and lon/lat axes when present.
- Fill bathymetry NaNs before writing `bathy.txt`.
- Apply the Boussinesq depth cap when relevant.
- Write `bathy.txt`, `waves.txt`, `config.json`, and `celeris_case_manifest.json`.
- Generate optional earthquake initial-condition and satellite-overlay artifacts.
- Emit optional fine-grained progress callbacks during config generation so the chat UI can show current sub-steps.
- If CELERIS `dx` and/or `dy` were not explicitly specified by the user, default each unspecified direction to DEM-native spacing with a `2 m` minimum.
- Write explicitly requested startup visualization settings into `config.json`; otherwise use workflow defaults such as Turbo `+/- slip/3` for earthquake initial-condition cases.
- Fill bathymetry NaNs with a fast row/column linear interpolation path and nearest-neighbor extrapolation/fill for remaining cells. Do not use global scattered `griddata` over the full model grid for routine bathy gaps; it is too slow for large grids and edge-only NaNs.
- When generating incident-wave `waves.txt`, apply along-boundary phase fitting only if the two boundaries transverse to the incident-wave boundary are both periodic. Non-periodic cases preserve the requested/generated wave directions.

Finite-fault selection guard:

- If `initial_condition.finite_fault.available = true`, a URL exists, and `finite_fault.selection = unconfirmed`, generation returns `needs_initial_condition_source_choice`.
- The response should ask whether to use the USGS finite-fault subfault solution or the simplified single-rectangle average source.
- Generation proceeds only after the LLM sets a concrete selection in `agent/celeris/request.py` state.
- Finite-fault source surfaces may be evaluated on finite-fault/source spacing before interpolation, but final CELERIS `dx`/`dy` follow the general grid-spacing default: explicit user values when provided, otherwise DEM-native spacing with a `2 m` minimum.

This module validates and executes structured state. It should not parse conversational phrases to decide source-model intent.
