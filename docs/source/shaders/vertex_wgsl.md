# `shaders/vertex.wgsl`

[Source](../../../shaders/vertex.wgsl)

## What This Shader Does

Fullscreen 2D render vertex shader. It generates a four-vertex strip directly from `vertex_index` and passes normalized UV coordinates to the fragment shader.

## Output Contract

- Clip-space position covers the full viewport.
- `uv` maps from `[0, 0]` to `[1, 1]`.

## Pipeline Role

Used by the 2D render pipeline with `fragment.wgsl` or experimental fragment variants. No vertex buffer is required.

## Change Notes

Keep UV convention aligned with `fragment.wgsl`, map overlays, and time-series marker placement.
