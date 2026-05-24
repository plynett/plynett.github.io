# `shaders/Pass3_NLSW.wgsl`

[Source](../../../shaders/Pass3_NLSW.wgsl)

## What This Shader Does

`Pass3_NLSW` applies the nonlinear shallow-water update. It combines finite-volume flux divergence with source terms and time integration, writing `txNewState`, `dU_by_dt`, `F_G_star`, and `current_stateUVstar`.

## Source Terms

The shader includes:

- Free-surface pressure slope.
- Bottom friction or Manning friction.
- Optional pressure/depth-change forcing from `txBoundaryForcing`.
- Vorticity-based momentum mixing.
- Infiltration/overflow loss over positive topography.
- Scalar/tracer diffusion and decay.
- Breaking scalar visualization, but not breaking momentum diffusion in the NLSW variant.

## Time Integration

It supports explicit and predictor/corrector modes using `oldGradients`, `oldOldGradients`, and `predictedGradients`.

## Wet/Dry Handling

Dry cells surrounded by dry cells are zeroed early. Surface slopes are changed to one-sided forms near dry neighbors so shoreline cells do not use invalid centered gradients.

## Change Notes

Because NLSW bypasses the tridiagonal solver, `current_stateUVstar` and `txNewState` remain directly aligned after boundary handling. Do not add dispersive terms here unless the solver path is updated too.
