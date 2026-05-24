# `shaders/fragment.wgsl`

[Source](../../../shaders/fragment.wgsl)

## What This Shader Does

Main visualization shader for both 2D and 3D render paths. It maps simulation textures into scientific color maps or photorealistic coastal visualization, composites overlays, design components, foam/tracer, arrows, time-series markers, and the colorbar layer.

## Inputs

The shader uses the large render bind group from `Handler_Render.js`, including:

- Water state, bottom, means, wave height, baseline wave height.
- Friction, sediment, erosion, and bed-change textures.
- Design-component texture.
- Overlay map and colorbar draw texture.
- Time-series locations and breaking texture.
- Sample PNG texture array for turbulence, arrows, and design-component visuals.
- Half-float render cache `txRenderVarsf16`.

## Surface Modes

`surfaceToPlot` selects what scalar is colored. Modes include free surface, speed, velocity components, vorticity, breaking, bathymetry/topography, means, RMS/significant wave height, baseline difference, friction, max eta, sediment concentration/erosion/available depth/depth change, design components, and mean vorticity.

## Photorealistic Mode

When the waves color map is selected, the shader switches to a more visual water mode. It adds procedural short-wave roughness, simple lighting, turbulence texture modulation, vorticity/sediment plume tinting, map/land color, and design-component texture overlays.

## Overlays

The shader overlays:

- Foam or tracer depending on `showBreaking`.
- Velocity arrows from the sample texture array.
- Time-series dots and outlines.
- Colorbar background, ticks, labels, and logos from `txDraw`.

## Change Notes

This shader is tightly coupled to `Copytxf32_txf16.wgsl`, `Handler_Render.js`, and UI colorbar labels. Surface-mode numbers are an API shared with JavaScript controls.
