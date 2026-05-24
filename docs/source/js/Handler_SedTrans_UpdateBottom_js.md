# `js/Handler_SedTrans_UpdateBottom.js`

[Source](../../../js/Handler_SedTrans_UpdateBottom.js)

## What This File Owns

Creates the bind group for `SedTrans_UpdateBottom.wgsl`, which updates bathymetry from computed erosion and deposition.

## Binding Contract

- `0`: sediment/bottom-update uniform buffer.
- `1`: `txBottom`.
- `2`: `txBotChange_Sed`.
- `3`: `erosion_Sed`.
- `4`: `depostion_Sed`.
- `5`: temporary updated-bottom output.
- `6`: temporary cumulative-change output.
- `7`: `txHardBottom`.
- `8`: `txBottomInitial`.

## Pipeline Role

The pass converts sediment source/sink rates into bottom elevation changes and cumulative bed-change fields. JavaScript then copies outputs back into `txBottom` and `txBotChange_Sed`.

## Change Notes

After this pass changes the bottom, the model must update near-dry metadata and, for dispersive modes, tridiagonal coefficients. The shader reads hard-bottom data but currently does not strongly clamp all output channels to it.
