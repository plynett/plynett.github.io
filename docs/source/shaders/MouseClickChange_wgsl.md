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

Design-component mode writes design component IDs and matching friction values. When the linear-structure add flag is set, the same panel instead writes an updated bathymetry/topography texture.

## Brush Logic

Most surface edits use a Gaussian radial function. Design components use a disk for component IDs and a Gaussian for friction blending.

Linear structures use a finite segment/capsule distance: the crest follows the user-defined start/end line, rounded end caps are created by clamping distance to the finite segment, and the side slope lowers the target elevation away from the crest width. The shader applies the structure as a raise-only terrain change with `max(existingBottom, targetElevation)` and updates the center, north, and east bathy/topo channels consistently.

## Change Notes

The shader writes generic temporary textures; `main.js` decides their meaning. If you add a new edit mode, update both the shader and the copy-back branch in `main.js`.
