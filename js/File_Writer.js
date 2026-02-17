//File_Writer.js
import { calc_constants } from './constants_load_calc.js';

export async function readTextureData(device, src_texture, channel, buffer) {
  const width = calc_constants.WIDTH;
  const height = calc_constants.HEIGHT;

  const requiredBytesPerRow = Math.ceil((width * 4 * 4) / 256) * 256; // width * RGBA * f32, padded
  const floatsPerRow = requiredBytesPerRow >> 2;
  const chanOffset = channel - 1;

  const commandEncoder = device.createCommandEncoder();
  commandEncoder.copyTextureToBuffer(
    { texture: src_texture },
    { buffer, bytesPerRow: requiredBytesPerRow, rowsPerImage: height },
    { width, height, depthOrArrayLayers: 1 }
  );
  device.queue.submit([commandEncoder.finish()]);

  await buffer.mapAsync(GPUMapMode.READ);

  const bufferData = new Float32Array(buffer.getMappedRange());
  const flatData = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    const rowBasePadded = y * floatsPerRow;
    const rowBaseReal = y * width;
    for (let x = 0; x < width; x++) {
      flatData[rowBaseReal + x] = bufferData[rowBasePadded + (x << 2) + chanOffset];
    }
  }

  buffer.unmap();
  return flatData;
}


// geotiff writer  // not used needs updates to be used
export async function downloadGeoTiffData(device, texture, channel,dx,dy) {
  // Assuming readTextureData returns an array or typed array of values
  const data = await readTextureData(device, texture, channel,dx,dy); // This should be compatible with the values expected by writeArrayBuffer

  // Metadata: adjust these values to match your specific geospatial context
  const metadata = {
    GeographicTypeGeoKey: 4326, // Example: WGS84
    height: texture.height, // Number of rows in your data
    ModelPixelScale: [dx, dy, 0.0], // Adjust these values
    ModelTiepoint: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0], // Adjust these values
    width: texture.width // Number of columns in your data
  };

  // Convert your data to an ArrayBuffer using writeArrayBuffer
  const arrayBuffer = await GeoTIFF.writeArrayBuffer(data, metadata);

  // Create a Blob from the ArrayBuffer
  const blob = new Blob([arrayBuffer], { type: 'image/tiff' });

  // Download the Blob as a GeoTIFF file
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'textureData.tiff'; // Specifying .tiff extension for GeoTIFF
  document.body.appendChild(a);
  a.click();

  // Clean up
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}



export function downloadObjectAsFile(obj) {
    // Step 1: Convert the object to JSON string
    const data = JSON.stringify(obj, null, 4); // The parameters null and 4 are for JSON formatting purposes

    // Step 2: Create a Blob from the JSON string
    const blob = new Blob([data], { type: 'text/plain' });

    // Step 3: Create a URL for the Blob
    const url = URL.createObjectURL(blob);

    // Step 4: Create a temporary anchor element and initiate the download
    const tempLink = document.createElement('a');
    tempLink.href = url;
    tempLink.setAttribute('download', 'config.json'); // Specify the file name and extension
    document.body.appendChild(tempLink); // Temporarily add the link to the DOM
    tempLink.click(); // Trigger the download
    document.body.removeChild(tempLink); // Remove the temporary link

    // Step 5: Clean up by revoking the object URL
    URL.revokeObjectURL(url);
}

export function handleFileSelect(event) {
    // Get the selected file (first one if multiple)
    const file = event.target.files[0];

    // Check if a file was selected
    if (file) {
        const reader = new FileReader();

        // Define what happens when the file is read
        reader.onload = function (loadEvent) {
            try {
                // Parse JSON file content
                const jsonContent = JSON.parse(loadEvent.target.result);

                // Here you can handle your JSON content as needed
                // For example, loading it into your existing calc_constants object
                loadJsonIntoCalcConstants(jsonContent);
                calc_constants.html_update = 1; // flag used to check for updates.
            } catch (error) {
                console.error('Error parsing JSON file:', error);
            }
        };

        // Read the file as text (asynchronous operation)
        reader.readAsText(file);
    } else {
        console.error('No file selected.');
    }
}

export function loadJsonIntoCalcConstants(jsonContent) {
    // Assuming calc_constants is accessible here and jsonContent is the object structure you expect
    // You'd perform any checks and handle structure/content discrepancies as needed

    for (const key in jsonContent) {
        if (Object.hasOwnProperty.call(calc_constants, key)) {
            calc_constants[key] = jsonContent[key];
        }
    }

    // Any additional handling after loading the content, if needed
    // For example, updating UI elements or re-initializing components that rely on calc_constants
}


export async function saveRenderedImageAsJPEG(device, texture, width, height, outputPath='renderedImage.jpg') {
    // Step 1: Read back the pixel data
    const bytesPerRow = width * 4; // for RGBA, there are 4 channels per pixel
    const totalBytes = height * bytesPerRow; // total bytes needed for the whole image

    const FlatData = new Uint8ClampedArray(totalBytes); // this array will contain the image data

    const buffer = device.createBuffer({
        size: FlatData.byteLength,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        mappedAtCreation: true
    });

    new Uint8ClampedArray(buffer.getMappedRange()).set(FlatData);
    buffer.unmap();

    // We need to ensure the texture format is compatible with our readback, RGBA8 is assumed here.
    const copyEncoder = device.createCommandEncoder();
    copyEncoder.copyTextureToBuffer(
        {
            texture: texture,
        },
        {
            buffer: buffer,
            bytesPerRow: bytesPerRow,
            rowsPerImage: height,
        },
        {
            width: width,
            height: height,
            depthOrArrayLayers: 1
        },
    );

    // Submit the commands and wait for them to complete.
    const queue = device.queue;
    queue.submit([copyEncoder.finish()]);
    await buffer.mapAsync(GPUMapMode.READ);

    // Get an array buffer view of the buffer data.
    const arrayBuffer = buffer.getMappedRange();

    // Make a copy of the buffer data immediately after mapping, to prevent "detached buffer" errors
    const bufferCopy = new Uint8ClampedArray(arrayBuffer.slice());
    
    buffer.unmap(); // Don't forget to unmap the buffer once done
    buffer.destroy();  // free up memory

    // The buffer contains BGRA data, so we need to swap the red and blue channels for each pixel
    for (let i = 0; i < bufferCopy.length; i += 4) {
        // For every pixel, swap the blue and red channels (i.e., [B, G, R, A] becomes [R, G, B, A]).
        const blue = bufferCopy[i];
        const red = bufferCopy[i + 2];
        bufferCopy[i] = red;
        bufferCopy[i + 2] = blue;
    }

    // Step 2: Create ImageData from pixel data
    const imageData = new ImageData(bufferCopy, width, height);

    // Step 3: Draw the ImageData to a canvas and export it as JPEG
    // We'll use a 2D context with specific settings to avoid color space conversion issues
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true }); // avoid extra alpha premultiplication
    ctx.fillStyle = 'white'; // in case of any non-opaque pixels, they should blend with white
    ctx.fillRect(0, 0, width, height); // fill with white color
    ctx.putImageData(imageData, 0, 0); // imageData should contain straight (non-premultiplied) colors

    // Now we convert the canvas content to a blob and then to a URL that can be downloaded
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg')); // JPEG format

    // Create a link to download
    const a = document.createElement('a');
    a.download = outputPath;
    a.href = URL.createObjectURL(blob);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
}


export async function TexturetoImageData(device, texture, width, height) {
    // Step 1: Read back the pixel data
    const bytesPerRow = width * 4; // for RGBA, there are 4 channels per pixel
    const totalBytes = height * bytesPerRow; // total bytes needed for the whole image

    const FlatData = new Uint8ClampedArray(totalBytes); // this array will contain the image data

    const buffer = device.createBuffer({
        size: FlatData.byteLength,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        mappedAtCreation: true
    });

    new Uint8ClampedArray(buffer.getMappedRange()).set(FlatData);
    buffer.unmap();

    // We need to ensure the texture format is compatible with our readback, RGBA8 is assumed here.
    const copyEncoder = device.createCommandEncoder();
    copyEncoder.copyTextureToBuffer(
        {
            texture: texture,
        },
        {
            buffer: buffer,
            bytesPerRow: bytesPerRow,
            rowsPerImage: height,
        },
        {
            width: width,
            height: height,
            depthOrArrayLayers: 1
        },
    );

    // Submit the commands and wait for them to complete.
    const queue = device.queue;
    queue.submit([copyEncoder.finish()]);
    await buffer.mapAsync(GPUMapMode.READ);

    // Get an array buffer view of the buffer data.
    const arrayBuffer = buffer.getMappedRange();

    // Make a copy of the buffer data immediately after mapping, to prevent "detached buffer" errors
    const bufferCopy = new Uint8ClampedArray(arrayBuffer.slice());

    // The buffer contains BGRA data, so we need to swap the red and blue channels for each pixel
    for (let i = 0; i < bufferCopy.length; i += 4) {
        // For every pixel, swap the blue and red channels (i.e., [B, G, R, A] becomes [R, G, B, A]).
        const blue = bufferCopy[i];
        const red = bufferCopy[i + 2];
        bufferCopy[i] = red;
        bufferCopy[i + 2] = blue;
    }

    // Step 2: Create ImageData from pixel data
    const imageData = new ImageData(bufferCopy, width, height);

    return imageData;
}


export async function saveSingleValueToFile(value, filename) {

    // Convert the float to a string and create a Blob from it
    const blob = new Blob([value.toString()], { type: 'text/plain;charset=utf-8' });

    // Create a temporary anchor element and trigger the download
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();

    // Clean up by removing the anchor element and revoking the blob URL
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
}

async function getFrameData(device, src_texture, width, height) {
    // Create a buffer to hold the data read from the texture.
    const bytesPerChannel = 1; // 8 bits per channel
    const channelsPerPixel = 4; // BGRA components
    const bytesPerRow = width * channelsPerPixel;
    const alignedBytesPerRow = Math.ceil(bytesPerRow / 256) * 256; // Alignment for WebGPU
    const buffer = device.createBuffer({
        size: height * alignedBytesPerRow,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
    });

    // Command encoder for copying from texture to buffer
    const commandEncoder = device.createCommandEncoder();
    commandEncoder.copyTextureToBuffer(
        { texture: src_texture },
        { buffer: buffer, bytesPerRow: alignedBytesPerRow },
        { width: width, height: height, depthOrArrayLayers: 1 }
    );

    // Submit and wait for GPU to complete the commands
    device.queue.submit([commandEncoder.finish()]);
    await buffer.mapAsync(GPUMapMode.READ);

    // Extract and process the buffer data
    const copyArrayBuffer = new Uint8Array(buffer.getMappedRange());

    buffer.unmap(); // Don't forget to unmap the buffer once done
    buffer.destroy();  // free up memory

    // Format conversion from BGRA to RGBA (if necessary)
    const imageData = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
        imageData[4*i] = copyArrayBuffer[4*i + 2]; // Red
        imageData[4*i + 1] = copyArrayBuffer[4*i + 1]; // Green
        imageData[4*i + 2] = copyArrayBuffer[4*i]; // Blue
        imageData[4*i + 3] = copyArrayBuffer[4*i + 3]; // Alpha
    }

    return imageData; // Return the RGBA image data
}

// not used currrently, due to issues with FFMPEG.  Apparently to due this library, ffmpeg.load
// requires access to an external SharedArrayBuffer which does not exist by default on most browsers
// and servers due to security issues.
export async function createAndDownloadVideoFromTexture(device, texture, textureSize, outputPath='out.mp4', frameRate=24) {
    const { createFFmpeg, fetchFile } = FFmpeg;
    const ffmpeg = createFFmpeg({ log: true });

    // Load the FFmpeg module
    try {
        await ffmpeg.load();
    } catch (error) {
        console.error("Failed to load ffmpeg module:", error);
        return;
    }

    // Read frames from the texture and prepare image files
    for (let i = 0; i < textureSize.depth; i++) {
        try {
            const frameData = await getFrameData(device, texture, i, textureSize.width, textureSize.height);
            // Assuming frameData is in a format suitable for ffmpeg; this might require conversion
            ffmpeg.FS('writeFile', `frame${i}.png`, frameData);
        } catch (error) {
            console.error(`Failed to process frame ${i}:`, error);
            return;
        }
    }

    // Run FFmpeg to create the video from frames
    try {
        await ffmpeg.run('-framerate', frameRate.toString(), '-i', 'frame%d.png', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', outputPath);
    } catch (error) {
        console.error("Failed to create video:", error);
        return;
    }

    // Read the generated video file and create a URL for downloading
    try {
        const data = ffmpeg.FS('readFile', outputPath);
        const videoUrl = URL.createObjectURL(new Blob([data.buffer], { type: 'video/mp4' }));
        window.open(videoUrl, '_blank'); // Open the video in a new tab or window
    } catch (error) {
        console.error("Failed to read or download video file:", error);
    }
}

// will save the slices of a 3D image texture as a set of jpgs
export async function saveTextureSlicesAsImages(device, texture, textureSize) {
    const canvas = document.createElement('canvas');
    canvas.width = textureSize.width;
    canvas.height = textureSize.height;
    const ctx = canvas.getContext('2d');

    // Helper function to perform the read operation
    async function readTextureSlice(sliceIndex) {
        const bytesPerPixel = 4;  // BGRA components
        const buffer = device.createBuffer({
            size: textureSize.width * textureSize.height * bytesPerPixel,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
        });

        const commandEncoder = device.createCommandEncoder();
        const copySize = { width: textureSize.width, height: textureSize.height, depthOrArrayLayers: 1 };

        commandEncoder.copyTextureToBuffer(
            { texture: texture, origin: { x: 0, y: 0, z: sliceIndex } },
            { buffer: buffer, bytesPerRow: textureSize.width * bytesPerPixel },
            copySize
        );

        const gpuCommands = commandEncoder.finish();
        device.queue.submit([gpuCommands]);
        await buffer.mapAsync(GPUMapMode.READ);
        
        const arrayBuffer = new Uint8Array(buffer.getMappedRange()).slice();

        buffer.unmap(); // Don't forget to unmap the buffer once done
        buffer.destroy();  // free up memory

        return arrayBuffer;
    }

    // Iterate over each slice
    for (let i = 0; i < textureSize.depth; i++) {
        const rawData = await readTextureSlice(i);

        // Convert BGRA to RGBA
        const imageData = new Uint8ClampedArray(textureSize.width * textureSize.height * 4);
        for (let j = 0; j < rawData.length; j += 4) {
            imageData[j] = rawData[j + 2];    // Red
            imageData[j + 1] = rawData[j + 1];  // Green
            imageData[j + 2] = rawData[j];    // Blue
            imageData[j + 3] = rawData[j + 3];  // Alpha
        }

        const imgData = new ImageData(imageData, textureSize.width, textureSize.height);
        ctx.putImageData(imgData, 0, 0);

        // Create a Blob from the canvas
        canvas.toBlob((blob) => {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `frame_${i}.jpg`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            setTimeout(() => URL.revokeObjectURL(url), 100);
        }, 'image/jpeg');
    }
}

export async function createAnimatedGifFromTexture(device, texture, textureSize) {
    const canvas = document.createElement('canvas');
    canvas.width = textureSize.width;
    canvas.height = textureSize.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const gif = new GIF({
        workers: 2,
        quality: 10,
        workerScript: './externals/gif.worker.js'
    });

    async function readTextureSlice(sliceIndex) {
        const bytesPerPixel = 4; // BGRA components
        const buffer = device.createBuffer({
            size: textureSize.width * textureSize.height * bytesPerPixel,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
        });

        const commandEncoder = device.createCommandEncoder();
        commandEncoder.copyTextureToBuffer(
            { texture: texture, origin: {x: 0, y: 0, z: sliceIndex} },
            { buffer: buffer, bytesPerRow: textureSize.width * bytesPerPixel },
            { width: textureSize.width, height: textureSize.height, depthOrArrayLayers: 1 }
        );

        const gpuCommands = commandEncoder.finish();
        device.queue.submit([gpuCommands]);
        await buffer.mapAsync(GPUMapMode.READ);
        const arrayBuffer = new Uint8Array(buffer.getMappedRange()).slice();

        buffer.unmap(); // Don't forget to unmap the buffer once done
        buffer.destroy();  // free up memory

        return arrayBuffer;
    }

    for (let i = 0; i < textureSize.depth; i++) {
        console.log('Reading frame # ', i + 1, ' into animated gif')
        const rawData = await readTextureSlice(i);
        const imageData = new Uint8ClampedArray(textureSize.width * textureSize.height * 4);
        
        // Convert BGRA to RGBA
        for (let j = 0; j < rawData.length; j += 4) {
            imageData[j] = rawData[j + 2];    // Red
            imageData[j + 1] = rawData[j + 1];  // Green
            imageData[j + 2] = rawData[j];    // Blue
            imageData[j + 3] = rawData[j + 3];  // Alpha
        }

        const imgData = new ImageData(imageData, textureSize.width, textureSize.height);
        ctx.clearRect(0, 0, canvas.width, canvas.height);  // Clear previous frame
        ctx.putImageData(imgData, 0, 0);

        // Try a different approach to adding frames
        if (ctx.getImageData) {
            let frameData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            gif.addFrame(frameData, {delay: 10, copy: true});
        } else {
            gif.addFrame(ctx, {copy: true, delay: 10});
        }
    }

    console.log('Animated gif Complete - sending to write buffer.  May take up to 60 seconds to save.')
    gif.on('finished', function(blob) {
        const url = URL.createObjectURL(blob);
        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = 'animation.gif';
        downloadLink.click();
        URL.revokeObjectURL(url);
    });

    gif.render();
}

export async function writeSurfaceData(total_time,frame_count_output,device,txBottom,txState,txBreaking,txModelVelocities, buffer) {

    let time_filename = `time_${frame_count_output}.txt`;
    await saveSingleValueToFile(total_time,time_filename);

    if(frame_count_output == 1){
        let filename = `bathytopo.bin`;
        await downloadTextureData(device, txBottom, 3, filename, buffer);  // number is the channel 1 = .r, 2 = .g, etc.

        filename = `dx.txt`;
        await saveSingleValueToFile(calc_constants.dx,filename);

        filename = `dy.txt`;
        await saveSingleValueToFile(calc_constants.dy,filename);

        filename = `nx.txt`;
        await saveSingleValueToFile(calc_constants.WIDTH,filename);

        filename = `ny.txt`;
        await saveSingleValueToFile(calc_constants.HEIGHT,filename);
    }

    if(calc_constants.useSedTransModel ==1 || (total_time < 300.0 && calc_constants.disturbanceType == 5)){  // write depth if using sediment transport model or landslide
        let filename = `depth_${frame_count_output}.bin`;
        await downloadTextureData(device, txBottom, 3, filename, buffer);  // number is the channel 1 = .r, 2 = .g, etc.
        await sleep(calc_constants.fileWritePause); // wait long enough for the download to start…
    }

    if(calc_constants.write_eta == 1){  // free surface elevation
        let filename = `elev_${frame_count_output}.bin`;
        await downloadTextureData(device, txState, 1, filename, buffer);  // number is the channel 1 = .r, 2 = .g, etc.
        await sleep(calc_constants.fileWritePause); // wait long enough for the download to start…
    }

    if(calc_constants.write_P == 1){  // x-dir flux Hu
        let filename = `xflux_${frame_count_output}.bin`;
        await downloadTextureData(device, txState, 2, filename, buffer);  // number is the channel 1 = .r, 2 = .g, etc.
        await sleep(calc_constants.fileWritePause); // wait long enough for the download to start…
    }

    if(calc_constants.write_Q == 1){  // y-dir flux Hv
        let filename = `yflux_${frame_count_output}.bin`;
        await downloadTextureData(device, txState, 3, filename, buffer);  // number is the channel 1 = .r, 2 = .g, etc.
        await sleep(calc_constants.fileWritePause); // wait long enough for the download to start…
    }

    if(calc_constants.write_u == 1){  // x-dir velocity u
        let filename = `xvelo_${frame_count_output}.bin`;
        await downloadTextureData(device, txModelVelocities, 1, filename, buffer);  // number is the channel 1 = .r, 2 = .g, etc.
        await sleep(calc_constants.fileWritePause); // wait long enough for the download to start…
    }

    if(calc_constants.write_v == 1){  // y-dir velocity v
        let filename = `yvelo_${frame_count_output}.bin`;
        await downloadTextureData(device, txModelVelocities, 2, filename, buffer);  // number is the channel 1 = .r, 2 = .g, etc.
        await sleep(calc_constants.fileWritePause); // wait long enough for the download to start…
    }    

    if(calc_constants.write_turb == 1){  // breaking eddy viscosity
        let filename = `turb_${frame_count_output}.bin`;
        await downloadTextureData(device, txBreaking, 2, filename, buffer);  // number is the channel 1 = .r, 2 = .g, etc.
        await sleep(calc_constants.fileWritePause); // wait long enough for the download to start…
    }

    return
}


export async function downloadTextureData(device, texture, channel, filename, buffer) {
    try {
        const data = await readTextureData(device, texture, channel, buffer);

        // Create a Blob from the data
        const blob = new Blob([data.buffer], { type: 'application/octet-stream' });

        // Utilize a callback-based approach to create a Blob and initiate the download
        await blobCreationAndDownload(blob, filename);
    } catch (error) {
        console.error('Error during texture data download:', error);
    }
}

function blobCreationAndDownload(blob, filename) {
    return new Promise((resolve, reject) => {
        if (blob.size === 0) {
            return reject('Blob creation failed for ' + filename);
          }
      
        const url  = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href        = url;
        link.download    = filename;
        document.body.appendChild(link);
      
        link.click();
      
          // wait long enough for the download to start…
        setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            resolve();
        }, calc_constants.fileWritePause);
    });
  }

export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
  


