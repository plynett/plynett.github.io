# `shaders/TriDiag_PCRy.wgsl`

[Source](../../../shaders/TriDiag_PCRy.wgsl)

## What This Shader Does

Runs one Parallel Cyclic Reduction iteration for y-direction tridiagonal systems in the standard Boussinesq solve.

## Inputs And Outputs

Inputs:

- Current y coefficient texture.
- Current state, usually the x-solved intermediate.
- `current_stateUVstar`, whose `b` channel is the y-momentum right-hand side on the first iteration.
- Uniform `P`, the total number of y PCR iterations, used to detect the final pass.

Outputs:

- `txtemp`: reduced coefficients for the next PCR iteration.
- `txtemp2`: state-like solution texture with updated y momentum, written only on the final PCR iteration.

## PCR Logic

The shader mirrors `TriDiag_PCRx.wgsl`, but walks neighbors in the y direction with modulo-height indexing. It always writes reduced coefficients to `txtemp`, while `current_state` is loaded and `txtemp2` is written only when `p == P - 1`.

## Change Notes

The two directional solves are ordered by JavaScript. If you change solution channel handling here, update `Run_Tridiag_Solver.js` and the x-direction counterpart.
