# `js/Run_Tridiag_Solver.js`

[Source](../../../js/Run_Tridiag_Solver.js)

## What This File Owns

This module orchestrates the implicit tridiagonal solve used by Boussinesq and COULWAVE modes. The actual PCR math is in WGSL; this file controls pass order, iteration counts, and the coefficient texture handoff between PCR iterations.

## Solver Flow

If `NLSW_or_Bous == 0`, no dispersive solve is needed. The module simply copies `current_stateUVstar` into `txNewState`.

For Boussinesq/COULWAVE modes:

1. For each x-direction PCR iteration, set uniforms `p` and `s = 2^p`.
2. Dispatch the x PCR shader with a bind group selected by iteration: `coefMatx -> newcoef_x` for `p == 0`, `newcoef_x -> txtemp_PCRx` for odd iterations, and `txtemp_PCRx -> newcoef_x` for even iterations after the first.
3. Copy the final x-direction solution texture from `txtemp2_PCRx` into `txNewState`.
4. Repeat the same ping-pong pattern in y using `coefMaty`, `newcoef_y`, `txtemp_PCRy`, and `txtemp2_PCRy`.

## Important Contracts

`Px` and `Py` come from `constants_load_calc.js` and must be large enough to reduce the row/column systems. The PCR shaders use wraparound indexing, while coefficient matrices set boundary rows to identity-like systems so edge cells remain controlled.

COULWAVE PCR shaders use an extra bathymetry binding and convert final velocity-like solutions back into momentum on the last iteration.

The PCR shaders now write `txtemp2_PCR*` only on the final iteration. Intermediate iterations write only reduced coefficients, so the solver can avoid both the setup copy from `coefMat*` into `newcoef_*` and the per-iteration copy from `txtemp_PCR*` back into `newcoef_*`.

## Change Notes

This file currently uses immediate command submissions rather than the encoder-stack style used in the main pass loop. The old copy-after-each-PCR-iteration lines are retained as comments in the source, but the active path relies on bind-group ping-pong for the coefficient dependency.
