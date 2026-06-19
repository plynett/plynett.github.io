from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def attachment_message(attachments: list[Path]) -> str:
    if not attachments:
        return ""
    return "Attached " + ", ".join(p.name for p in attachments)


def chat_message(role: str, text: str, attachments: list[str] | None = None) -> dict[str, Any]:
    return {"role": role, "text": text, "attachments": attachments or [], "created_at": now()}


def find_url(message: str) -> str | None:
    match = re.search(r"https?://\S+", message)
    return match.group(0).rstrip(".,)") if match else None


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def valid_job_id(job_id: str) -> bool:
    return bool(re.fullmatch(r"[A-Za-z0-9_-]+", job_id))
