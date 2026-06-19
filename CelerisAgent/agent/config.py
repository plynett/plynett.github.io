from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CORE_ROOT = ROOT.parent
WORKSPACE = ROOT / "workspace"
JOBS = WORKSPACE / "jobs"
CACHE = WORKSPACE / "cache"
LOGS = WORKSPACE / "logs"
REGISTRY = ROOT / "registry"
ENV_FILE = ROOT / ".env"
AGENT_PREFIX = "/CelerisAgent"
API_PREFIX = f"{AGENT_PREFIX}/api"


def ensure_dirs() -> None:
    for path in (WORKSPACE, JOBS, CACHE, LOGS):
        path.mkdir(parents=True, exist_ok=True)


def load_local_env() -> None:
    """Load KEY=VALUE pairs from an ignored local .env file if present."""
    if not ENV_FILE.exists():
        return
    import os

    for raw_line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip().lstrip("\ufeff")
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value
