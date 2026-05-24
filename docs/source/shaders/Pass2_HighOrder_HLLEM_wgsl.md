# `shaders/Pass2_HighOrder_HLLEM.wgsl`

[Source](../../../shaders/Pass2_HighOrder_HLLEM.wgsl)

## What This Shader Does

This is an alternate high-order flux shader using an HLLEM-style contact-restoring correction over a base HLL flux.

## Active Status

The shader is present and has the same handler layout as other `Pass2` variants, but the current `main.js` high-order path selects `Pass2_HighOrder_HLLC.wgsl`. Treat this as an available alternative or experimental variant unless the selection logic changes.

## Flux Method

The shader computes HLL fluxes, estimates a Roe-like velocity, builds a less-diffusive linearized flux, and blends toward it with a limiter. Near dry cells it zeroes the mass jump in the HLL part.

## Sediment Coupling

Sediment fluxes are computed through the same HLLEM helper when sediment is enabled. The shader comments warn that diffusion terms are not integrated into this flux formulation.

## Change Notes

If reactivating this shader, compare output stability against the current HLLC path, especially near wet/dry boundaries and with sediment enabled.
