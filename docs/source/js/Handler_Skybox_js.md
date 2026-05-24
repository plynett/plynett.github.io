# `js/Handler_Skybox.js`

[Source](../../../js/Handler_Skybox.js)

## What This File Owns

Creates the bind group for the 3D skybox render pipeline.

## Binding Contract

- `0`: inverse view-projection uniform matrix.
- `1`: cube-map texture view.
- `2`: skybox sampler.

## Pipeline Role

The skybox vertex shader renders a fullscreen triangle and reconstructs a world direction from the inverse view-projection matrix. The fragment shader samples the cube map.

## Change Notes

The skybox is visual only. It should not depend on simulation textures, which keeps the 3D environment independent of model state.
