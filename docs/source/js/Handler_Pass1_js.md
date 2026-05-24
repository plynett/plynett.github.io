# `js/Handler_Pass1.js`

[Source](../../../js/Handler_Pass1.js)

## What This File Owns

Creates the bind group for face-state reconstruction. The same layout is used by `Pass1.wgsl` and `Pass1_HighOrder.wgsl`.

## Binding Contract

- `0`: simulation uniform buffer.
- `1`: `txState`, current water state.
- `2`: `txBottom`, bathymetry/topography.
- `3`: `txH`, storage output for reconstructed face depths.
- `4`: `txU`, storage output for reconstructed x velocity.
- `5`: `txV`, storage output for reconstructed y velocity.
- `6`: `txC`, storage output for reconstructed scalar/tracer.

## Pipeline Role

`Pass1` converts cell-centered state into face values used by Riemann/flux shaders. The high-order shader uses a wider stencil but keeps the exact same output contract.

## Change Notes

Any new face quantity should be added carefully because `Pass2`, diagnostics, render packing, and sediment passes assume the existing channel order.
