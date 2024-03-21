// import source files
import { calc_constants, loadConfig, init_sim_parameters } from './constants_load_calc.js';  // variables and functions needed for init_sim_parameters
import { loadDepthSurface, loadWaveData, CreateGoogleMapImage, calculateGoogleMapScaleAndOffset } from './File_Loader.js';  // load depth surface and wave data file
import { readTextureData, downloadTextureData, downloadObjectAsFile, handleFileSelect, loadJsonIntoCalcConstants, saveRenderedImageAsJPEG, TexturetoImageData, downloadGeoTiffData } from './File_Writer.js';  // load depth surface and wave data file
import { create_2D_Texture, create_2D_Image_Texture, create_1D_Texture, createUniformBuffer } from './Create_Textures.js';  // create texture function
import { copyBathyDataToTexture, copyWaveDataToTexture, copyInitialConditionDataToTexture, copyConstantValueToTexture, copyTridiagXDataToTexture, copyTridiagYDataToTexture } from './Copy_Data_to_Textures.js';  // fills in channels of txBottom
import { createRenderBindGroupLayout, createRenderBindGroup, update_colorbar } from './Handler_Render.js';  // group bindings for render shaders
import { create_Pass0_BindGroupLayout, create_Pass0_BindGroup } from './Handler_Pass0.js';  // group bindings for Pass0 shaders
import { create_Pass1_BindGroupLayout, create_Pass1_BindGroup } from './Handler_Pass1.js';  // group bindings for Pass1 shaders
import { create_SedTrans_Pass1_BindGroupLayout, create_SedTrans_Pass1_BindGroup } from './Handler_SedTrans_Pass1.js';  // group bindings for SedTrans_Pass1 shaders
import { create_Pass2_BindGroupLayout, create_Pass2_BindGroup } from './Handler_Pass2.js';  // group bindings for Pass2 shaders
import { create_Pass3_BindGroupLayout, create_Pass3_BindGroup } from './Handler_Pass3.js';  // group bindings for Pass3 shaders
import { create_SedTrans_Pass3_BindGroupLayout, create_SedTrans_Pass3_BindGroup } from './Handler_SedTrans_Pass3.js';  // group bindings for SedTrans_Pass3 shaders
import { create_BoundaryPass_BindGroupLayout, create_BoundaryPass_BindGroup } from './Handler_BoundaryPass.js';  // group bindings for BoundaryPass shaders
import { create_Tridiag_BindGroupLayout, create_Tridiag_BindGroup } from './Handler_Tridiag.js';  // group bindings for Tridiag X and Y shaders
import { create_UpdateTrid_BindGroupLayout, create_UpdateTrid_BindGroup } from './Handler_UpdateTrid.js';  // group bindings for updating tridiag coef shader
import { create_SedTrans_UpdateBottom_BindGroupLayout, create_SedTrans_UpdateBottom_BindGroup } from './Handler_SedTrans_UpdateBottom.js';  // group bindings for updating bottom ddue to sed transort model
import { create_Updateneardry_BindGroupLayout, create_Updateneardry_BindGroup } from './Handler_Updateneardry.js';  // group bindings for updating neardry values
import { create_CalcMeans_BindGroupLayout, create_CalcMeans_BindGroup } from './Handler_CalcMeans.js';  // group bindings for shader that calculates running means of state variables
import { create_CalcWaveHeight_BindGroupLayout, create_CalcWaveHeight_BindGroup } from './Handler_CalcWaveHeight.js';  // group bindings for shader that calculates running means of state variables
import { create_AddDisturbance_BindGroupLayout, create_AddDisturbance_BindGroup } from './Handler_AddDisturbance.js';  // group bindings for adding a landslide or tsunami impulsive source
import { create_MouseClickChange_BindGroupLayout, create_MouseClickChange_BindGroup } from './Handler_MouseClickChange.js';  // group bindings for mouse click changes
import { createComputePipeline, createRenderPipeline, createRenderPipeline_vertexgrid } from './Config_Pipelines.js';  // pipeline config for ALL shaders
import { fetchShader, runComputeShader, runCopyTextures } from './Run_Compute_Shader.js';  // function to run shaders, works for all
import { runTridiagSolver } from './Run_Tridiag_Solver.js';  // function to run PCR triadiag solver, works for all
import { displayCalcConstants, displaySimStatus } from './display_parameters.js';  // starting point for display of simulation parameters

// Get a reference to the HTML canvas element with the ID 'webgpuCanvas'
const canvas = document.getElementById('webgpuCanvas');

// Access the WebGPU object. This is the entry point to the WebGPU API.
const gpu = navigator.gpu;

// globals in this source file
let device = null;
let txSaveOut = null;
let txScreen = null;
let txGoogleMap = null;
let txDraw = null;
let context = null;
let adapter = null;

// Initialize a global set to track texture, pipeline objects
const allTextures = new Set();
const allComputePipelines = new Set();


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
    let { numberOfWaves, waveData } = await loadWaveData(waveContent, calc_constants);  // Start this only after the first function completes
    calc_constants.numberOfWaves = numberOfWaves; 
    return { bathy2D, waveData };
}

// This is an asynchronous function to set up the WebGPU context and resources.
async function initializeWebGPUApp(configContent, bathymetryContent, waveContent) {
    // Log a message indicating the start of the initialization process.
    console.log("Starting WebGPU App Initialization...");

    console.log("Clearing / destroying any data from previous run...");
    allTextures.forEach(texture => {
        texture.destroy(); // Destroy each texture
    });
    allTextures.clear(); // Clear the set for the next run
    allComputePipelines.clear(); // Clear pipelines
    RenderPipeline = null; 

    device = null;
    adapter = null;
    context = null;
    calc_constants.GoogleMapOverlay = 0; // not all configs have this declared, so can create issue when switching back and forth
    calc_constants.render_step = 1; // for new sim, force render step back to zero

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
    const Pass0_uniformBuffer = createUniformBuffer(device);
    const Pass1_uniformBuffer = createUniformBuffer(device);
    const SedTrans_Pass1_uniformBuffer = createUniformBuffer(device);
    const Pass2_uniformBuffer = createUniformBuffer(device);
    const Pass3_uniformBuffer = createUniformBuffer(device);
    const SedTrans_Pass3_uniformBuffer = createUniformBuffer(device);
    const SedTrans_UpdateBottom_uniformBuffer = createUniformBuffer(device);
    const BoundaryPass_uniformBuffer = createUniformBuffer(device);
    const TridiagX_uniformBuffer = createUniformBuffer(device);
    const TridiagY_uniformBuffer = createUniformBuffer(device);
    const Updateneardry_uniformBuffer = createUniformBuffer(device);
    const UpdateTrid_uniformBuffer = createUniformBuffer(device);
    const CalcMeans_uniformBuffer = createUniformBuffer(device);
    const CalcWaveHeight_uniformBuffer = createUniformBuffer(device);
    const AddDisturbance_uniformBuffer = createUniformBuffer(device);
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
    const txBottom = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores information about the bathy/topo
    const txState = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // the values of the current (n) "state", or eta, P, Q, and c
    const txNewState = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // the values of the next (n+1) "state"
    const txState_Sed = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // the values of the current (n) "state", or eta, P, Q, and c
    const txNewState_Sed = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // the values of the next (n+1) "state"
    const txstateUVstar = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // the values of the current (n) bous-grouped state, or eta, U, V, and c
    const current_stateUVstar = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // next bous-grouped state
    const txH = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // cell edge values of H
    const txU = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // cell edge values of u
    const txV = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // cell edge values of v
    const txHnear = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // cell edge values of w (eta) - currrently not used
    const txC = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // cell edge values of c
    const txSed_C1 = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // cell edge values of c
    const txSed_C2 = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // cell edge values of c
    const txSed_C3 = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // cell edge values of c
    const txSed_C4 = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // cell edge values of c
    const erosion_Sed = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // local erosion for all class "e"
    const depostion_Sed = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // local depostion for all class "d"
    const txBotChange_Sed = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // cumulative bottom elevation change
    const txBottomFriction = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores bottom friction info   
    const txContSource = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores passive tracer source map
    const txXFlux = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores x-flux values along cell edges
    const txYFlux = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores y-flux values along cell edges
    const txXFlux_Sed = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores x-flux values along cell edges
    const txYFlux_Sed = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores y-flux values along cell edges
    const predictedGradients = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores d(state)/dt values found in the predictor step
    const oldGradients = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores d(state)/dt values at previous time step
    const oldOldGradients = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores d(state)/dt values from two time steps ago
    const predictedGradients_Sed = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores d(state)/dt values found in the predictor step
    const oldGradients_Sed = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores d(state)/dt values at previous time step
    const oldOldGradients_Sed = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores d(state)/dt values from two time steps ago
    const predictedF_G_star = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores F*, G* (bous only) found in predictor step
    const F_G_star_oldGradients = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures); // stores F*, G* (bous only) found at previous time step
    const F_G_star_oldOldGradients = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures); // stores F*, G* (bous only) found from two time steps ago
    const txtemp_bottom = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // temp storage texture for boundary pass - probably all these temps can be combined
    const txtemp_boundary = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // temp storage texture for boundary pass - probably all these temps can be combined
    const txtemp_boundary_Sed = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // temp storage texture for boundary pass - probably all these temps can be combined
    const txtemp_SedTrans_Botttom = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // temp storage texture for bottom update
    const txtemp_SedTrans_Change = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // temp storage texture for bottom update
    const txtemp_PCRx = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // temp storage for PCR x-dir
    const txtemp_PCRy = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // temp storage for PCR y-dir
    const txtemp2_PCRx = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // temp storage for PCR x-dir
    const txtemp2_PCRy = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);    // temp storage for PCR y-dir
    const txtemp_AddDisturbance = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // temp storage for MouseClick shader
    const txtemp_MouseClick = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // temp storage for MouseClick shader
    const coefMatx = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // tridiagonal coefficients for x-dir (bous only)
    const coefMaty = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // tridiagonal coefficients for y-dir (bous only)
    const newcoef_x = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // PCR reduced tridiagonal coefficients for x-dir (bous only) 
    const newcoef_y = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // PCR reduced tridiagonal coefficients for y-dir (bous only) 
    const dU_by_dt = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores d(state)/dt values output from Pass3 calls
    const dU_by_dt_Sed = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores d(state)/dt values output from Pass3 calls
    const txShipPressure = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores ship pressure - not used in WebGPU yet
    const txMeans = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores various mean values
    const txtemp_Means = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);
    const txWaveHeight = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores current wave height surface
    const txtemp_WaveHeight = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);
    const txBaseline_WaveHeight = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores "baseline" wave height surface
    const txzeros = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores a zeros texture, for reseting textures to zero
    txSaveOut = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // used for bindary output
    txScreen = create_2D_Image_Texture(device, canvas.width, canvas.height, allTextures);  // used for jpg output
    txGoogleMap = create_2D_Texture(device, calc_constants.GMapImageWidth, calc_constants.GMapImageHeight, allTextures);  // used to store the loaded Google Maps image
    txDraw = create_2D_Image_Texture(device, canvas.width, canvas.height, allTextures);  // used for creating text & shapes on an HTML5 canvas
    
    const txWaves = create_1D_Texture(device, calc_constants.numberOfWaves, allTextures);  // stores spectrum wave input

    // fill in the bathy texture
    let bathy2Dvec = copyBathyDataToTexture(calc_constants, bathy2D, device, txBottom);

    // fill in the wave data texture
    if (calc_constants.numberOfWaves > 0) {
        copyWaveDataToTexture(calc_constants, waveData, device, txWaves);
    }

    // create initial condition
    copyInitialConditionDataToTexture(calc_constants, device, bathy2D, txState);
    copyInitialConditionDataToTexture(calc_constants, device, bathy2D, txstateUVstar);

    // create initial bottom friction surface
    copyConstantValueToTexture(calc_constants, device, txBottomFriction, calc_constants.friction, 0.0, 0.0, 0.0);

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
    // Pass0 Bindings & Uniforms Config
    const Pass0_BindGroupLayout = create_Pass0_BindGroupLayout(device);
    const Pass0_BindGroup = create_Pass0_BindGroup(device, Pass0_uniformBuffer, txState, txBottom, txHnear);
    const Pass0_uniforms = new ArrayBuffer(256);  // smallest multiple of 256
    let Pass0_view = new DataView(Pass0_uniforms);
    Pass0_view.setInt32(0, calc_constants.WIDTH, true);          // u32
    Pass0_view.setInt32(4, calc_constants.HEIGHT, true);          // u32
    Pass0_view.setFloat32(8, calc_constants.epsilon, true);       // f32
    Pass0_view.setFloat32(12, calc_constants.dt, true);           // f32
    Pass0_view.setFloat32(16, calc_constants.base_depth, true);       // f32
    Pass0_view.setFloat32(20, calc_constants.dx, true);           // f32
    Pass0_view.setFloat32(24, calc_constants.dy, true);           // f32

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

    //  SedTrans_Pass1 Bindings & Uniforms Config
    const SedTrans_Pass1_BindGroupLayout = create_SedTrans_Pass1_BindGroupLayout(device);
    const SedTrans_Pass1_BindGroup = create_SedTrans_Pass1_BindGroup(device, SedTrans_Pass1_uniformBuffer, txState_Sed, txBottom, txH, txSed_C1, txSed_C2, txSed_C3, txSed_C4);
    const SedTrans_Pass1_uniforms = new ArrayBuffer(256);  // smallest multiple of 256
    let SedTrans_Pass1_view = new DataView(SedTrans_Pass1_uniforms);
    SedTrans_Pass1_view.setUint32(0, calc_constants.WIDTH, true);          // u32
    SedTrans_Pass1_view.setUint32(4, calc_constants.HEIGHT, true);          // u32
    SedTrans_Pass1_view.setFloat32(8, calc_constants.one_over_dx, true);             // f32
    SedTrans_Pass1_view.setFloat32(12, calc_constants.one_over_dy, true);       // f32
    SedTrans_Pass1_view.setFloat32(16, calc_constants.dissipation_threshold, true);           // f32
    SedTrans_Pass1_view.setFloat32(20, calc_constants.TWO_THETA, true);           // f32
    SedTrans_Pass1_view.setFloat32(24, calc_constants.epsilon, true);       // f32
    SedTrans_Pass1_view.setFloat32(28, calc_constants.whiteWaterDecayRate, true);           // f32
    SedTrans_Pass1_view.setFloat32(32, calc_constants.dt, true);           // f32
    SedTrans_Pass1_view.setFloat32(36, calc_constants.base_depth, true);       // f32
    SedTrans_Pass1_view.setFloat32(40, calc_constants.dx, true);           // f32
    SedTrans_Pass1_view.setFloat32(44, calc_constants.dy, true);           // f32

    // Pass2 Bindings & Uniforms Config
    const Pass2_BindGroupLayout = create_Pass2_BindGroupLayout(device);
    const Pass2_BindGroup = create_Pass2_BindGroup(device, Pass2_uniformBuffer, txH, txU, txV, txBottom, txC, txHnear, txXFlux, txYFlux, txSed_C1, txSed_C2, txSed_C3, txSed_C4, txXFlux_Sed, txYFlux_Sed);
    const Pass2_uniforms = new ArrayBuffer(256);  // smallest multiple of 256
    let Pass2_view = new DataView(Pass2_uniforms);
    Pass2_view.setUint32(0, calc_constants.WIDTH, true);          // u32
    Pass2_view.setUint32(4, calc_constants.HEIGHT, true);          // u32
    Pass2_view.setFloat32(8, calc_constants.g, true);             // f32
    Pass2_view.setFloat32(12, calc_constants.half_g, true);       // f32
    Pass2_view.setFloat32(16, calc_constants.dx, true);           // f32
    Pass2_view.setFloat32(20, calc_constants.dy, true);           // f32
    Pass2_view.setFloat32(24, calc_constants.delta, true);           // f32
    Pass2_view.setInt32(28, calc_constants.useSedTransModel, true);   //i32

    // Pass3 Bindings & Uniforms Config
    const Pass3_BindGroupLayout = create_Pass3_BindGroupLayout(device);
    const Pass3_BindGroup = create_Pass3_BindGroup(device, Pass3_uniformBuffer, txState, txBottom, txH, txXFlux, txYFlux, oldGradients, oldOldGradients, predictedGradients, F_G_star_oldGradients, F_G_star_oldOldGradients, txstateUVstar, txShipPressure, txNewState, dU_by_dt, predictedF_G_star, current_stateUVstar,txContSource);
    const Pass3_uniforms = new ArrayBuffer(256);  // smallest multiple of 256
    let Pass3_view = new DataView(Pass3_uniforms);
    Pass3_view.setInt32(0, calc_constants.WIDTH, true);          // u32
    Pass3_view.setInt32(4, calc_constants.HEIGHT, true);          // u32
    Pass3_view.setFloat32(8, calc_constants.dt, true);             // f32
    Pass3_view.setFloat32(12, calc_constants.dx, true);       // f32
    Pass3_view.setFloat32(16, calc_constants.dy, true);           // f32
    Pass3_view.setFloat32(20, calc_constants.one_over_dx, true);           // f32
    Pass3_view.setFloat32(24, calc_constants.one_over_dy, true);       // f32
    Pass3_view.setFloat32(28, calc_constants.g_over_dx, true);           // f32
    Pass3_view.setFloat32(32, calc_constants.g_over_dy, true);           // f32
    Pass3_view.setInt32(36, calc_constants.timeScheme, true);       // f32
    Pass3_view.setFloat32(40, calc_constants.epsilon, true);           // f32
    Pass3_view.setInt32(44, calc_constants.isManning, true);           // f32
    Pass3_view.setFloat32(48, calc_constants.g, true);           // f32
    Pass3_view.setFloat32(52, calc_constants.friction, true);             // f32
    Pass3_view.setInt32(56, calc_constants.pred_or_corrector, true);       // f32
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
    Pass3_view.setInt32(100, calc_constants.clearConc, true);           // i32
    Pass3_view.setFloat32(104, calc_constants.delta, true);           // f32

    // SedTrans_Pass3 Bindings & Uniforms Config
    const SedTrans_Pass3_BindGroupLayout = create_SedTrans_Pass3_BindGroupLayout(device);
    const SedTrans_Pass3_BindGroup = create_SedTrans_Pass3_BindGroup(device, SedTrans_Pass3_uniformBuffer, txState_Sed, txXFlux_Sed, txYFlux_Sed, oldGradients_Sed, oldOldGradients_Sed, predictedGradients_Sed, txBottom, txState, txNewState_Sed, dU_by_dt_Sed, erosion_Sed, depostion_Sed);
    const SedTrans_Pass3_uniforms = new ArrayBuffer(256);  // smallest multiple of 256
    let SedTrans_Pass3_view = new DataView(SedTrans_Pass3_uniforms);
    SedTrans_Pass3_view.setInt32(0, calc_constants.WIDTH, true);          // u32
    SedTrans_Pass3_view.setInt32(4, calc_constants.HEIGHT, true);          // u32
    SedTrans_Pass3_view.setFloat32(8, calc_constants.dt, true);             // f32
    SedTrans_Pass3_view.setFloat32(12, calc_constants.dx, true);       // f32
    SedTrans_Pass3_view.setFloat32(16, calc_constants.dy, true);           // f32
    SedTrans_Pass3_view.setFloat32(20, calc_constants.one_over_dx, true);           // f32
    SedTrans_Pass3_view.setFloat32(24, calc_constants.one_over_dy, true);       // f32
    SedTrans_Pass3_view.setInt32(28, calc_constants.timeScheme, true);       // f32
    SedTrans_Pass3_view.setInt32(32, calc_constants.pred_or_corrector, true);       // i32
    SedTrans_Pass3_view.setFloat32(36, calc_constants.one_over_d2x, true);       // f32
    SedTrans_Pass3_view.setFloat32(40, calc_constants.one_over_d2y, true);           // f32
    SedTrans_Pass3_view.setFloat32(44, calc_constants.one_over_dxdy, true);           // f32
    SedTrans_Pass3_view.setFloat32(48, calc_constants.epsilon, true);           // f32
    SedTrans_Pass3_view.setInt32(52, calc_constants.isManning, true);       // i32
    SedTrans_Pass3_view.setFloat32(56, calc_constants.friction, true);       // f32
    SedTrans_Pass3_view.setFloat32(60, calc_constants.sedC1_shields, true);           // f32
    SedTrans_Pass3_view.setFloat32(64, calc_constants.sedC1_criticalshields, true);           // f32
    SedTrans_Pass3_view.setFloat32(68, calc_constants.sedC1_erosion, true);           // f32
    SedTrans_Pass3_view.setFloat32(72, calc_constants.sedC1_n, true);           // f32
    SedTrans_Pass3_view.setFloat32(76, calc_constants.sedC1_fallvel, true);           // f32


    // BoundaryPass Bindings & Uniforms Config
    const BoundaryPass_BindGroupLayout = create_BoundaryPass_BindGroupLayout(device);
    const BoundaryPass_BindGroup = create_BoundaryPass_BindGroup(device, BoundaryPass_uniformBuffer, current_stateUVstar, txBottom, txWaves, txNewState_Sed, txtemp_boundary, txtemp_boundary_Sed);
    const BoundaryPass_BindGroup_NewState = create_BoundaryPass_BindGroup(device, BoundaryPass_uniformBuffer, txNewState, txBottom, txWaves, txNewState_Sed, txtemp_boundary, txtemp_boundary_Sed);
    const BoundaryPass_uniforms = new ArrayBuffer(256);  // smallest multiple of 256
    let BoundaryPass_view = new DataView(BoundaryPass_uniforms);
    BoundaryPass_view.setInt32(0, calc_constants.WIDTH, true);          // i32
    BoundaryPass_view.setInt32(4, calc_constants.HEIGHT, true);          // i32
    BoundaryPass_view.setFloat32(8, calc_constants.dt, true);             // f32
    BoundaryPass_view.setFloat32(12, calc_constants.dx, true);       // f32
    BoundaryPass_view.setFloat32(16, calc_constants.dy, true);           // f32
    BoundaryPass_view.setFloat32(20, 0, true);           // f32
    BoundaryPass_view.setInt32(24, calc_constants.reflect_x, true);       // f32
    BoundaryPass_view.setInt32(28, calc_constants.reflect_y, true);           // f32
    BoundaryPass_view.setFloat32(32, calc_constants.PI, true);           // f32
    BoundaryPass_view.setInt32(36, calc_constants.BoundaryWidth, true);       // f32
    BoundaryPass_view.setFloat32(40, calc_constants.seaLevel, true);           // f32
    BoundaryPass_view.setInt32(44, calc_constants.boundary_nx, true);           // f32
    BoundaryPass_view.setInt32(48, calc_constants.boundary_ny, true);           // f32
    BoundaryPass_view.setInt32(52, calc_constants.numberOfWaves, true);             // f32
    BoundaryPass_view.setInt32(56, calc_constants.west_boundary_type, true);       // f32
    BoundaryPass_view.setInt32(60, calc_constants.east_boundary_type, true);           // f32
    BoundaryPass_view.setInt32(64, calc_constants.south_boundary_type, true);           // f32
    BoundaryPass_view.setInt32(68, calc_constants.north_boundary_type, true);       // f32
    BoundaryPass_view.setFloat32(72, calc_constants.boundary_g, true);           // f32
    BoundaryPass_view.setFloat32(76, calc_constants.delta, true);           // f32 
    BoundaryPass_view.setInt32(80, calc_constants.boundary_shift, true);           // f32 

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

    // SedTrans_UpdateBottom -  Bindings & Uniforms Config
    const SedTrans_UpdateBottom_BindGroupLayout = create_SedTrans_UpdateBottom_BindGroupLayout(device);
    const SedTrans_UpdateBottom_BindGroup = create_SedTrans_UpdateBottom_BindGroup(device, SedTrans_UpdateBottom_uniformBuffer, txBottom, txBotChange_Sed, erosion_Sed, depostion_Sed, txtemp_SedTrans_Botttom, txtemp_SedTrans_Change);
    const SedTrans_UpdateBottom_uniforms = new ArrayBuffer(256);  // smallest multiple of 256
    let SedTrans_UpdateBottom_view = new DataView(SedTrans_UpdateBottom_uniforms);
    SedTrans_UpdateBottom_view.setInt32(0, calc_constants.WIDTH, true);          // i32
    SedTrans_UpdateBottom_view.setInt32(4, calc_constants.HEIGHT, true);          // i32
    SedTrans_UpdateBottom_view.setFloat32(8, calc_constants.dt, true);             // f32
    SedTrans_UpdateBottom_view.setFloat32(12, calc_constants.dx, true);       // f32
    SedTrans_UpdateBottom_view.setFloat32(16, calc_constants.dy, true);           // f32
    SedTrans_UpdateBottom_view.setFloat32(20, calc_constants.base_depth, true);             // f32  
    SedTrans_UpdateBottom_view.setInt32(24, calc_constants.timeScheme, true);       // f32
    SedTrans_UpdateBottom_view.setInt32(28, calc_constants.pred_or_corrector, true);       // i32
    SedTrans_UpdateBottom_view.setFloat32(32, calc_constants.sedC1_n, true);           // f32

    // Updateneardry -  Bindings & Uniforms Config
    const Updateneardry_BindGroupLayout = create_Updateneardry_BindGroupLayout(device);
    const Updateneardry_BindGroup = create_Updateneardry_BindGroup(device, Updateneardry_uniformBuffer, txBottom, txtemp_bottom);
    const Updateneardry_uniforms = new ArrayBuffer(256);  // smallest multiple of 256s
    let Updateneardry_view = new DataView(Updateneardry_uniforms);
    Updateneardry_view.setInt32(0, calc_constants.WIDTH, true);          // i32
    Updateneardry_view.setInt32(4, calc_constants.HEIGHT, true);          // i32

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


    // AddDisturbance -  Bindings & Uniforms Config
    const AddDisturbance_BindGroupLayout = create_AddDisturbance_BindGroupLayout(device);
    const AddDisturbance_BindGroup = create_AddDisturbance_BindGroup(device, AddDisturbance_uniformBuffer, txBottom, txBottomFriction, txContSource, txstateUVstar, txtemp_AddDisturbance);
    const AddDisturbance_uniforms = new ArrayBuffer(256);  // smallest multiple of 256s
    let AddDisturbance_view = new DataView(AddDisturbance_uniforms);
    AddDisturbance_view.setInt32(0, calc_constants.WIDTH, true);          // i32
    AddDisturbance_view.setInt32(4, calc_constants.HEIGHT, true);          // i32
    AddDisturbance_view.setFloat32(8, calc_constants.dx, true);             // f32
    AddDisturbance_view.setFloat32(12, calc_constants.dy, true);             // f32 
    AddDisturbance_view.setFloat32(16, calc_constants.xClick, true);             // f32
    AddDisturbance_view.setFloat32(20, calc_constants.yClick, true);             // f32
    AddDisturbance_view.setFloat32(24, calc_constants.changeRadius, true);             // f32
    AddDisturbance_view.setFloat32(28, calc_constants.changeAmplitude, true);             // f32  
    AddDisturbance_view.setInt32(32, calc_constants.surfaceToChange, true);             // f32  
    AddDisturbance_view.setInt32(36, calc_constants.changeType, true);             // f32  
    AddDisturbance_view.setFloat32(40, calc_constants.base_depth, true);             // f32  


    // MouseClickChange -  Bindings & Uniforms Config
    const MouseClickChange_BindGroupLayout = create_MouseClickChange_BindGroupLayout(device);
    const MouseClickChange_BindGroup = create_MouseClickChange_BindGroup(device, MouseClickChange_uniformBuffer, txBottom, txBottomFriction, txContSource, txstateUVstar, txtemp_MouseClick);
    const MouseClickChange_uniforms = new ArrayBuffer(256);  // smallest multiple of 256s
    let MouseClickChange_view = new DataView(MouseClickChange_uniforms);
    MouseClickChange_view.setInt32(0, calc_constants.WIDTH, true);          // i32
    MouseClickChange_view.setInt32(4, calc_constants.HEIGHT, true);          // i32
    MouseClickChange_view.setFloat32(8, calc_constants.dx, true);             // f32
    MouseClickChange_view.setFloat32(12, calc_constants.dy, true);             // f32
    MouseClickChange_view.setFloat32(16, calc_constants.xClick, true);             // f32
    MouseClickChange_view.setFloat32(20, calc_constants.yClick, true);             // f32
    MouseClickChange_view.setFloat32(24, calc_constants.changeRadius, true);             // f32
    MouseClickChange_view.setFloat32(28, calc_constants.changeAmplitude, true);             // f32  
    MouseClickChange_view.setInt32(32, calc_constants.surfaceToChange, true);             // f32  
    MouseClickChange_view.setInt32(36, calc_constants.changeType, true);             // f32  
    MouseClickChange_view.setFloat32(40, calc_constants.base_depth, true);             // f32  

    // Render Bindings
    const RenderBindGroupLayout = createRenderBindGroupLayout(device);
    const RenderBindGroup = createRenderBindGroup(device, Render_uniformBuffer, txNewState, txBottom, txMeans, txWaveHeight, txBaseline_WaveHeight, txBottomFriction, txNewState_Sed, erosion_Sed, depostion_Sed, txBotChange_Sed, txGoogleMap, txDraw, textureSampler);
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
    Render_view.setInt32(48, calc_constants.WIDTH, true);          // i32
    Render_view.setInt32(52, calc_constants.HEIGHT, true);          // i32  
    Render_view.setFloat32(56, calc_constants.rotationAngle_xy, true);          // f32  
    Render_view.setFloat32(60, calc_constants.shift_x, true);          // f32  
    Render_view.setFloat32(64, calc_constants.shift_y, true);          // f32  
    Render_view.setFloat32(68, calc_constants.forward, true);          // f32  
    Render_view.setFloat32(72, calc_constants.canvas_width_ratio, true);          // f32 
    Render_view.setFloat32(76, calc_constants.canvas_height_ratio, true);          // f32 
    Render_view.setFloat32(80, calc_constants.delta, true);           // f32
    Render_view.setInt32(84, calc_constants.CB_show, true);          // i32  
    Render_view.setFloat32(88, calc_constants.CB_xbuffer_uv, true);          // i32  
    Render_view.setFloat32(92, calc_constants.CB_xstart_uv, true);          // i32  
    Render_view.setFloat32(96, calc_constants.CB_width_uv, true);          // i32  
    Render_view.setInt32(100, calc_constants.CB_ystart, true);          // i32  
    Render_view.setInt32(104, calc_constants.CB_label_height, true);          // i32  

    // Fetch the source code of various shaders used in the application.
    const Pass0_ShaderCode = await fetchShader('/shaders/Pass0.wgsl');
    const Pass1_ShaderCode = await fetchShader('/shaders/Pass1.wgsl');
    const SedTrans_Pass1_ShaderCode = await fetchShader('/shaders/SedTrans_Pass1.wgsl');
    const Pass2_ShaderCode = await fetchShader('/shaders/Pass2.wgsl');
    const Pass3_ShaderCode_NLSW = await fetchShader('/shaders/Pass3_NLSW.wgsl')
    const Pass3_ShaderCode_Bous = await fetchShader('/shaders/Pass3_Bous.wgsl');
    const SedTrans_Pass3_ShaderCode = await fetchShader('/shaders/SedTrans_Pass3.wgsl')
    const BoundaryPass_ShaderCode = await fetchShader('/shaders/BoundaryPass.wgsl');
    const TridiagX_ShaderCode = await fetchShader('/shaders/TriDiag_PCRx.wgsl');
    const TridiagY_ShaderCode = await fetchShader('/shaders/TriDiag_PCRy.wgsl');
    const SedTrans_UpdateBottom_ShaderCode = await fetchShader('/shaders/SedTrans_UpdateBottom.wgsl');
    const Updateneardry_ShaderCode = await fetchShader('/shaders/Update_neardry.wgsl');
    const UpdateTrid_ShaderCode = await fetchShader('/shaders/Update_TriDiag_coef.wgsl');
    const CalcMeans_ShaderCode = await fetchShader('/shaders/CalcMeans.wgsl');
    const CalcWaveHeight_ShaderCode = await fetchShader('/shaders/CalcWaveHeight.wgsl');
    const MouseClickChange_ShaderCode = await fetchShader('/shaders/MouseClickChange.wgsl');

    const vertexShaderCode = await fetchShader('/shaders/vertex.wgsl');
    const vertex3DShaderCode = await fetchShader('/shaders/vertex3D.wgsl');
    const fragmentShaderCode = await fetchShader('/shaders/fragment.wgsl');
    console.log("Shaders loaded.");

    // Configure the pipelines, one for each shader.
    const Pass0_Pipeline = createComputePipeline(device, Pass0_ShaderCode, Pass0_BindGroupLayout, allComputePipelines);
    const Pass1_Pipeline = createComputePipeline(device, Pass1_ShaderCode, Pass1_BindGroupLayout, allComputePipelines);
    const SedTrans_Pass1_Pipeline = createComputePipeline(device, SedTrans_Pass1_ShaderCode, SedTrans_Pass1_BindGroupLayout, allComputePipelines);
    const Pass2_Pipeline = createComputePipeline(device, Pass2_ShaderCode, Pass2_BindGroupLayout, allComputePipelines);
    const Pass3_Pipeline_NLSW = createComputePipeline(device, Pass3_ShaderCode_NLSW, Pass3_BindGroupLayout, allComputePipelines);
    const Pass3_Pipeline_Bous = createComputePipeline(device, Pass3_ShaderCode_Bous, Pass3_BindGroupLayout, allComputePipelines);
    const SedTrans_Pass3_Pipeline = createComputePipeline(device, SedTrans_Pass3_ShaderCode, SedTrans_Pass3_BindGroupLayout, allComputePipelines);
    const BoundaryPass_Pipeline = createComputePipeline(device, BoundaryPass_ShaderCode, BoundaryPass_BindGroupLayout, allComputePipelines);
    const TridiagX_Pipeline = createComputePipeline(device, TridiagX_ShaderCode, TridiagX_BindGroupLayout, allComputePipelines);
    const TridiagY_Pipeline = createComputePipeline(device, TridiagY_ShaderCode, TridiagY_BindGroupLayout, allComputePipelines);
    const SedTrans_UpdateBottom_Pipeline = createComputePipeline(device, SedTrans_UpdateBottom_ShaderCode, SedTrans_UpdateBottom_BindGroupLayout, allComputePipelines);
    const Updateneardry_Pipeline = createComputePipeline(device, Updateneardry_ShaderCode, Updateneardry_BindGroupLayout, allComputePipelines);
    const UpdateTrid_Pipeline = createComputePipeline(device, UpdateTrid_ShaderCode, UpdateTrid_BindGroupLayout, allComputePipelines);
    const CalcMeans_Pipeline = createComputePipeline(device, CalcMeans_ShaderCode, CalcMeans_BindGroupLayout, allComputePipelines);
    const CalcWaveHeight_Pipeline = createComputePipeline(device, CalcWaveHeight_ShaderCode, CalcWaveHeight_BindGroupLayout, allComputePipelines);
    const MouseClickChange_Pipeline = createComputePipeline(device, MouseClickChange_ShaderCode, MouseClickChange_BindGroupLayout, allComputePipelines);

    var RenderPipeline = createRenderPipeline(device, vertexShaderCode, fragmentShaderCode, swapChainFormat, RenderBindGroupLayout);
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

    // buffers for a vertex grid
    // Define a simple grid as just a single quad (two triangles)
    const gridWidth = calc_constants.WIDTH;  // Number of vertices along the width
    const gridHeight = calc_constants.HEIGHT; // Number of vertices along the height
    let numVertices = 2*gridHeight*gridWidth;
    let vertices = [];

    // Generate vertices for the grid
    for (let y = 0; y < gridHeight - 1; y++) {
        // Start of new strip (except for the first row)
        if (y > 0) {
            // Repeat the first vertex of this row (degenerate triangle)
            vertices.push(-1, 1 - 2 * y / (gridHeight - 1));
        }
        for (let x = 0; x < gridWidth; x++) {
            // Top vertex of the current column
            vertices.push(-1 + 2 * x / (gridWidth - 1), 1 - 2 * y / (gridHeight - 1));
            // Bottom vertex of the current column
            vertices.push(-1 + 2 * x / (gridWidth - 1), 1 - 2 * (y + 1) / (gridHeight - 1));
        }
        // End of strip (except for the last row)
        if (y < gridHeight - 2) {
            // Repeat the last vertex of this row (degenerate triangle)
            vertices.push(1, 1 - 2 * (y + 1) / (gridHeight - 1));
        }
    }
    
    // Handle the last row separately to ensure it's included
    if (gridHeight > 1) {
        let lastY = gridHeight - 2;
        // Repeat the last vertex of the second-to-last row (degenerate triangle)
        vertices.push(1, 1 - 2 * lastY / (gridHeight - 1));
        // Define the last row vertices
        for (let x = 0; x < gridWidth; x++) {
            // Top vertex of the current column (from the second-to-last row)
            vertices.push(-1 + 2 * x / (gridWidth - 1), 1 - 2 * lastY / (gridHeight - 1));
            // Bottom vertex of the current column (last row)
            vertices.push(-1 + 2 * x / (gridWidth - 1), -1);
        }
    }

    const gridVertices = new Float32Array(vertices);
    const gridVertexBuffer = device.createBuffer({
        size: gridVertices.byteLength,
        usage: GPUBufferUsage.VERTEX,
        mappedAtCreation: true
    });
    new Float32Array(gridVertexBuffer.getMappedRange()).set(gridVertices);
    gridVertexBuffer.unmap();
    
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

    // Create an offscreen canvas and draw text and various other items
    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = canvas.width;
    offscreenCanvas.height = canvas.height;
    const ctx = offscreenCanvas.getContext('2d');
    // Flip the canvas content vertically
    ctx.translate(0, offscreenCanvas.height); // Move to the bottom
    ctx.scale(1, -1); // Flip vertically
    // Set the background to white
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
    // create initial colorbar
    update_colorbar(device, offscreenCanvas, ctx, calc_constants, txDraw)

    console.log("Compute / Render loop starting.");
    // This function, `frame`, serves as the main loop of the application,
    // executing repeatedly to update simulation state and render the results.

    var startTime = new Date();  // This captures the current time, or the time at the start of rendering
    var startTime_update = new Date();  // This captures the current time, or the time at the start of rendering

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

        // store baseline wave height map
        if (calc_constants.save_baseline == 1) {
            runCopyTextures(device, commandEncoder, calc_constants, txWaveHeight, txBaseline_WaveHeight)
            calc_constants.save_baseline = 0;
        }

        // update simulation parameters in buffers if they have been changed by user through html
        if (calc_constants.html_update > 0) {

            calc_constants.dt = calc_constants.Courant_num * calc_constants.dx / Math.sqrt(calc_constants.g * calc_constants.base_depth);
            calc_constants.TWO_THETA = calc_constants.Theta * 2.0;
            calc_constants.render_step = Math.round(calc_constants.render_step);

            calc_constants.sedC1_erosion = calc_constants.sedC1_psi*Math.pow(calc_constants.sedC1_d50/1000.,-0.2);
            calc_constants.sedC1_shields = 1.0 / ( (calc_constants.sedC1_denrat - 1.0) * 9.81 * calc_constants.sedC1_d50/1000.);
            let fall_vel_a = 4.0 / 3.0 * 9.81 * calc_constants.sedC1_d50/1000. / 0.2 * (calc_constants.sedC1_denrat - 1.0); 
            calc_constants.sedC1_fallvel = Math.pow(fall_vel_a, 0.5);            

            Pass1_view.setFloat32(20, calc_constants.TWO_THETA, true);           // f32
            Pass1_view.setFloat32(32, calc_constants.dt, true);           // f32
            SedTrans_Pass1_view.setFloat32(20, calc_constants.TWO_THETA, true);           // f32
            SedTrans_Pass1_view.setFloat32(32, calc_constants.dt, true);           // f32
            Pass2_view.setInt32(28, calc_constants.useSedTransModel, true);   //i32
            Pass3_view.setFloat32(8, calc_constants.dt, true);             // f32
            Pass3_view.setUint32(36, calc_constants.timeScheme, true);       // f32
            Pass3_view.setUint32(44, calc_constants.isManning, true);           // f32
            Pass3_view.setFloat32(52, calc_constants.friction, true);             // f32
            Pass3_view.setFloat32(88, calc_constants.seaLevel, true);           // f32
            Pass3_view.setFloat32(92, calc_constants.dissipation_threshold, true);           // f32
            Pass3_view.setFloat32(96, calc_constants.whiteWaterDecayRate, true);           // f32
            Pass3_view.setInt32(100, calc_constants.clearConc, true);           // i32
            SedTrans_Pass3_view.setFloat32(8, calc_constants.dt, true);             // f32
            SedTrans_Pass3_view.setInt32(28, calc_constants.timeScheme, true);       // f32
            SedTrans_Pass3_view.setInt32(52, calc_constants.isManning, true);       // i32
            SedTrans_Pass3_view.setFloat32(56, calc_constants.friction, true);       // f32
            SedTrans_Pass3_view.setFloat32(60, calc_constants.sedC1_shields, true);           // f32
            SedTrans_Pass3_view.setFloat32(64, calc_constants.sedC1_criticalshields, true);           // f32
            SedTrans_Pass3_view.setFloat32(68, calc_constants.sedC1_erosion, true);           // f32
            SedTrans_Pass3_view.setFloat32(72, calc_constants.sedC1_n, true);           // f32
            SedTrans_Pass3_view.setFloat32(76, calc_constants.sedC1_fallvel, true);           // f32

            SedTrans_UpdateBottom_view.setFloat32(8, calc_constants.dt, true);             // f32
            SedTrans_UpdateBottom_view.setInt32(24, calc_constants.timeScheme, true);       // f32
            SedTrans_UpdateBottom_view.setInt32(28, calc_constants.pred_or_corrector, true);       // i32
            SedTrans_UpdateBottom_view.setFloat32(32, calc_constants.sedC1_n, true);           // f32            

            if(calc_constants.clearConc == 1){  // remove all passive tracer sources when changing overlay
                runCopyTextures(device, commandEncoder, calc_constants, txzeros, txContSource)
            }

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
            
            update_colorbar(device, offscreenCanvas, ctx, calc_constants, txDraw) // update colorbar with new climits

            if (calc_constants.viewType == 1)
            {
                // Render QUAD
                RenderPipeline = createRenderPipeline(device, vertexShaderCode, fragmentShaderCode, swapChainFormat, RenderBindGroupLayout);
            }
            else if (calc_constants.viewType == 2)
            {
                // Render Vertex grid
                RenderPipeline = createRenderPipeline_vertexgrid(device, vertex3DShaderCode, fragmentShaderCode, swapChainFormat, RenderBindGroupLayout);
            }

            startTime_update = new Date();  // This captures the current time, or the time at the start of rendering
            frame_count_since_http_update = 0;

            calc_constants.html_update = -1;
        }

        // update surfaces following user clicks
        if (calc_constants.click_update > 0) {

            if (calc_constants.click_update == 1 && calc_constants.viewType == 1) {
                MouseClickChange_view.setFloat32(16, calc_constants.xClick, true);             // f32
                MouseClickChange_view.setFloat32(20, calc_constants.yClick, true);             // f32
                MouseClickChange_view.setFloat32(24, calc_constants.changeRadius, true);             // f32
                MouseClickChange_view.setFloat32(28, calc_constants.changeAmplitude, true);             // f32
                MouseClickChange_view.setInt32(32, calc_constants.surfaceToChange, true);             // f32  
                MouseClickChange_view.setInt32(36, calc_constants.changeType, true);             // f32  

                runComputeShader(device, commandEncoder, MouseClickChange_uniformBuffer, MouseClickChange_uniforms, MouseClickChange_Pipeline, MouseClickChange_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);  // update depth/friction based on mouse click
                if(calc_constants.surfaceToChange == 1){  // when changing bath/topo
                    runCopyTextures(device, commandEncoder, calc_constants, txtemp_MouseClick, txBottom)
                    if (calc_constants.NLSW_or_Bous > 0) {
                        console.log('Updating neardry & tridiag coef due to change in depth')
                        runComputeShader(device, commandEncoder, Updateneardry_uniformBuffer, Updateneardry_uniforms, Updateneardry_Pipeline, Updateneardry_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);  //need to update tridiagonal coefficients due to change inn depth
                        runCopyTextures(device, commandEncoder, calc_constants, txtemp_bottom, txBottom)
                        runComputeShader(device, commandEncoder, UpdateTrid_uniformBuffer, UpdateTrid_uniforms, UpdateTrid_Pipeline, UpdateTrid_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);  //need to update tridiagonal coefficients due to change inn depth
                    }
                } else if(calc_constants.surfaceToChange == 2){  //when changing friction
                    runCopyTextures(device, commandEncoder, calc_constants, txtemp_MouseClick, txBottomFriction)

                } else if(calc_constants.surfaceToChange == 3){  //when changing passive tracer
                    runCopyTextures(device, commandEncoder, calc_constants, txtemp_MouseClick, txContSource)

                } else if(calc_constants.surfaceToChange == 4){  //water surface elevation
                    runCopyTextures(device, commandEncoder, calc_constants, txtemp_MouseClick, txstateUVstar)
                }
            }
            else if (calc_constants.click_update == 2 && calc_constants.viewType == 2)
            {
                Render_view.setFloat32(56, calc_constants.rotationAngle_xy, true);          // f32  
                Render_view.setFloat32(60, calc_constants.shift_x, true);          // f32  
                Render_view.setFloat32(64, calc_constants.shift_y, true);          // f32  
                Render_view.setFloat32(68, calc_constants.forward, true);          // f32  
                console.log("Updating view in Explorer Mode" )
            }
            
            Render_view.setFloat32(72, calc_constants.canvas_width_ratio, true);          // f32 
            Render_view.setFloat32(76, calc_constants.canvas_height_ratio, true);          // f32 

            calc_constants.click_update = -1;
        }

         // loop through the compute shaders "render_step" times.  
        var commandEncoder;  // init the encoder
        if (calc_constants.simPause < 0) {// do not run compute loop when > 0, when the simulation is paused {
            for (let frame_c = 0; frame_c < calc_constants.render_step; frame_c++) {  // loop through the compute shaders "render_step" time

                // Increment the frame counter and the simulation time.
                frame_count += 1;
                frame_count_since_http_update += 1;

                total_time = frame_count * calc_constants.dt;  //simulation time - at this point, we know values at times n-1 and previous.  We are predicted values at n
                total_time_since_http_update = frame_count_since_http_update * calc_constants.dt; // simulation time sinze last change to interface
                
                // Pass0
                runComputeShader(device, commandEncoder, Pass0_uniformBuffer, Pass0_uniforms, Pass0_Pipeline, Pass0_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);

                // Pass1
                runComputeShader(device, commandEncoder, Pass1_uniformBuffer, Pass1_uniforms, Pass1_Pipeline, Pass1_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);

                // SedTrans_Pass1
                if(calc_constants.useSedTransModel == 1){
                    runComputeShader(device, commandEncoder, SedTrans_Pass1_uniformBuffer, SedTrans_Pass1_uniforms, SedTrans_Pass1_Pipeline, SedTrans_Pass1_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);
                }

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

                // SedTrans Pass3
                if(calc_constants.useSedTransModel == 1){
                    runComputeShader(device, commandEncoder, SedTrans_Pass3_uniformBuffer, SedTrans_Pass3_uniforms, SedTrans_Pass3_Pipeline, SedTrans_Pass3_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);
                    runCopyTextures(device, commandEncoder, calc_constants, dU_by_dt_Sed, predictedGradients_Sed)
                }

                // BoundaryPass
                BoundaryPass_view.setFloat32(20, total_time, true);           // set current time
                runComputeShader(device, commandEncoder, BoundaryPass_uniformBuffer, BoundaryPass_uniforms, BoundaryPass_Pipeline, BoundaryPass_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);
                // updated texture is stored in txtemp_boundary, but back into current_stateUVstar
                runCopyTextures(device, commandEncoder, calc_constants, txtemp_boundary, current_stateUVstar)
                if(calc_constants.useSedTransModel == 1){
                    runCopyTextures(device, commandEncoder, calc_constants, txtemp_boundary_Sed, txNewState_Sed)
                }   

                //Tridiag Solver for Bous, or copy for NLSW
                runTridiagSolver(device, commandEncoder, calc_constants, current_stateUVstar, txNewState, coefMatx, coefMaty, newcoef_x, newcoef_y, txtemp_PCRx, txtemp_PCRy, txtemp2_PCRx, txtemp2_PCRy,
                    TridiagX_uniformBuffer, TridiagX_uniforms, TridiagX_Pipeline, TridiagX_BindGroup, TridiagX_view,
                    TridiagY_uniformBuffer, TridiagY_uniforms, TridiagY_Pipeline, TridiagY_BindGroup, TridiagY_view,
                    runComputeShader, runCopyTextures
                )

                // after tridiag, we re-eval bc's on eta. P, Q  [this is not needed for NLSW, since U*=P and V*=Q, and these bc's have already been enforced]
                if (calc_constants.NLSW_or_Bous > 0) { //BOUS
                    runComputeShader(device, commandEncoder, BoundaryPass_uniformBuffer, BoundaryPass_uniforms, BoundaryPass_Pipeline, BoundaryPass_BindGroup_NewState, calc_constants.DispatchX, calc_constants.DispatchY);
                }
                // updated texture is stored in txtemp, but back into txNewState - this needs to be done for both NLSW and Bous.  Even though these are the same in NLSW, some passes use State, and these must be updated with bc's
                runCopyTextures(device, commandEncoder, calc_constants, txtemp_boundary, txNewState)

                // Shift back FG textures - only have to do this for Bous, and only after predictor step
                runCopyTextures(device, commandEncoder, calc_constants, F_G_star_oldGradients, F_G_star_oldOldGradients)
                runCopyTextures(device, commandEncoder, calc_constants, predictedF_G_star, F_G_star_oldGradients)

                if (calc_constants.timeScheme == 2)  // only called when using Predictor+Corrector method.  Adding corrector allows for a time step twice as large (also adds twice the computation) and provides a more accurate solution
                {
                    // put txNewState into txState for the corrector equation, so gradients use the predicted values
                    runCopyTextures(device, commandEncoder, calc_constants, txNewState, txState)
                    if(calc_constants.useSedTransModel == 1){
                        runCopyTextures(device, commandEncoder, calc_constants, txNewState_Sed, txState_Sed)
                    }                       

                    // Pass0
                    runComputeShader(device, commandEncoder, Pass0_uniformBuffer, Pass0_uniforms, Pass0_Pipeline, Pass0_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);

                    // Pass1
                    runComputeShader(device, commandEncoder, Pass1_uniformBuffer, Pass1_uniforms, Pass1_Pipeline, Pass1_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);

                    // SedTrans_Pass1
                    if(calc_constants.useSedTransModel == 1){
                        runComputeShader(device, commandEncoder, SedTrans_Pass1_uniformBuffer, SedTrans_Pass1_uniforms, SedTrans_Pass1_Pipeline, SedTrans_Pass1_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);
                    }

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

                    // SedTrans Pass3
                    if(calc_constants.useSedTransModel == 1){
                        runComputeShader(device, commandEncoder, SedTrans_Pass3_uniformBuffer, SedTrans_Pass3_uniforms, SedTrans_Pass3_Pipeline, SedTrans_Pass3_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);
                    }

                    // BoundaryPass
                    runComputeShader(device, commandEncoder, BoundaryPass_uniformBuffer, BoundaryPass_uniforms, BoundaryPass_Pipeline, BoundaryPass_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);
                    // updated texture is stored in txtemp, but back into current_stateUVstar
                    runCopyTextures(device, commandEncoder, calc_constants, txtemp_boundary, current_stateUVstar)
                    if(calc_constants.useSedTransModel == 1){
                        runCopyTextures(device, commandEncoder, calc_constants, txtemp_boundary_Sed, txNewState_Sed)
                    }                    

                    //Tridiag Solver for Bous, or copy for NLSW
                    runTridiagSolver(device, commandEncoder, calc_constants, current_stateUVstar, txNewState, coefMatx, coefMaty, newcoef_x, newcoef_y, txtemp_PCRx, txtemp_PCRy, txtemp2_PCRx, txtemp2_PCRy,
                            TridiagX_uniformBuffer, TridiagX_uniforms, TridiagX_Pipeline, TridiagX_BindGroup, TridiagX_view,
                            TridiagY_uniformBuffer, TridiagY_uniforms, TridiagY_Pipeline, TridiagY_BindGroup, TridiagY_view,
                            runComputeShader, runCopyTextures
                    )

                    // after tridiag, we re-eval bc's on eta. P, Q  [this is not needed for NLSW, since U*=P and V*=Q, and these bc's have already been enforced]
                    if (calc_constants.NLSW_or_Bous > 0) { //BOUS
                        runComputeShader(device, commandEncoder, BoundaryPass_uniformBuffer, BoundaryPass_uniforms, BoundaryPass_Pipeline, BoundaryPass_BindGroup_NewState, calc_constants.DispatchX, calc_constants.DispatchY);
                    }
                    // updated texture is stored in txtemp, but back into txNewState - this needs to be done for both NLSW and Bous.  Even though these are the same in NLSW, some passes use State, and these must be updated with bc's
                    runCopyTextures(device, commandEncoder, calc_constants, txtemp_boundary, txNewState)
                }

                // Update Bottom from Sed Transport
                if(calc_constants.useSedTransModel == 1){
                    runComputeShader(device, commandEncoder, SedTrans_UpdateBottom_uniformBuffer, SedTrans_UpdateBottom_uniforms, SedTrans_UpdateBottom_Pipeline, SedTrans_UpdateBottom_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);
                    runCopyTextures(device, commandEncoder, calc_constants, txtemp_SedTrans_Botttom, txBottom)
                    runCopyTextures(device, commandEncoder, calc_constants, txtemp_SedTrans_Change, txBotChange_Sed)
                    if (calc_constants.NLSW_or_Bous > 0) {
                     //   console.log('Updating neardry & tridiag coef sediment transport depth change')
                        runComputeShader(device, commandEncoder, Updateneardry_uniformBuffer, Updateneardry_uniforms, Updateneardry_Pipeline, Updateneardry_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);  //need to update tridiagonal coefficients due to change inn depth
                        runCopyTextures(device, commandEncoder, calc_constants, txtemp_bottom, txBottom)
                        runComputeShader(device, commandEncoder, UpdateTrid_uniformBuffer, UpdateTrid_uniforms, UpdateTrid_Pipeline, UpdateTrid_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);  //need to update tridiagonal coefficients due to change inn depth
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

                // shift/Copy SedTrans
                if(calc_constants.useSedTransModel == 1){
                    runCopyTextures(device, commandEncoder, calc_constants, oldGradients_Sed, oldOldGradients_Sed)
                    runCopyTextures(device, commandEncoder, calc_constants, predictedGradients_Sed, oldGradients_Sed)
                    runCopyTextures(device, commandEncoder, calc_constants, txNewState_Sed, txState_Sed)
                }
            }
        }

        // Define the settings for the render pass.
        // The render target is the current swap chain texture.
        const RenderPassDescriptor = {
            colorAttachments: [{
                view: context.getCurrentTexture().createView(),
                loadOp: 'clear',
                storeOp: 'store',
                clearColor: { r: 0.5, g: 0.5, b: 0.5, a: 1 },
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

        if (calc_constants.viewType == 1)
        {
            // Render QUAD
            RenderPass.setVertexBuffer(0, quadVertexBuffer);
            // Issue draw command to draw
            RenderPass.draw(4);  // Draw the quad 
        }
        else if (calc_constants.viewType == 2)
        {
            // Render Vertex grid
            RenderPass.setVertexBuffer(0, gridVertexBuffer);
            // Issue draw command to draw
            RenderPass.draw(numVertices);  // Draw the vertex grid
            
        }

        // End the render pass after recording all its commands.
        RenderPass.end();

        // Submit the recorded commands to the GPU for execution.
        device.queue.submit([commandEncoder.finish()]);
        // end screen render

        // store the current screen render as a texture, and then copy to a storage texture that will not be destroyed.  This is for creating jpgs, animations, only when not fullscreen
        if(calc_constants.full_screen == 0){
            const current_render = context.getCurrentTexture();
            commandEncoder = device.createCommandEncoder();

            commandEncoder.copyTextureToTexture(
                { texture: current_render },  //src
                { texture: txScreen },  //dst
                { width: canvas.width, height: canvas.height, depthOrArrayLayers: 1 }
            );
            device.queue.submit([commandEncoder.finish()]);
        }
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
        calc_constants.elapsedTime_update = (now - startTime_update) / 1000;

        // Update the output texture
        runCopyTextures(device, commandEncoder, calc_constants, txNewState, txSaveOut)

        // Call the function to display the constants in the index.html page
        calc_constants.clearConc = 0; // reset back to default value - no easier place to set this back.
        Pass3_view.setInt32(100, calc_constants.clearConc, true);           // i32

        displayCalcConstants(calc_constants, total_time_since_http_update);
        displaySimStatus(calc_constants, total_time, total_time_since_http_update);
    }


    // Invoke the `frame` function once to start the main loop.
    frame();

}

// All the functions below this are for UI - this is also where the wave simulation is started
document.addEventListener('DOMContentLoaded', function () {
    // Get a reference to your canvas element.
    var canvas = document.getElementById('webgpuCanvas');

    // Add the event listener for 'click' events - this is for modifying bathy / various mapsl
    // Flags to track if the mouse is being held down
    var leftMouseIsDown = false;
    var rightMouseIsDown = false;

    // Variables for mouse interaction
    var lastMouseX_right = 0;
    var lastMouseY_right = 0;
    var lastMouseX_left = 0;
    var lastMouseY_left = 0;

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
        if (event.button === 0 && calc_constants.viewType == 1) { // Left mouse button, Design mode
            leftMouseIsDown = true;
            handleMouseEvent(event);  // Handle the initial click
        } else if (event.button === 0 && calc_constants.viewType == 2) { // Left mouse button, Explorer mode
            leftMouseIsDown = true;
            lastMouseX_left = event.clientX;
            lastMouseY_left = event.clientY;
            calc_constants.click_update = 2;
        } else if (event.button === 2) { // Right mouse button
            rightMouseIsDown = true;
            lastMouseX_right = event.clientX;
            lastMouseY_right = event.clientY;
            calc_constants.click_update = 2;
        }
    });

    // Event listener for mousemove - if mouse is down, it's equivalent to multiple clicks
    canvas.addEventListener('mousemove', function (event) {
        if (leftMouseIsDown && calc_constants.viewType == 1) {
            handleMouseEvent(event);
        } else if (leftMouseIsDown && calc_constants.viewType == 2) {
            const deltaX = event.clientX - lastMouseX_left;
            const deltaY = event.clientY - lastMouseY_left;
            const motion_inc = 0.001 / calc_constants.forward;

            calc_constants.shift_x  += deltaX * motion_inc; // Adjust the sensitivity as needed
            calc_constants.shift_y  -= deltaY * motion_inc * calc_constants.WIDTH / calc_constants.HEIGHT; // Adjust the sensitivity as needed

            lastMouseX_left = event.clientX;
            lastMouseY_left = event.clientY;
            calc_constants.click_update = 2;
        } else if (rightMouseIsDown) {
            const deltaX = event.clientX - lastMouseX_right;
            calc_constants.rotationAngle_xy -= deltaX * 0.1; // Adjust the sensitivity as needed

            lastMouseX_right = event.clientX;
            lastMouseY_right = event.clientY;
            calc_constants.click_update = 2;
        }
    });

    // Event listener for mouseup - end of the hold
    canvas.addEventListener('mouseup', function (event) {
        if (event.button === 0) { // Left mouse button
            leftMouseIsDown = false;
            calc_constants.click_update = 0;  // Optionally, reset the click_update here if needed
        } else if (event.button === 2) { // Right mouse button
            rightMouseIsDown = false;
            calc_constants.click_update = 0;  // Optionally, reset the click_update here if needed
        }
    });

    // To handle cases where the mouse leaves the canvas while being pressed
    canvas.addEventListener('mouseleave', function () {
        leftMouseIsDown = false;  // Consider the left mouse as no longer being held down
        rightMouseIsDown = false; // Consider the right mouse as no longer being held down
    });

    // Prevent the context menu from appearing on right-click
    canvas.addEventListener('contextmenu', function (event) {
        event.preventDefault();
    });
    // end mouse interaction functions

    // keyboard interactions
    // Event listener for keydown - to handle arrow keys for shifting
    document.addEventListener('keydown', function (event) {
        const shiftAmount = 0.1; // Change this value to shift by more or less  
        calc_constants.click_update = 2;
        switch (event.key) {
            case 'a': // 'A' key for left
            case 'A':
                calc_constants.shift_x -= shiftAmount;
                break;
            case 'd': // 'D' key for right
            case 'D':
                calc_constants.shift_x += shiftAmount;
                break;
            case 'w': // 'W' key for up
            case 'W':
                calc_constants.shift_y -= shiftAmount;
                break;
            case 's': // 'S' key for down
            case 'S':
                calc_constants.shift_y += shiftAmount;
                break;
        }
    });
    // end keyboard interaction

    // mouse scroll wheel interaction
    const zoomSensitivity = 0.1;  // Adjust this value to make zoom faster or slower

    canvas.addEventListener('wheel', function(event) {
        if (event.cancelable) {
            // Only call preventDefault if the event is cancelable, indicating it's safe to do so
            event.preventDefault();
        }
        
        calc_constants.click_update = 2;
    
        // Adjust the zoom level based on the wheel delta
        if (event.deltaY < 0) {
            // Scrolling up, zoom in
            calc_constants.forward *= (1 + zoomSensitivity);
        } else if (event.deltaY > 0) {
            // Scrolling down, zoom out
            calc_constants.forward *= (1 - zoomSensitivity);
        }
    
        // Clamp the zoom level to a minimum and maximum value to prevent too much zoom
        calc_constants.forward = Math.max(0.1, Math.min(100, calc_constants.forward));
    }, { passive: false }); // Explicitly mark the listener as not passive    
    // end scroll wheel interaction

    // html input fields
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

        if (property == 'showBreaking') {
            calc_constants.clearConc = 1;
            if (calc_constants.showBreaking <= 1){
                calc_constants.dissipation_threshold = 0.15;
                calc_constants.whiteWaterDecayRate = 0.1;
            } else if (calc_constants.showBreaking == 2){
                calc_constants.dissipation_threshold = 10;
                calc_constants.whiteWaterDecayRate = 0.0;
            }
        }


        calc_constants.html_update = 1; // flag used to check for updates.
    }

     // Function to handle drop-down menu updates directly on selection change
     function setupDropdownListeners(button_dropdown_Actions) {
        button_dropdown_Actions.forEach(({ input, property }) => {
            const selectElement = document.getElementById(input); // The <select> element

            // Ensure the selectElement exists before adding an event listener
            if (selectElement) {
                selectElement.addEventListener('change', function (event) {
                    const selectedValue = event.target.value; // Getting the selected value from the drop-down
                    updateCalcConstants(property, Math.round(selectedValue)); // Assuming you want to round the value
                    updateAllUIElements();
                });
            } else {
                console.error(`Element with ID '${input}' not found.`);
            }
        });
    } 
    
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

    // Parameters for each button/input pair which has some numerical input value, and an associated "Update" button
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
        { id: 'sedC1_d50-button', input: 'sedC1_d50-input', property: 'sedC1_d50' },
        { id: 'sedC1_n-button', input: 'sedC1_n-input', property: 'sedC1_n' },
        { id: 'sedC1_psi-button', input: 'sedC1_psi-input', property: 'sedC1_psi' },
        { id: 'sedC1_criticalshields-button', input: 'sedC1_criticalshields-input', property: 'sedC1_criticalshields' },
        { id: 'sedC1_denrat-button', input: 'sedC1_denrat-input', property: 'sedC1_denrat' },
    ]; 

    

    // Specify the inputs for the drop-down menus
    const button_dropdown_Actions = [
        { input: 'nlsw-select', property: 'NLSW_or_Bous' },
        { input: 'west_boundary_type-select', property: 'west_boundary_type' },
        { input: 'east_boundary_type-select', property: 'east_boundary_type' },
        { input: 'south_boundary_type-select', property: 'south_boundary_type' },
        { input: 'north_boundary_type-select', property: 'north_boundary_type' },
        { input: 'isManning-select', property: 'isManning' },
        { input: 'simPause-select', property: 'simPause' },
        { input: 'surfaceToPlot-select', property: 'surfaceToPlot' },
        { input: 'colorMap_choice-select', property: 'colorMap_choice' },
        { input: 'showBreaking-select', property: 'showBreaking' },
        { input: 'GoogleMapOverlay-select', property: 'GoogleMapOverlay' },
        { input: 'viewType-select', property: 'viewType' },
        { input: 'surfaceToChange-select', property: 'surfaceToChange' },
        { input: 'changeType-select', property: 'changeType' },
        { input: 'useSedTransModel-select', property: 'useSedTransModel' },
        { input: 'run_example-select', property: 'run_example' },
    ];

    // Call the function for setting up listeners on dropdown menus
    setupDropdownListeners(button_dropdown_Actions);

    // set up listeners for the "Update" button fields
    buttonActions.forEach(({ id, input, property }) => {
        const button = document.getElementById(id);
        const inputValue = document.getElementById(input);
    
        if (button && inputValue) {
            button.addEventListener('click', function () {
                const value = parseFloat(inputValue.value); // Assuming all values are floats; parse as appropriate
                updateCalcConstants(property, value);
                
                // Call the function to update all UI elements
                updateAllUIElements();
            });
        } else {
            // Error handling if the button or input element is not found
            if (!button) {
                console.error(`Button with ID '${id}' not found.`);
            }
            if (!inputValue) {
                console.error(`Input with ID '${input}' not found.`);
            }
        }
    });

    // special button to reset everything - Reload or Load New Configuration
    const refreshButton = document.getElementById('refresh-button');
    refreshButton.addEventListener('click', function () {
        location.reload();
    });

    // to make the canvas go full screen
    const fullscreenButton = document.getElementById('fullscreen-button');
    // Function to adjust canvas size
    function resizeCanvas() {
        if (document.fullscreenElement) {
            const window_width = window.innerWidth;
            const window_height = window.innerHeight;

            if(calc_constants.WIDTH >= calc_constants.HEIGHT){
                calc_constants.canvas_width_ratio = 1.0;
                calc_constants.canvas_height_ratio = 1.0 / (calc_constants.WIDTH/calc_constants.HEIGHT*window_height/window_width); 
            } else {
                calc_constants.canvas_width_ratio = calc_constants.WIDTH/calc_constants.HEIGHT*window_height/window_width; 
                calc_constants.canvas_height_ratio = 1.0; 
            } 

            canvas.width = window_width;
            canvas.height = window_height;
        } else {
            // Set canvas size back to normal when exiting full screen
            canvas.width = Math.ceil(calc_constants.WIDTH/64)*64;  // widht needs to have a multiple of 256 bytes per row.  Data will have four channels (rgba), so mulitple os 256/4 = 64;
            canvas.height = Math.round(calc_constants.HEIGHT * canvas.width / calc_constants.WIDTH);
            calc_constants.canvas_width_ratio = 1.0; 
            calc_constants.canvas_height_ratio = 1.0; 
        }
    }


    // function to minimize and expand the user input containers
    const windows = document.querySelectorAll('.window-content');

    windows.forEach(windowContent => {
        const button = windowContent.previousElementSibling.querySelector('.minimize-button');
        // Check for the data attribute and set the initial state
        if (windowContent.getAttribute('data-default') === 'minimized') {
            windowContent.style.display = 'none';
            button.textContent = '+';
        } else {
            windowContent.style.display = 'block';
            button.textContent = '-';
        }

        // The .window-content to toggle is the next sibling of the button's parent .window-header
        button.addEventListener('click', function() {
            if (windowContent.style.display === 'none') {
                windowContent.style.display = 'block';
                this.textContent = '-';
            } else {
                windowContent.style.display = 'none';
                this.textContent = '+';
            }
        });
    });

    fullscreenButton.addEventListener('click', function () {
        if (!document.fullscreenElement) {
            canvas.requestFullscreen().then(() => {
                canvas.classList.add('fullscreen'); // Add the full-screen class for styling
                resizeCanvas(); // Resize the canvas to full screen dimensions
            }).catch(err => {
                console.log(`Error attempting to enable full-screen mode: ${err.message}`);
            });
        } else {
            document.exitFullscreen().then(() => {
                canvas.classList.remove('fullscreen'); // Remove the full-screen class
                resizeCanvas(); // Resize the canvas back to normal dimensions
                
            }).catch(err => {
                console.log(`Error attempting to disable full-screen mode: ${err.message}`);
            });
        }
    });

    // Handle resize events when in full screen
    window.addEventListener('resize', resizeCanvas);

    // Listen for fullscreen change events
    document.addEventListener('fullscreenchange', function () {
        if (!document.fullscreenElement) {
            // The user has exited full screen
            canvas.classList.remove('fullscreen'); // Remove the full-screen class
            resizeCanvas(); // Resize the canvas back to normal dimensions
            
            console.log("Exited full screen mode");
            updateCalcConstants('viewType', 1); // change to explorer mode
            calc_constants.click_update = 1;
            calc_constants.full_screen = 0;
            updateAllUIElements();
            // Include any additional logic you want to perform when exiting full screen
        } else {
            // The user has entered full screen
            console.log("Entered full screen mode");
            updateCalcConstants('viewType', 2); // change to design mode
            calc_constants.click_update = 2;
            calc_constants.full_screen = 1;
            // Include any additional logic you want to perform when entering full screen
        }
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

    // Save baseline wave height surface
    document.getElementById('save-baseline-texture-btn').addEventListener('click', function () {
        calc_constants.save_baseline = 1;  // store baseline wave height
    });


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
     //   downloadGeoTiffData(device, txSaveOut, 1, calc_constants.dx, calc_constants.dy);  // current implemntation does not allow writing of float32, only uint8
     //  can update to write an RGB geotiff, but that doesnt seem too useful
    });


    // Download jpg of screen output
    document.getElementById('downloadJPG-button').addEventListener('click', function () {
        saveRenderedImageAsJPEG(device, txScreen, canvas.width, canvas.height);
    });

    // start simulation

    // Ensure to bind this function to your button's 'click' event in the HTML or here in the JS.
    document.getElementById('start-simulation-btn').addEventListener('click', function () {
        startSimulation(); 
        const delay = 5000; // Time in milliseconds (1000 ms = 1 second)
        setTimeout(updateAllUIElements, delay);
    });

    // run example simulation

    // Ensure to bind this function to your button's 'click' event in the HTML or here in the JS.
    document.getElementById('run-example-simulation-btn').addEventListener('click', function () {
        initializeWebGPUApp();
        const delay = 5000; // Time in milliseconds (1000 ms = 1 second)
        setTimeout(updateAllUIElements, delay);

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


