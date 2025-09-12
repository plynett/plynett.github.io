import os
import json
import time
import glob
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.service import Service

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
output_folder = os.path.join(sim_directory, "output/") # Path to directory where the simulation will save its output files
chromedriver_path = os.path.join(current_dir, "chromedriver-win64/chromedriver.exe")  # Path to the chromedriver executable is located
run_headless = 1  # Flag to indicate whether to run the browser in headless (no browser window) mode (1 = yes, 0 = no)

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
# Note: The simulation will never close if trigger_writeWaveHeight~=1
# End Inputs - should not need to edit below this

render_step = 1  # render step for the simulation, default is 1
if run_headless == 1:
    render_step = 100  # since we dont care about the rendering in headless mode, set it to large value to max GPU

# Define file paths relative to the script directory
config_file_path = os.path.join(sim_directory, config_file)
bathy_file_path = os.path.join(sim_directory, bathy_file)
wave_file_path = os.path.join(sim_directory, wave_file)
friction_file_path = os.path.join(sim_directory, friction_file)
sat_image_file_path = os.path.join(sim_directory, sat_image_file)

# Load and add parameters to config.json
# Read the existing configuration
with open(config_file_path, "r") as f:
    config = json.load(f)

# Define the additional control parameters you want to ensure exist
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

# Add new parameters only if they are not already present in the config
for key, value in new_params.items():
    config[key] = value

# Write the updated configuration back to the file
with open(config_file_path, "w") as f:
    json.dump(config, f, indent=4)

print("Updated config.json successfully.")

# Check if the output folder exists, if not create it
if not os.path.exists(output_folder):
    os.makedirs(output_folder)

# File to check for simulation completion (name harded coded in the simulation)
completed_file = os.path.join(output_folder, "completed.txt")

# Set up Chrome options
chrome_options = webdriver.ChromeOptions()
prefs = {
    "download.default_directory": output_folder,  # Set your desired downloads folder
    "download.prompt_for_download": False,                       # Disable download prompt
    "download.directory_upgrade": True,
    "safebrowsing.enabled": True,
    "profile.default_content_setting_values.automatic_downloads": 1  # Allow multiple downloads
}
chrome_options.add_experimental_option("prefs", prefs)
# Uncomment the next line if you wish to run headless (without a GUI)
if run_headless == 1:
    chrome_options.add_argument("--headless=new")

# Initialize the Chrome driver
driver = webdriver.Chrome(service=Service(chromedriver_path), options=chrome_options)

# initialize some variables
current_time = 0.0  # Initialize current time to 0.0
previous_time = 0.0  # Initialize previous time to 0.0
try:
    # Open the simulation webpage
    driver.get("https://plynett.github.io/")
    time.sleep(5)  # Wait for the page to fully load

    # Upload configuration JSON file (required)
    config_input = driver.find_element(By.ID, "configFile")
    config_input.send_keys(config_file_path)
    
    # Upload bathymetry file (required)
    bathy_input = driver.find_element(By.ID, "bathymetryFile")
    bathy_input.send_keys(bathy_file_path)
    
    # Optionally, upload a wave file (if needed)
    if use_wave_file == 1:
        wave_input = driver.find_element(By.ID, "waveFile")
        wave_input.send_keys(wave_file_path)

    # Optionally, upload a 2D friction file (if needed)
    if use_friction_file == 1:
        friction_input = driver.find_element(By.ID, "frictionmapFile")
        friction_input.send_keys(friction_file_path)
    
    # Optionally, upload a satellite image (if needed)
    if use_sat_image == 1:
        sat_image_input = driver.find_element(By.ID, "satimageFile")
        sat_image_input.send_keys(sat_image_file_path)
    
    # Click the "Start Simulation" button
    start_button = driver.find_element(By.ID, "start-simulation-btn")
    start_button.click()
    
    # Poll for the existence of "completed.txt" every 10 seconds.
    pause_time = 10  # seconds
    print("Waiting for the completed.txt file to appear...")
    while not os.path.exists(completed_file):
        # 1) Find all files with name current_timeXXX.txt in the output_folder
        pattern = os.path.join(output_folder, "current_time*.txt")
        file_list = glob.glob(pattern)

        if not file_list:
            print("Simulation not yet started, or trigger_writeWaveHeight = 0.")
        else:
            # 2) Load only the newest file (based on modification time) and print its contents
            newest_file = max(file_list, key=os.path.getmtime)
            with open(newest_file, 'r') as f:
                current_time_str = f.read().strip()  # Read the current time value as a string

            # Convert the string to a float
            current_time = float(current_time_str)

            # Calculate the real-time ratio and estimate the finish time
            realtime_ratio = (current_time - previous_time) / pause_time  
            estimated_time_to_finish = (trigger_writeWaveHeight_time - current_time) / realtime_ratio  

            print(f"Current simulation time {current_time:.2f} of {trigger_writeWaveHeight_time:.2f} seconds")
            print(f"Realtime ratio: {realtime_ratio:.1f} Estimated time to finish: {(estimated_time_to_finish/60):.1f} minutes")

            # Update previous_time to the current time
            previous_time = current_time

            # 3) Delete all the found files
            for file in file_list:
                os.remove(file)

        time.sleep(pause_time)
    
    print("completed.txt found. Simulation has completed, closing all files in 30 seconds.")
    time.sleep(30)
finally:
    # delete current_timeXXX.txt files
    pattern = os.path.join(output_folder, "current_time*.txt")
    file_list = glob.glob(pattern) 
    for file in file_list:
        os.remove(file)

    driver.quit()
