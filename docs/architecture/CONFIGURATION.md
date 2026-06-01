# Configuration System

Configuration is a flat JavaScript object, `calc_constants`, exported by `js/constants_load_calc.js`. Example `config.json` files override the defaults. Derived values are then computed in JavaScript and uploaded to WebGPU uniform buffers.

## Loading Order

The typical loading flow is:

1. `calc_constants` starts with defaults in `constants_load_calc.js`.
2. `loadConfig()` fetches the selected example `config.json`, if one is selected.
3. `init_sim_parameters()` merges uploaded or example config values onto the defaults.
4. Derived values are recalculated: dispatch counts, timestep, Boussinesq coefficients, inverse grid spacing, boundary reflection indices, canvas/render dimensions, sediment coefficients, and colorbar layout.
5. Uniform buffers are updated from the resulting values.

There is no schema validator. Unknown keys may be ignored, and missing keys fall back to default JavaScript values if the code path reads them.

## Important Config Families

Grid and timestep:

- `WIDTH`, `HEIGHT`
- `dx`, `dy`
- `Courant`
- `dt`
- `ThreadX`, `ThreadY`, `DispatchX`, `DispatchY`

Physics and numerics:

- `NLSW_or_Bous`
- `Accuracy_mode`
- `timeScheme`
- `TWO_THETA`
- `Bcoef`, `Bcoef_g`, `Bous_alpha`
- `gravity`, `friction`, `isManning`
- `useBreakingModel`
- `delta`, `epsilon`, `base_depth`

Boundary and forcing:

- `west_boundary_type`, `east_boundary_type`, `south_boundary_type`, `north_boundary_type`
- `BoundaryWidth`
- `incident_wave_type`
- `incident_wave_H`, `incident_wave_T`, `incident_wave_direction`
- `numberOfWaves`
- river stage/discharge fields for flood scenarios

For `incident_wave_type == 0`, `main.js` treats the UI values as a single sine-wave component, converts height to amplitude with `H / 2`, converts direction from degrees to radians, sets `numberOfWaves` to 1, and reuploads `txWaves`. For `incident_wave_type == 1`, `Wave_Generator.js` builds a cached TMA directional spectrum from the same height, period, and direction controls, sets `numberOfWaves` to the generated component count, and reuploads `txWaves`.

Sediment:

- `useSedTransModel`
- `sedC1_shields`, `sedC1_criticalshields`, `sedC1_erosion`
- `sedC1_fallvel`, `sedC1_n`, `sedC1_bedloadMPM`
- `sedTurbDispersion`, `sedBreakingDispersionCoef`

Rendering and interaction:

- `surfaceToPlot`
- `colorMap_choice`, `colorVal_min`, `colorVal_max`
- `GoogleMapOverlay`, `IsOverlayMapLoaded`
- `renderZScale`
- `showArrows`, `arrow_scale`, `arrow_density`
- design-component friction constants

## Uniform Coupling

Many WGSL files declare their own `Globals` struct with only the values that shader needs. Those struct layouts are filled from JavaScript uniform-buffer packing logic in `main.js`. The coupling is positional and byte-layout sensitive; adding a field to a shader `Globals` struct requires updating the corresponding JavaScript buffer writer.

The same config value can appear in multiple shader `Globals` structs. For example, `delta`, `base_depth`, grid dimensions, and inverse grid spacings are repeated across hydrodynamic, sediment, boundary, render, and tridiagonal shaders.

## Derived Values

`init_sim_parameters()` computes values that are not meant to be edited directly:

- `dt` from grid spacing, gravity, base depth, and Courant-style settings.
- `DispatchX`/`DispatchY` from grid size and workgroup size.
- `Px`/`Py`, the PCR iteration counts.
- Inverse grid spacing and powers such as `one_over_d2x`, `one_over_d3x`, and `one_over_dxdy`.
- Boundary reflection/shift indices.
- Render/canvas ratios and colorbar coordinates.
- Sediment settling/erosion coefficients from configured material properties.

When a scenario behaves oddly, check whether the value is directly loaded from JSON or derived after loading. The latter may be overwritten every time UI changes trigger recalculation.

## Root Config Note

The repository ignores a root-level `config.json`. Example configs inside `examples/` are tracked and are the normal source of scenario definitions. This matters for debugging because a root config created during manual testing will not be deployed or committed unless `.gitignore` is changed.
