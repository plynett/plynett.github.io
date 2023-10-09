// set_bathy_IC_texture.js

function copyBathyDataToTexture(calc_constants, bathy2D, device, txBottom) {
    // copy bathy2D into txBottom

    // due to the way js / webGPU works, we will need to structure our input data into a 1D array, and then place into a buffer, to be copied to a texture
    // awesomely, the copy function requires that the buffer has a row size (in bytes) that is a multiple of 256
    // this will generally not be the case, so the 1D array that will go into the buffer must be padded so that there is the 256 multiple

    const actualBytesPerRow = calc_constants.WIDTH * 4 * 4; // 4 channels and 4 bytes per float
    const requiredBytesPerRow = Math.ceil(actualBytesPerRow / 256) * 256;
    const paddedFlatData = new Float32Array(calc_constants.HEIGHT * requiredBytesPerRow / 4);

    let lengthCheck = 3;    // check within three points
    for (let x = 0; x < calc_constants.HEIGHT; x++) {
        for (let y = 0; y < calc_constants.WIDTH; y++) {
            let BN = 0.5 * bathy2D[x][y] + 0.5 * bathy2D[x][Math.min(calc_constants.HEIGHT - 1, y + 1)];
            let BE = 0.5 * bathy2D[x][y] + 0.5 * bathy2D[Math.min(calc_constants.WIDTH - 1, x + 1)][y];

            const paddedIndex = (x * requiredBytesPerRow / 4) + y * 4; // Adjust the index for padding
            paddedFlatData[paddedIndex] = BN;  // red
            paddedFlatData[paddedIndex + 1] = BE;  // green
            paddedFlatData[paddedIndex + 2] = bathy2D[x][y];  // blue
            paddedFlatData[paddedIndex + 3] = 99;  // alpha

            // boolean near-dry check
            for (let yy = y - lengthCheck; yy <= y + lengthCheck; ++yy) {
                for (let xx = x - lengthCheck; xx <= x + lengthCheck; ++xx) {
                    let xC = Math.min(calc_constants.WIDTH - 1, Math.max(0, xx));
                    let yC = Math.min(calc_constants.HEIGHT - 1, Math.max(0, yy));

                    if (bathy2D[xC][yC] >= 0) {
                        paddedFlatData[paddedIndex + 3] = -99;
                    }
                }
            }
        }
    }

    const buffer = device.createBuffer({
        size: paddedFlatData.byteLength,
        usage: GPUBufferUsage.COPY_SRC,
        mappedAtCreation: true
    });
    new Float32Array(buffer.getMappedRange()).set(paddedFlatData);
    buffer.unmap();
    const commandEncoder = device.createCommandEncoder();
    commandEncoder.copyBufferToTexture({
        buffer: buffer,
        bytesPerRow: requiredBytesPerRow,
        rowsPerImage: calc_constants.HEIGHT,
    }, {
        texture: txBottom
    }, {
        width: calc_constants.WIDTH,
        height: calc_constants.HEIGHT,
        depthOrArrayLayers: 1
    });
    device.queue.submit([commandEncoder.finish()]);
}

function copyInitialConditionDataToTexture(calc_constants, device, txState) {
    // create and place initial condition into txState

    // due to the way js / webGPU works, we will need to structure our input data into a 1D array, and then place into a buffer, to be copied to a texture
    // awesomely, the copy function requires that the buffer has a row size (in bytes) that is a multiple of 256
    // this will generally not be the case, so the 1D array that will go into the buffer must be padded so that there is the 256 multiple

    const actualBytesPerRow = calc_constants.WIDTH * 4 * 4; // 4 channels and 4 bytes per float
    const requiredBytesPerRow = Math.ceil(actualBytesPerRow / 256) * 256;
    const paddedFlatData = new Float32Array(calc_constants.HEIGHT * requiredBytesPerRow / 4);

    for (let x = 0; x < calc_constants.HEIGHT; x++) {
        for (let y = 0; y < calc_constants.WIDTH; y++) {

             // Calculate the differences between the current coordinates and the center
            let dx = x - calc_constants.WIDTH / 4;
            let dy = y - calc_constants.HEIGHT / 1.2;
            let sigma = 24.0;

            let eta = 10. * Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma))

            const paddedIndex = (x * requiredBytesPerRow / 4) + y * 4; // Adjust the index for padding
            paddedFlatData[paddedIndex] = eta;  // red
            paddedFlatData[paddedIndex + 1] = 0;  // green
            paddedFlatData[paddedIndex + 2] = 0;  // blue
            paddedFlatData[paddedIndex + 3] = 0;  // alpha
        }
    }
    const buffer = device.createBuffer({
        size: paddedFlatData.byteLength,
        usage: GPUBufferUsage.COPY_SRC,
        mappedAtCreation: true
    });
    new Float32Array(buffer.getMappedRange()).set(paddedFlatData);
    buffer.unmap();
    const commandEncoder = device.createCommandEncoder();
    commandEncoder.copyBufferToTexture({
        buffer: buffer,
        bytesPerRow: requiredBytesPerRow,
        rowsPerImage: calc_constants.HEIGHT,
    }, {
        texture: txState
    }, {
        width: calc_constants.WIDTH,
        height: calc_constants.HEIGHT,
        depthOrArrayLayers: 1
    });
    device.queue.submit([commandEncoder.finish()]);

}


export { copyBathyDataToTexture, copyInitialConditionDataToTexture };
