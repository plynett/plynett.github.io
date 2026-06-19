# `js/Wave_Generator.js`

[Source](../../../js/Wave_Generator.js)

## What This File Owns

`Wave_Generator.js` builds CPU-side boundary wave rows for UI-selected incident-wave options before `main.js` uploads them into `txWaves`.

The row contract matches `waves.txt`:

- amplitude
- period
- direction in radians
- random phase in radians

## Generators

`buildSineWaveData(calc_constants)` creates one component from the incident-wave UI controls. The UI height is a wave height, so the generated row stores amplitude as `incident_wave_H / 2`. When the two boundaries transverse to the incident-wave boundary are periodic, the single component's direction is fitted so its along-boundary phase matches at both active ends of the forcing boundary. When the transverse boundaries are not periodic, the requested direction is preserved.

`buildTmaWaveData(calc_constants)` creates a JONSWAP/TMA-style directional spectrum using hardcoded spectral coefficients. The peak period comes from `incident_wave_T`, the peak direction comes from `incident_wave_direction`, and the generated frequency grid uses about 100 frequencies from `1 / (3 * incident_wave_T)` through `3 / incident_wave_T`.

The TMA path uses nine directions from `incident_wave_direction - 20` degrees through `incident_wave_direction + 20` degrees at 5-degree spacing. When the two boundaries transverse to the incident-wave boundary are periodic, it applies periodic-boundary direction fitting before upload. The fitting uses the active forcing span `boundaryLength - 2 * ds`, matching `BoundaryPass.wgsl` coordinates from index `1` to index `N-2`. Each fitted component selects an integer number of along-boundary waves and sets `k_parallel = sign(k_parallel_raw) * 2*pi*N / activeBoundaryLength`, so the component phase matches at both active ends of the boundary. When the transverse boundaries are not periodic, requested/generated directions are preserved.

## Caching

TMA generation caches the latest spectrum by wave height, period, direction, grid spacing, boundary geometry, base depth, and active boundary types. This keeps random phases stable across unrelated UI updates while still regenerating the spectrum when the incident-wave controls or active boundary geometry changes.

## Texture Capacity

`GENERATED_BOUNDARY_WAVE_TEXTURE_CAPACITY` is exported so `main.js` can allocate enough `txWaves` rows for generated spectra even when the loaded `waves.txt` file has only one row.
