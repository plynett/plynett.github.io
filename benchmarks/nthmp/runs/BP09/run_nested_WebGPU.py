import os
import json
import time
import glob
import shutil
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.service import Service


# =============================================================================
# User-changeable inputs
# =============================================================================

current_dir = os.path.abspath(os.path.dirname(__file__))

grid_names = [
    "gridA_okushiri",
    "gridB_south_okushiri",
    "gridC_aonae",
    "gridC_monai",
]

parent_grid = {
    "gridB_south_okushiri": "gridA_okushiri",
    "gridC_aonae": "gridB_south_okushiri",
    "gridC_monai": "gridB_south_okushiri",
}

config_file = "config.json"
bathy_file = "bathy.txt"
wave_file = "waves.txt"
initial_condition_file = "IC.txt"

app_url = "http://127.0.0.1:8080"
use_selenium_manager = 1
chromedriver_path = os.path.join(current_dir, "chromedriver.exe")
run_headless = 0
page_load_pause = 5
pause_time = 10
download_settle_time = 10
clear_previous_downloads = 1


# =============================================================================
# Automated logic below
# =============================================================================

boundary_sides = ["west", "east", "south", "north"]
boundary_file_input_ids = {
    "west": "westBoundaryTimeSeriesFile",
    "east": "eastBoundaryTimeSeriesFile",
    "south": "southBoundaryTimeSeriesFile",
    "north": "northBoundaryTimeSeriesFile",
}


def load_config(config_file_path):
    with open(config_file_path, "r") as f:
        return json.load(f)


def get_float(config, key, default=None):
    try:
        return float(config[key])
    except (KeyError, TypeError, ValueError):
        return default


def ensure_output_folder(output_folder):
    if not os.path.exists(output_folder):
        os.makedirs(output_folder)


def remove_matching_files(output_folder, patterns):
    for pattern in patterns:
        for file_path in glob.glob(os.path.join(output_folder, pattern)):
            try:
                os.remove(file_path)
            except FileNotFoundError:
                pass
            except OSError as error:
                print(f"Warning: could not remove {file_path}. Continuing. ({error})")


def clean_output_folder(output_folder, config):
    ensure_output_folder(output_folder)

    if clear_previous_downloads != 1:
        remove_matching_files(output_folder, ["completed*.txt", "current_time*.txt", "*.crdownload"])
        return

    patterns = [
        "completed*.txt",
        "current_time*.txt",
        "*.crdownload",
        "dx*.txt",
        "dy*.txt",
        "nx*.txt",
        "ny*.txt",
        "time_*.txt",
        "elev_*.bin",
        "xflux_*.bin",
        "yflux_*.bin",
        "current_*.bin",
        "bathytopo.bin",
        "time_series_data.txt",
        "time_series_locations.txt",
        "*_time_series_bc_*.txt",
        "animation*.gif",
    ]

    remove_matching_files(output_folder, patterns)


def setup_chrome_driver(output_folder):
    chrome_options = webdriver.ChromeOptions()
    prefs = {
        "download.default_directory": output_folder,
        "download.prompt_for_download": False,
        "download.directory_upgrade": True,
        "safebrowsing.enabled": True,
        "profile.default_content_setting_values.automatic_downloads": 1,
    }
    chrome_options.add_experimental_option("prefs", prefs)

    if run_headless == 1:
        chrome_options.add_argument("--headless=new")

    if use_selenium_manager == 1:
        return webdriver.Chrome(options=chrome_options)

    return webdriver.Chrome(service=Service(chromedriver_path), options=chrome_options)


def upload_required_file(driver, input_id, file_path, description):
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Required {description} file not found: {file_path}")

    driver.find_element(By.ID, input_id).send_keys(file_path)
    print(f"Loaded {description}: {file_path}")


def upload_optional_file(driver, input_id, file_path, description):
    if os.path.exists(file_path):
        driver.find_element(By.ID, input_id).send_keys(file_path)
        print(f"Loaded {description}: {file_path}")


def boundary_type_is_time_series(config, side):
    boundary_type = get_float(config, f"{side}_boundary_type", 0.0)
    return int(round(boundary_type)) == 5


def upload_boundary_time_series_files(driver, config, sim_directory):
    for side in boundary_sides:
        if not boundary_type_is_time_series(config, side):
            continue

        file_key = f"ts_{side}_file"
        if file_key not in config:
            raise KeyError(f"{side}_boundary_type is 5, but {file_key} is missing from config.json")

        boundary_file_path = os.path.join(sim_directory, config[file_key])
        upload_required_file(
            driver,
            boundary_file_input_ids[side],
            boundary_file_path,
            f"{side} boundary time series",
        )


def wait_for_downloads_to_finish(output_folder, timeout_seconds=300):
    start_time = time.time()

    while True:
        pending_downloads = glob.glob(os.path.join(output_folder, "*.crdownload"))
        if not pending_downloads:
            return

        if time.time() - start_time > timeout_seconds:
            raise TimeoutError(f"Timed out waiting for downloads to finish: {pending_downloads}")

        time.sleep(1)


def find_downloaded_file(output_folder, expected_filename):
    exact_path = os.path.join(output_folder, expected_filename)
    if os.path.exists(exact_path):
        return exact_path

    file_root, file_ext = os.path.splitext(expected_filename)
    matches = glob.glob(os.path.join(output_folder, f"{file_root}*{file_ext}"))
    if matches:
        return max(matches, key=os.path.getmtime)

    raise FileNotFoundError(f"Expected downloaded file not found: {exact_path}")


def copy_nested_boundary_files_from_parent(grid_name):
    if grid_name not in parent_grid:
        return

    parent_name = parent_grid[grid_name]
    parent_directory = os.path.join(current_dir, parent_name)
    parent_output_folder = os.path.join(parent_directory, "output")
    grid_directory = os.path.join(current_dir, grid_name)
    config = load_config(os.path.join(grid_directory, config_file))

    wait_for_downloads_to_finish(parent_output_folder)

    for side in boundary_sides:
        file_key = f"ts_{side}_file"
        if file_key not in config:
            continue

        filename = config[file_key]
        source_path = find_downloaded_file(parent_output_folder, filename)
        destination_path = os.path.join(grid_directory, filename)
        shutil.copy2(source_path, destination_path)
        print(f"Copied nested boundary file: {source_path} -> {destination_path}")


def get_sim_end_time(config):
    trigger_time = get_float(config, "trigger_writeWaveHeight_time")
    if trigger_time is not None and trigger_time > 0.0:
        return trigger_time

    sim_duration = get_float(config, "sim_duration")
    if sim_duration is not None and sim_duration > 0.0:
        return sim_duration

    return get_float(config, "nestedGridOutput_end_time", 0.0)


def print_progress(output_folder, current_time, previous_time, end_time):
    realtime_ratio = (current_time - previous_time) / pause_time

    if realtime_ratio > 0.0 and end_time > current_time:
        estimated_time_to_finish = (end_time - current_time) / realtime_ratio
        print(f"Current simulation time {current_time:.2f} of {end_time:.2f} seconds")
        print(f"Realtime ratio: {realtime_ratio:.1f} Estimated time to finish: {(estimated_time_to_finish / 60):.1f} minutes")
    else:
        print(f"Current simulation time {current_time:.2f} of {end_time:.2f} seconds")

    remove_matching_files(output_folder, ["current_time*.txt"])


def run_grid(grid_name):
    sim_directory = os.path.join(current_dir, grid_name)
    output_folder = os.path.join(sim_directory, "output")
    config_file_path = os.path.join(sim_directory, config_file)
    bathy_file_path = os.path.join(sim_directory, bathy_file)
    wave_file_path = os.path.join(sim_directory, wave_file)
    initial_condition_file_path = os.path.join(sim_directory, initial_condition_file)

    config = load_config(config_file_path)
    end_time = get_sim_end_time(config)
    clean_output_folder(output_folder, config)

    completed_file = os.path.join(output_folder, "completed.txt")
    driver = setup_chrome_driver(output_folder)

    current_time = 0.0
    previous_time = 0.0

    try:
        driver.get(app_url)
        time.sleep(page_load_pause)

        upload_required_file(driver, "configFile", config_file_path, "configuration")
        upload_required_file(driver, "bathymetryFile", bathy_file_path, "bathymetry")
        upload_optional_file(driver, "waveFile", wave_file_path, "wave file")

        if int(round(get_float(config, "loadetaIC", 0.0))) == 1:
            upload_required_file(driver, "etaInitialConditionFile", initial_condition_file_path, "initial condition")

        upload_boundary_time_series_files(driver, config, sim_directory)

        start_button = driver.find_element(By.ID, "start-simulation-btn")
        start_button.click()

        print(f"Waiting for {grid_name} completed.txt file to appear...")
        while not os.path.exists(completed_file):
            file_list = glob.glob(os.path.join(output_folder, "current_time*.txt"))

            if not file_list:
                print("Simulation not yet started, or trigger_writeWaveHeight = 0.")
            else:
                newest_file = max(file_list, key=os.path.getmtime)
                with open(newest_file, "r") as f:
                    current_time_str = f.read().strip()

                try:
                    current_time = float(current_time_str)
                    print_progress(output_folder, current_time, previous_time, end_time)
                    previous_time = current_time
                except ValueError:
                    print(f"Could not parse current time from {newest_file}: {current_time_str}")

            time.sleep(pause_time)

        print(f"{grid_name} completed.txt found. Waiting {download_settle_time} seconds for downloads to settle.")
        time.sleep(download_settle_time)
        wait_for_downloads_to_finish(output_folder)

    finally:
        remove_matching_files(output_folder, ["current_time*.txt"])
        driver.quit()

    return config


def main():
    for grid_index, grid_name in enumerate(grid_names):
        print("\n" + "=" * 80)
        print(f"Starting nested grid {grid_index + 1} of {len(grid_names)}: {grid_name}")
        print("=" * 80)

        copy_nested_boundary_files_from_parent(grid_name)
        run_grid(grid_name)

    print("\nAll nested grid simulations completed.")


if __name__ == "__main__":
    main()
