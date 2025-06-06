// Config_Pipelines.js



// computePipelineConfig.js
export function createComputePipeline(device, computeShaderCode, computeBindGroupLayout, allComputePipelines) {
    const pipeline = device.createComputePipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [computeBindGroupLayout] }),
        compute: {
            module: device.createShaderModule({ code: computeShaderCode }),
            entryPoint: 'main'
        }
    });

    // Add the created pipeline to the global tracking set
    allComputePipelines.add(pipeline);

    return pipeline;
}


export function createRenderPipeline(device, vertexShaderCode, fragmentShaderCode, swapChainFormat, renderBindGroupLayout, depthFormat = 'depth24plus') {
    return device.createRenderPipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [renderBindGroupLayout] }),

        vertex: {
            module: device.createShaderModule({ code: vertexShaderCode }),
            entryPoint: 'vs_main',
            buffers: [{
                arrayStride: 8,
                attributes: [{
                    shaderLocation: 0,
                    offset: 0,
                    format: 'float32x2'
                }]
            }]
        },

        fragment: {
            module: device.createShaderModule({ code: fragmentShaderCode }),
            entryPoint: 'fs_main',
            targets: [{
                format: swapChainFormat
            }]
        },

        primitive: {
            topology: 'triangle-strip',
            cullMode: 'none',
        },

        // ────────── Depth (optional but recommended) ──────────
        depthStencil: depthFormat && {
            format: depthFormat,
            depthWriteEnabled: true,
            depthCompare: 'less',
        },
    });
}

export function createRenderPipeline_vertexgrid(device, vertexShaderCode, fragmentShaderCode, swapChainFormat, renderBindGroupLayout, depthFormat = 'depth24plus') {
    return device.createRenderPipeline({
        layout: device.createPipelineLayout({
            bindGroupLayouts: [renderBindGroupLayout],
        }),

        // ────────── Vertex stage ──────────
        vertex: {
            module: device.createShaderModule({ code: vertexShaderCode }),
            entryPoint: 'vs_main',
            buffers: [
                /* slot 0 : vec2<f32> position */
                {
                    arrayStride: 8,            // 2 × 4‑byte floats
                    stepMode:  'vertex',
                    attributes: [
                        {
                            shaderLocation: 0, // @location(0) in the shader
                            offset: 0,
                            format: 'float32x2',
                        },
                    ],
                },
            ],
        },

        // ────────── Fragment stage ──────────
        fragment: {
            module: device.createShaderModule({ code: fragmentShaderCode }),
            entryPoint: 'fs_main',
            targets: [
                { format: swapChainFormat },
            ],
        },

        // ────────── Rasterisation ──────────
        primitive: {
            topology: 'triangle-strip',   // works with your degenerate‑vertex grid
            cullMode: 'none',
        },

        // ────────── Depth (optional but recommended) ──────────
        depthStencil: depthFormat && {
            format: depthFormat,
            depthWriteEnabled: true,
            depthCompare: 'less',
        },
    });
}

export function createSkyboxPipeline(device, vertexShaderCode, fragmentShaderCode, swapChainFormat,skyboxBindGroupLayout,depthFormat = 'depth24plus' ){
    return device.createRenderPipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [ skyboxBindGroupLayout ],
      }),
  
      // ────────── Vertex stage ──────────
      vertex: {
        module: device.createShaderModule({ code: vertexShaderCode }),
        entryPoint: 'vs_main',
        // full‐screen triangle: no vertex buffer needed
        buffers: []
      },
  
      // ────────── Fragment stage ──────────
      fragment: {
        module: device.createShaderModule({ code: fragmentShaderCode }),
        entryPoint: 'fs_main',
        targets: [
          { format: swapChainFormat },
        ],
      },
  
      // ────────── Rasterisation ──────────
      primitive: {
        topology: 'triangle-list',  // single triangle that covers screen
        cullMode: 'none',          // draw inside‐out
      },
  
      // ────────── Depth (optional) ──────────
      depthStencil: depthFormat && {
        format:           depthFormat,
        depthWriteEnabled: false,      // sky always “behind”
        depthCompare:    'less-equal'
      },
    });
}


export function createModelPipeline(
    device,
    vertexShaderCode,     // WGSL string with vs_main(@location(0) position)
    fragmentShaderCode,   // WGSL string with fs_main()
    swapChainFormat,
    modelBindGroupLayout,
    depthFormat = 'depth24plus'
  ) {
    return device.createRenderPipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [modelBindGroupLayout]
      }),
  
      // ────────── Vertex stage ──────────
      vertex: {
        module: device.createShaderModule({ code: vertexShaderCode }),
        entryPoint: 'vs_main',
        buffers: [
          {
            arrayStride: 3 * 4,      // vec3<f32>
            stepMode:    'vertex',
            attributes: [
              {
                shaderLocation: 0,  // matches @location(0)
                offset:         0,
                format:         'float32x3'
              }
            ]
          }
        ]
      },
  
      // ────────── Fragment stage ──────────
      fragment: {
        module:    device.createShaderModule({ code: fragmentShaderCode }),
        entryPoint:'fs_main',
        targets:   [{ format: swapChainFormat }]
      },
  
      // ────────── Rasterisation ──────────
      primitive: {
        topology: 'triangle-list',
        cullMode: 'none'
      },
  
      // ────────── Depth ──────────
      depthStencil: depthFormat && {
        format:            depthFormat,
        depthWriteEnabled: true,
        depthCompare:      'less-equal'
      }
    });
}


export function createDuckPipeline(
  device,
  vertexShaderCode,     // WGSL string with vs_main(@location(0) pos, @location(1) normal, @location(2) uv)
  fragmentShaderCode,   // WGSL string with fs_main()
  swapChainFormat,
  duckBindGroupLayout,  // Your bindGroupLayout that includes camera UBO + albedoTex + sampler
  depthFormat = 'depth24plus'
) {
  return device.createRenderPipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [ duckBindGroupLayout ]
    }),

    // ────────── Vertex stage ──────────
    vertex: {
      module: device.createShaderModule({ code: vertexShaderCode }),
      entryPoint: 'vs_main',
      buffers: [
        // positions @location(0)
        {
          arrayStride: 3 * 4,      // vec3<f32>
          stepMode:    'vertex',
          attributes: [
            {
              shaderLocation: 0,
              offset:         0,
              format:         'float32x3'
            }
          ]
        },
        // normals @location(1)
        {
          arrayStride: 3 * 4,      // vec3<f32>
          stepMode:    'vertex',
          attributes: [
            {
              shaderLocation: 1,
              offset:         0,
              format:         'float32x3'
            }
          ]
        },
        // uvs       @location(2)
        {
          arrayStride: 2 * 4,      // vec2<f32>
          stepMode:    'vertex',
          attributes: [
            {
              shaderLocation: 2,
              offset:         0,
              format:         'float32x2'
            }
          ]
        }
      ]
    },

    // ────────── Fragment stage ──────────
    fragment: {
      module:    device.createShaderModule({ code: fragmentShaderCode }),
      entryPoint:'fs_main',
      targets:   [{ format: swapChainFormat }]
    },

    // ────────── Rasterisation ──────────
    primitive: {
      topology: 'triangle-list',
      cullMode: 'none'   // or 'none' if you prefer
    },

    // ────────── Depth ──────────
    depthStencil: depthFormat && {
      format:            depthFormat,
      depthWriteEnabled: true,
      depthCompare:      'less-equal'
    }
  });
}

