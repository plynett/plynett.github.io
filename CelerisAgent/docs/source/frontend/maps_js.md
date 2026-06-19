# `js/maps.js`

Owns Regional Context and Local Context map rendering.

Responsibilities:

- Render OpenStreetMap tile grids.
- Draw the AOI/grid box and center marker.
- Manage the local AOI drag/resize editor and `Update Grid` action.
- Export `setLocalAoiUpdateHandler(handler)` for `main.js`.

Coordinate math belongs in `map_geometry.js`. Shared empty-panel rendering belongs in `ui.js`.
