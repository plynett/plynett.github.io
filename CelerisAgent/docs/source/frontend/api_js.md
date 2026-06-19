# `js/api.js`

Owns browser HTTP calls to the CelerisAgent backend.

Current exports:

- `ApiError`: transport error type carrying HTTP status and parsed error payload when available.
- `postChat({ jobId, message, files })`: posts multipart chat data to `/CelerisAgent/api/chat` and returns parsed JSON. In queued deployments this can be an HTTP 202 payload with `status: queued`.
- `getJobProgress(jobId)`: polls `/CelerisAgent/api/jobs/<job_id>/progress` while a chat request is still running.
- `getJobResult(jobId)`: polls `/CelerisAgent/api/jobs/<job_id>/result`; HTTP 202 is represented as `{ pending: true, ... }` until the worker writes the final chat result.
- `closeSimulation(jobId)`: posts to `/CelerisAgent/api/jobs/<job_id>/close-simulation` to clear the embedded runner state without invoking the chat planner.
- `getAuthStatus()`, `login(email, password)`, `logout()`: lightweight testing access-gate calls.
- `requestAccess({ name, email, comment, website })`: submits a human-reviewed access request.
- `getAccessRequests()`, `getPendingAccessCount()`, and `approveAccessRequest(requestId)`: admin-only request queue and approval calls.
- `submitFeedback(text)`: submits signed-in user comments to the backend feedback log.
- `getAdminFeedback()` and `getUnreadFeedbackCount()`: admin-only feedback list and unread badge calls.

Keep this file limited to transport concerns. Do not add rendering, state mutation, or workflow interpretation here.
