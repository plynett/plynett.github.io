# Queue-backed Agent workers

Production deployments can run the CelerisAgent API as a lightweight request service and move chat workflow execution into Redis/RQ workers.

The repeatable install path is:

```bash
cd /srv/celeris/current/CelerisAgent
WORKERS=60 bash deploy/install_queue_workers.sh
```

The script performs the manual steps below.

Install Redis and Python queue dependencies:

```bash
sudo apt install redis-server
/srv/celeris/.venv/bin/uv pip install -r /srv/celeris/current/CelerisAgent/requirements.txt
sudo systemctl enable --now redis-server
```

Enable queue mode in `/etc/celeris-agent.env`:

```text
CELERIS_AGENT_QUEUE_MODE=rq
CELERIS_REDIS_URL=redis://127.0.0.1:6379/0
CELERIS_AGENT_QUEUE=celeris-agent
CELERIS_AGENT_JOB_TIMEOUT_SECONDS=7200
OPENBLAS_NUM_THREADS=2
OMP_NUM_THREADS=2
GDAL_NUM_THREADS=2
NUMEXPR_NUM_THREADS=2
```

Install the systemd units from `CelerisAgent/deploy/systemd/`:

```bash
sudo cp /srv/celeris/current/CelerisAgent/deploy/systemd/celeris-agent.service /etc/systemd/system/celeris-agent.service
sudo cp /srv/celeris/current/CelerisAgent/deploy/systemd/celeris-agent-worker@.service /etc/systemd/system/celeris-agent-worker@.service
sudo systemctl daemon-reload
sudo systemctl restart celeris-agent.service
for i in $(seq 1 60); do sudo systemctl enable --now celeris-agent-worker@$i.service; done
```

Scale workers while measuring queue wait time, CPU, memory, disk I/O, and external API pressure. On the 64-core host, the production configuration allows 60 worker processes and keeps `*_NUM_THREADS=2`.
