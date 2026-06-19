# Frontend Source Map

The browser UI is plain ES modules loaded by `index.html`. Keep modules split by responsibility:

- `main.js`: user-input event wiring and chat submission.
- `render.js`: state-render coordinator only.
- `messages.js`: chat bubbles, progress message, attachment label.
- `browser_console.js`: diagnostic Browser Console sidebar capture.
- `state_panels.js`: sidebar/right-pane state sections, including live Simulation Info when an embedded runner is active.
- `simulation.js`: embedded CELERIS runner panel and runtime command posting.
- `maps.js`: regional/local map DOM rendering and AOI edit interaction.
- `map_geometry.js`: pure coordinate, bbox, tile, and screen-pixel math.
- `confirm.js`: large-extraction confirmation modal.
- `api.js`, `dom.js`, `format.js`, `ui.js`: small shared utilities.

Do not put natural-language interpretation in frontend files. The frontend sends user text to the server and renders deterministic state returned by the workflow.
