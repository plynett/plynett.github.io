from __future__ import annotations

from pathlib import Path
from typing import Any

from agent.chat import handle_chat
from agent.chat_utils import now
from agent.config import JOBS, ensure_dirs, load_local_env
from agent.io_utils import read_json, write_json
from agent.progress import finish_progress, record_progress


def run_chat_job(job_id: str) -> dict[str, Any]:
    load_local_env()
    ensure_dirs()
    job_dir = JOBS / job_id
    request_path = job_dir / "work" / "request.json"
    result_path = job_dir / "work" / "result.json"
    request = read_json(request_path)
    attachments = [_attachment_path(job_dir, rel) for rel in request.get("attachments", [])]

    try:
        record_progress(job_dir, "worker_started", "A background worker started this chat turn.", {})
        result = handle_chat(job_id, request.get("message", ""), attachments)
        write_json(result_path, result)
        return result
    except Exception as exc:
        error_result = {
            "job_id": job_id,
            "status": "failed",
            "error": str(exc),
            "messages": [
                {
                    "role": "assistant",
                    "text": f"I hit a worker error: {exc}. I have kept the job folder intact so the failure can be inspected.",
                    "attachments": [],
                    "created_at": now(),
                }
            ],
            "state": read_json(job_dir / "state.json"),
        }
        try:
            record_progress(job_dir, "worker_error", f"Worker error: {exc}", {"error": str(exc)})
            finish_progress(job_dir, "failed")
        finally:
            write_json(result_path, error_result)
        return error_result


def _attachment_path(job_dir: Path, rel: str) -> Path:
    path = job_dir / rel
    try:
        path.resolve().relative_to(job_dir.resolve())
    except ValueError as exc:
        raise ValueError(f"Invalid queued attachment path: {rel}") from exc
    return path
