//Time_Series.js
import { calc_constants, timeSeriesData } from './constants_load_calc.js';

// function to read the corner pixel of a texture, and store into a variable
// not used anymore
export async function readCornerPixelData(device, texture) {
    // For a single pixel, especially in an RGBA format
    const bytesPerPixel = 4; // RGBA: 4 channels per pixel, 8 bits per channel
    const bytesPerRow = 256; // WebGPU requires bytesPerRow to be at least 256

    const buffer = device.createBuffer({
        size: bytesPerRow, // Allocate enough for at least one row, due to the 256-byte requirement
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        mappedAtCreation: false, // No need to initialize the buffer data
    });

    // Copy just the first pixel from the texture
    const copyEncoder = device.createCommandEncoder();
    copyEncoder.copyTextureToBuffer(
        { texture: texture },
        {
            buffer: buffer,
            bytesPerRow: bytesPerRow, // Must be at least 256
            rowsPerImage: 1,
        },
        { width: 1, height: 1, depthOrArrayLayers: 1 }, // Copying only one pixel
    );

    // Submit the commands and wait for them to complete.
    device.queue.submit([copyEncoder.finish()]);
    await buffer.mapAsync(GPUMapMode.READ);

    // Access the buffer data
    const arrayBuffer = buffer.getMappedRange();
    const bufferCopy = new Uint8ClampedArray(arrayBuffer.slice(0, bytesPerPixel)); // Only need the first 4 bytes for one pixel

    // Swap the red and blue channels if needed (assuming texture format is BGRA)
    const blue = bufferCopy[0];
    const red = bufferCopy[2];
    bufferCopy[0] = red;
    bufferCopy[2] = blue;

    // Use the data as needed (now in RGBA order)
    calc_constants.tooltipVal_bottom = bufferCopy[0] / 255.0 * 2.0 * calc_constants.base_depth - calc_constants.base_depth; // Red
    calc_constants.tooltipVal_eta = bufferCopy[1] / 255.0 * 0.2 * calc_constants.base_depth - 0.1*calc_constants.base_depth; // Green
    calc_constants.tooltipVal_Hs = bufferCopy[2] / 255.0 * 0.2 * calc_constants.base_depth; // Blue
    calc_constants.tooltipVal_friction = bufferCopy[3] / 255.0 / 20.; // Alpha

    buffer.unmap(); // Don't forget to unmap the buffer once done

    return bufferCopy;
}



// function to read the data from a 1D texture, and store into a variable
export async function readToolTipTextureData(device, texture, frame_count_time_series) {
    // For a single pixel, especially in an RGBA format
    const bytesPerPixel = 16; // RGBA: 4 channels per pixel, 32 bits per channel
    const bytesPerRow = 256; // WebGPU requires bytesPerRow to be at least 256

    const buffer = device.createBuffer({
        size: bytesPerRow, // Allocate enough for at least one row, due to the 256-byte requirement
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        mappedAtCreation: false, // No need to initialize the buffer data
    });

    // Copy just the first pixel from the texture
    const copyEncoder = device.createCommandEncoder();
    copyEncoder.copyTextureToBuffer(
        { texture: texture },
        {
            buffer: buffer,
            bytesPerRow: bytesPerRow, // Must be at least 256
            rowsPerImage: 1,
        },
        { width: calc_constants.NumberOfTimeSeries + 1, height: 1, depthOrArrayLayers: 1 }, // Copying only tooltip and used time series
    );

    // Submit the commands and wait for them to complete.
    device.queue.submit([copyEncoder.finish()]);
    await buffer.mapAsync(GPUMapMode.READ);

    // Access the buffer data
    const arrayBuffer = buffer.getMappedRange();
    const bufferCopy = new Float32Array(arrayBuffer.slice(0, bytesPerPixel * (calc_constants.NumberOfTimeSeries + 1)));

    // Use the data as needed (now in RGBA order)
    calc_constants.tooltipVal_bottom = bufferCopy[0]; // Red
    calc_constants.tooltipVal_eta = bufferCopy[1]; // Green
    calc_constants.tooltipVal_Hs = bufferCopy[2] // Blue
    calc_constants.tooltipVal_friction = bufferCopy[3]; // Alpha

    if (calc_constants.NumberOfTimeSeries > 0) {
        let time_c = bufferCopy[4];
        if (frame_count_time_series == 0){
            resetTimeSeriesData();
            time_c = 0.0;
        }
        for (let i = 0; i < calc_constants.NumberOfTimeSeries; i += 1) {  // append data to existing structure
            timeSeriesData[i]['time'].push(time_c);
            timeSeriesData[i]['eta'].push(bufferCopy[(i + 1) * 4 + 1]);
            timeSeriesData[i]['P'].push(bufferCopy[(i + 1) * 4 + 2]);
            timeSeriesData[i]['Q'].push(bufferCopy[(i + 1) * 4 + 3]);
        }

        calc_constants.countTimeSeries = calc_constants.countTimeSeries + 1;  // step up counter
    }

    buffer.unmap(); // Don't forget to unmap the buffer once done

    return;
}

export function resetTimeSeriesData() {
    // Iterate over each location in timeSeriesData
    timeSeriesData.forEach(location => {
        // Clear each time series array for the location by setting length to 0
        if (Array.isArray(location.eta)) location.eta.length = 0;
        if (Array.isArray(location.P)) location.P.length = 0;
        if (Array.isArray(location.Q)) location.Q.length = 0;
        if (Array.isArray(location.time)) location.time.length = 0;
    });
}


