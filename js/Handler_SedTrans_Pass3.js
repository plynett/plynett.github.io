// Handler_SedTrans_Pass3.js

export function create_SedTrans_Pass3_BindGroupLayout(device) {
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
                // 9th binding: A storage texture. The compute shader will write results into this texture.
                binding: 9,
                visibility: GPUShaderStage.COMPUTE,
                storageTexture: {
                    access: 'write-only',      // This texture is only for writing data
                    format: 'rgba32float',    // Data format: 32-bit floating point values for red, green, blue, and alpha channels
                    viewDimension: '2d'       // The texture is a 2D texture
                }
            },
            {
                // 10th binding: A storage texture. The compute shader will write results into this texture.
                binding: 10,
                visibility: GPUShaderStage.COMPUTE,
                storageTexture: {
                    access: 'write-only',      // This texture is only for writing data
                    format: 'rgba32float',    // Data format: 32-bit floating point values for red, green, blue, and alpha channels
                    viewDimension: '2d'       // The texture is a 2D texture
                }
            },
            {
                // 11th binding: A storage texture. The compute shader will write results into this texture.
                binding:11,
                visibility: GPUShaderStage.COMPUTE,
                storageTexture: {
                    access: 'write-only',      // This texture is only for writing data
                    format: 'rgba32float',    // Data format: 32-bit floating point values for red, green, blue, and alpha channels
                    viewDimension: '2d'       // The texture is a 2D texture
                }
            },
            {
                // 12th binding: A storage texture. The compute shader will write results into this texture.
                binding: 12,
                visibility: GPUShaderStage.COMPUTE,
                storageTexture: {
                    access: 'write-only',      // This texture is only for writing data
                    format: 'rgba32float',    // Data format: 32-bit floating point values for red, green, blue, and alpha channels
                    viewDimension: '2d'       // The texture is a 2D texture
                }
            },
            {
                // 13th binding: A texture that the fragment shader will sample from.
                binding: 13,
                visibility: GPUShaderStage.COMPUTE,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'rgba32float'
                }
            },
            {
                // 14th binding: A texture that the fragment shader will sample from.
                binding: 14,
                visibility: GPUShaderStage.COMPUTE,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'rgba32float'
                }
            },
            {
                // 15th binding: A texture that the fragment shader will sample from.
                binding: 15,
                visibility: GPUShaderStage.COMPUTE,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'rgba32float'
                }
            },
        ]
    });
}


export function create_SedTrans_Pass3_BindGroup(device, uniformBuffer, txState_Sed, txXFlux_Sed, txYFlux_Sed, oldGradients_Sed, oldOldGradients_Sed, predictedGradients_Sed, txBottom, txState, txNewState_Sed, dU_by_dt_Sed, erosion_Sed, depostion_Sed, txBreaking, txU, txV) {
    return device.createBindGroup({
        layout: create_SedTrans_Pass3_BindGroupLayout(device),
        entries: [
            {
                binding: 0,
                resource: {
                    buffer: uniformBuffer
                }
            },
            {
                binding: 1,
                resource: txState_Sed.createView() 
            },
            {
                binding: 2,
                resource: txXFlux_Sed.createView()
            },
            {
                binding: 3,
                resource: txYFlux_Sed.createView()
            },
            {
                binding: 4,
                resource: oldGradients_Sed.createView()
            },
            {
                binding: 5,
                resource: oldOldGradients_Sed.createView()
            },
            {
                binding: 6,
                resource: predictedGradients_Sed.createView()
            },
            {
                binding: 7,
                resource: txBottom.createView()
            },
            {
                binding: 8,
                resource: txState.createView()
            },
            {
                binding: 9,
                resource: txNewState_Sed.createView()
            },
            {
                binding: 10,
                resource: dU_by_dt_Sed.createView()
            },
            {
                binding: 11,
                resource: erosion_Sed.createView()
            },
            {
                binding: 12,
                resource: depostion_Sed.createView()
            },
            {
                binding: 13,
                resource: txBreaking.createView()
            },
            {
                binding: 14,
                resource: txU.createView()
            },
            {
                binding: 15,
                resource: txV.createView()
            },
        ]
    });
}