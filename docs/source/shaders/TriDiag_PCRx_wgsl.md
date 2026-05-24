# `shaders/TriDiag_PCRx.wgsl`

[Source](../../../shaders/TriDiag_PCRx.wgsl)

## What This Shader Does

Runs one Parallel Cyclic Reduction iteration for x-direction tridiagonal systems in the standard Boussinesq solve.

## Inputs And Outputs

Inputs:

- Current x coefficient texture.
- Current state.
- `current_stateUVstar`, whose `g` channel is the x-momentum right-hand side on the first iteration.
- Uniform `P`, the total number of x PCR iterations, used to detect the final pass.

Outputs:

- `txtemp`: reduced coefficients for the next PCR iteration.
- `txtemp2`: state-like solution texture with updated x momentum, written only on the final PCR iteration.

## PCR Logic

On iteration `p == 0`, the shader normalizes coefficients by the diagonal and loads the right-hand side from `current_stateUVstar.g`. Later iterations read already-reduced coefficients and right-hand side from the coefficient texture alpha channel.

The shader always writes reduced coefficients to `txtemp`. It loads `current_state` and writes `txtemp2` only when `p == P - 1`, which supports JavaScript-side ping-pong of coefficient textures without intermediate solution writes.

Neighbor indices wrap modulo width. Boundary rows are expected to be identity-like from the coefficient-update pass.

## Change Notes

This shader writes only the x-momentum component in the solution texture. The y-direction solve follows in `TriDiag_PCRy.wgsl`.
