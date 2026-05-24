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
- Mouse-based bathymetry/friction/source/free-surface edits.
- Design-component placement.
- Explorer/camera controls for 3D view.
- Time-series location management.
- File input handlers.
- Export buttons for images, GIFs, JSON config, and simulation surfaces.

The UI does not directly mutate GPU textures. It changes `calc_constants` and sets flags such as `html_update`, `click_update`, or `add_Disturbance`; the frame loop then dispatches the appropriate compute shader and texture copies.

## Important Contracts

- Shader selection is driven by `Accuracy_mode` and `NLSW_or_Bous`.
- Handler argument order is critical because `main.js` passes textures positionally.
- The PCR tridiagonal solver depends on the paired `BaseToA`, `AToB`, and `BToA` bind groups created here for both x and y directions.
- The render bind group is shared by 2D and 3D rendering.
- COULWAVE mode requires multiple 2D temporary textures to be copied into layers of `txCW_groupings`.
- Sediment update can modify `txBottom`, so it must be followed by near-dry refresh and, for dispersive modes, tridiagonal coefficient refresh.

## Change Notes

This file is monolithic and highly coupled. Prefer localized changes that preserve the existing pass order. Before changing a texture's meaning, search for every handler and shader binding that consumes that texture. Before changing render bind-group arguments, audit the older overlay-refresh call sites, because some appear to use a legacy argument order.
