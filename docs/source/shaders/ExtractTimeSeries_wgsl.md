# `shaders/ExtractTimeSeries.wgsl`

[Source](../../../shaders/ExtractTimeSeries.wgsl)

## What This Shader Does

Samples tooltip and time-series values into a small output texture for CPU readback.

## Output Layout

Index `0` stores tooltip data at the current mouse grid position:

- Non-river mode: bottom, eta, significant/max height, friction.
- River mode: bottom, eta, speed, friction.

Indices `1..N` store gauge records:

- time.
- eta.
- x momentum `P`.
- y momentum `Q`.

## Dispatch Pattern

The shader uses `@workgroup_size(1, 1)` because it writes one pixel per tooltip/gauge sample rather than operating over the full domain.

## Change Notes

Keep this output layout synchronized with `Time_Series.js`. Adding a gauge variable requires changing both GPU packing and CPU readback/export.
