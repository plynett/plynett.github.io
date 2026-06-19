# `index.html`

Root browser entry point for CelerisAgent.

Responsibilities:

- Define the chat-first three-pane layout.
- Provide static IDs used by `js/dom.js`.
- Provide the Current Thread download link for portable configuration archives.
- Provide the left-sidebar Browser Console panel used by `js/browser_console.js`.
- Provide the lightweight testing access gate, left-sidebar feedback form, admin request-list container, and admin feedback-list container.
- Provide the left-sidebar Try Saying prompt chips, including tutorial and Santa Cruz Harbor example-prompt starters.
- Load Chart.js from the same CDN used by root CELERIS so the embedded Agent time-series panel can render a Chart.js line chart matching the original `timeseriesChart` behavior.
- Load `ui.css` and the ES module frontend entry point from the `/CelerisAgent/` subpath.

Keep natural-language examples short and conversational. Do not add hidden workflow logic to HTML attributes.
