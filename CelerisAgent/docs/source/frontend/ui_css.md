# `ui.css`

Styles the chat-first agent interface.

Responsibilities:

- App shell, sidebar, chat, right workspace panels.
- Current Thread archive download link.
- Embedded simulation split layouts.
- Embedded simulation view/pause/close controls and visualization toolbar layout around the canvas.
- Embedded simulation time-series plot panel, hidden until active and placed below/right of the canvas depending on split orientation. The plot window is fixed-size and the simulation split scrolls when needed so the chart is not stretched.
- Context maps, AOI edit handles, confirmation overlays, previews, and artifacts.
- Formatted assistant message content, including paragraphs, lists, inline code, links, and compact headings.
- Assistant message action buttons for workflow confirmations such as linear-structure start/end point acceptance.
- Compact working-message checklist rows for long-running workflow progress.
- Compact prompt-chip examples and the Browser Console sidebar panel.
- Lightweight testing access-gate, request-access, user feedback form, admin request-list, and admin feedback-list styles.

When adding controls, prefer stable dimensions and avoid layout changes that push the composer below the viewport.
