# `shaders/fragment_testing.wgsl`

[Source](../../../shaders/fragment_testing.wgsl)

## What This Shader Does

Experimental alternate version of the main fragment shader. It largely mirrors `fragment.wgsl` but contains different photorealistic lighting/roughness parameters and arrow compositing details.

## Active Status

The main pipeline fetches `fragment.wgsl` for normal rendering. This file is present as a testing variant and should not be assumed active unless `main.js` shader selection is changed.

## Useful Context

Because it is close to the main fragment shader, it can be used to compare rendering experiments without losing the production visualization path.

## Change Notes

If changes from this file are promoted into `fragment.wgsl`, also update `Handler_Render.js`, colorbar labels, and render-cache docs if any sampled channel or surface mode changes.
