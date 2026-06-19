# `agent/server.py`

HTTP server for CelerisAgent and the colocated root CELERIS static app.

Responsibilities:

- Serve the CelerisAgent UI under `/CelerisAgent/`.
- Serve the root CELERIS core files from the repository root.
- Provide `/CelerisAgent/api/chat` for multipart chat requests and uploaded files. When Redis/RQ queue mode is available, the endpoint persists the request in the job workspace, enqueues a background worker job, and returns HTTP 202 with `status: queued`; otherwise it falls back to the synchronous local-development path.
- Provide authenticated job endpoints for state, progress, generated files, CELERIS case manifests, direct simulation close, and configuration archive downloads.
- Provide `/CelerisAgent/api/jobs/<job_id>/result` so the frontend can retrieve the final queued chat payload after a worker writes `work/result.json`.
- Provide lightweight testing auth, access-request, feedback, and admin endpoints.

When the server is behind nginx or another reverse proxy, CELERIS case manifests derive their absolute file URLs from `X-Forwarded-Proto` and `X-Forwarded-Host`/`Host`. The proxy must set these headers so HTTPS deployments emit HTTPS case file links instead of browser-blocked mixed-content HTTP links.

Generated job files are allowed from the resolved `JOBS` tree as well as the release root, so deployments may keep `CelerisAgent/workspace` as a symlink to a persistent data volume outside the code release.

The configuration archive endpoint is:

```text
GET /CelerisAgent/api/jobs/<job_id>/configuration-archive
```

It uses the same auth and job ownership checks as other job endpoints, builds the zip through `agent/thread_archive.py`, and returns it as a browser download.
