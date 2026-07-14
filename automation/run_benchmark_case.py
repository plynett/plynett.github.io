#!/usr/bin/env python3
"""Run one Celeris benchmark case through the browser automation workflow."""

from __future__ import annotations

import argparse
import glob
import json
import mimetypes
import os
import re
import subprocess
import tempfile
import threading
import time
from datetime import datetime
from pathlib import Path

from flask import Flask, Response, jsonify, make_response, request
from selenium import webdriver
from selenium.webdriver.chrome.service import Service as ChromeService
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait
from werkzeug.utils import secure_filename


AUTOMATION_DIR = Path(__file__).resolve().parent
REPO_ROOT = AUTOMATION_DIR.parent
DEFAULT_CHROMEDRIVER = AUTOMATION_DIR / "chromedriver-win64" / "chromedriver.exe"


def parse_major_version(text: str) -> int | None:
    match = re.search(r"\b(\d+)\.", text)
    return int(match.group(1)) if match else None


def chromedriver_major_version(path: Path) -> int | None:
    try:
        result = subprocess.run(
            [str(path), "--version"],
            check=False,
            capture_output=True,
            text=True,
            timeout=10,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    return parse_major_version((result.stdout or "") + " " + (result.stderr or ""))


def installed_chrome_major_version() -> int | None:
    if os.name == "nt":
        try:
            import winreg
        except ImportError:
            winreg = None

        if winreg is not None:
            locations = [
                (winreg.HKEY_CURRENT_USER, r"SOFTWARE\Google\Chrome\BLBeacon"),
                (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Google\Chrome\BLBeacon"),
                (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Google\Chrome\BLBeacon"),
            ]
            for root, key_name in locations:
                try:
                    with winreg.OpenKey(root, key_name) as key:
                        version, _ = winreg.QueryValueEx(key, "version")
                except OSError:
                    continue
                major = parse_major_version(str(version))
                if major is not None:
                    return major

    candidates = [
        "google-chrome",
        "google-chrome-stable",
        "chromium",
        "chromium-browser",
        "chrome",
    ]
    for executable in candidates:
        try:
            result = subprocess.run(
                [executable, "--version"],
                check=False,
                capture_output=True,
                text=True,
                timeout=10,
            )
        except (OSError, subprocess.SubprocessError):
            continue
        major = parse_major_version((result.stdout or "") + " " + (result.stderr or ""))
        if major is not None:
            return major

    return None


def chrome_service_for(path: Path) -> ChromeService:
    if path.exists():
        driver_major = chromedriver_major_version(path)
        chrome_major = installed_chrome_major_version()
        if driver_major is None or chrome_major is None or driver_major == chrome_major:
            if driver_major is not None and chrome_major is not None:
                print(f"Using bundled ChromeDriver {driver_major} for Chrome {chrome_major}.")
            else:
                print("Using bundled ChromeDriver; unable to verify browser/driver major versions.")
            return ChromeService(str(path))

        print(
            f"Bundled ChromeDriver {driver_major} does not match Chrome {chrome_major}; "
            "falling back to Selenium Manager."
        )

    return ChromeService()


def atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as handle:
        handle.write(data)
        handle.flush()
        os.fsync(handle.fileno())
        tmp_path = Path(handle.name)
    tmp_path.replace(path)


def upload_destination(output_dir: Path, filename: str) -> Path:
    destination = output_dir / filename
    if filename.startswith("current_time"):
        return destination
    if not destination.exists():
        return destination

    stem = destination.stem
    suffix = destination.suffix
    for index in range(2, 10_000):
        candidate = output_dir / f"{stem}_{index}{suffix}"
        if not candidate.exists():
            return candidate
    raise RuntimeError(f"Could not choose a unique output name for {destination}")


def inject_upload_shim(content: bytes, content_type: str, upload_url: str) -> bytes:
    if "text/html" not in content_type.lower():
        return content
    html = content.decode("utf-8", errors="ignore")
    shim = f"""
<script>
(() => {{
  const UPLOAD_URL = "{upload_url}";
  async function postBlob(blob, filename) {{
    const url = new URL(UPLOAD_URL);
    if (filename) url.searchParams.set("filename", filename);
    await fetch(url.toString(), {{
      method: "POST",
      headers: {{ "Content-Type": "application/octet-stream" }},
      body: blob
    }});
  }}
  async function handleAnchor(a) {{
    try {{
      const href = a.getAttribute("href") || "";
      const fname = a.getAttribute("download") || "download.bin";
      if (href.startsWith("blob:")) {{
        const res = await fetch(href);
        const blob = await res.blob();
        await postBlob(blob, fname);
        return true;
      }}
      return false;
    }} catch (e) {{
      console.error(e);
      return false;
    }}
  }}
  const originalClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function() {{
    if (this.hasAttribute("download")) {{
      handleAnchor(this);
      return;
    }}
    return originalClick.call(this);
  }};
  document.addEventListener("click", (e) => {{
    const a = e.target.closest("a[download]");
    if (a) {{
      e.preventDefault();
      e.stopPropagation();
      handleAnchor(a);
    }}
  }}, true);
  if (typeof window.saveAs === "function") {{
    window.saveAs = function(blob, name) {{ postBlob(blob, name || "download.bin"); }};
  }}
}})();
</script>
"""
    if "</body>" in html:
        html = html.replace("</body>", shim + "</body>")
    else:
        html += shim
    return html.encode("utf-8")


def make_app(app_root: Path, output_dir: Path, host: str, port: int) -> Flask:
    app = Flask(__name__)
    app_root = app_root.resolve()
    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    upload_url = f"http://{host}:{port}/upload"

    @app.route("/health", methods=["GET"])
    def health():
        return jsonify({"status": "ok", "time": datetime.utcnow().isoformat() + "Z"})

    @app.route("/upload", methods=["POST", "OPTIONS"])
    def upload():
        if request.method == "OPTIONS":
            response = make_response("", 204)
            response.headers["Access-Control-Allow-Origin"] = f"http://{host}:{port}"
            response.headers["Access-Control-Allow-Headers"] = "Content-Type"
            response.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
            return response

        filename = secure_filename((request.args.get("filename") or f"download_{int(time.time())}.bin").strip())
        destination = upload_destination(output_dir, filename)
        atomic_write(destination, request.get_data() or b"")
        response = jsonify({"ok": True, "saved": str(destination)})
        response.headers["Access-Control-Allow-Origin"] = f"http://{host}:{port}"
        return response

    @app.route("/", defaults={"subpath": ""}, methods=["GET"])
    @app.route("/<path:subpath>", methods=["GET"])
    def serve_app(subpath: str):
        relative = Path("index.html") if not subpath else Path(subpath)
        target = (app_root / relative).resolve()
        try:
            target.relative_to(app_root)
        except ValueError:
            return "Not found", 404
        if target.is_dir():
            target = target / "index.html"
        if not target.exists() or not target.is_file():
            return "Not found", 404

        content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        content = target.read_bytes()
        content = inject_upload_shim(content, content_type, upload_url)
        return Response(content, headers={"Content-Type": content_type})

    return app


def remove_stale_markers(output_dir: Path) -> None:
    patterns = [
        "completed*.txt",
        "current_time*.txt",
        "dx*.txt",
        "dy*.txt",
        "nx*.txt",
        "ny*.txt",
        "time_*.txt",
        "time_series_data*.txt",
        "time_series_locations*.txt",
        "bathytopo.bin",
        "current_*.bin",
        "elev_*.bin",
        "xflux_*.bin",
        "yflux_*.bin",
        "*_time_series_bc_*.txt",
    ]
    for pattern in patterns:
        for path in output_dir.glob(pattern):
            try:
                path.unlink()
            except OSError:
                pass


def wait_for_completion(output_dir: Path, end_time: float, poll_interval: float, timeout_minutes: float) -> bool:
    completed_file = output_dir / "completed.txt"
    previous_time = 0.0
    deadline = time.time() + timeout_minutes * 60.0 if timeout_minutes > 0.0 else None

    print("Waiting for completed.txt...")
    while not completed_file.exists():
        if deadline is not None and time.time() > deadline:
            print(f"Timed out after {timeout_minutes:g} minutes without completed.txt.")
            return False

        current_files = list(output_dir.glob("current_time*.txt"))
        if not current_files:
            print("Waiting on current_time file, or trigger_writeWaveHeight = 0.")
        else:
            newest = max(current_files, key=lambda path: path.stat().st_mtime)
            try:
                current_time = float(newest.read_text(encoding="utf-8").strip())
            except (OSError, ValueError):
                current_time = previous_time

            realtime_ratio = (current_time - previous_time) / poll_interval if poll_interval > 0.0 else 0.0
            print(f"Current simulation time {current_time:.2f} of {end_time:.2f} seconds")
            if realtime_ratio > 0.0:
                eta_minutes = (end_time - current_time) / realtime_ratio / 60.0
                print(f"Realtime ratio: {realtime_ratio:.2f}; estimated time to finish: {eta_minutes:.1f} minutes")
            else:
                print("Realtime ratio: calculating")
            previous_time = current_time

            for path in current_files:
                try:
                    path.unlink()
                except OSError:
                    pass

        time.sleep(poll_interval)

    print("completed.txt found.")
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--case-dir", type=Path, required=True, help="Directory containing config.json, bathy.txt, and optional waves.txt.")
    parser.add_argument("--output-dir", type=Path, default=None, help="Directory where browser outputs should be written.")
    parser.add_argument("--app-root", type=Path, default=REPO_ROOT, help="Local Celeris app root to serve.")
    parser.add_argument("--chromedriver", type=Path, default=DEFAULT_CHROMEDRIVER)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=5001)
    parser.add_argument("--headless", action="store_true")
    parser.add_argument("--poll-interval", type=float, default=30.0)
    parser.add_argument("--timeout-minutes", type=float, default=0.0, help="0 means no timeout.")
    parser.add_argument("--startup-wait", type=float, default=5.0)
    parser.add_argument("--eta-initial-condition-file", type=Path, default=None)
    args = parser.parse_args()

    case_dir = args.case_dir.resolve()
    output_dir = (args.output_dir or case_dir / "output").resolve()
    config_path = case_dir / "config.json"
    bathy_path = case_dir / "bathy.txt"
    waves_path = case_dir / "waves.txt"
    eta_initial_condition_path = (args.eta_initial_condition_file or case_dir / "etaInitCond.txt").resolve()

    if not config_path.exists() or not bathy_path.exists():
        raise SystemExit(f"Missing config.json or bathy.txt in {case_dir}")

    config = json.loads(config_path.read_text(encoding="utf-8"))
    boundary_files = {
        "west": case_dir / str(config.get("ts_west_file", "")),
        "east": case_dir / str(config.get("ts_east_file", "")),
        "south": case_dir / str(config.get("ts_south_file", "")),
        "north": case_dir / str(config.get("ts_north_file", "")),
    }
    end_time = float(config.get("trigger_writeWaveHeight_time", config.get("maxdurationTimeSeries", 0.0)))
    remove_stale_markers(output_dir)

    app = make_app(args.app_root, output_dir, args.host, args.port)
    flask_thread = threading.Thread(
        target=lambda: app.run(host=args.host, port=args.port, debug=False, use_reloader=False),
        daemon=True,
    )
    flask_thread.start()
    time.sleep(0.5)

    chrome_options = webdriver.ChromeOptions()
    chrome_options.add_experimental_option("prefs", {
        "download.prompt_for_download": False,
        "download.directory_upgrade": True,
        "safebrowsing.enabled": True,
        "profile.default_content_setting_values.automatic_downloads": 1,
    })
    if args.headless:
        chrome_options.add_argument("--headless=new")
        chrome_options.add_argument("--enable-gpu")
        chrome_options.add_argument("--disable-software-rasterizer")

    service = chrome_service_for(args.chromedriver)
    driver = webdriver.Chrome(service=service, options=chrome_options)

    try:
        driver.get(f"http://{args.host}:{args.port}/")
        wait = WebDriverWait(driver, 60)
        wait.until(EC.presence_of_element_located((By.ID, "configFile")))
        time.sleep(args.startup_wait)

        driver.find_element(By.ID, "configFile").send_keys(str(config_path))
        driver.find_element(By.ID, "bathymetryFile").send_keys(str(bathy_path))
        if waves_path.exists():
            driver.find_element(By.ID, "waveFile").send_keys(str(waves_path))
        if eta_initial_condition_path.exists():
            driver.find_element(By.ID, "etaInitialConditionFile").send_keys(str(eta_initial_condition_path))
        for side, path in boundary_files.items():
            if path.name and path.exists():
                element_id = f"{side}BoundaryTimeSeriesFile"
                driver.find_element(By.ID, element_id).send_keys(str(path))

        driver.find_element(By.ID, "start-simulation-btn").click()
        completed = wait_for_completion(output_dir, end_time, args.poll_interval, args.timeout_minutes)
        time.sleep(5)
        return 0 if completed else 2
    finally:
        for path in output_dir.glob("current_time*.txt"):
            try:
                path.unlink()
            except OSError:
                pass
        driver.quit()


if __name__ == "__main__":
    raise SystemExit(main())
