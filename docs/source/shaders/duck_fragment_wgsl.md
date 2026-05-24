# `shaders/duck.fragment.wgsl`

[Source](../../../shaders/duck.fragment.wgsl)

## What This Shader Does

Prototype textured-model fragment shader. It samples an albedo texture using interpolated UVs and applies simple Lambert diffuse lighting with a small ambient term.

## Binding Contract

- `0`: model uniform buffer.
- `1`: albedo texture.
- `2`: albedo sampler.

## Active Status

This is part of the prototype duck/glTF path rather than the core wave simulation.

## Change Notes

If glTF model rendering becomes a user-facing feature, this shader will likely need material, normal, and lighting improvements.
