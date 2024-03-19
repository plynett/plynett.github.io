// Handler_Pass2.js

export function create_Pass2_BindGroupLayout(device) {
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
            }
        ]
    });
}


export function create_Pass2_BindGroup(device, uniformBuffer,txH, txU, txV, txBottom, txC, txHnear, txXFlux, txYFlux, txSed_C1, txSed_C2, txSed_C3, txSed_C4, txXFlux_Sed, txYFlux_Sed) {
    return device.createBindGroup({
        layout: create_Pass2_BindGroupLayout(device),
        entries: [
            {
                binding: 0,
                resource: {
                    buffer: uniformBuffer
                }
            },
            {
                binding: 1,
                resource: txH.createView() 
            },
            {
                binding: 2,
                resource: txU.createView()
            },
            {
                binding: 3,
                resource: txV.createView()
            },
            {
                binding: 4,
                resource: txBottom.createView()
            },
            {
                binding: 5,
                resource: txC.createView()
            },
            {
                binding: 6,
                resource: txHnear.createView()
            },
            {
                binding: 7,
                resource: txXFlux.createView()
            },
            {
                binding: 8,
                resource: txYFlux.createView()
            },
            {
                binding: 9,
                resource: txSed_C1.createView()
            },
            {
                binding: 10,
                resource: txSed_C2.createView()
            },
            {
                binding: 11,
                resource: txSed_C3.createView()
            },
            {
                binding: 12,
                resource: txSed_C4.createView()
            },
            {
                binding: 13,
                resource: txXFlux_Sed.createView()
            },
            {
                binding: 14,
                resource: txYFlux_Sed.createView()
            },
        ]
    });
}