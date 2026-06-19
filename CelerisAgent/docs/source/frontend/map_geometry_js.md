# `js/map_geometry.js`

Pure geometry and map-tile math for context maps.

Responsibilities:

- Extract AOI geometry from workflow state.
- Convert bbox/domain data to meters, Web Mercator world pixels, and screen pixels.
- Compute edited bboxes during drag/resize operations.
- Produce map metadata text.

This file should not read or mutate the DOM. Keep it testable with plain data inputs and outputs.
