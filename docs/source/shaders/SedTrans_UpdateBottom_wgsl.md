# `shaders/SedTrans_UpdateBottom.wgsl`

[Source](../../../shaders/SedTrans_UpdateBottom.wgsl)

## What This Shader Does

Updates bathymetry/topography from sediment erosion and deposition rates.

## Bed-Change Logic

The shader computes bed elevation changes from erosion minus deposition divided by sediment porosity correction. It builds center, east-face, and north-face bottom changes so the `txBottom` face-channel convention remains valid.

It ramps sediment changes down near incoming-wave boundaries to avoid immediate boundary artifacts.

## Outputs

- `txtemp_SedTrans_Botttom`: updated bottom texture.
- `txtemp_SedTrans_Change`: cumulative bottom change relative to `txBottomInitial`.

## Change Notes

After this shader, JavaScript must copy outputs back, run `Update_neardry`, and refresh tridiagonal coefficients in dispersive modes. The output name includes `Botttom` with three `t`s in the JavaScript variable; preserve exact names in searches.
