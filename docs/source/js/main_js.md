# `js/main.js`

[Source](../../../js/main.js)

## What This File Owns

`main.js` is the application orchestrator. It initializes WebGPU, loads scenario inputs, allocates every major GPU resource, creates shader pipelines and bind groups, runs the simulation loop, manages the render loop, handles most UI events, and triggers export/readback operations.

This is the file that turns the collection of shader passes into an actual coastal-wave model.

## Startup Responsibilities

The initialization path loads config, bathymetry, waves, optional overlays, optional initial surfaces, and model assets. It then:

- Requests the WebGPU adapter/device and configures the canvas. The device request asks for the adapter-supported `maxTextureDimension2D`, which allows long boundary time-series textures to exceed the default 8192 rows on GPUs that report a higher limit.
- Destroys old textures when a new scenario starts.
- Creates uniform buffers for simulation, render, tridiagonal, and specialized pass constants.
- Allocates simulation textures, diagnostics textures, sediment textures, COULWAVE textures, optional spherical metric textures, render textures, and time-series textures.
- Copies CPU-loaded data into GPU textures.
- Attempts Google Maps overlay loading as an optional startup step; failures reset overlay flags and do not block local/example overlay loading.
- Fetches WGSL shader source and creates compute/render pipelines.
- Creates all bind groups through the `Handler_*.js` modules.
- Starts the animation frame loop.

The page also supports an optional CelerisAgent case startup path. When the URL includes
`agent_case=<manifest-url>&autostart=1`, `main.js` fetches the manifest, loads the referenced
`config.json`, `bathy.txt`, and `waves.txt` files as text, optionally loads `overlay.jpg` as a
blob when the manifest provides `files.overlay`, optionally loads `etaInitCond.txt` when the
manifest provides `files.initial_eta`, and passes them into the same
`initializeWebGPUApp(configContent, bathymetryContent, waveContent, overlayBlob, ..., initialEtaBlob)`
path used by manual file uploads. This path posts lightweight status messages to a parent iframe
but does not alter the solver, shader, or example-loading code paths.

For embedded CelerisAgent operation, `main.js` also installs the runtime control bridge from
`js/agent_controls.js` after the normal HTML update helpers are defined. The bridge exposes
semantic commands for examples, pause/resume, and the Modify Visualization panel through
`window.CelerisAgentControls` and the `celeris-agent-command` `postMessage` channel. These
commands reuse the same `calc_constants` update path as the hidden HTML controls rather than
introducing separate render logic. The view-mode command refreshes the Explorer zoom listener, and
the fullscreen command invokes the existing fullscreen button path only when fullscreen is not
already active. The bridge receives a live `getCalcConstants()` getter because `calc_constants` is
reassigned when examples or agent cases load; runtime state replies must read the current object, not
the original install-time object. Design-container commands use the same bridge to select surface-cover components,
set optional radius/friction values, prepare linear-structure cross-sections, switch the active
linear-structure endpoint, and queue the existing Add Linear Structure path. The add callback returns
`{ok, message}` for agent calls while preserving the native alert behavior for manual UI clicks; the
GPU apply path continues to reset only start/end endpoint state and leaves crest elevation, crest
width, and side slope unchanged. Agent-selected design workflow mode gates the shared design-panel
click handlers so surface-cover editing ignores right-click endpoint placement, and linear-structure
editing ignores left-click component painting.

The Agent bridge also exposes the mods-container click-edit path through a confirmed runtime command.
Root CELERIS receives only the activation command; natural-language interpretation and confirmation
stay in CelerisAgent. Activation sets `whichPanelisOpen=3`, the requested `surfaceToChange`,
`changeType`, and optional `changeAmplitude`/`changeRadius`, then the existing click-update shader
handles bathy/topo, friction, passive tracer source, or free-surface edits.

For embedded CelerisAgent status display, the render loop mirrors the current simulated time and
faster-than-realtime ratio into `calc_constants.agent_total_time`,
`calc_constants.agent_total_time_since_http_update`, and
`calc_constants.agent_faster_than_realtime_ratio`. These are display/provenance values only; they do
not drive solver behavior.
When boundary type `5` files are loaded, `calc_constants.start_time_shift` is set from the first shared boundary-file time, and the render loop adds it directly to `total_time`. Boundary forcing, nested-run point time series, diagnostics, trigger checks, and nested outputs then use the same parent/global clock. Ordinary point time series remain zero-based and restart at zero when a gauge changes or its configured duration rolls over. Nested point-series chart windows retain absolute timestamps and move their x-axis window at each reset.

## Main Simulation Loop

The `frame()` loop runs one or more simulation timesteps per rendered frame. The `render_step` value is adjusted dynamically to balance speed and browser responsiveness. Each timestep follows the pass order documented in `docs/architecture/SIMULATION_PIPELINE.md`.

Important state transitions inside the loop:

- `txState` is the canonical current state.
- `txNewState` is produced by `Pass3` and post-processed by boundary/tridiagonal passes.
- `current_stateUVstar` holds the intermediate explicit/dispersive state.
- Gradient history textures are shifted after each completed timestep.
- Diagnostic textures are updated after the new state is accepted.
- Nested-grid boundary time-series output, when active, samples rectangle-edge `eta/hu/hv` from the accepted `txNewState` before it is copied back into `txState`.

The loop has separate branches for NLSW, Boussinesq, and COULWAVE modes. NLSW bypasses the tridiagonal solve, while Boussinesq and COULWAVE run the PCR solver after the explicit/source-term pass.

For the PCR solver, `main.js` creates three coefficient bind groups per direction: base coefficients to `newcoef_*`, `newcoef_*` to `txtemp_PCR*`, and `txtemp_PCR*` back to `newcoef_*`. This lets `Run_Tridiag_Solver.js` alternate coefficient textures between iterations without issuing a full texture copy after every PCR pass.

## Interaction And UI

Most DOM event listeners are registered in this file:

- Scenario selection and start/restart controls.
- Config panel edits.
- Incident-wave UI edits. Sine-wave forcing regenerates `txWaves` as one `[amplitude, period, directionRadians, phaseRadians]` row from the UI height, period, and direction controls. TMA forcing generates directional spectrum rows through `Wave_Generator.js` and uploads them through the same texture path.
- Mouse-based bathymetry/friction/source/free-surface edits.
- Design-component placement.
- Explorer/camera controls for 3D view.
- Explorer keyboard navigation uses physical `W/A/S/D` key codes and arrow keys only while `viewType == 2`, and keyboard shortcuts are ignored while focus is in form fields. The view-mode selector blurs after changes so choosing non-fullscreen Explorer mode does not trap WASD focus.
- Explorer pointer controls use left-drag for pan and right-drag for rotation; `Ctrl + left-drag` is also accepted as a Mac-friendly rotation fallback.
- In Explorer mode, one-finger touch drag rotates the camera using the same yaw/pitch path as right-drag.
- In Explorer mode on touch devices, two-finger horizontal drag strafes left/right, and pinch maps to the same forward/back `shift_y` movement used by `W/S` and up/down keys.
- In Explorer mode with `grid_type == 2`, the camera path converts longitude/latitude degree spacing into approximate meter-scale X/Y coordinates for initial position, clipping, movement, terrain lookup, and the view-projection model transform. This keeps spherical solver/render uniforms unchanged while avoiding a degree-horizontal/meter-vertical camera mismatch.
- Fullscreen entry falls back to an inline pseudo-fullscreen canvas layout when the browser rejects or lacks `requestFullscreen`; the fullscreen button remains visible as the exit control, and mobile viewport resize events are debounced.
- Time-series location management.
- Pointer-to-domain coordinate conversion uses the visible `object-fit: contain` content rectangle rather than the raw canvas element rectangle. The helper respects CSS `object-position`, which lets the embedded Agent runner anchor the rendered simulation at the top-left of its split while keeping tooltip, time-series, and design-click mapping aligned.
- For `grid_type == 2`, tooltip coordinates are displayed as longitude/latitude degrees by adding the pointer offsets to `lon_LL` and `lat_LL`.
- For `grid_type == 2`, time-series point inputs and right-click feedback are displayed as absolute longitude/latitude, but the stored `locationOfTimeSeries` values remain lower-left-relative offsets so the existing time-series texture upload and shaders continue to receive grid-relative coordinates.
- Linear-structure management for the engineered-design panel. Crest elevation, crest width, side slope, current endpoint selection, and start/end coordinates are stored in `calc_constants`; right-clicking in Design mode while the engineered-design panel is open records the selected endpoint. The preview is plotted only while that panel is open. The Add Linear Structure button validates the endpoints and queues a `MouseClickChange.wgsl` bathy/topo edit; after the GPU copy-back and near-dry/tridiagonal refresh complete, the stored endpoints and preview are reset.
- File input handlers.
- Optional Start Here uploads for west/east/south/north boundary type `5` time-series files; uploaded files are passed into initialization and override the matching `ts_*_file` fetch path.
- Export buttons for images, GIFs, JSON config, simulation surfaces, and nested-grid boundary time-series rectangle outputs. While nested-grid output is active, every active rectangle is drawn as a black outline through the existing `txDraw` overlay. The rectangle uses lower-left model-grid `j` indices for capture, but the overlay y coordinate is inverted when drawing because the shared draw canvas is already vertically flipped before upload. The nested output UI edits the legacy/first rectangle; additional rectangles can be configured through `nestedGridOutput_rectangles`. The nested output UI also exposes `nestedEtaWriteThreshold`, which trims quiet leading samples from the final downloaded files during readback rather than changing the GPU sampling pass.

The UI does not directly mutate GPU textures. It changes `calc_constants` and sets flags such as `html_update`, `click_update`, or `add_Disturbance`; the frame loop then dispatches the appropriate compute shader and texture copies.

## Important Contracts

- Shader selection is driven by `Accuracy_mode`, `NLSW_or_Bous`, and `grid_type`. When `grid_type == 2`, NLSW uses `Pass3_NLSW_Spherical.wgsl`.
- Handler argument order is critical because `main.js` passes textures positionally.
- In spherical NLSW mode, Pass3 binding `19` carries `txSphericalMetrics` instead of `txDissipationFlux`; the shared layout is unchanged to stay within WebGPU binding limits.
- `txWaves` is normally loaded from `waves.txt`, but UI-selected sine and TMA forcing reuse the same texture contract. Sine sets `numberOfWaves` to 1, converts UI height to amplitude with `H / 2`, and converts UI direction from degrees to radians. Sine and TMA both fit directions so phase is periodic across the active forcing span only when the boundaries transverse to the wave boundary are periodic. TMA generates a cached spectrum from the incident-wave controls, updates `numberOfWaves`, and reuploads the wave texture without resetting wave-height diagnostics.
- Boundary type `5` loads per-side `eta/hu/hv` forcing files into `txBoundaryTimeSeriesSouth/North/West/East`. `main.js` computes one shared time bracket per simulation step using the shifted/global `total_time` and stores the bracket in the `BoundaryPass` uniform buffer; the shader performs station-space interpolation along the active boundary.
- Nested-grid boundary output dynamically allocates four compact edge textures for each active output rectangle when the user starts capture. If `nestedGridOutput_rectangles` is absent or has no enabled entries, the legacy scalar `nestedGridOutput_*` fields produce one rectangle exactly as before. Additional rectangle prefixes default to `nestedGridOutput_file_prefix`, `nestedGridOutput_file_prefix2`, `nestedGridOutput_file_prefix3`, etc., so a base prefix of `gridD` produces `gridD`, `gridD2`, and `gridD3`. Requested sample counts above the configured maximum are capped by increasing each rectangle's output `dt` and logging a warning. Each rectangle uses its own uniform buffer, bind group, and four output textures. Readback/download waits until no rectangles are still actively sampling, then completed rectangle textures are read and released; optional threshold trimming drops quiet leading rows while preserving shifted/global times in the boundary files.
- The PCR tridiagonal solver depends on the paired `BaseToA`, `AToB`, and `BToA` bind groups created here for both x and y directions.
- The render bind group is shared by 2D and 3D rendering.
- Linear-structure preview uniforms are appended to the render uniform buffer and are populated from `calc_constants` before each render write. The preview is panel-gated and draws endpoint dots and the connecting segment in `fragment.wgsl`. Linear-structure bathy/topo edits are dispatched separately through `MouseClickChange.wgsl`, then copied into `txBottom` with the same near-dry and tridiagonal refresh sequence used by manual bathy/topo edits.
- Loaded JSON box models use the same model pipeline in both render modes: Explorer draws them with the perspective camera, while Design draws them after the 2D quad with a top-down clip-space projection so they appear as footprints. In Design mode, the model draw is scissored around overlay areas: above the bottom colorbar when the colorbar is visible, and out of the two upper logo corners when `ShowLogos == 0`. The colorbar scissor is skipped for the free-surface Ocean/photo-realistic display where the colorbar is not shown.
- Google Maps overlay loading is optional. A failed Static Maps fetch should leave `GoogleMapOverlay`, `IsGMMapLoaded`, and `IsOverlayMapLoaded` cleared so the model can continue and local overlays can still be considered.
- Overlay UI changes rebuild the render bind group when switching back to a loaded Google Maps or satellite overlay; those calls must keep the same full argument order as the initial render bind group creation.
- COULWAVE mode requires multiple 2D temporary textures to be copied into layers of `txCW_groupings`.
- Sediment update can modify `txBottom`, so it must be followed by near-dry refresh and, for dispersive modes, tridiagonal coefficient refresh.

## Change Notes

This file is monolithic and highly coupled. Prefer localized changes that preserve the existing pass order. Before changing a texture's meaning, search for every handler and shader binding that consumes that texture. Before changing render bind-group arguments, audit the older overlay-refresh call sites, because some appear to use a legacy argument order.
