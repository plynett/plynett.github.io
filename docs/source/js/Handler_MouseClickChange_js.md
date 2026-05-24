# `js/Handler_MouseClickChange.js`

[Source](../../../js/Handler_MouseClickChange.js)

## What This File Owns

Creates the bind group for `MouseClickChange.wgsl`, the GPU-side editor for bathymetry, friction, passive tracer/source, free-surface, and design-component changes.

## Binding Contract

- `0`: edit uniform buffer.
- `1`: `txBottom`.
- `2`: `txBottomFriction`.
- `3`: `txContSource`.
- `4`: `txState`.
- `5`: `txDesignComponents`.
- `6`: primary temporary output.
- `7`: secondary temporary output.

## Pipeline Role

The shader computes radial brush edits in parallel over the domain. `main.js` decides which temporary output is copied back based on the active panel and surface being edited.

## Change Notes

Bathymetry and sea-level edits have follow-up requirements: update near-dry metadata and, for Boussinesq/COULWAVE modes, refresh tridiagonal coefficients.
