# Celeris LAN Host Setup

This document records the repeatable LAN deployment used for the Celeris core and CelerisAgent host at `192.168.1.239`.

The local repository and the LAN host must stay synchronized. The local repo is the source of truth for application files. The live LAN deployment is:

```text
Host: celeris
Address: 192.168.1.239
OS: Ubuntu 26.04 LTS
User: celeris
Live source: /srv/celeris/current
Persistent Agent data: /srv/celeris-data/agent-workspace
Public URLs:
  https://192.168.1.239/
  https://192.168.1.239/CelerisAgent/
```

Do not commit or document secrets. The SSH password and `OPENAI_API_KEY` are administrator-provided runtime secrets.

## Current Hardware And Disk Layout

The installed host is a Dell PowerEdge R815 with 64 CPU cores and about 247 GiB RAM.

The final disk layout uses the small root filesystem for the OS and mounts the large logical volume at `/srv`:

```text
/dev/mapper/ubuntu--vg-ubuntu--lv  ext4  /     about 98G
/dev/mapper/ubuntu--vg-srv--lv     ext4  /srv  about 5.4T
```

The persistent `/srv` mount is:

```text
UUID=c9038f7b-95ab-4743-885a-4496f7285be4 /srv ext4 defaults 0 2
```

`/srv/celeris/current` points to the active source release. `CelerisAgent/workspace` is a symlink to `/srv/celeris-data/agent-workspace` so generated jobs survive code release swaps.

## Base Packages

Install the system packages needed by nginx, Python, GDAL/raster tooling, Redis, and source sync:

```bash
sudo apt-get update
sudo apt-get install -y \
  nginx curl ca-certificates git rsync unzip zip tar \
  python3 python3-venv python3-dev build-essential pkg-config \
  gdal-bin libgdal-dev libproj-dev proj-data proj-bin \
  libgeos-dev libspatialindex-dev libnetcdf-dev libhdf5-dev \
  libtiff-dev libjpeg-dev libpng-dev openssl acl redis-server
```

Install `uv` for the `celeris` user:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
source ~/.bashrc
```

Create the application directories and Python environment:

```bash
sudo mkdir -p /srv/celeris/releases /srv/celeris-data/agent-workspace
sudo chown -R celeris:celeris /srv/celeris /srv/celeris-data
cd /srv/celeris
/home/celeris/.local/bin/uv venv .venv --python 3.12
```

Install Python dependencies after the source is deployed:

```bash
/home/celeris/.local/bin/uv pip install --python /srv/celeris/.venv/bin/python \
  -r /srv/celeris/current/CelerisAgent/requirements.txt
```

`CelerisAgent/requirements.txt` must include `okada-wrapper`. That package is required for single-rectangle earthquake initial conditions and for finite-fault initial conditions when USGS `surface_deformation.disp` is unavailable. The application must fail rather than generate a synthetic Okada-like fallback if this package is missing.

## Full Source Deployment

The full package should be deployed. Do not omit Celeris core files, CelerisAgent files, examples, data, images, shaders, docs, or deployment templates.

From the local repository root, create and transfer a full archive:

```powershell
$release = "YYYYMMDD-HHMM-full"
tar -cf "$env:TEMP\celeris-release.tar" -C "C:\Users\plynett\Documents\GitHub\plynett.github.io" .
pscp -batch -hostkey "SHA256:ts0xlG9DT3l7qYtyGWxPMqmBeMe1XC+p0NLsqvmns5I" `
  "$env:TEMP\celeris-release.tar" celeris@192.168.1.239:/tmp/celeris-release.tar
```

On the LAN host:

```bash
release="YYYYMMDD-HHMM-full"
mkdir -p "/srv/celeris/releases/$release"
tar -xf /tmp/celeris-release.tar -C "/srv/celeris/releases/$release"
ln -sfn "/srv/celeris/releases/$release" /srv/celeris/current
rm -rf /srv/celeris/current/CelerisAgent/workspace
ln -s /srv/celeris-data/agent-workspace /srv/celeris/current/CelerisAgent/workspace
```

For smaller code-only updates, copy the changed files to the same paths under `/srv/celeris/current`, then verify hashes:

```bash
sha256sum /srv/celeris/current/path/to/file
```

The local and remote checksums must match before considering the deployment synchronized.

## Runtime Environment

The protected runtime env file is `/etc/celeris-agent.env`. It is not stored in git. Current non-secret values are:

```text
CELERIS_AUTH_MODE=disabled
CELERIS_AGENT_BASE_URL=https://192.168.1.239/CelerisAgent
CELERIS_RUNNER_BASE_URL=https://192.168.1.239/agent.html
OPENAI_API_KEY=<administrator-provided secret>
CELERIS_AGENT_QUEUE_MODE=rq
CELERIS_REDIS_URL=redis://127.0.0.1:6379/0
CELERIS_AGENT_QUEUE=celeris-agent
CELERIS_AGENT_JOB_TIMEOUT_SECONDS=7200
OPENBLAS_NUM_THREADS=2
OMP_NUM_THREADS=2
GDAL_NUM_THREADS=2
NUMEXPR_NUM_THREADS=2
```

Recommended ownership:

```bash
sudo chown root:celeris /etc/celeris-agent.env
sudo chmod 0640 /etc/celeris-agent.env
```

## nginx Configuration

nginx terminates HTTPS, serves the static Celeris core directly, serves the static CelerisAgent UI files, and reverse-proxies `/CelerisAgent/api/` to the Python API on `127.0.0.1:8765`.

TLS is currently local/LAN certificate based:

```text
Certificate directory: /etc/nginx/celeris-certs
Certificate: /etc/nginx/celeris-certs/celeris.pem
Key: /etc/nginx/celeris-certs/celeris.key
Local CA published at: /srv/celeris/current/_local_ca/celeris-local-ca.pem
```

The active nginx site is `/etc/nginx/sites-available/celeris`, symlinked into `/etc/nginx/sites-enabled/celeris`:

```nginx
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl default_server;
    listen [::]:443 ssl default_server;
    server_name _ celeris celeris.local celeris.usc.edu 192.168.1.239;

    root /srv/celeris/current;
    index index.html index.htm;

    ssl_certificate /etc/nginx/celeris-certs/celeris.pem;
    ssl_certificate_key /etc/nginx/celeris-certs/celeris.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;

    client_max_body_size 2g;

    location ~ (^|/)\. {
        deny all;
    }

    location ~* \.pyc?$ {
        deny all;
    }

    location ^~ /CelerisAgent/workspace/ {
        deny all;
    }

    location ^~ /CelerisAgent/agent/ {
        deny all;
    }

    location ^~ /CelerisAgent/scripts/ {
        deny all;
    }

    location ^~ /CelerisAgent/testbed/ {
        deny all;
    }

    location ^~ /CelerisAgent/registry/ {
        deny all;
    }

    location /CelerisAgent/api/ {
        proxy_pass http://127.0.0.1:8765;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_request_buffering off;
    }

    location / {
        try_files $uri $uri/ =404;
    }
}
```

Enable and reload:

```bash
sudo ln -sfn /etc/nginx/sites-available/celeris /etc/nginx/sites-enabled/celeris
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx
```

## Python API Service

The API service is one lightweight Python process. It receives HTTP requests, persists job requests, and enqueues background work into Redis/RQ.

`/etc/systemd/system/celeris-agent.service`:

```ini
[Unit]
Description=CelerisAgent API service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=celeris
Group=celeris
WorkingDirectory=/srv/celeris/current/CelerisAgent
EnvironmentFile=/etc/celeris-agent.env
Environment=PYTHONUNBUFFERED=1
ExecStart=/srv/celeris/.venv/bin/python /srv/celeris/current/CelerisAgent/app.py --host 127.0.0.1 --port 8765
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

Enable:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now celeris-agent.service
```

## Redis/RQ Worker Pool

Redis runs locally on `127.0.0.1:6379`. The final production pool uses 60 RQ worker processes.

`/etc/systemd/system/celeris-agent-worker@.service`:

```ini
[Unit]
Description=CelerisAgent background worker %i
After=network-online.target redis-server.service
Wants=network-online.target
Requires=redis-server.service

[Service]
Type=simple
User=celeris
Group=celeris
WorkingDirectory=/srv/celeris/current/CelerisAgent
EnvironmentFile=/etc/celeris-agent.env
Environment=PYTHONUNBUFFERED=1
Environment=CELERIS_AGENT_QUEUE_MODE=rq
Environment=OPENBLAS_NUM_THREADS=2
Environment=OMP_NUM_THREADS=2
Environment=GDAL_NUM_THREADS=2
Environment=NUMEXPR_NUM_THREADS=2
ExecStart=/srv/celeris/.venv/bin/rq worker celeris-agent --url redis://127.0.0.1:6379/0
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable 60 workers:

```bash
sudo systemctl daemon-reload
for i in $(seq 1 60); do
  sudo systemctl enable --now "celeris-agent-worker@$i.service"
done
```

The repeatable installer in the repo performs the Redis/RQ setup and worker enablement:

```bash
cd /srv/celeris/current/CelerisAgent
WORKERS=60 bash deploy/install_queue_workers.sh
```

## Queue Architecture

The final CelerisAgent architecture is:

```text
browser -> nginx :443 -> static Celeris core files
                   -> static CelerisAgent UI files
                   -> /CelerisAgent/api/ reverse proxy -> Python API :8765
                                                        -> Redis/RQ queue
                                                        -> 60 worker processes
```

Important behavior:

- `/CelerisAgent/api/chat` accepts uploaded files and prompts, writes `work/request.json`, enqueues an RQ job, and returns HTTP `202` with `status: queued`.
- Workers run `agent.worker.run_chat_job()`, which calls the existing `handle_chat()` workflow.
- Completed results are written to `work/result.json`.
- The frontend polls `/CelerisAgent/api/jobs/<job_id>/progress` and `/CelerisAgent/api/jobs/<job_id>/result`.
- The Celeris core simulation still runs in each browser through WebGPU; server workers generate DEM/config/case artifacts, not simulation timesteps.

## Verification Commands

Check services:

```bash
systemctl is-active nginx celeris-agent redis-server
systemctl --no-pager --plain list-units 'celeris-agent-worker@*.service' --state=running --no-legend | wc -l
find /etc/systemd/system/multi-user.target.wants -maxdepth 1 -name 'celeris-agent-worker@*.service' | wc -l
```

Expected:

```text
active
active
active
60
60
```

Check RQ:

```bash
cd /srv/celeris/current/CelerisAgent
/srv/celeris/.venv/bin/rq info --url redis://127.0.0.1:6379/0
```

Expected summary includes:

```text
60 workers, 1 queues
```

Check core and API:

```bash
curl -ksS -o /dev/null -w '%{http_code}\n' https://127.0.0.1/
curl -ksS -o /dev/null -w '%{http_code}\n' https://127.0.0.1/CelerisAgent/
curl -ksS -o /dev/null -w '%{http_code}\n' https://127.0.0.1/CelerisAgent/api/state
```

Expected:

```text
200
200
200
```

Run a queue smoke test:

```bash
job="job_queue_smoke_$(date +%s)"
base="https://127.0.0.1/CelerisAgent/api"
curl -ksS -F "job_id=$job" \
  -F "message=Give me an example set of prompts to generate a wave simulation for Santa Cruz Harbor, CA" \
  "$base/chat"

for i in $(seq 1 30); do
  code=$(curl -ksS -o /tmp/result.json -w '%{http_code}' "$base/jobs/$job/result")
  [ "$code" = "200" ] && break
  sleep 1
done
cat /tmp/result.json
```

Expected:

- Initial chat response is HTTP `202` with `status: queued`.
- Result endpoint eventually returns HTTP `200`.
- Final state has `workflow_state` equal to `answered_question` for this deterministic smoke prompt.

## 30-job Load Test Used For Worker Validation

The 60-worker configuration was validated by submitting 30 concurrent jobs with this prompt:

```text
Create a DEM around the June 2026, Mw 7.8 earthquake in the Philippines. Center on the earthquake location, and make the domain 4 degrees on a side. Use the etopo database. use the simple source, a grid size of 300 m, and create the config.
```

Final observed result:

```text
job_dirs: 30
completed: 30
config: 30
bathy_txt: 30
waves_txt: 30
bathy_mat: 30
eta: 30
overlay: 30
warnings: 30
errors: 0
```

The warnings were validation warnings, not job failures; all required Celeris case files were generated.

## Sync Rule For Future Changes

After any change that affects the LAN deployment:

1. Change the local repo first.
2. Copy the same changed files to `/srv/celeris/current` on `192.168.1.239`.
3. Restart affected services:

```bash
sudo systemctl restart celeris-agent.service
for i in $(seq 1 60); do sudo systemctl restart "celeris-agent-worker@$i.service"; done
sudo systemctl reload nginx
```

Only restart the service type that is affected. Static-only changes do not require Python worker restarts; Python code or requirements changes do.

4. Verify local and remote hashes:

```powershell
Get-FileHash path\to\file -Algorithm SHA256
plink -batch -hostkey "SHA256:ts0xlG9DT3l7qYtyGWxPMqmBeMe1XC+p0NLsqvmns5I" celeris@192.168.1.239 `
  "sha256sum /srv/celeris/current/path/to/file"
```

5. Run the relevant smoke checks before considering the local repo and LAN host synchronized.
