# `js/Handler_Render.js`

[Source](../../../js/Handler_Render.js)

## What This File Owns

Creates the render bind-group layout and bind group used by the 2D and 3D visualization shaders. It also updates the colorbar/text/logo overlay texture.

## Binding Contract

- `0`: render uniform buffer.
- `1`: water state texture used as eta/state input.
- `2`: `txBottom`.
- `3`: `txMeans`.
- `4`: `txWaveHeight`.
- `5`: `txBaseline_WaveHeight`.
- `6`: `txBottomFriction`.
- `7`: `txNewState_Sed`.
- `8`: `erosion_Sed` or legacy depth-reference texture depending on call site.
- `9`: `txBotChange_Sed`.
- `10`: `txDesignComponents`.
- `11`: `txOverlayMap`.
- `12`: `txDraw`.
- `13`: nearest/non-filtering sampler.
- `14`: `txTimeSeries_Locations`.
- `15`: `txBreaking`.
- `16`: `txSamplePNGs` 2D-array image texture.
- `17`: linear/filtering sampler.
- `18`: `txRenderVarsf16` 2D-array render cache.

## Colorbar Overlay

`update_colorbar()` draws logos, labels, tick marks, and tick values to an offscreen canvas, then uploads it to `txDraw`. The fragment shader samples `txDraw` and composites non-white pixels over the rendered field.

## Change Notes

`main.js` creates this bind group at startup and may rebuild it when the overlay selector switches back to a loaded Google Maps or satellite image. All call sites must pass the full argument list, including `txDesignComponents`, `textureSampler_linear`, and `txRenderVarsf16`; missing trailing arguments can stop the render loop during an overlay toggle.
