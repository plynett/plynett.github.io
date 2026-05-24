# `shaders/AddDisturbance.wgsl`

[Source](../../../shaders/AddDisturbance.wgsl)

## What This Shader Does

Adds user/scenario disturbances to the current state and, for moving-bottom cases, computes bottom changes and depth-change forcing.

## Disturbance Modes

The active modes include:

- Solitary wave initial condition.
- Submerged landslide-like dipole free-surface disturbance.
- Subaerial landslide-like Gaussian mound disturbance.
- Prescribed depth motion that changes bathymetry over time.

An earthquake branch is present but commented/inactive.

## Outputs

- Disturbed water state.
- `txBoundaryForcing`, where the moving-bottom branch writes depth-change rate and new bottom information.
- Temporary bottom texture with updated face/center bathymetry.

## Change Notes

Moving-bottom output uses initial bottom plus cumulative sediment change as its reference. After this shader changes bottom values, JavaScript must refresh near-dry flags and tridiagonal coefficients for dispersive modes.
