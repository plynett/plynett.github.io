# `js/Handler_AddDisturbance.js`

[Source](../../../js/Handler_AddDisturbance.js)

## What This File Owns

Creates the bind group for `AddDisturbance.wgsl`, which adds initial/interactive wave disturbances or prescribed bottom motion.

## Binding Contract

- `0`: disturbance uniform buffer.
- `1`: `txBottom`.
- `2`: `txState`.
- `3`: `txBottomInitial`.
- `4`: temporary disturbed state output.
- `5`: `txBoundaryForcing` output for pressure/depth-change forcing.
- `6`: temporary bottom output.
- `7`: `txBotChange_Sed`, cumulative sediment bottom change used when referencing the initial bed.

## Pipeline Role

This pass supports solitary-wave, landslide-style, and prescribed-depth-motion disturbance modes. JavaScript copies its output into state/bottom textures and resets relevant diagnostics/time-series state.

## Change Notes

Disturbance type 5 changes the bottom over time. It must be followed by near-dry and, in dispersive modes, tridiagonal coefficient updates.
