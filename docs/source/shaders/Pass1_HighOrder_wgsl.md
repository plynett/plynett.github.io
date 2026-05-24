# `shaders/Pass1_HighOrder.wgsl`

[Source](../../../shaders/Pass1_HighOrder.wgsl)

## What This Shader Does

This is the high-order reconstruction variant selected when `Accuracy_mode == 1`. It keeps the same binding and output contract as `Pass1.wgsl`, but uses a wider stencil and a fourth-order MUSCL/TVD-style reconstruction in interior wet regions.

## Reconstruction Strategy

The shader samples neighbors up to three cells away. It uses the standard minmod reconstruction near dry cells, near topography above datum, or near boundary-like conditions. Otherwise it uses `ReconstructMUSCL4()` with limited slopes and third-difference corrections.

## Output Contract

It writes the same face ordering as the standard pass:

- `x`: north face.
- `y`: east face.
- `z`: south face.
- `w`: west face.

Outputs are `txH`, `txU`, `txV`, and `txC`.

## Numerical Role

The intent is higher accuracy in interior wet regions while falling back to safer low-order behavior near wet/dry interfaces and shoreline/topographic discontinuities.

## Change Notes

Because this shader uses a wider stencil, boundary and periodic behavior are more sensitive than in the standard pass. Check `BoundaryPass` and the high-order `Pass2` variant when changing it.
