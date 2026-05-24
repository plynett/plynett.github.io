# `shaders/vertex3D.wgsl`

[Source](../../../shaders/vertex3D.wgsl)

## What This Shader Does

3D water-surface vertex shader. It receives grid positions in normalized space, samples the water surface elevation, converts the vertex to world coordinates, scales vertical elevation, and projects through the render camera matrix.

## Inputs

- Vertex buffer at location `0`: `vec2<f32>` grid position.
- Render uniform buffer, including grid dimensions, `dx`, `dy`, `renderZScale`, and `viewProj`.
- Water state texture at binding `1`.
- Render cache and samplers through the shared render bind group.

## Output Contract

The shader passes UV coordinates to the fragment shader so the same `fragment.wgsl` can color the 3D surface.

## Change Notes

The shader currently samples elevation from the full state texture rather than only `txRenderVarsf16`. If render-cache semantics change, check whether 3D geometry should use the cache or the full state texture.
