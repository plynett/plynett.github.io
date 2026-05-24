# `js/Handler_Model.js`

[Source](../../../js/Handler_Model.js)

## What This File Owns

Creates the bind group for simple 3D model rendering.

## Binding Contract

- `0`: model uniform buffer containing view-projection, model matrix, camera position, and padding.
- `1`: model texture view.
- `2`: filtering sampler.

## Pipeline Role

This handler supports the model shaders used for simple scene objects. It is separate from the hydrodynamic grid render bind group.

## Change Notes

The model shader path is visual/contextual. Do not route hydrodynamic state through this handler unless adding a deliberate new render feature.
