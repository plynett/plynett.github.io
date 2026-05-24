# `js/Handler_CalcMeans.js`

[Source](../../../js/Handler_CalcMeans.js)

## What This File Owns

Creates the bind group for `CalcMeans.wgsl`, which updates running means, maxima, momentum-flux diagnostics, vorticity diagnostics, and model velocities.

## Binding Contract

- `0`: diagnostics uniform buffer.
- `1`: `txMeans`.
- `2`: `txMeans_Speed`.
- `3`: `txMeans_Momflux`.
- `4`: `txH`.
- `5`: `txU`.
- `6`: `txV`.
- `7`: `txBottom`.
- `8`: temporary means output.
- `9`: temporary speed/max output.
- `10`: temporary momentum/vorticity output.
- `11`: `txModelVelocities` output.
- `12`: `txC`.
- `13`: `txNewState`.

## Pipeline Role

This pass converts face velocities to cell-average diagnostics and maintains time-averaged fields used by rendering, exports, and 3D model visualization.

## Change Notes

`txModelVelocities` is also written by COULWAVE auxiliary logic and render packing depends on it. Be careful when changing velocity definitions.
