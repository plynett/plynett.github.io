import os
import time
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.service import Service


# Path to the file we are waiting for (modify as needed for your environment)
downloads_folder = r"C:\Users\patri\Downloads"
completed_file = os.path.join(downloads_folder, "completed.txt")

# Get the current directory (where the script and input files are located)
current_dir = os.path.abspath(os.path.dirname(__file__))

# Set the path to the chromedriver executable (assumed to be in the same directory)
chromedriver_path = os.path.join(current_dir, "chromedriver-win64/chromedriver.exe")

# Set up Chrome options
chrome_options = webdriver.ChromeOptions()
# Uncomment the next line if you wish to run headless (without a GUI)
chrome_options.add_argument("--headless=new")

# Initialize the Chrome driver
driver = webdriver.Chrome(service=Service(chromedriver_path), options=chrome_options)

try:
    # Open the simulation webpage
    driver.get("https://plynett.github.io/")
    time.sleep(5)  # Wait for the page to fully load

    # Define file paths relative to the script directory
    config_file_path = os.path.join(current_dir, "config.json")
    bathy_file_path = os.path.join(current_dir, "bathy.txt")
    # Optionally, define the path for the wave file if needed:
    wave_file_path = os.path.join(current_dir, "waves.txt")
    # Optionally, define the path for the satellite image if needed:
    sat_image_file_path = os.path.join(current_dir, "overlay.jpg")

    # Upload configuration JSON file (required)
    config_input = driver.find_element(By.ID, "configFile")
    config_input.send_keys(config_file_path)
    
    # Upload bathymetry file (required)
    bathy_input = driver.find_element(By.ID, "bathymetryFile")
    bathy_input.send_keys(bathy_file_path)
    
    # Optionally, upload a wave file (if needed)
    wave_input = driver.find_element(By.ID, "waveFile")
    wave_input.send_keys(wave_file_path)
    
    # Optionally, upload a satellite image (if needed)
    sat_image_input = driver.find_element(By.ID, "satimageFile")
    sat_image_input.send_keys(sat_image_file_path)
    
    # Click the "Start Simulation" button
    start_button = driver.find_element(By.ID, "start-simulation-btn")
    start_button.click()
    
    # Poll for the existence of "completed.txt" every 10 seconds.
    print("Waiting for the completed.txt file to appear...")
    while not os.path.exists(completed_file):
        print("File not found, waiting 10 seconds...")
        time.sleep(10)
    
    print("completed.txt found. Simulation has completed.")

finally:
    driver.quit()
