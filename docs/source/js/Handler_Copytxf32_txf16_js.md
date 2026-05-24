# `js/Handler_Copytxf32_txf16.js`

[Source](../../../js/Handler_Copytxf32_txf16.js)

## What This File Owns

Creates the bind group for `Copytxf32_txf16.wgsl`, the render-cache packing pass.

## Binding Contract

- `0`: render/simulation uniform buffer.
- `1`: `txNewState`.
- `2`: `txBottom`.
- `3`: `txMeans_Speed`.
- `4`: `txRenderVarsf16` output, a 2D-array `rgba16float` texture.
- `5`: `txMeans_Momflux`.
- `6`: `txModelVelocities`.
- `7`: `txMeans`.
- `8`: `txHardBottom`.

## Pipeline Role

This pass compresses frequently sampled render variables into half-float array layers so the fragment and 3D vertex shaders can sample fewer full-precision textures.

## Change Notes

Any layer/channel change must be reflected in `fragment.wgsl`, `vertex3D.wgsl`, and `docs/architecture/DATA_AND_TEXTURES.md`.
