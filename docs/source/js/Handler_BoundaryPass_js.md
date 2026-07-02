# `js/Handler_BoundaryPass.js`

[Source](../../../js/Handler_BoundaryPass.js)

## What This File Owns

Creates the bind group for `BoundaryPass.wgsl`, which enforces model boundary conditions and wet/dry cleanup after explicit and implicit state updates.

## Binding Contract

- `0`: boundary/simulation uniform buffer.
- `1`: input water state.
- `2`: `txBottom`.
- `3`: `txWaves`, wave-forcing rows.
- `4`: input sediment state.
- `5`: temporary water-state output.
- `6`: temporary sediment-state output.
- `7`: input `txBreaking`.
- `8`: temporary breaking output.
- `9`: `txBoundaryForcing`.
- `10`: south boundary type `5` time-series forcing texture.
- `11`: north boundary type `5` time-series forcing texture.
- `12`: west boundary type `5` time-series forcing texture.
- `13`: east boundary type `5` time-series forcing texture.

## Pipeline Role

The boundary pass handles solid walls, sponge layers, periodic overlap, incident waves, boundary time-series forcing, river stage/discharge boundaries, sediment reset at boundaries, and shoreline cleanup. JavaScript copies its temporary outputs into canonical textures after dispatch.

## Change Notes

This shader is run more than once per timestep in dispersive modes. A boundary change affects both the explicit state and the post-PCR state.
