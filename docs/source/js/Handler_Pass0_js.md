# `js/Handler_Pass0.js`

[Source](../../../js/Handler_Pass0.js)

## What This File Owns

Creates the bind-group layout and bind group for `Pass0.wgsl`, the helper pass that computes neighboring water depths for wet/dry flux logic.

## Binding Contract

- `0`: simulation uniform buffer.
- `1`: `txState`, current water state.
- `2`: `txBottom`, bathymetry/topography.
- `3`: `txHnear`, storage output containing north/east/south/west neighbor depths.

## Pipeline Role

This pass runs before reconstruction and flux calculation. Its output is sampled by `Pass2` to detect dry or nearly dry neighborhoods and suppress unstable mass differences.

## Change Notes

The source header/comment appears copied from another handler. Trust the binding layout above and the matching `Pass0.wgsl` declarations.
