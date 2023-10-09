// Handler_BoundaryPass.js

export function create_BoundaryPass_BindGroupLayout(device) {
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
                    format: 'rgba32float',    // Data format: 32-bit floating point values for red, green, blue, and alpha channels
                    viewDimension: '2d'       // The texture is a 2D texture
                }
            }
        ]
    });
}


export function create_BoundaryPass_BindGroup(device, uniformBuffer, current_stateUVstar, txBottom, txWaves, txtemp) {
    return device.createBindGroup({
        layout: create_BoundaryPass_BindGroupLayout(device),
        entries: [
            {
                binding: 0,
                resource: {
                    buffer: uniformBuffer
                }
            },
            {
                binding: 1,
                resource: current_stateUVstar.createView() 
            },
            {
                binding: 2,
                resource: txBottom.createView()
            },
            {
                binding: 3,
                resource: txWaves.createView()
            },
            {
                binding: 4,
                resource: txtemp.createView()
            },
        ]
    });
}