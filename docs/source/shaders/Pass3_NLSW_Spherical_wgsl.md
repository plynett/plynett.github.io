# `shaders/Pass3_NLSW_Spherical.wgsl`

[Source](../../../shaders/Pass3_NLSW_Spherical.wgsl)

## What This Shader Does

`Pass3_NLSW_Spherical` is the `grid_type == 2` NLSW source/time-integration pass. It keeps the same state, flux, history, and output contract as `Pass3_NLSW.wgsl`, but interprets `dx` as longitude spacing in degrees and `dy` as latitude spacing in degrees.

## Spherical Metrics

The shader reads `txSphericalMetrics` through Pass3 binding `19`, replacing `txDissipationFlux` only in spherical NLSW mode. The metric texture channels are:

- `r`: `1 / (R * cos(phi_center))`
- `g`: `cos(phi_north_face)`
- `b`: `cos(phi_south_face)`
- `a`: `tan(phi_center) / R`

`main.js` also writes `1 / R` into the Pass3 uniform buffer tail for the latitude pressure-gradient term.

The metric texture is generated with `lat_LL` as the lower-left corner: center metrics use `lat_LL + (j + 0.5) * dy`, and face metrics use `lat_LL + j * dy` and `lat_LL + (j + 1) * dy`.

## Numerical Role

The flux divergence is computed as:

`1 / (R cos(phi)) * [dF/dlambda + d(cos(phi) G)/dphi]`

The momentum source terms add the spherical pressure-gradient and curvature terms:

- P source: `-gH / (R cos(phi)) * eta_lambda + (PQ / H) * tan(phi) / R`
- Q source: `-gH / R * eta_phi - (P^2 / H) * tan(phi) / R`

## Current Scope

This shader is intended for NLSW only. Spherical mode currently forces the standard second-order reconstruction path and disables Boussinesq/COULWAVE, sediment transport, and the Cartesian breaking model in JavaScript setup.
