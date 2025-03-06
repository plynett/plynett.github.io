
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

    addTextToContainer(`Grid Size in X-direction (m): ${Math.round(calc_constants.dx*1000)/1000}`, container);
    addTextToContainer(`Grid Size in Y-direction (m): ${Math.round(calc_constants.dy*1000)/1000}`, container);
    addTextToContainer(`Cells in X-direction: ${calc_constants.WIDTH}`, container);
    addTextToContainer(`Cells in Y-direction: ${calc_constants.HEIGHT}`, container);
    addTextToContainer(`Courant Number: ${calc_constants.Courant_num}`, container);
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
    addTextToContainer(`Simulated Time (min) Since Config Change: ${Math.round(total_time / 60. * 1000) / 1000}`, container);
    addTextToContainer(`Faster-than-Realtime Ratio: ${Math.round(total_time / calc_constants.elapsedTime_update * 10) / 10}`, container);
    addTextToContainer(`Render Frame Interval: ${calc_constants.render_step}`, container);
    
}

export function displaySimStatus(calc_constants, total_time, total_time_since_http_update) {
    // Make sure the DOM is fully loaded before trying to access elements
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', displayCalcConstants);
        return;
    }

    // Get the container where we want to display the constants
    const container = document.getElementById('simstatus-container');

    // Check if container is found in the DOM
    if (!container) {
        console.error("Constants container not found in the DOM.");
        return;
    }

    // Clear the previous contents
     container.innerHTML = '';

    // Add text 
    if (calc_constants.NLSW_or_Bous == 0) {
        if(calc_constants.river_sim == 1){
            addTextToContainer(`River Simulation`, container);
        }
        else {
            addTextToContainer(`NLSW Simulation`, container);
        }
    }
    else {
        addTextToContainer(`Boussinesq Simulation`, container);
    }
    addTextToContainer(`,      Simulated Time (min): ${Math.round(total_time / 60. * 10) / 10}`, container);
    addTextToContainer(`,      Faster-than-Realtime Ratio: ${Math.round(total_time_since_http_update / calc_constants.elapsedTime_update * 10) / 10}`, container);
    
}


export function displayTimeSeriesLocations(calc_constants) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => displayTimeSeriesLocations(calc_constants));
        return;
    }

    const container = document.getElementById('timeserieslocs-container');
    if (!container) {
        console.error("Constants container not found in the DOM.");
        return;
    }

    container.innerHTML = ''; // Clear previous contents

    for (let i = 1; i < calc_constants.NumberOfTimeSeries+1; i++) {
        const locationInfo = `Location ${Math.round(i)}, ` +
                             `X: ${Math.round(calc_constants.locationOfTimeSeries[i].xts * 100) / 100}, ` +
                             `Y: ${Math.round(calc_constants.locationOfTimeSeries[i].yts * 100) / 100}<br>`;
        container.innerHTML += locationInfo; // Append location info directly with line breaks
    }
}

export function displaySlideVolume(calc_constants) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => displaySlideVolume(calc_constants));
        return;
    }

    const container = document.getElementById('slidevolume-container');
    if (!container) {
        console.error("Constants container not found in the DOM.");
        return;
    }

    container.innerHTML = ''; // Clear previous contents

    if(calc_constants.disturbanceType == 4) {
        let slide_vol = calc_constants.disturbanceCrestamp * calc_constants.disturbanceWidth * calc_constants.disturbanceLength / 1000000.0;
        
        const slideInfo = `Displaced Water Volume (Mm^3) from Subaerial Slide: ${slide_vol}<br>`;
        container.innerHTML += slideInfo; // Append location info directly with line breaks
    }
}

export function ConsoleLogRedirection() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ConsoleLogRedirection);
        return;
    }

    const logContainer = document.getElementById('log-container');
    if (!logContainer) {
        console.error("Log container not found in the DOM.");
        return;
    }

    const oldLog = console.log;
    console.log = function (...args) {
        // Create a message string from all arguments
        const message = args.map(arg => {
            if (typeof arg === 'object') {
                // Attempt to convert object to string via JSON
                try {
                    return JSON.stringify(arg);
                } catch (e) {
                    return "Unserializable Object";
                }
            } else {
                // Convert non-objects directly to string
                return String(arg);
            }
        }).join(' ');

        oldLog.apply(console, args);  // Keep the normal console.log behavior
        addTextToLogContainer(message, logContainer);  // Add text to the log container
    };
}

function addTextToLogContainer(text, container) {
    const entry = document.createElement('div');
    entry.textContent = text;
    container.appendChild(entry);
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
    } else if (boundaryType == 3) {
        boundaryDescription = `${direction} Boundary: Periodic Boundary`;
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