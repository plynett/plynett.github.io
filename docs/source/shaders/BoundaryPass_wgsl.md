# `shaders/BoundaryPass.wgsl`

[Source](../../../shaders/BoundaryPass.wgsl)

## What This Shader Does

`BoundaryPass` enforces boundary conditions, wave/river forcing, sediment boundary behavior, breaking boundary copying, and wet/dry cleanup. It writes temporary state textures that JavaScript copies into canonical textures.

## Boundary Types

The shader handles:

- Solid walls with reflected normal momentum.
- Sponge layers with cosine-based damping.
- Periodic two-cell overlap regions.
- Incoming sine/transient wave forcing from `txWaves`.
- Solitary wave forcing.
- Boundary type `5` forcing from per-side `eta/hu/hv` time-series textures.
- Constant stage/discharge river boundaries.

For boundary type `5`, `BoundaryPass` linearly interpolates station values along the boundary and linearly blends the two time rows selected by JavaScript. South/north use x or longitude coordinates; west/east use y or latitude coordinates. In `grid_type == 2`, `lon_LL` and `lat_LL` shift the shader coordinates into absolute degrees.

## Wet/Dry Cleanup

After boundary forcing, the shader clamps negative depths, removes isolated one-cell wet/dry artifacts, and freezes narrow channel-end cells when appropriate. This cleanup is important for shoreline stability.

## Sediment And Breaking

Sediment state is reset to zero at many forced/damped/solid boundary regions. Breaking state is copied across periodic boundaries and cleared in some river/forcing boundary paths.

## Change Notes

This pass is not just a boundary edge operation; it reads neighbor cells and can affect interior cells near the boundary and shoreline. It runs before and after the implicit solve in dispersive modes.
