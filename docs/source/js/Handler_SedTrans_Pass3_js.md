# `js/Handler_SedTrans_Pass3.js`

[Source](../../../js/Handler_SedTrans_Pass3.js)

## What This File Owns

Creates the bind group for `SedTrans_Pass3.wgsl`, the suspended-sediment update, erosion, deposition, and bedload-gradient pass.

## Binding Contract

- `0`: sediment uniform buffer.
- `1`: `txState_Sed`.
- `2`: `txXFlux_Sed`.
- `3`: `txYFlux_Sed`.
- `4`: `oldGradients_Sed`.
- `5`: `oldOldGradients_Sed`.
- `6`: `predictedGradients_Sed`.
- `7`: `txBottom`.
- `8`: hydrodynamic `txState`.
- `9`: `txNewState_Sed` output.
- `10`: `dU_by_dt_Sed` output.
- `11`: `erosion_Sed` output.
- `12`: `depostion_Sed` output.
- `13`: `txBreaking`.
- `14`: `txU`.
- `15`: `txV`.
- `16`: `txSed_C1`.
- `17`: `txHardBottom`.

## Pipeline Role

This pass integrates sediment concentration using the same time-scheme pattern as the water state. It also computes erosion/deposition rates used later by `SedTrans_UpdateBottom`.

## Change Notes

The file and shader use the misspelled name `depostion_Sed`; keep that exact spelling in binding docs and source searches.
