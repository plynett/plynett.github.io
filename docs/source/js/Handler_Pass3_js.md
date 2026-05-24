# `js/Handler_Pass3.js`

[Source](../../../js/Handler_Pass3.js)

## What This File Owns

Defines bind-group layouts for the main physics/time-integration pass and the two COULWAVE auxiliary passes. This is one of the most important handler files because `Pass3` is where fluxes, source terms, breaking, friction, and predictor/corrector integration meet.

## Main Pass Binding Contract

Used by `Pass3_NLSW.wgsl`, `Pass3_Bous.wgsl`, and `Pass3_COULWAVE.wgsl`:

- `0`: simulation uniform buffer.
- `1`: `txState`.
- `2`: `txBottom`.
- `3`: `txCW_groupings`, 3D COULWAVE auxiliary texture. Dummy 1x1 resource in non-COULWAVE mode.
- `4`: `txXFlux`.
- `5`: `txYFlux`.
- `6`: `oldGradients`.
- `7`: `oldOldGradients`.
- `8`: `predictedGradients`.
- `9`: `F_G_star_oldGradients`.
- `10`: `F_G_star_oldOldGradients`.
- `11`: `txstateUVstar`.
- `12`: `txBoundaryForcing`.
- `13`: `txNewState` output.
- `14`: `dU_by_dt` output.
- `15`: `F_G_star` output.
- `16`: `current_stateUVstar` output.
- `17`: `txBottomFriction`.
- `18`: `txBreaking`.
- `19`: `txDissipationFlux`.
- `20`: `txContSource`.

## COULWAVE Auxiliary Bindings

`Pass3A_COULWAVE`:

- Reads state, bottom, `txU`, and `txV`.
- Writes model velocities, `txCW_zalpha`, and `txCW_uvhuhv`.

`Pass3B_COULWAVE`:

- Reads state, bottom, `txCW_uvhuhv`, `txCW_zalpha`, and `dU_by_dt`.
- Writes `txCW_STval`, `txCW_STgrad`, `txCW_Eterms`, and `txCW_FGterms`.

## Change Notes

The main layout is broad so all equation-family shaders can share it. Do not remove a binding just because one variant does not use it. COULWAVE depends on JavaScript copying the auxiliary 2D outputs into layers of `txCW_groupings` before the main COULWAVE pass runs.
