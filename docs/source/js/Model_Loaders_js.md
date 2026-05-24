# `js/Model_Loaders.js`

[Source](../../../js/Model_Loaders.js)

## What This File Owns

This module loads and prepares 3D scene/model data for the WebGPU renderer. It uses `gl-matrix` for matrices and contains both simple box-model support and a prototype glTF loader.

## Scene Model Path

`loadModelDefinitions()` reads model definitions from a URL or file. `loadSceneModels()` interprets those definitions, builds model matrices, and prepares simple box-like scene objects. `makeModelMatrix()` and its helper build transforms from position, scale, and rotation.

This is the path most aligned with the current box/model rendering shaders.

## glTF Path

`loadglTFModel()` fetches a glTF JSON file, binary buffer, and textures. It extracts POSITION, NORMAL, TEXCOORD, and indices from the first primitive, creates GPU buffers, uploads the albedo texture, and returns render-ready model resources plus bounds.

This path is more prototype-like in the current app. Duck/glTF rendering code exists but is not the main simulation visualization path.

## Important Contracts

The simple model pipeline expects position-only vertices and a per-model uniform buffer containing view/projection, model matrix, and camera position. The duck/glTF pipeline expects position, normal, and UV attributes and a sampled albedo texture.

## Change Notes

Keep model loading separate from simulation state. Models are visual/contextual objects; they should not mutate hydrodynamic textures unless a deliberate coupling is added elsewhere.
