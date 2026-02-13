// Run_Compute_Shader.js

export function runComputeShader(device, uniformBuffer, uniforms, computePipeline, computeBindGroup, dispatchX, dispatchY) {

    // Create a new command encoder for recording GPU commands.
    const commandEncoder = device.createCommandEncoder();

    // set uniforms buffer
    device.queue.writeBuffer(uniformBuffer, 0, uniforms);

    // Begin recording commands for the compute pass.
    const computePass = commandEncoder.beginComputePass();

    // Set the compute pipeline and bind group for the compute shader.
    computePass.setPipeline(computePipeline);
    computePass.setBindGroup(0, computeBindGroup);

    // Dispatch workgroups for the compute shader.
    computePass.dispatchWorkgroups(dispatchX, dispatchY);

    // End the compute pass after recording all its commands.
    computePass.end();

    // Submit the recorded commands to the GPU for execution.
    device.queue.submit([commandEncoder.finish()]);
}

// Function to fetch shader code from a given URL.
// This asynchronous function will retrieve the shader source code as text.
export async function fetchShader(url) {
    // Use the Fetch API to get the resource at the specified URL.
    const response = await fetch(url);

    // Once we get the response, retrieve the text from it.
    return await response.text();
}

export function runCopyTextures(device, calc_constants, src_texture, dst_texture) {

    // Create a new command encoder for recording GPU commands.
    const commandEncoder = device.createCommandEncoder();

    // copy the textures
    commandEncoder.copyTextureToTexture(
        { texture: src_texture },  //src
        { texture: dst_texture },  //dst
        { width: calc_constants.WIDTH, height: calc_constants.HEIGHT, depthOrArrayLayers: 1 }
    );

    // Submit the recorded commands to the GPU for execution.
    device.queue.submit([commandEncoder.finish()]);
}


export function runComputeShader_EncStack(device, commandEncoder, uniformBuffer, uniforms, computePipeline, computeBindGroup, dispatchX, dispatchY) {

    // set uniforms buffer
    device.queue.writeBuffer(uniformBuffer, 0, uniforms);

    // Begin recording commands for the compute pass.
    const computePass = commandEncoder.beginComputePass();

    // Set the compute pipeline and bind group for the compute shader.
    computePass.setPipeline(computePipeline);
    computePass.setBindGroup(0, computeBindGroup);

    // Dispatch workgroups for the compute shader.
    computePass.dispatchWorkgroups(dispatchX, dispatchY);

    // End the compute pass after recording all its commands.
    computePass.end();

    // update the command encoder stack
    return commandEncoder;
}


export function runCopyTextures_EncStack(commandEncoder, calc_constants, src_texture, dst_texture) {

    // copy the textures
    commandEncoder.copyTextureToTexture(
        { texture: src_texture },  //src
        { texture: dst_texture },  //dst
        { width: calc_constants.WIDTH, height: calc_constants.HEIGHT, depthOrArrayLayers: 1 }
    );

    // update the command encoder stack
    return commandEncoder;
}
