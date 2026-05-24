# `shaders/model.fragment.wgsl`

[Source](../../../shaders/model.fragment.wgsl)

## What This Shader Does

Fragment shader for simple box/model rendering. It colors faces in grayscale based on the dominant local-position axis and face sign.

## Role

The shader gives simple geometry enough visual orientation to be readable without needing a material system or texture.

## Change Notes

If textured or lit models become the default, this shader may be replaced by the duck/glTF-style path or a new material shader.
