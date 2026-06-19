# `js/main.js`

Frontend entry module for the chat page.

Responsibilities:

- Wire attachment, prompt chip, new-thread, submit, Enter-to-send, voice, AOI edit, large-extraction approval, and simulation-close handlers.
- Wire the lightweight testing access gate: auth status, login, logout, request-access submission, user feedback submission, admin pending-request polling, admin unread-feedback polling, and admin approval buttons.
- Install the Browser Console sidebar capture module on startup.
- Wire assistant response action buttons either to `submitChat()` or to deterministic frontend runtime hooks when no LLM interpretation is needed.
- Prevent overlapping chat submissions while a previous backend response is still in flight.
- Call `postChat()`.
- If `postChat()` returns `status: queued`, wait on `getJobResult()` while the existing progress poller keeps the working message current.
- Generate a job ID before the first send so progress can be polled while the first request is still running.
- Poll job progress during in-flight requests and pass it to the working message.
- Pass returned state to `renderState()`.

The simulation Close button does not submit chat text. It calls the direct `/CelerisAgent/api/jobs/<job_id>/close-simulation` endpoint, then renders the returned state. Typed requests such as `stop the sim` still go through normal chat because those are conversational commands.

When the backend reports that auth is required and the browser has no valid session, `main.js` blocks chat submission and shows the access gate. Admin users get a sidebar request count and unread feedback count, can load pending access requests or all feedback without leaving the page, and can approve a request to create a user. Approval opens a local `mailto:` draft addressed to the submitted email and leaves an "Open email draft" link in the request row if the mail client handoff is blocked. Opening the feedback list marks comments as seen but does not remove them.

Linear-structure confirmation buttons bypass chat and call the existing embedded CELERIS runtime hooks directly. `Click When Start Point Is Set` sends `design.confirm_linear_start` and then deterministically instructs the user to right-click the end point. `Click When End Point Is Set` sends `design.confirm_linear_end_and_add` and reports that the structure was added. The LLM still owns the conversational setup step that gathers crest elevation, crest width, and side slope.

Do not add panel rendering or simulation iframe control logic here; those belong to `render.js` and `simulation.js`.
