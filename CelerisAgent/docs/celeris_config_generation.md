# CELERIS Config Generation

This stage creates CELERIS WebGPU case input files after the DEM stage has produced `outputs/celeris_bathy.mat`.

Generated files:

- `outputs/config.json`
- `outputs/bathy.txt`
- `outputs/waves.txt`
- `outputs/etaInitCond.txt`, when an earthquake initial condition is requested
- `outputs/earthquake_ic_manifest.json`, when `etaInitCond.txt` is generated
- `outputs/earthquake_ic_preview.png`, when `etaInitCond.txt` is generated
- `outputs/celeris_case_manifest.json`
- `outputs/overlay.jpg`, when satellite imagery can be resolved and downloaded
- `outputs/overlay_manifest.json`, when `overlay.jpg` is generated

The LLM is responsible for interpreting the user's conversational simulation setup request and returning a complete CELERIS config object. Deterministic scripts are responsible for loading `celeris_bathy.mat`, interpolating the bathymetry to the model grid, computing derived values, and writing files.

Minimum required user input for incident-wave config generation:

- wave direction

If the user requests no incident wave forcing, no incoming boundary waves, or an initial-value-only run, the LLM should set:

- `incident_wave_forcing = false`
- `wave_boundary = null`
- `Thetap = null`
- `wave_direction_degrees = null`

In this no-incident-wave case, do not ask for wave direction. The generator writes `waves.txt` with a zero-amplitude placeholder row so the CELERIS file loader receives a valid wave file.

Earthquake/tsunami initial-condition-only runs do not require a wave direction. If the user asks to load or generate an earthquake initial condition and does not also request incident wave forcing, treat the case as a tsunami initial-value problem:

- set `NLSW_or_Bous = 0` for NLSW simulation
- set `west_boundary_type = 1`
- set `east_boundary_type = 1`
- set `south_boundary_type = 1`
- set `north_boundary_type = 1`
- write `waves.txt` with a zero-amplitude placeholder row only so the CELERIS file loader receives a valid wave file

Default values from `Step2_create_Celeris_inputs_periodic.m`:

- `NLSW_or_Bous = 1`
- `dx = 2.0`
- `dy = 2.0`
- `Courant_num = 0.2`
- `isManning = 0`
- `friction = 0.0025`
- `Hmo = 2.0`
- `Tp = 15.0`
- `g = 9.81`
- `Theta = 2.0`
- `dissipation_threshold = 0.3`
- `whiteWaterDecayRate = 0.02`
- `timeScheme = 2`
- `seaLevel = 0.0`
- `Bcoef = 0.06666667`
- `tridiag_solve = 2`

Direction convention:

- `Thetap = 0`: waves from west
- `Thetap = 90`: waves from south
- `Thetap = 180`: waves from east
- `Thetap = 270`: waves from north

Boundary type values:

- `0`: solid wall
- `1`: sponge layer
- `2`: waves loaded from `waves.txt`
- `3`: periodic boundary condition

First-pass boundary policy:

- If waves come from the west, set `west_boundary_type = 2`.
- If waves come from the east, set `east_boundary_type = 2`.
- If waves come from the south, set `south_boundary_type = 2`.
- If waves come from the north, set `north_boundary_type = 2`.
- Set all other boundaries to `0` unless the user explicitly provides different boundary types.
- Incident-wave cases validate that exactly one boundary has type `2`.
- Earthquake/tsunami initial-condition-only cases validate that no boundary has type `2`; all four boundaries should be sponge layers.

The deterministic config generator ports the Korea `spectrum_2D_periodic.m` behavior to Python. It applies the corrected boundary-length logic:

- west/east wave boundary length is `y_interp(end) - y_interp(1)`
- south/north wave boundary length is `x_interp(end) - x_interp(1)`
- Wave spectrum components are fitted to periodic side-boundary phase only when the two boundaries transverse to the incident-wave boundary are configured as periodic boundaries.
- When that periodic fit is active, the fitting uses the shader's active forcing span, `boundary_length - 2 * ds`, because the boundary shader measures along-boundary coordinates from index `1` to index `N-2`.
- For each retained directional-frequency component, the along-boundary wavenumber must satisfy `k_parallel * active_boundary_length = 2*pi*N` for an integer `N`, preserving the sign of the original directional component. This keeps the random-phase component value identical at both ends of the active wave boundary.
- When the transverse boundaries are not periodic, preserve the requested/generated component directions and do not quantize them.

`bathy.txt` must not contain NaN values. After interpolation to the CELERIS model grid, fill missing cells with linear interpolation where possible, then nearest-neighbor extrapolation for any remaining edge or exterior cells. Record the fill counts in `celeris_case_manifest.json` and validation metadata.

For Boussinesq modes (`NLSW_or_Bous = 1` or `2`), cap the deepest allowable water depth to `30 * dx`. Any interpolated bathymetry elevation below `-30 * dx` must be set to `-30 * dx` before computing `base_depth`, writing `bathy.txt`, writing `config.json`, or generating `waves.txt`. Record the cap limit and number of clipped cells in `celeris_case_manifest.json` and validation metadata.

The config-generation stage should never claim files are ready until the deterministic script writes them.

CELERIS grid-spacing default:

- The LLM should mark `dx` and/or `dy` as explicit only when the current user message directly specifies CELERIS grid spacing or model resolution.
- If `dx` and/or `dy` are not explicitly specified, config generation defaults each unspecified direction to the DEM-native spacing, with a minimum value of `2 m`.
- If the DEM-native spacing is finer than `2 m`, use `2 m` for the unspecified direction.
- If the user explicitly specifies `dx` and/or `dy`, preserve the explicit value for that direction.
- Record any DEM-derived default in `celeris_case_manifest.json` and validation metadata.

Startup visualization settings:

- If the user requests visualization settings while generating CELERIS input/config files and the simulation is not already running, write those startup settings into `config.json`.
- Supported startup visualization config fields mirror the runtime visualization controls: `surfaceToPlot`, `colorMap_choice`, `colorVal_min`, `colorVal_max`, `showBreaking`, `GoogleMapOverlay`, `ShowArrows`, `arrow_scale`, `arrow_density`, `ShowLogos`, and `viewType`.
- The LLM should mark each explicitly requested startup visualization field in `celeris_config_explicit_fields`.
- For example, "set the initial colorscale from -0.5 to 0.5" should set `colorVal_min = -0.5`, `colorVal_max = 0.5`, and mark both fields explicit.
- For earthquake initial-condition simulations, the default startup visualization remains free surface with Turbo colormap and symmetric limits `+/- slip_m / 3`; explicit user startup visualization values override this default.

Earthquake initial free-surface generation:

- If the user asks for an earthquake, tsunami, Okada, seafloor-displacement, or initial-free-surface condition, set `celeris_config.initial_condition.enabled = true` and `type = earthquake_okada`.
- For earthquake initial-condition-only tsunami simulations, default to NLSW (`NLSW_or_Bous = 0`) and sponge layers on all four boundaries. Keep incident-wave boundary behavior only when the user explicitly asks for waves as well.
- The initial condition is generated after `celeris_bathy.mat` is interpolated to the final CELERIS model grid. It must have exactly the same row/column shape as `bathy.txt`.
- The first-pass generator writes `etaInitCond.txt`, `earthquake_ic_manifest.json`, and `earthquake_ic_preview.png`, and sets `loadetaIC = 1` in `config.json`.
- For earthquake initial-condition simulations, set the initial visualization to free surface with Turbo colormap (`colorMap_choice = 2`) and symmetric color limits `colorVal_min/colorVal_max = +/- slip_m / 3`, unless the user explicitly requested startup visualization values.
- If `center_lon` and `center_lat` are not supplied in the initial-condition request, the generator uses the current DEM/domain center when available, otherwise the model-domain center.
- Default large subduction-zone parameters are `depth_km = 15`, `dip_deg = 10`, `rake_deg = 90`, `length_km = 400`, `width_km = 150`, `slip_m = 10`, `rigidity_pa = 30000000000`, and `poisson_ratio = 0.25`.
- `strike_deg` is strongly preferred. If it is missing, the first-pass generator uses `strike_deg = 0` and records a validation warning.
- Online research may store a proposed `celeris_config.initial_condition` patch in `state.last_research.proposed_patch`. Apply that patch only as part of a turn that the LLM routes to CELERIS config generation; do not use script-side keyword checks to reinterpret DEM/source requests as config requests.
- If online research found a downloadable USGS `FFM.geojson`, the patch should preserve both source options: the simplified single-rectangle source and the finite-fault subfault source. Config generation must ask for the user's source-model choice while `finite_fault.selection = unconfirmed`, then proceed only after the LLM sets either `source_model = usgs_finite_fault` / `finite_fault.selection = finite_fault` or `source_model = single_rectangle` / `finite_fault.selection = single_rectangle`.
- The finite-fault path prefers the USGS `surface_deformation.disp` file when available and interpolates its vertical displacement directly to the final CELERIS grid.
- If `surface_deformation.disp` is unavailable, use `okada-wrapper` DC3D to evaluate `FFM.geojson` subfaults on a finite-fault-resolution source grid, then interpolate that surface to the final CELERIS grid.
- If both `surface_deformation.disp` and `okada-wrapper` are unavailable, fail the initial-condition generation. Do not create a synthetic finite-fault slip-raster or other Okada-like proxy.
- Finite-fault source surfaces are still evaluated at finite-fault/source resolution before interpolation to the final CELERIS grid. The final CELERIS grid follows the general grid-spacing default above: explicit user `dx`/`dy` when provided, otherwise DEM-native spacing with a `2 m` minimum.
- If the final CELERIS model grid preserves `lon` and `lat` axes from a geographic DEM, map `center_lon`/`center_lat` directly through those axes. The USGS event epicenter must remain the earthquake source location; do not replace it with a DEM-request center inferred during geographic search.
- The single-rectangle source requires `okada-wrapper` DC3D. If Okada cannot be imported or evaluated, fail the initial-condition generation and do not create a tapered rectangular proxy.

Satellite overlay generation:

- After successful CELERIS input generation, run the `satellite_overlay_generation` node by default.
- The overlay node must use the final CELERIS model grid/domain, not the raw DEM request alone. For geographic tsunami grids, use the final model-grid WGS84 limits directly so `overlay.jpg` has the same lon/lat limits as the DEM/CELERIS grid.
- The case manifest stores `domain_georeferencing`, including final local model bounds and the resolved WGS84 bbox.
- The first-pass overlay generator creates an axis-aligned, north-up `overlay.jpg` using tiled satellite imagery requests. It tries Esri World Imagery first and falls back to the EOX Sentinel-2 cloudless WMS pattern used in the MATLAB prototype. The image is capped at 8192 pixels in either direction.
- If georeferencing or imagery download fails, config generation remains complete and the overlay failure is reported as a validation warning.

Simulation launch bridge:

- After `config.json`, `bathy.txt`, and `waves.txt` exist, CelerisAgent exposes a case manifest at `/CelerisAgent/api/jobs/<job_id>/celeris-case`.
- The manifest contains absolute URLs for the three generated input files, includes `files.overlay` when `outputs/overlay.jpg` exists, and includes `files.initial_eta` when `outputs/etaInitCond.txt` exists.
- The root CELERIS WebGPU agent page can be opened on the same host with `/agent.html?agent_case=<manifest-url>&autostart=1`; it fetches those text files and starts through its normal `initializeWebGPUApp(...)` path.
- CelerisAgent displays that runner inside the central conversation panel. Portrait/tall domains use a left-right split with the simulation on the right; landscape/wide domains use a top-bottom split with the simulation below the chat transcript.
- The embedded runner can be cleared through the Simulation panel close button or a conversational stop/close request. The stop hook removes the iframe and layout split by clearing `celeris_run`; generated `config.json`, `bathy.txt`, and `waves.txt` remain in the job workspace.
- The launch bridge must not modify generated case files, root `examples` folders, shaders, or numerical solver code.
