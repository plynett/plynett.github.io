# `shaders/TriDiag_PCRy_COULWAVE.wgsl`

[Source](../../../shaders/TriDiag_PCRy_COULWAVE.wgsl)

## What This Shader Does

Runs one y-direction PCR iteration for the COULWAVE implicit solve.

## Variant Difference

Like the x COULWAVE variant, this shader solves a velocity-like right-hand side and converts the final result back to momentum on the last PCR iteration. It uses local water depth from `txBottom`, and intermediate iterations write reduced coefficients only.

## Bindings

It uses the standard tridiagonal bindings plus `txBottom` at binding `6`.

## Change Notes

The shader depends on `globals.Py` to detect the final iteration. Keep this synchronized with `Run_Tridiag_Solver.js`.

The shader now loads `current_state` only inside the final-iteration block, because only that pass needs the free surface and unchanged state channels for `txtemp2`.
