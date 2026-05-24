# `js/Handler_Pass2.js`

[Source](../../../js/Handler_Pass2.js)

## What This File Owns

Creates the bind group for hydrodynamic and sediment flux calculation. It is shared by the standard `Pass2.wgsl` and the high-order HLLC/HLLEM variants.

## Binding Contract

- `0`: simulation uniform buffer.
- `1`: `txH`, reconstructed face depths.
- `2`: `txU`, reconstructed x velocities.
- `3`: `txV`, reconstructed y velocities.
- `4`: `txBottom`, bathymetry/topography.
- `5`: `txC`, reconstructed scalar/tracer values.
- `6`: `txHnear`, neighbor-depth helper.
- `7`: `txXFlux`, hydrodynamic x-flux output.
- `8`: `txYFlux`, hydrodynamic y-flux output.
- `9` to `12`: `txSed_C1` through `txSed_C4`, sediment face concentrations.
- `13`: `txXFlux_Sed`, sediment x-flux output.
- `14`: `txYFlux_Sed`, sediment y-flux output.
- `15`: `txBreaking`, breaking intensity used for sediment dispersion.

## Pipeline Role

This pass computes the flux divergence inputs consumed by `Pass3`. Sediment flux output is only meaningful when `useSedTransModel == 1`.

## Change Notes

The handler layout intentionally includes sediment bindings even when sediment is disabled. Keep this compatibility if adding flux variants.
