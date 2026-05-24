# `js/Handler_Updateneardry.js`

[Source](../../../js/Handler_Updateneardry.js)

## What This File Owns

Creates the bind group for `Update_neardry.wgsl`, which refreshes bathymetry metadata after bottom changes.

## Binding Contract

- `0`: uniform buffer with grid dimensions.
- `1`: `txBottom`, current bathymetry/topography.
- `2`: `txtemp_bottom`, storage output with updated near-dry flag and island cleanup.

## Pipeline Role

This pass runs after bathymetry edits, moving-bottom disturbances, and sediment bottom updates. JavaScript copies `txtemp_bottom` back into `txBottom`.

## Change Notes

Near-dry flags affect Boussinesq/COULWAVE dispersive terms and tridiagonal coefficients. Any bottom-changing operation should be followed by this pass.
