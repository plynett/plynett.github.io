# `js/Handler_ExtractNestedBoundaryTimeSeries.js`

[Source](../../../js/Handler_ExtractNestedBoundaryTimeSeries.js)

## What This File Owns

Creates the bind group layout and bind groups for `ExtractNestedBoundaryTimeSeries.wgsl`, which samples the four edges of a user-defined rectangle for nested-grid boundary output.

## Binding Contract

- `0`: extraction uniform buffer with grid bounds, rectangle bounds, edge lengths, and sample index.
- `1`: source state texture, normally `txNewState` after the accepted timestep has been computed.
- `2`: south-edge output texture.
- `3`: north-edge output texture.
- `4`: west-edge output texture.
- `5`: east-edge output texture.
- `6`: bottom elevation texture used to identify dry cells before writing output samples.

## Pipeline Role

The pass writes only rectangle-edge cells into compact output textures. JavaScript keeps those textures on the GPU until the requested output window is complete, then performs a single final readback and writes boundary type `5` compatible files. Dry cells where `eta - bottom <= 0` are written as zero `eta`, `hu`, and `hv` so exported boundary files do not contain DEM elevation as free surface.
