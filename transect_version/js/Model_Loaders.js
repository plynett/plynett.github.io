import { mat4 } from 'https://cdn.jsdelivr.net/npm/gl-matrix/esm/index.js';

async function loadModelDefinitions(source) {
    let config;
    if (typeof source === 'string') {
      // treat as URL
      const res = await fetch(source);
      if (!res.ok) throw new Error(`Failed to load ${source}: ${res.status}`);
      config = await res.json();
    } else if (source instanceof File || source instanceof Blob) {
      // user-picked file
      const txt = await source.text();
      config = JSON.parse(txt);
    } else {
      throw new Error('loadModelDefinitions: source must be URL or File');
    }
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

export function makeModelMatrix(tx, ty, tz, s = 1, yaw = 0) {
  const M = mat4.create();
  // 1) translate
  mat4.translate(M, M, [tx, ty, tz]);
  // 2) rotate about Z
  mat4.rotateZ(   M, M, yaw);
  // 3) uniform scale
  mat4.scale(     M, M, [s,  s,  s ]);
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

export async function loadglTFModel(device, gltfUrl) {
  // 0) Derive the base folder (so we can fetch .bin and all images)
  const basePath = gltfUrl.substring(0, gltfUrl.lastIndexOf('/'));

  // 1) Load the glTF JSON
  const resGLTF = await fetch(gltfUrl);
  if (!resGLTF.ok) throw new Error(`Gltf load failed: ${gltfUrl}`);
  const gltf = await resGLTF.json();

  // 2) Load the single binary chunk
  const binUri     = gltf.buffers[0].uri;
  const binUrl     = `${basePath}/${binUri}`;
  const resBin     = await fetch(binUrl);
  if (!resBin.ok) throw new Error(`Bin load failed: ${binUrl}`);
  const binBuffer  = await resBin.arrayBuffer();

  // 3) Load _all_ images (e.g. in textures/) as ImageBitmaps
  const imageBitmaps = await Promise.all(
    (gltf.images || []).map(imgDef => {
      const imgUrl = imgDef.uri.includes('/')
        ? `${basePath}/${imgDef.uri}`             // already has subfolder
        : `${basePath}/textures/${imgDef.uri}`;   // default textures/
      return fetch(imgUrl)
        .then(r => { if (!r.ok) throw new Error(`Image load failed: ${imgUrl}`); return r.blob(); })
        .then(createImageBitmap);
    })
  );

  // 4) Create a GPUTexture + sampler for _each_ glTF image
  const textures = imageBitmaps.map(bmp => {
    const tex = device.createTexture({
      size:    [bmp.width, bmp.height, 1],
      format:  'rgba8unorm',
      usage:   GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
    });
    device.queue.copyExternalImageToTexture(
      { source: bmp },
      { texture: tex },
      [bmp.width, bmp.height, 1]
    );
    return {
      view:    tex.createView(),
      sampler: device.createSampler({
        magFilter:    'linear',
        minFilter:    'linear',
        addressModeU: 'repeat',
        addressModeV: 'repeat'
      })
    };
  });

  // 5) Pull out the first primitive of the first mesh (like your old code)
  const prim = gltf.meshes[0].primitives[0];

  // decode geometry
  const positions = getAccessorArray(prim.attributes.POSITION, gltf, binBuffer);
  const normals   = getAccessorArray(prim.attributes.NORMAL,   gltf, binBuffer);
  const uvs       = prim.attributes.TEXCOORD_0 !== undefined
                    ? getAccessorArray(prim.attributes.TEXCOORD_0, gltf, binBuffer)
                    : null;
  const indices   = getAccessorArray(prim.indices, gltf, binBuffer);

  // 6) Measure local bounds
  let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity, minZ=Infinity, maxZ=-Infinity;
  for (let i=0; i<positions.length; i+=3) {
    const [x,y,z] = [positions[i], positions[i+1], positions[i+2]];
    minX=Math.min(minX,x); maxX=Math.max(maxX,x);
    minY=Math.min(minY,y); maxY=Math.max(maxY,y);
    minZ=Math.min(minZ,z); maxZ=Math.max(maxZ,z);
  }
  const localWidth  = maxX - minX;
  const localLength = maxY - minY;
  const localHeight = maxZ - minZ;

  // 7) Create GPU buffers
  const posVB  = createVB(device, positions);
  const normVB = createVB(device, normals);
  const uvVB   = uvs ? createVB(device, uvs) : null;

  const idxBuf = device.createBuffer({
    size:  indices.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST
  });
  device.queue.writeBuffer(idxBuf, 0, indices);

  // 8) Figure out which texture this primitive uses
  //    glTF primitive has prim.material (an index into gltf.materials[]):
  const matIndex = prim.material || 0;
  //    and gltf.materials[matIndex].pbrMetallicRoughness.baseColorTexture.index
  const texInfo = gltf.materials[matIndex]
                  .pbrMetallicRoughness
                  .baseColorTexture
                  .index;
  const baseColorTexture = textures[ texInfo ];

  // 9) Return a model object matching your old shape, but now fully generic
  return {
    vertexBuffers:    [ posVB, normVB ].concat(uvVB? [uvVB]:[]),
    indexBuffer:      idxBuf,
    indexCount:       indices.length,
    albedoView:       baseColorTexture.view,
    albedoSampler:    baseColorTexture.sampler,
    localWidth, localLength, localHeight
  };
}


// Helper to pull out a typed array from an accessor
function getAccessorArray(accessorIndex, gltf, binBuffer) {
    const acc = gltf.accessors[accessorIndex];
    if (acc.bufferView === undefined) {
      throw new Error(`Accessor ${accessorIndex} has no bufferView`);
    }
  
    const bvIndex = acc.bufferView;
    const bv      = gltf.bufferViews[bvIndex];
    if (!bv) {
      throw new Error(`bufferView ${bvIndex} not found for accessor ${accessorIndex}`);
    }
  
    const bvOffset  = bv.byteOffset || 0;
    const accOffset = acc.byteOffset || 0;
    const byteOffset = bvOffset + accOffset;
  
    const count = acc.count;
    const comps = {
      SCALAR: 1,
      VEC2:   2,
      VEC3:   3,
      VEC4:   4
    }[acc.type];
    if (!comps) {
      throw new Error(`Unsupported accessor type ${acc.type} on accessor ${accessorIndex}`);
    }
  
    let ArrayCtor;
    switch (acc.componentType) {
      case 5126: // FLOAT
        ArrayCtor = Float32Array;
        break;
      case 5123: // UNSIGNED_SHORT
        ArrayCtor = Uint16Array;
        break;
      case 5125: // UNSIGNED_INT
        ArrayCtor = Uint32Array;
        break;
      default:
        throw new Error(
          `Unsupported componentType ${acc.componentType} in accessor ${accessorIndex}`
        );
    }
  
    return new ArrayCtor(
      binBuffer,
      byteOffset,
      count * comps
    );
}
  
  // Creates a GPU vertex buffer from a TypedArray.
function createVB(device, data) {
    const buf = device.createBuffer({
      size: data.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });
    device.queue.writeBuffer(buf, 0, data);
    return buf;
}

  