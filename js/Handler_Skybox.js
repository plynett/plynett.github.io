// Handler_Skybox.js
export function createSkyboxBindGroupLayout(device) {
    return device.createBindGroupLayout({
        entries: [
            {
                // 0th binding: A uniform buffer (for parameters like time, etc.)
                binding: 0,
                visibility: GPUShaderStage.VERTEX,
                buffer: { type: 'uniform' }  // It's a uniform buffer
            },
            {
                // First binding: A texture that the fragment shader will sample from.
                binding: 1,
                visibility: GPUShaderStage.FRAGMENT,
                texture: {
                    sampleType: 'float',
                    format: 'bgra8unorm',  // imagedata for the skybox cube images
                    viewDimension: 'cube',  // Cube map view
                }
            },
            {
                // 2nd binding: A linear sampler describing how the texture will be sampled.
                binding: 2,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: {
                    type: 'filtering'  // Nearest-neighbor sampling (no interpolation)
                }
            },
        ]
    });
}

  
// Create the skybox bind-group
export function createSkyboxBindGroup(device, uniformBuffer, cubeView, cubeSampler) {
    return device.createBindGroup({
        layout: createSkyboxBindGroupLayout(device),
        entries: [
            {
                binding: 0,
                resource: {
                    buffer: uniformBuffer
                }
            },
            {
                binding: 1,
                resource: cubeView
            },
            {
                binding: 2,
                resource: cubeSampler
            },
        ]
    });
}
  
  