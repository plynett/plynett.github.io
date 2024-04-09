// Handler_Render.js

export function createRenderBindGroupLayout(device) {
    return device.createBindGroupLayout({
        entries: [
            {
                // 0th binding: A uniform buffer (for parameters like time, etc.)
                binding: 0,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, // This buffer is only visible to the fragment stage
                buffer: { type: 'uniform' }  // It's a uniform buffer
            },
            {
                // First binding: A texture that the fragment shader will sample from.
                binding: 1,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'rgba32float'
                }
            },
            {
                // Second binding: A texture that the fragment shader will sample from.
                binding: 2,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'rgba32float'
                }
            },
            {
                // 3rd binding: A texture that the fragment shader will sample from.
                binding: 3,
                visibility: GPUShaderStage.FRAGMENT,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'rgba32float'
                }
            },
            {
                // 4th binding: A sampler describing how the texture will be sampled.
                binding: 4,
                visibility: GPUShaderStage.FRAGMENT,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'rgba32float'
                }
            },
            {
                // 5th binding: A texture that the fragment shader will sample from.
                binding: 5,
                visibility: GPUShaderStage.FRAGMENT,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'rgba32float' 
                }
            },
            {
                // 6th binding: A texture that the fragment shader will sample from.
                binding: 6,
                visibility: GPUShaderStage.FRAGMENT,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'rgba32float'  
                }
            },
            {
                // 7th binding: A texture that the fragment shader will sample from.
                binding: 7,
                visibility: GPUShaderStage.FRAGMENT,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'rgba32float'  
                }
            },
            {
                // 9th binding: A texture that the fragment shader will sample from.
                binding: 8,
                visibility: GPUShaderStage.FRAGMENT,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'rgba32float' 
                }
            },
            {
                // 10th binding: A texture that the fragment shader will sample from.
                binding: 9,
                visibility: GPUShaderStage.FRAGMENT,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'rgba32float'  
                }
            },
            {
                // 11th binding: A texture that the fragment shader will sample from.
                binding: 10,
                visibility: GPUShaderStage.FRAGMENT,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'rgba32float'  
                }
            },
            {
                // 12th binding: A texture that the fragment shader will sample from.
                binding: 11,
                visibility: GPUShaderStage.FRAGMENT,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'bgra8unorm'  // imagedata for the google maps image
                }
            },
            {
                // 13th binding: A texture that the fragment shader will sample from.
                binding: 12,
                visibility: GPUShaderStage.FRAGMENT,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'bgra8unorm'  // imagedata for the google maps image
                }
            },
            {
                // 14th binding: A sampler describing how the texture will be sampled.
                binding: 13,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: {
                    type: 'non-filtering'  // Nearest-neighbor sampling (no interpolation)
                }
            },
            {
                // 15th binding: A texture that the fragment shader will sample from.
                binding: 14,
                visibility: GPUShaderStage.FRAGMENT,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'rgba32float'  
                }
            },
            {
                // 15th binding: A texture that the fragment shader will sample from.
                binding: 15,
                visibility: GPUShaderStage.FRAGMENT,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'rgba32float'  
                }
            },
        ]
    });
}


export function createRenderBindGroup(device, uniformBuffer, txState, txBottom, txMeans, txWaveHeight, txBaseline_WaveHeight, txBottomFriction, txNewState_Sed, erosion_Sed, depostion_Sed, txBotChange_Sed, txGoogleMap, txDraw, textureSampler, txTimeSeries_Locations, txBreaking) {
    return device.createBindGroup({
        layout: createRenderBindGroupLayout(device),
        entries: [
            {
                binding: 0,
                resource: {
                    buffer: uniformBuffer
                }
            },
            {
                binding: 1,
                resource: txState.createView()
            },
            {
                binding: 2,
                resource: txBottom.createView()
            },
            {
                binding: 3,
                resource: txMeans.createView()
            },
            {
                binding: 4,
                resource: txWaveHeight.createView()
            },
            {
                binding: 5,
                resource: txBaseline_WaveHeight.createView()
            },
            {
                binding: 6,
                resource: txBottomFriction.createView()
            },
            {
                binding: 7,
                resource: txNewState_Sed.createView()
            },
            {
                binding: 8,
                resource: erosion_Sed.createView()
            },
            {
                binding: 9,
                resource: depostion_Sed.createView()
            },
            {
                binding: 10,
                resource: txBotChange_Sed.createView()
            },
            {
                binding: 11,
                resource: txGoogleMap.createView()
            },
            {
                binding: 12,
                resource: txDraw.createView()
            },
            {
                binding: 13,
                resource: textureSampler
            },
            {
                binding: 14,
                resource: txTimeSeries_Locations.createView()
            },
            {
                binding: 15,
                resource: txBreaking.createView()
            },
        ]
    });
}

export async function update_colorbar(device, offscreenCanvas, ctx, calc_constants, txDraw) {
    // Set text styles
    ctx.font = '18px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // colorbar text
    ctx.fillStyle = '#D3D3D3'; // Light gray
    ctx.fillRect(calc_constants.CB_xstart - calc_constants.CB_xbuffer, offscreenCanvas.height-calc_constants.CB_ystart, offscreenCanvas.width - 2 * (calc_constants.CB_xstart - calc_constants.CB_xbuffer), calc_constants.CB_ystart);
    ctx.fillStyle = 'black'; // Text color, set to black for contrast

    const textMapping = {
        0: "Free Surface Elevation (m)",
        6: "Bathymetry/Topography (m)",
        15: "Bottom Friction Map",
        1: "Fluid Speed (m/s)",
        2: "East-West (x) Velocity (m/s)",
        3: "North-South (y) Velocity (m/s)",
        4: "Total Vertical Vorticity (m/s)",
        5: "Foam / Tracer Concentration",
        16: "Max Free Surface Elev (m)",
        7: "Mean Free Surface Elev (m)",
        8: "Mean Fluid Flux [Magn] (m^2/s)",
        9: "Mean Fluid Flux [E-W] (m^2/s)",
        10: "Mean Fluid Flux [N-S] (m^2/s)",
        12: "RMS Wave Height (m)",
        13: "Significant Wave Height (m)",
        14: "Difference from Baseline Hs (m)"
    };
    
    // Assuming calc_constants.surfaceToPlot is available and holds the current value
    const labelText = textMapping[calc_constants.surfaceToPlot];
    
    // Draw the text on the canvas at the desired position
    ctx.fillText(labelText, offscreenCanvas.width / 2, offscreenCanvas.height - calc_constants.CB_label_height);
    
    // colorbar line and tick marks
    const lineStartX = calc_constants.CB_xstart; // Starting X coordinate of the horizontal line
    const lineStartY = offscreenCanvas.height - calc_constants.CB_ystart; // Y coordinate of the horizontal line (and all tickmarks)
    const lineLength = calc_constants.CB_width; // Length of the horizontal line
    const tickMarkLength = 8; // Length of the tick marks, in pixels
    const N_ticks = 5; // Number of tick marks
    const tickInterval = lineLength / (N_ticks - 1); // Calculate interval between tick marks
    // Draw the horizontal line
    ctx.beginPath();
    ctx.moveTo(lineStartX, lineStartY);
    ctx.lineTo(lineStartX + lineLength, lineStartY);
    ctx.stroke();
    // Draw the tick marks
    for (let i = 0; i < N_ticks; i++) {
        const tickX = lineStartX + i * tickInterval; // Calculate X coordinate of each tick mark
        ctx.beginPath();
        ctx.moveTo(tickX, lineStartY);
        ctx.lineTo(tickX, lineStartY + tickMarkLength);
        ctx.stroke();
    }
    // add tick labels
    ctx.font = '14px Arial';
    ctx.textBaseline = 'top';
    let ticklabel_shift = 20;

    ctx.textAlign = 'left';
    ctx.fillText(calc_constants.colorVal_min, lineStartX, lineStartY-tickMarkLength+ticklabel_shift);
    ctx.textAlign = 'center';
    ctx.fillText(calc_constants.colorVal_min + (calc_constants.colorVal_max - calc_constants.colorVal_min)/(N_ticks-1), lineStartX + tickInterval, lineStartY-tickMarkLength+ticklabel_shift);
    ctx.fillText(calc_constants.colorVal_min + (N_ticks-2) * (calc_constants.colorVal_max - calc_constants.colorVal_min)/(N_ticks-1), lineStartX + (N_ticks-2) * tickInterval, lineStartY-tickMarkLength+ticklabel_shift);
    ctx.textAlign = 'right';
    ctx.fillText(calc_constants.colorVal_max, lineStartX+lineLength, lineStartY-tickMarkLength+ticklabel_shift);


    // Upload this canvas content as a WebGPU texture
    const imageBitmap = await createImageBitmap(offscreenCanvas);
    device.queue.copyExternalImageToTexture({source: imageBitmap}, {texture: txDraw}, [imageBitmap.width, imageBitmap.height]);
}
