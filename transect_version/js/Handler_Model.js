// Handler_Model.js
export function createModelBindGroupLayout(device) {
    return device.createBindGroupLayout({
        entries: [
            {
                // 0th binding: A uniform buffer (for parameters like time, etc.)
                binding: 0,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, 
                buffer: { type: 'uniform' }  // It's a uniform buffer
            },
            {
                // 1st binding: A texture that the fragment shader will sample from.
                binding: 1,
                visibility: GPUShaderStage.FRAGMENT,
                texture: {
                    sampleType: 'float',
                    format: 'bgra8unorm',  // imagedata for the google maps image
                    viewDimension: '2d'
                }
            },
            {
                // 2nd binding: A linear sampler describing how the texture will be sampled.
                binding: 2,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, 
                sampler: {
                    type: 'filtering'  // Nearest-neighbor sampling (no interpolation)
                }
            },
        ]
    });
}

  
// Create the bind-group
export function createModelBindGroup(device, uniformBuffer, txModelPNG_view, textureSampler_linear) {
    return device.createBindGroup({
        layout: createModelBindGroupLayout(device),
        entries: [
            {
                binding: 0,
                resource: {
                    buffer: uniformBuffer
                }
            },
            {
                binding: 1,
                resource: txModelPNG_view
            },
            {
                binding: 2,
                resource: textureSampler_linear
            },
        ]
    });
}


  