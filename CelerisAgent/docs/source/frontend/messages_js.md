# `js/messages.js`

Owns chat message DOM elements and the long-running workflow progress message.

Current exports:

- `addMessage(role, text)`
- `setMessageActionHandler(handler)`: installs the callback used by assistant response action buttons.
- `addProgressMessage()`: returns `{ update(progress), remove() }`; `update()` renders the latest backend progress event, a compact workflow checklist, structured event data, and structured details for the latest recent events.
- `renderAttachmentBar(files)`

Assistant final messages are rendered with a small escaped Markdown subset so direct answers can use paragraphs, headings, bullets, numbered lists, bold text, inline code, and links. Long assistant paragraphs are split into sentence blocks for readability when the backend returns dense prose. User messages remain plain text.

Assistant messages that instruct the user to confirm a linear-structure start or end point append a compact action button. These buttons carry deterministic action kinds (`linear_structure_start_set` and `linear_structure_end_set`) so `main.js` can send the existing CELERIS runtime hooks directly without another LLM/planner call.

Assistant messages that ask the user to confirm prepared mods-container click-edit values append a `Use These Values` action button. The button submits `Use these values` through the normal chat/planner path so backend pending-state handling remains authoritative.

Do not put workflow-state rendering here; use `state_panels.js`.

The progress box should not rotate through generic frontend-only stages after backend events start arriving. Keep the latest backend event stable and only refresh elapsed time until a newer event arrives. The checklist is derived from backend events and orchestrator step metadata; avoid script-side guessing about user intent.
