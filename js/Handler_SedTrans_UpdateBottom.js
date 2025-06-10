// Handler_Tridiag.js

export function create_SedTrans_UpdateBottom_BindGroupLayout(device) {
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
                // 7th binding: A storage texture. The compute shader will write results into this texture.
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
            }
        ]
    });
}


export function create_SedTrans_UpdateBottom_BindGroup(device, uniformBuffer, txBottom, txBotChange_Sed, txBotChangeRecent_Sed, erosion_Sed, depostion_Sed, txtemp_SedTrans_Botttom, txtemp_SedTrans_Change, txtemp_txBotChangeRecent_Sed) {
    return device.createBindGroup({
        layout: create_SedTrans_UpdateBottom_BindGroupLayout(device),
        entries: [
            {
                binding: 0,
                resource: {
                    buffer: uniformBuffer
                }
            },
            {
                binding: 1,
                resource: txBottom.createView() 
            },
            {
                binding: 2,
                resource: txBotChange_Sed.createView()
            },
            {
                binding: 3,
                resource: txBotChangeRecent_Sed.createView()
            },
            {
                binding: 4,
                resource: erosion_Sed.createView()
            },
            {
                binding: 5,
                resource: depostion_Sed.createView()
            },
            {
                binding: 6,
                resource: txtemp_SedTrans_Botttom.createView()
            },
            {
                binding: 7,
                resource: txtemp_SedTrans_Change.createView()
            },
            {
                binding: 8,
                resource: txtemp_txBotChangeRecent_Sed.createView()
            },
        ]
    });
}