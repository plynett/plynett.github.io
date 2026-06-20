# `js/constants_load_calc.js`

[Source](../../../js/constants_load_calc.js)

## What This File Owns

This module owns the default simulation configuration and the derived constants that are recalculated after loading a scenario or editing parameters. It exports:

- `calc_constants`: the flat config object used by the entire app.
- `timeSeriesData`: CPU-side time-series storage for up to 16 gauges.
- `loadConfig()`: fetches example scenario configuration.
- `init_sim_parameters()`: merges config and computes derived values.

## Configuration Role

The config object includes grid size, numerical settings, physics options, boundary types, wave forcing, sediment parameters, design-component constants, linear-structure preview parameters, render settings, and export options. Example scenario configs override the defaults by key.

Linear-structure state is stored in the same flat `calc_constants` object as the rest of the UI state. The fields include crest elevation, crest width, side slope, the currently selected endpoint, the shared x/y coordinate inputs, stored start/end coordinates, start/end-defined flags, a preview-enabled flag, and a pending add flag used to dispatch the bathy/topo edit through `MouseClickChange.wgsl`. This keeps the terrain-modification shader inputs and the current render preview tied to one source of truth.

There is no formal schema. This file is effectively the schema, and many fields are coupled to uniform-buffer writers and WGSL `Globals` structs in `main.js` and `shaders/`.

## Derived Calculations

`init_sim_parameters()` computes values that should not be treated as independent user inputs:

- Timestep and `TWO_THETA`. For `grid_type == 2`, `dx` is longitude spacing in degrees, `dy` is latitude spacing in degrees, and the timestep uses the minimum physical spherical spacing from `R_earth`, `lat_LL`, and the grid dimensions.
- Dispatch counts from grid and workgroup size.
- PCR iteration counts `Px` and `Py`.
- Inverse grid spacing and higher-order inverse powers.
- Boussinesq and COULWAVE coefficients.
- Boundary reflection/shift indices.
- Ship/disturbance parameters.
- Sediment erosion, Shields, and fall velocity values.
- Canvas, colorbar, and render layout values.

## Change Notes

Adding a new config key usually requires more than adding a default here. Check whether it needs to be loaded from example JSON, shown in the UI, uploaded into a uniform buffer, and declared in WGSL. If a value is derived here, UI edits may overwrite a manually assigned value on the next `html_update`.

`grid_type == 2` is currently constrained to standard NLSW. The setup path forces `NLSW_or_Bous = 0`, `Accuracy_mode = 0`, `useSedTransModel = 0`, and `useBreakingModel = 0` for that mode.
