# JavaScript Source Guide

These files are the browser-side control plane for the simulator. They do not perform the heavy numerical work directly; they load data, allocate GPU resources, create bind groups, dispatch WGSL passes, copy textures, manage UI state, and export results.

The central file is `main.js`. Most other modules either feed it data, create a narrow WebGPU binding contract for a shader, or read data back out of the GPU.

## Core Orchestration

- `main.js`: application bootstrap, WebGPU initialization, simulation loop, UI event handling, render loop, and output triggers.
- `constants_load_calc.js`: default config, config loading, and derived constants.
- `Config_Pipelines.js`: compute and render pipeline creation.
- `Create_Textures.js`: WebGPU texture and buffer allocation helpers.
- `Copy_Data_to_Textures.js`: CPU-side packing of bathymetry, waves, initial state, and tridiagonal coefficients into GPU textures.
- `Run_Compute_Shader.js`: generic compute dispatch and texture-copy helpers.
- `Run_Tridiag_Solver.js`: PCR-based implicit solver orchestration.

## Data I/O And UI

- `File_Loader.js`: loads grids, wave files, overlays, image bitmaps, cube maps, and optional user files.
- `File_Writer.js`: exports textures, images, GIFs, configs, time surfaces, and readback data.
- `display_parameters.js`: updates DOM status/config panels and redirects console logs into the page.
- `Time_Series.js`: reads tooltip and point-gauge values back from the GPU.
- `Model_Loaders.js`: loads simple scene models and prototype glTF assets.
- `site.js`: currently inert placeholder.

## Handler Files

`Handler_*.js` modules define WebGPU bind-group layouts and bind groups for matching WGSL passes. They are thin but important because their binding order is the API between JavaScript and shader code.

When changing a handler:

1. Check the matching WGSL `@binding` declarations.
2. Check every call from `main.js`.
3. Check texture formats in `Create_Textures.js`.
4. Update the corresponding shader doc.

Some handler comments are stale or copied from older files. Trust the actual binding numbers and resource arguments.
