# `js/File_Writer.js`

[Source](../../../js/File_Writer.js)

## What This File Owns

This module reads GPU textures back to the CPU and writes browser-downloadable outputs. It covers scientific data exports, rendered images, GIFs, JSON config, and helper readback utilities.

## Main Readback Paths

- `readTextureData()`: copies an `rgba32float` texture into a padded GPU buffer, maps it, and extracts one 1-based channel into a flat `Float32Array`.
- `downloadTextureData()`: wraps `readTextureData()` for user downloads.
- `writeSurfaceData()`: writes selected simulation surfaces such as bathymetry, eta, momentum, velocity, and turbulence.
- `TexturetoImageData()`: converts a BGRA WebGPU texture readback into browser `ImageData`.

## Rendered Outputs

- `saveRenderedImageAsJPEG()` reads `txScreen`, swaps BGRA to RGBA, draws to a canvas, and downloads a JPEG.
- `saveTextureSlicesAsImages()` exports slices from a 3D image texture.
- `createAnimatedGifFromTexture()` reads a 3D texture as animation frames and uses the local GIF worker.
- `createAndDownloadVideoFromTexture()` is present but inactive/limited by browser SharedArrayBuffer constraints.

## Config Helpers

`downloadObjectAsFile()` saves JSON-like objects such as the current config. `handleFileSelect()` and `loadJsonIntoCalcConstants()` support loading config JSON through file input.

## Change Notes

WebGPU readbacks require padded rows. Be careful when changing texture formats or channel numbering because export functions often assume `rgba32float` or BGRA canvas layout. `downloadGeoTiffData()` appears stale relative to the current `readTextureData()` signature and should be audited before use.
