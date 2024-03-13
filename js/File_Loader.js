// File_loader.js

// load depth file
export async function loadDepthSurface(bathymetryContent, calc_constants) {
    let response;
    let lines;
    let filePath;
    // Try to parse the uploaded content, if fails, then load server side file
    try {

        lines = bathymetryContent.split('\n');

        console.log("Bathy data loaded successfully from the uploaded file.");

    } catch (error) {
        console.log("Failed to parse uploaded bathymetry file, loading server side file");
        filePath = 'bathy.txt';
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

        lines = fileContents.split('\n');
        console.log("server side Bathy data loaded successfully.");
    }

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
    console.log("Bathy/topo data parsed successfully.");

    return bathy2D;
}


// load wave data
export async function loadWaveData(waveContent) {
    let lines;
    // Try to parse the uploaded content, if fails, then load server side file
    try {

        lines = waveContent.trim().split('\n');

        console.log("Waves data loaded successfully from the uploaded file.");

    } catch (error) {
        console.log("Failed to parse uploaded waves file, loading server side file");
        const filePath = 'waves.txt';
        const response = await fetch(filePath);
        if (!response.ok) {
            throw new Error("Network response was not ok");
        }

        const text = await response.text();
        lines = text.trim().split("\n");
        console.log("server side Waves data loaded successfully.");
    }

    try {
        const numberOfWaves = parseInt(lines[0].split(' ')[1], 10);

        const waveData = lines.slice(2).map(line => line.trim().split(/\s+/).map(Number));

        console.log("Wave data parsed successfully.");
        return { numberOfWaves, waveData };

    } catch (error) {
        console.error("Error reading the waves.txt file: ", error);
        throw error;  // Propagate the error so the calling function can handle it.
    }
}


//////////////// Code for importing a Google Maps image
// Overall function to create texture with google maps image
export async function CreateGoogleMapImage(device, context, lat_LL, lon_LL, lat_UR, lon_UR, maxWidth, maxHeight) {
    const zoomLevel = calculateZoomLevel(lat_LL, lon_LL, lat_UR, lon_UR, maxWidth, maxHeight); 
    const url = constructGoogleMapsUrl(lat_LL, lon_LL, lat_UR, lon_UR, zoomLevel, maxWidth, maxHeight);
    const image = await fetchMapImage(url);

    return image;
}

// Step 0:  determine proper Zoom level
function calculateZoomLevel(lat_LL, lon_LL, lat_UR, lon_UR, maxWidth, maxHeight) {
    const WORLD_DIM = { height: 256, width: 256 };
    const ZOOM_MAX = 21;

    // Helper function to convert latitude to radians
    function latRad(lat) {
        var sin = Math.sin(lat * Math.PI / 180);
        var radX2 = Math.log((1 + sin) / (1 - sin)) / 2;
        return Math.max(Math.min(radX2, Math.PI), -Math.PI) / 2;
    }

    // Helper function to calculate the appropriate zoom level
    function zoom(mapPx, worldPx, fraction) {
        return Math.floor(Math.log(mapPx / worldPx / fraction) / Math.LN2);
    }

    // Calculate the latitude and longitude differences
    var latDiff = Math.abs(lat_LL - lat_UR);
    var lngDiff = Math.abs(lon_LL - lon_UR);

    // Adjust longitude difference for crossing the international date line
    if (lngDiff > 180) {
        lngDiff = 360 - lngDiff;
    }

    // Calculate fractions used for zoom calculation
    var latFraction = Math.abs(latRad(lat_LL) - latRad(lat_UR)) / Math.PI;
    var lngFraction = lngDiff / 360;

    // Calculate the ideal zoom levels based on latitude and longitude
    // Need to consider the dimensions of the container for the map (maxWidth and maxHeight)

    var latZoom = zoom(maxHeight, WORLD_DIM.height, latFraction);
    var lngZoom = zoom(maxWidth, WORLD_DIM.width, lngFraction);

    // Return the minimum between calculated latitudinal and longitudinal zooms (to fit both),
    // and also make sure it does not exceed the maximum zoom level allowed.

    return Math.min(latZoom, lngZoom, ZOOM_MAX);
}


// Step 1: Construct URL for Google Maps API.
function constructGoogleMapsUrl(lat_LL, lon_LL, lat_UR, lon_UR, zoomLevel, maxWidth, maxHeight) {

    let apiKey = 'AIzaSyCrNXSKKC3xLVIwSmbxT5IBJ_KZR-x_UuI';  // p. lynett's API key - remove for distribution, make this an input

    // First, we need to calculate the center of the map view.
    const centerLat = (lat_LL + lat_UR) / 2;
    const centerLon = (lon_LL + lon_UR) / 2;

    // Construct the URL for the Google Maps Static API
    const url = new URL('https://maps.googleapis.com/maps/api/staticmap');

    // Set parameters for the API request
    url.searchParams.set('center', `${centerLat},${centerLon}`);
    url.searchParams.set('zoom', zoomLevel.toString());
    url.searchParams.set('size', `${maxWidth}x${maxHeight}`);
    url.searchParams.set('maptype', 'satellite');
    url.searchParams.set('style', 'feature:all|element:labels|visibility:off');
    url.searchParams.set('key', apiKey);

    // Additional parameters like 'maptype' can be added as needed
    // For example, to get a satellite view, you can uncomment the following line:
    // url.searchParams.set('maptype', 'satellite');

    return url.toString();
}


// Step 2: Fetch Image from Google Maps.
async function fetchMapImage(url) {
    // Fetch the image from the URL.
    const response = await fetch(url);
    const imageBlob = await response.blob();

    // Create an image element.
    const image = new Image();
    image.src = URL.createObjectURL(imageBlob);

    // Ensure the image is loaded.
    await new Promise((resolve) => {
        image.onload = resolve;
    });

    return image;
}

// Step 3 and 4: Load the image into a texture.
async function createTextureFromImage(device, context, image) {
    // This function assumes you're using WebGPU. If you're using WebGL, the method will be different.
    // Create a GPU texture.
    const texture = device.createTexture({
        size: {
            width: image.width,
            height: image.height,
            depthOrArrayLayers: 1,
        },
        format: 'rgba32float',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });

    // Load the image into the texture.
    context.queue.copyExternalImageToTexture(
        { source: image },
        { texture: texture },
        { width: image.width, height: image.height }
    );

    return texture;
}

// Determines the scale and offset needed to map the Google Maps image to the simulation domain
export function calculateGoogleMapScaleAndOffset(lat_LL, lon_LL, lat_UR, lon_UR, maxWidth, maxHeight) {
    let zoomLevel = calculateZoomLevel(lat_LL, lon_LL, lat_UR, lon_UR, maxWidth, maxHeight);

    // Determine the actual geographical corners of the fetched image.
    let actualCorners = calculateActualImageCorners(lat_LL, lon_LL, lat_UR, lon_UR, zoomLevel, maxWidth, maxHeight);

    // This function converts latitude to a scale used in the Web Mercator Projection.
    function project(lat) {
        const sin = Math.sin(lat * Math.PI / 180);
        const y = 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI);
        return y;
    }

    // Convert the latitude points to the Mercator projection
    const lowerYActual = project(actualCorners.lat_LL);
    const upperYActual = project(actualCorners.lat_UR);
    const lowerYTarget = project(lat_LL);
    const upperYTarget = project(lat_UR);

    // Calculate the full height in the Mercator projection's y-coordinates
    const fullMercatorHeight = upperYActual - lowerYActual;

    // The target height in Mercator's y-coordinates
    const targetMercatorHeight = upperYTarget - lowerYTarget;

    // The scale factor for Y should be the ratio of the Mercator heights
    let scaleY = targetMercatorHeight / fullMercatorHeight;

    // The offset in Y is the distance from the actual lower left corner to the target lower left corner in Mercator coordinates, 
    // divided by the full Mercator height of the actual image.
    let offsetY = (lowerYTarget - lowerYActual) / fullMercatorHeight;

    // For longitude, the calculations remain linear
    let fullGeoWidth = Math.abs(actualCorners.lon_UR - actualCorners.lon_LL);
    let targetGeoWidth = Math.abs(lon_UR - lon_LL);
    let scaleX = targetGeoWidth / fullGeoWidth;
    let offsetX = (lon_LL - actualCorners.lon_LL) / fullGeoWidth;

    // Return the calculated scale factors and offsets
    return {
        scaleX: scaleX,
        scaleY: scaleY,
        offsetX: offsetX,
        offsetY: offsetY
    };
}

function calculateActualImageCorners(lat_LL, lon_LL, lat_UR, lon_UR, zoomLevel, maxWidth, maxHeight) {
    // Constants for the calculations
    const TILE_SIZE = 256; // Size of a tile in pixels, standard for Google Maps

    // The scale factor corresponds to the number of tiles (256x256) that are used to represent the entire world at the given zoom level.
    const scale = 1 << zoomLevel;

    // This function converts latitude to a scale used in the Web Mercator Projection.
    function project(lat) {
        const sin = Math.sin(lat * Math.PI / 180);
        const y = 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI);
        return y;
    }

    // Calculate the center of the provided coordinates
    const latCenter = (lat_LL + lat_UR) / 2;
    const lonCenter = (lon_LL + lon_UR) / 2;

    // Convert the center point latitude to Mercator projection scale
    const globalYCenter = project(latCenter);

    // Calculate how many degrees each pixel represents (this is constant for longitude in Mercator projection)
    const degreesPerPixelX = 360 / (TILE_SIZE * scale);

    // Calculate the width in degrees of the entire image
    const imageWidthDegrees = maxWidth * degreesPerPixelX;

    // Find the corresponding Y value in the Mercator scale for the top and bottom latitude
    const globalYTop = project(lat_UR);
    const globalYBottom = project(lat_LL);

    // The height in the Mercator scale of the image
    const globalImageHeight = globalYBottom - globalYTop;

    // Since the scale is not linear, we calculate the number of pixels corresponding to the height between lat_LL and lat_UR
    const pixelsY = globalImageHeight * (TILE_SIZE * scale);

    // The degree representation of each pixel in the Y-axis (latitude)
    // Note: this is a bit of a simplification, it assumes that the "degrees per pixel" is constant across the height of the image.
    const degreesPerPixelY = (lat_LL - lat_UR) / pixelsY;

    // Calculate the height in degrees of the entire image
    const imageHeightDegrees = maxHeight * degreesPerPixelY;

    // Calculate the actual coordinates of the image corners based on the center coordinates
    const actualLat_LL = latCenter - (imageHeightDegrees / 2);
    const actualLon_LL = lonCenter - (imageWidthDegrees / 2);
    const actualLat_UR = latCenter + (imageHeightDegrees / 2);
    const actualLon_UR = lonCenter + (imageWidthDegrees / 2);

    return {
        lat_LL: actualLat_LL,
        lon_LL: actualLon_LL,
        lat_UR: actualLat_UR,
        lon_UR: actualLon_UR
    };
}




