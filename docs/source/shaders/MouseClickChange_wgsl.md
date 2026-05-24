# `shaders/MouseClickChange.wgsl`

[Source](../../../shaders/MouseClickChange.wgsl)

## What This Shader Does

Applies interactive brush edits from mouse input. It writes temporary outputs that `main.js` copies into the appropriate target texture based on the active UI panel.

## Edit Targets

Surface editor modes can change:

- Bathymetry/topography.
- Bottom friction.
- Passive contaminant/source texture.
- Free surface elevation.
- Sea-level/topography offset.

Design-component mode writes design component IDs and matching friction values.

## Brush Logic

Most surface edits use a Gaussian radial function. Design components use a disk for component IDs and a Gaussian for friction blending.

## Change Notes

The shader writes generic temporary textures; `main.js` decides their meaning. If you add a new edit mode, update both the shader and the copy-back branch in `main.js`.
