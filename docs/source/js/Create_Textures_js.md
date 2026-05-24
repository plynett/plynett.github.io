# `js/Create_Textures.js`

[Source](../../../js/Create_Textures.js)

## What This File Owns

This module allocates WebGPU textures and uniform buffers. It is the format/usage contract for nearly every texture used by the simulation and renderer.

## Texture Factories

The helpers create:

- `rgba32float` 2D textures for simulation state, bathymetry, fluxes, diagnostics, and most compute outputs.
- `rgba16float` 2D-array textures for render-cache data.
- `bgra8unorm` textures for map overlays, UI draw layers, and sampled visual assets.
- 3D `rgba32float` textures for COULWAVE grouped intermediate terms.
- 3D image textures and cube textures for rendering.
- 1D-like `rgba32float` textures for wave rows and time-series locations.
- Depth textures for 3D rendering.
- Uniform buffers with WebGPU usage flags.

Every created texture is added to `allTextures` so `main.js` can destroy/recreate resources when loading a new scenario.

## Important Contracts

Texture usage flags are deliberately broad for simulation textures: storage binding, texture binding, copy source, and copy destination are all common because a pass may write a temporary output, copy it, then sample it in a later pass.

Render image textures use `bgra8unorm`, matching canvas/readback expectations and the render shader binding layout.

## Change Notes

Do not change a texture format in isolation. The matching handler layout and WGSL declarations include expected formats and sample types. For example, changing a compute texture from `rgba32float` to `rgba16float` requires handler and shader updates, and may break unfilterable-float sampling assumptions.
