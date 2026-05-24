# `shaders/Pass0.wgsl`

[Source](../../../shaders/Pass0.wgsl)

## What This Shader Does

`Pass0` computes neighboring water depths around each cell and writes them into `txHnear`. It samples free-surface elevation from `txState` and bed elevation from `txBottom`.

## Output Contract

`txHnear` channels are:

- `x`: north neighbor depth.
- `y`: east neighbor depth.
- `z`: south neighbor depth.
- `w`: west neighbor depth.

These values are later used by flux logic to detect near-dry neighborhoods.

## Numerical Role

This pass is a cheap prepass that keeps wet/dry checks out of the heavier reconstruction and flux logic. It clamps neighbor indices at domain edges rather than enforcing physical boundaries; physical boundary conditions are handled by `BoundaryPass`.

## Change Notes

If channel ordering changes here, update `Pass2` and any docs or diagnostics that interpret `txHnear`.
