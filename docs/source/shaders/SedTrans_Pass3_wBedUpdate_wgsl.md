# `shaders/SedTrans_Pass3_wBedUpdate.wgsl`

[Source](../../../shaders/SedTrans_Pass3_wBedUpdate.wgsl)

## What This Shader Does

Prototype sediment update that attempts to update suspended concentration and bed state in one shader.

## Active Status

This is not the active sediment pass. The current pipeline uses `SedTrans_Pass3.wgsl` followed by `SedTrans_UpdateBottom.wgsl`.

## Important Caveat

The file references identifiers such as bed-state and bed-gradient textures that are not declared in its binding list. As written, it should be treated as incomplete prototype code rather than a ready shader.

## Change Notes

If reviving this approach, define a complete handler/binding layout first and decide whether combining suspended and bed updates is worth the added coupling.
