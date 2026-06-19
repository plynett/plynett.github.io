# `agent/progress.py`

Owns per-job progress events for long-running chat turns.

Responsibilities:

- Reset progress at the start of each `/CelerisAgent/api/chat` request.
- Append stage/detail events as the orchestrator, specialist planners, and deterministic workflow nodes run.
- Include useful structured details such as model, response id, selected routes, specialist action JSON, workflow hooks, source paths, summaries, and timing.
- Mark progress as completed or failed after the request finishes.
- Read progress for `/CelerisAgent/api/jobs/<job_id>/progress`.

Progress events are for user visibility and debugging. Do not store API keys, raw prompts containing sensitive data, full unbounded model responses, or large payloads here. Store compact structured planner outputs and truncate long strings/lists.
