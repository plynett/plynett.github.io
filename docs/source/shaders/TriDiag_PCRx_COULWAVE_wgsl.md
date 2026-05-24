# `shaders/TriDiag_PCRx_COULWAVE.wgsl`

[Source](../../../shaders/TriDiag_PCRx_COULWAVE.wgsl)

## What This Shader Does

Runs one x-direction PCR iteration for the COULWAVE implicit solve.

## Variant Difference

The COULWAVE coefficient texture alpha channel stores a velocity-like right-hand side. On the final x PCR iteration, this shader multiplies the solved velocity by local water depth to convert back to x momentum and writes the solution texture. Intermediate iterations write reduced coefficients only.

## Bindings

It uses the standard tridiagonal bindings plus `txBottom` at binding `6`, which is needed for the final depth conversion.

## Change Notes

This shader depends on `globals.Px` to detect the last iteration. If iteration count logic changes in JavaScript, this final conversion can silently happen too early or too late.

The shader now loads `current_state` only in the final-iteration block, because only that pass needs the free surface and unchanged state channels for `txtemp2`.
