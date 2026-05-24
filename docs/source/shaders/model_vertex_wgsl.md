# `shaders/model.vertex.wgsl`

[Source](../../../shaders/model.vertex.wgsl)

## What This Shader Does

Vertex shader for simple model/box rendering. It transforms a position-only vertex by the model matrix and view-projection matrix and passes local position to the fragment shader.

## Binding Contract

- `0`: uniform buffer containing `viewProj`, `model`, `cameraPos`, and padding.

## Output Contract

- Clip-space position.
- Local position, used by the fragment shader to color faces.

## Change Notes

This path is for simple contextual geometry. It does not sample simulation state.
