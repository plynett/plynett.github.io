// Handler_Render.js

export function createRenderBindGroupLayout(device) {
    return device.createBindGroupLayout({
        entries: [
            {
                // 0th binding: A uniform buffer (for parameters like time, etc.)
                binding: 0,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, // This buffer is only visible to the fragment stage
                buffer: { type: 'uniform' }  // It's a uniform buffer
            },
            {
                // First binding: A texture that the fragment shader will sample from.
                binding: 1,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'rgba32float'
                }
            },
            {
                // Second binding: A texture that the fragment shader will sample from.
                binding: 2,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'rgba32float'
                }
            },
            {
                // 3rd binding: A texture that the fragment shader will sample from.
                binding: 3,
                visibility: GPUShaderStage.FRAGMENT,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'rgba32float'
                }
            },
            {
                // 4th binding: A sampler describing how the texture will be sampled.
                binding: 4,
                visibility: GPUShaderStage.FRAGMENT,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'rgba32float'
                }
            },
            {
                // 5th binding: A texture that the fragment shader will sample from.
                binding: 5,
                visibility: GPUShaderStage.FRAGMENT,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'rgba32float' 
                }
            },
            {
                // 6th binding: A texture that the fragment shader will sample from.
                binding: 6,
                visibility: GPUShaderStage.FRAGMENT,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'rgba32float'  
                }
            },
            {
                // 7th binding: A texture that the fragment shader will sample from.
                binding: 7,
                visibility: GPUShaderStage.FRAGMENT,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'bgra8unorm'  // imagedata for the google maps image
                }
            },
            {
                // 8th binding: A sampler describing how the texture will be sampled.
                binding: 8,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: {
                    type: 'non-filtering'  // Nearest-neighbor sampling (no interpolation)
                }
            }
        ]
    });
}


export function createRenderBindGroup(device, uniformBuffer, txState, txBottom, txMeans, txWaveHeight, txBaseline_WaveHeight, txBottomFriction, txGoogleMap, textureSampler) {
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
                resource: txMeans.createView()
            },
            {
                binding: 4,
                resource: txWaveHeight.createView()
            },
            {
                binding: 5,
                resource: txBaseline_WaveHeight.createView()
            },
            {
                binding: 6,
                resource: txBottomFriction.createView()
            },
            {
                binding: 7,
                resource: txGoogleMap.createView()
            },
            {
                binding: 8,
                resource: textureSampler
            }
        ]
    });
}