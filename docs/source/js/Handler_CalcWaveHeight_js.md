# `js/Handler_CalcWaveHeight.js`

[Source](../../../js/Handler_CalcWaveHeight.js)

## What This File Owns

Creates the bind group for `CalcWaveHeight.wgsl`, which updates running wave-height statistics.

## Binding Contract

- `0`: wave-height uniform buffer.
- `1`: `txState`.
- `2`: `txNewState`.
- `3`: `txMeans`.
- `4`: `txWaveHeight`.
- `5`: temporary wave-height output.

## Pipeline Role

The active implementation computes variance of eta about the running mean and derives RMS/representative significant wave-height metrics. A zero-crossing method remains commented in the shader.

## Change Notes

The channel semantics in `txWaveHeight` are visualization/export-facing. If you change them, update `fragment.wgsl`, `ExtractTimeSeries.wgsl`, and colorbar labels.
