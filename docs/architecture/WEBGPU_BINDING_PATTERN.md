# WebGPU Binding Pattern

The project follows a handler pattern: each compute or render pass has a JavaScript handler file that creates the bind-group layout and bind group expected by one or more WGSL shaders.

The important rule is simple: binding numbers are the interface. The order in the handler must match the `@group(0) @binding(N)` declarations in WGSL, and the resources passed by `main.js` must match what the handler expects.

## Handler Responsibilities

Most handler files do three things:

1. Define a `create_*_BindGroupLayout(device)` function.
2. Define a `create_*_BindGroup(...)` function.
3. Map JavaScript texture/buffer arguments to numbered WebGPU bindings.

The handlers usually do not dispatch work themselves. Dispatch is handled by `Run_Compute_Shader.js`, `Run_Tridiag_Solver.js`, or the render code in `main.js`.

## Shader Responsibilities

WGSL files declare a matching `Globals` struct and matching texture/storage bindings. They assume:

- All textures have the dimensions implied by config.
- Storage outputs are separate from sampled inputs unless JavaScript explicitly uses a temporary texture and later copies it.
- Workgroup sizes are usually `16 x 16`, except time-series extraction and some fullscreen render paths.

## Why Temporary Textures Are Common

WebGPU does not allow reading and writing the same texture in a single pass in the way many numerical algorithms would like. The code therefore uses temporary textures such as `txtemp_boundary`, `txtemp_Breaking`, `txtemp_bottom`, `txtemp_PCRx`, and `txtemp_WaveHeight`, then copies results into canonical textures after dispatch.

This pattern is especially visible in:

- `BoundaryPass`: writes temporary water/sediment/breaking outputs, then JavaScript copies them into state textures.
- `Pass_Breaking`: writes temporary breaking values, then JavaScript copies into `txBreaking`.
- `CalcMeans` and `CalcWaveHeight`: write temporary diagnostics before replacing the running diagnostic textures.
- PCR solver passes: repeatedly alternate coefficient and solution textures between iterations.

## Shared Layouts

Some handlers are intentionally shared across shader variants:

- `Handler_Pass1.js` works for both standard and high-order reconstruction.
- `Handler_Pass2.js` works for standard, HLLC, and HLLEM flux variants.
- `Handler_Pass3.js` works for NLSW, Boussinesq, and COULWAVE main integration shaders because all three use the same broad binding layout.
- `Handler_Tridiag.js` works for standard and COULWAVE PCR variants, although the standard WGSL files do not use every binding declared by the handler.
- `Handler_UpdateTrid.js` works for both standard and COULWAVE coefficient-update shaders.

Shared layouts simplify pipeline selection but increase the risk of unused or misleading bindings. Treat unused resources as part of the compatibility contract.

## Stale Comments And Legacy Calls

Several handler comments still say "fragment shader" even for compute bindings. Some headers also appear copied from another handler. Trust the binding declarations and current `main.js` call path, not the comments.

There are also legacy or less-used branches in `main.js` with older `createRenderBindGroup()` call signatures. The initial render bind group uses the current 19-binding signature, while some overlay-refresh code appears to pass an older argument set. If render bind-group work is planned, audit those call sites carefully.

## Safe Change Checklist

For a shader change:

1. Check the shader's `@binding` list.
2. Check the matching `Handler_*.js` layout.
3. Check every `create_*_BindGroup()` call in `main.js`.
4. Check texture formats in `Create_Textures.js`.
5. Check any copy operation after dispatch.
6. Check docs for channel semantics before reusing a texture channel.

For a new config/uniform value:

1. Add a default in `constants_load_calc.js`.
2. Add derived calculations if needed.
3. Add it to the relevant JavaScript uniform buffer writer.
4. Add it to the relevant WGSL `Globals` struct in the correct byte-layout position.
5. Recreate or update affected pipelines/bind groups if the binding contract changes.
