# `js/Handler_UpdateTrid.js`

[Source](../../../js/Handler_UpdateTrid.js)

## What This File Owns

Creates the bind group for tridiagonal coefficient update shaders. The same handler is used by `Update_TriDiag_coef.wgsl` and `Update_TriDiag_coef_COULWAVE.wgsl`.

## Binding Contract

- `0`: simulation/tridiagonal uniform buffer.
- `1`: `txBottom`.
- `2`: current state or `current_stateUVstar`, depending on shader variant.
- `3`: `coefMatx` output.
- `4`: `coefMaty` output.

## Pipeline Role

This pass refreshes the x and y coefficient matrices used by the PCR solver. It runs at startup and whenever bottom/topography or relevant COULWAVE state changes enough to require new coefficients.

## Change Notes

The COULWAVE coefficient shader uses the current free surface and local depth differently from the standard Boussinesq shader. Keep both shader docs in sync with this shared handler.
