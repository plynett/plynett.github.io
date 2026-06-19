from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from agent.chat_utils import now
from agent.io_utils import read_json, write_json


PROGRESS_FILE = "progress.json"


def reset_progress(job_dir: Path) -> None:
    write_json(
        job_dir / "logs" / PROGRESS_FILE,
        {
            "job_id": job_dir.name,
            "status": "running",
            "started_at": now(),
            "updated_at": now(),
            "events": [],
        },
    )


def record_progress(job_dir: Path, stage: str, detail: str, data: dict[str, Any] | None = None) -> None:
    path = job_dir / "logs" / PROGRESS_FILE
    payload = read_json(path, {"job_id": job_dir.name, "status": "running", "events": []})
    events = payload.setdefault("events", [])
    events.append(
        {
            "at": now(),
            "stage": stage,
            "detail": detail,
            "data": data or {},
        }
    )
    payload["job_id"] = job_dir.name
    payload["updated_at"] = now()
    write_json(path, payload)


def finish_progress(job_dir: Path, status: str = "completed") -> None:
    path = job_dir / "logs" / PROGRESS_FILE
    payload = read_json(path, {"job_id": job_dir.name, "events": []})
    payload["job_id"] = job_dir.name
    payload["status"] = status
    payload["updated_at"] = now()
    write_json(path, payload)


def read_progress(job_dir: Path) -> dict[str, Any]:
    try:
        return read_json(job_dir / "logs" / PROGRESS_FILE, {"job_id": job_dir.name, "status": "idle", "events": []})
    except json.JSONDecodeError:
        return {"job_id": job_dir.name, "status": "running", "events": []}
