# `js/Handler_PassBreaking.js`

[Source](../../../js/Handler_PassBreaking.js)

## What This File Owns

Creates the bind group for `Pass_Breaking.wgsl`, the wave-breaking and eddy-viscosity helper pass.

## Binding Contract

- `0`: breaking/simulation uniform buffer.
- `1`: `txState`.
- `2`: `txBottom`.
- `3`: `dU_by_dt`.
- `4`: `txXFlux`.
- `5`: `txYFlux`.
- `6`: previous `txBreaking`.
- `7`: `txDissipationFlux` output.
- `8`: temporary breaking output.

## Pipeline Role

The pass computes breaking onset/age, breaking intensity, and viscosity-weighted momentum-gradient terms. `Pass3_Bous` and `Pass3_COULWAVE` later use `txDissipationFlux` to add breaking momentum diffusion.

## Change Notes

JavaScript copies the temporary breaking output back into `txBreaking` after the pass. If you add channels to `txBreaking`, update the copy and render logic too.
