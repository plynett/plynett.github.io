# `shaders/Pass2_HighOrder_HLLC.wgsl`

[Source](../../../shaders/Pass2_HighOrder_HLLC.wgsl)

## What This Shader Does

This high-order flux variant computes fluxes from reconstructed face states using an HLLC-style solver. It is the high-order `Pass2` shader currently selected by `main.js`.

## Flux Method

The shader builds left/right state vectors at x and y faces, computes bounding wave speeds, starts from an HLL flux, and blends toward a contact-restoring HLLC star flux. Near dry cells it disables the mass jump term through `DU_flag`.

## Sediment Coupling

When sediment is enabled, it computes sediment concentration fluxes through the same HLLC helper. Comments note that some diffusion terms are not incorporated into the HLLEM/HLLC-style sediment flux path.

## Numerical Role

This shader pairs with `Pass1_HighOrder.wgsl`. The reconstruction provides higher-order face states; this shader supplies a less diffusive Riemann-style flux than the standard scalar HLL formula.

## Change Notes

The HLLC implementation uses several GPU-safe guards around division and dry states. Preserve those guards when modifying wave-speed or star-state logic.
