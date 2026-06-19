# `js/simulation.js`

Owns the embedded local CELERIS runner panel.

Responsibilities:

- Create/remove the simulation iframe and split layout.
- Choose portrait or landscape split from runner metadata and case summary.
- Send structured runtime commands to the iframe.
- Manage Design/Explorer/Full Screen/Pause Sim/Resume Sim/Close buttons.
- Render direct visualization controls above the embedded canvas: plot surface, colormap, color-axis min, and color-axis max.
- Render a live time-series plot next to the embedded canvas when the runner reports active time-series data.
- Poll embedded runtime state about once per second while the iframe is loaded, so sidebar Simulation Info and toolbar values stay current.
- Manage keyboard focus handoff between chat and the embedded runner.

Full Screen is an enter-only command from the Agent controls. Before entering fullscreen, send `visualization.set_view_mode` with `explorer_3d`. When the parent document exits fullscreen, send `view.exit_fullscreen_cleanup`; the embedded runner is responsible for returning to Design mode and recalculating the canvas size for the split panel.

Do not add CELERIS solver logic here. Root CELERIS runtime controls are applied through `window.CelerisAgentControls` in the embedded page.

The split-panel visualization toolbar bypasses chat and the LLM. It sends the same semantic runtime commands directly to the iframe that the LLM would otherwise queue:

- `visualization.set_plot_quantity`
- `visualization.set_colormap`
- `visualization.set_color_axis_min`
- `visualization.set_color_axis_max`

Linear-structure confirmation buttons also bypass chat and the LLM by calling exported `postRuntimeCommands()` with:

- `design.confirm_linear_start`
- `design.confirm_linear_end_and_add`

The split-panel Pause Sim/Resume Sim button bypasses chat and the LLM. It sends `simulation.set_pause` with `pause` or `resume` directly to the iframe. The label is driven by active iframe state: `simPause === 1` shows `Resume Sim`; otherwise it shows `Pause Sim`.

When the iframe loads, every second while it is active, and after direct toolbar commands are posted, the toolbar requests active runtime state from `window.CelerisAgentControls.getState()` through `postMessage`. This populates the surface, colormap, color-axis fields, simulated time, and faster-than-realtime ratio with active values.

The embedded runner returns a `timeSeriesPlot` payload containing the full active root CELERIS `timeSeriesData` window. `simulation.js` renders this with Chart.js in a parent-page fixed-size canvas with `id="timeseriesChart"`, using the same line-chart structure as the original root CELERIS `timeseriesChart`: one dataset per location, `Time (s)` on the x axis, `Elevation (m)` on the y axis, no animation, and the x-axis maximum set from `maxdurationTimeSeries`. It appears below the embedded canvas for portrait split layouts and to the right of the embedded canvas for landscape split layouts. The surrounding simulation split is scrollable when the fixed plot and canvas do not fit. The parent page is only a renderer; root CELERIS remains the source of truth for gauge extraction and time-series data.

The module keeps the most recent iframe state response in `latestSimulationState` and clears it during `resetSimulation()`. Keep that cache declared at module scope so Close, New Thread, and backend stop responses can all reset the split without throwing.
