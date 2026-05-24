# `shaders/Update_neardry.wgsl`

[Source](../../../shaders/Update_neardry.wgsl)

## What This Shader Does

Refreshes the near-dry flag and performs a small bathymetry cleanup after bottom/topography changes.

## Output Contract

It reads `txBottom` and writes a replacement bathymetry texture to `txtemp_bottom`. The output keeps the same channel meaning:

- `x`: north-face bed elevation.
- `y`: east-face bed elevation.
- `z`: center bed elevation.
- `w`: near-dry flag.

## Near-Dry Logic

The shader scans a 3-cell radius around each cell. If any nearby center bed elevation is nonnegative, the cell is marked near dry with a negative flag; otherwise it keeps a positive flag.

## Cleanup Logic

If a dry/topographic point is surrounded by wet/deeper neighbors, the shader collapses it toward a waterline value to remove single-cell islands.

## Change Notes

This pass should run after any bottom-changing operation. Boussinesq and COULWAVE terms use the near-dry flag to suppress dispersive corrections in shoreline regions.
