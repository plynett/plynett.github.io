// import source files
import { calc_constants, loadConfig, init_sim_parameters } from './constants_load_calc.js';  // variables and functions needed for init_sim_parameters
import { loadDepthSurface, loadWaveData } from './File_Loader.js';  // load depth surface and wave data file
import { create_2D_Texture, create_1D_Texture, createUniformBuffer } from './Create_Textures.js';  // create texture function
import { copyBathyDataToTexture, copyWaveDataToTexture, copyInitialConditionDataToTexture } from './Copy_Data_to_Textures.js';  // fills in channels of txBottom
import { createRenderBindGroupLayout, createRenderBindGroup } from './Handler_Render.js';  // group bindings for render shaders
import { create_Pass1_BindGroupLayout, create_Pass1_BindGroup } from './Handler_Pass1.js';  // group bindings for Pass1 shaders
import { create_Pass2_BindGroupLayout, create_Pass2_BindGroup } from './Handler_Pass2.js';  // group bindings for Pass2 shaders
import { create_Pass3_BindGroupLayout, create_Pass3_BindGroup } from './Handler_Pass3.js';  // group bindings for Pass3 shaders
import { create_BoundaryPass_BindGroupLayout, create_BoundaryPass_BindGroup } from './Handler_BoundaryPass.js';  // group bindings for BoundaryPass shaders
import { createComputePipeline, createRenderPipeline } from './Config_Pipelines.js';  // pipeline config for ALL shaders
import { fetchShader, runComputeShader } from './Run_Compute_Shader.js';

// Get a reference to the HTML canvas element with the ID 'webgpuCanvas'
const canvas = document.getElementById('webgpuCanvas');

// Access the WebGPU object. This is the entry point to the WebGPU API.
const gpu = navigator.gpu;

// Check if WebGPU is supported in the user's browser.
if (!gpu) {
    // If it's not supported, log an error message to the console.
    console.error("WebGPU is not supported in this browser.");
    // Throw an error to stop execution.
    throw new Error("WebGPU is not supported in this browser.");
}

// create an async function to handle configuration routines that must be performed in order, but also have imbedded async functions.
async function OrderedFunctions() {
    // Set simulation parameters - this routine inits calc_constants to default values,
    // loads the json config file and places updated values in calc_constants, and then
    // sets and values of calc_constants that are dependent on inputs(e.g.dt)
    await init_sim_parameters(canvas);  // Ensure this completes first,canvas as input - update WIDTH and HEIGHT of canvas to match grid domain

    // Load depth surface file, place into 2D array bathy2D
    let bathy2D = await loadDepthSurface('modified_bathy.txt', calc_constants);  // Start this only after the first function completes
    // Load wave data file, place into waveArray 
    let { numberOfWaves, waveData } = await loadWaveData('irrWaves.txt');  // Start this only after the first function completes
    calc_constants.numberOfWaves = numberOfWaves; 
    return { bathy2D, waveData };
}

// This is an asynchronous function to set up the WebGPU context and resources.
async function initializeWebGPUApp() {
    // Log a message indicating the start of the initialization process.
    console.log("Starting WebGPU App Initialization...");

    // Request an adapter. The adapter represents the GPU device, or a software fallback.
    const adapter = await gpu.requestAdapter();
    console.log("Adapter acquired.");

    // Request a device. The device is a representation of the GPU and allows for resource creation and command submission.
    const device = await adapter.requestDevice();
    console.log("Device acquired.");

    // Get the WebGPU rendering context from the canvas.
    const context = canvas.getContext('webgpu');

    // Define the format for our swap chain. 'bgra8unorm' is a commonly used format.
    const swapChainFormat = 'bgra8unorm';

    // Configure the WebGPU context with the device, format, and desired texture usage.
    context.configure({
        device: device,
        format: swapChainFormat,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
    });

    // load the simulation parameters, the 2D depth surface, and the wave data.  "Ordered" as the sequence of how these files are loaded is important
    let { bathy2D, waveData } = await OrderedFunctions();

    // Create buffers for storing uniform data. This buffer will be used to send parameter data to shaders.
    const Pass1_uniformBuffer = createUniformBuffer(device);
    const Pass2_uniformBuffer = createUniformBuffer(device);
    const Pass3_uniformBuffer = createUniformBuffer(device);
    const BoundaryPass_uniformBuffer = createUniformBuffer(device);
    const PCRx_uniformBuffer = createUniformBuffer(device);
    const PCRy_uniformBuffer = createUniformBuffer(device);

    // Create a sampler for texture sampling. This defines how the texture will be sampled (e.g., nearest-neighbor sampling).  Used only for render pipeline
    const textureSampler = device.createSampler({
        magFilter: 'nearest',
        minFilter: 'nearest',
    });

    // Create a texturse with the desired dimensions (WIDTH, HEIGHT) and format 'rgba32float'.
    // Textures will have multiple usages, allowing it to be read/written by shaders, copied from/to, and used as a render target.
    console.log("Creating 2D textures.");
    const txBottom = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const txState = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const txNewState = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const txstateUVstar = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const txstateFGstar = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const current_stateUVstar = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const current_stateFGstar = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const txH = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const txU = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const txV = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const txW = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const txC = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const txXFlux = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const txYFlux = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const oldGradients = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const oldOldGradients = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const predictedGradients = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const F_G_star_oldGradients = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const F_G_star_oldOldGradients = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const F_G_star_predictedGradients = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const txNormal = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const txAuxiliary2 = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const txAuxiliary2Out = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const txtemp = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const txtemp2 = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const coefMatx = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const coefMaty = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const newcoef = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const dU_by_dt = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const F_G_star = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const txShipPressure = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const txWaves = create_1D_Texture(device, calc_constants.numberOfWaves);


    // fill in the bathy texture
    copyBathyDataToTexture(calc_constants, bathy2D, device, txBottom);

    // fill in the wave data texture
    if (calc_constants.numberOfWaves > 0) {
        copyWaveDataToTexture(calc_constants, waveData, device, txWaves);
    }

    // create initial condition
    copyInitialConditionDataToTexture(calc_constants, device, txState);
    copyInitialConditionDataToTexture(calc_constants, device, txstateUVstar);

    // layouts describe the resources (buffers, textures, samplers) that the shaders will use.

    // Pass1 Bindings & Uniforms Config
    const Pass1_BindGroupLayout = create_Pass1_BindGroupLayout(device);
    const Pass1_BindGroup = create_Pass1_BindGroup(device, Pass1_uniformBuffer, txState, txBottom, txH, txU, txV, txC);
    const Pass1_uniforms = new ArrayBuffer(100); // allowing for 25 variables
    let Pass1_view = new DataView(Pass1_uniforms);
    Pass1_view.setUint32(0, calc_constants.WIDTH, true);          // u32
    Pass1_view.setUint32(4, calc_constants.HEIGHT, true);          // u32
    Pass1_view.setFloat32(8, calc_constants.one_over_dx, true);             // f32
    Pass1_view.setFloat32(12, calc_constants.one_over_dy, true);       // f32
    Pass1_view.setFloat32(16, calc_constants.dissipation_threshold, true);           // f32
    Pass1_view.setFloat32(20, calc_constants.TWO_THETA, true);           // f32
    Pass1_view.setFloat32(24, calc_constants.epsilon, true);       // f32
    Pass1_view.setFloat32(28, calc_constants.whiteWaterDecayRate, true);           // f32
    Pass1_view.setFloat32(32, calc_constants.dt, true);           // f32
    Pass1_view.setFloat32(36, calc_constants.base_depth, true);       // f32
    Pass1_view.setFloat32(40, calc_constants.dx, true);           // f32
    Pass1_view.setFloat32(44, calc_constants.dy, true);           // f32

    // Pass2 Bindings & Uniforms Config
    const Pass2_BindGroupLayout = create_Pass2_BindGroupLayout(device);
    const Pass2_BindGroup = create_Pass2_BindGroup(device, Pass2_uniformBuffer, txH, txU, txV, txBottom, txC, txXFlux, txYFlux);
    const Pass2_uniforms = new ArrayBuffer(100); // allowing for 25 variables
    let Pass2_view = new DataView(Pass2_uniforms);
    Pass2_view.setUint32(0, calc_constants.WIDTH, true);          // u32
    Pass2_view.setUint32(4, calc_constants.HEIGHT, true);          // u32
    Pass2_view.setFloat32(8, calc_constants.g, true);             // f32
    Pass2_view.setFloat32(12, calc_constants.half_g, true);       // f32
    Pass2_view.setFloat32(16, calc_constants.dx, true);           // f32
    Pass2_view.setFloat32(20, calc_constants.dy, true);           // f32

    // Pass3 Bindings & Uniforms Config
    const Pass3_BindGroupLayout = create_Pass3_BindGroupLayout(device);
    const Pass3_BindGroup = create_Pass3_BindGroup(device, Pass3_uniformBuffer, txState, txBottom, txH, txXFlux, txYFlux, oldGradients, oldOldGradients, predictedGradients, F_G_star_oldOldGradients, txstateUVstar, txShipPressure, txNewState, dU_by_dt, F_G_star, current_stateUVstar);
    const Pass3_uniforms = new ArrayBuffer(100); // allowing for 25 variables
    let Pass3_view = new DataView(Pass3_uniforms);
    Pass3_view.setUint32(0, calc_constants.WIDTH, true);          // u32
    Pass3_view.setUint32(4, calc_constants.HEIGHT, true);          // u32
    Pass3_view.setFloat32(8, calc_constants.dt, true);             // f32
    Pass3_view.setFloat32(12, calc_constants.dx, true);       // f32
    Pass3_view.setFloat32(16, calc_constants.dy, true);           // f32
    Pass3_view.setFloat32(20, calc_constants.one_over_dx, true);           // f32
    Pass3_view.setFloat32(24, calc_constants.one_over_dy, true);       // f32
    Pass3_view.setFloat32(28, calc_constants.g_over_dx, true);           // f32
    Pass3_view.setFloat32(32, calc_constants.g_over_dy, true);           // f32
    Pass3_view.setUint32(36, calc_constants.timeScheme, true);       // f32
    Pass3_view.setFloat32(40, calc_constants.epsilon, true);           // f32
    Pass3_view.setUint32(44, calc_constants.isManning, true);           // f32
    Pass3_view.setFloat32(48, calc_constants.g, true);           // f32
    Pass3_view.setFloat32(52, calc_constants.friction, true);             // f32
    Pass3_view.setUint32(56, calc_constants.pred_or_corrector, true);       // f32
    Pass3_view.setFloat32(60, calc_constants.Bcoef, true);           // f32
    Pass3_view.setFloat32(64, calc_constants.Bcoef_g, true);           // f32
    Pass3_view.setFloat32(68, calc_constants.one_over_d2x, true);       // f32
    Pass3_view.setFloat32(72, calc_constants.one_over_d3x, true);           // f32
    Pass3_view.setFloat32(76, calc_constants.one_over_d2y, true);           // f32
    Pass3_view.setFloat32(80, calc_constants.one_over_d3y, true);       // f32
    Pass3_view.setFloat32(84, calc_constants.one_over_dxdy, true);           // f32
    Pass3_view.setFloat32(88, calc_constants.seaLevel, true);           // f32

    // BoundaryPass Bindings & Uniforms Config
    const BoundaryPass_BindGroupLayout = create_BoundaryPass_BindGroupLayout(device);
    const BoundaryPass_BindGroup = create_BoundaryPass_BindGroup(device, BoundaryPass_uniformBuffer, current_stateUVstar, txBottom, txWaves, txtemp);
    const BoundaryPass_uniforms = new ArrayBuffer(100); // allowing for 25 variables
    let BoundaryPass_view = new DataView(BoundaryPass_uniforms);
    BoundaryPass_view.setUint32(0, calc_constants.WIDTH, true);          // u32
    BoundaryPass_view.setUint32(4, calc_constants.HEIGHT, true);          // u32
    BoundaryPass_view.setFloat32(8, calc_constants.dt, true);             // f32
    BoundaryPass_view.setFloat32(12, calc_constants.dx, true);       // f32
    BoundaryPass_view.setFloat32(16, calc_constants.dy, true);           // f32
    BoundaryPass_view.setFloat32(20, 0.0, true);           // f32
    BoundaryPass_view.setUint32(24, calc_constants.reflect_x, true);       // f32
    BoundaryPass_view.setUint32(28, calc_constants.reflect_x, true);           // f32
    BoundaryPass_view.setFloat32(32, calc_constants.PI, true);           // f32
    BoundaryPass_view.setUint32(36, calc_constants.BoundaryWidth, true);       // f32
    BoundaryPass_view.setFloat32(40, calc_constants.seaLevel, true);           // f32
    BoundaryPass_view.setUint32(44, calc_constants.boundary_nx, true);           // f32
    BoundaryPass_view.setUint32(48, calc_constants.boundary_nx, true);           // f32
    BoundaryPass_view.setUint32(52, calc_constants.numberOfWaves, true);             // f32
    BoundaryPass_view.setUint32(56, calc_constants.west_boundary_type, true);       // f32
    BoundaryPass_view.setUint32(60, calc_constants.east_boundary_type, true);           // f32
    BoundaryPass_view.setUint32(64, calc_constants.south_boundary_type, true);           // f32
    BoundaryPass_view.setUint32(68, calc_constants.north_boundary_type, true);       // f32
    BoundaryPass_view.setFloat32(72, calc_constants.boundary_g, true);           // f32

    // Render Bindings
    const renderBindGroupLayout = createRenderBindGroupLayout(device);
    const renderBindGroup = createRenderBindGroup(device, txState, txBottom, textureSampler);

    // Fetch the source code of various shaders used in the application.
    const computeShaderCode = await fetchShader('/shaders/compute.wgsl');
    const Pass1_ShaderCode = await fetchShader('/shaders/Pass1.wgsl');
    const Pass2_ShaderCode = await fetchShader('/shaders/Pass2.wgsl');
    const Pass3_ShaderCode = (calc_constants.NLSW_or_Bous == 0)
        ? await fetchShader('/shaders/Pass3_NLSW.wgsl')
        : await fetchShader('/shaders/Pass3_Bous.wgsl');
    const BoundaryPass_ShaderCode = await fetchShader('/shaders/BoundaryPass.wgsl');

    const vertexShaderCode = await fetchShader('/shaders/vertex.wgsl');
    const fragmentShaderCode = await fetchShader('/shaders/fragment.wgsl');
    console.log("Shaders loaded.");

    // Configure the pipelines, one for each shader.
    const Pass1_Pipeline = createComputePipeline(device, Pass1_ShaderCode, Pass1_BindGroupLayout);
    const Pass2_Pipeline = createComputePipeline(device, Pass2_ShaderCode, Pass2_BindGroupLayout);
    const Pass3_Pipeline = createComputePipeline(device, Pass3_ShaderCode, Pass3_BindGroupLayout);
    const BoundaryPass_Pipeline = createComputePipeline(device, BoundaryPass_ShaderCode, BoundaryPass_BindGroupLayout);

    const renderPipeline = createRenderPipeline(device, vertexShaderCode, fragmentShaderCode, swapChainFormat, renderBindGroupLayout);
    console.log("Pipelines set up.");

    // The render pipeline will render a full-screen quad. This section of code sets up the vertices for that quad.

    // Define the vertices for a full-screen quad.
    // The quad covers the entire screen with coordinates from (-1,-1) to (1,1). 
    // It's made of two triangles: one from Vertex 0-1-2 and another from Vertex 2-1-3.
    const quadVertices = new Float32Array([
        -1.0, -1.0,   // bottom-left  -> Vertex 0
        -1.0, 1.0,    // top-left     -> Vertex 1
        1.0, -1.0,    // bottom-right -> Vertex 2
        1.0, 1.0      // top-right    -> Vertex 3
    ]);

    // Create a GPU buffer to hold the quad's vertices. 
    // The buffer is created with the `VERTEX` usage, indicating it will be used to store vertex data.
    // `mappedAtCreation` being set to `true` means we want immediate access to write to the buffer.
    const quadVertexBuffer = device.createBuffer({
        size: quadVertices.byteLength,     // The size of the buffer, in bytes.
        usage: GPUBufferUsage.VERTEX,      // This buffer will be used to store vertex data.
        mappedAtCreation: true             // The buffer will be mapped (accessible) as soon as it's created.
    });

    // Write the quad vertices data to the GPU buffer.
    // We get a mapped range (a writable view into the buffer) and set it with our quad vertices.
    new Float32Array(quadVertexBuffer.getMappedRange()).set(quadVertices);

    // After copying the data, we unmap the buffer, which means we're done writing to it.
    quadVertexBuffer.unmap();

    // Log that the buffers have been set up.
    console.log("Buffers set up.");

    let total_time = 0;          // Initialize time, which might be used for animations or simulations.
    let frame_count = 0;   // Counter to keep track of the number of rendered frames.

    console.log("Compute / Render loop starting.");
    // This function, `frame`, serves as the main loop of the application,
    // executing repeatedly to update simulation state and render the results.
    function frame() {

        // Create a new command encoder for recording GPU commands.
        const commandEncoder = device.createCommandEncoder();

         // loop through the compute shaders "render_step" times.  We use this approach
         // instead of putting an "if" loop on the render step, as it appears that the opening and
         // closing of the "commandEncoder" creates a significant slowdow in the computation, so
         // this way we only open and close it once for each frame rendered, instead of once for each
         // time step computed.  This allows for the maximum usage of the GPU
        for (let frame_c = 0; frame_c < calc_constants.render_step; frame_c++) {  // loop through the compute shaders "render_step" time

            // Increment the frame counter and the simulation time.
            frame_count += 1;
            total_time = frame_count * calc_constants.dt;  //simulation time

            // Pass1
            runComputeShader(device, commandEncoder, Pass1_uniformBuffer, Pass1_uniforms, Pass1_Pipeline, Pass1_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);

            // Pass2
            runComputeShader(device, commandEncoder, Pass2_uniformBuffer, Pass2_uniforms, Pass2_Pipeline, Pass2_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);

            // Pass3
            calc_constants.pred_or_corrector = 1;
            Pass3_view.setUint32(56, calc_constants.pred_or_corrector, true);       // f32
            runComputeShader(device, commandEncoder, Pass3_uniformBuffer, Pass3_uniforms, Pass3_Pipeline, Pass3_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);
            // put DuDt from predictor into predicted gradients
            commandEncoder.copyTextureToTexture(
                { texture: dU_by_dt },  //src
                { texture: predictedGradients },  //dst
                { width: calc_constants.WIDTH, height: calc_constants.HEIGHT, depthOrArrayLayers: 1 }
            );

            // BoundaryPass
            BoundaryPass_view.setFloat32(20, total_time, true);           // f32
            runComputeShader(device, commandEncoder, BoundaryPass_uniformBuffer, BoundaryPass_uniforms, BoundaryPass_Pipeline, BoundaryPass_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);
            // updated texture is stored in txtemp, but back into current_stateUVstar
            commandEncoder.copyTextureToTexture(
                { texture: txtemp },  //src
                { texture: current_stateUVstar },  //dst
                { width: calc_constants.WIDTH, height: calc_constants.HEIGHT, depthOrArrayLayers: 1 }
            );

            total_time = (frame_count + 1) * calc_constants.dt;

            if (calc_constants.timeScheme == 2)  // only called when using Predictor+Corrector method.  Adding corrector allows for a time step twice as large (also adds twice the computation) and provides a more accurate solution
            {
                // put txNewState into txState for the corrector equation, so gradients use the predicted values
                commandEncoder.copyTextureToTexture(
                    { texture: txNewState },  //src
                    { texture: txState },  //dst
                    { width: calc_constants.WIDTH, height: calc_constants.HEIGHT, depthOrArrayLayers: 1 }
                );

                // Pass1
                runComputeShader(device, commandEncoder, Pass1_uniformBuffer, Pass1_uniforms, Pass1_Pipeline, Pass1_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);

                // Pass2
                runComputeShader(device, commandEncoder, Pass2_uniformBuffer, Pass2_uniforms, Pass2_Pipeline, Pass2_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);

                // Pass3
                calc_constants.pred_or_corrector = 2;
                Pass3_view.setUint32(56, calc_constants.pred_or_corrector, true);       // f32
                runComputeShader(device, commandEncoder, Pass3_uniformBuffer, Pass3_uniforms, Pass3_Pipeline, Pass3_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);

                // BoundaryPass
                BoundaryPass_view.setFloat32(20, total_time, true);           // f32
                runComputeShader(device, commandEncoder, BoundaryPass_uniformBuffer, BoundaryPass_uniforms, BoundaryPass_Pipeline, BoundaryPass_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);
                // updated texture is stored in txtemp, but back into current_stateUVstar
                commandEncoder.copyTextureToTexture(
                    { texture: txtemp },  //src
                    { texture: current_stateUVstar },  //dst
                    { width: calc_constants.WIDTH, height: calc_constants.HEIGHT, depthOrArrayLayers: 1 }
                );
            }

            // shift gradient textures
            commandEncoder.copyTextureToTexture(
                { texture: oldGradients },  //src
                { texture: oldOldGradients },  //dst
                { width: calc_constants.WIDTH, height: calc_constants.HEIGHT, depthOrArrayLayers: 1 }
            );

            commandEncoder.copyTextureToTexture(
                { texture: predictedGradients },  //src
                { texture: oldGradients },  //dst
                { width: calc_constants.WIDTH, height: calc_constants.HEIGHT, depthOrArrayLayers: 1 }
            );


            // Copy future_ocean_texture back to ocean_texture
            commandEncoder.copyTextureToTexture(
                { texture: txNewState },  //src
                { texture: txState },  //dst
                { width: calc_constants.WIDTH, height: calc_constants.HEIGHT, depthOrArrayLayers: 1 }
            );
            commandEncoder.copyTextureToTexture(
                { texture: current_stateUVstar },  //src
                { texture: txstateUVstar },  //dst
                { width: calc_constants.WIDTH, height: calc_constants.HEIGHT, depthOrArrayLayers: 1 }
            );
        }

     //   console.log("Rendering data at time step: ", frame_count, " and time (min):", time / 60);
        // Define the settings for the render pass.
        // The render target is the current swap chain texture.
        const renderPassDescriptor = {
            colorAttachments: [{
                view: context.getCurrentTexture().createView(),
                loadOp: 'clear',
                storeOp: 'store',
                clearColor: { r: 0, g: 0, b: 0, a: 1 },
            }]
        };

        // Begin recording commands for the render pass.
        const renderPass = commandEncoder.beginRenderPass(renderPassDescriptor);

        // Set the render pipeline, bind group, and vertex buffer.
        renderPass.setPipeline(renderPipeline);
        renderPass.setBindGroup(0, renderBindGroup);
        renderPass.setVertexBuffer(0, quadVertexBuffer);

        // Issue draw command to draw the full-screen quad.
        renderPass.draw(4);  // Draw the quad with 4 vertices.

        // End the render pass after recording all its commands.
        renderPass.end();

        // Submit the recorded commands to the GPU for execution.
        device.queue.submit([commandEncoder.finish()]);

        requestAnimationFrame(frame);  // Call the next frame
    }

    // Invoke the `frame` function once to start the main loop.
    frame();
}

// This code initializes the WebGPU application.

// Call the `initializeWebGPUApp` asynchronous function. 
// This function sets up all the resources and processes required to run the WebGPU application.
initializeWebGPUApp().catch(error => {
    // If there's any error during the initialization, it will be caught here.

    // Log the error message to the console.
    console.error("Initialization failed:", error);
});
