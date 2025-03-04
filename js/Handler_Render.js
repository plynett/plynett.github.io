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
            {
                // 16th binding: A texture that the fragment shader will sample from.
                binding: 16,
                visibility: GPUShaderStage.FRAGMENT,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'bgra8unorm',  // imagedata for the google maps image
                    viewDimension: '2d-array'
                }
            },
        ]
    });
}


export function createRenderBindGroup(device, uniformBuffer, txState, txBottom, txMeans, txWaveHeight, txBaseline_WaveHeight, txBottomFriction, txNewState_Sed, erosion_Sed, txBotChange_Sed, txDesignComponents, txOverlayMap, txDraw, textureSampler, txTimeSeries_Locations, txBreaking, txSamplePNGs) {
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
                resource: txBotChange_Sed.createView()
            },
            {
                binding: 10,
                resource: txDesignComponents.createView()
            },
            {
                binding: 11,
                resource: txOverlayMap.createView()
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
            {
                binding: 16,
                resource: txSamplePNGs.createView()
            },
        ]
    });
}


export async function update_colorbar(device, offscreenCanvas, ctx, calc_constants, txDraw, logo_left, logo_right) {
    if(calc_constants.ShowLogos == 0){
        // Load the logo image
        ctx.drawImage(logo_left, 0, 0, logo_left.width, logo_left.height);  // upper left

        const xPosition = offscreenCanvas.width - logo_right.width;
        ctx.drawImage(logo_right, xPosition, 0, logo_right.width, logo_right.height);   // upper right 
    }

    // Set text styles
    if(calc_constants.WIDTH > 1000) {
        ctx.font = '22px Arial';
    } else if(calc_constants.WIDTH > 800) {
        ctx.font = '20px Arial';
    } else if(calc_constants.WIDTH > 600) {
        ctx.font = '14px Arial';
    } else if(calc_constants.WIDTH > 400) {
        ctx.font = '12px Arial';
    } else {
        ctx.font = '10px Arial';
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Colorbar text and background
    ctx.fillStyle = '#D3D3D3'; // Light gray
    ctx.fillRect(calc_constants.CB_xstart - calc_constants.CB_xbuffer, offscreenCanvas.height - calc_constants.CB_ystart, offscreenCanvas.width - 2 * (calc_constants.CB_xstart - calc_constants.CB_xbuffer), calc_constants.CB_ystart);
    ctx.fillStyle = 'black'; // Text color, set to black for contrast

    // Mapping from surface ID to label text
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
        14: "Difference from Baseline Hs (m)",
        21: "Depth Change (m) due to Sed Trans",
        17: "Sediment Class 1 Concentration",
        18: "Sediment Class 1 Erosion Rate",
        22: "Design Component Map",
    };

    const labelText = textMapping[calc_constants.surfaceToPlot];
    ctx.fillText(labelText, offscreenCanvas.width / 2, offscreenCanvas.height - calc_constants.CB_label_height);

    // Colorbar line and tick marks configuration
    const lineStartX = calc_constants.CB_xstart;
    const lineStartY = offscreenCanvas.height - calc_constants.CB_ystart;
    const lineLength = calc_constants.CB_width;
    const tickMarkLength = 8;
    const N_ticks = 5;
    const tickInterval = lineLength / (N_ticks - 1);

    // Draw the line and tick marks
    ctx.beginPath();
    ctx.moveTo(lineStartX, lineStartY);
    ctx.lineTo(lineStartX + lineLength, lineStartY);
    ctx.stroke();
    for (let i = 0; i < N_ticks; i++) {
        const tickX = lineStartX + i * tickInterval;
        ctx.beginPath();
        ctx.moveTo(tickX, lineStartY);
        ctx.lineTo(tickX, lineStartY + tickMarkLength);
        ctx.stroke();
    }

    // Add tick labels
    if(calc_constants.WIDTH > 1000) {
        ctx.font = '18px Arial';
    } else if(calc_constants.WIDTH > 800) {
        ctx.font = '16px Arial';
    } else if(calc_constants.WIDTH > 600) {
        ctx.font = '12px Arial';
    } else if(calc_constants.WIDTH > 400) {
        ctx.font = '10px Arial';
    } else {
        ctx.font = '8px Arial';
    }

    ctx.textBaseline = 'top';
    let ticklabel_shift = 20;

    ctx.textAlign = 'left';
    let disp_val = calc_constants.colorVal_min;
    ctx.fillText(disp_val.toFixed(2), lineStartX, lineStartY-tickMarkLength+ticklabel_shift);

    ctx.textAlign = 'center';
    disp_val = calc_constants.colorVal_min + (calc_constants.colorVal_max - calc_constants.colorVal_min)/(N_ticks-1);
    ctx.fillText(disp_val.toFixed(2), lineStartX + tickInterval, lineStartY-tickMarkLength+ticklabel_shift);
    
    disp_val = calc_constants.colorVal_min + (N_ticks-2) * (calc_constants.colorVal_max - calc_constants.colorVal_min)/(N_ticks-1);
    ctx.fillText(disp_val.toFixed(2), lineStartX + (N_ticks-2) * tickInterval, lineStartY-tickMarkLength+ticklabel_shift);

    ctx.textAlign = 'right';
    disp_val = calc_constants.colorVal_max;
    ctx.fillText(disp_val.toFixed(2), lineStartX + lineLength, lineStartY-tickMarkLength+ticklabel_shift);

    // Upload the canvas content as a WebGPU texture
    const imageBitmap = await createImageBitmap(offscreenCanvas);
    device.queue.copyExternalImageToTexture({source: imageBitmap}, {texture: txDraw}, [imageBitmap.width, imageBitmap.height]);
}

// Helper function to load an image
export function loadImage(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = (e) => reject(e);
        img.src = url;
    });
}
