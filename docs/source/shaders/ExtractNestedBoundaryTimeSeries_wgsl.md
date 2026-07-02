# `shaders/ExtractNestedBoundaryTimeSeries.wgsl`

[Source](../../../shaders/ExtractNestedBoundaryTimeSeries.wgsl)

## What This Shader Does

Samples `eta`, `hu`, and `hv` from the accepted simulation state along the four edges of a user-defined rectangle. The output is used to create boundary type `5` files for one-way nested grids. The shader also reads bottom elevation so dry cells where `eta - bottom <= 0` export zero `eta`, `hu`, and `hv`.

## Output Layout

Four `rgba32float` storage textures are written:

- South and north: width is the rectangle x-index count, height is the number of output samples.
- West and east: width is the rectangle y-index count, height is the number of output samples.
- Each pixel stores `[eta, hu, hv, 0]`.
- Dry sampled cells store `[0, 0, 0, 0]`, avoiding DEM elevations in the output eta column.

## Dispatch Pattern

The shader dispatches one dimension over `max(nx, ny)`. Each invocation writes the matching station on the horizontal edges when `station_index < nx` and on the vertical edges when `station_index < ny`.

## Change Notes

The shader intentionally does not store time. JavaScript records the actual sampled simulation times and adds those values when writing the text files.
