//File_Writer.js
import { calc_constants } from './constants_load_calc.js';
export async function readTextureData(device, src_texture, channel) {
    // Create a buffer to hold the data read from the texture.
    const bytesPerChannel = 4; // Since each channel is a 32-bit float
    const channelsPerPixel = 4; // For RGBA data
    const actualBytesPerRow = calc_constants.WIDTH * bytesPerChannel * channelsPerPixel; // 4 channels and 4 bytes per float
    const requiredBytesPerRow = Math.ceil(actualBytesPerRow / 256) * 256;
    const paddedFlatData = new Float32Array(calc_constants.HEIGHT * requiredBytesPerRow / 4);

    const buffer = device.createBuffer({
        size: paddedFlatData.byteLength,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        mappedAtCreation: true
    });

    new Float32Array(buffer.getMappedRange()).set(paddedFlatData);
    buffer.unmap();

    // Create a command encoder and copy the texture to the buffer.
    const commandEncoder = device.createCommandEncoder();
    commandEncoder.copyTextureToBuffer(
        {
            texture: src_texture,
        },
        {
            buffer: buffer,
            bytesPerRow: requiredBytesPerRow,
            rowsPerImage: calc_constants.HEIGHT,
        },
        {
            width: calc_constants.WIDTH,
            height: calc_constants.HEIGHT,
            depthOrArrayLayers: 1
        },
    );

    // Submit the commands and wait for them to complete.
    const queue = device.queue;
    queue.submit([commandEncoder.finish()]);
    await buffer.mapAsync(GPUMapMode.READ);

    // Get an array buffer view of the buffer data.
    const arrayBuffer = buffer.getMappedRange();

    // You could then convert the data as needed before saving, e.g., creating a Float32Array view on the data.
    const Buffer_data = new Float32Array(arrayBuffer);

    // Initialize the 1D array
    let flatData = new Float32Array(calc_constants.WIDTH * calc_constants.HEIGHT);

    // Extract data from Buffer_data into the 2D array, row by row, taking into account the padding and the 4 channels per pixel
    for (let y = 0; y < calc_constants.HEIGHT; y++) {
        for (let x = 0; x < calc_constants.WIDTH; x++) {

            const paddedIndex = (y * requiredBytesPerRow / 4) + x * 4; // Adjust the index for padding
            const realIndex = y * calc_constants.WIDTH + x; // Adjust the index for padding

            flatData[realIndex] = Buffer_data[paddedIndex + channel - 1]; // red
    //        data[x][y] = paddedFlatData[paddedIndex + 1];  // green
    //        data[x][y] = paddedFlatData[paddedIndex + 2];  // blue
    //        data[x][y] = paddedFlatData[paddedIndex + 3];  // alpha
        }
    }

    return flatData; // or whatever processed form you prefer
}

export async function downloadTextureData(device, texture, channel) {
    // Read data from the texture
    const data = await readTextureData(device, texture, channel);  //copies texture to buffer, then copies buffer to data, which is a Float32Array(WIDTH * HEIGHT);

    // Create a Blob from the data
    const blob = new Blob([data.buffer], { type: 'application/octet-stream' }); // or another MIME type as appropriate

    // Create an anchor element and use it to trigger the download
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'textureData.bin'; // or .txt, or .data, or whatever extension is appropriate for your data
    document.body.appendChild(a);
    a.click();

    // Clean up
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
}


// geotiff writer
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


export async function saveRenderedImageAsJPEG(device, texture, width, height) {
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
    a.download = 'renderedImage.jpg';
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

