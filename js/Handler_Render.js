// Handler_Render.js

export function createRenderBindGroupLayout(device) {
    return device.createBindGroupLayout({
        entries: [
            {
                // 0th binding: A uniform buffer (for parameters like time, etc.)
                binding: 0,
                visibility: GPUShaderStage.FRAGMENT, // This buffer is only visible to the fragment stage
                buffer: { type: 'uniform' }  // It's a uniform buffer
            },
            {
                // First binding: A texture that the fragment shader will sample from.
                binding: 1,
                visibility: GPUShaderStage.FRAGMENT,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'rgba32float'
                }
            },
            {
                // Second binding: A texture that the fragment shader will sample from.
                binding: 2,
                visibility: GPUShaderStage.FRAGMENT,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'rgba32float'
                }
            },
            {
                // Second binding: A texture that the fragment shader will sample from.
                binding: 3,
                visibility: GPUShaderStage.FRAGMENT,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'bgra8unorm'
                }
            },
            {
                // Third binding: A sampler describing how the texture will be sampled.
                binding: 4,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: {
                    type: 'non-filtering'  // Nearest-neighbor sampling (no interpolation)
                }
            }
        ]
    });
}


export function createRenderBindGroup(device, uniformBuffer, txState, txBottom, txGoogleMap, textureSampler) {
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
                resource: txGoogleMap.createView()
            },
            {
                binding: 4,
                resource: textureSampler
            }
        ]
    });
}