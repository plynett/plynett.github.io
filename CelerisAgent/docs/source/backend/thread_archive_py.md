# `agent/thread_archive.py`

Owns deterministic export and restore of portable CelerisAgent configuration archives.

Responsibilities:

- Build `celeris_agent_<job_id>_configuration.zip` for the current job.
- Include generated configuration artifacts under `outputs/`, JSON provenance metadata under `work/`, a portable `state.json`, transcript exports, `THREAD_SUMMARY.md`, and `archive_manifest.json`.
- Exclude raw attachments, raw downloads, and logs by default. Record excluded files in the archive manifest when present.
- Validate uploaded archives before restore: reject path traversal, absolute paths, unsupported members, too many files, excessive uncompressed size, and manifest hash mismatches.
- Restore archives into the current job folder, not the original job id.
- Regenerate artifact URLs for the new job id.
- Clear stale embedded-runner state (`celeris_run` and `runtime_control`) during restore.

This module must stay deterministic. Do not involve the LLM when creating or restoring archives.
