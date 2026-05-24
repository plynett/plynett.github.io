# `shaders/Pass3A_COULWAVE.wgsl`

[Source](../../../shaders/Pass3A_COULWAVE.wgsl)

## What This Shader Does

`Pass3A_COULWAVE` is the first COULWAVE auxiliary pass. It computes cell-average velocities, local total depth, and vertical-coordinate helper terms needed by the main COULWAVE pass.

## Inputs And Outputs

Inputs:

- Water state.
- Bathymetry/topography.
- Reconstructed face velocities `txU` and `txV`.

Outputs:

- `txModelVelocities`: average `u`, `v`, eta, and total depth.
- `txCW_zalpha`: `za`, `dzadx`, `dzady`, unused.
- `txCW_uvhuhv`: `u`, `v`, `u*d`, `v*d`.

## Numerical Role

The pass prepares quantities that are reused multiple times by later COULWAVE calculations. JavaScript copies these outputs into layers of the 3D `txCW_groupings` texture.

## Change Notes

The definition of `za` is tied to `Bous_alpha` and the local total depth. If this definition changes, `Pass3B_COULWAVE`, `Pass3_COULWAVE`, and the COULWAVE tridiagonal coefficient shader must be checked together.
