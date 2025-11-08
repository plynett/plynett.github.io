#!/usr/bin/env python3
# Single-file runner that:
# 1) Updates config.json with automation triggers
# 2) Starts a local Flask server that mirrors your GitHub Pages app (catch-all proxy)
#    and injects a small upload shim into HTML so "downloads" POST to /upload
# 3) Launches Chrome via Selenium, uploads inputs, starts the sim
# 4) Polls output/ for current_time*.txt + completed.txt, prints ETA, cleans up

import os
import re
import json
import time
import glob
import threading
import tempfile
from pathlib import Path
from datetime import datetime

import requests
from flask import Flask, request, jsonify, make_response, Response
from werkzeug.utils import secure_filename

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.service import Service as ChromeService

# ======================================================================================
# ------------------------------- USER CONFIG / INPUTS --------------------------------
# ======================================================================================

current_dir = os.path.abspath(os.path.dirname(__file__))

# Set automation parameters for the simulation
sim_directory = current_dir  # Directory where the simulation files are located
config_file = "config.json" # Configuration file for the simulation
bathy_file = "bathy.txt"  # Bathymetry file for the simulation
use_wave_file = 1  # Flag to indicate whether to use a wave file (1 = yes, 0 = no)
wave_file = "waves.txt"  # Wave file for the simulation (optional)
use_friction_file = 0  # Flag to indicate whether to use a 2D friction map file (1 = yes, 0 = no)
friction_file = "friction.txt"  # Wave file for the simulation (optional)
use_sat_image = 0  # Flag to indicate whether to use a satellite image (1 = yes, 0 = no)
sat_image_file = "overlay.jpg"  # Satellite image file for the simulation (optional)
run_headless = 0  # Flag to indicate whether to run the browser in headless (no browser window) mode (1 = yes, 0 = no)

# Save trigger parameters for automatically saving data, these will be added to json
trigger_animation = 1  # automation trigger for animated gif when = 1
trigger_animation_start_time = 100.0  # start time of animation trigger
AnimGif_dt = 0.25  # time between animated gif frames, will write 80 frames

trigger_writesurface = 1  # automation trigger for writing 2D surfaces when = 1
trigger_writesurface_start_time = 120.0  # start time of surface write trigger
trigger_writesurface_end_time = 122.0  # end time of surface write trigger
dt_writesurface = 1.0  # increment to write to file
write_eta = 1  # flag for writing eta surface data to file, write when = 1
write_u = 0  # flag for writing x velocity surface data to file, write when = 1
write_v = 0  # flag for writing y velocity surface data to file, write when = 1
write_P = 0  # flag for writing x flux surface data to file, write when = 1
write_Q = 0  # flag for writing y flux surface data to file, write when = 1
write_turb = 0  # flag for writing eddy visc surface data to file, write when = 1

trigger_writeWaveHeight = 1  # automation trigger for writing mean/max/wave height surfaces when = 1
trigger_resetMeans_time = 60.0  # time to reset means
trigger_resetWaveHeight_time = 120.0  # time to reset wave height
trigger_writeWaveHeight_time = 180.0  # time to write wave height, this is also the end time for the simulation

# Output destination (Flask writes here)
output_folder = os.path.join(sim_directory, "output")

# ChromeDriver executable (adjust per OS)
chromedriver_path = os.path.join(current_dir, "chromedriver-win64", "chromedriver.exe")

# Remote app to mirror locally (must end with /)
REMOTE_BASE = "https://plynett.github.io/"

# Local Flask settings
FLASK_HOST = "127.0.0.1"
FLASK_PORT = 5001

# ======================================================================================
# ------------------------------- FLASK SERVER ----------------------------------------
# ======================================================================================

app = Flask(__name__)

OUTPUT_DIR = Path(output_folder).resolve()
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Quiet per-request logs (keep warnings/errors)
import logging
logging.getLogger("werkzeug").setLevel(logging.WARNING)

def _atomic_write(dst: Path, data: bytes) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=dst.parent, delete=False) as tmp:
        tmp.write(data)
        tmp.flush()
        os.fsync(tmp.fileno())
        tmp_path = Path(tmp.name)
    tmp_path.replace(dst)

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "time": datetime.utcnow().isoformat() + "Z"})

# ---- Upload target (browser "downloads" get POSTed here) ----
@app.route("/upload", methods=["POST", "OPTIONS"])
def upload():
    if request.method == "OPTIONS":
        resp = make_response("", 204)
        resp.headers["Access-Control-Allow-Origin"] = f"http://{FLASK_HOST}:{FLASK_PORT}"
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
        resp.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
        return resp

    subdir = secure_filename((request.args.get("subdir") or "").strip())
    subpath = OUTPUT_DIR / subdir
    saved = []

    if request.files:
        for key in request.files:
            f = request.files[key]
            filename = secure_filename(f.filename or f"upload_{int(time.time())}")
            dst = subpath / filename
            _atomic_write(dst, f.read())
            saved.append(str(dst))
    else:
        filename = secure_filename((request.args.get("filename") or f"blob_{int(time.time())}.bin").strip())
        body = request.get_data() or b""
        dst = subpath / filename
        _atomic_write(dst, body)
        saved.append(str(dst))

    resp = jsonify({"ok": True, "saved": saved})
    resp.headers["Access-Control-Allow-Origin"] = f"http://{FLASK_HOST}:{FLASK_PORT}"
    return resp

# ---- Inject upload shim into HTML pages only ----
def _inject_upload_shim_if_html(content: bytes, content_type: str) -> bytes:
    if not content_type or "text/html" not in content_type.lower():
        return content
    html = content.decode("utf-8", errors="ignore")
    shim = f"""
<script>
(() => {{
  const UPLOAD_URL = "http://{FLASK_HOST}:{FLASK_PORT}/upload";
  async function postBlob(blob, filename) {{
    const url = new URL(UPLOAD_URL);
    if (filename) url.searchParams.set("filename", filename);
    await fetch(url.toString(), {{
      method: "POST",
      mode: "cors",
      headers: {{ "Content-Type": "application/octet-stream" }},
      body: blob
    }});
  }}
  async function handleAnchor(a) {{
    try {{
      const href = a.getAttribute("href") || "";
      const fname = (a.getAttribute("download") || "download.bin");
      if (href.startsWith("blob:")) {{
        const res = await fetch(href);
        const blob = await res.blob();
        await postBlob(blob, fname);
        return true;
      }}
      return false;
    }} catch (e) {{ console.error(e); return false; }}
  }}
  const _origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function() {{
    if (this.hasAttribute("download")) {{ handleAnchor(this); return; }}
    return _origClick.call(this);
  }};
  document.addEventListener("click", (e) => {{
    const a = e.target.closest("a[download]");
    if (a) {{ e.preventDefault(); e.stopPropagation(); handleAnchor(a); }}
  }}, true);
  if (typeof window.saveAs === "function") {{
    const origSaveAs = window.saveAs;
    window.saveAs = function(blob, name) {{ postBlob(blob, name || "download.bin"); }};
  }}
}})();
</script>
"""
    if "</body>" in html:
        html = html.replace("</body>", shim + "</body>")
    else:
        html = html + shim
    return html.encode("utf-8")

# ---- Catch-all mirror: serve everything from REMOTE_BASE + subpath ----
@app.route("/", defaults={"subpath": ""})
@app.route("/<path:subpath>", methods=["GET"])
def mirror(subpath: str):
    # Avoid intercepting our own API endpoints
    if subpath.startswith("upload") or subpath.startswith("health"):
        return "Not found", 404

    # >>> BEGIN: path normalization (fixes /transect_version/... double prefix) <<<
    # If the page requests root-relative /transect_version/*, strip that prefix before forwarding.
    if subpath.startswith("transect_version/"):
        subpath = subpath[len("transect_version/"):]
    # >>> END: path normalization <<<

    url = REMOTE_BASE + subpath
    try:
        r = requests.get(url, stream=True, timeout=20)
    except Exception as e:
        return f"Upstream error: {e}", 502

    content_type = r.headers.get("Content-Type", "")
    status = r.status_code
    body = r.content
    body = _inject_upload_shim_if_html(body, content_type)

    headers = {}
    if content_type:
        headers["Content-Type"] = content_type
    return Response(body, status=status, headers=headers)

def start_flask():
    app.run(host=FLASK_HOST, port=FLASK_PORT, debug=False, use_reloader=False)

# ======================================================================================
# ------------------------------- PREP CONFIG / PATHS ---------------------------------
# ======================================================================================

config_file_path = os.path.join(sim_directory, config_file)
bathy_file_path = os.path.join(sim_directory, bathy_file)
wave_file_path = os.path.join(sim_directory, wave_file)
friction_file_path = os.path.join(sim_directory, friction_file)
sat_image_file_path = os.path.join(sim_directory, sat_image_file)

with open(config_file_path, "r") as f:
    config = json.load(f)

new_params = {
    "trigger_animation": trigger_animation,
    "trigger_animation_start_time": trigger_animation_start_time,
    "AnimGif_dt": AnimGif_dt,
    "trigger_writesurface": trigger_writesurface,
    "trigger_writesurface_start_time": trigger_writesurface_start_time,
    "trigger_writesurface_end_time": trigger_writesurface_end_time,
    "write_eta": write_eta,
    "write_u": write_u,
    "write_v": write_v,
    "write_P": write_P,
    "write_Q": write_Q,
    "write_turb": write_turb,
    "dt_writesurface": dt_writesurface,
    "trigger_writeWaveHeight": trigger_writeWaveHeight,
    "trigger_resetMeans_time": trigger_resetMeans_time,
    "trigger_resetWaveHeight_time": trigger_resetWaveHeight_time,
    "trigger_writeWaveHeight_time": trigger_writeWaveHeight_time,
    "render_step": 1 if run_headless == 0 else 10
}

for k, v in new_params.items():
    config[k] = v

with open(config_file_path, "w") as f:
    json.dump(config, f, indent=4)

print("Updated config.json successfully.")
os.makedirs(output_folder, exist_ok=True)

completed_file = os.path.join(output_folder, "completed.txt")

# ======================================================================================
# ------------------------------- START FLASK THREAD ----------------------------------
# ======================================================================================

flask_thread = threading.Thread(target=start_flask, daemon=True)
flask_thread.start()
time.sleep(0.5)

# ======================================================================================
# ------------------------------- SELENIUM (CHROME) -----------------------------------
# ======================================================================================

chrome_options = webdriver.ChromeOptions()
if run_headless == 1:
    chrome_options.add_argument("--headless=new")
    chrome_options.add_argument("--enable-gpu")
    chrome_options.add_argument("--disable-software-rasterizer")

service = ChromeService(chromedriver_path) if os.path.exists(chromedriver_path) else ChromeService()
driver = webdriver.Chrome(service=service, options=chrome_options)

# ======================================================================================
# ------------------------------- RUN WORKFLOW ----------------------------------------
# ======================================================================================

current_time_val = 0.0
previous_time_val = 0.0

try:
    # Load app from our local origin (mirrored GH Pages)
    driver.get(f"http://{FLASK_HOST}:{FLASK_PORT}/")
    time.sleep(5)

    # Upload inputs (same element IDs as your original page)
    driver.find_element(By.ID, "configFile").send_keys(config_file_path)
    driver.find_element(By.ID, "bathymetryFile").send_keys(bathy_file_path)

    if use_wave_file == 1:
        driver.find_element(By.ID, "waveFile").send_keys(wave_file_path)
    if use_friction_file == 1:
        driver.find_element(By.ID, "frictionmapFile").send_keys(friction_file_path)
    if use_sat_image == 1:
        driver.find_element(By.ID, "satimageFile").send_keys(sat_image_file_path)

    # Start simulation
    driver.find_element(By.ID, "start-simulation-btn").click()

    # Poll for completion and progress
    pause_time = 30
    print("Waiting for the completed.txt file to appear...")

    while not os.path.exists(completed_file):
        pattern = os.path.join(output_folder, "current_time*.txt")
        file_list = glob.glob(pattern)

        if not file_list:
            print("Waiting on current_time file, or trigger_writeWaveHeight = 0.")
        else:
            newest = max(file_list, key=os.path.getmtime)
            try:
                with open(newest, "r") as f:
                    s = f.read().strip()
                current_time_val = float(s)
            except Exception:
                current_time_val = previous_time_val

            realtime_ratio = (current_time_val - previous_time_val) / pause_time if pause_time > 0 else 0.0
            if realtime_ratio > 0:
                eta_finish_sec = (new_params["trigger_writeWaveHeight_time"] - current_time_val) / realtime_ratio
                eta_finish_min = eta_finish_sec / 60.0
            else:
                eta_finish_min = float("inf")

            print(f"Current simulation time {current_time_val:.2f} of {new_params['trigger_writeWaveHeight_time']:.2f} seconds")
            if eta_finish_min != float("inf"):
                print(f"Realtime ratio: {realtime_ratio:.2f} | Estimated time to finish: {eta_finish_min:.1f} minutes")
            else:
                print(f"Realtime ratio: {realtime_ratio:.2f} | Estimated time to finish: calculating...")

            previous_time_val = current_time_val

            for p in file_list:
                try:
                    os.remove(p)
                except Exception:
                    pass

        time.sleep(pause_time)

    print("completed.txt found. Simulation has completed, closing all files in 30 seconds.")
    time.sleep(30)

finally:
    for p in glob.glob(os.path.join(output_folder, "current_time*.txt")):
        try:
            os.remove(p)
        except Exception:
            pass
    try:
        driver.quit()
    except Exception:
        pass
