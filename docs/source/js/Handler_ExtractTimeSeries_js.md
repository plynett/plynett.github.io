# `js/Handler_ExtractTimeSeries.js`

[Source](../../../js/Handler_ExtractTimeSeries.js)

## What This File Owns

Creates the bind group for `ExtractTimeSeries.wgsl`, which samples tooltip and gauge values on the GPU.

## Binding Contract

- `0`: extraction uniform buffer.
- `1`: `txBottom`.
- `2`: `txBottomFriction`.
- `3`: `txContSource`.
- `4`: `txState`.
- `5`: `txWaveHeight`.
- `6`: `txTimeSeries_Locations`.
- `7`: `txTimeSeries_Data` output.
- `8`: `txMeans_Speed`.

## Pipeline Role

This pass writes a tiny texture that JavaScript maps back to update the tooltip and time-series arrays. It runs with a small dispatch rather than over the full grid.

## Change Notes

Pixel 0 of the output has tooltip semantics. Time-series records start at pixel 1. Keep that convention aligned with `Time_Series.js`.
