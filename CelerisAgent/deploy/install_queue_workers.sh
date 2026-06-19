#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/srv/celeris/current/CelerisAgent}"
VENV="${VENV:-/srv/celeris/.venv}"
UV_BIN="${UV_BIN:-/home/celeris/.local/bin/uv}"
ENV_FILE="${ENV_FILE:-/etc/celeris-agent.env}"
WORKERS="${WORKERS:-60}"

sudo apt-get update
sudo apt-get install -y redis-server
"${UV_BIN}" pip install --python "${VENV}/bin/python" -r "${APP_ROOT}/requirements.txt"

sudo systemctl enable --now redis-server
sudo install -m 0644 "${APP_ROOT}/deploy/systemd/celeris-agent.service" /etc/systemd/system/celeris-agent.service
sudo install -m 0644 "${APP_ROOT}/deploy/systemd/celeris-agent-worker@.service" /etc/systemd/system/celeris-agent-worker@.service

sudo ENV_FILE="${ENV_FILE}" python3 - <<'PY'
import os
from pathlib import Path

path = Path(os.environ["ENV_FILE"])
lines = path.read_text().splitlines() if path.exists() else []
updates = {
    "CELERIS_AGENT_QUEUE_MODE": "rq",
    "CELERIS_REDIS_URL": "redis://127.0.0.1:6379/0",
    "CELERIS_AGENT_QUEUE": "celeris-agent",
    "CELERIS_AGENT_JOB_TIMEOUT_SECONDS": "7200",
    "OPENBLAS_NUM_THREADS": "2",
    "OMP_NUM_THREADS": "2",
    "GDAL_NUM_THREADS": "2",
    "NUMEXPR_NUM_THREADS": "2",
}
seen = set()
out = []
for line in lines:
    if not line.strip() or line.lstrip().startswith("#") or "=" not in line:
        out.append(line)
        continue
    key = line.split("=", 1)[0]
    if key in updates:
        out.append(f"{key}={updates[key]}")
        seen.add(key)
    else:
        out.append(line)
for key, value in updates.items():
    if key not in seen:
        out.append(f"{key}={value}")
path.write_text("\n".join(out) + "\n")
PY

sudo systemctl daemon-reload
sudo systemctl restart celeris-agent.service
for i in $(seq 1 "${WORKERS}"); do
  sudo systemctl enable --now "celeris-agent-worker@${i}.service"
done

systemctl is-active celeris-agent.service redis-server
systemctl --no-pager --plain list-units 'celeris-agent-worker@*.service' --state=running
