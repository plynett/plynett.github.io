# `js/agent_controls.js`

[Source](../../../js/agent_controls.js)

## What This File Owns

`agent_controls.js` exposes a small semantic control API for CelerisAgent when the root CELERIS app is loaded in `agent.html` as an embedded simulation runner.

The API is installed from `main.js` after the normal UI update helpers are available. It exposes `window.CelerisAgentControls` and listens for `postMessage` events with `type="celeris-agent-command"`.

It also answers `type="celeris-agent-state-request"` messages by returning `window.CelerisAgentControls.getState()`. CelerisAgent uses this to populate direct split-panel visualization controls from active runtime values and to update the Agent sidebar Simulation Info panel with simulated time and faster-than-realtime ratio.

`calc_constants` is reassigned when examples or agent cases load new config data. The bridge must therefore read runtime state through the live `getCalcConstants()` getter supplied by `main.js`, not only the object reference captured when the bridge was installed. Otherwise `getState()` can return stale values after a new example/case is loaded.

When installed in the Agent runner, this module also forwards root CELERIS `console.log/info/warn/error`, script errors, and unhandled promise rejections to the parent CelerisAgent page as `celeris-agent-console` messages. The parent page renders those as a simple Simulation Console-style text stream.

## Command Contract

Commands use a namespace/action/args shape rather than raw mutation of `calc_constants`.

Example:

```js
{
  namespace: "visualization",
  action: "set_colormap",
  args: {
    colormap: "turbo"
  }
}
```

The LLM/backend command catalog is stored in `CelerisAgent/registry/celeris_runtime_controls.json`, ordered to match the HTML panels. This browser module contains the corresponding runtime execution handlers for currently implemented commands.

Implemented commands currently cover the first panel and the `viz-container` controls, in the same order as the HTML panels:

- `examples.run_example`, matching the HTML `run_example-select`
- `simulation.set_pause`, matching the HTML `simPause-select`
- `visualization.set_plot_quantity`, matching the HTML `surfaceToPlot-select`
- `visualization.set_colormap`, matching the HTML `colorMap_choice-select`
- `visualization.set_color_axis_max`, matching the HTML `colorVal_max-input`
- `visualization.set_color_axis_min`, matching the HTML `colorVal_min-input`
- `visualization.set_transport_overlay`, matching the HTML `showBreaking-select`
- `visualization.set_map_overlay`, matching the HTML `GoogleMapOverlay-select`
- `visualization.set_vector_arrows`, matching the HTML `ShowArrows-select`
- `visualization.set_arrow_scale`, matching the HTML `arrow_scale-input`
- `visualization.set_arrow_density`, matching the HTML `arrow_density-input`
- `visualization.set_logos`, matching the HTML `ShowLogos-select`
- `visualization.set_view_mode`, matching the HTML `viewType-select`
- `view.enter_fullscreen`, matching the HTML `fullscreen-button`
- `design.set_surface_component`, matching the HTML `designcomponentToAdd-select` plus optional radius/friction inputs
- `design.prepare_linear_structure`, matching the linear-structure crest elevation, crest width, and side slope inputs
- `design.confirm_linear_start`, matching the endpoint selector transition from start to end
- `design.confirm_linear_end_and_add`, matching the HTML `linearstructure-button`
- `mods.activate_click_edit`, matching the mods-container surface, change type, amount/value, and lengthscale controls after user confirmation
- `boundary.set_boundary_type`, matching the four boundary type dropdowns
- `boundary.set_incident_wave_type`, matching `incident_wave_type-select`
- `boundary.set_incident_wave_parameters`, matching incident wave height, period, and direction inputs
- `sediment.set_d50_mm`, matching `sedC1_d50-input`
- `sediment.set_porosity`, matching `sedC1_n-input`
- `sediment.set_specific_gravity`, matching `sedC1_denrat-input`
- `sediment.set_erosion_psi`, matching `sedC1_psi-input`
- `sediment.set_critical_shields`, matching `sedC1_criticalshields-input`
- `sediment.set_transport_model`, matching `useSedTransModel-select`
- `timeseries.set_count`, matching `NumberOfTimeSeries-select`
- `timeseries.set_duration`, matching `maxdurationTimeSeries-input`
- `timeseries.select_location_index`, matching `changethisTimeSeries-select`
- `timeseries.set_location_xy`, matching explicit `changeXTimeSeries-input` / `changeYTimeSeries-input` updates
- `timeseries.prepare_click_location`, matching the Design-mode right-click time-series placement workflow

## `visualization.set_colormap`

Matches the HTML `colorMap_choice-select` values:

- `ocean` -> `0` / Ocean
- `parula` -> `1` / Parula
- `turbo` -> `2` / Turbo
- `hsv` -> `3` / HSV
- `gray` -> `4` / Gray
- `pink` -> `5` / Pink
- `bathy_topo` -> `6` / Bathy/Topo

## `examples.run_example`

Runs a built-in example by setting `calc_constants.run_example` and calling the same `initializeWebGPUApp()` path used by the hidden `Run Example Simulation` button. Example keys are semantic strings such as `morro_rock_ca_wind_waves`, which map internally to the numeric dropdown values.

## `simulation.set_pause`

Pauses or resumes the running simulation through `calc_constants.simPause`:

- `pause` -> `1` / Pause
- `resume` -> `-1` / Resume

## `viz-container` Commands

The visualization panel commands map semantic registry keys to the existing `calc_constants` properties and then call the same UI synchronization helpers used by the native controls. Numeric commands accept finite numbers only. `visualization.set_map_overlay` also marks `calc_constants.OverlayUpdate = 1`, and `visualization.set_view_mode` uses the `main.js` view-mode callback so the canvas zoom listener is refreshed.

`view.enter_fullscreen` calls the existing `fullscreen-button` path only when `calc_constants.full_screen` is not already active. This preserves the root CELERIS fullscreen and pseudo-fullscreen behavior instead of duplicating it in the agent bridge.

## `design-container` Commands

The design commands expose the existing root CELERIS design-panel behavior to CelerisAgent without adding natural-language logic to root CELERIS.

`design.set_surface_component` supports only the first seven surface-cover components: Coral Reef, Mussel/Oyster Bed, Mangrove, Kelp Bed, Grass, Scrub, and Rubblemound Structure. It switches the runner to Design mode, marks the design panel active, sets `designcomponentToAdd`, and optionally updates `designcomponent_Radius` and the selected component friction property.

`design.prepare_linear_structure` sets `designcomponent_CrestElev`, `designcomponent_CrestWidth`, and `designcomponent_SideSlope`, switches to Design mode, marks the design panel active, and selects the start endpoint. `design.confirm_linear_start` switches the endpoint selector to end. `design.confirm_linear_end_and_add` calls the existing main.js linear-structure add callback. The root CELERIS add path resets start/end endpoint state after applying the structure while preserving the cross-section values for repeated structures.

The bridge also sets the root design interaction mode. Surface-component commands enable left-click painting and suppress design-panel right-click endpoint placement. Linear-structure commands enable right-click endpoint placement and suppress left-click component painting. This prevents hidden cross-activation while the shared `design-container` panel is controlled from chat.

## `mods-container` Commands

`mods.activate_click_edit` exposes the existing `MouseClickChange.wgsl` edit path for the four HTML `surfaceToChange-select` targets: Bathymetry/Topography, Bottom Friction, Passive Tracer Sources, and Ocean Surface Elevation. The command switches to Design mode, marks the mods panel active with `whichPanelisOpen=3`, sets the selected surface and change type, and updates `changeAmplitude`/`changeRadius` only when finite values are supplied. Omitted numeric values preserve the current root CELERIS values.

## `boundary-container` Commands

Boundary commands expose the existing runtime boundary UI without rebuilding wave textures directly in the bridge. They set `calc_constants` through the same `updateCalcConstants()` path as the native controls, which marks `html_update`; the main loop then refreshes the wave texture and boundary uniforms through the existing boundary update branch.

`boundary.set_boundary_type` sets one of `west_boundary_type`, `east_boundary_type`, `south_boundary_type`, or `north_boundary_type` to Solid Wall, Sponge Layer, Incident Waves, or Periodic Boundary. `boundary.set_incident_wave_type` sets `incident_wave_type`. `boundary.set_incident_wave_parameters` optionally updates `incident_wave_H`, `incident_wave_T`, and/or `incident_wave_direction`, preserving omitted values.

## `sediment-container` Commands

Sediment commands expose the existing Class 1 sediment transport controls. Numeric commands set finite values through `updateCalcConstants()` and preserve omitted values. `sediment.set_transport_model` maps semantic `on`/`off` values to the HTML `useSedTransModel-select` values.

## `timeseries-container` Commands

Time-series commands expose the existing root CELERIS gauge controls. Count commands update `NumberOfTimeSeries` and request a chart rebuild. Duration commands update only `maxdurationTimeSeries`, matching the native duration input path; they should not set `chartDataUpdate` or reset the active gauge extraction window. Location commands update `changethisTimeSeries` and `locationOfTimeSeries`. `timeseries.prepare_click_location` switches the runner to Design mode, marks the time-series panel active, and sets the Agent design interaction mode to `timeseries`, so right-click placement updates the selected gauge without activating linear-structure or surface-cover workflows.

`getState()` returns a compact `timeSeriesPlot` payload with recent time and eta values, plus `timeSeriesLocations`, so CelerisAgent can render a live plot next to the embedded simulation without implementing CELERIS solver logic in the parent page.

## Extension Notes

Add new runtime controls as semantic commands and route them through the existing internal UI/update functions wherever possible. Do not expose arbitrary `calc_constants` writes to the parent frame or LLM-facing agent.
