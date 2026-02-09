// Run_Compute_Shader.js

export function runComputeShader(device, commandEncoder, uniformBuffer, uniforms, computePipeline, computeBindGroup, dispatchX, dispatchY) {

    // Write uniform data to buffer (queue operation - executes before next submit)
    device.queue.writeBuffer(uniformBuffer, 0, uniforms);

    // Record compute pass in the provided command encoder.
    const computePass = commandEncoder.beginComputePass();

    // Set the compute pipeline and bind group for the compute shader.
    computePass.setPipeline(computePipeline);
    computePass.setBindGroup(0, computeBindGroup);

    // Dispatch workgroups for the compute shader.
    computePass.dispatchWorkgroups(dispatchX, dispatchY);

    // End the compute pass after recording all its commands.
    computePass.end();
}

// Function to fetch shader code from a given URL.
// This asynchronous function will retrieve the shader source code as text.
export async function fetchShader(url) {
    // Use the Fetch API to get the resource at the specified URL.
    const response = await fetch(url);

    // Once we get the response, retrieve the text from it.
    return await response.text();
}

export function runCopyTextures(device, commandEncoder, calc_constants, src_texture, dst_texture) {

    // Record copy command in the provided command encoder.
    commandEncoder.copyTextureToTexture(
        { texture: src_texture },  //src
        { texture: dst_texture },  //dst
        { width: calc_constants.WIDTH, height: calc_constants.HEIGHT, depthOrArrayLayers: 1 }
    );
}
