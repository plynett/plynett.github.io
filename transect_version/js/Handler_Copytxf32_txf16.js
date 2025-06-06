// Handler_TCopytxf32_txf16.js

export function create_Copytxf32_txf16_BindGroupLayout(device) {
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
                // 4th binding: A storage texture. The compute shader will write results into this texture.
                binding: 4,
                visibility: GPUShaderStage.COMPUTE,
                storageTexture: {
                    access: 'write-only',      // This texture is only for writing data
                    format: 'rgba16float',    // Data format: 16-bit floating point values for red, green, blue, and alpha channels
                    viewDimension: '2d-array'       // The texture is a 2D texture
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
        ]
    });
}


export function create_Copytxf32_txf16_BindGroup(device, uniformBuffer, txNewState, txBottom, txMeans_Speed, txRenderVarsf16, txMeans_Momflux, txModelVelocities, txMeans) {
    return device.createBindGroup({
        layout: create_Copytxf32_txf16_BindGroupLayout(device),
        entries: [
            {
                binding: 0,
                resource: {
                    buffer: uniformBuffer
                }
            },
            {
                binding: 1,
                resource: txNewState.createView() 
            },
            {
                binding: 2,
                resource: txBottom.createView()
            },
            {
                binding: 3,
                resource: txMeans_Speed.createView()
            },
            {
                binding: 4,
                resource: txRenderVarsf16.createView()
            },
            {
                binding: 5,
                resource: txMeans_Momflux.createView()
            },
            {
                binding: 6,
                resource: txModelVelocities.createView()
            },
            {
                binding: 7,
                resource: txMeans.createView()
            },
        ]
    });
}