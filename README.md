# Celeris-WebGPU

**Real-Time Coastal Wave Simulation in the Browser using WebGPU**

## Overview

Celeris-WebGPU is an open-source web application for simulating and visualizing coastal wave dynamics in real time. It implements the extended Boussinesq equations on the GPU using the WebGPU API. This allows interactive simulation of waves (such as wind waves, tsunamis, and harbor oscillations) directly in a modern web browser. The project extends the original Celeris wave simulation engine (developed by Sasan Tavakkol under the guidance of Patrick Lynett) into the browser environment, leveraging GPU acceleration for high-performance, real-time computation of shallow-water wave phenomena with no additional software installation required beyond a compatible browser.

Celeris-WebGPU is designed for researchers, engineers, and enthusiasts in coastal engineering and wave modeling. Users can load custom bathymetry (seafloor topography) and wave condition files to simulate specific scenarios of interest, or choose from several built-in example scenarios based on real-world locations. The application provides interactive controls to modify simulation parameters, pause/resume the simulation, and adjust visualization settings on the fly, enabling exploratory analysis and educational demonstrations.

This project is maintained by Patrick Lynett (University of Southern California) and is released under the MIT License. Development has been supported by the U.S. Army Corps of Engineers (ERDC), the Office of Naval Research (ONR), and the National Science Foundation (NSF). Contributions from the community are welcome – see the **Contributing** section below for more information.

## Features

- **Interactive Wave Simulation:** Simulate coastal wave propagation using Nonlinear Shallow Water (NLSW) or Boussinesq equations in real time. GPU acceleration via WebGPU enables detailed simulations of wave dynamics (including wave breaking, run-up, and coastal inundation) at interactive frame rates.  
- **Custom Scenarios:** Load custom input files for your own simulations. Provide a configuration JSON (simulation parameters and domain settings), a bathymetry/topography data file (grid of elevations), and optional files such as wave forcing conditions, spatial friction maps, or overlay images.  
- **Pre-Configured Examples:** Quickly run one of many included example scenarios via a drop-down menu. Examples include locations like Ventura Harbor (CA) for wind waves, Santa Cruz Harbor (CA) for tsunami scenarios, and more.  
- **Real-Time Visualization:** Choose what field to visualize (water surface elevation, flow velocity, vorticity, wave height statistics, etc.) with a dynamic color map. The interface also offers an **Explorer 3D view** for perspective navigation.  
- **User Controls:** Start, pause, and resume the simulation at any time. Adjust model parameters on-the-fly (e.g., solver settings like the Courant number or toggling breaking models). Reset the simulation to clear memory and load new scenarios.  
- **Output and Data Export:**  
  - Download a snapshot of the current view as a JPEG image.  
  - Record a short animated GIF (up to ~100 frames).  
  - Export raw binary data of a single 2D field or time-series stacks (up to 256 time steps) for external analysis (e.g., MATLAB).  
- **Extensibility:** Upload custom 3D model JSON files to include structures or landmarks in the 3D view.  
- **Modern Web Technology:** Runs entirely client-side in the browser using JavaScript and WGSL shaders via the WebGPU API—no plugins or installations required.

## Getting Started

### Using Celeris-WebGPU Online

The simplest way to try Celeris-WebGPU is through the GitHub Pages deployment of this repository:

**[Launch Celeris-WebGPU](https://plynett.github.io/)**

1. Ensure you’re using a WebGPU-compatible browser (Chrome 113+, Edge, or any Chromium with WebGPU enabled).  
2. Select an example scenario from the **Load Pre-configured Examples** menu and click **Run Example Simulation**, or load your own files under **Start Here: Load Simulation Datafiles**:  
   - **Configuration JSON** (required)  
   - **Bathymetry Data** (required)  
   - **Wave Forcing Data** (optional)  
   - **Friction Map** (optional)  
   - **Overlay Image** (optional)  
   - **3D Model JSON** (optional)  
3. Click **Start Simulation**.  

While running, you can:  
- Zoom/pan the 2D view or switch to 3D Explorer.  
- Pause/Resume the simulation.  
- Change visualization variables on the fly.  
- Tweak numerical parameters (flux limiter, Courant number).  
- Export snapshots, GIFs, JPEG stacks, or raw binary data.  
- Click **Clear Memory / Reset Simulator** to load new scenarios.

### Running Locally (Development or Offline Use)

```bash
git clone https://github.com/plynett/plynett.github.io.git
cd plynett.github.io
python -m http.server 8000
```

Open `http://localhost:8000` in a WebGPU-enabled browser. No build step required—just refresh after code changes.

## Contributing

Contributions are welcome! Whether it’s a bug fix, new feature, documentation improvement, or example scenario, please:

1. Fork the repository and create a feature branch.  
2. Serve locally via `python -m http.server`.  
3. Make changes, test in multiple scenarios and browsers.  
4. Commit with a clear message and push to your fork.  
5. Open a pull request against `plynett/plynett.github.io`.  

See `CONTRIBUTING.md` for full guidelines, including issue templates and code style.

## Support and Community

- **Usage Questions:** [Lynett Wave Research Forum](https://www.sqrtgh.com)  
- **Bugs & Features:** Open an issue on GitHub.

## License

This project is licensed under the **MIT License**. See the `LICENSE` file for details.

## Acknowledgments

- **Original Celeris Project:** GPU-accelerated wave simulator by Sasan Tavakkol under Patrick Lynett.  
- **Support:** USACE ERDC, ONR, NSF.  
- **Contributors:** Thanks to everyone who’s tested, reported issues, or added improvements.

Happy wave modeling!
