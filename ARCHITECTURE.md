# Celeris-WebGPU Architecture

Celeris-WebGPU is a static browser application that runs a coastal wave model almost entirely on the GPU. The browser loads vanilla JavaScript modules, creates WebGPU textures and pipelines, then advances the shallow-water or Boussinesq state through a sequence of WGSL compute passes. There is no server, package manager, build step, or transpilation layer. The source files in `js/` and `shaders/` are the application.

This document intentionally excludes the transect implementation. The transect directory is a separate specialized model with its own contracts and should be documented separately.

## Mental Model

The simulation state is stored in WebGPU textures rather than JavaScript arrays. JavaScript is the orchestrator: it loads input files, allocates GPU resources, creates bind groups, dispatches compute shaders, copies pass outputs between textures, and renders the result. WGSL is where the numerical work happens.

The core state texture convention is:

- `txState`: current water state. Channels are free surface elevation, x momentum, y momentum, and a scalar/foam/tracer value.
- `txNewState`: next water state after a timestep stage.
- `txBottom`: bathymetry/topography and wet/dry helper data. Channels are north-face bed elevation, east-face bed elevation, center bed elevation, and a near-dry flag.
- `txH`, `txU`, `txV`, `txC`: reconstructed face depths, velocities, and scalar values. Each channel maps to a cell face.
- `txXFlux`, `txYFlux`: finite-volume fluxes through east and north faces.
- `current_stateUVstar`, `txstateUVstar`: explicit/intermediate state used before and after the implicit Boussinesq/COULWAVE solve.
- `coefMatx`, `coefMaty`, `newcoef_x`, `newcoef_y`, `txtemp_PCRx/y`, `txtemp2_PCRx/y`: tridiagonal solver coefficient and scratch textures.

The names are not decorative. They are the API between `main.js`, the handler modules, and the WGSL bindings. A texture rename or channel reinterpretation usually requires coordinated changes across all three layers.

## Startup Flow

The browser enters through `index.html` or `river.html`, then the main simulator code in `js/main.js` takes over. The startup path is:

1. Load configuration defaults from `js/constants_load_calc.js`.
2. Merge an example or user-provided `config.json`.
3. Load bathymetry, optional initial condition/friction/hard-bottom grids, wave forcing, overlay imagery, and design textures.
4. Request a WebGPU adapter/device and configure the canvas.
5. Allocate all simulation, diagnostic, render, and readback textures.
6. Copy CPU-loaded data into GPU textures.
7. Fetch WGSL shader text and create compute/render pipelines.
8. Create bind groups that match the handler and shader binding layouts.
9. Enter the animation frame loop.

There is no build artifact to inspect. If the browser cannot fetch a source file or shader file by its repository path, the application cannot use it.

## Per-Timestep Pipeline

Each render frame runs one or more simulation timesteps. The number of timesteps per rendered frame is adjusted dynamically by `main.js` to balance GPU throughput and browser responsiveness.

The active hydrodynamic pass order is:

1. `Pass0`: computes neighbor water-depth helper values used by flux logic near wet/dry interfaces.
2. `Pass1` or `Pass1_HighOrder`: reconstructs face states from cell-centered state and bathymetry.
3. `SedTrans_Pass1`, when sediment is enabled: reconstructs sediment concentration at faces.
4. `Pass2` or a high-order Riemann variant: computes x/y finite-volume fluxes.
5. `Pass_Breaking`, when enabled: computes breaking intensity and eddy-viscosity flux helpers.
6. `Pass3A_COULWAVE` and `Pass3B_COULWAVE`, only for COULWAVE mode: precompute auxiliary high-order dispersive terms and pack them into the 3D COULWAVE grouping texture.
7. `Pass3_NLSW`, `Pass3_Bous`, or `Pass3_COULWAVE`: combines flux divergence, pressure slope, friction, breaking, source terms, and time integration.
8. `BoundaryPass`: applies boundary conditions and shoreline cleanup.
9. `Update_TriDiag_coef*`, for Boussinesq/COULWAVE modes when coefficients need updating.
10. `TriDiag_PCRx*` and `TriDiag_PCRy*`: perform the implicit dispersive solve. NLSW skips this with a direct texture copy.
11. `BoundaryPass` again: re-applies boundary cleanup after the implicit solve.
12. Optional sediment bottom update: changes bathymetry from erosion/deposition and then refreshes near-dry and tridiagonal data.
13. Diagnostic passes: means, maximums, wave-height statistics, time-series extraction, and render-cache packing.

When `timeScheme == 2`, this sequence is executed as predictor/corrector substeps. History textures such as `oldGradients`, `oldOldGradients`, and `predictedGradients` are shifted at the end of the timestep.

## Model Modes

`NLSW_or_Bous` selects the equation family:

- `0`: nonlinear shallow water. Uses the explicit passes and bypasses the tridiagonal solver.
- `1`: Boussinesq. Adds dispersive source terms in `Pass3_Bous` and an implicit tridiagonal solve.
- `2`: COULWAVE-style higher-order mode. Adds the `Pass3A`/`Pass3B` auxiliary passes, COULWAVE-specific tridiagonal coefficients, and COULWAVE PCR shaders.

`Accuracy_mode` selects the reconstruction/flux family:

- Standard mode uses `Pass1.wgsl` and `Pass2.wgsl`.
- High-order mode uses `Pass1_HighOrder.wgsl` and currently selects `Pass2_HighOrder_HLLC.wgsl`. `Pass2_HighOrder_HLLEM.wgsl` is present but is not the active high-order choice in the current `main.js` path.

## Boundary System

The boundary pass is more than a final clamp. It enforces:

- Solid walls with mirrored momentum.
- Sponge layers that damp state toward zero near configured edges.
- Periodic overlaps with two-cell exchange regions.
- Incident sine/transient/solitary waves loaded through `waves.txt`.
- River stage/discharge boundaries for the river scenario.
- Sediment reset at forced/damped boundaries.
- Breaking texture propagation at boundaries.
- Wet/dry cleanup, negative-depth prevention, and single-cell island/channel-end suppression.

Because `BoundaryPass.wgsl` reads both water and sediment state and writes temporary outputs, JavaScript usually dispatches it and then copies the temporary textures into the canonical state textures.

## Rendering

Rendering is a visualization pipeline over the simulation textures. It does not advance the numerical model.

`Copytxf32_txf16.wgsl` packs frequently sampled render variables into an `rgba16float` 2D-array texture so the fragment and 3D vertex shaders can sample fewer full-precision textures. `fragment.wgsl` handles the 2D view, scientific color maps, photorealistic water shading, design-component texture overlays, arrows, time-series dots, and colorbar compositing. `vertex3D.wgsl` turns the water surface into a height field using the render camera matrix.

The same render bind group is used by the 2D and 3D render paths, so bindings that look fragment-only in 2D may also be needed by the 3D vertex shader.

## Documentation Map

Additional project notes live under `docs/`:

- `docs/architecture/SIMULATION_PIPELINE.md`: timestep and frame-loop details.
- `docs/architecture/DATA_AND_TEXTURES.md`: texture/channel contracts.
- `docs/architecture/CONFIGURATION.md`: config loading and derived constants.
- `docs/architecture/WEBGPU_BINDING_PATTERN.md`: handler, bind group, and shader coupling.
- `docs/source/js/`: per-JavaScript-file documentation.
- `docs/source/shaders/`: per-WGSL-file documentation.
- `docs/source/externals/`: third-party/local external script notes.

When changing simulation behavior, start with the source-file doc for the file you are touching, then check the matching handler and shader docs. This project is easiest to modify when the bind-group contract is treated as a first-class interface.
