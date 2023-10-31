// import source files
import { calc_constants, loadConfig, init_sim_parameters } from './constants_load_calc.js';  // variables and functions needed for init_sim_parameters
import { loadDepthSurface, loadWaveData, CreateGoogleMapImage, calculateGoogleMapScaleAndOffset } from './File_Loader.js';  // load depth surface and wave data file
import { readTextureData, downloadTextureData, downloadObjectAsFile, handleFileSelect, loadJsonIntoCalcConstants, saveRenderedImageAsJPEG, TexturetoImageData } from './File_Writer.js';  // load depth surface and wave data file
import { create_2D_Texture, create_2D_Image_Texture, create_1D_Texture, createUniformBuffer } from './Create_Textures.js';  // create texture function
import { copyBathyDataToTexture, copyWaveDataToTexture, copyInitialConditionDataToTexture, copyTridiagXDataToTexture, copyTridiagYDataToTexture } from './Copy_Data_to_Textures.js';  // fills in channels of txBottom
import { createRenderBindGroupLayout, createRenderBindGroup } from './Handler_Render.js';  // group bindings for render shaders
import { create_Pass1_BindGroupLayout, create_Pass1_BindGroup } from './Handler_Pass1.js';  // group bindings for Pass1 shaders
import { create_Pass2_BindGroupLayout, create_Pass2_BindGroup } from './Handler_Pass2.js';  // group bindings for Pass2 shaders
import { create_Pass3_BindGroupLayout, create_Pass3_BindGroup } from './Handler_Pass3.js';  // group bindings for Pass3 shaders
import { create_BoundaryPass_BindGroupLayout, create_BoundaryPass_BindGroup } from './Handler_BoundaryPass.js';  // group bindings for BoundaryPass shaders
import { create_Tridiag_BindGroupLayout, create_Tridiag_BindGroup } from './Handler_Tridiag.js';  // group bindings for Tridiag X and Y shaders
import { create_UpdateTrid_BindGroupLayout, create_UpdateTrid_BindGroup } from './Handler_UpdateTrid.js';  // group bindings for updating tridiag coef shader
import { create_CalcMeans_BindGroupLayout, create_CalcMeans_BindGroup } from './Handler_CalcMeans.js';  // group bindings for shader that calculates running means of state variables
import { create_CalcWaveHeight_BindGroupLayout, create_CalcWaveHeight_BindGroup } from './Handler_CalcWaveHeight.js';  // group bindings for shader that calculates running means of state variables
import { create_MouseClickChange_BindGroupLayout, create_MouseClickChange_BindGroup } from './Handler_MouseClickChange.js';  // group bindings for mouse click changes
import { createComputePipeline, createRenderPipeline } from './Config_Pipelines.js';  // pipeline config for ALL shaders
import { fetchShader, runComputeShader, runCopyTextures } from './Run_Compute_Shader.js';  // function to run shaders, works for all
import { runTridiagSolver } from './Run_Tridiag_Solver.js';  // function to run PCR triadiag solver, works for all


import { displayCalcConstants } from './display_parameters.js';  // starting point for display of simulation parameters


// Get a reference to the HTML canvas element with the ID 'webgpuCanvas'
const canvas = document.getElementById('webgpuCanvas');

// Access the WebGPU object. This is the entry point to the WebGPU API.
const gpu = navigator.gpu;

// globals in this source file
let device = null;
let txSaveOut = null;
let txScreen = null;
let txGoogleMap = null;
let context = null;
let adapter = null;

// Check if WebGPU is supported in the user's browser.
if (!gpu) {
    // If it's not supported, log an error message to the console.
    console.error("WebGPU is not supported in this browser.");
    // Throw an error to stop execution.
    throw new Error("WebGPU is not supported in this browser.");
}

// create an async function to handle configuration routines that must be performed in order, but also have imbedded async functions.
async function OrderedFunctions(configContent, bathymetryContent, waveContent) {
    // Set simulation parameters - this routine inits calc_constants to default values,
    // loads the json config file and places updated values in calc_constants, and then
    // sets and values of calc_constants that are dependent on inputs(e.g.dt)
    await init_sim_parameters(canvas, configContent);  // Ensure this completes first,canvas as input - update WIDTH and HEIGHT of canvas to match grid domain

    // Load depth surface file, place into 2D array bathy2D
    let bathy2D = await loadDepthSurface(bathymetryContent, calc_constants);  // Start this only after the first function completes
    // Load wave data file, place into waveArray 
    let { numberOfWaves, waveData } = await loadWaveData(waveContent);  // Start this only after the first function completes
    calc_constants.numberOfWaves = numberOfWaves; 
    return { bathy2D, waveData };
}

// This is an asynchronous function to set up the WebGPU context and resources.
async function initializeWebGPUApp(configContent, bathymetryContent, waveContent) {
    // Log a message indicating the start of the initialization process.
    console.log("Starting WebGPU App Initialization...");

    // Request an adapter. The adapter represents the GPU device, or a software fallback.
    const options = { powerPreference: "high-performance" };
    adapter = await gpu.requestAdapter(options);
    if (!adapter) {
        console.log('Failed to find a high-performance GPU adapter, using available GPU.');
        adapter = await gpu.requestAdapter();
    } else {
        console.log('Found high-performance GPU adapter.');
    }
    console.log("Adapter acquired.");

    // Request a device. The device is a representation of the GPU and allows for resource creation and command submission.
    device = await adapter.requestDevice({
        // Enable built-in validation
        requiredFeatures: [],
        requiredLimits: {},
        forceFallbackAdapter: false,
    });
    console.log("Device acquired.");

    // Get the WebGPU rendering context from the canvas.
    context = canvas.getContext('webgpu');

    // Define the format for our swap chain. 'bgra8unorm' is a commonly used format.
    const swapChainFormat = 'bgra8unorm';

    // Configure the WebGPU context with the device, format, and desired texture usage.
    context.configure({
        device: device,
        format: swapChainFormat,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
    });

    // load the simulation parameters, the 2D depth surface, and the wave data.  "Ordered" as the sequence of how these files are loaded is important
    let { bathy2D, waveData } = await OrderedFunctions(configContent, bathymetryContent, waveContent);

    // Create buffers for storing uniform data. This buffer will be used to send parameter data to shaders.
    const Pass1_uniformBuffer = createUniformBuffer(device);
    const Pass2_uniformBuffer = createUniformBuffer(device);
    const Pass3_uniformBuffer = createUniformBuffer(device);
    const BoundaryPass_uniformBuffer = createUniformBuffer(device);
    const TridiagX_uniformBuffer = createUniformBuffer(device);
    const TridiagY_uniformBuffer = createUniformBuffer(device);
    const UpdateTrid_uniformBuffer = createUniformBuffer(device);
    const CalcMeans_uniformBuffer = createUniformBuffer(device);
    const CalcWaveHeight_uniformBuffer = createUniformBuffer(device);
    const MouseClickChange_uniformBuffer = createUniformBuffer(device);
    const Render_uniformBuffer = createUniformBuffer(device);

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
    const current_stateUVstar = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const txH = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const txU = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const txV = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const txW = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const txC = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const txXFlux = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const txYFlux = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const predictedGradients = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const oldGradients = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const oldOldGradients = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const predictedF_G_star = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const F_G_star_oldGradients = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const F_G_star_oldOldGradients = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const txtemp_boundary = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const txtemp_PCRx = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const txtemp_PCRy = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const txtemp2_PCRx = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const txtemp2_PCRy = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const txtemp_MouseClick = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const coefMatx = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const coefMaty = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const newcoef_x = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const newcoef_y = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const dU_by_dt = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const txShipPressure = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const txMeans = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const txtemp_Means = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const txWaveHeight = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    const txtemp_WaveHeight = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);
    txSaveOut = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT);  // used for bindary output
    txScreen = create_2D_Image_Texture(device, canvas.width, canvas.height);  // used for jpg output
    txGoogleMap = create_2D_Texture(device, calc_constants.GMapImageWidth, calc_constants.GMapImageHeight);  // used to store the loaded Google Maps image

    const txWaves = create_1D_Texture(device, calc_constants.numberOfWaves);  // stores spectrum wave input

    // fill in the bathy texture
    let bathy2Dvec = copyBathyDataToTexture(calc_constants, bathy2D, device, txBottom);

    // fill in the wave data texture
    if (calc_constants.numberOfWaves > 0) {
        copyWaveDataToTexture(calc_constants, waveData, device, txWaves);
    }

    // create initial condition
    copyInitialConditionDataToTexture(calc_constants, device, txState);
    copyInitialConditionDataToTexture(calc_constants, device, txstateUVstar);

    // create tridiag coef matrices
    copyTridiagXDataToTexture(calc_constants, bathy2D, device, coefMatx, bathy2Dvec);
    copyTridiagYDataToTexture(calc_constants, bathy2D, device, coefMaty, bathy2Dvec);

    // load Google Mapls image
    if (calc_constants.GoogleMapOverlay == 1) {  // if using overlay

        let ImageGoogleMap = await CreateGoogleMapImage(device, context, calc_constants.lat_LL, calc_constants.lon_LL, calc_constants.lat_UR, calc_constants.lon_UR, calc_constants.GMapImageWidth, calc_constants.GMapImageHeight);

        console.log('Google Maps image loaded, dimensions:', ImageGoogleMap.width, 'x', ImageGoogleMap.height);

        console.log(ImageGoogleMap)

        // Now that the image is loaded, you can copy it to the texture.
        device.queue.copyExternalImageToTexture(
            { source: ImageGoogleMap },
            { texture: txGoogleMap },
            { width: ImageGoogleMap.width, height: ImageGoogleMap.height }
        );

        console.log(txGoogleMap);

        let transforms = calculateGoogleMapScaleAndOffset(calc_constants.lat_LL, calc_constants.lon_LL, calc_constants.lat_UR, calc_constants.lon_UR, calc_constants.GMapImageWidth, calc_constants.GMapImageHeight);
        console.log(transforms);
        calc_constants.GMscaleX = transforms.scaleX;
        calc_constants.GMscaleY = transforms.scaleY;
        calc_constants.GMoffsetX = transforms.offsetX;
        calc_constants.GMoffsetY = transforms.offsetY;

        calc_constants.IsGoogleMapLoaded = 1;
    }



    // layouts describe the resources (buffers, textures, samplers) that the shaders will use.

    // Pass1 Bindings & Uniforms Config
    const Pass1_BindGroupLayout = create_Pass1_BindGroupLayout(device);
    const Pass1_BindGroup = create_Pass1_BindGroup(device, Pass1_uniformBuffer, txState, txBottom, txH, txU, txV, txC);
    const Pass1_uniforms = new ArrayBuffer(256);  // smallest multiple of 256
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
    const Pass2_uniforms = new ArrayBuffer(256);  // smallest multiple of 256
    let Pass2_view = new DataView(Pass2_uniforms);
    Pass2_view.setUint32(0, calc_constants.WIDTH, true);          // u32
    Pass2_view.setUint32(4, calc_constants.HEIGHT, true);          // u32
    Pass2_view.setFloat32(8, calc_constants.g, true);             // f32
    Pass2_view.setFloat32(12, calc_constants.half_g, true);       // f32
    Pass2_view.setFloat32(16, calc_constants.dx, true);           // f32
    Pass2_view.setFloat32(20, calc_constants.dy, true);           // f32

    // Pass3 Bindings & Uniforms Config
    const Pass3_BindGroupLayout = create_Pass3_BindGroupLayout(device);
    const Pass3_BindGroup = create_Pass3_BindGroup(device, Pass3_uniformBuffer, txState, txBottom, txH, txXFlux, txYFlux, oldGradients, oldOldGradients, predictedGradients, F_G_star_oldGradients, F_G_star_oldOldGradients, txstateUVstar, txShipPressure, txNewState, dU_by_dt, predictedF_G_star, current_stateUVstar);
    const Pass3_uniforms = new ArrayBuffer(256);  // smallest multiple of 256
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
    Pass3_view.setFloat32(92, calc_constants.dissipation_threshold, true);           // f32
    Pass3_view.setFloat32(96, calc_constants.whiteWaterDecayRate, true);           // f32


    // BoundaryPass Bindings & Uniforms Config
    const BoundaryPass_BindGroupLayout = create_BoundaryPass_BindGroupLayout(device);
    const BoundaryPass_BindGroup = create_BoundaryPass_BindGroup(device, BoundaryPass_uniformBuffer, current_stateUVstar, txBottom, txWaves, txtemp_boundary);
    const BoundaryPass_BindGroup_NewState = create_BoundaryPass_BindGroup(device, BoundaryPass_uniformBuffer, current_stateUVstar, txBottom, txWaves, txtemp_boundary);
    const BoundaryPass_uniforms = new ArrayBuffer(256);  // smallest multiple of 256
    let BoundaryPass_view = new DataView(BoundaryPass_uniforms);
    BoundaryPass_view.setUint32(0, calc_constants.WIDTH, true);          // u32
    BoundaryPass_view.setUint32(4, calc_constants.HEIGHT, true);          // u32
    BoundaryPass_view.setFloat32(8, calc_constants.dt, true);             // f32
    BoundaryPass_view.setFloat32(12, calc_constants.dx, true);       // f32
    BoundaryPass_view.setFloat32(16, calc_constants.dy, true);           // f32
    BoundaryPass_view.setFloat32(20, 0, true);           // f32
    BoundaryPass_view.setInt32(24, calc_constants.reflect_x, true);       // f32
    BoundaryPass_view.setInt32(28, calc_constants.reflect_x, true);           // f32
    BoundaryPass_view.setFloat32(32, calc_constants.PI, true);           // f32
    BoundaryPass_view.setInt32(36, calc_constants.BoundaryWidth, true);       // f32
    BoundaryPass_view.setFloat32(40, calc_constants.seaLevel, true);           // f32
    BoundaryPass_view.setInt32(44, calc_constants.boundary_nx, true);           // f32
    BoundaryPass_view.setInt32(48, calc_constants.boundary_nx, true);           // f32
    BoundaryPass_view.setInt32(52, calc_constants.numberOfWaves, true);             // f32
    BoundaryPass_view.setInt32(56, calc_constants.west_boundary_type, true);       // f32
    BoundaryPass_view.setInt32(60, calc_constants.east_boundary_type, true);           // f32
    BoundaryPass_view.setInt32(64, calc_constants.south_boundary_type, true);           // f32
    BoundaryPass_view.setInt32(68, calc_constants.north_boundary_type, true);       // f32
    BoundaryPass_view.setFloat32(72, calc_constants.boundary_g, true);           // f32

    // TridiagX - Bindings & Uniforms Config
    const TridiagX_BindGroupLayout = create_Tridiag_BindGroupLayout(device);
    const TridiagX_BindGroup = create_Tridiag_BindGroup(device, TridiagX_uniformBuffer, newcoef_x, txNewState, current_stateUVstar, txtemp_PCRx, txtemp2_PCRx);
    const TridiagX_uniforms = new ArrayBuffer(256);  // smallest multiple of 256
    let TridiagX_view = new DataView(TridiagX_uniforms);
    TridiagX_view.setInt32(0, calc_constants.WIDTH, true);          // i32
    TridiagX_view.setInt32(4, calc_constants.HEIGHT, true);          // i32
    TridiagX_view.setInt32(8, calc_constants.Px, true);             // i32, holds "p"
    TridiagX_view.setInt32(12, 1, true);            // i32, hols "s"

    // TridiagY - Bindings & Uniforms Config
    const TridiagY_BindGroupLayout = create_Tridiag_BindGroupLayout(device);
    const TridiagY_BindGroup = create_Tridiag_BindGroup(device, TridiagY_uniformBuffer, newcoef_y, txNewState, current_stateUVstar, txtemp_PCRy, txtemp2_PCRy);
    const TridiagY_uniforms = new ArrayBuffer(256);  // smallest multiple of 256
    let TridiagY_view = new DataView(TridiagY_uniforms);
    TridiagY_view.setInt32(0, calc_constants.WIDTH, true);          // i32
    TridiagY_view.setInt32(4, calc_constants.HEIGHT, true);          // i32
    TridiagY_view.setInt32(8, calc_constants.Py, true);             // i32, holds "p"
    TridiagY_view.setInt32(12, 1, true);            // i32, hols "s"

    // UpdateTrid -  Bindings & Uniforms Config
    const UpdateTrid_BindGroupLayout = create_UpdateTrid_BindGroupLayout(device);
    const UpdateTrid_BindGroup = create_UpdateTrid_BindGroup(device, UpdateTrid_uniformBuffer, txBottom, txNewState, coefMatx, coefMaty);
    const UpdateTrid_uniforms = new ArrayBuffer(256);  // smallest multiple of 256s
    let UpdateTrid_view = new DataView(UpdateTrid_uniforms);
    UpdateTrid_view.setUint32(0, calc_constants.WIDTH, true);          // i32
    UpdateTrid_view.setUint32(4, calc_constants.HEIGHT, true);          // i32
    UpdateTrid_view.setFloat32(8, calc_constants.dx, true);             // f32
    UpdateTrid_view.setFloat32(12, calc_constants.dy, true);             // f32
    UpdateTrid_view.setFloat32(16, calc_constants.Bcoef, true);             // f32

    // CalcMeans -  Bindings & Uniforms Config
    const CalcMeans_BindGroupLayout = create_CalcMeans_BindGroupLayout(device);
    const CalcMeans_BindGroup = create_CalcMeans_BindGroup(device, CalcMeans_uniformBuffer, txMeans, txNewState, txtemp_Means);
    const CalcMeans_uniforms = new ArrayBuffer(256);  // smallest multiple of 256s
    let CalcMeans_view = new DataView(CalcMeans_uniforms);
    CalcMeans_view.setInt32(0, calc_constants.n_time_steps_means, true);          // i32

    // CalcWaveHeight -  Bindings & Uniforms Config
    const CalcWaveHeight_BindGroupLayout = create_CalcWaveHeight_BindGroupLayout(device);
    const CalcWaveHeight_BindGroup = create_CalcWaveHeight_BindGroup(device, CalcWaveHeight_uniformBuffer, txstateUVstar, txNewState, txMeans, txWaveHeight, txtemp_WaveHeight);
    const CalcWaveHeight_uniforms = new ArrayBuffer(256);  // smallest multiple of 256s
    let CalcWaveHeight_view = new DataView(CalcWaveHeight_uniforms);
    CalcWaveHeight_view.setInt32(0, calc_constants.n_time_steps_waveheight, true);          // i32

    // MouseClickChange -  Bindings & Uniforms Config
    const MouseClickChange_BindGroupLayout = create_MouseClickChange_BindGroupLayout(device);
    const MouseClickChange_BindGroup = create_MouseClickChange_BindGroup(device, MouseClickChange_uniformBuffer, txBottom, txtemp_MouseClick);
    const MouseClickChange_uniforms = new ArrayBuffer(256);  // smallest multiple of 256s
    let MouseClickChange_view = new DataView(MouseClickChange_uniforms);
    MouseClickChange_view.setUint32(0, calc_constants.WIDTH, true);          // i32
    MouseClickChange_view.setUint32(4, calc_constants.HEIGHT, true);          // i32
    MouseClickChange_view.setFloat32(8, calc_constants.dx, true);             // f32
    MouseClickChange_view.setFloat32(12, calc_constants.dy, true);             // f32
    MouseClickChange_view.setFloat32(16, calc_constants.xClick, true);             // f32
    MouseClickChange_view.setFloat32(20, calc_constants.yClick, true);             // f32
    MouseClickChange_view.setFloat32(24, calc_constants.changeRadius, true);             // f32
    MouseClickChange_view.setFloat32(28, calc_constants.changeAmplitude, true);             // f32

    // Render Bindings
    const RenderBindGroupLayout = createRenderBindGroupLayout(device);
    const RenderBindGroup = createRenderBindGroup(device, Render_uniformBuffer, txNewState, txBottom, txMeans, txWaveHeight, txGoogleMap, textureSampler);
    const Render_uniforms = new ArrayBuffer(256);  // smallest multiple of 256
    let Render_view = new DataView(Render_uniforms);
    Render_view.setFloat32(0, calc_constants.colorVal_max, true);          // f32
    Render_view.setFloat32(4, calc_constants.colorVal_min, true);          // f32
    Render_view.setInt32(8, calc_constants.colorMap_choice, true);             // i32
    Render_view.setInt32(12, calc_constants.surfaceToPlot, true);             // i32
    Render_view.setInt32(16, calc_constants.showBreaking, true);             // i32
    Render_view.setInt32(20, calc_constants.GoogleMapOverlay, true);             // i32
    Render_view.setFloat32(24, calc_constants.GMscaleX, true);          // f32
    Render_view.setFloat32(28, calc_constants.GMscaleY, true);          // f32
    Render_view.setFloat32(32, calc_constants.GMoffsetX, true);          // f32
    Render_view.setFloat32(36, calc_constants.GMoffsetY, true);          // f32
    Render_view.setFloat32(40, calc_constants.dx, true);          // f32
    Render_view.setFloat32(44, calc_constants.dy, true);          // f32
    Render_view.setInt32(48, calc_constants.WIDTH, true);          // f32
    Render_view.setInt32(52, calc_constants.HEIGHT, true);          // f32


    // Fetch the source code of various shaders used in the application.
    const Pass1_ShaderCode = await fetchShader('/shaders/Pass1.wgsl');
    const Pass2_ShaderCode = await fetchShader('/shaders/Pass2.wgsl');
    const Pass3_ShaderCode_NLSW = await fetchShader('/shaders/Pass3_NLSW.wgsl')
    const Pass3_ShaderCode_Bous = await fetchShader('/shaders/Pass3_Bous.wgsl');
    const BoundaryPass_ShaderCode = await fetchShader('/shaders/BoundaryPass.wgsl');
    const TridiagX_ShaderCode = await fetchShader('/shaders/TriDiag_PCRx.wgsl');
    const TridiagY_ShaderCode = await fetchShader('/shaders/TriDiag_PCRy.wgsl');
    const UpdateTrid_ShaderCode = await fetchShader('/shaders/Update_TriDiag_coef.wgsl');
    const CalcMeans_ShaderCode = await fetchShader('/shaders/CalcMeans.wgsl');
    const CalcWaveHeight_ShaderCode = await fetchShader('/shaders/CalcWaveHeight.wgsl');
    const MouseClickChange_ShaderCode = await fetchShader('/shaders/MouseClickChange.wgsl');

    const vertexShaderCode = await fetchShader('/shaders/vertex.wgsl');
    const fragmentShaderCode = await fetchShader('/shaders/fragment.wgsl');
    console.log("Shaders loaded.");

    // Configure the pipelines, one for each shader.
    const Pass1_Pipeline = createComputePipeline(device, Pass1_ShaderCode, Pass1_BindGroupLayout);
    const Pass2_Pipeline = createComputePipeline(device, Pass2_ShaderCode, Pass2_BindGroupLayout);
    const Pass3_Pipeline_NLSW = createComputePipeline(device, Pass3_ShaderCode_NLSW, Pass3_BindGroupLayout);
    const Pass3_Pipeline_Bous = createComputePipeline(device, Pass3_ShaderCode_Bous, Pass3_BindGroupLayout);
    const BoundaryPass_Pipeline = createComputePipeline(device, BoundaryPass_ShaderCode, BoundaryPass_BindGroupLayout);
    const TridiagX_Pipeline = createComputePipeline(device, TridiagX_ShaderCode, TridiagX_BindGroupLayout);
    const TridiagY_Pipeline = createComputePipeline(device, TridiagY_ShaderCode, TridiagY_BindGroupLayout);
    const UpdateTrid_Pipeline = createComputePipeline(device, UpdateTrid_ShaderCode, UpdateTrid_BindGroupLayout);
    const CalcMeans_Pipeline = createComputePipeline(device, CalcMeans_ShaderCode, CalcMeans_BindGroupLayout);
    const CalcWaveHeight_Pipeline = createComputePipeline(device, CalcWaveHeight_ShaderCode, CalcWaveHeight_BindGroupLayout);
    const MouseClickChange_Pipeline = createComputePipeline(device, MouseClickChange_ShaderCode, MouseClickChange_BindGroupLayout);

    const RenderPipeline = createRenderPipeline(device, vertexShaderCode, fragmentShaderCode, swapChainFormat, RenderBindGroupLayout);
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
    let frame_count_since_http_update = 0;   // Counter to keep track of the number of rendered frames.
    let total_time_since_http_update = 0;          // Initialize time, which might be used for animations or simulations.
    let frame_count_find_render_step = 0;   // Counter to keep track of the number of rendered frames.

    // variables needed for the "render_step" optimziation
    let startTime_find_render_step = new Date();
    let total_time_find_render_step = 0.;
    let adapt_render_step = 1;
    let render_step_up_or_down = 1;
    let clock_time_render_stop_old = -1.;
    let clock_time_render_stop_new = 0.;
    let render_update_n_since_change = 0;

    console.log("Compute / Render loop starting.");
    // This function, `frame`, serves as the main loop of the application,
    // executing repeatedly to update simulation state and render the results.

    var startTime = new Date();  // This captures the current time, or the time at the start of rendering
    function frame() {

        // render step find logic, trying to find a render step that both maximizes the usage of the GPU
        // but does not over work it.  The need for this logic is that if the GPU is too overworked, which
        // here means that there is too much wall clock time between renderings of the wave field, the html
        // and javascript interface seems to lose sync with the gpu, causing the error "GPU Connection Lost."  While some
        // parts of the js will continue to run after this error, it is a fatal error on the canvas, and rendering
        // to screen can not be re-started without a complete reload/refresh (AFSIK).  The code below will look to
        // update the render step (number of compute steps per screen render) every 1.0 second (this seems like a
        // reasonable number, but could be larger potentially for slower machines).  If the wall clock time per
        // compute time step is 90% less than the value from the previous 1 second, this implies that we are not
        // maximizing the usage of the GPU, and we can increase "render_step."  From trial and error, it seems that if
        // this ratio floats slightly above 1 (using 1.01) this is a reasonable indicator that the GPU is in a
        // near-max utilization state, without much headroom for additional computations - in this situation, we
        // decrease the "render_step."  Also, if the "render_step" has not changed over the past 10 seconds, we step
        // it up by one value to see if we can push performance.  If this is too much, "render_step" will quickly decrease
        // back down to its original value.
        if (adapt_render_step == 1 && calc_constants.simPause < 0) {
            frame_count_find_render_step += 1;
            total_time_find_render_step = (new Date()) - startTime_find_render_step;
            if (total_time_find_render_step > 1.0*1000.) {  // update renderstep every 1 second
                let number_of_time_steps = frame_count_find_render_step * calc_constants.render_step;
                clock_time_render_stop_new = total_time_find_render_step / number_of_time_steps;
                if (clock_time_render_stop_old > 0.0) {
                    let ratio = clock_time_render_stop_new / clock_time_render_stop_old;
                    if (render_step_up_or_down < 0) {
                        ratio = 1 / ratio;
                    }
                    render_step_up_or_down = 0;
                    if (ratio < 0.9 || render_update_n_since_change > 10) {
                        calc_constants.render_step = calc_constants.render_step + 1;
                        render_step_up_or_down = 1;
                        render_update_n_since_change = 0;
                    //    console.log('Increasing render step');
                    } else if (ratio > 1.001) {
                        calc_constants.render_step = Math.max(1, calc_constants.render_step - 1);
                        render_step_up_or_down = -1;
                        render_update_n_since_change = 0;
                    //    console.log('Decreasing render step');
                    } else {
                        render_update_n_since_change += 1;
                    }
                } else {
                    calc_constants.render_step = calc_constants.render_step + 1;  // after first 10 seconds step up to 2
                }
                clock_time_render_stop_old = clock_time_render_stop_new;
                frame_count_find_render_step = 0;
                startTime_find_render_step = new Date();

            }

        }

        // update simulation parameters in buffers if they have been changed by user through html
        if (calc_constants.html_update > 0) {

            calc_constants.dt = calc_constants.Courant_num * calc_constants.dx / Math.sqrt(calc_constants.g * calc_constants.base_depth);
            calc_constants.TWO_THETA = calc_constants.Theta * 2.0;
            calc_constants.render_step = Math.round(calc_constants.render_step);

            Pass1_view.setFloat32(20, calc_constants.TWO_THETA, true);           // f32
            Pass1_view.setFloat32(32, calc_constants.dt, true);           // f32
            Pass3_view.setFloat32(8, calc_constants.dt, true);             // f32
            Pass3_view.setUint32(36, calc_constants.timeScheme, true);       // f32
            Pass3_view.setUint32(44, calc_constants.isManning, true);           // f32
            Pass3_view.setFloat32(52, calc_constants.friction, true);             // f32
            Pass3_view.setFloat32(88, calc_constants.seaLevel, true);           // f32
            Pass3_view.setFloat32(92, calc_constants.dissipation_threshold, true);           // f32
            Pass3_view.setFloat32(96, calc_constants.whiteWaterDecayRate, true);           // f32

            BoundaryPass_view.setFloat32(8, calc_constants.dt, true);             // f32
            BoundaryPass_view.setFloat32(40, calc_constants.seaLevel, true);           // f32
            BoundaryPass_view.setInt32(56, calc_constants.west_boundary_type, true);       // f32
            BoundaryPass_view.setInt32(60, calc_constants.east_boundary_type, true);           // f32
            BoundaryPass_view.setInt32(64, calc_constants.south_boundary_type, true);           // f32
            BoundaryPass_view.setInt32(68, calc_constants.north_boundary_type, true);       // f32

            Render_view.setFloat32(0, calc_constants.colorVal_max, true);          // f32
            Render_view.setFloat32(4, calc_constants.colorVal_min, true);          // f32
            Render_view.setInt32(8, calc_constants.colorMap_choice, true);             // i32
            Render_view.setInt32(12, calc_constants.surfaceToPlot, true);             // i32
            Render_view.setInt32(16, calc_constants.showBreaking, true);             // i32
            Render_view.setInt32(20, calc_constants.GoogleMapOverlay, true);             // i32

            startTime = new Date();  // This captures the current time, or the time at the start of rendering
            frame_count_since_http_update = 0;

            calc_constants.html_update = -1;
        }

        // update surfaces following user clicks
        if (calc_constants.click_update > 0) {

            MouseClickChange_view.setFloat32(16, calc_constants.xClick, true);             // f32
            MouseClickChange_view.setFloat32(20, calc_constants.yClick, true);             // f32
            MouseClickChange_view.setFloat32(24, calc_constants.changeRadius, true);             // f32
            MouseClickChange_view.setFloat32(28, calc_constants.changeAmplitude, true);             // f32

            runComputeShader(device, commandEncoder, MouseClickChange_uniformBuffer, MouseClickChange_uniforms, MouseClickChange_Pipeline, MouseClickChange_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);  // update depth based on mouse click
            // put modified texture back into txBottom from predictor into predicted gradients
            runCopyTextures(device, commandEncoder, calc_constants, txtemp_MouseClick, txBottom)

            if (calc_constants.NLSW_or_Bous > 0) {
                console.log('Updating tridiag coef due to change in depth')
                runComputeShader(device, commandEncoder, UpdateTrid_uniformBuffer, UpdateTrid_uniforms, UpdateTrid_Pipeline, UpdateTrid_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);  //need to update tridiagonal coefficients due to change inn depth
            }
            calc_constants.click_update = -1;
        }

         // loop through the compute shaders "render_step" times.  
        var commandEncoder;  // init the encoder
        if (calc_constants.simPause < 0) {// do not run compute loop when > 0, when the simulation is paused {
            for (let frame_c = 0; frame_c < calc_constants.render_step; frame_c++) {  // loop through the compute shaders "render_step" time

                // Increment the frame counter and the simulation time.
                frame_count += 1;
                frame_count_since_http_update += 1;

                total_time = frame_count * calc_constants.dt;  //simulation time
                total_time_since_http_update = frame_count_since_http_update * calc_constants.dt; // simulation time sinze last change to interface

                // Pass1
                runComputeShader(device, commandEncoder, Pass1_uniformBuffer, Pass1_uniforms, Pass1_Pipeline, Pass1_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);

                // Pass2
                runComputeShader(device, commandEncoder, Pass2_uniformBuffer, Pass2_uniforms, Pass2_Pipeline, Pass2_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);

                // Pass3
                calc_constants.pred_or_corrector = 1;  //set to p[redcitor step]
                Pass3_view.setUint32(56, calc_constants.pred_or_corrector, true);       // f32
                if (calc_constants.NLSW_or_Bous > 0) { //BOUS
                    runComputeShader(device, commandEncoder, Pass3_uniformBuffer, Pass3_uniforms, Pass3_Pipeline_Bous, Pass3_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);
                }
                else { //NLSW
                    runComputeShader(device, commandEncoder, Pass3_uniformBuffer, Pass3_uniforms, Pass3_Pipeline_NLSW, Pass3_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);
                }

                // put DuDt from predictor into predicted gradients
                runCopyTextures(device, commandEncoder, calc_constants, dU_by_dt, predictedGradients)

                // BoundaryPass
                BoundaryPass_view.setFloat32(20, total_time, true);           // set current time
                runComputeShader(device, commandEncoder, BoundaryPass_uniformBuffer, BoundaryPass_uniforms, BoundaryPass_Pipeline, BoundaryPass_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);
                // updated texture is stored in txtemp, but back into current_stateUVstar
                runCopyTextures(device, commandEncoder, calc_constants, txtemp_boundary, current_stateUVstar)
                runCopyTextures(device, commandEncoder, calc_constants, txtemp_boundary, txNewState)

                //Tridiag Solver for Bous, or copy for NLSW
                if (calc_constants.NLSW_or_Bous > 0) {

                    //   runComputeShader(device, commandEncoder, UpdateTrid_uniformBuffer, UpdateTrid_uniforms, UpdateTrid_Pipeline, UpdateTrid_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);  //potential placehold for nonlinear-dispersive model

                    runTridiagSolver(device, commandEncoder, calc_constants, txNewState, coefMatx, coefMaty, newcoef_x, newcoef_y, txtemp_PCRx, txtemp_PCRy, txtemp2_PCRx, txtemp2_PCRy,
                        TridiagX_uniformBuffer, TridiagX_uniforms, TridiagX_Pipeline, TridiagX_BindGroup, TridiagX_view,
                        TridiagY_uniformBuffer, TridiagY_uniforms, TridiagY_Pipeline, TridiagY_BindGroup, TridiagY_view,
                        runComputeShader, runCopyTextures
                    )

                    runComputeShader(device, commandEncoder, BoundaryPass_uniformBuffer, BoundaryPass_uniforms, BoundaryPass_Pipeline, BoundaryPass_BindGroup_NewState, calc_constants.DispatchX, calc_constants.DispatchY);

                    // Shift back FG textures - only have to do this for Bous, and only after predictor step
                    runCopyTextures(device, commandEncoder, calc_constants, F_G_star_oldGradients, F_G_star_oldOldGradients)
                    runCopyTextures(device, commandEncoder, calc_constants, predictedF_G_star, F_G_star_oldGradients)

                }


                total_time = (frame_count + 1) * calc_constants.dt;  // boundary needs to be applied at time level n+1, since this is done on predicted values

                if (calc_constants.timeScheme == 2)  // only called when using Predictor+Corrector method.  Adding corrector allows for a time step twice as large (also adds twice the computation) and provides a more accurate solution
                {
                    // put txNewState into txState for the corrector equation, so gradients use the predicted values
                    runCopyTextures(device, commandEncoder, calc_constants, txNewState, txState)

                    // Pass1
                    runComputeShader(device, commandEncoder, Pass1_uniformBuffer, Pass1_uniforms, Pass1_Pipeline, Pass1_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);

                    // Pass2
                    runComputeShader(device, commandEncoder, Pass2_uniformBuffer, Pass2_uniforms, Pass2_Pipeline, Pass2_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);

                    // Pass3
                    calc_constants.pred_or_corrector = 2;
                    Pass3_view.setUint32(56, calc_constants.pred_or_corrector, true);       // f32
                    if (calc_constants.NLSW_or_Bous > 0) { //BOUS
                        runComputeShader(device, commandEncoder, Pass3_uniformBuffer, Pass3_uniforms, Pass3_Pipeline_Bous, Pass3_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);
                    }
                    else { //NLSW
                        runComputeShader(device, commandEncoder, Pass3_uniformBuffer, Pass3_uniforms, Pass3_Pipeline_NLSW, Pass3_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);
                    }

                    // BoundaryPass
                    runComputeShader(device, commandEncoder, BoundaryPass_uniformBuffer, BoundaryPass_uniforms, BoundaryPass_Pipeline, BoundaryPass_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);
                    // updated texture is stored in txtemp, but back into current_stateUVstar
                    runCopyTextures(device, commandEncoder, calc_constants, txtemp_boundary, current_stateUVstar)
                    runCopyTextures(device, commandEncoder, calc_constants, txtemp_boundary, txNewState)

                    //Tridiag Solver for Bous, or copy for NLSW
                    if (calc_constants.NLSW_or_Bous > 0) {

                        //                runComputeShader(device, commandEncoder, UpdateTrid_uniformBuffer, UpdateTrid_uniforms, UpdateTrid_Pipeline, UpdateTrid_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY); //potential placehold for nonlinear-dispersive model

                        runTridiagSolver(device, commandEncoder, calc_constants, txNewState, coefMatx, coefMaty, newcoef_x, newcoef_y, txtemp_PCRx, txtemp_PCRy, txtemp2_PCRx, txtemp2_PCRy,
                            TridiagX_uniformBuffer, TridiagX_uniforms, TridiagX_Pipeline, TridiagX_BindGroup, TridiagX_view,
                            TridiagY_uniformBuffer, TridiagY_uniforms, TridiagY_Pipeline, TridiagY_BindGroup, TridiagY_view,
                            runComputeShader, runCopyTextures
                        )
                        runComputeShader(device, commandEncoder, BoundaryPass_uniformBuffer, BoundaryPass_uniforms, BoundaryPass_Pipeline, BoundaryPass_BindGroup_NewState, calc_constants.DispatchX, calc_constants.DispatchY);
                    }
                }

                //  Update Statistics - means and wave height
                calc_constants.n_time_steps_means += 1;
                CalcMeans_view.setInt32(0, calc_constants.n_time_steps_means, true);          // i32
                runComputeShader(device, commandEncoder, CalcMeans_uniformBuffer, CalcMeans_uniforms, CalcMeans_Pipeline, CalcMeans_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);
                runCopyTextures(device, commandEncoder, calc_constants, txtemp_Means, txMeans)

                calc_constants.n_time_steps_waveheight += 1;
                CalcWaveHeight_view.setInt32(0, calc_constants.n_time_steps_waveheight, true);          // i32
                runComputeShader(device, commandEncoder, CalcWaveHeight_uniformBuffer, CalcWaveHeight_uniforms, CalcWaveHeight_Pipeline, CalcWaveHeight_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);
                runCopyTextures(device, commandEncoder, calc_constants, txtemp_WaveHeight, txWaveHeight)

                // shift gradient textures
                runCopyTextures(device, commandEncoder, calc_constants, oldGradients, oldOldGradients)
                runCopyTextures(device, commandEncoder, calc_constants, predictedGradients, oldGradients)

                // Copy future_ocean_texture back to ocean_texture
                runCopyTextures(device, commandEncoder, calc_constants, txNewState, txState)
                runCopyTextures(device, commandEncoder, calc_constants, current_stateUVstar, txstateUVstar)
            }
        }

        // Define the settings for the render pass.
        // The render target is the current swap chain texture.
        const RenderPassDescriptor = {
            colorAttachments: [{
                view: context.getCurrentTexture().createView(),
                loadOp: 'clear',
                storeOp: 'store',
                clearColor: { r: 0, g: 0, b: 0, a: 1 },
            }]
        };

        commandEncoder = device.createCommandEncoder();

        // set uniforms buffer
        device.queue.writeBuffer(Render_uniformBuffer, 0, Render_uniforms);

        // Begin recording commands for the render pass.
        const RenderPass = commandEncoder.beginRenderPass(RenderPassDescriptor);

        // Set the render pipeline, bind group, and vertex buffer.
        RenderPass.setPipeline(RenderPipeline);
        RenderPass.setBindGroup(0, RenderBindGroup);
        RenderPass.setVertexBuffer(0, quadVertexBuffer);

        // Issue draw command to draw the full-screen quad.
        RenderPass.draw(4);  // Draw the quad with 4 vertices.

        // End the render pass after recording all its commands.
        RenderPass.end();

        // Submit the recorded commands to the GPU for execution.
        device.queue.submit([commandEncoder.finish()]);
        // end screen render

        // store the current screen render as a texture, and then copy to a storage texture that will not be destroyed.  This is for creating jpgs, animations
        const current_render = context.getCurrentTexture();
        commandEncoder = device.createCommandEncoder();

        commandEncoder.copyTextureToTexture(
            { texture: current_render },  //src
            { texture: txScreen },  //dst
            { width: canvas.width, height: canvas.height, depthOrArrayLayers: 1 }
        );
        device.queue.submit([commandEncoder.finish()]);
        // end image store

        // here is where the code to capture the latest frame for an animation would go
        //  use "TexturetoImageData" to get the current frame, and then "addFrame" that to an
        //  established encoder.  For this to work, we would need to use ffmpeg.js, which would
        // add some additional complexity and weight to the code.  Certainly can be done, but
        // hold off until it becomes an important addition

        requestAnimationFrame(frame);  // Call the next frame

        // determine elapsed time
        const now = new Date();
        calc_constants.elapsedTime = (now - startTime) / 1000;

        // Update the output texture
        runCopyTextures(device, commandEncoder, calc_constants, txNewState, txSaveOut)

        // Call the function to display the constants in the index.html page
        displayCalcConstants(calc_constants, total_time_since_http_update);
    }


    // Invoke the `frame` function once to start the main loop.
    frame();

}

// All the functions below this are for UI - this is also where the wave simulation is started
document.addEventListener('DOMContentLoaded', function () {
    // Get a reference to your canvas element.
    var canvas = document.getElementById('webgpuCanvas');

    // Add the event listener for 'click' events - this is for modifying bathy / various mapsl
    var mouseIsDown = false;  // Flag to track if the mouse is being held down

    // Helper function to handle click or mouse move while button is pressed
    function handleMouseEvent(event) {
        var rect = canvas.getBoundingClientRect();
        var scaleX = calc_constants.WIDTH / rect.width;
        var scaleY = calc_constants.HEIGHT / rect.height;

        calc_constants.xClick = (event.clientX - rect.left) * scaleX;
        calc_constants.yClick = calc_constants.HEIGHT - (event.clientY - rect.top) * scaleY;
        calc_constants.click_update = 1;

        console.log("Canvas clicked/moved at X:", calc_constants.xClick, " Y:", calc_constants.yClick);
    }

    // Event listener for mousedown - start of the hold
    canvas.addEventListener('mousedown', function (event) {
        mouseIsDown = true;
        handleMouseEvent(event);  // Handle the initial click
    });

    // Event listener for mousemove - if mouse is down, it's equivalent to multiple clicks
    canvas.addEventListener('mousemove', function (event) {
        if (mouseIsDown) {
            handleMouseEvent(event);
        }
    });

    // Event listener for mouseup - end of the hold
    canvas.addEventListener('mouseup', function () {
        mouseIsDown = false;
        calc_constants.click_update = 0;  // Optionally, reset the click_update here if needed
    });

    // To handle cases where the mouse leaves the canvas while being pressed
    canvas.addEventListener('mouseleave', function () {
        mouseIsDown = false;  // Consider the mouse as no longer being held down
    });
    // end mouse interaction functions



    // Define a helper function to update calc_constants and potentially re-initialize components
    function updateCalcConstants(property, newValue) {
        console.log(`Updating ${property} with value:`, newValue);
        calc_constants[property] = newValue;

        if (property == 'surfaceToPlot' && calc_constants.surfaceToPlot == 6) {  // set for showing bathy/topo
            calc_constants.colorVal_min = -calc_constants.base_depth;
            calc_constants.colorVal_max = calc_constants.base_depth;
            calc_constants.colorMap_choice = 6;
        }

        if (property == 'surfaceToPlot' && calc_constants.colorVal_max == calc_constants.base_depth && calc_constants.surfaceToPlot != 6) {
            calc_constants.colorVal_min = -1.0;
            calc_constants.colorVal_max = 1.0;
            calc_constants.colorMap_choice = 0;
        }

        calc_constants.html_update = 1; // flag used to check for updates.
    }

    // Add event listeners for each button/input pair
    const buttonActions = [
        { id: 'theta-button', input: 'Theta-input', property: 'Theta' },
        { id: 'courant-button', input: 'courant-input', property: 'Courant_num' },
        { id: 'friction-button', input: 'friction-input', property: 'friction' },
        { id: 'colorVal_max-button', input: 'colorVal_max-input', property: 'colorVal_max' },
        { id: 'colorVal_min-button', input: 'colorVal_min-input', property: 'colorVal_min' },
        { id: 'dissipation_threshold-button', input: 'dissipation_threshold-input', property: 'dissipation_threshold' },
        { id: 'whiteWaterDecayRate-button', input: 'whiteWaterDecayRate-input', property: 'whiteWaterDecayRate' },
        { id: 'changeAmplitude-button', input: 'changeAmplitude-input', property: 'changeAmplitude' },
        { id: 'changeRadius-button', input: 'changeRadius-input', property: 'changeRadius' },
        { id: 'render_step-button', input: 'render_step-input', property: 'render_step' },
    ];

    buttonActions.forEach(({ id, input, property }) => {
        const button = document.getElementById(id);
        const inputValue = document.getElementById(input);

        button.addEventListener('click', function () {
            const value = parseFloat(inputValue.value); // Assuming all values are floats; parse as appropriate
            updateCalcConstants(property, value);
        });
    });

    // Function to handle drop-down menu updates
    function setupDropdownListeners(button_dropdown_Actions) {
        button_dropdown_Actions.forEach(({ id, input, property }) => {
            const selectElement = document.getElementById(input); // The <select> element
            const button = document.getElementById(id);

            button.addEventListener('click', function () {
                const selectedValue = selectElement.value; // Getting the selected value from the drop-down
                updateCalcConstants(property, Math.round(selectedValue)); // No need for parseFloat here
            });
        });
    }

    // Specify the buttons and inputs for the drop-down menus
    const button_dropdown_Actions = [
        { id: 'nlsw-button', input: 'nlsw-select', property: 'NLSW_or_Bous' }, // Make sure 'input' refers to the <select> element's ID
        { id: 'west-boundary-button', input: 'west_boundary_type-select', property: 'west_boundary_type' },
        { id: 'east-boundary-button', input: 'east_boundary_type-select', property: 'east_boundary_type' },
        { id: 'south-boundary-button', input: 'south_boundary_type-select', property: 'south_boundary_type' },
        { id: 'north-boundary-button', input: 'north_boundary_type-select', property: 'north_boundary_type' },
        { id: 'isManning-button', input: 'isManning-select', property: 'isManning' },
        { id: 'simPause-button', input: 'simPause-select', property: 'simPause' },
        { id: 'surfaceToPlot-button', input: 'surfaceToPlot-select', property: 'surfaceToPlot' },
        { id: 'colorMap_choice-button', input: 'colorMap_choice-select', property: 'colorMap_choice' },
        { id: 'showBreaking-button', input: 'showBreaking-select', property: 'showBreaking' },
        { id: 'GoogleMapOverlay-button', input: 'GoogleMapOverlay-select', property: 'GoogleMapOverlay' },
    ];

    // Call the function for setting up listeners on dropdown menus
    setupDropdownListeners(button_dropdown_Actions);

    // Refresh button
    const refreshButton = document.getElementById('refresh-button');
    refreshButton.addEventListener('click', function () {
        location.reload();
    });

    // update the ALL input and dropdown buttons with the current parameter value when any one button is pushed
    function updateAllUIElements() {
        // Update text input fields
        buttonActions.forEach((action) => {
            var currentValue = calc_constants[action.property];
            document.getElementById(action.input).value = currentValue;
        });

        // Update dropdown selections
        button_dropdown_Actions.forEach((action) => {
            var currentValue = calc_constants[action.property];
            var selectElement = document.getElementById(action.input);
            selectElement.value = currentValue;
        });
    }
    const allActions = buttonActions.concat(button_dropdown_Actions);

    allActions.forEach((action) => {
        // Set up the click event listener for each button
        document.getElementById(action.id).addEventListener('click', function () {
            // Assume the new value for the property comes from a text input or dropdown selection
            // Update the property in calc_constants
            calc_constants[action.property] = document.getElementById(action.input).value;

            // Call the function to update all UI elements
            updateAllUIElements();
        });
    });

    // Function to change the color of the label when a file is uploaded
    function onFileUpload(event) {
        var inputId = event.target.id;
        var label = document.querySelector('label[for=' + inputId + ']');
        if (event.target.files.length > 0) {
            label.style.backgroundColor = '#4CAF50';  // for example, green
            label.style.color = 'white';
            // Additional styling (like changing text to "File Uploaded!") can also be applied here
        } else {
            // Reset to default styles if no file is selected
            label.style.backgroundColor = '';  // reset to default
            label.style.color = '';  // reset to default
        }
    }

    // Reset mean surfaces - reset-mean-texture-btn
    document.getElementById('reset-mean-texture-btn').addEventListener('click', function () {
        calc_constants.n_time_steps_means = 0;  // reset means counter - compute shader will automatically reset
    });


    // Reset wave height surface - reset-waveheight-texture-btn
    document.getElementById('reset-waveheight-texture-btn').addEventListener('click', function () {
        calc_constants.n_time_steps_waveheight = 0;  // reset wave height counter - compute shader will automatically reset
    });


    // Add event listeners for the file inputs
    var fileInputs = document.querySelectorAll('input[type=file]');
    fileInputs.forEach(function (input) {
        input.addEventListener('change', onFileUpload);
    });

    // Download JSON
    document.getElementById('download-button').addEventListener('click', function () {
        downloadObjectAsFile(calc_constants);
    });


    // Download channel from txSaveOut Texture
    document.getElementById('downloadWaveElev-button').addEventListener('click', function () {
        downloadTextureData(device, txSaveOut, 1);  // last number is the channel 1 = .r, 2 = .g, etc.
    });


    // Download jpg of screen output
    document.getElementById('downloadJPG-button').addEventListener('click', function () {
        saveRenderedImageAsJPEG(device, txScreen, canvas.width, canvas.height);
    });

    // start simulation

    // Ensure to bind this function to your button's 'click' event in the HTML or here in the JS.
    document.getElementById('start-simulation-btn').addEventListener('click', function () {
        startSimulation(); 
    });

    // run example simulation

    // Ensure to bind this function to your button's 'click' event in the HTML or here in the JS.
    document.getElementById('run-example-simulation-btn').addEventListener('click', function () {

        initializeWebGPUApp();

    });

    // This function will be called when the user clicks "Start Simulation."
    function startSimulation() {
        // First, retrieve the File objects from the file inputs.
        var configFile = document.getElementById('configFile').files[0];
        var bathymetryFile = document.getElementById('bathymetryFile').files[0];
        var waveFile = document.getElementById('waveFile').files[0];

        // Check if the files are not uploaded
        if (!configFile || !bathymetryFile || !waveFile) {
            alert("Please upload all the required files.");
            return;  // Stop here.
        }

        // If we're here, it means all files are uploaded.
        // Now, we can read these files and then start the simulation.

        // Create FileReader objects to read the content of the files
        var configReader = new FileReader();
        var bathymetryReader = new FileReader();
        var waveReader = new FileReader();

        // Setup of the FileReader callbacks to handle the data after files are read
        configReader.onload = function (e) {
            var configContent = e.target.result;
            // Handle or store this content as needed in your simulation

            // We're nesting these to ensure the order of operations (each file read is asynchronous)
            bathymetryReader.onload = function (e) {
                var bathymetryContent = e.target.result;

                waveReader.onload = function (e) {
                    var waveContent = e.target.result;

                    // Now that all files are read and content is stored, start the simulation.
                    // Pass the necessary data as arguments to your actual simulation function
                    // runSimulation(configContent, bathymetryContent, waveContent);

                    // This code initializes the WebGPU application.
                    // Call the `initializeWebGPUApp` asynchronous function. 
                    // This function sets up all the resources and processes required to run the WebGPU application.
                    initializeWebGPUApp(configContent, bathymetryContent, waveContent).catch(error => {
                        // If there's any error during the initialization, it will be caught here.

                        // Log the error message to the console.
                        console.error("Initialization failed:", error);
                    });


                }

                // Reading the content of the wave file
                waveReader.readAsText(waveFile);
            }

            // Reading the content of the bathymetry file
            bathymetryReader.readAsText(bathymetryFile);
        };

        // Initiates the reading of the config file. This starts the chain of reading operations.
        configReader.readAsText(configFile);
    }

});


