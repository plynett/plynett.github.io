# Data And Texture Contracts

The simulation is texture-centric. Most arrays that would be CPU-side matrices in a traditional model are WebGPU textures here. JavaScript modules allocate and copy them; WGSL shaders read/write them through fixed bindings.

## State Textures

`txState` and `txNewState` store the primary water state:

- `r`: free surface elevation.
- `g`: x momentum, often called `P` or `hu`.
- `b`: y momentum, often called `Q` or `hv`.
- `a`: scalar field, used for foam, passive tracer, or visualization overlay depending on mode.

`txstateUVstar` and `current_stateUVstar` store the intermediate state used by the implicit dispersive solve. In NLSW mode this is effectively copied through; in Boussinesq/COULWAVE modes it is the right-hand side/solution texture around the PCR solve.

## Bathymetry Texture

`txBottom` stores bed/topography data and wet/dry metadata:

- `r`: bed elevation at the north face of the cell.
- `g`: bed elevation at the east face of the cell.
- `b`: bed elevation at the cell center.
- `a`: near-dry flag. Positive values mark cells far from initially dry land; negative values mark cells near dry terrain.

The loader computes the face elevations and near-dry flag. `Update_neardry.wgsl` recomputes the flag after interactive bathymetry, disturbance, or sediment changes.

`txBottomInitial` preserves the starting bed state. It is used for moving-bottom disturbances and cumulative sediment bed-change output. `txHardBottom` represents a non-erodible lower bed limit.

## Face Reconstruction Textures

`Pass1` writes reconstructed quantities at faces:

- `txH`: water depths at north, east, south, west faces in channels `x`, `y`, `z`, `w`.
- `txU`: x velocity at those same faces.
- `txV`: y velocity at those same faces.
- `txC`: scalar/tracer concentration at those same faces.

This channel ordering is reused by sediment reconstruction and diagnostics. It is easy to get wrong because `x` is the north face and `y` is the east face; read the shader docs before changing it.

## Flux Textures

`txXFlux` and `txYFlux` store numerical fluxes from `Pass2`:

- Channel `x`: mass/free-surface flux.
- Channel `y`: x-momentum flux.
- Channel `z`: y-momentum flux.
- Channel `w`: scalar/tracer flux.

Sediment fluxes use `txXFlux_Sed` and `txYFlux_Sed` with one channel per sediment concentration class. The current sediment implementation mainly uses class 1, while the texture layout leaves room for four classes.

## Breaking And Dissipation

`txBreaking` stores wave-breaking state:

- `x`: breaking start/age time marker.
- `y`: breaking eddy viscosity.
- `z`: breaking-front/intensity parameter.
- `w`: Smagorinsky/subgrid term placeholder.

`txDissipationFlux` stores viscosity-weighted momentum gradients used by `Pass3_Bous` and `Pass3_COULWAVE` to add breaking momentum diffusion.

## Tridiagonal Solver Textures

Boussinesq and COULWAVE modes solve implicit x and y systems with Parallel Cyclic Reduction.

- `coefMatx`, `coefMaty`: initial tridiagonal coefficients.
- `newcoef_x`, `newcoef_y`: mutable PCR coefficient textures used as one side of the coefficient ping-pong handoff.
- `txtemp_PCRx`, `txtemp_PCRy`: mutable PCR coefficient textures used as the other side of the coefficient ping-pong handoff.
- `txtemp2_PCRx`, `txtemp2_PCRy`: solution textures written only by the final PCR iteration of each directional solve.

Coefficient channels are generally:

- `r`: lower/subdiagonal coefficient `a`.
- `g`: diagonal coefficient `b`.
- `b`: upper/superdiagonal coefficient `c`.
- `a`: right-hand-side value during PCR iterations.

COULWAVE coefficient update stores velocity-like right-hand sides first and the final PCR pass converts velocity back to momentum using local water depth.

The active solver no longer copies `coefMat*` into `newcoef_*` before each solve or copies `txtemp_PCR*` back into `newcoef_*` after each iteration. Instead, JavaScript selects bind groups that read from the current coefficient texture and write the next one.

## COULWAVE Grouping Texture

COULWAVE mode uses a 3D `rgba32float` texture, `txCW_groupings`, to pack intermediate fields:

- Layer 0: `u`, `v`, `du`, `dv`.
- Layer 1: `za`, `dzadx`, `dzady`, unused.
- Layer 2: `S`, `T`, `d2udxdy`, `d2vdxdy`.
- Layer 3: `dSdx`, `dSdy`, `dTdx`, `dTdy`.
- Layer 4: `E1`, `E2`, `E`, `dvdx - dudy`.
- Layer 5: `EzST`, `TzS2`, `uSxvSy`, `uTxvTy`.

`Pass3A_COULWAVE` and `Pass3B_COULWAVE` produce the 2D textures that are copied into these layers. `Pass3_COULWAVE` then samples the grouped texture by layer.

## Render Textures

`txRenderVarsf16` is an `rgba16float` 2D-array texture that caches frequently sampled render data:

- Layer 0: free surface, max free surface, bottom, foam/tracer.
- Layer 1: u velocity, v velocity, unused, mean absolute vorticity.
- Layer 2: bottom, hard bottom, available scour depth, unused.

This cache reduces render-time pressure on full `rgba32float` simulation textures.

Other render textures:

- `txScreen`: current rendered screen for image/GIF export.
- `txDraw`: 2D canvas overlay for colorbar text and logos.
- `txOverlayMap`: optional map/imagery overlay.
- `txSamplePNGs`: texture array for turbulence, design-component, and arrow visual assets.
- `txCube_Skybox`: cube texture for the 3D skybox.

## Time Series Textures

`txTimeSeries_Locations` stores selected grid coordinates. `ExtractTimeSeries.wgsl` writes sampled values into `txTimeSeries_Data`, where element 0 is reserved for tooltip data and elements 1..N are time-series probes.

## Boundary Time-Series Forcing Textures

Boundary type `5` uses four optional `rgba32float` textures: `txBoundaryTimeSeriesSouth`, `txBoundaryTimeSeriesNorth`, `txBoundaryTimeSeriesWest`, and `txBoundaryTimeSeriesEast`.

Each active side texture stores station locations in row `0`, one time row per supplied time in rows `1..N`, and an appended final zero row used after the supplied series ends. Data rows store `[eta, hu, hv, 0]` per station. JavaScript uploads one shared time bracket to `BoundaryPass`; the shader handles interpolation along the boundary coordinate.

## Nested-Grid Boundary Output Textures

Nested-grid boundary output dynamically allocates four temporary `rgba32float` textures per active output rectangle when capture starts:

- South and north output textures have width equal to the rectangle x-edge station count and height equal to the capped number of output samples.
- West and east output textures have width equal to the rectangle y-edge station count and height equal to the capped number of output samples.
- Each pixel stores `[eta, hu, hv, 0]`.

`ExtractNestedBoundaryTimeSeries.wgsl` writes these textures only at requested output times. Multi-rectangle output reuses the same shader and texture layout once per active rectangle, with independent uniform buffers, sample indices, thresholds, prefixes, and deferred readbacks. JavaScript records the actual sampled time values separately, waits until no rectangles are still actively sampling, then reads each completed rectangle's textures once and writes text files compatible with boundary type `5`.
