# Project Documentation

These notes are a hand-authored map of the non-transect Celeris-WebGPU codebase. They are meant to preserve working knowledge across long sessions: what each source file owns, which GPU textures and bindings it relies on, and how a pass fits into the larger coastal-wave simulation.

The transect implementation is intentionally excluded. Do not infer transect behavior from these notes and do not use these notes as coverage for transect files.

## Start Here

- [Root Architecture](../ARCHITECTURE.md) gives the high-level model and dataflow.
- [Simulation Pipeline](architecture/SIMULATION_PIPELINE.md) explains the per-frame and per-timestep sequence.
- [Data And Textures](architecture/DATA_AND_TEXTURES.md) records the important GPU texture/channel contracts.
- [Configuration](architecture/CONFIGURATION.md) explains defaults, example configs, and derived constants.
- [WebGPU Binding Pattern](architecture/WEBGPU_BINDING_PATTERN.md) explains how JavaScript handlers and WGSL shaders must stay aligned.
- [Reference Papers](architecture/REFERENCE_PAPERS.md) summarizes the technical papers included in this repository.

## Source Guides

- [JavaScript Source](source/js/README.md): orchestration, data loading, texture allocation, handlers, rendering, output, and UI modules.
- [WGSL Shaders](source/shaders/README.md): compute and render shaders grouped by numerical role.
- [External Scripts](source/externals/README.md): local third-party/minified helper scripts.

## How To Use These Notes

For a normal simulation change, read in this order:

1. The architecture page for the subsystem you are changing.
2. The JavaScript handler or orchestrator doc.
3. The WGSL shader doc.
4. The actual source file.

The docs call out active versus prototype/stale files where that is visible from the current code path. Some source comments are older than the code around them, especially in handler files. Prefer the actual binding order and the current `main.js` dispatch path over stale inline comments.
