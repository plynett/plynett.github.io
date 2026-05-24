# `shaders/skybox.vertex.wgsl`

[Source](../../../shaders/skybox.vertex.wgsl)

## What This Shader Does

Skybox vertex shader. It emits a fullscreen triangle and reconstructs a world-space sample direction from the inverse view-projection matrix.

## Binding Contract

- `0`: inverse view-projection matrix uniform.

The fragment shader uses the direction to sample the cube map.

## Coordinate Note

The shader swaps Y and Z in the reconstructed direction, matching the project's 3D scene orientation.

## Change Notes

Any camera coordinate-system change should be checked here and in the 3D water/model matrix construction.
