# `shaders/SedTrans_Pass3_old.wgsl`

[Source](../../../shaders/SedTrans_Pass3_old.wgsl)

## What This Shader Does

Older sediment update variant. It resembles `SedTrans_Pass3.wgsl` but lacks the newer bedload-gradient treatment and uses slightly different erosion/deposition scaling.

## Active Status

This file is present in the shader directory but is not the active sediment update shader in the current main pipeline. The active path fetches and dispatches `SedTrans_Pass3.wgsl`.

## Useful Context

The file is useful for understanding how the sediment model evolved, especially the suspended-load source terms and friction/shear logic before later bedload additions.

## Change Notes

Do not modify this expecting runtime behavior to change unless `main.js` shader selection is also changed.
