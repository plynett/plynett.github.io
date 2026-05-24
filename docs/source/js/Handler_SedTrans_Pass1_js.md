# `js/Handler_SedTrans_Pass1.js`

[Source](../../../js/Handler_SedTrans_Pass1.js)

## What This File Owns

Creates the bind group for `SedTrans_Pass1.wgsl`, the sediment concentration reconstruction pass.

## Binding Contract

- `0`: sediment/simulation uniform buffer.
- `1`: `txState_Sed`, current sediment concentration state.
- `2`: `txBottom`.
- `3`: `txH`, hydrodynamic face depths.
- `4`: `txSed_C1` output.
- `5`: `txSed_C2` output.
- `6`: `txSed_C3` output.
- `7`: `txSed_C4` output.

## Pipeline Role

This pass mirrors hydrodynamic reconstruction for sediment. It reconstructs up to four concentration classes at the same face ordering used by `txH`, `txU`, and `txV`.

## Change Notes

The current sediment model mainly uses class 1, but the layout preserves four-class capacity. Keep all four bindings unless the whole sediment pipeline is narrowed deliberately.
