# `agent/openai_client.py`

Owns OpenAI Responses API transport and planner model selection.

Model policy:

- `OPENAI_ORCHESTRATOR_MODEL` defaults to `gpt-5.4`.
- `OPENAI_SPECIALIST_MODEL` defaults to `gpt-5.4`.
- `OPENAI_GEOGRAPHIC_MODEL` defaults to `gpt-5.4`.
- `OPENAI_ESCALATION_MODEL` defaults to `gpt-5.4`.
- Unknown roles fall back to `OPENAI_MODEL`, then `gpt-5.4`.

Planner quality is currently preferred over planner latency. Do not change these defaults to mini/nano variants unless the user explicitly asks for a speed-first experiment.
