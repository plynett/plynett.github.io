import { mat4 } from 'https://cdn.jsdelivr.net/npm/gl-matrix/esm/index.js';

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
                    viewDimension: '2d-array'
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
export function createModelBindGroup(device, uniformBuffer, txModelPNGs, textureSampler_linear) {
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
                resource: txModelPNGs.createView()
            },
            {
                binding: 2,
                resource: textureSampler_linear
            },
        ]
    });
}

async function loadModelDefinitions(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load model definitions from ${url}: ${response.status}`);
    }
    const config = await response.json();
    return config.models || [];
}

function makeBoxModelMatrix(x, y, z, width, length, height, yaw = 0) {
    const M = mat4.create();
    // 1) move center
    mat4.translate(M, M, [x, y, z]);
    // 2) rotate around Z
    mat4.rotateZ(M, M, yaw);
    // 3) scale unit cube → box size (unit cube is 2×, so half‐sizes)
    mat4.scale(M, M, [ width * 0.5, length * 0.5, height * 0.5 ]);
    return M;
}

export async function loadSceneModels(url = './models.json') {
    var model_properties = [];
    let defs = [];
    try {
      defs = await loadModelDefinitions(url);
    } catch (e) {
      console.error(`Error loading ${url}:`, e);
      return model_properties;     // ← return the empty array instead
    }

    for (const def of defs) {
      if (def.type === 'box') {
        const [x, y, z] = def.center;
        const [w, l, h] = def.size;
        const yaw = (def.rotation || 0) * Math.PI / 180.;
        const modelMatrix = makeBoxModelMatrix(x, y, z, w, l, h, yaw);
        model_properties.push({ id: def.id, type: def.type, modelMatrix });
      }
      // else if (def.type === 'tree') { … }
    }
  
    return model_properties;
  }

  