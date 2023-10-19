// Copy_Data_to_Textures.js

function copyBathyDataToTexture(calc_constants, bathy2D, device, txBottom) {
    // copy bathy2D into txBottom

    // due to the way js / webGPU works, we will need to structure our input data into a 1D array, and then place into a buffer, to be copied to a texture
    // awesomely, the copy function requires that the buffer has a row size (in bytes) that is a multiple of 256
    // this will generally not be the case, so the 1D array that will go into the buffer must be padded so that there is the 256 multiple

    const actualBytesPerRow = calc_constants.WIDTH * 4 * 4; // 4 channels and 4 bytes per float
    const requiredBytesPerRow = Math.ceil(actualBytesPerRow / 256) * 256;
    const paddedFlatData = new Float32Array(calc_constants.HEIGHT * requiredBytesPerRow / 4);

    let lengthCheck = 3;    // check within three points
    for (let y = 0; y < calc_constants.HEIGHT; y++) {
        for (let x = 0; x < calc_constants.WIDTH; x++) {
            let BN = 0.5 * bathy2D[x][y] + 0.5 * bathy2D[x][Math.min(calc_constants.HEIGHT - 1, y + 1)];
            let BE = 0.5 * bathy2D[x][y] + 0.5 * bathy2D[Math.min(calc_constants.WIDTH - 1, x + 1)][y];

            const paddedIndex = (y * requiredBytesPerRow / 4) + x * 4; // Adjust the index for padding
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

            if (y < 4 || x < 4 || y > calc_constants.HEIGHT - 3 || x > calc_constants.WIDTH - 3) {
                paddedFlatData[paddedIndex + 3] = -99;
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

function copyWaveDataToTexture(calc_constants, waveData, device, txWaves) {
    // copy waveData into txWaves

    // due to the way js / webGPU works, we will need to structure our input data into a 1D array, and then place into a buffer, to be copied to a texture
    // awesomely, the copy function requires that the buffer has a row size (in bytes) that is a multiple of 256
    // this will generally not be the case, so the 1D array that will go into the buffer must be padded so that there is the 256 multiple

    const actualBytesPerRow = calc_constants.numberOfWaves * 4 * 4; // 4 channels and 4 bytes per float
    const requiredBytesPerRow = actualBytesPerRow * 256 /16; 
    const paddedFlatData = new Float32Array(requiredBytesPerRow / 4);

    for (let x = 0; x < calc_constants.numberOfWaves; x++) {

        const paddedIndex = x * 4; 

        paddedFlatData[paddedIndex] = waveData[x][0] // red
        paddedFlatData[paddedIndex + 1] = waveData[x][1];  // green
        paddedFlatData[paddedIndex + 2] = waveData[x][2];  // blue
        paddedFlatData[paddedIndex + 3] = waveData[x][3];  // alpha 
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
        rowsPerImage: 1,
    }, {
        texture: txWaves
    }, {
        width: calc_constants.numberOfWaves,
        height: 1,
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

    for (let y = 0; y < calc_constants.HEIGHT; y++) {
        for (let x = 0; x < calc_constants.WIDTH; x++) {

             // Calculate the differences between the current coordinates and the center
            let dx = x - calc_constants.WIDTH / 1.2;
            let dy = y - calc_constants.HEIGHT / 4;
            let sigma = 24.0;

            let eta = 0. * Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma))

            const paddedIndex = (y * requiredBytesPerRow / 4) + x * 4; // Adjust the index for padding
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

function copyTridiagXDataToTexture(calc_constants, bathy2D, device, coefMatx) {
    // copy Tridiag coef into coefMatx

    // due to the way js / webGPU works, we will need to structure our input data into a 1D array, and then place into a buffer, to be copied to a texture
    // awesomely, the copy function requires that the buffer has a row size (in bytes) that is a multiple of 256
    // this will generally not be the case, so the 1D array that will go into the buffer must be padded so that there is the 256 multiple

    const actualBytesPerRow = calc_constants.WIDTH * 4 * 4; // 4 channels and 4 bytes per float
    const requiredBytesPerRow = Math.ceil(actualBytesPerRow / 256) * 256;
    const paddedFlatData = new Float32Array(calc_constants.HEIGHT * requiredBytesPerRow / 4);

    let dx = calc_constants.dx;
    let Bcoef = calc_constants.Bcoef;

    for (let y = 0; y < calc_constants.HEIGHT; y++) {
        for (let x = 0; x < calc_constants.WIDTH; x++) {

            var a, b, c;
            var depth_here, depth_plus, depth_minus, d_dx;
            

            const paddedIndex = (y * requiredBytesPerRow / 4) + x * 4; // Adjust the index for padding

            if (x <= 2 || x >= calc_constants.WIDTH - 3 || bathy2D[x][y] > 0) { //also when near_dry
                a = 0.0;
                b = 1.0;
                c = 0.0;
            } else {

                // Retrieve the depths of the current point, the next point, and the previous point in x direction
                depth_here = -bathy2D[x][y];
                depth_plus = -bathy2D[x+1][y];
                depth_minus = -bathy2D[x-1][y];

                // Calculate the first derivative of the depth
                d_dx = (depth_plus - depth_minus) / (2.0 * dx);

                // Calculate coefficients based on the depth and its derivative
                a =  depth_here * d_dx / (6.0 * dx) - (Bcoef + 1.0 / 3.0) * depth_here * depth_here / (dx * dx);
                b = 1.0 + 2.0 * (Bcoef + 1.0 / 3.0) * depth_here * depth_here / (dx * dx);
                c = -depth_here * d_dx / (6.0 * dx) - (Bcoef + 1.0 / 3.0) * depth_here * depth_here / (dx * dx);
            }

            paddedFlatData[paddedIndex] = a;  // red
            paddedFlatData[paddedIndex + 1] = b;  // green
            paddedFlatData[paddedIndex + 2] = c;  // blue
            paddedFlatData[paddedIndex + 3] = 0.0;  // alpha

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
        texture: coefMatx
    }, {
        width: calc_constants.WIDTH,
        height: calc_constants.HEIGHT,
        depthOrArrayLayers: 1
    });
    device.queue.submit([commandEncoder.finish()]);
}

function copyTridiagYDataToTexture(calc_constants, bathy2D, device, coefMaty) {
    // copy Tridiag coef into coefMatx

    // due to the way js / webGPU works, we will need to structure our input data into a 1D array, and then place into a buffer, to be copied to a texture
    // awesomely, the copy function requires that the buffer has a row size (in bytes) that is a multiple of 256
    // this will generally not be the case, so the 1D array that will go into the buffer must be padded so that there is the 256 multiple

    const actualBytesPerRow = calc_constants.WIDTH * 4 * 4; // 4 channels and 4 bytes per float
    const requiredBytesPerRow = Math.ceil(actualBytesPerRow / 256) * 256;
    const paddedFlatData = new Float32Array(calc_constants.HEIGHT * requiredBytesPerRow / 4);

    let dy = calc_constants.dx;
    let Bcoef = calc_constants.Bcoef;

    for (let y = 0; y < calc_constants.HEIGHT; y++) {
        for (let x = 0; x < calc_constants.WIDTH; x++) {

            var a, b, c;
            var depth_here, depth_plus, depth_minus, d_dy;


            const paddedIndex = (y * requiredBytesPerRow / 4) + x * 4; // Adjust the index for padding

            if (y <= 2 || y >= calc_constants.HEIGHT - 3 || bathy2D[x][y] > 0) { //also when near_dry
                a = 0.0;
                b = 1.0;
                c = 0.0;
            } else {

                // Retrieve the depths of the current point, the next point, and the previous point in x direction
                depth_here = -bathy2D[x][y];
                depth_plus = -bathy2D[x][y+1];
                depth_minus = -bathy2D[x][y-1];

                // Calculate the first derivative of the depth
                d_dy = (depth_plus - depth_minus) / (2.0 * dy);

                // Calculate coefficients based on the depth and its derivative
                a = depth_here * d_dy / (6.0 * dy) - (Bcoef + 1.0 / 3.0) * depth_here * depth_here / (dy * dy);
                b = 1.0 + 2.0 * (Bcoef + 1.0 / 3.0) * depth_here * depth_here / (dy * dy);
                c = -depth_here * d_dy / (6.0 * dy) - (Bcoef + 1.0 / 3.0) * depth_here * depth_here / (dy * dy);
            }

            paddedFlatData[paddedIndex] = a;  // red
            paddedFlatData[paddedIndex + 1] = b;  // green
            paddedFlatData[paddedIndex + 2] = c;  // blue
            paddedFlatData[paddedIndex + 3] = 0.0;  // alpha

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
        texture: coefMaty
    }, {
        width: calc_constants.WIDTH,
        height: calc_constants.HEIGHT,
        depthOrArrayLayers: 1
    });
    device.queue.submit([commandEncoder.finish()]);
}




export { copyBathyDataToTexture, copyWaveDataToTexture, copyInitialConditionDataToTexture, copyTridiagXDataToTexture, copyTridiagYDataToTexture };
