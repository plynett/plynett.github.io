# `shaders/Copytxf32_txf16.wgsl`

[Source](../../../shaders/Copytxf32_txf16.wgsl)

## What This Shader Does

Packs selected full-precision simulation and diagnostic values into the half-float render-cache texture `txRenderVarsf16`.

## Layer Contract

Layer 0:

- `r`: eta, with dry cells replaced by `-10 * base_depth`.
- `g`: max eta.
- `b`: bottom elevation.
- `a`: foam/tracer value, cleared for dry cells.

Layer 1:

- `r`: u velocity.
- `g`: v velocity.
- `b`: unused.
- `a`: mean absolute vorticity.

Layer 2:

- `r`: bottom.
- `g`: hard bottom.
- `b`: available scour depth.
- `a`: unused.

## Change Notes

This pass is directly coupled to `fragment.wgsl` and `vertex3D.wgsl`. Treat the layer/channel layout as a render API.
