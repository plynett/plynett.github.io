# `shaders/SedTrans_Pass3.wgsl`

[Source](../../../shaders/SedTrans_Pass3.wgsl)

## What This Shader Does

Updates suspended sediment concentration and computes erosion, deposition, and bedload-gradient terms.

## Physical Terms

The shader reads hydrodynamic state, face velocities, sediment fluxes, bottom elevation, hard-bottom elevation, and breaking data. It computes:

- Flux divergence of suspended sediment.
- Friction/shear velocity.
- Shields parameter and critical-Shields erosion.
- Fall-velocity deposition.
- Hard-bottom erosion suppression.
- Meyer-Peter/Muller-style bedload gradient contribution for class 1.

## Time Integration

Like the water state, sediment supports explicit and predictor/corrector updates with old and predicted derivative textures. Negative concentrations are clamped to zero.

## Outputs

- `txNewState_Sed`: updated suspended concentration state.
- `dU_by_dt_Sed`: sediment derivative for time history.
- `erosion_Sed`: erosion plus bedload-gradient term used by bottom update.
- `depostion_Sed`: deposition term.

## Change Notes

The shader and JavaScript use the misspelling `depostion_Sed`. Keep searches and docs aware of that spelling.
