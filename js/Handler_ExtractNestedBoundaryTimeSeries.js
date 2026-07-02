// Handler_ExtractNestedBoundaryTimeSeries.js

// Added by Codex: Start nested-grid boundary time-series extraction handler.
export function create_ExtractNestedBoundaryTimeSeries_BindGroupLayout(device) {
    return device.createBindGroupLayout({
        entries: [
            {
                binding: 0,
                visibility: GPUShaderStage.COMPUTE,
                buffer: { type: 'uniform' }
            },
            {
                binding: 1,
                visibility: GPUShaderStage.COMPUTE,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'rgba32float'
                }
            },
            {
                binding: 2,
                visibility: GPUShaderStage.COMPUTE,
                storageTexture: {
                    access: 'write-only',
                    format: 'rgba32float',
                    viewDimension: '2d'
                }
            },
            {
                binding: 3,
                visibility: GPUShaderStage.COMPUTE,
                storageTexture: {
                    access: 'write-only',
                    format: 'rgba32float',
                    viewDimension: '2d'
                }
            },
            {
                binding: 4,
                visibility: GPUShaderStage.COMPUTE,
                storageTexture: {
                    access: 'write-only',
                    format: 'rgba32float',
                    viewDimension: '2d'
                }
            },
            {
                binding: 5,
                visibility: GPUShaderStage.COMPUTE,
                storageTexture: {
                    access: 'write-only',
                    format: 'rgba32float',
                    viewDimension: '2d'
                }
            },
            // Added by Codex: Bottom elevation lets the extraction shader zero dry rectangle-edge samples.
            {
                binding: 6,
                visibility: GPUShaderStage.COMPUTE,
                texture: {
                    sampleType: 'unfilterable-float',
                    format: 'rgba32float'
                }
            }
        ]
    });
}

// export function create_ExtractNestedBoundaryTimeSeries_BindGroup(device, uniformBuffer, txState, txNestedSouth, txNestedNorth, txNestedWest, txNestedEast) {
// Added by Codex: Include txBottom so dry cells export zero eta/hu/hv.
export function create_ExtractNestedBoundaryTimeSeries_BindGroup(device, uniformBuffer, txState, txNestedSouth, txNestedNorth, txNestedWest, txNestedEast, txBottom) {
    return device.createBindGroup({
        layout: create_ExtractNestedBoundaryTimeSeries_BindGroupLayout(device),
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
                resource: txNestedSouth.createView()
            },
            {
                binding: 3,
                resource: txNestedNorth.createView()
            },
            {
                binding: 4,
                resource: txNestedWest.createView()
            },
            {
                binding: 5,
                resource: txNestedEast.createView()
            },
            // Added by Codex: Bottom elevation texture for dry-cell output masking.
            {
                binding: 6,
                resource: txBottom.createView()
            }
        ]
    });
}
// Added by Codex: End nested-grid boundary time-series extraction handler.
