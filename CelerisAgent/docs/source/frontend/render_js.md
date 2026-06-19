# `js/render.js`

Thin render coordinator for the agent UI.

Responsibilities:

- Export the public render API used by `main.js`.
- Reset thread UI state.
- Enable or disable the Current Thread configuration-archive download link from the active job id.
- Fan backend state out to panel, map, simulation, confirmation, and preview renderers.
- Import message and simulation rendering with cache-busting version keys when `messages.js` or `simulation.js` changes.

Keep this file small. New panel-specific rendering should be added to a targeted module such as `state_panels.js`, `maps.js`, or `simulation.js`.
