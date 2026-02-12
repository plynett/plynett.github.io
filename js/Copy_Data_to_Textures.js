// Copy_Data_to_Textures.js

function copyBathyDataToTexture(calc_constants, bathy2D, device, txBottom) {
    // copy bathy2D into txBottom

    // due to the way js / webGPU works, we will need to structure our input data into a 1D array, and then place into a buffer, to be copied to a texture
    // awesomely, the copy function requires that the buffer has a row size (in bytes) that is a multiple of 256
    // this will generally not be the case, so the 1D array that will go into the buffer must be padded so that there is the 256 multiple

    const actualBytesPerRow = calc_constants.WIDTH * 4 * 4; // 4 channels and 4 bytes per float
    const requiredBytesPerRow = Math.ceil(actualBytesPerRow / 256) * 256;
    const paddedFlatData = new Float32Array(calc_constants.HEIGHT * requiredBytesPerRow / 4);

    // remove single point islands
    let change_point = 1.;
    let new_count = 0.;
    let old_count = 0.;
    while (change_point > 0.5)  {
        old_count = new_count;
        new_count = 0.;
        for (let y = 1; y < calc_constants.HEIGHT-1; y++) {
            for (let x = 1; x < calc_constants.WIDTH-1; x++) {
                if (bathy2D[x][y] >= 0.0){  // dry point
                    if (bathy2D[x+1][y] <= 0.0 && bathy2D[x-1][y] <= 0.0 && bathy2D[x][y+1] <= 0.0 && bathy2D[x][y-1] <= 0.0 ){
                        bathy2D[x][y] = 0.0;
                        new_count = new_count + 1.0;
                    }
                }
            }
        }
        change_point = new_count - old_count;
        if (change_point > 0.5 ){
            console.log("Flattened ", change_point, " single point islands from initial bathy/topo");
        }
    }

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

     //       if (y < 4 || x < 4 || y > calc_constants.HEIGHT - 3 || x > calc_constants.WIDTH - 3) {
     //           paddedFlatData[paddedIndex + 3] = -99;
     //       }
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
    buffer.destroy();

    return paddedFlatData;
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
    buffer.destroy();
}


// Copies calc_constants.locationOfTimeSeries[] (x,y indices) into txTimeSeries_Locations.
function copyTSlocsToTexture(calc_constants, device, txTimeSeries_Locations) {
  const n = calc_constants.maxNumberOfTimeSeries | 0;

  // RGBA32F per “pixel”: 4 floats = 16 bytes.
  // due to the way js / webGPU works, we will need to structure our input data into a 1D array, and then place into a buffer, to be copied to a texture
  // awesomely, the copy function requires that the buffer has a row size (in bytes) that is a multiple of 256
  // this will generally not be the case, so the 1D array that will go into the buffer must be padded so that there is the 256 multiple

  const bytesPerPixel = 16;
  const actualBytesPerRow = n * bytesPerPixel;

  // WebGPU requires bytesPerRow to be a multiple of 256 for buffer->texture copies.
  const bytesPerRow = ((actualBytesPerRow + 255) & ~255) >>> 0;

  // Float count for one row at padded bytesPerRow.
  const rowFloats = bytesPerRow >>> 2;
  const data = new Float32Array(rowFloats); // zero initialized; padding stays 0

  const invDx = 1.0 / calc_constants.dx;
  const invDy = 1.0 / calc_constants.dy;
  const locs = calc_constants.locationOfTimeSeries;

  for (let i = 0; i < n; i++) {
    const o = i << 2; // i * 4
    const p = locs[i];
    data[o]     = Math.round(p.xts * invDx);
    data[o + 1] = Math.round(p.yts * invDy);
    // data[o + 2] and data[o + 3] remain 0
  }

  const buffer = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  });

  // No mapping. Writes from CPU to GPU staging buffer directly.
  device.queue.writeBuffer(buffer, 0, data.buffer, data.byteOffset, data.byteLength);

  const encoder = device.createCommandEncoder();
  encoder.copyBufferToTexture(
    { buffer, bytesPerRow, rowsPerImage: 1 },
    { texture: txTimeSeries_Locations },
    { width: n, height: 1, depthOrArrayLayers: 1 }
  );

  device.queue.submit([encoder.finish()]);
  buffer.destroy();
}



function copyInitialConditionDataToTexture(calc_constants, device, initialState, txState, writeStateFlag) {
    // create and place initial condition into txState

    // due to the way js / webGPU works, we will need to structure our input data into a 1D array, and then place into a buffer, to be copied to a texture
    // awesomely, the copy function requires that the buffer has a row size (in bytes) that is a multiple of 256
    // this will generally not be the case, so the 1D array that will go into the buffer must be padded so that there is the 256 multiple

    const actualBytesPerRow = calc_constants.WIDTH * 4 * 4; // 4 channels and 4 bytes per float
    const requiredBytesPerRow = Math.ceil(actualBytesPerRow / 256) * 256;
    const paddedFlatData = new Float32Array(calc_constants.HEIGHT * requiredBytesPerRow / 4);

    for (let y = 0; y < calc_constants.HEIGHT; y++) {
        for (let x = 0; x < calc_constants.WIDTH; x++) {

             // Testing IC Calculate the differences between the current coordinates and the center
            //let dx = x - calc_constants.WIDTH / 10.;
            //let dy = y - calc_constants.HEIGHT / 3.;
            //let sigma = 24.0;

            var eta = 0.; // * Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
            var u = 0.; 
            var v = 0.; 
            if (writeStateFlag == 1){
                eta = initialState[x][y]
            }
            else if (writeStateFlag == 2){
                u = initialState[x][y]
            }   
            else if (writeStateFlag == 3){
                v = initialState[x][y]
            }

            const paddedIndex = (y * requiredBytesPerRow / 4) + x * 4; // Adjust the index for padding
            paddedFlatData[paddedIndex] = eta;  // red
            paddedFlatData[paddedIndex + 1] = u;  // green
            paddedFlatData[paddedIndex + 2] = v;  // blue
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
        texture: txState
    }, {
        width: calc_constants.WIDTH,
        height: calc_constants.HEIGHT,
        depthOrArrayLayers: 1
    });
    device.queue.submit([commandEncoder.finish()]);
    buffer.destroy();

}

function copyConstantValueToTexture(calc_constants, device, txState, constantvalue1,constantvalue2,constantvalue3,constantvalue4) {
    // create and place initial condition into txState

    // due to the way js / webGPU works, we will need to structure our input data into a 1D array, and then place into a buffer, to be copied to a texture
    // awesomely, the copy function requires that the buffer has a row size (in bytes) that is a multiple of 256
    // this will generally not be the case, so the 1D array that will go into the buffer must be padded so that there is the 256 multiple

    const actualBytesPerRow = calc_constants.WIDTH * 4 * 4; // 4 channels and 4 bytes per float
    const requiredBytesPerRow = Math.ceil(actualBytesPerRow / 256) * 256;
    const paddedFlatData = new Float32Array(calc_constants.HEIGHT * requiredBytesPerRow / 4);

    for (let y = 0; y < calc_constants.HEIGHT; y++) {
        for (let x = 0; x < calc_constants.WIDTH; x++) {

            const paddedIndex = (y * requiredBytesPerRow / 4) + x * 4; // Adjust the index for padding
            paddedFlatData[paddedIndex] = constantvalue1;  // red
            paddedFlatData[paddedIndex + 1] = constantvalue2;  // green
            paddedFlatData[paddedIndex + 2] = constantvalue3;  // blue
            paddedFlatData[paddedIndex + 3] = constantvalue4;  // alpha
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
    buffer.destroy();

}


function copyTridiagXDataToTexture(calc_constants, bathy2D, device, coefMatx, bathy2Dvec) {
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
            let neardry = bathy2Dvec[paddedIndex + 3];

            if (x <= 2 || x >= calc_constants.WIDTH - 3 || neardry < 0) { //also when near_dry
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

                if (calc_constants.NLSW_or_Bous == 2) {
                    // COULWAVE equations
                    let z_loc = 0.0;
                    let zx_loc = 0.0;
                    let za = calc_constants.Bous_alpha * depth_here;
                    let za2 = za * za;
                    let zloc2 = z_loc * z_loc;
                    a =   (za2-zloc2)/2.*calc_constants.one_over_d2x + (za-z_loc)*depth_minus*calc_constants.one_over_d2x + zx_loc*(z_loc+depth_minus)/dx/2.;
                    b = 1-(za2-zloc2)*calc_constants.one_over_d2x  - 2*(za-z_loc)*depth_here*calc_constants.one_over_d2x;
                    c =   (za2-zloc2)/2.*calc_constants.one_over_d2x + (za-z_loc)*depth_plus*calc_constants.one_over_d2x  - zx_loc*(z_loc+depth_plus)/dx/2.;
                }
                else {  // regular Boussinesq
                    // Calculate coefficients based on the depth and its derivative
                    a =  depth_here * d_dx / (6.0 * dx) - (Bcoef + 1.0 / 3.0) * depth_here * depth_here / (dx * dx);
                    b = 1.0 + 2.0 * (Bcoef + 1.0 / 3.0) * depth_here * depth_here / (dx * dx);
                    c = -depth_here * d_dx / (6.0 * dx) - (Bcoef + 1.0 / 3.0) * depth_here * depth_here / (dx * dx);
                }
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
    buffer.destroy();
}

function copyTridiagYDataToTexture(calc_constants, bathy2D, device, coefMaty, bathy2Dvec) {
    // copy Tridiag coef into coefMatx

    // due to the way js / webGPU works, we will need to structure our input data into a 1D array, and then place into a buffer, to be copied to a texture
    // awesomely, the copy function requires that the buffer has a row size (in bytes) that is a multiple of 256
    // this will generally not be the case, so the 1D array that will go into the buffer must be padded so that there is the 256 multiple

    const actualBytesPerRow = calc_constants.WIDTH * 4 * 4; // 4 channels and 4 bytes per float
    const requiredBytesPerRow = Math.ceil(actualBytesPerRow / 256) * 256;
    const paddedFlatData = new Float32Array(calc_constants.HEIGHT * requiredBytesPerRow / 4);

    let dy = calc_constants.dy;
    let Bcoef = calc_constants.Bcoef;

    for (let y = 0; y < calc_constants.HEIGHT; y++) {
        for (let x = 0; x < calc_constants.WIDTH; x++) {

            var a, b, c;
            var depth_here, depth_plus, depth_minus, d_dy;


            const paddedIndex = (y * requiredBytesPerRow / 4) + x * 4; // Adjust the index for padding
            let neardry = bathy2Dvec[paddedIndex + 3];

            if (y <= 2 || y >= calc_constants.HEIGHT - 3 || neardry < 0) { //also when near_dry
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

                if (calc_constants.NLSW_or_Bous == 2) {
                    // COULWAVE equations
                    let z_loc = 0.0;
                    let zy_loc = 0.0;
                    let za = calc_constants.Bous_alpha * depth_here;
                    let za2 = za * za;
                    let zloc2 = z_loc * z_loc;
                    a =   (za2-zloc2)/2.*calc_constants.one_over_d2y + (za-z_loc)*depth_minus*calc_constants.one_over_d2y + zy_loc*(z_loc+depth_minus)/dy/2.;
                    b = 1-(za2-zloc2)*calc_constants.one_over_d2y  - 2*(za-z_loc)*depth_here*calc_constants.one_over_d2y;
                    c =   (za2-zloc2)/2.*calc_constants.one_over_d2y + (za-z_loc)*depth_plus*calc_constants.one_over_d2y  - zy_loc*(z_loc+depth_plus)/dy/2.;
                }
                else {  // regular Boussinesq                
                    // Calculate coefficients based on the depth and its derivative
                    a =  depth_here * d_dy / (6.0 * dy) - (Bcoef + 1.0 / 3.0) * depth_here * depth_here / (dy * dy);
                    b = 1.0 + 2.0 * (Bcoef + 1.0 / 3.0) * depth_here * depth_here / (dy * dy);
                    c = -depth_here * d_dy / (6.0 * dy) - (Bcoef + 1.0 / 3.0) * depth_here * depth_here / (dy * dy);
                }
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
    buffer.destroy();
}

// This function will copy the ImageBitmap data directly into the texture.
function copyImageBitmapToTexture(device, imageBitmap, texture, depth = -1) {
    // Prepare the destination parameters based on whether the texture is 2D or 3D.
    let destination = { texture: texture };

    // If a depth is provided and it is a 3D texture, specify the origin with depth.
    if (depth >= 0) {
        destination.origin = { z: depth };
    }

    // Now that the image is loaded, you can copy it to the texture.
    device.queue.copyExternalImageToTexture(
        { source: imageBitmap },
        destination,
        { width: imageBitmap.width, height: imageBitmap.height }
    );
}


// This function will copy the 2D data directly into the 3D texture.
export function copy2DDataTo3DTexture(device, src2D, dst3D, dstLayer, width, height) {
  // 1) create an encoder to record GPU commands
  const encoder = device.createCommandEncoder();

  // 2) record the texture‐to‐texture copy
  encoder.copyTextureToTexture(
    // source descriptor
    {
      texture:  src2D,
      mipLevel: 0,
      origin:   { x: 0, y: 0, z: 0 },
    },
    // destination descriptor
    {
      texture:  dst3D,
      mipLevel: 0,
      origin:   { x: 0, y: 0, z: dstLayer },
    },
    // copy size (one full slice)
    {
      width,
      height,
      depthOrArrayLayers: 1,
    }
  );

  // 3) finish and submit
  const commandBuffer = encoder.finish();
  device.queue.submit([commandBuffer]);
}



export { copyBathyDataToTexture, copyWaveDataToTexture, copyTSlocsToTexture, copyInitialConditionDataToTexture, copyConstantValueToTexture, copyTridiagXDataToTexture, copyTridiagYDataToTexture, copyImageBitmapToTexture};
