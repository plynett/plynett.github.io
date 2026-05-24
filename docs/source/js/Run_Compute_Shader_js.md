# `js/Run_Compute_Shader.js`

[Source](../../../js/Run_Compute_Shader.js)

## What This File Owns

This module provides generic WebGPU dispatch and copy helpers. It is used by `main.js` to run compute passes without duplicating command-encoder boilerplate for every shader.

## Dispatch Helpers

The immediate helpers create a command encoder, encode a compute pass or copy, finish the command buffer, and submit it immediately.

The `_EncStack` variants append work to an existing command encoder and return it. The main timestep loop uses these heavily to batch compute passes and copies into fewer submissions.

## Shader Fetching

`fetchShader()` fetches WGSL source text by URL/path. Since the app is static and unbundled, this is the runtime source-loading mechanism for shaders.

## Important Contracts

Dispatch dimensions are supplied by `calc_constants.DispatchX` and `DispatchY`. Shaders generally use `@workgroup_size(16, 16)`, so those dispatch counts must cover the configured grid.

Texture-copy helpers are part of the numerical algorithm, not just data plumbing. Many passes write temporary storage textures that are then copied into canonical state textures.

## Change Notes

Use encoder-stacked helpers when adding work inside the timestep loop. Extra immediate submissions can reduce performance and may change synchronization timing. Keep shader fetch paths relative to the served site root.
