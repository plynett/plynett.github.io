# Root CELERIS `js/main.js`

This is the root CELERIS WebGPU application entry point used by both `index.html` and the Agent runner page `agent.html`.

Agent-runner interaction notes:

- `agent.html` displays `#webgpuCanvas` with `object-fit: contain` and `object-position: left top` so the simulation bitmap may be letterboxed inside the canvas element while leaving unused space on the bottom or right for future Agent panels.
- Pointer-to-domain coordinate math must use the visible rendered canvas content rectangle, not the raw element `getBoundingClientRect()` rectangle.
- The content-rectangle helper in `main.js` must respect CSS `object-position`; otherwise tooltip, time-series, and design-click mapping will be offset when the contained bitmap is not centered.
- Tooltip hover, design-mode bathy edits, time-series placement, and linear-structure endpoint selection should all share the same content-rect mapping.
- The Agent Full Screen control should always enter Explorer mode first. When the parent iframe exits fullscreen, `view.exit_fullscreen_cleanup` resets root CELERIS to Design mode and reruns the normal non-fullscreen canvas sizing path.
- Runtime design commands use the existing `design-container` state. Agent commands may set `whichPanelisOpen=2`, select the first seven surface-cover component IDs, set optional radius/friction values, set linear-structure cross-section values, switch the endpoint selector, and call the existing add-linear-structure queue.
- Agent-managed design interactions gate the shared design-panel click paths: surface-cover mode allows left-click painting and ignores right-click endpoint placement, while linear-structure mode allows right-click endpoint placement and ignores left-click component painting. Native/manual design-panel use keeps the original behavior when no Agent mode has been selected.
- `requestAddLinearStructure()` returns `{ok, message}` for Agent calls while preserving the old alert behavior for native button clicks. After a linear structure is applied, root CELERIS resets only the start/end endpoint state and preserves crest elevation, crest width, and side slope for repeated structures.
- Runtime mods commands use the existing `mods-container` and click shader state. Agent activation may set `whichPanelisOpen=3`, `surfaceToChange`, `changeType`, and optional `changeAmplitude`/`changeRadius`; the backend must confirm the values before sending the activation command.
- Runtime sediment commands use the existing `sediment-container` state through `js/agent_controls.js`; they set Class 1 sediment parameters and `useSedTransModel` through the same update helpers as the native controls.
- Runtime time-series commands use the existing `timeseries-container` state. Agent placement commands set `whichPanelisOpen=7`, select `changethisTimeSeries`, and use `agentDesignInteractionMode="timeseries"` so right-click gauge placement is active while surface-cover painting and linear-structure endpoints are suppressed. The Agent bridge exports the full active `timeSeriesData` window to the parent Chart.js plot so changes to `maxdurationTimeSeries` affect both the axis limit and displayed series span, matching the original root `timeseriesChart` behavior.
- Explorer mode navigation is implemented in root `js/main.js`: left-drag pans/strafes, right-drag rotates, Ctrl+left-drag also rotates for Mac trackpads, mouse wheel zooms, W/S or Up/Down move forward/back, and A/D or Left/Right move sideways. Touch uses one finger to rotate, two-finger horizontal drag to strafe, and pinch to change distance.

Do not move natural-language or Agent workflow logic into root CELERIS. Runtime control commands should continue to enter through `js/agent_controls.js`.
