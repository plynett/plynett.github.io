# `shaders/Pass2.wgsl`

[Source](../../../shaders/Pass2.wgsl)

## What This Shader Does

`Pass2` computes finite-volume fluxes through cell faces from reconstructed face depths, velocities, and scalar values. It writes hydrodynamic x/y fluxes and, when sediment is enabled, sediment concentration fluxes.

## Flux Method

The shader computes one-dimensional wave speeds at east and north faces, then applies an HLL-style numerical flux formula. The output flux channels represent mass, x momentum, y momentum, and scalar/tracer transport.

## Wet/Dry Handling

`txHnear` is used to detect neighborhoods below the dry threshold. In those regions the mass difference is suppressed and flux limiting is made more diffusive to avoid creating unstable water exchange through dry cells.

## Sediment Coupling

When `useSedTransModel == 1`, the shader also computes sediment fluxes. It uses sediment face concentrations from `txSed_C1` through `txSed_C4` and adds class-1 turbulent/breaking dispersion based on `txBreaking`.

## Change Notes

This pass is consumed by all `Pass3` equation variants. Any change to flux channel semantics must be propagated to hydrodynamic integration, sediment integration, breaking, and diagnostics.
