# `js/main.js`

[Source](../../../js/main.js)

## What This File Owns

`main.js` is the application orchestrator. It initializes WebGPU, loads scenario inputs, allocates every major GPU resource, creates shader pipelines and bind groups, runs the simulation loop, manages the render loop, handles most UI events, and triggers export/readback operations.

This is the file that turns the collection of shader passes into an actual coastal-wave model.

## Startup Responsibilities

The initialization path loads config, bathymetry, waves, optional overlays, optional initial surfaces, and model assets. It then:

- Requests the WebGPU adapter/device and configures the canvas.
- Destroys old textures when a new scenario starts.
- Creates uniform buffers for simulation, render, tridiagonal, and specialized pass constants.
- Allocates simulation textures, diagnostics textures, sediment textures, COULWAVE textures, render textures, and time-series textures.
- Copies CPU-loaded data into GPU textures.
- Attempts Google Maps overlay loading as an optional startup step; failures reset overlay flags and do not block local/example overlay loading.
- Fetches WGSL shader source and creates compute/render pipelines.
- Creates all bind groups through the `Handler_*.js` modules.
- Starts the animation frame loop.

## Main Simulation Loop

The `frame()` loop runs one or more simulation timesteps per rendered frame. The `render_step` value is adjusted dynamically to balance speed and browser responsiveness. Each timestep follows the pass order documented in `docs/architecture/SIMULATION_PIPELINE.md`.

Important state transitions inside the loop:

- `txState` is the canonical current state.
- `txNewState` is produced by `Pass3` and post-processed by boundary/tridiagonal passes.
- `current_stateUVstar` holds the intermediate explicit/dispersive state.
- Gradient history textures are shifted after each completed timestep.
- Diagnostic textures are updated after the new state is accepted.

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
- Fullscreen entry falls back to an inline pseudo-fullscreen canvas layout when the browser rejects or lacks `requestFullscreen`; the fullscreen button remains visible as the exit control, and mobile viewport resize events are debounced.
- Time-series location management.
- Linear-structure management for the engineered-design panel. Crest elevation, crest width, side slope, current endpoint selection, and start/end coordinates are stored in `calc_constants`; right-clicking in Design mode while the engineered-design panel is open records the selected endpoint. The preview is plotted only while that panel is open. The Add Linear Structure button validates the endpoints and queues a `MouseClickChange.wgsl` bathy/topo edit; after the GPU copy-back and near-dry/tridiagonal refresh complete, the stored endpoints and preview are reset.
- File input handlers.
- Export buttons for images, GIFs, JSON config, and simulation surfaces.

The UI does not directly mutate GPU textures. It changes `calc_constants` and sets flags such as `html_update`, `click_update`, or `add_Disturbance`; the frame loop then dispatches the appropriate compute shader and texture copies.

## Important Contracts

- Shader selection is driven by `Accuracy_mode` and `NLSW_or_Bous`.
- Handler argument order is critical because `main.js` passes textures positionally.
- `txWaves` is normally loaded from `waves.txt`, but UI-selected sine and TMA forcing reuse the same texture contract. Sine sets `numberOfWaves` to 1, converts UI height to amplitude with `H / 2`, and converts UI direction from degrees to radians. TMA generates a cached spectrum from the incident-wave controls, updates `numberOfWaves`, and reuploads the wave texture without resetting wave-height diagnostics.
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
