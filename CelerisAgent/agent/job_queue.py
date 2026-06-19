from __future__ import annotations

import os
from typing import Any


class QueueUnavailable(RuntimeError):
    pass


def queue_mode() -> str:
    return os.environ.get("CELERIS_AGENT_QUEUE_MODE", "auto").strip().lower() or "auto"


def enqueue_chat_job(job_id: str) -> dict[str, Any] | None:
    mode = queue_mode()
    if mode in {"sync", "inline", "disabled", "off"}:
        return None

    try:
        from redis import Redis
        from rq import Queue
    except ImportError as exc:
        if mode in {"rq", "redis", "required"}:
            raise QueueUnavailable("Redis/RQ queue mode is required, but redis or rq is not installed.") from exc
        return None

    redis_url = os.environ.get("CELERIS_REDIS_URL", "redis://127.0.0.1:6379/0")
    queue_name = os.environ.get("CELERIS_AGENT_QUEUE", "celeris-agent")
    timeout = int(os.environ.get("CELERIS_AGENT_JOB_TIMEOUT_SECONDS", "7200"))
    try:
        connection = Redis.from_url(redis_url)
        connection.ping()
        queue = Queue(queue_name, connection=connection, default_timeout=timeout)
        from agent.worker import run_chat_job

        job = queue.enqueue(run_chat_job, job_id, job_timeout=timeout)
    except Exception as exc:
        if mode in {"rq", "redis", "required"}:
            raise QueueUnavailable(f"Redis/RQ queue is unavailable: {exc}") from exc
        return None

    return {
        "backend": "rq",
        "queue": queue_name,
        "queue_job_id": job.id,
        "timeout_seconds": timeout,
    }
