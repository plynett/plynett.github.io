
export function displayCalcConstants(calc_constants, total_time) {
    // Make sure the DOM is fully loaded before trying to access elements
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', displayCalcConstants);
        return;
    }

    // Get the container where we want to display the constants
    const container = document.getElementById('constants-container');

    // Check if container is found in the DOM
    if (!container) {
        console.error("Constants container not found in the DOM.");
        return;
    }

    // Clear the previous contents
     container.innerHTML = '';

    // Add text 
    addTextToContainer(`--- Simulation Parameters ---`, container);

    if (calc_constants.NLSW_or_Bous == 0) {
        addTextToContainer(`NLSW Simulation`, container);
    }
    else {
        addTextToContainer(`Boussinesq Simulation`, container);
    }
    if (calc_constants.timeScheme == 2) {
        addTextToContainer(`4th-Order Implicit Predictor-Corrector Scheme`, container);
    }
    else {
        addTextToContainer(`3rd-Order Explicit Predictor Scheme`, container);
    }

    addTextToContainer(`Using MinMod with Theta: ${calc_constants.Theta}`, container);

    addTextToContainer(`Cells in X-direction: ${calc_constants.WIDTH}`, container);
    addTextToContainer(`Cells in Y-direction: ${calc_constants.HEIGHT}`, container);
    addTextToContainer(`Courant Number: ${calc_constants.Courant_num}`, container);
    addTextToContainer(`Grid Size (m): ${Math.round(calc_constants.dx*1000)/1000}`, container);
    addTextToContainer(`Time Step (s): ${Math.round(calc_constants.dt * 1000) / 1000}`, container);
    addTextToContainer(`Base (deep-water) Depth (m): ${Math.round(calc_constants.base_depth * 1000) / 1000}`, container);
    addBoundaryDescription("West", calc_constants.west_boundary_type, container);
    addBoundaryDescription("East", calc_constants.east_boundary_type, container);
    addBoundaryDescription("South", calc_constants.south_boundary_type, container);
    addBoundaryDescription("North", calc_constants.north_boundary_type, container);

    if (calc_constants.isManning == 1) {
        addTextToContainer(`Usings Mannings Friction Law`, container);
        addTextToContainer(`-      with Mannings n: ${calc_constants.friction}`, container);
    }
    else {
        addTextToContainer(`Usings Quadratic Friction Law`, container);
        addTextToContainer(`-      with friction factor: ${calc_constants.friction}`, container);
    }
    addTextToContainer(`Wave Breaking Slope Threshold: ${calc_constants.dissipation_threshold}`, container);
    addTextToContainer(`Turbulent Decay Coefficient: ${calc_constants.whiteWaterDecayRate}`, container);
    addSpacerToContainer(container);
    addTextToContainer(`--- Runtime Parameters ---`, container);
    addTextToContainer(`Simulated Time (min): ${Math.round(total_time / 60. * 1000) / 1000}`, container);
    addTextToContainer(`Faster-than-Realtime Ratio: ${Math.round(total_time / calc_constants.elapsedTime * 1000) / 1000}`, container);
    addTextToContainer(`Render Frame Interval: ${calc_constants.render_step}`, container);

    addSpacerToContainer(container);
    addTextToContainer(`--- Visualization Parameters ---`, container);
    if (calc_constants.surfaceToPlot == 0) {
        addTextToContainer(`Plotting Free Surface Elevation (m)`, container);
    }
    else if (calc_constants.surfaceToPlot == 1) {
        addTextToContainer(`Plotting Fluid Speed (m/s)`, container);
    }
    else if (calc_constants.surfaceToPlot == 2) {
        addTextToContainer(`Plotting East-West (x) Component of Fluid Velocity (m/s)`, container);
    }
    else if (calc_constants.surfaceToPlot == 3) {
        addTextToContainer(`Plotting North-South (y) Component of Fluid Velocity (m/s)`, container);
    }
    else if (calc_constants.surfaceToPlot == 4) {
        addTextToContainer(`Plotting Vertical Vorticity (1/s)`, container);
    }
    else if (calc_constants.surfaceToPlot == 5) {
        addTextToContainer(`Plotting Turbulence Intensity (m^2/s)`, container);
    }
    addTextToContainer(`Color Axis Maximum Value: ${calc_constants.colorVal_max}`, container);
    addTextToContainer(`Color Axis Minimum Value: ${calc_constants.colorVal_min}`, container);

    if (calc_constants.lon_LL != 0) {
        addTextToContainer(`Lower-Left Corner Coordinates: ${calc_constants.lat_LL}, ${calc_constants.lon_LL}`, container);
        addTextToContainer(`Upper-Right Corner Coordinates: ${calc_constants.lat_UR}, ${calc_constants.lon_UR}`, container);

    }

    
}

function addTextToContainer(text, container) {
    // Create a paragraph element
    const paragraph = document.createElement('p');

    // Set the text content
    paragraph.textContent = text;

    // Append to the container
    container.appendChild(paragraph);
}

function addBoundaryDescription(direction, boundaryType, container) {
    // Default message in case the boundary type doesn't match known cases
    let boundaryDescription = `${direction} Boundary: Unknown`;

    if (boundaryType == 0) {
        boundaryDescription = `${direction} Boundary: Solid Wall`;
    } else if (boundaryType == 1) {
        boundaryDescription = `${direction} Boundary: Sponge Layer`;
    } else if (boundaryType == 2) {
        boundaryDescription = `${direction} Boundary: Incoming Wave`;
    }

    // Use the utility function to add the text to the container
    addTextToContainer(boundaryDescription, container);
}


// Function to add a spacer element to the container
function addSpacerToContainer(container, height = '20px') {
    const spacer = document.createElement("div");
    spacer.style.height = height;
    container.appendChild(spacer);
}