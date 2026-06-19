# `js/dom.js`

Centralizes static DOM lookups for the agent page.

Keep this file as a flat binding table. Do not attach event listeners or perform rendering here.

When adding interactive elements used by frontend modules, assign stable IDs in `index.html` and bind them here. The Current Thread archive link is exposed as `downloadConfigLink`. The Simulation Info and Browser Console sidebar panels are exposed as `simulationInfoList` and `browserConsoleList`.

The testing access gate bindings include login, logout, request-access, user feedback, admin request-list, and admin feedback-list elements. Keep those as plain element references; auth behavior stays in `main.js`.
