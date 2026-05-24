# `shaders/Pass3_COULWAVE.wgsl`

[Source](../../../shaders/Pass3_COULWAVE.wgsl)

## What This Shader Does

`Pass3_COULWAVE` is the main COULWAVE integration pass. It shares the broad `Pass3` binding layout but reads packed auxiliary layers from `txCW_groupings` to add higher-order COULWAVE source terms.

## COULWAVE Inputs

The shader samples `txCW_groupings` layers for velocities, vertical-coordinate helpers, S/T terms, E terms, and F/G helper terms. These layers are produced by `Pass3A_COULWAVE` and `Pass3B_COULWAVE` and copied into a 3D texture by JavaScript.

## Source Terms

The pass computes:

- Flux divergence from `txXFlux` and `txYFlux`.
- Friction/Manning terms.
- Pressure/depth-change forcing.
- Breaking momentum diffusion.
- Scalar/tracer diffusion and decay.
- COULWAVE mass/source term `E_src`.
- COULWAVE momentum source terms `Psi1x`, `Psi2x`, `Psi1y`, `Psi2y`.

## Output Contract

It writes the same outputs as `Pass3_Bous`: new state, derivative, F/G history, and `current_stateUVstar` for the implicit solve.

## Change Notes

This shader is the most tightly coupled WGSL file in the project. Changes usually require coordinated updates to `Pass3A_COULWAVE`, `Pass3B_COULWAVE`, `Update_TriDiag_coef_COULWAVE`, the PCR variants, and the JavaScript layer-copy sequence.
