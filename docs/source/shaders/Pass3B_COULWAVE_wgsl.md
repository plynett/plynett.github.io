# `shaders/Pass3B_COULWAVE.wgsl`

[Source](../../../shaders/Pass3B_COULWAVE.wgsl)

## What This Shader Does

`Pass3B_COULWAVE` is the second COULWAVE auxiliary pass. It computes derivative groupings and source-term helpers from the outputs of `Pass3A_COULWAVE`.

## Outputs

The pass writes four 2D textures that JavaScript later packs into `txCW_groupings`:

- `txCW_STval`: `S`, `T`, `d2udxdy`, `d2vdxdy`.
- `txCW_STgrad`: `dSdx`, `dSdy`, `dTdx`, `dTdy`.
- `txCW_Eterms`: `E1`, `E2`, `E`, `dvdx - dudy`.
- `txCW_FGterms`: `EzST`, `TzS2`, `uSxvSy`, `uTxvTy`.

## Numerical Role

These values feed the high-order source terms in `Pass3_COULWAVE`. The shader currently uses second-order derivative stencils, with commented alternate fourth-order derivative blocks.

## Change Notes

This pass depends on `dU_by_dt.x` for the `E` term. In the main loop it must run after the derivative texture has been produced for the relevant substep.
