# `shaders/Pass1.wgsl`

[Source](../../../shaders/Pass1.wgsl)

## What This Shader Does

`Pass1` reconstructs face-centered water depth, velocity, and scalar values from cell-centered state. It uses a minmod-limited reconstruction and writes four face values per cell into `txH`, `txU`, `txV`, and `txC`.

## Output Contract

For each output texture, channels mean:

- `x`: north face.
- `y`: east face.
- `z`: south face.
- `w`: west face.

`txH` stores depth, `txU` stores x velocity, `txV` stores y velocity, and `txC` stores scalar/tracer concentration.

## Wet/Dry Handling

The shader exits early for dry cells surrounded by dry cells. Near the inundation limit it ramps the limiter toward stronger upwinding. It also clamps reconstructed depths to nonnegative values and uses a depth-safe division formula when converting momentum to velocity.

## Stabilization

A Froude limiter reduces extreme velocities over steep bathymetry. The code explicitly notes that very steep slopes are outside the intended physics and are artificially slowed for stability.

## Change Notes

This shader is tightly coupled to `Pass2`. Any change in face ordering, dry cutoff, or velocity definition must be reflected in flux, diagnostic, and render-cache passes.
