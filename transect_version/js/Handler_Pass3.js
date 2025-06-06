// Handler_Pass3.js

export function create_Pass3_BindGroupLayout(device) {
    return device.createBindGroupLayout({
        entries: [
            {
                // 0th binding: A uniform buffer (for parameters like time, etc.)
                binding: 0,
                visibility: GPUShaderStage.COMPUTE, // This buffer is only visible to the compute stage
                buffer: { type: 'uniform' }  // It's a uniform buffer
            },
            {
                // 1st binding: A texture that the fragment shader will sample from.
                binding: 1,
                visibility: GPUShaderStage.COMPUTE,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'rgba32float'
                }
            },
            {
                // 2nd binding: A texture that the fragment shader will sample from.
                binding: 2,
                visibility: GPUShaderStage.COMPUTE,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'rgba32float'
                }
            },
            {
                // 3rd binding: A texture that the fragment shader will sample from.
                binding: 3,
                visibility: GPUShaderStage.COMPUTE,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'rgba32float',
                    viewDimension: '3d'
                }
            },
            {
                // 4th binding: A texture that the fragment shader will sample from.
                binding: 4,
                visibility: GPUShaderStage.COMPUTE,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'rgba32float'
                }
            },
            {
                // 5th binding: A texture that the fragment shader will sample from.
                binding: 5,
                visibility: GPUShaderStage.COMPUTE,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'rgba32float'
                }
            },
            {
                // 6th binding: A texture that the fragment shader will sample from.
                binding: 6,
                visibility: GPUShaderStage.COMPUTE,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'rgba32float'
                }
            },
            {
                // 7th binding: A texture that the fragment shader will sample from.
                binding: 7,
                visibility: GPUShaderStage.COMPUTE,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'rgba32float'
                }
            },
            {
                // 8th binding: A texture that the fragment shader will sample from.
                binding: 8,
                visibility: GPUShaderStage.COMPUTE,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'rgba32float'
                }
            },
            {
                // 9th binding: A texture that the fragment shader will sample from.
                binding: 9,
                visibility: GPUShaderStage.COMPUTE,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'rgba32float'
                }
            },
            {
                // 10th binding: A texture that the fragment shader will sample from.
                binding: 10,
                visibility: GPUShaderStage.COMPUTE,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'rgba32float'
                }
            },
            {
                // 11th binding: A texture that the fragment shader will sample from.
                binding: 11,
                visibility: GPUShaderStage.COMPUTE,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'rgba32float'
                }
            },
            {
                // 12th binding: A texture that the fragment shader will sample from.
                binding: 12,
                visibility: GPUShaderStage.COMPUTE,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'rgba32float'
                }
            },
            {
                // 13th binding: A storage texture. The compute shader will write results into this texture.
                binding: 13,
                visibility: GPUShaderStage.COMPUTE,
                storageTexture: {
                    access: 'write-only',      // This texture is only for writing data
                    format: 'rgba32float',    // Data format: 32-bit floating point values for red, green, blue, and alpha channels
                    viewDimension: '2d'       // The texture is a 2D texture
                }
            },
            {
                // 14th binding: A storage texture. The compute shader will write results into this texture.
                binding: 14,
                visibility: GPUShaderStage.COMPUTE,
                storageTexture: {
                    access: 'write-only',      // This texture is only for writing data
                    format: 'rgba32float',    // Data format: 32-bit floating point values for red, green, blue, and alpha channels
                    viewDimension: '2d'       // The texture is a 2D texture
                }
            },
            {
                // 15th binding: A storage texture. The compute shader will write results into this texture.
                binding: 15,
                visibility: GPUShaderStage.COMPUTE,
                storageTexture: {
                    access: 'write-only',      // This texture is only for writing data
                    format: 'rgba32float',    // Data format: 32-bit floating point values for red, green, blue, and alpha channels
                    viewDimension: '2d'       // The texture is a 2D texture
                }
            },
            {
                // 16th binding: A storage texture. The compute shader will write results into this texture.
                binding: 16,
                visibility: GPUShaderStage.COMPUTE,
                storageTexture: {
                    access: 'write-only',      // This texture is only for writing data
                    format: 'rgba32float',    // Data format: 32-bit floating point values for red, green, blue, and alpha channels
                    viewDimension: '2d'       // The texture is a 2D texture
                }
            },
            {
                // 17th binding: A texture that the fragment shader will sample from.
                binding: 17,
                visibility: GPUShaderStage.COMPUTE,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'rgba32float'
                }
            },
            {
                // 18th binding: A texture that the fragment shader will sample from.
                binding: 18,
                visibility: GPUShaderStage.COMPUTE,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'rgba32float'
                }
            },
            {
                // 19th binding: A texture that the fragment shader will sample from.
                binding: 19,
                visibility: GPUShaderStage.COMPUTE,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'rgba32float'
                }
            },
            {
                // 20th binding: A texture that the fragment shader will sample from.
                binding: 20,
                visibility: GPUShaderStage.COMPUTE,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'rgba32float'
                }
            }
        ]
    });
}


export function create_Pass3_BindGroup(device, uniformBuffer, txState, txBottom, txCW_groupings, txXFlux, txYFlux, oldGradients, oldOldGradients, predictedGradients, F_G_star_oldGradients, F_G_star_oldOldGradients, txstateUVstar, txBoundaryForcing, txNewState, dU_by_dt, F_G_star, current_stateUVstar,txContSource,txBreaking, txDissipationFlux, txBottomFriction) {
    return device.createBindGroup({
        layout: create_Pass3_BindGroupLayout(device),
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
                resource: txCW_groupings.createView({dimension: '3d',})
            },
            {
                binding: 4,
                resource: txXFlux.createView()
            },
            {
                binding: 5,
                resource: txYFlux.createView()
            },
            {
                binding: 6,
                resource: oldGradients.createView()
            },
            {
                binding: 7,
                resource: oldOldGradients.createView()
            },
            {
                binding: 8,
                resource: predictedGradients.createView()
            },
            {
                binding: 9,
                resource: F_G_star_oldGradients.createView()
            },
            {
                binding: 10,
                resource: F_G_star_oldOldGradients.createView()
            },
            {
                binding: 11,
                resource: txstateUVstar.createView()
            },
            {
                binding: 12,
                resource: txBoundaryForcing.createView()
            },
            {
                binding: 13,
                resource: txNewState.createView()
            },
            {
                binding: 14,
                resource: dU_by_dt.createView()
            },
            {
                binding: 15,
                resource: F_G_star.createView()
            },
            {
                binding: 16,
                resource: current_stateUVstar.createView()
            },
            {
                binding: 17,
                resource: txBottomFriction.createView()
            },
            {
                binding: 18,
                resource: txBreaking.createView()
            },
            {
                binding: 19,
                resource: txDissipationFlux.createView()
            },
            {
                binding: 20,
                resource: txContSource.createView()
            },
        ]
    });
}  



export function create_Pass3A_Coulwave_BindGroupLayout(device) {
    return device.createBindGroupLayout({
        entries: [
            {
                // 0th binding: A uniform buffer (for parameters like time, etc.)
                binding: 0,
                visibility: GPUShaderStage.COMPUTE, // This buffer is only visible to the compute stage
                buffer: { type: 'uniform' }  // It's a uniform buffer
            },
            {
                // 1st binding: A texture that the fragment shader will sample from.
                binding: 1,
                visibility: GPUShaderStage.COMPUTE,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'rgba32float'
                }
            },
            {
                // 2nd binding: A texture that the fragment shader will sample from.
                binding: 2,
                visibility: GPUShaderStage.COMPUTE,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'rgba32float'
                }
            },
            {
                // 3rd binding: A storage texture. The compute shader will write results into this texture.
                binding: 3,
                visibility: GPUShaderStage.COMPUTE,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'rgba32float'
                }
            },
            {
                // 4th binding: A texture that the fragment shader will sample from.
                binding: 4,
                visibility: GPUShaderStage.COMPUTE,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'rgba32float'
                }
            },
            {
                // 5th binding: A texture that the fragment shader will sample from.
                binding: 5,
                visibility: GPUShaderStage.COMPUTE,
                storageTexture: {
                    access: 'write-only',      // This texture is only for writing data
                    format: 'rgba32float',    // Data format: 32-bit floating point values for red, green, blue, and alpha channels
                    viewDimension: '2d'       // The texture is a 2D texture
                }
            },
            {
                // 6th binding: A storage texture. The compute shader will write results into this texture.
                binding: 6,
                visibility: GPUShaderStage.COMPUTE,
                storageTexture: {
                    access: 'write-only',      // This texture is only for writing data
                    format: 'rgba32float',    // Data format: 32-bit floating point values for red, green, blue, and alpha channels
                    viewDimension: '2d'       // The texture is a 2D texture
                }
            },
            {
                // 6th binding: A storage texture. The compute shader will write results into this texture.
                binding: 7,
                visibility: GPUShaderStage.COMPUTE,
                storageTexture: {
                    access: 'write-only',      // This texture is only for writing data
                    format: 'rgba32float',    // Data format: 32-bit floating point values for red, green, blue, and alpha channels
                    viewDimension: '2d'       // The texture is a 2D texture
                }
            }
        ]
    });
}


export function create_Pass3A_Coulwave_BindGroup(device, uniformBuffer, txState, txBottom, txU, txV, txModelVelocities, txCW_zalpha, txCW_uvhuhv) {
    return device.createBindGroup({
        layout: create_Pass3A_Coulwave_BindGroupLayout(device),
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
                resource: txU.createView()
            },
            {
                binding: 4,
                resource: txV.createView()
            },
            {
                binding: 5,
                resource: txModelVelocities.createView()
            },
            {
                binding: 6,
                resource: txCW_zalpha.createView()
            },
            {
                binding: 7,
                resource: txCW_uvhuhv.createView()
            },
        ]
    });
}





export function create_Pass3B_Coulwave_BindGroupLayout(device) {
    return device.createBindGroupLayout({
        entries: [
            {
                // 0th binding: A uniform buffer (for parameters like time, etc.)
                binding: 0,
                visibility: GPUShaderStage.COMPUTE, // This buffer is only visible to the compute stage
                buffer: { type: 'uniform' }  // It's a uniform buffer
            },
            {
                // 1st binding: A texture that the fragment shader will sample from.
                binding: 1,
                visibility: GPUShaderStage.COMPUTE,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'rgba32float'
                }
            },
            {
                // 2nd binding: A texture that the fragment shader will sample from.
                binding: 2,
                visibility: GPUShaderStage.COMPUTE,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'rgba32float'
                }
            },
            {
                // 3rd binding: A storage texture. The compute shader will write results into this texture.
                binding: 3,
                visibility: GPUShaderStage.COMPUTE,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'rgba32float'
                }
            },
            {
                // 4th binding: A texture that the fragment shader will sample from.
                binding: 4,
                visibility: GPUShaderStage.COMPUTE,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'rgba32float'
                }
            },
            {
                // 5th binding: A texture that the fragment shader will sample from.
                binding: 5,
                visibility: GPUShaderStage.COMPUTE,
                storageTexture: {
                    access: 'write-only',      // This texture is only for writing data
                    format: 'rgba32float',    // Data format: 32-bit floating point values for red, green, blue, and alpha channels
                    viewDimension: '2d'       // The texture is a 2D texture
                }
            },
            {
                // 6th binding: A storage texture. The compute shader will write results into this texture.
                binding: 6,
                visibility: GPUShaderStage.COMPUTE,
                storageTexture: {
                    access: 'write-only',      // This texture is only for writing data
                    format: 'rgba32float',    // Data format: 32-bit floating point values for red, green, blue, and alpha channels
                    viewDimension: '2d'       // The texture is a 2D texture
                }
            },
            {
                // 7th binding: A texture that the fragment shader will sample from.
                binding: 7,
                visibility: GPUShaderStage.COMPUTE,
                storageTexture: {
                    access: 'write-only',      // This texture is only for writing data
                    format: 'rgba32float',    // Data format: 32-bit floating point values for red, green, blue, and alpha channels
                    viewDimension: '2d'       // The texture is a 2D texture
                }
            },
            {
                // 8th binding: A storage texture. The compute shader will write results into this texture.
                binding: 8,
                visibility: GPUShaderStage.COMPUTE,
                storageTexture: {
                    access: 'write-only',      // This texture is only for writing data
                    format: 'rgba32float',    // Data format: 32-bit floating point values for red, green, blue, and alpha channels
                    viewDimension: '2d'       // The texture is a 2D texture
                }
            }, 
            {
                // 9th binding: A texture that the fragment shader will sample from.
                binding: 9,
                visibility: GPUShaderStage.COMPUTE,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'rgba32float'
                }
            },
        ]
    });
}


export function create_Pass3B_Coulwave_BindGroup(device, uniformBuffer, txState, txBottom, txCW_uvhuhv, txCW_zalpha, txCW_STval, txCW_STgrad, txCW_Eterms, txCW_FGterms, dU_by_dt) {
    return device.createBindGroup({
        layout: create_Pass3B_Coulwave_BindGroupLayout(device),
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
                resource: txCW_uvhuhv.createView()
            },
            {
                binding: 4,
                resource: txCW_zalpha.createView()
            },
            {
                binding: 5,
                resource: txCW_STval.createView()
            },
            {
                binding: 6,
                resource: txCW_STgrad.createView()
            },
            {
                binding: 7,
                resource: txCW_Eterms.createView()
            },
            {
                binding: 8,
                resource: txCW_FGterms.createView()
            },
            {
                binding: 9,
                resource: dU_by_dt.createView()
            },
        ]
    });
}

