# `shaders/Pass_Breaking.wgsl`

[Source](../../../shaders/Pass_Breaking.wgsl)

## What This Shader Does

This pass computes wave-breaking activation and eddy-viscosity terms using the Kennedy-style breaking threshold logic implemented in the shader.

## Inputs And Outputs

Inputs include current state, bathymetry, `dU_by_dt`, hydrodynamic fluxes, and previous breaking state. Outputs are:

- `txDissipationFlux`: viscosity-weighted momentum-gradient terms.
- Temporary breaking values: breaking time marker, breaking viscosity, breaking intensity, and subgrid placeholder.

## Numerical Role

The pass estimates `detadt`, selects a threshold based on local depth and breaking age, computes a breaking intensity, and turns that into an eddy viscosity. Boussinesq and COULWAVE `Pass3` variants later differentiate `txDissipationFlux` to add momentum diffusion.

## Change Notes

Breaking state is advected approximately by choosing upstream neighbors based on dominant momentum direction. Changes here can affect both physics and foam/tracer visualization.
