// texture_creator.js
export function create_2D_Texture(device, width, height) {
    return device.createTexture({
        size: [width, height, 1],
        format: 'rgba32float',
        usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
    });
}

export function createUniformBuffer(device) {
    return device.createBuffer({
        size: 100,  // enough space for 25 variables
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
}

