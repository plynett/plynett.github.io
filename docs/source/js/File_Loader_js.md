# `js/File_Loader.js`

[Source](../../../js/File_Loader.js)

## What This File Owns

This module loads scenario inputs and image resources into CPU-side structures that later get copied to GPU textures. It handles both bundled example assets and user-selected files.

## Grid Loaders

The bathymetry and surface loaders read whitespace-delimited text grids sized by `WIDTH x HEIGHT`. `loadDepthSurface()` fetches the example `bathy.txt` unless a user file is supplied. It also flattens the outer three cells from nearby interior values so boundary/ghost-cell behavior is less sensitive to edge data.

Related optional loaders:

- `loadInitCondSurface()`
- `loadFrictionSurface()`
- `loadHardBottomSurface()`

Each returns numeric grid data for later packing by `Copy_Data_to_Textures.js`.

## Wave And Overlay Loaders

`loadWaveData()` reads `waves.txt`. The first line provides the number of waves; later rows contain wave parameters consumed by the boundary shader.

Overlay helpers load local overlay images or construct a Google Static Maps request from scenario coordinates. The Google map code computes Mercator-style scale/offset values used by the render shader to align image pixels with model coordinates.

## Image Helpers

The module also loads:

- Generic image bitmaps.
- User-provided overlay imagery.
- Skybox cube-map faces.

`createTextureFromImage()` appears stale because it references `context.queue` rather than `device.queue`; current code generally uploads images elsewhere.

## Change Notes

The text-grid parsers assume dimensions already match config. If adding a new input file type, keep parsing and GPU packing separate: parse here, then add a channel-aware copy helper in `Copy_Data_to_Textures.js`.
