# CELERIS Runtime Controls

This document defines how the LLM should use structured commands to control an already-running embedded CELERIS simulation.

The deterministic command catalog is stored in `registry/celeris_runtime_controls.json`. Treat that JSON registry as the source of truth for:

- command order, matching the HTML panel order
- valid namespaces and actions
- valid argument keys and values
- HTML control IDs
- `calc_constants` mappings
- safety and reload behavior
- example folder metadata used for split-layout detection

Runtime planning is hierarchical. The high-level chat orchestrator routes running-simulation requests to `plan_runtime_control`. The runtime sub-orchestrator then chooses one or more runtime panels and calls a panel-specific planner with only that panel's registry subset and schema. Keep command behavior in the registry and panel-specific LLM instructions; do not add script-side phrase lists for conversational interpretation.

The current command order follows the first HTML panel first, then later panels:

1. `examples.run_example` from `run_example-select`
2. `simulation.set_pause` from `simPause-select`
3. `visualization.set_plot_quantity` from `surfaceToPlot-select`
4. `visualization.set_colormap` from `colorMap_choice-select`
5. `visualization.set_color_axis_max` from `colorVal_max-input`
6. `visualization.set_color_axis_min` from `colorVal_min-input`
7. `visualization.set_transport_overlay` from `showBreaking-select`
8. `visualization.set_map_overlay` from `GoogleMapOverlay-select`
9. `visualization.set_vector_arrows` from `ShowArrows-select`
10. `visualization.set_arrow_scale` from `arrow_scale-input`
11. `visualization.set_arrow_density` from `arrow_density-input`
12. `visualization.set_logos` from `ShowLogos-select`
13. `visualization.set_view_mode` from `viewType-select`
14. `view.enter_fullscreen` from `fullscreen-button`
15. `design.set_surface_component` from `designcomponentToAdd-select`
16. `design.prepare_linear_structure` from `designcomponent_CrestElev-input`, `designcomponent_CrestWidth-input`, and `designcomponent_SideSlope-input`
17. `design.confirm_linear_start` from `designcomponent_CurrentEndPoint-select`
18. `design.confirm_linear_end_and_add` from `linearstructure-button`
19. `mods.prepare_click_edit` from `surfaceToChange-select`, `changeType-select`, `changeAmplitude-input`, and `changeRadius-input`
20. `mods.activate_click_edit` from `surfaceToChange-select`, `changeType-select`, `changeAmplitude-input`, and `changeRadius-input`
21. `boundary.set_boundary_type` from the four `*_boundary_type-select` controls
22. `boundary.set_incident_wave_type` from `incident_wave_type-select`
23. `boundary.set_incident_wave_parameters` from `incident_wave_H-input`, `incident_wave_T-input`, and `incident_wave_direction-input`
24. `sediment.set_d50_mm` from `sedC1_d50-input`
25. `sediment.set_porosity` from `sedC1_n-input`
26. `sediment.set_specific_gravity` from `sedC1_denrat-input`
27. `sediment.set_erosion_psi` from `sedC1_psi-input`
28. `sediment.set_critical_shields` from `sedC1_criticalshields-input`
29. `sediment.set_transport_model` from `useSedTransModel-select`
30. `timeseries.set_count` from `NumberOfTimeSeries-select`
31. `timeseries.set_duration` from `maxdurationTimeSeries-input`
32. `timeseries.select_location_index` from `changethisTimeSeries-select`
33. `timeseries.set_location_xy` from `changeXTimeSeries-input` and `changeYTimeSeries-input`
34. `timeseries.prepare_click_location` from the right-click Design-mode time-series placement workflow

## LLM Behavior

When the user asks to change visualization or controls of an already-running embedded simulation, return:

```json
{
  "type": "control_running_simulation",
  "workflow_sequence": ["celeris_runtime_control"],
  "runtime_commands": [
    {
      "namespace": "examples",
      "action": "run_example",
      "args": {
        "example": "morro_rock_ca_wind_waves",
        "pause_state": null,
        "plot_quantity": null,
        "colormap": null,
        "color_axis_max": null,
        "color_axis_min": null,
        "transport_overlay": null,
        "map_overlay": null,
        "vector_arrows": null,
        "arrow_scale": null,
        "arrow_density": null,
        "logos": null,
        "view_mode": null,
        "fullscreen_state": null,
        "component": null,
        "radius_m": null,
        "friction": null,
        "structure_label": null,
        "crest_elevation_m": null,
        "crest_width_m": null,
        "side_slope": null,
        "surface": null,
        "change_mode": null,
        "amount": null,
        "side": null,
        "boundary_type": null,
        "incident_wave_type": null,
        "height_m": null,
        "period_s": null,
        "direction_deg": null
      }
    }
  ]
}
```

Use only commands and values from `registry/celeris_runtime_controls.json`. Do not invent command names, enum values, HTML IDs, or raw `calc_constants` mutations.

If the user asks for initial/startup visualization settings while generating CELERIS input/config files and no embedded simulation is running yet, route that through CELERIS config generation instead. The same property names, such as `colorVal_min`, `colorVal_max`, `colorMap_choice`, `surfaceToPlot`, and `ShowArrows`, can be written into `config.json` as startup settings when they are explicitly requested.

## Selection Policy

For examples, choose the most likely built-in example from the registry based on the full user conversation. Prefer the more specific hazard or mode when the user says tsunami, hot start, tide, high-order, or basin experiment. Otherwise prefer the wind-wave option for named coastal places when one exists. If the user asks only to "run an example", "load an example", or equivalent without naming a place or mode, choose the first/default root CELERIS dropdown example: `ventura_harbor_ca_wind_waves`.

For pause/resume, map ordinary conversational requests such as "pause the sim", "stop advancing", "resume", "continue", or "unpause" to `simulation.set_pause`.

For colormaps, map conversational labels to the exact registry keys. For example, "bathy colors" maps to `bathy_topo`.

For visualization panel commands, use the semantic command matching the user's requested control. Numeric controls such as color-axis limits, arrow scale, and arrow density should be returned as numbers in the matching argument field.

For full-screen requests, use `view.enter_fullscreen` with `fullscreen_state="enter"`. The root runner applies this through the existing CELERIS fullscreen button path; it should not mutate `full_screen` directly. When the command is triggered from the CelerisAgent Full Screen button, the parent page first requests fullscreen on the embedded iframe so the browser user-activation and permissions-policy requirements are satisfied.

The CelerisAgent view buttons track only the active view mode: Design or Explorer. Full Screen is a command button and should never be highlighted as the active view. Clicking Full Screen should mark Explorer as the active view, and parent-observed fullscreen exit should mark Design as the active view.

For surface-cover design components, use `design.set_surface_component`. Only offer the first seven HTML components: Coral Reef, Mussel/Oyster Bed, Mangrove, Kelp Bed, Grass, Scrub, and Rubblemound Structure. Do not expose component values 8-10 through this surface-cover command. Radius and friction are optional; if the user gives either value, include it, otherwise leave it null and the response will report the registry default value. Do not ask the user to confirm or tune friction. After selecting the component, tell the user: "Left click (and hold) to add surface cover components (in Design Mode)."

For linear structures such as breakwaters, dunes, seawalls, levees, berms, and revetments, use `design.prepare_linear_structure` only after the user has specified crest elevation, crest width, and side slope. If any of those three values are missing or malformed, do not emit a runtime command. Answer conversationally with the usable values already supplied, and ask only for missing or malformed values. For example: "To add a structure, I need crest elevation, crest width, and side slope. I have current values of crest elevation (1 m) and crest width (2 m). Please provide side slope." If no required values are usable, answer: "To add a structure, I need crest elevation, crest width, and side slope - for example \"add a breakwater with crest elevation of 1m, crest width of 2 m, and side slope of 1/2\"." Once the parameters are specified, tell the user: "Right-click the structure start location in Design Mode. When the start point looks correct, tell me the start point is set."

Do not infer that a right-clicked start or end point is correct. The workflow advances only when the user explicitly says the start point or end point is set. In the web UI, the assistant response buttons for these confirmations are deterministic and bypass the LLM: the start confirmation sends `design.confirm_linear_start` and always replies: "Right-click the structure end location in Design Mode. When the end point looks correct, tell me the end point is set, and then I will add the structure." The end confirmation sends `design.confirm_linear_end_and_add`; this immediately queues the existing Add Linear Structure operation. The root CELERIS core resets only start/end point state after adding a structure and preserves crest elevation, crest width, and side slope so the user can add more structures with the same cross-section.

For modifications through the `mods-container`, let the LLM interpret the user's requested property and editing behavior. Use `mods.prepare_click_edit` only when an embedded simulation is already running and the user asks to modify, change, or edit bathy, topo, DEM, bottom friction, passive tracer/contaminant/pollution sources, ocean surface elevation, free surface, water level, or equivalent running-simulation surfaces. Do not add hard-coded phrase identifiers in scripts for this intent. When a simulation is running, a generic request such as "modify the DEM" or "change the DEM" should default to editing the current Bathymetry/Topography surface through `mods.prepare_click_edit`. When no simulation is running, generic DEM change requests should stay in the DEM workflow and ask for or use replacement DEM source details. Treat the request as replacing/retrieving a new DEM when the user clearly gives a different location, dataset, upload, or URL. The LLM should map the request to one of `bathy_topography`, `bottom_friction`, `passive_tracer_source`, or `water_surface_elevation`.

The LLM should also map the edit mode to `increase_decrease` or `set_value`. If the user does not specify the edit mode, amount/value, or lengthscale, leave those optional arguments null so the backend can display the current/default values. `mods.prepare_click_edit` never enables destructive canvas editing immediately; it stores the pending edit and asks the user to confirm the interpreted values. When the user explicitly confirms that the values are good or asks to activate/enable/start the prepared edit, use `mods.activate_click_edit`; omitted arguments will be filled from the pending edit state. Do not treat a repeated request such as "modify the DEM" or "change the DEM" as confirmation. After activation, tell the user that they may left click or click-hold in Design Mode to modify the selected surface.

For the boundary-container, use `boundary.set_boundary_type` for side-specific boundary changes. Valid sides are `west`, `east`, `south`, and `north`; valid boundary types are `solid_wall`, `sponge_layer`, `incident_waves`, and `periodic_boundary`. Emit one command per side. If the user asks for east-west periodic or north-south periodic behavior, emit both paired side commands.

Use `boundary.set_incident_wave_type` for requests such as "single sine wave", "TMA spectrum", "wave spectrum", "transient pulse", "solitary wave", or loaded-file wave source changes. Map "single sine wave" and "single harmonic" to `sine_wave`. Map "spectrum" to `tma_spectrum` unless the user explicitly refers to a custom loaded spectrum file.

Use `boundary.set_incident_wave_parameters` for running-simulation changes to wave height, period, and incident direction. Include only the values specified by the user so partial updates preserve the other current values. Use the boundary-container direction convention shown in the HTML: `0` means from west, `90` means from south, `180` means from east, and `270` or `-90` means from north; prefer `270` for natural-language "from north". This differs from CELERIS config generation only in context: runtime boundary-container requests should follow the boundary-container HTML control convention.

For the sediment-container, use `sediment.set_transport_model` to turn sediment transport on or off. Valid values are `on` / Include Sediment Transport and `off` / No Sediment Transport. Use the numeric sediment commands for Class 1 sediment parameters:

- `sediment.set_d50_mm` for D50 in millimeters
- `sediment.set_porosity` for porosity
- `sediment.set_specific_gravity` for specific gravity
- `sediment.set_erosion_psi` for the psi erosion parameter
- `sediment.set_critical_shields` for critical Shields number

If the user asks only to turn on sediment transport, emit only `sediment.set_transport_model` and leave all Class 1 parameter values unchanged. If the user gives multiple sediment settings in one prompt, emit one command per setting. Do not ask for confirmation for simple sediment parameter changes.

For the time-series container, use `timeseries.set_count` to choose the number of active gauges, `timeseries.set_duration` to set the plotted/saved duration, and `timeseries.select_location_index` to choose which gauge is being edited. The available time-series properties are active gauge count, plotted/saved duration in seconds (`maxdurationTimeSeries`), selected location index, and gauge x/y locations. If the user asks to add another/add one more time series without giving a number, increment the active count by one and prepare that new location index for right-click placement. If the user asks to close, hide, remove, clear, disable, or turn off the time-series plot/gauges/probes, emit `timeseries.set_count` with `time_series_count = 0`; this removes the time-series plot and must not close the embedded simulation runner. Use `timeseries.set_location_xy` only when the user gives explicit model-domain x/y coordinates in meters. For named or visual locations such as "at the pier", "offshore", "near the inlet", "here", or similar, use `timeseries.prepare_click_location` and tell the user: "Right-click the time series location in Design Mode." The root runner will switch to Design mode, open the time-series panel behavior, and right-click placement will update the selected gauge without activating linear-structure or surface-cover clicks.

The Agent page displays the time-series plot next to the embedded simulation when active. The root CELERIS runner remains the source of truth for gauge data; CelerisAgent only renders a compact live view from `window.CelerisAgentControls.getState()`.

## Runtime Boundary

The root CELERIS runner applies commands through `window.CelerisAgentControls`. CelerisAgent sends commands to the embedded iframe by `postMessage`.

The LLM-facing API is semantic. It should never expose arbitrary property writes such as:

```json
{ "property": "colorMap_choice", "value": 2 }
```

Instead, use:

```json
{
  "namespace": "visualization",
  "action": "set_colormap",
  "args": {
    "example": null,
    "pause_state": null,
    "plot_quantity": null,
    "colormap": "turbo",
    "color_axis_max": null,
    "color_axis_min": null,
    "transport_overlay": null,
    "map_overlay": null,
    "vector_arrows": null,
    "arrow_scale": null,
    "arrow_density": null,
    "logos": null,
    "view_mode": null,
    "fullscreen_state": null,
    "component": null,
    "radius_m": null,
    "friction": null,
    "structure_label": null,
    "crest_elevation_m": null,
    "crest_width_m": null,
    "side_slope": null,
    "surface": null,
    "change_mode": null,
    "amount": null,
    "side": null,
    "boundary_type": null,
    "incident_wave_type": null,
    "height_m": null,
    "period_s": null,
    "direction_deg": null
  }
}
```

## Keyboard Focus

When CelerisAgent displays the embedded simulation, the agent page owns focus by default so ordinary typing goes to the chat box. The Design button returns focus to chat, while Explorer and Full Screen focus the embedded simulation frame for WASD/arrow navigation. Pressing `Esc` in either page releases simulation keyboard focus and returns focus to the chat input.
