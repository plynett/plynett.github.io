# `shaders/Update_TriDiag_coef.wgsl`

[Source](../../../shaders/Update_TriDiag_coef.wgsl)

## What This Shader Does

Builds the x and y tridiagonal coefficient matrices for the standard Boussinesq implicit solve.

## Output Contract

`coefMatx` and `coefMaty` channels are:

- `r`: lower/subdiagonal coefficient.
- `g`: diagonal coefficient.
- `b`: upper/superdiagonal coefficient.
- `a`: unused/right-hand-side placeholder.

Boundary and near-dry rows become identity-like rows: `a = 0`, `b = 1`, `c = 0`.

## Numerical Role

For wet interior cells, coefficients are derived from local depth, neighboring depth slope, `Bcoef`, and grid spacing. The PCR solver later combines these coefficients with the `current_stateUVstar` right-hand side.

## Change Notes

This shader contains a COULWAVE branch in addition to the standard branch, but the project also has a dedicated `Update_TriDiag_coef_COULWAVE.wgsl` with a different right-hand-side contract. Verify which shader `main.js` selects before changing behavior.
