# `shaders/CalcMeans.wgsl`

[Source](../../../shaders/CalcMeans.wgsl)

## What This Shader Does

Updates running diagnostic fields: mean eta/u/v/scalar, max speed/eta values, momentum-flux metrics, mean absolute vorticity, and model velocity output.

## Inputs And Outputs

The shader reads reconstructed face values (`txH`, `txU`, `txV`, `txC`), bathymetry, previous diagnostic textures, and `txNewState`. It writes temporary diagnostic textures and `txModelVelocities`.

## Diagnostic Logic

Face values are averaged to cell-centered depth and velocity. Running means use `1 / n_time_steps_means` as the update fraction. Max values are only accumulated once the counter exceeds one step.

For dry cells, eta is set to a large negative placeholder so max-runup visualization does not treat dry cells as valid water.

## Change Notes

This pass provides data to rendering and exports. If channel meanings in `txMeans_Speed` or `txMeans_Momflux` change, update `fragment.wgsl`, `Copytxf32_txf16.wgsl`, and output code.
