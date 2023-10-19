// File_loader.js

// load depth file
export async function loadDepthSurface(filePath, calc_constants) {
    let response;

    try {
        response = await fetch(filePath);
    } catch (error) {
        console.error("Could not find depth file at " + filePath);
        return null;
    }

    if (!response.ok) {
        console.error("Error fetching depth file:", response.statusText);
        return null;
    }

    const fileContents = await response.text();

    const lines = fileContents.split('\n');
    const bathy2D = Array.from({ length: calc_constants.WIDTH }, () => Array(calc_constants.HEIGHT));

    // Parse the depth data.
    for (let y = 0; y < calc_constants.HEIGHT; y++) {
        // Split each line by spaces or tabs.
        const depthValues = lines[y].split(/\s+/).filter(Boolean);

        if (depthValues.length !== calc_constants.WIDTH) {
            console.error("Depth file at " + filePath + " is not in the correct format.");
            return null;
        }

        for (let x = 0; x < calc_constants.WIDTH; x++) {
            const parsedValue = parseFloat(depthValues[x]);
            if (isNaN(parsedValue)) {
                console.error(`Could not parse depth value at [${x}, ${y}] in depth file at ${filePath}`);
                return null;
            }
            bathy2D[x][y] = parsedValue;
        }
    }

    // flatten edges
    for (let y = 0; y < calc_constants.HEIGHT; y++) {
        for (let x = 0; x < 3; x++) {
            bathy2D[x][y] = bathy2D[4][y];
        }
    }
    for (let y = 0; y < calc_constants.HEIGHT; y++) {
        for (let x = calc_constants.WIDTH - 4; x < calc_constants.WIDTH; x++) {
            bathy2D[x][y] = bathy2D[calc_constants.WIDTH - 5][y];
        }
    }
    for (let y = 0; y < 3; y++) {
        for (let x = 0; x < calc_constants.WIDTH; x++) {
            bathy2D[x][y] = bathy2D[x][4];
        }
    }
    for (let y = calc_constants.HEIGHT - 4; y < calc_constants.HEIGHT; y++) {
        for (let x = 0; x < calc_constants.WIDTH; x++) {
            bathy2D[x][y] = bathy2D[x][calc_constants.HEIGHT - 5];
        }
    }
    console.log("Bathy/topo data loaded successfully.");

    return bathy2D;
}


// load wave data
export async function loadWaveData(filePath) {
    try {
        const response = await fetch(filePath);
        if (!response.ok) {
            throw new Error("Network response was not ok");
        }

        const text = await response.text();
        const lines = text.trim().split("\n");
        const numberOfWaves = parseInt(lines[0].split(' ')[1], 10);

        const waveData = lines.slice(2).map(line => line.trim().split(/\s+/).map(Number));

        console.log("Wave data loaded successfully.");
        return { numberOfWaves, waveData };

    } catch (error) {
        console.error("Error reading the irrWaves.txt file: ", error);
        throw error;  // Propagate the error so the calling function can handle it.
    }
}



