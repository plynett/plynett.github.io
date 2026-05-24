# `shaders/SedTrans_Pass1.wgsl`

[Source](../../../shaders/SedTrans_Pass1.wgsl)

## What This Shader Does

Reconstructs sediment concentrations at cell faces for up to four sediment classes.

## Numerical Role

The shader mirrors the standard hydrodynamic `Pass1` pattern: minmod-limited reconstruction from neighboring cells, with safer behavior near wet/dry interfaces. It then divides by reconstructed face water depth from `txH` to obtain concentration-like values at faces.

## Output Contract

`txSed_C1` through `txSed_C4` use the same face-channel order as hydrodynamics:

- `x`: north face.
- `y`: east face.
- `z`: south face.
- `w`: west face.

## Change Notes

Although four classes are reconstructed, much of the downstream sediment logic currently uses class 1. Preserve the multi-class layout unless intentionally simplifying the sediment model.
