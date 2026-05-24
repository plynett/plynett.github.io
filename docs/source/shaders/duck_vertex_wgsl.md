# `shaders/duck.vertex.wgsl`

[Source](../../../shaders/duck.vertex.wgsl)

## What This Shader Does

Prototype textured-model vertex shader. It consumes position, normal, and UV attributes, swaps Y/Z so the model stands upright in the scene, transforms to world and clip space, and passes world position, normal, and UV to the fragment shader.

## Binding Contract

- `0`: uniform buffer containing view-projection matrix, model matrix, camera position, and padding.

## Active Status

The duck/glTF path exists but is not the main visualization path. Current scene rendering primarily uses simpler model and water-grid shaders.

## Change Notes

Coordinate swapping here is model-path-specific. Do not copy it into water rendering without checking the scene coordinate convention.
