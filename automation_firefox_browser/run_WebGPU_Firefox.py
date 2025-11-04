import os
import json
import time
import glob

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.firefox.options import Options as FirefoxOptions
from selenium.webdriver.firefox.service import Service as GeckoService

# --------------------------------------------------------------------------------------
# Paths & run parameters
# --------------------------------------------------------------------------------------
current_dir = os.path.abspath(os.path.dirname(__file__))

# Simulation files
sim_directory = current_dir
config_file = "config.json"
bathy_file = "bathy.txt"
use_wave_file = 1
wave_file = "waves.txt"
use_friction_file = 0
friction_file = "friction.txt"
use_sat_image = 0
sat_image_file = "overlay.jpg"

# Output
output_folder = os.path.join(sim_directory, "output/")

# GeckoDriver path (put geckodriver on PATH or set an explicit path here)
# Windows example:
geckodriver_path = os.path.join(current_dir, "geckodriver.exe")
# macOS/Linux example:
# geckodriver_path = os.path.join(current_dir, "geckodriver")

# Headless toggle
run_headless = 0

# If Firefox on your platform doesn’t expose WebGPU by default, flip this on.
# If you already see an adapter without it, leave as False.
enable_webgpu_pref = False

# --------------------------------------------------------------------------------------
# Automation triggers for your simulation (added to config.json)
# --------------------------------------------------------------------------------------
trigger_animation = 1
trigger_animation_start_time = 100.0
AnimGif_dt = 0.25

trigger_writesurface = 1
trigger_writesurface_start_time = 120.0
trigger_writesurface_end_time = 122.0
dt_writesurface = 1.0
write_eta = 1
write_u = 0
write_v = 0
write_P = 0
write_Q = 0
write_turb = 0

trigger_writeWaveHeight = 1
trigger_resetMeans_time = 60.0
trigger_resetWaveHeight_time = 120.0
trigger_writeWaveHeight_time = 180.0  # sim end

# Increase render_step if headless (save GPU time)
render_step = 1 if run_headless == 0 else 100

# --------------------------------------------------------------------------------------
# Build absolute paths
# --------------------------------------------------------------------------------------
config_file_path = os.path.join(sim_directory, config_file)
bathy_file_path = os.path.join(sim_directory, bathy_file)
wave_file_path = os.path.join(sim_directory, wave_file)
friction_file_path = os.path.join(sim_directory, friction_file)
sat_image_file_path = os.path.join(sim_directory, sat_image_file)

# --------------------------------------------------------------------------------------
# Update config.json with automation parameters
# --------------------------------------------------------------------------------------
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
    "render_step": render_step
}

for k, v in new_params.items():
    config[k] = v

with open(config_file_path, "w") as f:
    json.dump(config, f, indent=4)

print("Updated config.json successfully.")

# --------------------------------------------------------------------------------------
# Ensure output folder exists
# --------------------------------------------------------------------------------------
os.makedirs(output_folder, exist_ok=True)

# Completion flag produced by the simulation
completed_file = os.path.join(output_folder, "completed.txt")

# --------------------------------------------------------------------------------------
# Set up Firefox (Gecko) with a dedicated profile that forces the download directory
# --------------------------------------------------------------------------------------
ff_options = FirefoxOptions()
if run_headless == 1:
    ff_options.add_argument("-headless")

profile = webdriver.FirefoxProfile()
abs_out = os.path.abspath(output_folder)

# Core download prefs
profile.set_preference("browser.download.dir", abs_out)
profile.set_preference("browser.download.folderList", 2)  # 2 = use custom dir
profile.set_preference("browser.download.useDownloadDir", True)
profile.set_preference("browser.download.manager.showWhenStarting", False)
profile.set_preference("browser.download.manager.closeWhenDone", True)
profile.set_preference("browser.download.alwaysOpenPanel", False)
profile.set_preference("pdfjs.disabled", True)

# Don’t ask where to save for these MIME types (add more if your app emits others)
profile.set_preference(
    "browser.helperApps.neverAsk.saveToDisk",
    ",".join([
        "text/plain",
        "text/csv",
        "application/json",
        "application/octet-stream",
        "application/zip",
        "application/x-zip-compressed",
        "image/png",
        "image/jpeg",
        "image/gif"
    ])
)
profile.set_preference(
    "browser.helperApps.neverAsk.openFile",
    "application/octet-stream,application/zip,application/x-zip-compressed"
)

# Optional WebGPU enable (only if needed on your platform/build)
if enable_webgpu_pref:
    profile.set_preference("dom.webgpu.enabled", True)
    # profile.set_preference("gfx.webgpu.force-enabled", True)  # usually not required

# Attach profile to options
ff_options.profile = profile

# Initialize Firefox driver
service = GeckoService(geckodriver_path) if os.path.exists(geckodriver_path) else GeckoService()
driver = webdriver.Firefox(service=service, options=ff_options)

# --------------------------------------------------------------------------------------
# Run the simulation workflow
# --------------------------------------------------------------------------------------
current_time = 0.0
previous_time = 0.0

try:
    # Load your WebGPU app
    driver.get("https://plynett.github.io/")
    time.sleep(5)  # wait for app to initialize

    # Upload required config
    driver.find_element(By.ID, "configFile").send_keys(config_file_path)

    # Upload bathymetry (required)
    driver.find_element(By.ID, "bathymetryFile").send_keys(bathy_file_path)

    # Optional inputs
    if use_wave_file == 1:
        driver.find_element(By.ID, "waveFile").send_keys(wave_file_path)

    if use_friction_file == 1:
        driver.find_element(By.ID, "frictionmapFile").send_keys(friction_file_path)

    if use_sat_image == 1:
        driver.find_element(By.ID, "satimageFile").send_keys(sat_image_file_path)

    # Start simulation
    driver.find_element(By.ID, "start-simulation-btn").click()

    # Poll for completion, print progress
    pause_time = 10  # seconds
    print("Waiting for the completed.txt file to appear...")

    while not os.path.exists(completed_file):
        pattern = os.path.join(output_folder, "current_time*.txt")
        file_list = glob.glob(pattern)

        if not file_list:
            print("Waiting for current_time file, or trigger_writeWaveHeight = 0.")
        else:
            newest_file = max(file_list, key=os.path.getmtime)
            with open(newest_file, 'r') as f:
                current_time_str = f.read().strip()

            current_time = float(current_time_str)
            realtime_ratio = (current_time - previous_time) / pause_time if pause_time > 0 else 0.0

            if realtime_ratio > 0:
                eta_finish_sec = (trigger_writeWaveHeight_time - current_time) / realtime_ratio
                eta_finish_min = eta_finish_sec / 60.0
            else:
                eta_finish_min = float("inf")

            print(f"Current simulation time {current_time:.2f} of {trigger_writeWaveHeight_time:.2f} seconds")
            if eta_finish_min != float("inf"):
                print(f"Realtime ratio: {realtime_ratio:.2f} | Estimated time to finish: {eta_finish_min:.1f} minutes")
            else:
                print(f"Realtime ratio: {realtime_ratio:.2f} | Estimated time to finish: calculating...")

            previous_time = current_time

            # Clean up progress files
            for file in file_list:
                try:
                    os.remove(file)
                except Exception:
                    pass

        time.sleep(pause_time)

    print("completed.txt found. Simulation has completed, closing all files in 30 seconds.")
    time.sleep(30)

finally:
    # Final cleanup of any stray progress files
    pattern = os.path.join(output_folder, "current_time*.txt")
    for file in glob.glob(pattern):
        try:
            os.remove(file)
        except Exception:
            pass

    driver.quit()
