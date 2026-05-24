# Reference Papers

The `docs/` directory includes technical papers that explain the lineage of this codebase. These notes are a practical guide to how the papers relate to the source, not a substitute for reading the papers.

## Lynett Et Al. 2026

The WebGPU paper describes the browser-based direction of Celeris: a static web application that performs interactive nearshore wave modeling on the client GPU. That matches the current repository architecture: no server-side compute, no build step, and WGSL compute shaders for the numerical passes.

Relevant implementation connections:

- WebGPU compute replaces earlier graphics/engine-specific GPU shader approaches.
- The model supports nonlinear shallow water, Boussinesq, and higher-order/COULWAVE-style formulations.
- The code uses a hybrid finite-volume/finite-difference strategy: finite-volume fluxes for the hyperbolic part, finite differences and implicit solves for dispersive terms.
- Interactivity is part of the model design: bathymetry edits, disturbances, design components, map overlays, and time-series probes are not afterthoughts.

## Tavakkol And Lynett 2017

The 2017 Celeris work is the conceptual ancestor for the GPU-accelerated Boussinesq model. It used earlier GPU shader technology rather than browser WebGPU, but the numerical structure is recognizable in this repository.

Relevant implementation connections:

- The explicit finite-volume update is split from dispersive Boussinesq corrections.
- Moving shoreline/wet-dry logic is central to the solver.
- Parallel Cyclic Reduction is used for tridiagonal systems in the implicit dispersive solve.
- Interactive visualization and rapid scenario feedback are core goals rather than post-processing steps.

## Tavakkol And Lynett 2020

The 2020 Celeris Base work moved the interactive model into a more accessible application environment and emphasized user workflows such as map overlays, gauges, and immersive visualization.

Relevant implementation connections:

- The WebGPU version keeps the same spirit of interactive scenario design, but implements it as a static browser app.
- The UI, overlay imagery, time-series gauges, and export features in `main.js`, `File_Loader.js`, `File_Writer.js`, and render shaders continue that workflow direction.
- Sponge/boundary handling, visualization, and GPU resource management are as important to the application as the equation kernels.

## Practical Reading Order

If you are modifying numerical kernels:

1. Read the WebGPU paper for the current architecture.
2. Read the earlier Celeris papers for the Boussinesq/PCR and wet-dry lineage.
3. Read `docs/architecture/SIMULATION_PIPELINE.md`.
4. Read the relevant shader docs under `docs/source/shaders/`.

If you are modifying UI, visualization, or scenario loading:

1. Read the WebGPU paper for the browser model.
2. Read the 2020 Celeris Base paper for workflow context.
3. Read the docs for `main.js`, `File_Loader.js`, `File_Writer.js`, `Handler_Render.js`, `fragment.wgsl`, and `Copytxf32_txf16.wgsl`.
