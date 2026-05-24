# `js/Config_Pipelines.js`

[Source](../../../js/Config_Pipelines.js)

## What This File Owns

This module creates WebGPU compute and render pipelines from shader modules and bind-group layouts. It centralizes the low-level pipeline descriptors used by `main.js`.

## Pipeline Helpers

- `createComputePipeline(...)`: creates a compute pipeline with WGSL entry point `main` and tracks it in `allComputePipelines`.
- `createRenderPipeline(...)`: creates the 2D fullscreen render pipeline using `vertex.wgsl` and `fragment.wgsl`.
- `createRenderPipeline_vertexgrid(...)`: creates the 3D water-surface grid render pipeline using `vertex3D.wgsl` and the main fragment shader.
- `createSkyboxPipeline(...)`: creates the fullscreen-triangle skybox pipeline.
- `createModelPipeline(...)`: creates a simple triangle-list model pipeline for box/model rendering.
- `createDuckPipeline(...)`: prototype glTF-style pipeline with position, normal, and UV attributes.

## Important Contracts

The render pipelines expect specific vertex formats:

- 2D fullscreen render does not require a vertex buffer because `vertex.wgsl` builds a quad from `vertex_index`.
- 3D water grid expects a `float32x2` position buffer.
- Model pipeline expects `float32x3` positions.
- Duck pipeline expects position, normal, and UV buffers.

Depth testing is enabled for 3D water/model pipelines and disabled or adjusted for fullscreen paths.

## Change Notes

Pipeline changes must match shader entry points and bind-group layouts. Since the app has no build step, shader compilation errors appear at runtime in the browser. Keep new pipeline descriptors minimal and consistent with existing usage.
