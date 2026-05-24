# `shaders/Pass3_Bous.wgsl`

[Source](../../../shaders/Pass3_Bous.wgsl)

## What This Shader Does

`Pass3_Bous` is the Boussinesq source/time-integration pass. It starts from the same flux divergence and source-term structure as NLSW, then adds dispersive Boussinesq terms that are later corrected by the implicit tridiagonal solve.

## Dispersive Terms

For cells that are not near dry land and not in a periodic-boundary guard region, the shader computes higher-order eta, depth, and momentum derivatives. It produces `F_star` and `G_star`, stores them in `F_G_star`, and adds `Psi` source terms to the momentum equations.

`F_G_star_oldGradients` and `F_G_star_oldOldGradients` provide history for time differencing of dispersive helper terms.

## Breaking And Friction

Unlike the NLSW pass, this variant uses `txDissipationFlux` to add breaking-induced momentum diffusion when the breaking model is enabled. It also uses bottom friction, optional Manning friction, pressure forcing, infiltration, scalar diffusion/decay, and vorticity-based mixing.

## Output Contract

- `txNewState`: pre/post-solve state candidate.
- `dU_by_dt`: derivative used by history and breaking.
- `F_G_star`: dispersive helper history.
- `current_stateUVstar`: right-hand side for the implicit solve.

## Change Notes

Changes here must be checked with `Update_TriDiag_coef.wgsl`, `TriDiag_PCRx.wgsl`, and `TriDiag_PCRy.wgsl`. The explicit source update and implicit solve are a pair.
