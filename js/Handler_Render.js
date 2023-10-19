// Handler_Render.js

export function createRenderBindGroupLayout(device) {
    return device.createBindGroupLayout({
        entries: [
            {
                // First binding: A texture that the fragment shader will sample from.
                binding: 0,
                visibility: GPUShaderStage.FRAGMENT,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'rgba32float'
                }
            },
            {
                // Second binding: A texture that the fragment shader will sample from.
                binding: 1,
                visibility: GPUShaderStage.FRAGMENT,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'rgba32float'
                }
            },
            {
                // Third binding: A sampler describing how the texture will be sampled.
                binding: 2,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: {
                    type: 'non-filtering'  // Nearest-neighbor sampling (no interpolation)
                }
            }
        ]
    });
}


export function createRenderBindGroup(device, txState, txBottom, textureSampler) {
    return device.createBindGroup({
        layout: createRenderBindGroupLayout(device),
        entries: [
            {
                binding: 0,
                resource: txState.createView()
            },
            {
                binding: 1,
                resource: txBottom.createView()
            },
            {
                binding: 2,
                resource: textureSampler
            }
        ]
    });
}