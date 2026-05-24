# `shaders/Update_TriDiag_coef_COULWAVE.wgsl`

[Source](../../../shaders/Update_TriDiag_coef_COULWAVE.wgsl)

## What This Shader Does

Builds x and y tridiagonal coefficient matrices for the COULWAVE implicit solve. It uses the current free surface, local total depth, `Bous_alpha`, and bathymetry to define the vertical-coordinate-dependent coefficients.

## Output Contract

`coefMatx` and `coefMaty` channels are:

- `r`: lower/subdiagonal coefficient.
- `g`: diagonal coefficient.
- `b`: upper/superdiagonal coefficient.
- `a`: velocity-like right-hand side, `U/H` for x or `V/H` for y.

Boundary and near-dry rows become identity-like rows.

## Numerical Role

COULWAVE PCR solves for velocity-like quantities and the final PCR pass converts back to momentum by multiplying by local water depth. That differs from the standard Boussinesq solver, which takes momentum directly from `current_stateUVstar`.

## Change Notes

Keep this shader synchronized with `TriDiag_PCRx_COULWAVE.wgsl` and `TriDiag_PCRy_COULWAVE.wgsl`. The meaning of coefficient alpha channel is variant-specific.
