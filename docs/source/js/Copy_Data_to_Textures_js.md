# `js/Copy_Data_to_Textures.js`

[Source](../../../js/Copy_Data_to_Textures.js)

## What This File Owns

This module converts CPU-loaded arrays into GPU texture payloads. It is where raw bathymetry, waves, initial conditions, constants, and tridiagonal coefficients become the exact channel layouts expected by shaders.

## Key Functions

- `copyBathyDataToTexture()`: packs bathymetry/topography into `txBottom`. It computes north/east face bed elevations, center bed elevation, and the near-dry flag. It also removes isolated one-cell dry islands before upload.
- `copyWaveDataToTexture()`: stores wave amplitude, period, direction, and phase rows into a texture read by `BoundaryPass.wgsl`.
- `copyTSlocsToTexture()`: writes time-series probe coordinates into the locations texture.
- `copyInitialConditionDataToTexture()`: writes eta, u, or v initial-condition grids into a state-like texture based on `writeStateFlag`.
- `copyConstantValueToTexture()`: fills an entire texture with one RGBA value.
- `copyTridiagXDataToTexture()` and `copyTridiagYDataToTexture()`: precompute Boussinesq/COULWAVE tridiagonal coefficients from bathymetry.
- `copyImageBitmapToTexture()` and `copy2DDataTo3DTexture()`: upload images and copy 2D data slices into 3D textures.

## Important Contracts

Texture rows must obey WebGPU copy alignment, so this file pads CPU buffers to 256-byte row boundaries where required.

Bathymetry channel meanings are fixed:

- `r`: north-face bed elevation.
- `g`: east-face bed elevation.
- `b`: center bed elevation.
- `a`: near-dry flag.

The tridiagonal coefficient textures use channels `a,b,c,d` in the numerical sense, mapped to RGBA as lower, diagonal, upper, and right-hand side/placeholder.

## Change Notes

This file is numerically significant. A "data upload" change can alter wet/dry behavior, implicit-solver stability, or boundary forcing. Any change here should be checked against `Pass1`, `Update_neardry`, `Update_TriDiag_coef*`, and the PCR shaders.
