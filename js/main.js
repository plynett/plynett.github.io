// import source files
import { calc_constants, timeSeriesData, loadConfig, init_sim_parameters } from './constants_load_calc.js';  // variables and functions needed for init_sim_parameters
import { loadDepthSurface, loadInitCondSurface, loadFrictionSurface, loadHardBottomSurface, loadWaveData, loadOverlay, CreateGoogleMapImage, calculateGoogleMapScaleAndOffset, loadImageBitmap, loadUserImage, loadCubeBitmaps} from './File_Loader.js';  // load depth surface and wave data file
import { readTextureData, downloadTextureData, downloadObjectAsFile, handleFileSelect, loadJsonIntoCalcConstants, saveRenderedImageAsJPEG, saveSingleValueToFile, saveTextureSlicesAsImages, createAnimatedGifFromTexture, writeSurfaceData, sleep} from './File_Writer.js';  // load depth surface and wave data file
import { readCornerPixelData, readToolTipTextureData, downloadTimeSeriesData, resetTimeSeriesData} from './Time_Series.js';  // time series functions
import { create_2D_Texture, create_2D_F16Texture, create_2D_Image_Texture, create_3D_Image_Texture, create_3D_Data_Texture, create_1D_Texture, createUniformBuffer, create_Depth_Texture} from './Create_Textures.js';  // create texture function
import { copyBathyDataToTexture, copyWaveDataToTexture, copyTSlocsToTexture, copyInitialConditionDataToTexture, copyConstantValueToTexture, copyTridiagXDataToTexture, copyTridiagYDataToTexture, copyImageBitmapToTexture, copy2DDataTo3DTexture} from './Copy_Data_to_Textures.js';  // fills in channels of txBottom
import { makeModelMatrix, loadSceneModels, loadglTFModel} from './Model_Loaders.js';  // functions to load 3D models
import { createRenderBindGroupLayout, createRenderBindGroup, update_colorbar, loadImage} from './Handler_Render.js';  // group bindings for render shaders
import { createSkyboxBindGroupLayout, createSkyboxBindGroup} from './Handler_Skybox.js';  // group bindings for skybox shaders
import { createModelBindGroupLayout, createModelBindGroup} from './Handler_Model.js';  // group bindings for Model shaders
import { create_Pass0_BindGroupLayout, create_Pass0_BindGroup } from './Handler_Pass0.js';  // group bindings for Pass0 shaders
import { create_Pass1_BindGroupLayout, create_Pass1_BindGroup } from './Handler_Pass1.js';  // group bindings for Pass1 shaders
import { create_SedTrans_Pass1_BindGroupLayout, create_SedTrans_Pass1_BindGroup } from './Handler_SedTrans_Pass1.js';  // group bindings for SedTrans_Pass1 shaders
import { create_Pass2_BindGroupLayout, create_Pass2_BindGroup } from './Handler_Pass2.js';  // group bindings for Pass2 shaders 
import { create_PassBreaking_BindGroupLayout, create_PassBreaking_BindGroup } from './Handler_PassBreaking.js';  // group bindings for PassBreaking shaders
import { create_Pass3_BindGroupLayout, create_Pass3_BindGroup, create_Pass3A_Coulwave_BindGroupLayout, create_Pass3A_Coulwave_BindGroup, create_Pass3B_Coulwave_BindGroupLayout, create_Pass3B_Coulwave_BindGroup } from './Handler_Pass3.js';  // group bindings for Pass3 shaders
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
import { create_ExtractTimeSeries_BindGroupLayout, create_ExtractTimeSeries_BindGroup } from './Handler_ExtractTimeSeries.js';  // group bindings for storing single pixel / time series values
import { create_Copytxf32_txf16_BindGroupLayout, create_Copytxf32_txf16_BindGroup } from './Handler_Copytxf32_txf16.js';  // group bindings for f32 to f16 copy shader
import { createComputePipeline, createRenderPipeline, createRenderPipeline_vertexgrid, createSkyboxPipeline, createModelPipeline, createDuckPipeline} from './Config_Pipelines.js';  // pipeline config for ALL shaders
import { fetchShader, runComputeShader, runCopyTextures, runComputeShader_EncStack, runCopyTextures_EncStack} from './Run_Compute_Shader.js';  // function to run shaders, works for all
import { runTridiagSolver } from './Run_Tridiag_Solver.js';  // function to run PCR triadiag solver, works for all
import { displayCalcConstants, displaySimStatus, displayTimeSeriesLocations, displaySlideVolume, ConsoleLogRedirection} from './display_parameters.js';  // starting point for display of simulation parameters
import { mat4, vec3 } from 'https://cdn.jsdelivr.net/npm/gl-matrix/esm/index.js';

// Get a reference to the HTML canvas element with the ID 'webgpuCanvas'
const canvas = document.getElementById('webgpuCanvas');

// Access the WebGPU object. This is the entry point to the WebGPU API.
const gpu = navigator.gpu;

// globals in this source file
let device = null;
let txScreen = null;
let txAnimation = null;
let txOverlayMap = null;
let txGoogleMap = null;
let txSatMap = null;
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

// This is an asynchronous function to set up and run the WebGPU context and resources.
// All of the compute pipelines are included in this function
async function initializeWebGPUApp(configContent, bathymetryContent, waveContent, OverlayFile, modelFile, etaInitialConditionFile, frictionFile, hardbottomFile) {
    // Log a message indicating the start of the initialization process.
    console.log("Starting Celeris-WebGPU");

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

    // Request a device. The device is a representation of the GPU and allows for resource creation and command submission.
    device = await adapter.requestDevice({
        // Enable built-in validation
        requiredFeatures: [],
        requiredLimits: {},
        forceFallbackAdapter: false,
    });
    console.log("GPU Device acquired, starting resource creation...");

    // Handle device lost and uncaptured error events
    device.lost.then((info) => {
    console.error("WebGPU device lost:", info);
    });

    device.addEventListener("uncapturederror", (e) => {
    console.error("WebGPU uncaptured error:", e.error);
    });


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
    const PassBreaking_uniformBuffer = createUniformBuffer(device);
    const Pass3A_Coulwave_uniformBuffer = createUniformBuffer(device);
    const Pass3B_Coulwave_uniformBuffer = createUniformBuffer(device);
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
    const ExtractTimeSeries_uniformBuffer = createUniformBuffer(device);
    let Render_bufferSize = 272; // 272 bytes for render pipeline, 256 for compute pipeline
    const Render_uniformBuffer = createUniformBuffer(device,Render_bufferSize);
    const Skybox_uniformBuffer = createUniformBuffer(device); // View and Projection buffer: holds two 4×4 f32 view matrix (16 floats → 64 bytes)
    const Model_uniformBuffer = createUniformBuffer(device);
    const Copytxf32_txf16_uniformBuffer = createUniformBuffer(device);

    // create buffer for all file writes
    const requiredBytesPerRow_2Dbuffer = Math.ceil((calc_constants.WIDTH * 4 * 4) / 256) * 256;
    const bufferSize_2Dbuffer = calc_constants.HEIGHT * requiredBytesPerRow_2Dbuffer;

    const readbackBuffer = device.createBuffer({
        size: bufferSize_2Dbuffer,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    // Create a sampler for texture sampling. This defines how the texture will be sampled (e.g., nearest-neighbor sampling).  Used only for render pipeline
    const textureSampler = device.createSampler({
        magFilter: 'nearest',
        minFilter: 'nearest',
        addressModeU: 'mirror-repeat',
        addressModeV: 'mirror-repeat'
    });
    const textureSampler_linear = device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
        addressModeU: 'mirror-repeat',
        addressModeV: 'mirror-repeat'
    });

    // Create a texturse with the desired dimensions (WIDTH, HEIGHT) and format 'rgba32float'.
    // Textures will have multiple usages, allowing it to be read/written by shaders, copied from/to, and used as a render target.

    console.log("Creating 2D textures...");
    const txBottom = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores information about the bathy/topo
    const txBottomInitial = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores information about the initial bathy/topo
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
    const txHardBottom = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores hard bottom elevation
    const txBottomFriction = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores bottom friction info   
    const txDesignComponents = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores map of added components  
    const txContSource = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores passive tracer source map
    const txXFlux = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores x-flux values along cell edges
    const txYFlux = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores y-flux values along cell edges
    const txXFlux_Sed = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores x-flux values along cell edges
    const txYFlux_Sed = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores y-flux values along cell edges
    const txBreaking = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores breaking parameters
    const txDissipationFlux = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores dissipation flux values
    const predictedGradients = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores d(state)/dt values found in the predictor step
    const oldGradients = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores d(state)/dt values at previous time step
    const oldOldGradients = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores d(state)/dt values from two time steps ago
    const predictedGradients_Sed = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores d(state)/dt values found in the predictor step
    const oldGradients_Sed = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores d(state)/dt values at previous time step
    const oldOldGradients_Sed = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores d(state)/dt values from two time steps ago
    const predictedF_G_star = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores F*, G* (bous only) found in predictor step
    const F_G_star_oldGradients = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures); // stores F*, G* (bous only) found at previous time step
    const F_G_star_oldOldGradients = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures); // stores F*, G* (bous only) found from two time steps ago
    const txtemp_Breaking = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores temporary breaking parameters
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
    const txtemp_MouseClick2 = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // temp storage for MouseClick shader
    const coefMatx = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // tridiagonal coefficients for x-dir (bous only)
    const coefMaty = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // tridiagonal coefficients for y-dir (bous only)
    const newcoef_x = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // PCR reduced tridiagonal coefficients for x-dir (bous only) 
    const newcoef_y = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // PCR reduced tridiagonal coefficients for y-dir (bous only) 
    const dU_by_dt = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores d(state)/dt values output from Pass3 calls
    const dU_by_dt_Sed = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores d(state)/dt values output from Pass3 calls
    const txBoundaryForcing = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores ship pressure - not used in WebGPU yet
    const txModelVelocities = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores the u,v velocities from the cell size averages - these are the proper u,v used by the flux scheme
    var txCW_groupings = null;  // stores the variables groupings for the coulwave implementation 
    var txCW_uvhuhv; var txCW_zalpha = null; var txCW_STval = null; var txCW_STgrad = null; var txCW_Eterms = null; var txCW_FGterms = null; // these are only used if COULWAVE is selected
    
    if (calc_constants.NLSW_or_Bous == 2) {  // only use the space if needed
        txCW_groupings = create_3D_Data_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, 6, allTextures); 
        // level 0: txCW_uvhuhv, [u, v, du, dv]
        // level 1: txCW_zalpha, [za, dzadx, dzady, 0.0)]
        // level 2: txCW_STval, [S, T, d2udxdy, d2vdxdy]
        // level 3: txCW_STgrad, [dSdx, dSdy, dTdx, dTdy]
        // level 4: txCW_Eterms, [E1, E2, E,  dvdx - dudy]
        // level 5: txCW_FGterms, [EzST, TzS2, uSxvSy, uTxvTy]
        txCW_uvhuhv = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores the velocities
        txCW_zalpha = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores the z-alpha values
        txCW_STval = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores the S and T values
        txCW_STgrad = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores the S and T gradients
        txCW_Eterms = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores the E terms
        txCW_FGterms = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores the F and G terms
    }
    else {  // these need to exist as textures, but are not used, so make them small
        txCW_groupings = create_3D_Data_Texture(device, 1, 1, 2, allTextures); 
        txCW_uvhuhv = create_2D_Texture(device, 1, 1, allTextures);  // stores the velocities
        txCW_zalpha = create_2D_Texture(device, 1, 1, allTextures);  // stores the z-alpha values
        txCW_STval = create_2D_Texture(device, 1, 1, allTextures);  // stores the S and T values
        txCW_STgrad = create_2D_Texture(device, 1, 1, allTextures);  // stores the S and T gradients
        txCW_Eterms = create_2D_Texture(device, 1, 1, allTextures);  // stores the E terms
        txCW_FGterms = create_2D_Texture(device, 1, 1, allTextures);  // stores the F and G terms
    }
    
    const txMeans = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores various mean values
    const txtemp_Means = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);
    const txMeans_Speed = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores various mean values
    const txtemp_Means_Speed = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);
    const txMeans_Momflux = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores various mean values
    const txtemp_Means_Momflux = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);
    const txWaveHeight = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores current wave height surface
    const txtemp_WaveHeight = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);
    const txBaseline_WaveHeight = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores "baseline" wave height surface
    const txzeros = create_2D_Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, allTextures);  // stores a zeros texture, for reseting textures to zero
    txScreen = create_2D_Image_Texture(device, canvas.width, canvas.height, allTextures);  // used for jpg output
    txDraw = create_2D_Image_Texture(device, canvas.width, canvas.height, allTextures);  // used for creating text & shapes on an HTML5 canvas
    txGoogleMap = create_2D_Texture(device, calc_constants.GMapImageWidth, calc_constants.GMapImageHeight, allTextures);  // used to store the loaded Google Maps image
    txOverlayMap = create_2D_Texture(device, calc_constants.GMapImageWidth, calc_constants.GMapImageHeight, allTextures);  // used to store the loaded Google Maps image
    const txSamplePNGs = create_3D_Image_Texture(device, 1024, 1024, 11, allTextures); // will store all textures to be sampled for photo-realism
    const txModelPNGs = create_2D_Image_Texture(device, 1024, 1024, allTextures); // will store all textures to be sampled for photo-realism
    let skybox_image_size = 500; // size of each face of the cube map
    const txCube_Skybox = create_3D_Image_Texture(device, skybox_image_size, skybox_image_size, 6, allTextures); // will store all textures to be sampled for photo-realism
    
    let depthTexture = create_Depth_Texture(device, canvas.width, canvas.height, allTextures); // initial depth texture for Explorer mode
    const txRenderVarsf16 = create_2D_F16Texture(device, calc_constants.WIDTH, calc_constants.HEIGHT, 3, allTextures);  // used to store the f16 render variables for the render pipeline

    const txWaves = create_1D_Texture(device, calc_constants.numberOfWaves, allTextures);  // stores spectrum wave input
    const txTimeSeries_Locations = create_1D_Texture(device, calc_constants.maxNumberOfTimeSeries, allTextures);  // stores spectrum wave input
    const txTimeSeries_Data = create_1D_Texture(device, calc_constants.maxNumberOfTimeSeries, allTextures);  // stores spectrum wave input

    // fill in the bathy texture
    let bathy2Dvec = copyBathyDataToTexture(calc_constants, bathy2D, device, txBottom);

    // fill in the wave data texture
    if (calc_constants.numberOfWaves > 0) {
        copyWaveDataToTexture(calc_constants, waveData, device, txWaves);
    }

    // fill in the time series location texture
    copyTSlocsToTexture(calc_constants, device, txTimeSeries_Locations)  

    // create initial condition, initialize values
    var writeStateFlag = 0; // used to indicate if we not writing any state (0), writing channel 1 (1), writing channel 2 (2), or writing channel 3 (3)
    copyInitialConditionDataToTexture(calc_constants, device, bathy2D, txState, writeStateFlag);
    copyInitialConditionDataToTexture(calc_constants, device, bathy2D, txstateUVstar, writeStateFlag);

        // create initial bottom friction surface
    if(etaInitialConditionFile || calc_constants.loadetaIC == 1){
        console.log('Loading Initial Free Surface File')
        calc_constants.loadetaIC = 1;
        var etaICContent = null;
        try { 
            etaICContent = await etaInitialConditionFile.text()
        } 
        catch {
            etaICContent = null;
        }
        let etaIC2D = await loadInitCondSurface(etaICContent, calc_constants); 
        writeStateFlag = 1; // writing channel 1
        copyInitialConditionDataToTexture(calc_constants, device, etaIC2D, txState, writeStateFlag)
        copyInitialConditionDataToTexture(calc_constants, device, etaIC2D, txstateUVstar, writeStateFlag)
    }

    // create initial bottom friction surface
    if(frictionFile){
        console.log('Loading Friction Map File')
        calc_constants.loadFriction = 1;
        const frictionContent = await frictionFile.text();
        let friction2D = await loadFrictionSurface(frictionContent, calc_constants); 
        writeStateFlag = 1; // writing channel 1
        copyInitialConditionDataToTexture(calc_constants, device, friction2D, txBottomFriction, writeStateFlag)
    } else  {    
        copyConstantValueToTexture(calc_constants, device, txBottomFriction, calc_constants.friction, 0.0, 0.0, 0.0);
    }

    // create hard bottom elevation file
    if(hardbottomFile){
        console.log('Loading Hard Bottom Elevation File')
        calc_constants.loadHardBottom = 1;
        const HardBottomContent = await hardbottomFile.text();
        let HardBottom2D = await loadHardBottomSurface(HardBottomContent, calc_constants); 
        writeStateFlag = 1; // writing channel 1
        copyInitialConditionDataToTexture(calc_constants, device, HardBottom2D, txHardBottom, writeStateFlag)
    } else  {    
        copyConstantValueToTexture(calc_constants, device, txHardBottom, -2.0 * calc_constants.base_depth, 0.0, 0.0, 0.0);
    }


    // create tridiag coef matrices
    copyTridiagXDataToTexture(calc_constants, bathy2D, device, coefMatx, bathy2Dvec);
    copyTridiagYDataToTexture(calc_constants, bathy2D, device, coefMaty, bathy2Dvec);

    // load Google Maps image
    var transforms = null;
    calc_constants.IsOverlayMapLoaded = 0;
    calc_constants.IsGMMapLoaded = 0;
    calc_constants.IsSatMapLoaded = 0;
    if (calc_constants.GoogleMapOverlay == 1) {  // if using GM overlay
        try {
            let ImageGoogleMap = await CreateGoogleMapImage(device, context, calc_constants.lat_LL, calc_constants.lon_LL, calc_constants.lat_UR, calc_constants.lon_UR, calc_constants.GMapImageWidth, calc_constants.GMapImageHeight);

            console.log('Google Maps image loaded, dimensions:', ImageGoogleMap.width, 'x', ImageGoogleMap.height);

            // Now that the image is loaded, you can copy it to the texture.
            copyImageBitmapToTexture(device, ImageGoogleMap, txGoogleMap)

            transforms = calculateGoogleMapScaleAndOffset(calc_constants.lat_LL, calc_constants.lon_LL, calc_constants.lat_UR, calc_constants.lon_UR, calc_constants.GMapImageWidth, calc_constants.GMapImageHeight);
            calc_constants.GMscaleX = transforms.scaleX;
            calc_constants.GMscaleY = transforms.scaleY;
            calc_constants.GMoffsetX = transforms.offsetX;
            calc_constants.GMoffsetY = transforms.offsetY;

            txOverlayMap = txGoogleMap;
            calc_constants.IsGMMapLoaded = 1;
            calc_constants.IsOverlayMapLoaded = 1;
        }
        catch {
            console.log('Unable to load Google Maps overlay')
            calc_constants.GoogleMapOverlay == 0
        }
    }    
    
    // for examples, see if there is an overlay file to load
    if(OverlayFile){
        console.log('Loading Uploaded Overlay File')
        calc_constants.GoogleMapOverlay = 2;
    } else if(calc_constants.run_example>=0) {
        OverlayFile = await loadOverlay(calc_constants);
    }

    if (calc_constants.GoogleMapOverlay == 2) {  // if there is a loaded overlay file

        const satimData = await loadUserImage(OverlayFile);
        console.log('Custom overlay image loaded, dimensions:', satimData.width, 'x', satimData.height);
        txSatMap = create_2D_Texture(device, satimData.width, satimData.height, allTextures);  // used to store the loaded image
        copyImageBitmapToTexture(device, satimData, txSatMap);
        calc_constants.GMscaleX = 1.0; // x-direction scaling factor to make sat image align with numerical domain
        calc_constants.GMscaleY = -1.0; // y-direction scaling factor to make sat image align with numerical domain
        calc_constants.GMoffsetX = 0.0;  // x-direction offset for sat image
        calc_constants.GMoffsetY = 1.0;  // y-direction offset for sat image
        
        txOverlayMap = txSatMap;
        calc_constants.IsSatMapLoaded = 1; 
        calc_constants.IsOverlayMapLoaded = 1;
    }

    // load texture images into textures
    console.log('Downloading surface texture images...')
    // Design components textures
    // white water / turbulence texture
    let imageUrl = '/textures/turbulence.jpg'; 
    let imData = await loadImageBitmap(imageUrl);    
    copyImageBitmapToTexture(device, imData, txSamplePNGs, 0)
    // coral reef texture
    imageUrl = '/textures/coralreef.jpg'; 
    imData = await loadImageBitmap(imageUrl);    
    copyImageBitmapToTexture(device, imData, txSamplePNGs, 1)
    // oyster / mussel bed texture
    imageUrl = '/textures/oysterbed.jpg'; 
    imData = await loadImageBitmap(imageUrl);    
    copyImageBitmapToTexture(device, imData, txSamplePNGs, 2)
    // mangrove texture
    imageUrl = '/textures/mangrove.jpg'; 
    imData = await loadImageBitmap(imageUrl);    
    copyImageBitmapToTexture(device, imData, txSamplePNGs, 3)
    // kelp texture
    imageUrl = '/textures/kelpbed.jpg'; 
    imData = await loadImageBitmap(imageUrl);    
    copyImageBitmapToTexture(device, imData, txSamplePNGs, 4)
    // grass texture
    imageUrl = '/textures/grass.jpg'; 
    imData = await loadImageBitmap(imageUrl);    
    copyImageBitmapToTexture(device, imData, txSamplePNGs, 5)
    // scrub texture
    imageUrl = '/textures/scrub.jpg'; 
    imData = await loadImageBitmap(imageUrl);    
    copyImageBitmapToTexture(device, imData, txSamplePNGs, 6)
    // rubblemound texture
    imageUrl = '/textures/rubble.jpg'; 
    imData = await loadImageBitmap(imageUrl);    
    copyImageBitmapToTexture(device, imData, txSamplePNGs, 7)
    // dune texture
    imageUrl = '/textures/dune_veg.jpg'; 
    imData = await loadImageBitmap(imageUrl);    
    copyImageBitmapToTexture(device, imData, txSamplePNGs, 8)
    // arrow texture
    imageUrl = '/textures/arrow.png'; 
    imData = await loadImageBitmap(imageUrl);    
    copyImageBitmapToTexture(device, imData, txSamplePNGs, 9)
    // filled arrow texture
    imageUrl = '/textures/arrow_filled.png'; 
    imData = await loadImageBitmap(imageUrl);    
    copyImageBitmapToTexture(device, imData, txSamplePNGs, 10)

    // Model textures
    // red_brick texture
    //imageUrl = '/textures/red_brick.jpg'; 
    //imData = await loadImageBitmap(imageUrl);    
    //copyImageBitmapToTexture(device, imData, txModelPNGs, 0)
    // white_brick texture
    //imageUrl = '/textures/white_brick.jpg'; 
    //imData = await loadImageBitmap(imageUrl);    
    //copyImageBitmapToTexture(device, imData, txModelPNGs, 1)

    // load skybox images into texture
    console.log('Downloading skybox images...')
    const skybox_bitmaps = await loadCubeBitmaps();
    const order = ['px','nx','py','ny','pz','nz'];  // match WebGPU’s layer order
    
    order.forEach((face, layer) => {
      device.queue.copyExternalImageToTexture(
        { source: skybox_bitmaps[face] },
        { texture: txCube_Skybox, origin: [0, 0, layer] },
        [ skybox_image_size, skybox_image_size, 1 ]
      );
    });
    const cubeView = txCube_Skybox.createView({dimension: 'cube'});

    // Parameters for 3D Models (for houses, etc. in Explorer mode)
    //const gltfUrl = './assets/Duck/Duck.gltf'; // URL of the GLTF model file
    //const duck = await loadglTFModel(device, gltfUrl); // load the duck model

    // box models
    // for examples, see if there is an overlay file to load
    var model_properties = null;
    if(modelFile){
        console.log('Loading Uploaded 3D Model JSON File')
        model_properties = await loadSceneModels(modelFile); // load the model properties from the users JSON file
    } else {
        model_properties = await loadSceneModels(calc_constants.models_file_url); // load the model properties from the server side JSON file
    }
  
    // A simple cube mesh centered at origin
    const boxPositions = new Float32Array([
        -1,-1,-1,  +1,-1,-1,  +1,+1,-1,  -1,+1,-1,
        -1,-1,+1,  +1,-1,+1,  +1,+1,+1,  -1,+1,+1,
    ]);
    const boxIndices = new Uint32Array([
        // back face (−Z)
        0,1,2,   0,2,3,
        // front face (+Z)  <— fix winding here
        4,5,6,   4,6,7,
        // bottom (−Y)
        0,4,5,   0,5,1,
        // top (+Y)
        3,2,6,   3,6,7,
        // right (+X)
        1,5,6,   1,6,2,
        // left (−X)
        0,3,7,   0,7,4
      ]);
  
    // convert to buffer for Box Model pipeline
    const boxVB = device.createBuffer({size: boxPositions.byteLength,usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST});
    device.queue.writeBuffer(boxVB, 0, boxPositions);
  
    const boxIB = device.createBuffer({size: boxIndices.byteLength,usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST});
    device.queue.writeBuffer(boxIB, 0, boxIndices);

    // initial camera layout
    const simWidth   = calc_constants.WIDTH  * calc_constants.dx;
    const simHeight  = calc_constants.HEIGHT * calc_constants.dy;
    const simDim = Math.sqrt(simWidth*simWidth + simHeight*simHeight);
    
    // reset view (in case its stored in json already)
    calc_constants.shift_x = 0.;
    calc_constants.shift_y = 0.;
    calc_constants.forward = 1.0;
    // base eye & forward vector
    var baseEye    = vec3.fromValues(
      0.1 * simWidth,
      0.1 * simHeight,
      10.0 * calc_constants.base_depth
    );
    var baseTarget = vec3.fromValues(
      0.5 * simWidth,
      0.5 * simHeight,
       0.0
    );

    if (calc_constants.river_sim == 1) { // river simulation
        baseEye = vec3.fromValues(
            0.5 * simWidth,
            0.5 * simHeight,
            400.0 * calc_constants.base_depth);
        baseTarget = vec3.fromValues(
            0.5 * simWidth,
            0.5 * simHeight,
            0.0);
    }

    // user override for initial camera position
    if (calc_constants.cameraInit_user == 1) {
        baseEye = vec3.fromValues(
            calc_constants.cameraInit_x,
            calc_constants.cameraInit_y,
            calc_constants.cameraInit_z
        );

        const yaw   = calc_constants.cameraInit_yaw   * Math.PI / 180.0;
        const pitch = calc_constants.cameraInit_pitch * Math.PI / 180.0;

        const fwd = vec3.fromValues(
            Math.cos(pitch) * Math.cos(yaw),
            Math.cos(pitch) * Math.sin(yaw),
            Math.sin(pitch)
        );
        vec3.normalize(fwd, fwd);

        const lookDist = (calc_constants.cameraInit_lookDist && calc_constants.cameraInit_lookDist > 0.0)
            ? calc_constants.cameraInit_lookDist
            : 0.5 * simDim;   // reasonable default

        baseTarget = vec3.create();
        vec3.scaleAndAdd(baseTarget, baseEye, fwd, lookDist);
    }

    const baseDir = vec3.create();
    vec3.subtract(baseDir, baseTarget, baseEye);
    vec3.normalize(baseDir, baseDir);
    var initPitch = Math.asin(baseDir[2]);
    var initYaw = Math.atan2(baseDir[1], baseDir[0]);
    if (calc_constants.river_sim == 1) { // river simulation
        initYaw =  Math.PI / 2.0; // river simulation yaw
    } 
    
    // if user provided yaw and pitch, you can also force them
    if (calc_constants.cameraInit_user == 1) {
        initYaw   = calc_constants.cameraInit_yaw   * Math.PI / 180.0;
        initPitch = calc_constants.cameraInit_pitch * Math.PI / 180.0;
    }

    calc_constants.rotationAngle_xz = initPitch * 180. / Math.PI;
    calc_constants.rotationAngle_xy = initYaw * 180. / Math.PI;

    window.cameraState = {
        position: vec3.clone(baseEye),
        yaw: initYaw,
        pitch: initPitch,
        forward: calc_constants.forward,
        panX: calc_constants.shift_x,
        panY: calc_constants.shift_y,
    };

    var viewProj = mat4.create();

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
    Pass1_view.setFloat32(48, calc_constants.delta, true);           // f32

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
    const Pass2_BindGroup = create_Pass2_BindGroup(device, Pass2_uniformBuffer, txH, txU, txV, txBottom, txC, txHnear, txXFlux, txYFlux, txSed_C1, txSed_C2, txSed_C3, txSed_C4, txXFlux_Sed, txYFlux_Sed, txBreaking);
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
    Pass2_view.setFloat32(32, calc_constants.sedTurbDispersion, true);           // f32
    Pass2_view.setFloat32(36, calc_constants.sedBreakingDispersionCoef, true);           // f32

    // Breaking Pass Bindings & Uniforms Config
    const PassBreaking_BindGroupLayout = create_PassBreaking_BindGroupLayout(device);
    const PassBreaking_BindGroup = create_PassBreaking_BindGroup(device, PassBreaking_uniformBuffer, txState, txBottom, dU_by_dt, txXFlux, txYFlux, txBreaking, txDissipationFlux, txtemp_Breaking);
    const PassBreaking_uniforms = new ArrayBuffer(256);  // smallest multiple of 256
    let PassBreaking_view = new DataView(PassBreaking_uniforms);
    PassBreaking_view.setInt32(0, calc_constants.WIDTH, true);          // u32
    PassBreaking_view.setInt32(4, calc_constants.HEIGHT, true);          // u32
    PassBreaking_view.setFloat32(8, calc_constants.dt, true);           // f32
    PassBreaking_view.setFloat32(12, calc_constants.dx, true);           // f32
    PassBreaking_view.setFloat32(16, calc_constants.dy, true);           // f32
    PassBreaking_view.setFloat32(20, calc_constants.one_over_dx, true);             // f32
    PassBreaking_view.setFloat32(24, calc_constants.one_over_dy, true);       // f32
    PassBreaking_view.setFloat32(28, calc_constants.epsilon, true);           // f32
    PassBreaking_view.setFloat32(32, calc_constants.g, true);             // f32
    PassBreaking_view.setFloat32(36, 0.0, true);   //f32 - will be time
    PassBreaking_view.setFloat32(40, calc_constants.delta_breaking, true);             // f32
    PassBreaking_view.setFloat32(44, calc_constants.T_star_coef, true);             // f32
    PassBreaking_view.setFloat32(48, calc_constants.dzdt_I_coef, true);             // f32
    PassBreaking_view.setFloat32(52, calc_constants.dzdt_F_coef, true);             // f32

    // Pass3A Coulwave Bindings & Uniforms Config
    const Pass3A_Coulwave_BindGroupLayout = create_Pass3A_Coulwave_BindGroupLayout(device);
    const Pass3A_Coulwave_BindGroup = create_Pass3A_Coulwave_BindGroup(device, Pass3A_Coulwave_uniformBuffer, txState, txBottom, txU, txV, txModelVelocities, txCW_zalpha, txCW_uvhuhv);
    const Pass3A_Coulwave_uniforms = new ArrayBuffer(256);  // smallest multiple of 256
    let Pass3A_Coulwave_view = new DataView(Pass3A_Coulwave_uniforms);
    Pass3A_Coulwave_view.setInt32(0, calc_constants.WIDTH, true);          // u32
    Pass3A_Coulwave_view.setInt32(4, calc_constants.HEIGHT, true);          // u32
    Pass3A_Coulwave_view.setFloat32(8, calc_constants.one_over_dx, true);           // f32
    Pass3A_Coulwave_view.setFloat32(12, calc_constants.one_over_dy, true);       // f32
    Pass3A_Coulwave_view.setFloat32(16, calc_constants.Bous_alpha, true);       // f32
    Pass3A_Coulwave_view.setFloat32(20, calc_constants.delta, true);       // f32

    // Pass3B Coulwave Bindings & Uniforms Config
    const Pass3B_Coulwave_BindGroupLayout = create_Pass3B_Coulwave_BindGroupLayout(device);
    const Pass3B_Coulwave_BindGroup = create_Pass3B_Coulwave_BindGroup(device, Pass3B_Coulwave_uniformBuffer, txState, txBottom, txCW_uvhuhv, txCW_zalpha, txCW_STval, txCW_STgrad, txCW_Eterms, txCW_FGterms, dU_by_dt);
    const Pass3B_Coulwave_uniforms = new ArrayBuffer(256);  // smallest multiple of 256
    let Pass3B_Coulwave_view = new DataView(Pass3B_Coulwave_uniforms);
    Pass3B_Coulwave_view.setInt32(0, calc_constants.WIDTH, true);          // u32
    Pass3B_Coulwave_view.setInt32(4, calc_constants.HEIGHT, true);          // u32
    Pass3B_Coulwave_view.setFloat32(8, calc_constants.one_over_dx, true);           // f32
    Pass3B_Coulwave_view.setFloat32(12, calc_constants.one_over_dy, true);       // f32
    Pass3B_Coulwave_view.setFloat32(16, calc_constants.one_over_d2x, true);           // f32
    Pass3B_Coulwave_view.setFloat32(20, calc_constants.one_over_d2y, true);       // f32
    Pass3B_Coulwave_view.setFloat32(24, calc_constants.one_over_dxdy, true);           // f32

    // Pass3 Bindings & Uniforms Config
    const Pass3_BindGroupLayout = create_Pass3_BindGroupLayout(device);
    const Pass3_BindGroup = create_Pass3_BindGroup(device, Pass3_uniformBuffer, txState, txBottom, txCW_groupings, txXFlux, txYFlux, oldGradients, oldOldGradients, predictedGradients, F_G_star_oldGradients, F_G_star_oldOldGradients, txstateUVstar, txBoundaryForcing, txNewState, dU_by_dt, predictedF_G_star, current_stateUVstar,txContSource,txBreaking, txDissipationFlux, txBottomFriction);
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
    Pass3_view.setFloat32(108, calc_constants.base_depth, true);           // f32
    Pass3_view.setFloat32(112, calc_constants.whiteWaterDispersion, true);           // f32
    Pass3_view.setFloat32(116, calc_constants.infiltrationRate, true);           // f32
    Pass3_view.setInt32(120, calc_constants.useBreakingModel, true);           // i32
    Pass3_view.setInt32(124, calc_constants.showBreaking, true);           // i32
    Pass3_view.setInt32(128, calc_constants.west_boundary_type, true);       // i32
    Pass3_view.setInt32(132, calc_constants.east_boundary_type, true);           // i32
    Pass3_view.setInt32(136, calc_constants.south_boundary_type, true);           // i32
    Pass3_view.setInt32(140, calc_constants.north_boundary_type, true);       // i32
    Pass3_view.setFloat32(144, calc_constants.vort_friction_factor, true);       // f32

    // SedTrans_Pass3 Bindings & Uniforms Config
    const SedTrans_Pass3_BindGroupLayout = create_SedTrans_Pass3_BindGroupLayout(device);
    const SedTrans_Pass3_BindGroup = create_SedTrans_Pass3_BindGroup(device, SedTrans_Pass3_uniformBuffer, txState_Sed, txXFlux_Sed, txYFlux_Sed, oldGradients_Sed, oldOldGradients_Sed, predictedGradients_Sed, txBottom, txState, txNewState_Sed, dU_by_dt_Sed, erosion_Sed, depostion_Sed, txBreaking, txU, txV, txSed_C1, txHardBottom);
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
    SedTrans_Pass3_view.setFloat32(80, calc_constants.base_depth, true);           // f32
    SedTrans_Pass3_view.setFloat32(84, calc_constants.delta, true);           // f32
    SedTrans_Pass3_view.setFloat32(88, calc_constants.sedTurbDispersion, true);           // f32
    SedTrans_Pass3_view.setFloat32(92, calc_constants.sedBreakingDispersionCoef, true);           // f32
    SedTrans_Pass3_view.setFloat32(96, calc_constants.sedC1_bedloadMPM, true);           // f32


    // BoundaryPass Bindings & Uniforms Config
    const BoundaryPass_BindGroupLayout = create_BoundaryPass_BindGroupLayout(device);
    const BoundaryPass_BindGroup = create_BoundaryPass_BindGroup(device, BoundaryPass_uniformBuffer, current_stateUVstar, txBottom, txWaves, txNewState_Sed, txtemp_boundary, txtemp_boundary_Sed, txBreaking, txtemp_Breaking, txBoundaryForcing);
    const BoundaryPass_BindGroup_NewState = create_BoundaryPass_BindGroup(device, BoundaryPass_uniformBuffer, txNewState, txBottom, txWaves, txNewState_Sed, txtemp_boundary, txtemp_boundary_Sed, txBreaking, txtemp_Breaking, txBoundaryForcing);
    const BoundaryPass_uniforms = new ArrayBuffer(256);  // smallest multiple of 256
    let BoundaryPass_view = new DataView(BoundaryPass_uniforms);
    BoundaryPass_view.setInt32(0, calc_constants.WIDTH, true);          // i32
    BoundaryPass_view.setInt32(4, calc_constants.HEIGHT, true);          // i32
    BoundaryPass_view.setFloat32(8, calc_constants.dt, true);             // f32
    BoundaryPass_view.setFloat32(12, calc_constants.dx, true);       // f32
    BoundaryPass_view.setFloat32(16, calc_constants.dy, true);           // f32
    BoundaryPass_view.setFloat32(20, 0, true);           // f32
    BoundaryPass_view.setInt32(24, calc_constants.reflect_x, true);       // i32
    BoundaryPass_view.setInt32(28, calc_constants.reflect_y, true);           // i32
    BoundaryPass_view.setFloat32(32, calc_constants.PI, true);           // f32
    BoundaryPass_view.setInt32(36, calc_constants.BoundaryWidth, true);       // i32
    BoundaryPass_view.setFloat32(40, calc_constants.seaLevel, true);           // f32
    BoundaryPass_view.setInt32(44, calc_constants.boundary_nx, true);           // i32
    BoundaryPass_view.setInt32(48, calc_constants.boundary_ny, true);           // i32
    BoundaryPass_view.setInt32(52, calc_constants.numberOfWaves, true);             // i32
    BoundaryPass_view.setInt32(56, calc_constants.west_boundary_type, true);       // i32
    BoundaryPass_view.setInt32(60, calc_constants.east_boundary_type, true);           // i32
    BoundaryPass_view.setInt32(64, calc_constants.south_boundary_type, true);           // i32
    BoundaryPass_view.setInt32(68, calc_constants.north_boundary_type, true);       // i32
    BoundaryPass_view.setFloat32(72, calc_constants.boundary_g, true);           // f32
    BoundaryPass_view.setFloat32(76, calc_constants.delta, true);           // f32 
    BoundaryPass_view.setInt32(80, calc_constants.boundary_shift, true);           // i32 
    BoundaryPass_view.setFloat32(84, calc_constants.base_depth, true);           // f32 
    BoundaryPass_view.setInt32(88, calc_constants.incident_wave_type, true);           // i32 
    BoundaryPass_view.setFloat32(92, calc_constants.incident_wave_H, true);           // f32 
    BoundaryPass_view.setFloat32(96, calc_constants.incident_wave_T, true);           // f32 
    BoundaryPass_view.setFloat32(100, calc_constants.incident_wave_direction, true);           // f32 
    BoundaryPass_view.setFloat32(104, calc_constants.mean_upstream_channel_elevation, true);           // f32 
    BoundaryPass_view.setFloat32(108, calc_constants.channel_bottom_width, true);           // f32 
    BoundaryPass_view.setFloat32(112, calc_constants.channel_side_slope, true);           // f32 
    BoundaryPass_view.setFloat32(116, calc_constants.channel_bank_start_upstream, true);           // f32 
    BoundaryPass_view.setFloat32(120, calc_constants.channel_bank_end_upstream, true);           // f32 
    BoundaryPass_view.setFloat32(124, calc_constants.Q_10, true);           // f32 
    BoundaryPass_view.setFloat32(128, calc_constants.Q_50, true);           // f32 
    BoundaryPass_view.setFloat32(132, calc_constants.Q_100, true);           // f32 
    BoundaryPass_view.setFloat32(136, calc_constants.Q_200, true);           // f32 
    BoundaryPass_view.setFloat32(140, calc_constants.Q_500, true);           // f32 
    BoundaryPass_view.setFloat32(144, calc_constants.stage_10, true);           // f32 
    BoundaryPass_view.setFloat32(148, calc_constants.stage_50, true);           // f32 
    BoundaryPass_view.setFloat32(152, calc_constants.stage_100, true);           // f32 
    BoundaryPass_view.setFloat32(156, calc_constants.stage_200, true);           // f32 
    BoundaryPass_view.setFloat32(160, calc_constants.stage_500, true);           // f32 
    BoundaryPass_view.setFloat32(164, calc_constants.river_inflow_angle, true);           // f32 
    BoundaryPass_view.setInt32(168, calc_constants.algochanges, true);           // i32
    
    // TridiagX - Bindings & Uniforms Config
    const TridiagX_BindGroupLayout = create_Tridiag_BindGroupLayout(device);
    const TridiagX_BindGroup = create_Tridiag_BindGroup(device, TridiagX_uniformBuffer, newcoef_x, txNewState, current_stateUVstar, txtemp_PCRx, txtemp2_PCRx, txBottom);
    const TridiagX_uniforms = new ArrayBuffer(256);  // smallest multiple of 256
    let TridiagX_view = new DataView(TridiagX_uniforms);
    TridiagX_view.setInt32(0, calc_constants.WIDTH, true);          // i32
    TridiagX_view.setInt32(4, calc_constants.HEIGHT, true);          // i32
    TridiagX_view.setInt32(8, calc_constants.Px, true);             // i32, holds "p"
    TridiagX_view.setInt32(12, 1, true);            // i32, hols "s"
    TridiagX_view.setInt32(16, calc_constants.Px, true);            // i32, hols "Px"
    TridiagX_view.setFloat32(20, calc_constants.delta, true);            // f32

    // TridiagY - Bindings & Uniforms Config
    const TridiagY_BindGroupLayout = create_Tridiag_BindGroupLayout(device);
    const TridiagY_BindGroup = create_Tridiag_BindGroup(device, TridiagY_uniformBuffer, newcoef_y, txNewState, current_stateUVstar, txtemp_PCRy, txtemp2_PCRy, txBottom);
    const TridiagY_uniforms = new ArrayBuffer(256);  // smallest multiple of 256
    let TridiagY_view = new DataView(TridiagY_uniforms);
    TridiagY_view.setInt32(0, calc_constants.WIDTH, true);          // i32
    TridiagY_view.setInt32(4, calc_constants.HEIGHT, true);          // i32
    TridiagY_view.setInt32(8, calc_constants.Py, true);             // i32, holds "p"
    TridiagY_view.setInt32(12, 1, true);            // i32, hols "s"
    TridiagY_view.setInt32(16, calc_constants.Py, true);            // i32, hols "Py"
    TridiagY_view.setFloat32(20, calc_constants.delta, true);            // f32
    
    // SedTrans_UpdateBottom -  Bindings & Uniforms Config
    const SedTrans_UpdateBottom_BindGroupLayout = create_SedTrans_UpdateBottom_BindGroupLayout(device);
    const SedTrans_UpdateBottom_BindGroup = create_SedTrans_UpdateBottom_BindGroup(device, SedTrans_UpdateBottom_uniformBuffer, txBottom, txBotChange_Sed, erosion_Sed, depostion_Sed, txtemp_SedTrans_Botttom, txtemp_SedTrans_Change, txHardBottom, txBottomInitial);
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
    SedTrans_UpdateBottom_view.setInt32(36, calc_constants.west_boundary_type, true);       // i32
    SedTrans_UpdateBottom_view.setInt32(40, calc_constants.east_boundary_type, true);           // i32
    SedTrans_UpdateBottom_view.setInt32(44, calc_constants.south_boundary_type, true);           // i32
    SedTrans_UpdateBottom_view.setInt32(48, calc_constants.north_boundary_type, true);       // i32

    // Updateneardry -  Bindings & Uniforms Config
    const Updateneardry_BindGroupLayout = create_Updateneardry_BindGroupLayout(device);
    const Updateneardry_BindGroup = create_Updateneardry_BindGroup(device, Updateneardry_uniformBuffer, txBottom, txtemp_bottom);
    const Updateneardry_uniforms = new ArrayBuffer(256);  // smallest multiple of 256s
    let Updateneardry_view = new DataView(Updateneardry_uniforms);
    Updateneardry_view.setInt32(0, calc_constants.WIDTH, true);          // i32
    Updateneardry_view.setInt32(4, calc_constants.HEIGHT, true);          // i32

    // UpdateTrid -  Bindings & Uniforms Config
    const UpdateTrid_BindGroupLayout = create_UpdateTrid_BindGroupLayout(device);
    const UpdateTrid_BindGroup = create_UpdateTrid_BindGroup(device, UpdateTrid_uniformBuffer, txBottom, current_stateUVstar, coefMatx, coefMaty);
    const UpdateTrid_uniforms = new ArrayBuffer(256);  // smallest multiple of 256s
    let UpdateTrid_view = new DataView(UpdateTrid_uniforms);
    UpdateTrid_view.setUint32(0, calc_constants.WIDTH, true);          // i32
    UpdateTrid_view.setUint32(4, calc_constants.HEIGHT, true);          // i32
    UpdateTrid_view.setFloat32(8, calc_constants.dx, true);             // f32
    UpdateTrid_view.setFloat32(12, calc_constants.dy, true);             // f32
    UpdateTrid_view.setFloat32(16, calc_constants.Bcoef, true);             // f32
    UpdateTrid_view.setInt32(20, calc_constants.NLSW_or_Bous, true);          // i32
    UpdateTrid_view.setFloat32(24, calc_constants.Bous_alpha, true);             // f32
    UpdateTrid_view.setFloat32(28, calc_constants.one_over_d2x, true);             // f32
    UpdateTrid_view.setFloat32(32, calc_constants.one_over_d2y, true);             // f32
    UpdateTrid_view.setFloat32(36, calc_constants.delta, true);             // f32

    // CalcMeans -  Bindings & Uniforms Config
    const CalcMeans_BindGroupLayout = create_CalcMeans_BindGroupLayout(device);
    const CalcMeans_BindGroup = create_CalcMeans_BindGroup(device, CalcMeans_uniformBuffer, txMeans, txMeans_Speed, txMeans_Momflux, txH, txU, txV, txBottom, txtemp_Means, txtemp_Means_Speed, txtemp_Means_Momflux, txModelVelocities, txC, txNewState);
    const CalcMeans_uniforms = new ArrayBuffer(256);  // smallest multiple of 256s
    let CalcMeans_view = new DataView(CalcMeans_uniforms);
    CalcMeans_view.setInt32(0, calc_constants.n_time_steps_means, true);          // i32
    CalcMeans_view.setFloat32(4, calc_constants.delta, true);           // f32
    CalcMeans_view.setFloat32(8, calc_constants.base_depth, true);           // f32
    CalcMeans_view.setInt32(12, calc_constants.WIDTH, true);          // i32
    CalcMeans_view.setInt32(16, calc_constants.HEIGHT, true);          // i32  
    CalcMeans_view.setFloat32(20, calc_constants.dx, true);           // f32
    CalcMeans_view.setFloat32(24, calc_constants.dy, true);           // f32

    // CalcWaveHeight -  Bindings & Uniforms Config
    const CalcWaveHeight_BindGroupLayout = create_CalcWaveHeight_BindGroupLayout(device);
    const CalcWaveHeight_BindGroup = create_CalcWaveHeight_BindGroup(device, CalcWaveHeight_uniformBuffer, txstateUVstar, txNewState, txMeans, txWaveHeight, txtemp_WaveHeight);
    const CalcWaveHeight_uniforms = new ArrayBuffer(256);  // smallest multiple of 256s
    let CalcWaveHeight_view = new DataView(CalcWaveHeight_uniforms);
    CalcWaveHeight_view.setInt32(0, calc_constants.n_time_steps_waveheight, true);          // i32

    // AddDisturbance -  Bindings & Uniforms Config 
    const AddDisturbance_BindGroupLayout = create_AddDisturbance_BindGroupLayout(device);
    const AddDisturbance_BindGroup = create_AddDisturbance_BindGroup(device, AddDisturbance_uniformBuffer, txBottom, txstateUVstar, txBottomInitial, txtemp_AddDisturbance, txBoundaryForcing, txtemp_bottom, txBotChange_Sed);
    const AddDisturbance_uniforms = new ArrayBuffer(256);  // smallest multiple of 256s
    let AddDisturbance_view = new DataView(AddDisturbance_uniforms);
    AddDisturbance_view.setInt32(0, calc_constants.WIDTH, true);          // i32
    AddDisturbance_view.setInt32(4, calc_constants.HEIGHT, true);          // i32
    AddDisturbance_view.setFloat32(8, calc_constants.dx, true);             // f32
    AddDisturbance_view.setFloat32(12, calc_constants.dy, true);             // f32 
    AddDisturbance_view.setInt32(16, calc_constants.disturbanceType, true);             // f32
    AddDisturbance_view.setFloat32(20, calc_constants.disturbanceXpos, true);             // f32
    AddDisturbance_view.setFloat32(24, calc_constants.disturbanceYpos, true);             // f32
    AddDisturbance_view.setFloat32(28, calc_constants.disturbanceCrestamp, true);             // f32  
    AddDisturbance_view.setFloat32(32, calc_constants.disturbanceDir, true);             // f32  
    AddDisturbance_view.setFloat32(36, calc_constants.disturbanceWidth, true);             // f32  
    AddDisturbance_view.setFloat32(40, calc_constants.disturbanceLength, true);             // f32  
    AddDisturbance_view.setFloat32(44, calc_constants.disturbanceDip, true);             // f32  
    AddDisturbance_view.setFloat32(48, calc_constants.disturbanceRake, true);             // f32  
    AddDisturbance_view.setFloat32(52, calc_constants.base_depth, true);             // f32  
    AddDisturbance_view.setFloat32(56, calc_constants.g, true);             // f32  
    AddDisturbance_view.setFloat32(60, calc_constants.dt, true);             // f32  
    AddDisturbance_view.setFloat32(64, 0.0,true);             // f32  will be time
    AddDisturbance_view.setFloat32(68, calc_constants.disturbance_change_timescale,true);             // f32  
    AddDisturbance_view.setFloat32(72, calc_constants.disturbance_time_shift,true);             // f32  
    AddDisturbance_view.setFloat32(76, calc_constants.disturbance_max_distance,true);             // f32  
    AddDisturbance_view.setFloat32(80, calc_constants.disturbance_initial_traj,true);             // f32  
    AddDisturbance_view.setFloat32(84, calc_constants.disturbance_traj_timefactor,true);             // f32  
    AddDisturbance_view.setFloat32(88, calc_constants.disturbance_final_traj,true);             // f32  
    AddDisturbance_view.setFloat32(92, calc_constants.disturbance_expo,true);             // f32  
    AddDisturbance_view.setFloat32(96, calc_constants.disturbance_vol_data,true);             // f32  
    AddDisturbance_view.setFloat32(100, calc_constants.disturbance_gamma_val,true);             // f32  

    // MouseClickChange -  Bindings & Uniforms Config
    const MouseClickChange_BindGroupLayout = create_MouseClickChange_BindGroupLayout(device);
    const MouseClickChange_BindGroup = create_MouseClickChange_BindGroup(device, MouseClickChange_uniformBuffer, txBottom, txBottomFriction, txContSource, txstateUVstar, txDesignComponents, txtemp_MouseClick, txtemp_MouseClick2);
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
    MouseClickChange_view.setInt32(32, calc_constants.surfaceToChange, true);             // i32  
    MouseClickChange_view.setInt32(36, calc_constants.changeType, true);             // i32  
    MouseClickChange_view.setFloat32(40, calc_constants.base_depth, true);             // f32 
    MouseClickChange_view.setInt32(44, calc_constants.whichPanelisOpen, true);             // i32  
    MouseClickChange_view.setInt32(48, calc_constants.designcomponentToAdd, true);             // i32  
    MouseClickChange_view.setFloat32(52, calc_constants.designcomponent_Radius, true);             // f32  
    MouseClickChange_view.setFloat32(56, calc_constants.designcomponent_Friction, true);             // f32  
    MouseClickChange_view.setFloat32(60, calc_constants.changeSeaLevel_delta, true);             // f32  

    // ExtractTimeSeries -  Bindings & Uniforms Config
    const ExtractTimeSeries_BindGroupLayout = create_ExtractTimeSeries_BindGroupLayout(device);
    const ExtractTimeSeries_BindGroup = create_ExtractTimeSeries_BindGroup(device, ExtractTimeSeries_uniformBuffer, txBottom, txBottomFriction, txContSource, txState, txWaveHeight, txTimeSeries_Locations, txTimeSeries_Data, txMeans_Speed);
    const ExtractTimeSeries_uniforms = new ArrayBuffer(256);  // smallest multiple of 256s
    let ExtractTimeSeries_view = new DataView(ExtractTimeSeries_uniforms);
    ExtractTimeSeries_view.setInt32(0, calc_constants.WIDTH, true);          // i32
    ExtractTimeSeries_view.setInt32(4, calc_constants.HEIGHT, true);          // i32
    ExtractTimeSeries_view.setFloat32(8, calc_constants.dx, true);             // f32
    ExtractTimeSeries_view.setFloat32(12, calc_constants.dy, true);             // f32
    ExtractTimeSeries_view.setInt32(16, calc_constants.mouse_current_canvas_indX, true);             // i32
    ExtractTimeSeries_view.setInt32(20, calc_constants.mouse_current_canvas_indY, true);             // i32
    ExtractTimeSeries_view.setFloat32(24, 0.0, true);             // f32, total_time 
    ExtractTimeSeries_view.setInt32(28, calc_constants.river_sim, true);             // i32
    ExtractTimeSeries_view.setInt32(32, calc_constants.disturbanceType, true);             // i32

    // Skybox Bindings
    const SkyboxBindGroupLayout = createSkyboxBindGroupLayout(device);
    const SkyboxBindGroup = createSkyboxBindGroup(device, Skybox_uniformBuffer, cubeView, textureSampler_linear);
    const Skybox_uniforms = new ArrayBuffer(256);  // smallest multiple of 256
    let Skybox_view = new DataView(Skybox_uniforms);

    // 3D Model Bindings
    // duck
    //const DuckBindGroupLayout = createModelBindGroupLayout(device);
    //const Duck_uniformBuffer = createUniformBuffer(device);
    //const DuckBindGroup = createModelBindGroup(device, Duck_uniformBuffer, duck.albedoView, duck.albedoSampler);
    //const Duck_uniforms = new ArrayBuffer(256);  // smallest multiple of 256
    //let Duck_view = new DataView(Duck_uniforms);

    // buildings
    const ModelBindGroupLayout = createModelBindGroupLayout(device);
    // create a bind group layout and buffer for each 3D model in the scene
    for (const obj of model_properties) {
        // one unique GPUBuffer
        const Model_uniformBuffer_obj = createUniformBuffer(device);
    
        // one unique BindGroup pointing at that buffer
        const ModelBindGroup_obj = createModelBindGroup(device, Model_uniformBuffer_obj, txModelPNGs.createView(), textureSampler_linear);
    
        // host-side storage for packing uniforms
        const Model_uniforms_obj = new ArrayBuffer(256);
        const Model_view_obj     = new DataView(Model_uniforms_obj);
    
        // attach them to the object
        obj.uniformBuffer = Model_uniformBuffer_obj;
        obj.bindGroup     = ModelBindGroup_obj;
        obj.uniforms      = Model_uniforms_obj;
        obj.uniformView   = Model_view_obj;
    }

    // Render Bindings
    const RenderBindGroupLayout = createRenderBindGroupLayout(device);
    var RenderBindGroup = createRenderBindGroup(device, Render_uniformBuffer, txNewState, txBottom, txMeans, txWaveHeight, txBaseline_WaveHeight, txBottomFriction, txNewState_Sed, txBottomInitial, txBotChange_Sed, txDesignComponents, txOverlayMap, txDraw, textureSampler, txTimeSeries_Locations, txBreaking, txSamplePNGs, textureSampler_linear, txRenderVarsf16);
    const Render_uniforms = new ArrayBuffer(Render_bufferSize);  // smallest multiple of 256
    let Render_view = new DataView(Render_uniforms);
    Render_view.setFloat32(0, calc_constants.colorVal_max, true);          // f32
    Render_view.setFloat32(4, calc_constants.colorVal_min, true);          // f32
    Render_view.setInt32(8, calc_constants.colorMap_choice, true);             // i32
    Render_view.setInt32(12, calc_constants.surfaceToPlot, true);             // i32
    Render_view.setInt32(16, calc_constants.showBreaking, true);             // i32
    Render_view.setInt32(20, calc_constants.IsOverlayMapLoaded, true);             // i32
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
    Render_view.setFloat32(108, calc_constants.base_depth, true);             // f32  
    Render_view.setInt32(112, calc_constants.NumberOfTimeSeries, true);             // i32  
    Render_view.setFloat32(116, 0.0, true);             // f32  will be time
    Render_view.setInt32(120, calc_constants.west_boundary_type, true);       // i32
    Render_view.setInt32(124, calc_constants.east_boundary_type, true);           // i32
    Render_view.setInt32(128, calc_constants.south_boundary_type, true);           // i32
    Render_view.setInt32(132, calc_constants.north_boundary_type, true);       // i32
    Render_view.setFloat32(136, calc_constants.designcomponent_Fric_Coral, true);          // f32 
    Render_view.setFloat32(140, calc_constants.designcomponent_Fric_Oyser, true);          // f32 
    Render_view.setFloat32(144, calc_constants.designcomponent_Fric_Mangrove, true);          // f32 
    Render_view.setFloat32(148, calc_constants.designcomponent_Fric_Kelp, true);          // f32 
    Render_view.setFloat32(152, calc_constants.designcomponent_Fric_Grass, true);          // f32 
    Render_view.setFloat32(156, calc_constants.designcomponent_Fric_Scrub, true);          // f32 
    Render_view.setFloat32(160, calc_constants.designcomponent_Fric_RubbleMound, true);          // f32 
    Render_view.setFloat32(164, calc_constants.designcomponent_Fric_Dune, true);          // f32 
    Render_view.setFloat32(168, calc_constants.designcomponent_Fric_Berm, true);          // f32 
    Render_view.setFloat32(172, calc_constants.designcomponent_Fric_Seawall, true);          // f32 
    Render_view.setFloat32(176, calc_constants.bathy_cmap_zero, true);          // f32 
    Render_view.setFloat32(180, calc_constants.renderZScale, true);          // f32        // f32 
    Render_view.setFloat32(184, 0.0, true);          // f32        // f32 
    Render_view.setFloat32(188, 0.0, true);          // f32 
    // add new viewProj mat4 for drone view
    for (let i = 0; i < 16; ++i) {
        // offset = 192 + 4 bytes per float × i
        Render_view.setFloat32(192 + i * 4, viewProj[i], /* littleEndian */ true);
    }
    Render_view.setInt32(256, calc_constants.ShowArrows, true);           // i32
    Render_view.setFloat32(260, calc_constants.arrow_scale, true);          // f32 
    Render_view.setFloat32(264, calc_constants.arrow_density, true);          // f32 
    Render_view.setFloat32(268, calc_constants.disturbanceType, true);          // f32

    // Copy f32 data to f16 texture compute shader
    const Copytxf32_txf16_BindGroupLayout = create_Copytxf32_txf16_BindGroupLayout(device);
    const Copytxf32_txf16_BindGroup = create_Copytxf32_txf16_BindGroup(device, Copytxf32_txf16_uniformBuffer, txNewState, txBottom, txMeans_Speed, txRenderVarsf16, txMeans_Momflux, txModelVelocities, txMeans, txHardBottom);
    const Copytxf32_txf16_uniforms = new ArrayBuffer(256);  // smallest multiple of 256
    let Copytxf32_txf16_view = new DataView(Copytxf32_txf16_uniforms);
    Copytxf32_txf16_view.setInt32(0, calc_constants.WIDTH, true);          // i32
    Copytxf32_txf16_view.setInt32(4, calc_constants.HEIGHT, true);          // i32
    Copytxf32_txf16_view.setFloat32(8, calc_constants.delta, true);           // f32
    Copytxf32_txf16_view.setFloat32(12, calc_constants.base_depth, true);           // f32

    // Fetch the source code of various shaders used in the application.
    const Pass0_ShaderCode = await fetchShader('/shaders/Pass0.wgsl');
    var Pass1_ShaderCode = null;
    if (calc_constants.Accuracy_mode == 1) {
        console.log("Using 4th-order MUSCL-TVD reconstruction scheme in Pass1");
        Pass1_ShaderCode = await fetchShader('/shaders/Pass1_HighOrder.wgsl');
    } else {
        Pass1_ShaderCode = await fetchShader('/shaders/Pass1.wgsl');
    }
    var Pass2_ShaderCode = null;
    if (calc_constants.Accuracy_mode == 1) {
        console.log("Using HLLC Flux Solver in Pass2");
        Pass2_ShaderCode = await fetchShader('/shaders/Pass2_HighOrder_HLLC.wgsl');  
    } else {
        Pass2_ShaderCode = await fetchShader('/shaders/Pass2.wgsl');  
    }
    const PassBreaking_ShaderCode = await fetchShader('/shaders/Pass_Breaking.wgsl'); 
    const Pass3A_Coulwave_ShaderCode= await fetchShader('/shaders/Pass3A_COULWAVE.wgsl')
    const Pass3B_Coulwave_ShaderCode= await fetchShader('/shaders/Pass3B_COULWAVE.wgsl')
    const Pass3_ShaderCode_NLSW = await fetchShader('/shaders/Pass3_NLSW.wgsl')
    var Pass3_ShaderCode_Bous = await fetchShader('/shaders/Pass3_Bous.wgsl');
    if (calc_constants.NLSW_or_Bous == 1) {
        console.log("Using Celeris equations in Boussinesq mode");
    }
    else if (calc_constants.NLSW_or_Bous == 2) {
        console.log("Using COULWAVE equations in Boussinesq mode");
        Pass3_ShaderCode_Bous = await fetchShader('/shaders/Pass3_COULWAVE.wgsl');
    }
    
    const SedTrans_Pass1_ShaderCode = await fetchShader('/shaders/SedTrans_Pass1.wgsl');
    const SedTrans_Pass3_ShaderCode = await fetchShader('/shaders/SedTrans_Pass3.wgsl')
    const BoundaryPass_ShaderCode = await fetchShader('/shaders/BoundaryPass.wgsl');
    
    var TridiagX_ShaderCode = null; var TridiagY_ShaderCode = null;  //we can likely fold thee back into a single shader
    if (calc_constants.NLSW_or_Bous == 2) {
        TridiagX_ShaderCode = await fetchShader('/shaders/TriDiag_PCRx_COULWAVE.wgsl');
        TridiagY_ShaderCode = await fetchShader('/shaders/TriDiag_PCRy_COULWAVE.wgsl');
    } else {
        TridiagX_ShaderCode = await fetchShader('/shaders/TriDiag_PCRx.wgsl');
        TridiagY_ShaderCode = await fetchShader('/shaders/TriDiag_PCRy.wgsl');
    }

    const SedTrans_UpdateBottom_ShaderCode = await fetchShader('/shaders/SedTrans_UpdateBottom.wgsl');
    const Updateneardry_ShaderCode = await fetchShader('/shaders/Update_neardry.wgsl');
    
    var UpdateTrid_ShaderCode = null;  // we can likely fold these back into a single shader
    if (calc_constants.NLSW_or_Bous == 2) {
        UpdateTrid_ShaderCode = await fetchShader('/shaders/Update_TriDiag_coef_COULWAVE.wgsl');
    } else {
        UpdateTrid_ShaderCode = await fetchShader('/shaders/Update_TriDiag_coef.wgsl');
    }

    const CalcMeans_ShaderCode = await fetchShader('/shaders/CalcMeans.wgsl');
    const CalcWaveHeight_ShaderCode = await fetchShader('/shaders/CalcWaveHeight.wgsl');
    const AddDisturbance_ShaderCode = await fetchShader('/shaders/AddDisturbance.wgsl');
    const MouseClickChange_ShaderCode = await fetchShader('/shaders/MouseClickChange.wgsl');
    const ExtractTimeSeries_ShaderCode = await fetchShader('/shaders/ExtractTimeSeries.wgsl');

    const Skybox_vertexShaderCode = await fetchShader('/shaders/skybox.vertex.wgsl');
    const Skybox_fragmentShaderCode = await fetchShader('/shaders/skybox.fragment.wgsl');
    //const Duck_vertexShaderCode = await fetchShader('/shaders/duck.vertex.wgsl');
    //const Duck_fragmentShaderCode = await fetchShader('/shaders/duck.fragment.wgsl');
    const Model_vertexShaderCode = await fetchShader('/shaders/model.vertex.wgsl');
    const Model_fragmentShaderCode = await fetchShader('/shaders/model.fragment.wgsl');

    const vertexShaderCode = await fetchShader('/shaders/vertex.wgsl');
    const vertex3DShaderCode = await fetchShader('/shaders/vertex3D.wgsl');
    const fragmentShaderCode = await fetchShader('/shaders/fragment.wgsl');

    const Copytxf32_txf16_ShaderCode = await fetchShader('/shaders/Copytxf32_txf16.wgsl');
    console.log("Shaders loaded.");

    // Configure the pipelines, one for each shader.
    const Pass0_Pipeline = createComputePipeline(device, Pass0_ShaderCode, Pass0_BindGroupLayout, allComputePipelines);
    const Pass1_Pipeline = createComputePipeline(device, Pass1_ShaderCode, Pass1_BindGroupLayout, allComputePipelines);
    const SedTrans_Pass1_Pipeline = createComputePipeline(device, SedTrans_Pass1_ShaderCode, SedTrans_Pass1_BindGroupLayout, allComputePipelines);
    const Pass2_Pipeline = createComputePipeline(device, Pass2_ShaderCode, Pass2_BindGroupLayout, allComputePipelines);
    const PassBreaking_Pipeline = createComputePipeline(device, PassBreaking_ShaderCode, PassBreaking_BindGroupLayout, allComputePipelines);
    const Pass3A_Coulwave_Pipeline = createComputePipeline(device, Pass3A_Coulwave_ShaderCode, Pass3A_Coulwave_BindGroupLayout, allComputePipelines);
    const Pass3B_Coulwave_Pipeline = createComputePipeline(device, Pass3B_Coulwave_ShaderCode, Pass3B_Coulwave_BindGroupLayout, allComputePipelines);
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
    const AddDisturbance_Pipeline = createComputePipeline(device, AddDisturbance_ShaderCode, AddDisturbance_BindGroupLayout, allComputePipelines);
    const MouseClickChange_Pipeline = createComputePipeline(device, MouseClickChange_ShaderCode, MouseClickChange_BindGroupLayout, allComputePipelines);
    const ExtractTimeSeries_Pipeline = createComputePipeline(device, ExtractTimeSeries_ShaderCode, ExtractTimeSeries_BindGroupLayout, allComputePipelines);

    const SkyboxPipeline = createSkyboxPipeline(device, Skybox_vertexShaderCode, Skybox_fragmentShaderCode, swapChainFormat, SkyboxBindGroupLayout);
    //const DuckPipeline = createDuckPipeline(device, Duck_vertexShaderCode, Duck_fragmentShaderCode, swapChainFormat, DuckBindGroupLayout);
    const ModelPipeline = createModelPipeline(device, Model_vertexShaderCode, Model_fragmentShaderCode, swapChainFormat, ModelBindGroupLayout);
    
    const RenderPipeline_quad = createRenderPipeline(device, vertexShaderCode, fragmentShaderCode, swapChainFormat, RenderBindGroupLayout, 'depth24plus');
    const RenderPipeline_vertexgrid = createRenderPipeline_vertexgrid(device, vertex3DShaderCode, fragmentShaderCode, swapChainFormat, RenderBindGroupLayout, 'depth24plus');
    var RenderPipeline = RenderPipeline_quad;

    const Copytxf32_txf16_Pipeline = createComputePipeline(device, Copytxf32_txf16_ShaderCode, Copytxf32_txf16_BindGroupLayout, allComputePipelines);

    console.log("Pipelines set up.");

    // The render pipeline will render a full-screen quad. This section of code sets up the vertices for that quad.

    // Define the vertices for a full-screen quad. This is for the plan view, design mode
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

    // buffers for a vertex grid.  This is for the drone / 3D perspective view
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
    let frame_count_time_series = 0;   // Counter for time series
    let total_time_time_series = 0;          // duration for time series
    let frame_count_find_render_step = 0;   // Counter to keep track of the number of rendered frames.
    let frame_count_output = 0;   // Counter to keep track of the number of frames saved to file
    let dt_since_last_write = 0.0 // tracks amount of time since last file write
    let frame_animation = 0; // Counter to track the frames stored for the animation

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
    var ctx = offscreenCanvas.getContext('2d');
    // Flip the canvas content vertically
    ctx.translate(0, offscreenCanvas.height); // Move to the bottom
    ctx.scale(1, -1); // Flip vertically
    // Set the background to white
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
    // create initial colorbar
    
    var logo_left = await loadImage('./logo_USACE.png');
    var logo_right = await loadImage('./logo_USC.png');
    if (calc_constants.river_sim == 1){
        logo_left = await loadImage('./logo_USC_river.png');
        logo_right = await loadImage('./logo_publicex_river.png');
    }

    update_colorbar(device, offscreenCanvas, ctx, calc_constants, txDraw, logo_left, logo_right)

    console.log("Compute / Render loop starting.");
    // This function, `frame`, serves as the main loop of the application,
    // executing repeatedly to update simulation state and render the results.

    var startTime = new Date();  // This captures the current time, or the time at the start of rendering
    var startTime_update = new Date();  // This captures the current time, or the time at the start of rendering

    async function frame() {

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
        if (adapt_render_step == 1 && calc_constants.simPause < 0  && calc_constants.setRenderStep == 0) {
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
        // copy the initial bathy into a seperate texture
        if (frame_count == 0) {
            runCopyTextures(device, calc_constants, txBottom, txBottomInitial)
        }
        
        // store baseline wave height map
        if (calc_constants.save_baseline == 1) {
            runCopyTextures(device, calc_constants, txWaveHeight, txBaseline_WaveHeight)
            calc_constants.save_baseline = 0;
        }

        // update simulation parameters in buffers if they have been changed by user through html
        if (calc_constants.html_update > 0) {

            calc_constants.dt = calc_constants.Courant_num * Math.min(calc_constants.dx,calc_constants.dy) / Math.sqrt(calc_constants.g * calc_constants.base_depth);
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
            PassBreaking_view.setFloat32(8, calc_constants.dt, true);           // f32
            PassBreaking_view.setFloat32(40, calc_constants.delta_breaking, true);             // f32
            PassBreaking_view.setFloat32(44, calc_constants.T_star_coef, true);             // f32
            PassBreaking_view.setFloat32(48, calc_constants.dzdt_I_coef, true);             // f32
            PassBreaking_view.setFloat32(52, calc_constants.dzdt_F_coef, true);             // f32
            Pass3_view.setFloat32(8, calc_constants.dt, true);             // f32
            Pass3_view.setInt32(36, calc_constants.timeScheme, true);       // f32
            Pass3_view.setInt32(44, calc_constants.isManning, true);           // f32
            Pass3_view.setFloat32(52, calc_constants.friction, true);             // f32
            Pass3_view.setFloat32(88, calc_constants.seaLevel, true);           // f32
            Pass3_view.setFloat32(92, calc_constants.dissipation_threshold, true);           // f32
            Pass3_view.setFloat32(96, calc_constants.whiteWaterDecayRate, true);           // f32
            Pass3_view.setInt32(100, calc_constants.clearConc, true);           // i32
            Pass3_view.setFloat32(112, calc_constants.whiteWaterDispersion, true);           // f32
            Pass3_view.setFloat32(116, calc_constants.infiltrationRate, true);           // f32
            Pass3_view.setInt32(120, calc_constants.useBreakingModel, true);           // i32
            Pass3_view.setInt32(124, calc_constants.showBreaking, true);           // i32

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
                runCopyTextures(device, calc_constants, txzeros, txContSource)
            }

            // make sure periodic conditions are always a pair
            if(calc_constants.west_boundary_type == 3 || calc_constants.east_boundary_type == 3){
                calc_constants.west_boundary_type = 3;
                calc_constants.east_boundary_type = 3; 
            }
            if(calc_constants.south_boundary_type == 3 || calc_constants.north_boundary_type == 3){
                calc_constants.south_boundary_type = 3;
                calc_constants.north_boundary_type = 3; 
            }
            BoundaryPass_view.setFloat32(8, calc_constants.dt, true);             // f32
            BoundaryPass_view.setFloat32(40, calc_constants.seaLevel, true);           // f32
            BoundaryPass_view.setInt32(56, calc_constants.west_boundary_type, true);       // f32
            BoundaryPass_view.setInt32(60, calc_constants.east_boundary_type, true);           // f32
            BoundaryPass_view.setInt32(64, calc_constants.south_boundary_type, true);           // f32
            BoundaryPass_view.setInt32(68, calc_constants.north_boundary_type, true);       // f32
            BoundaryPass_view.setInt32(88, calc_constants.incident_wave_type, true);           // i32 
            BoundaryPass_view.setFloat32(92, calc_constants.incident_wave_H, true);           // f32 
            BoundaryPass_view.setFloat32(96, calc_constants.incident_wave_T, true);           // f32 
            BoundaryPass_view.setFloat32(100, calc_constants.incident_wave_direction, true);   
            
            Pass3_view.setInt32(128, calc_constants.west_boundary_type, true);       // i32
            Pass3_view.setInt32(132, calc_constants.east_boundary_type, true);           // i32
            Pass3_view.setInt32(136, calc_constants.south_boundary_type, true);           // i32
            Pass3_view.setInt32(140, calc_constants.north_boundary_type, true);       // i32// f32 

            if(calc_constants.OverlayUpdate == 1) {   // overlay image option has been changed, need to update.
                calc_constants.OverlayUpdate = 0;
                calc_constants.IsOverlayMapLoaded = 0;  // reset to zero, if this doesnt change, then no overlay
                if (calc_constants.GoogleMapOverlay == 1 && calc_constants.IsGMMapLoaded == 1) {  // if using GM overlay, if this exists, it has already been loaded
   
                    calc_constants.GMscaleX = transforms.scaleX;
                    calc_constants.GMscaleY = transforms.scaleY;
                    calc_constants.GMoffsetX = transforms.offsetX;
                    calc_constants.GMoffsetY = transforms.offsetY;
            
                    txOverlayMap = txGoogleMap;
                    RenderBindGroup = createRenderBindGroup(device, Render_uniformBuffer, txNewState, txBottom, txMeans, txWaveHeight, txBaseline_WaveHeight, txBottomFriction, txNewState_Sed, erosion_Sed, depostion_Sed, txBotChange_Sed, txOverlayMap, txDraw, textureSampler, txTimeSeries_Locations, txBreaking, txSamplePNGs);
   
                    console.log('Updating Overlay with Google Maps Image')
                    calc_constants.IsOverlayMapLoaded = 1;
                } else if (calc_constants.GoogleMapOverlay == 2 && calc_constants.IsSatMapLoaded == 1) {  // if using Sat overlay
                    calc_constants.GMscaleX = 1.0; // x-direction scaling factor to make sat image align with numerical domain
                    calc_constants.GMscaleY = -1.0; // y-direction scaling factor to make sat image align with numerical domain
                    calc_constants.GMoffsetX = 0.0;  // x-direction offset for sat image
                    calc_constants.GMoffsetY = 1.0;  // y-direction offset for sat image
                    
                    txOverlayMap = txSatMap;
                    RenderBindGroup = createRenderBindGroup(device, Render_uniformBuffer, txNewState, txBottom, txMeans, txWaveHeight, txBaseline_WaveHeight, txBottomFriction, txNewState_Sed, erosion_Sed, depostion_Sed, txBotChange_Sed, txOverlayMap, txDraw, textureSampler, txTimeSeries_Locations, txBreaking, txSamplePNGs);
   
                    console.log('Updating Overlay with Sat Image')
                    calc_constants.IsOverlayMapLoaded = 1;
                }
            }

            Render_view.setFloat32(0, calc_constants.colorVal_max, true);          // f32
            Render_view.setFloat32(4, calc_constants.colorVal_min, true);          // f32
            Render_view.setInt32(8, calc_constants.colorMap_choice, true);             // i32
            Render_view.setInt32(12, calc_constants.surfaceToPlot, true);             // i32
            Render_view.setInt32(16, calc_constants.showBreaking, true);             // i32
            Render_view.setInt32(20, calc_constants.IsOverlayMapLoaded, true);             // i32
            Render_view.setFloat32(24, calc_constants.GMscaleX, true);          // f32
            Render_view.setFloat32(28, calc_constants.GMscaleY, true);          // f32
            Render_view.setFloat32(32, calc_constants.GMoffsetX, true);          // f32
            Render_view.setFloat32(36, calc_constants.GMoffsetY, true);          // f32
            Render_view.setFloat32(72, calc_constants.canvas_width_ratio, true);          // f32 
            Render_view.setFloat32(76, calc_constants.canvas_height_ratio, true);          // f32 
            Render_view.setInt32(112, calc_constants.NumberOfTimeSeries, true);             // i32  
            Render_view.setFloat32(136, calc_constants.designcomponent_Fric_Coral, true);          // f32 
            Render_view.setFloat32(140, calc_constants.designcomponent_Fric_Oyser, true);          // f32 
            Render_view.setFloat32(144, calc_constants.designcomponent_Fric_Mangrove, true);          // f32 
            Render_view.setFloat32(148, calc_constants.designcomponent_Fric_Kelp, true);          // f32 
            Render_view.setFloat32(152, calc_constants.designcomponent_Fric_Grass, true);          // f32 
            Render_view.setFloat32(156, calc_constants.designcomponent_Fric_Scrub, true);          // f32 
            Render_view.setFloat32(160, calc_constants.designcomponent_Fric_RubbleMound, true);          // f32 
            Render_view.setFloat32(164, calc_constants.designcomponent_Fric_Dune, true);          // f32 
            Render_view.setFloat32(168, calc_constants.designcomponent_Fric_Berm, true);          // f32 
            Render_view.setFloat32(172, calc_constants.designcomponent_Fric_Seawall, true);          // f32    
            Render_view.setInt32(256, calc_constants.ShowArrows, true);           // i32
            Render_view.setFloat32(260, calc_constants.arrow_scale, true);          // f32 
            Render_view.setFloat32(264, calc_constants.arrow_density, true);          // f32          
            
            // reset canvas
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
            update_colorbar(device, offscreenCanvas, ctx, calc_constants, txDraw, logo_left, logo_right) // update colorbar with new climits

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
                MouseClickChange_view.setInt32(36, calc_constants.changeType, true);             // i32  
                MouseClickChange_view.setInt32(44, calc_constants.whichPanelisOpen, true);             // i32  
                MouseClickChange_view.setInt32(48, calc_constants.designcomponentToAdd, true);             // i32  
                MouseClickChange_view.setFloat32(52, calc_constants.designcomponent_Radius, true);             // f32 
                if(calc_constants.designcomponentToAdd == 1) {calc_constants.designcomponent_Friction = calc_constants.designcomponent_Fric_Coral;} 
                else if(calc_constants.designcomponentToAdd == 2) {calc_constants.designcomponent_Friction = calc_constants.designcomponent_Fric_Oyser;} 
                else if(calc_constants.designcomponentToAdd == 3) {calc_constants.designcomponent_Friction = calc_constants.designcomponent_Fric_Mangrove;} 
                else if(calc_constants.designcomponentToAdd == 4) {calc_constants.designcomponent_Friction = calc_constants.designcomponent_Fric_Kelp;} 
                else if(calc_constants.designcomponentToAdd == 5) {calc_constants.designcomponent_Friction = calc_constants.designcomponent_Fric_Grass;} 
                else if(calc_constants.designcomponentToAdd == 6) {calc_constants.designcomponent_Friction = calc_constants.designcomponent_Fric_Scrub;} 
                else if(calc_constants.designcomponentToAdd == 7) {calc_constants.designcomponent_Friction = calc_constants.designcomponent_Fric_RubbleMound;} 
                else if(calc_constants.designcomponentToAdd == 8) {calc_constants.designcomponent_Friction = calc_constants.designcomponent_Fric_Dune;} 
                else if(calc_constants.designcomponentToAdd == 9) {calc_constants.designcomponent_Friction = calc_constants.designcomponent_Fric_Berm;} 
                else if(calc_constants.designcomponentToAdd == 10) {calc_constants.designcomponent_Friction = calc_constants.designcomponent_Fric_Seawall;} 
                MouseClickChange_view.setFloat32(56, calc_constants.designcomponent_Friction, true);             // f32  
                MouseClickChange_view.setFloat32(60, calc_constants.changeSeaLevel_delta, true);             // f32  
                calc_constants.changeSeaLevel_delta = 0.0; // once the change is added once, set to zero

                runComputeShader(device, MouseClickChange_uniformBuffer, MouseClickChange_uniforms, MouseClickChange_Pipeline, MouseClickChange_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);  // update depth/friction based on mouse click
                if(calc_constants.whichPanelisOpen == 3){
                    if(calc_constants.surfaceToChange == 1){  // when changing bath/topo
                        runCopyTextures(device, calc_constants, txtemp_MouseClick, txBottom)
                       // runCopyTextures(device, calc_constants, txtemp_MouseClick, txBottomInitial) // not sure if I should do this - cant change depth with prescribed motion slide
                        runCopyTextures(device, calc_constants, txtemp_MouseClick2, txstateUVstar)
                        runComputeShader(device, Updateneardry_uniformBuffer, Updateneardry_uniforms, Updateneardry_Pipeline, Updateneardry_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);  //need to update tridiagonal coefficients due to change inn depth
                        runCopyTextures(device, calc_constants, txtemp_bottom, txBottom)
                        if (calc_constants.NLSW_or_Bous >= 1) { // only update for Celeris Boussinesq equations
                            console.log('Updating neardry & tridiag coef due to change in depth')
                            runComputeShader(device, UpdateTrid_uniformBuffer, UpdateTrid_uniforms, UpdateTrid_Pipeline, UpdateTrid_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);  //need to update tridiagonal coefficients due to change inn depth
                        }
                    } else if(calc_constants.surfaceToChange == 2){  //when changing friction
                        runCopyTextures(device, calc_constants, txtemp_MouseClick, txBottomFriction)

                    } else if(calc_constants.surfaceToChange == 3){  //when changing passive tracer
                        runCopyTextures(device, calc_constants, txtemp_MouseClick, txContSource)

                    } else if(calc_constants.surfaceToChange == 4){  //water surface elevation
                        runCopyTextures(device, calc_constants, txtemp_MouseClick, txstateUVstar)
                    }
                } else if(calc_constants.whichPanelisOpen == 2){
                    console.log('Updating Design Components')
                    runCopyTextures(device, calc_constants, txtemp_MouseClick, txDesignComponents)
                    runCopyTextures(device, calc_constants, txtemp_MouseClick2, txBottomFriction)
                }
            }
            else if (calc_constants.click_update == 2 && calc_constants.viewType == 2)
            {
                Render_view.setFloat32(56, calc_constants.rotationAngle_xy, true);          // f32  
                Render_view.setFloat32(60, calc_constants.shift_x, true);          // f32  
                Render_view.setFloat32(64, calc_constants.shift_y, true);          // f32  
                Render_view.setFloat32(68, calc_constants.forward, true);          // f32  
            //    console.log("Updating view in Explorer Mode" )
            }
            
            calc_constants.click_update = -1;
        }
        

        // add impluse or disturbance
        if(calc_constants.add_Disturbance > 0) {
            AddDisturbance_view.setInt32(16, calc_constants.disturbanceType, true);             // f32
            AddDisturbance_view.setFloat32(20, calc_constants.disturbanceXpos, true);             // f32
            AddDisturbance_view.setFloat32(24, calc_constants.disturbanceYpos, true);             // f32
            AddDisturbance_view.setFloat32(28, calc_constants.disturbanceCrestamp, true);             // f32  
            AddDisturbance_view.setFloat32(32, calc_constants.disturbanceDir, true);             // f32  
            AddDisturbance_view.setFloat32(36, calc_constants.disturbanceWidth, true);             // f32  
            AddDisturbance_view.setFloat32(40, calc_constants.disturbanceLength, true);             // f32  
            AddDisturbance_view.setFloat32(44, calc_constants.disturbanceDip, true);             // f32  
            AddDisturbance_view.setFloat32(48, calc_constants.disturbanceRake, true);             // f32  

            runComputeShader(device, AddDisturbance_uniformBuffer, AddDisturbance_uniforms, AddDisturbance_Pipeline, AddDisturbance_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);  // add impulse
            runCopyTextures(device, calc_constants, txtemp_AddDisturbance, txstateUVstar)

            calc_constants.add_Disturbance = -1;
        }


         // loop through the compute shaders "render_step" times.  
        var commandEncoder;  // init the encoder
        var commandEncoderStack;  // init the encoder for stacking
        if (calc_constants.simPause < 0) {// do not run compute loop when > 0, when the simulation is paused {
            for (let frame_c = 0; frame_c < calc_constants.render_step; frame_c++) {  // loop through the compute shaders "render_step" time

                // Increment the frame counter and the simulation time.
                frame_count += 1;
                frame_count_since_http_update += 1;
                frame_count_time_series += 1;

                total_time = frame_count * calc_constants.dt;  //simulation time - at this point, we know values at times n-1 and previous.  We are predicted values at n
                total_time_since_http_update = frame_count_since_http_update * calc_constants.dt; // simulation time sinze last change to interface

                // set time in uniform buffers for compute shaders here, so that command encoders can be stacked
                PassBreaking_view.setFloat32(36, total_time - calc_constants.dt, true);   //f32 - update time, minus dt as we are here finding dissipation at the previous time level
                BoundaryPass_view.setFloat32(20, total_time, true);           // set current time
                AddDisturbance_view.setFloat32(64, total_time ,true);             // f32   - stores time

                // create command encoder for compute shaders and texture copy operations
                commandEncoderStack = device.createCommandEncoder();

                // Pass0
                runComputeShader_EncStack(device, commandEncoderStack, Pass0_uniformBuffer, Pass0_uniforms, Pass0_Pipeline, Pass0_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);

                // Pass1
                runComputeShader_EncStack(device, commandEncoderStack, Pass1_uniformBuffer, Pass1_uniforms, Pass1_Pipeline, Pass1_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);

                // SedTrans_Pass1
                if(calc_constants.useSedTransModel == 1){
                    runComputeShader_EncStack(device, commandEncoderStack, SedTrans_Pass1_uniformBuffer, SedTrans_Pass1_uniforms, SedTrans_Pass1_Pipeline, SedTrans_Pass1_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);
                }

                // Pass2
                runComputeShader_EncStack(device, commandEncoderStack, Pass2_uniformBuffer, Pass2_uniforms, Pass2_Pipeline, Pass2_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);

                // Breaking and Dissipation Pass
                if(calc_constants.useBreakingModel == 1) {
                    runComputeShader_EncStack(device, commandEncoderStack, PassBreaking_uniformBuffer, PassBreaking_uniforms, PassBreaking_Pipeline, PassBreaking_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);
                    runCopyTextures_EncStack(commandEncoderStack, calc_constants, txtemp_Breaking, txBreaking)
                }
                
                // break here to submit the command encoder stack
                device.queue.submit([commandEncoderStack.finish()]);

                // Pass3
                if (calc_constants.NLSW_or_Bous == 2) {  // grouping passes for COULWAVE model
                    runComputeShader(device, Pass3A_Coulwave_uniformBuffer, Pass3A_Coulwave_uniforms, Pass3A_Coulwave_Pipeline, Pass3A_Coulwave_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);
                    runComputeShader(device, Pass3B_Coulwave_uniformBuffer, Pass3B_Coulwave_uniforms, Pass3B_Coulwave_Pipeline, Pass3B_Coulwave_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);
                    copy2DDataTo3DTexture(device, txCW_uvhuhv, txCW_groupings, 0, calc_constants.WIDTH, calc_constants.HEIGHT);
                    copy2DDataTo3DTexture(device, txCW_zalpha, txCW_groupings, 1, calc_constants.WIDTH, calc_constants.HEIGHT);
                    copy2DDataTo3DTexture(device, txCW_STval, txCW_groupings, 2, calc_constants.WIDTH, calc_constants.HEIGHT);
                    copy2DDataTo3DTexture(device, txCW_STgrad, txCW_groupings, 3, calc_constants.WIDTH, calc_constants.HEIGHT);
                    copy2DDataTo3DTexture(device, txCW_Eterms, txCW_groupings, 4, calc_constants.WIDTH, calc_constants.HEIGHT);
                    copy2DDataTo3DTexture(device, txCW_FGterms, txCW_groupings, 5, calc_constants.WIDTH, calc_constants.HEIGHT);
                }

                calc_constants.pred_or_corrector = 1;  //set to predictor step
                Pass3_view.setUint32(56, calc_constants.pred_or_corrector, true);       // f32

                //re-init command encoder for Pass3
                commandEncoderStack = device.createCommandEncoder();

                if (calc_constants.NLSW_or_Bous > 0) { //BOUS
                    runComputeShader_EncStack(device, commandEncoderStack, Pass3_uniformBuffer, Pass3_uniforms, Pass3_Pipeline_Bous, Pass3_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);
                }
                else { //NLSW
                    runComputeShader_EncStack(device, commandEncoderStack, Pass3_uniformBuffer, Pass3_uniforms, Pass3_Pipeline_NLSW, Pass3_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);
                }
                // put DuDt from predictor into predicted gradients
                runCopyTextures_EncStack(commandEncoderStack, calc_constants, dU_by_dt, predictedGradients)

                // SedTrans Pass3
                if(calc_constants.useSedTransModel == 1){
                    runComputeShader_EncStack(device, commandEncoderStack, SedTrans_Pass3_uniformBuffer, SedTrans_Pass3_uniforms, SedTrans_Pass3_Pipeline, SedTrans_Pass3_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);
                    runCopyTextures_EncStack(commandEncoderStack, calc_constants, dU_by_dt_Sed, predictedGradients_Sed)
                }

                // BoundaryPass
                runComputeShader_EncStack(device, commandEncoderStack, BoundaryPass_uniformBuffer, BoundaryPass_uniforms, BoundaryPass_Pipeline, BoundaryPass_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);
                // updated texture is stored in txtemp_boundary, but back into current_stateUVstar.  Same with breaking values (mainly for periodic conditions)
                runCopyTextures_EncStack(commandEncoderStack, calc_constants, txtemp_boundary, current_stateUVstar)
                runCopyTextures_EncStack(commandEncoderStack, calc_constants, txtemp_Breaking, txBreaking)
                if(calc_constants.useSedTransModel == 1){
                    runCopyTextures_EncStack(commandEncoderStack, calc_constants, txtemp_boundary_Sed, txNewState_Sed)
                }   

                if (calc_constants.NLSW_or_Bous == 2) {
                    // COULWAVE Model - need to update nonlinear tridaig coefficents before running tridiag solver
                    runComputeShader_EncStack(device, commandEncoderStack, UpdateTrid_uniformBuffer, UpdateTrid_uniforms, UpdateTrid_Pipeline, UpdateTrid_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);  //need to update tridiagonal coefficients due to change inn depth
                }

                // submit encoder stack for boundary pass and updates before tridiag
                device.queue.submit([commandEncoderStack.finish()]);

                //Tridiag Solver for Bous, or copy for NLSW
                runTridiagSolver(device, commandEncoder, calc_constants, current_stateUVstar, txNewState, coefMatx, coefMaty, newcoef_x, newcoef_y, txtemp_PCRx, txtemp_PCRy, txtemp2_PCRx, txtemp2_PCRy,
                    TridiagX_uniformBuffer, TridiagX_uniforms, TridiagX_Pipeline, TridiagX_BindGroup, TridiagX_view,
                    TridiagY_uniformBuffer, TridiagY_uniforms, TridiagY_Pipeline, TridiagY_BindGroup, TridiagY_view,
                    runComputeShader, runCopyTextures
                )

                // after tridiag, we re-eval bc's on eta. P, Q  [this is not needed for NLSW, since U*=P and V*=Q, and these bc's have already been enforced]

                // re-init command encoder for boundary pass after tridiag
                commandEncoderStack = device.createCommandEncoder();

                if (calc_constants.NLSW_or_Bous > 0) { //BOUS
                    runComputeShader_EncStack(device, commandEncoderStack, BoundaryPass_uniformBuffer, BoundaryPass_uniforms, BoundaryPass_Pipeline, BoundaryPass_BindGroup_NewState, calc_constants.DispatchX, calc_constants.DispatchY);
                }
                // updated texture is stored in txtemp, but back into txNewState - this needs to be done for both NLSW and Bous.  Even though these are the same in NLSW, some passes use State, and these must be updated with bc's
                runCopyTextures_EncStack(commandEncoderStack, calc_constants, txtemp_boundary, txNewState)

                // Shift back FG textures - only have to do this for Bous, and only after predictor step
                runCopyTextures_EncStack(commandEncoderStack, calc_constants, F_G_star_oldGradients, F_G_star_oldOldGradients)
                runCopyTextures_EncStack(commandEncoderStack, calc_constants, predictedF_G_star, F_G_star_oldGradients)

                // add prescriptive depth change
                if(calc_constants.disturbanceType == 5) {

                    runComputeShader_EncStack(device, commandEncoderStack, AddDisturbance_uniformBuffer, AddDisturbance_uniforms, AddDisturbance_Pipeline, AddDisturbance_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);  // add impulse
                    runCopyTextures_EncStack(commandEncoderStack, calc_constants, txtemp_bottom, txBottom) 
                    runComputeShader_EncStack(device, commandEncoderStack, Updateneardry_uniformBuffer, Updateneardry_uniforms, Updateneardry_Pipeline, Updateneardry_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);  //need to update neardry
                    runCopyTextures_EncStack(commandEncoderStack, calc_constants, txtemp_bottom, txBottom)
                    runComputeShader_EncStack(device, commandEncoderStack, UpdateTrid_uniformBuffer, UpdateTrid_uniforms, UpdateTrid_Pipeline, UpdateTrid_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);  //need to update tridiagonal coefficients due to change inn depth
                        
                    // copy the initial bathy into a seperate texture
                    if (frame_count == 0) {
                        runCopyTextures_EncStack(commandEncoderStack, calc_constants, txBottom, txBottomInitial)
                    }

                }

                // submit encoder stack 
                device.queue.submit([commandEncoderStack.finish()]);

                if (calc_constants.timeScheme == 2)  // only called when using Predictor+Corrector method.  Adding corrector allows for a time step twice as large (also adds twice the computation) and provides a more accurate solution
                {
                    // set buffers here so that command encoder stack can be maximized for corrector step
                    PassBreaking_view.setFloat32(36, total_time, true);
                    
                    // re-init command encoder for corrector step
                    commandEncoderStack = device.createCommandEncoder();
                    
                    // put txNewState into txState for the corrector equation, so gradients use the predicted values
                    runCopyTextures_EncStack(commandEncoderStack, calc_constants, txNewState, txState)
                    if(calc_constants.useSedTransModel == 1){
                        runCopyTextures_EncStack(commandEncoderStack, calc_constants, txNewState_Sed, txState_Sed)
                    }                       

                    // Pass0
                    runComputeShader_EncStack(device, commandEncoderStack, Pass0_uniformBuffer, Pass0_uniforms, Pass0_Pipeline, Pass0_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);

                    // Pass1
                    runComputeShader_EncStack(device, commandEncoderStack, Pass1_uniformBuffer, Pass1_uniforms, Pass1_Pipeline, Pass1_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);

                    // SedTrans_Pass1
                    if(calc_constants.useSedTransModel == 1){
                        runComputeShader_EncStack(device, commandEncoderStack, SedTrans_Pass1_uniformBuffer, SedTrans_Pass1_uniforms, SedTrans_Pass1_Pipeline, SedTrans_Pass1_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);
                    }

                    // Pass2
                    runComputeShader_EncStack(device, commandEncoderStack, Pass2_uniformBuffer, Pass2_uniforms, Pass2_Pipeline, Pass2_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);

                    // Breaking and Dissipation Pass
                    if(calc_constants.useBreakingModel == 1) {
                        runComputeShader_EncStack(device, commandEncoderStack, PassBreaking_uniformBuffer, PassBreaking_uniforms, PassBreaking_Pipeline, PassBreaking_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);
                        runCopyTextures_EncStack(commandEncoderStack, calc_constants, txtemp_Breaking, txBreaking)
                    }
                    
                    // submit encoder stack for corrector step before breaking and Pass3
                    device.queue.submit([commandEncoderStack.finish()]);

                    // Pass3
                    if (calc_constants.NLSW_or_Bous == 2) {  // grouping passes for COULWAVE model
                        runComputeShader(device, Pass3A_Coulwave_uniformBuffer, Pass3A_Coulwave_uniforms, Pass3A_Coulwave_Pipeline, Pass3A_Coulwave_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);
                        runComputeShader(device, Pass3B_Coulwave_uniformBuffer, Pass3B_Coulwave_uniforms, Pass3B_Coulwave_Pipeline, Pass3B_Coulwave_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);
                        copy2DDataTo3DTexture(device, txCW_uvhuhv, txCW_groupings, 0, calc_constants.WIDTH, calc_constants.HEIGHT);
                        copy2DDataTo3DTexture(device, txCW_zalpha, txCW_groupings, 1, calc_constants.WIDTH, calc_constants.HEIGHT);
                        copy2DDataTo3DTexture(device, txCW_STval, txCW_groupings, 2, calc_constants.WIDTH, calc_constants.HEIGHT);
                        copy2DDataTo3DTexture(device, txCW_STgrad, txCW_groupings, 3, calc_constants.WIDTH, calc_constants.HEIGHT);
                        copy2DDataTo3DTexture(device, txCW_Eterms, txCW_groupings, 4, calc_constants.WIDTH, calc_constants.HEIGHT);
                        copy2DDataTo3DTexture(device, txCW_FGterms, txCW_groupings, 5, calc_constants.WIDTH, calc_constants.HEIGHT);
                    }

                    calc_constants.pred_or_corrector = 2;
                    Pass3_view.setUint32(56, calc_constants.pred_or_corrector, true);       // f32

                    // re-init command encoder for Pass3 corrector step
                    commandEncoderStack = device.createCommandEncoder();
                    if (calc_constants.NLSW_or_Bous > 0) { //BOUS
                        runComputeShader_EncStack(device, commandEncoderStack, Pass3_uniformBuffer, Pass3_uniforms, Pass3_Pipeline_Bous, Pass3_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);
                    }
                    else { //NLSW
                        runComputeShader_EncStack(device, commandEncoderStack, Pass3_uniformBuffer, Pass3_uniforms, Pass3_Pipeline_NLSW, Pass3_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);
                    }

                    // SedTrans Pass3
                    if(calc_constants.useSedTransModel == 1){
                        runComputeShader_EncStack(device, commandEncoderStack, SedTrans_Pass3_uniformBuffer, SedTrans_Pass3_uniforms, SedTrans_Pass3_Pipeline, SedTrans_Pass3_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);
                    }

                    // BoundaryPass
                    runComputeShader_EncStack(device, commandEncoderStack, BoundaryPass_uniformBuffer, BoundaryPass_uniforms, BoundaryPass_Pipeline, BoundaryPass_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);
                    // updated texture is stored in txtemp, but back into current_stateUVstar
                    runCopyTextures_EncStack(commandEncoderStack, calc_constants, txtemp_boundary, current_stateUVstar)
                    runCopyTextures_EncStack(commandEncoderStack, calc_constants, txtemp_Breaking, txBreaking)
                    if(calc_constants.useSedTransModel == 1){
                        runCopyTextures_EncStack(commandEncoderStack, calc_constants, txtemp_boundary_Sed, txNewState_Sed)
                    }                    

                    if (calc_constants.NLSW_or_Bous == 2) {
                        // COULWAVE Model - need to update nonlinear tridaig coefficents before running tridiag solver
                        runComputeShader_EncStack(device, commandEncoderStack, UpdateTrid_uniformBuffer, UpdateTrid_uniforms, UpdateTrid_Pipeline, UpdateTrid_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);  //need to update tridiagonal coefficients due to change inn depth
                    }

                    // submit encoder stack for corrector step before tridiag
                    device.queue.submit([commandEncoderStack.finish()]);

                    //Tridiag Solver for Bous, or copy for NLSW
                    runTridiagSolver(device, commandEncoder, calc_constants, current_stateUVstar, txNewState, coefMatx, coefMaty, newcoef_x, newcoef_y, txtemp_PCRx, txtemp_PCRy, txtemp2_PCRx, txtemp2_PCRy,
                            TridiagX_uniformBuffer, TridiagX_uniforms, TridiagX_Pipeline, TridiagX_BindGroup, TridiagX_view,
                            TridiagY_uniformBuffer, TridiagY_uniforms, TridiagY_Pipeline, TridiagY_BindGroup, TridiagY_view,
                            runComputeShader, runCopyTextures
                    )

                    // re-init command encoder for boundary pass after tridiag in corrector step
                    commandEncoderStack = device.createCommandEncoder();

                    // after tridiag, we re-eval bc's on eta. P, Q  [this is not needed for NLSW, since U*=P and V*=Q, and these bc's have already been enforced]
                    if (calc_constants.NLSW_or_Bous > 0) { //BOUS
                        runComputeShader_EncStack(device, commandEncoderStack, BoundaryPass_uniformBuffer, BoundaryPass_uniforms, BoundaryPass_Pipeline, BoundaryPass_BindGroup_NewState, calc_constants.DispatchX, calc_constants.DispatchY);
                    }
                    // updated texture is stored in txtemp, but back into txNewState - this needs to be done for both NLSW and Bous.  Even though these are the same in NLSW, some passes use State, and these must be updated with bc's
                    runCopyTextures_EncStack(commandEncoderStack, calc_constants, txtemp_boundary, txNewState)

                    // submit encoder stack for boundary pass after tridiag in corrector step
                    device.queue.submit([commandEncoderStack.finish()]);
                }

                // setup variables and re-set buffers as needed here, above the encoder stack
                calc_constants.n_time_steps_means += 1;
                CalcMeans_view.setInt32(0, calc_constants.n_time_steps_means, true);          // i32

                calc_constants.n_time_steps_waveheight += 1;
                CalcWaveHeight_view.setInt32(0, calc_constants.n_time_steps_waveheight, true);          // i32

                // re-init command encoder for copy operations after corrector step
                commandEncoderStack = device.createCommandEncoder();

                // Update Bottom from Sed Transport
                if(calc_constants.useSedTransModel == 1){
                    runComputeShader_EncStack(device, commandEncoderStack, SedTrans_UpdateBottom_uniformBuffer, SedTrans_UpdateBottom_uniforms, SedTrans_UpdateBottom_Pipeline, SedTrans_UpdateBottom_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);
                    runCopyTextures_EncStack(commandEncoderStack, calc_constants, txtemp_SedTrans_Botttom, txBottom)
                    runCopyTextures_EncStack(commandEncoderStack, calc_constants, txtemp_SedTrans_Change, txBotChange_Sed)
                    runComputeShader_EncStack(device, commandEncoderStack, Updateneardry_uniformBuffer, Updateneardry_uniforms, Updateneardry_Pipeline, Updateneardry_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);  //need to update tridiagonal coefficients due to change inn depth
                    runCopyTextures_EncStack(commandEncoderStack, calc_constants, txtemp_bottom, txBottom)
                    if (calc_constants.NLSW_or_Bous == 1) { // only need to update neardry and tridiagonal coefficients for Celeris Boussinesq equations
                     //   console.log('Updating neardry & tridiag coef sediment transport depth change')
                        runComputeShader_EncStack(device, commandEncoderStack, UpdateTrid_uniformBuffer, UpdateTrid_uniforms, UpdateTrid_Pipeline, UpdateTrid_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);  //need to update tridiagonal coefficients due to change inn depth
                    }
                }

                // shift gradient textures
                runCopyTextures_EncStack(commandEncoderStack, calc_constants, oldGradients, oldOldGradients)
                runCopyTextures_EncStack(commandEncoderStack, calc_constants, predictedGradients, oldGradients)

                // Copy future_ocean_texture back to ocean_texture
                runCopyTextures_EncStack(commandEncoderStack, calc_constants, txNewState, txState)
                runCopyTextures_EncStack(commandEncoderStack, calc_constants, current_stateUVstar, txstateUVstar)
                
                // shift/Copy SedTrans
                if(calc_constants.useSedTransModel == 1){
                    runCopyTextures_EncStack(commandEncoderStack, calc_constants, oldGradients_Sed, oldOldGradients_Sed)
                    runCopyTextures_EncStack(commandEncoderStack, calc_constants, predictedGradients_Sed, oldGradients_Sed)
                    runCopyTextures_EncStack(commandEncoderStack, calc_constants, txNewState_Sed, txState_Sed)
                }

                //  Update Statistics - means and wave height
                //calc_constants.n_time_steps_means += 1;  // moved above
                // update Pass1 cell side textures as these are used for the velocities outputs - can probably remove the Pass1 call in the predictor step, but do not want to break anything right now
                runComputeShader_EncStack(device, commandEncoderStack, Pass1_uniformBuffer, Pass1_uniforms, Pass1_Pipeline, Pass1_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);
                //CalcMeans_view.setInt32(0, calc_constants.n_time_steps_means, true);          // i32 moved above
                runComputeShader_EncStack(device, commandEncoderStack, CalcMeans_uniformBuffer, CalcMeans_uniforms, CalcMeans_Pipeline, CalcMeans_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);
                
                // Stack command encoder for copy operations
                runCopyTextures_EncStack(commandEncoderStack, calc_constants, txtemp_Means, txMeans)
                runCopyTextures_EncStack(commandEncoderStack, calc_constants, txtemp_Means_Speed, txMeans_Speed)
                runCopyTextures_EncStack(commandEncoderStack, calc_constants, txtemp_Means_Momflux, txMeans_Momflux)

                //calc_constants.n_time_steps_waveheight += 1;  // moved above
                //CalcWaveHeight_view.setInt32(0, calc_constants.n_time_steps_waveheight, true);          // i32 moved above
                runComputeShader_EncStack(device, commandEncoderStack, CalcWaveHeight_uniformBuffer, CalcWaveHeight_uniforms, CalcWaveHeight_Pipeline, CalcWaveHeight_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);
                runCopyTextures_EncStack(commandEncoderStack, calc_constants, txtemp_WaveHeight, txWaveHeight)
                
                // submit encoder stack for copy operations after corrector step
                device.queue.submit([commandEncoderStack.finish()]);

            }
        }

        // copy eta and bottom data to the f16 texture for filtered rendering
        runComputeShader(device, Copytxf32_txf16_uniformBuffer, Copytxf32_txf16_uniforms, Copytxf32_txf16_Pipeline, Copytxf32_txf16_BindGroup, calc_constants.DispatchX, calc_constants.DispatchY);
             
        // Define the settings for the render pass.
        Render_view.setFloat32(116, total_time, true);             // f32  
        if (calc_constants.viewType == 1)
        {
            // turn back on colorbar
            calc_constants.CB_show = 1;
            
            // Render QUAD
            Render_view.setInt32(84, calc_constants.CB_show, true);          // i32
            RenderPipeline = RenderPipeline_quad;
        }
        else if (calc_constants.viewType == 2)
        {  
            // turn off colorbar
            calc_constants.CB_show = 0;

            // Render Vertex grid
            Render_view.setInt32(84, calc_constants.CB_show, true);          // i32
            RenderPipeline = RenderPipeline_vertexgrid;
        }

        // make sure depthTexture matches the current canvas / window size
        const colorTexture = context.getCurrentTexture();
        // (Re)create depth texture if size changed
        if (!depthTexture || depthTexture.width  !== colorTexture.width || depthTexture.height !== colorTexture.height) {
            depthTexture?.destroy?.();          // if you want to free the old one
            depthTexture = create_Depth_Texture(device, colorTexture.width, colorTexture.height, allTextures); // initial depth texture for Explorer mode
        }
        const depthView = depthTexture.createView();

        // The render target is the current swap chain texture.
        const RenderPassDescriptor = {
            colorAttachments: [{
                view: colorTexture.createView(),
                loadOp: 'clear',
                storeOp: 'store',
                clearColor: { r: 0.5, g: 0.5, b: 0.5, a: 1 },
            }],
            depthStencilAttachment: {
              view: depthView,
              depthLoadOp : 'clear',
              depthStoreOp: 'store',
              depthClearValue: 1.0,
            }
        };

        commandEncoder = device.createCommandEncoder();

        // Begin recording commands for the render pass.
        const RenderPass = commandEncoder.beginRenderPass(RenderPassDescriptor);

        let grid_ratio = calc_constants.dx / calc_constants.dy;
        if (calc_constants.viewType == 1)
        {
            
            // Set the render pipeline, bind group, and vertex buffer.
            RenderPass.setPipeline(RenderPipeline);
            RenderPass.setBindGroup(0, RenderBindGroup);

            // set uniforms buffer
            device.queue.writeBuffer(Render_uniformBuffer, 0, Render_uniforms);

            // Render QUAD
            RenderPass.setVertexBuffer(0, quadVertexBuffer);
            // Issue draw command to draw
            RenderPass.draw(4);  // Draw the quad 
        }
        else if (calc_constants.viewType == 2)  // 3D / drone / walk-through perspective !
        {  
          // ──────────────────────────────────────────────────────────────────────────────
            // ──────────────────────────────────────────────────────────────────────────────
            // FULL "Perspective + Model" setup
            // ──────────────────────────────────────────────────────────────────────────────

            // ─────────────────────────────────────────────────────────────
            // 1. Canvas dimensions
            const window_width  = calc_constants.full_screen ? window.innerWidth  : canvas.width;
            const window_height = calc_constants.full_screen ? window.innerHeight : canvas.height;

            // ─────────────────────────────────────────────────────────────
            // 2. Perspective projection
            const fovY   = 45 * Math.PI / 180;
            const aspect = window_width / window_height;
            const nearZ  = Math.min(0.1, Math.min(calc_constants.dx, calc_constants.dy) / 10);
            const farZ   = 10 * (simWidth + simHeight);
            const P      = mat4.perspective(mat4.create(), fovY, aspect, nearZ, farZ);

            // ─────────────────────────────────────────────────────────────
            // 3. Camera transformation 

            // --- Use a persistent camera state ---
            // Get current state
            const camState = window.cameraState;

            // Calculate delta from previous frame
            const deltaYaw = calc_constants.rotationAngle_xy * Math.PI / 180 - camState.yaw;
            const deltaPitch = calc_constants.rotationAngle_xz * Math.PI / 180 - camState.pitch;
            const deltaPanX = calc_constants.shift_x - camState.panX;
            const deltaPanY = calc_constants.shift_y - camState.panY;
            const deltaForward = calc_constants.forward - camState.forward;

            // Update current values
            camState.yaw = calc_constants.rotationAngle_xy * Math.PI / 180;
            camState.pitch = calc_constants.rotationAngle_xz * Math.PI / 180;
            camState.panX = calc_constants.shift_x;
            camState.panY = calc_constants.shift_y;
            camState.forward = calc_constants.forward;

            // bathy interp - find ground elevation at current position
            const x = camState.position[0] / calc_constants.dx;
            const y = camState.position[1] / calc_constants.dy;
            // clamp to [0 ... N-1]
            const Nx = bathy2D.length;
            const Ny = bathy2D[0].length;
            const i0 = Math.min( Nx - 1, Math.max(0, Math.floor(x)) );
            const j0 = Math.min( Ny - 1, Math.max(0, Math.floor(y)) );
            // for interpolation, clamp the “+1” corner as well
            const i1 = Math.min(i0 + 1, Nx - 1);
            const j1 = Math.min(j0 + 1, Ny - 1);
            const tx = x - i0,      ty = y - j0;
              
            const z00 = bathy2D[i0][j0];
            const z10 = bathy2D[i1][j0];
            const z01 = bathy2D[i0][j1];
            const z11 = bathy2D[i1][j1];
            const zmax = Math.max(z00, Math.max(z10, Math.max(z01,z11)));
            const zmin = Math.min(z00, Math.min(z10, Math.min(z01,z11)));
              
            // interpolate in x
            const z0 = z00*(1-tx) + z10*tx;
            const z1 = z01*(1-tx) + z11*tx;
            // then in y
            const groundZ = z0*(1-ty) + z1*ty;
            
            const groundEyePosZ =  Math.max(0.0, groundZ) + calc_constants.renderZScale * (zmax - zmin + calc_constants.renderEyeHeight);
            if (calc_constants.renderLocktoGround == 1) {  // if locked to ground
                camState.position[2] = groundEyePosZ;
            }
            else {
                camState.position[2] = Math.max(camState.position[2], groundEyePosZ); // do not let camera go underground
            }

            // Get initial direction from baseEye to baseTarget
            const initialDir = vec3.create();
            vec3.subtract(initialDir, baseTarget, baseEye);
            const initialDist = vec3.length(initialDir);
            vec3.normalize(initialDir, initialDir);

            // Calculate current orientation vectors
            const cY = Math.cos(camState.yaw), sY = Math.sin(camState.yaw);
            const cP = Math.cos(camState.pitch), sP = Math.sin(camState.pitch);

            // Forward vector (direction camera is looking)
            const forward = vec3.fromValues(
                cY * cP,  // x
                sY * cP,  // y
                sP        // z
            );

            // Right vector (perpendicular to forward and world up)
            const worldUp = vec3.fromValues(0, 0, 1);
            const right = vec3.create();
            vec3.cross(right, forward, worldUp);
            vec3.normalize(right, right);

            // Up vector (perpendicular to forward and right)
            const up = vec3.create();
            vec3.cross(up, right, forward);
            // when pitch in degrees exceeds ±90°, flip up
            if (Math.abs(calc_constants.rotationAngle_xz) > 90) {
                vec3.scale(up, up, -1);
            }      
            vec3.normalize(up, up);

            // Apply delta movements correctly to camera state
            // 1) PanX  → strafe left/right along the camera’s right vector
            if (deltaPanX !== 0) {
                vec3.scaleAndAdd(
                camState.position,
                camState.position,
                right,
                deltaPanX * simDim
                );
            }
            
            // 2) PanY  → move forward/back in the horizontal (XY) plane
            if (deltaPanY !== 0) {
                // project the pitched forward vector onto the XY plane
                const horFwd = vec3.fromValues(forward[0], forward[1], 0);
                vec3.normalize(horFwd, horFwd);
            
                if (calc_constants.renderLocktoGround == 1) {
                    vec3.scaleAndAdd(
                    camState.position,
                    camState.position,
                    horFwd,  // if locked to the ground, only forward in horizontal - jump if using forward here
                    deltaPanY * simDim
                    );
                } else {
                    vec3.scaleAndAdd(
                    camState.position,
                    camState.position,
                    forward,
                    deltaPanY * simDim
                    );   
                }
            }
            
            // 3) forward control → move along the full camera direction (including pitch)
            if (deltaForward !== 0 && calc_constants.renderLocktoGround == 0) {
                vec3.scaleAndAdd(
                camState.position,
                camState.position,
                up,
                -deltaForward * initialDist
                );
            }

            // Final camera position is our tracked position
            const eye = vec3.clone(camState.position);

            // Calculate target point (always in front of camera)
            const target = vec3.create();
            vec3.scaleAndAdd(target, eye, forward, initialDist);

            // Create view matrix
            const V = mat4.lookAt(mat4.create(), eye, target, up);

            // ─────────────────────────────────────────────────────────────
            // 4. Model matrix (identity - we're handling movement in camera space)
            const model = mat4.create();

            // grid transformations:
            const T_unskew = mat4.fromScaling(mat4.create(), [
                1 / calc_constants.dx,
                1 / calc_constants.dy,
                1
            ]);

            const T_reskew = mat4.fromScaling(mat4.create(), [
                calc_constants.dx,
                calc_constants.dy,
                1
            ]);

            mat4.multiply(model, T_reskew, T_unskew);

            // ─────────────────────────────────────────────────────────────
            // 5. Final view-projection matrix
            const viewProj = mat4.mul(mat4.create(), P, mat4.mul(mat4.create(), V, model)); // view profection


            // display current camera position, pitch, and yaw to the console
            //console.log(`Camera position: x=${camState.position[0].toFixed(2)}, y=${camState.position[1].toFixed(2)}, z=${camState.position[2].toFixed(2)}`);
            //console.log(`Camera pitch (xz)=${(camState.pitch * 180 / Math.PI).toFixed(2)}°, yaw (xy)=${(camState.yaw * 180 / Math.PI).toFixed(2)}°`);


            // skybox view matrix
            // Make a rotation‐only copy for the sky
            const skyView = mat4.clone(V);
            skyView[12] = 0.0;
            skyView[13] = 0.0;
            skyView[14] = 0.0;
            
            // Sky view‐proj (no translation)
            const viewProjSky = mat4.mul(mat4.create(), P, skyView);
            
            // Invert & upload
            const invViewProjSky = mat4.invert(mat4.create(), viewProjSky);

            // ── draw skybox ─────────────────────
            RenderPass.setPipeline(SkyboxPipeline);
            RenderPass.setBindGroup(0, SkyboxBindGroup);
            // Upload invViewProjSky to  uniform buffer before drawing  
            for (let i = 0; i < 16; ++i) {
                Skybox_view.setFloat32(4*i, invViewProjSky[i], true);
            }
            // set uniforms buffer
            device.queue.writeBuffer(Skybox_uniformBuffer, 0, Skybox_uniforms);
            RenderPass.draw(3, 1, 0, 0);


            // ── draw models ─────────────────────
            // duck igTL
            //const Duck_targetHeight = 10; // height of the duck in the world
            //const DuckmodelMatrix = makeModelMatrix(500., 500., 1., Duck_targetHeight / duck.localHeight, 0.)
            //RenderPass.setPipeline(DuckPipeline);
            //RenderPass.setBindGroup(0, DuckBindGroup);
            //for (let i = 0; i < 16; ++i) {
            //    Duck_view.setFloat32(4 * i,         viewProj[i],        true);
            //    Duck_view.setFloat32(4 * (16 + i),  DuckmodelMatrix[i], true);
            //}
            //Duck_view.setFloat32(128, camState.position[0], true);
            //Duck_view.setFloat32(132, camState.position[1], true);
            //Duck_view.setFloat32(136, camState.position[2], true);     
            //device.queue.writeBuffer(Duck_uniformBuffer, 0, Duck_uniforms);     
            //RenderPass.setVertexBuffer(0, duck.vertexBuffers[0]);
            //RenderPass.setVertexBuffer(1, duck.vertexBuffers[1]);
            //RenderPass.setVertexBuffer(2, duck.vertexBuffers[2]);
            //RenderPass.setIndexBuffer( duck.indexBuffer, 'uint16' );
            //RenderPass.drawIndexed( duck.indexCount );


            // boxes
            RenderPass.setPipeline(ModelPipeline);

            for (const obj of model_properties) {
                // A) pack camera+viewProj+modelMatrix into this obj's DataView
                const mv = obj.uniformView;
                for (let i = 0; i < 16; ++i) {
                    mv.setFloat32(4 * i,         viewProj[i],        true);
                    mv.setFloat32(4 * (16 + i),  obj.modelMatrix[i], true);
                }
                mv.setFloat32(128, camState.position[0], true);
                mv.setFloat32(132, camState.position[1], true);
                mv.setFloat32(136, camState.position[2], true);
                
                // B) push that into *this* object's GPUBuffer
                device.queue.writeBuffer(obj.uniformBuffer, 0, obj.uniforms);

                // C) bind & draw
                RenderPass.setBindGroup(0, obj.bindGroup);
                RenderPass.setVertexBuffer(0, boxVB);
                RenderPass.setIndexBuffer(boxIB, 'uint32');
                RenderPass.drawIndexed(boxIndices.length);
            }

            // Draw the wave and ground surface
            // Set the render pipeline, bind group, and vertex buffer.
            RenderPass.setPipeline(RenderPipeline);
            RenderPass.setBindGroup(0, RenderBindGroup);

            // Upload viewProj to  niform buffer before drawing          
            // write it to existing UBO (at offset 192…208…)
            for (let i = 0; i < 16; ++i) {
                Render_view.setFloat32(192 + 4*i, viewProj[i], true);
            }
            // set uniforms buffer
            device.queue.writeBuffer(Render_uniformBuffer, 0, Render_uniforms);

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

        // for the tooltip & time series, extract pixel values
        if(calc_constants.updateTimeSeriesTx == 1 || calc_constants.chartDataUpdate == 1) {  // update the time series locations texture, and reset plot
            copyTSlocsToTexture(calc_constants, device, txTimeSeries_Locations) 
            frame_count_time_series = 0; 
            total_time_time_series = 0.0;
            calc_constants.updateTimeSeriesTx = 0;
        }

        total_time_time_series = frame_count_time_series * calc_constants.dt; // step up time series time vector
        if(total_time_time_series > calc_constants.maxdurationTimeSeries ){  // reset display if greater than max time
            if(calc_constants.NumberOfTimeSeries > 0) {
                console.log('Reseting time series chart data, and saving time series to file')
                downloadTimeSeriesData();
            }
            frame_count_time_series = 0; 
            total_time_time_series = 0.0;
        }
        
        ExtractTimeSeries_view.setInt32(16, calc_constants.mouse_current_canvas_indX, true);             // i32
        ExtractTimeSeries_view.setInt32(20, calc_constants.mouse_current_canvas_indY, true);             // i32
        ExtractTimeSeries_view.setFloat32(24,  total_time_time_series, true);             // f32, total_time
        runComputeShader(device, ExtractTimeSeries_uniformBuffer, ExtractTimeSeries_uniforms, ExtractTimeSeries_Pipeline, ExtractTimeSeries_BindGroup, calc_constants.NumberOfTimeSeries + 1, 1);  //extract tooltip and time series data into a 1D texture        
        readToolTipTextureData(device, txTimeSeries_Data, frame_count_time_series);  //  read the tooltip / time series data and place into variables

        
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

        // determine elapsed time
        const now = new Date();
        calc_constants.elapsedTime = (now - startTime) / 1000;
        calc_constants.elapsedTime_update = (now - startTime_update) / 1000;

        // Call the function to display the constants in the index.html page
        calc_constants.clearConc = 0; // reset back to default value - no easier place to set this back.
        Pass3_view.setInt32(100, calc_constants.clearConc, true);           // i32

        displayCalcConstants(calc_constants, total_time_since_http_update);
        displaySimStatus(calc_constants, total_time, total_time_since_http_update);
        displayTimeSeriesLocations(calc_constants);
        displaySlideVolume(calc_constants);

        // create Animated Gif or jpg stack
        // if using trigger, see if animation start time has been reached
        if(calc_constants.trigger_animation == 1 && total_time >= calc_constants.trigger_animation_start_time) {
            console.log('Trigger write - Creating animation of the simulation')
            calc_constants.create_animation = 1; // create animated gif
            calc_constants.trigger_animation = 0; // reset trigger
        }

        let nframes = 80;
        if(calc_constants.create_animation == 2) {nframes = calc_constants.JPEGstack_frames;}
        if(calc_constants.create_animation > 0){
            frame_animation = frame_animation + 1;            
            
            let dt_inc = calc_constants.AnimGif_dt; // incrememnt store frames
            if(calc_constants.create_animation == 2){dt_inc = calc_constants.JPEGstack_dt;}
            let n_inc = Math.ceil(dt_inc / calc_constants.dt);

            if(frame_animation == 1){ // create 3D texture
                console.log('Setting screen render rate to match image frame rate');
                calc_constants.setRenderStep = 1;
                calc_constants.render_step = n_inc;
                dt_inc = n_inc * calc_constants.dt;
                console.log('Creating 3D Texture for Image Stack');
                txAnimation = create_3D_Image_Texture(device, canvas.width, canvas.height, nframes, allTextures);
            }

            if(frame_animation <= nframes){  // store individual frames in 3D texture
                console.log('Storing image frame # ', frame_animation, 'at time (s) ', total_time);
                // Create a new command encoder for recording GPU commands.
                commandEncoder = device.createCommandEncoder();

                // copy the textures
                commandEncoder.copyTextureToTexture(
                    { texture: txScreen },  //src
                    { texture: txAnimation, origin: {x: 0, y: 0, z: frame_animation - 1} },  //dst
                    { width: canvas.width, height: canvas.height, depthOrArrayLayers: 1 }
                );

                // Submit the recorded commands to the GPU for execution.
                device.queue.submit([commandEncoder.finish()]);
            }

            if(frame_animation == nframes){  // create a saved animation
                const textureSize = { width: canvas.width, height: canvas.height, depth: nframes }; // Example sizes and number of frames
                if(calc_constants.create_animation == 1){
                    createAnimatedGifFromTexture(device, txAnimation, textureSize);
                }
                else if(calc_constants.create_animation == 2){
                    saveTextureSlicesAsImages(device, txAnimation, textureSize);
                }
               
               // reset render parameters back
               calc_constants.create_animation = 0;
               calc_constants.setRenderStep = 0;
               calc_constants.render_step = 1;
               frame_animation = 0;
            }

        }

        // write individual surface to file
        if(calc_constants.write_individual_surface == 1){
            if(calc_constants.which_surface_to_write == 0){  // free surface elevation
                let filename = 'current_eta.bin';
                downloadTextureData(device, txNewState, 1, filename, readbackBuffer);  // last number is the channel 1 = .r, 2 = .g, etc.
             //   downloadGeoTiffData(device, txNewState, 1, calc_constants.dx, calc_constants.dy);  // current implemntation does not allow writing of float32, only uint8
             //  can update to write an RGB geotiff, but that doesnt seem too useful

            } else if(calc_constants.which_surface_to_write == 1){  // HU
                let filename = 'current_HU.bin';
                downloadTextureData(device, txNewState, 2, filename, readbackBuffer);  

            } else if(calc_constants.which_surface_to_write == 2){  // HV
                let filename = 'current_HV.bin';
                downloadTextureData(device, txNewState, 3, filename, readbackBuffer);  

            } else if(calc_constants.which_surface_to_write == 3){  // eddy viscosity
                let filename = 'current_eddyvisc.bin';
                downloadTextureData(device, txBreaking, 2, filename, readbackBuffer);  

            } else if(calc_constants.which_surface_to_write == 4){  // foam
                let filename = 'current_tracer.bin';
                downloadTextureData(device, txNewState, 4, filename, readbackBuffer);  

            } else if(calc_constants.which_surface_to_write == 5){  // Bathymetry/Topography
                let filename = 'current_bathytopo.bin';
                downloadTextureData(device, txBottom, 3, filename, readbackBuffer);  

            } else if(calc_constants.which_surface_to_write == 6){  // Bottom Friction Map 
                let filename = 'current_friction.bin';
                downloadTextureData(device, txBottomFriction, 1, filename, readbackBuffer);  

            } else if(calc_constants.which_surface_to_write == 7){  // Design Component Map
                let filename = 'current_designcomponents.bin';
                downloadTextureData(device, txDesignComponents, 1, filename, readbackBuffer);  

            } else if(calc_constants.which_surface_to_write == 8){  // RMS Wave Height
                let filename = 'current_Hrms.bin';
                downloadTextureData(device, txWaveHeight, 4, filename,readbackBuffer);  

            } else if(calc_constants.which_surface_to_write == 9){  // Significant Wave Height
                let filename = 'current_Hs.bin';
                downloadTextureData(device, txWaveHeight, 3, filename, readbackBuffer);  

            } else if(calc_constants.which_surface_to_write == 10){  // Max Free Surface Elev 
                let filename = 'current_FSmax.bin';
                downloadTextureData(device, txMeans_Speed, 4, filename, readbackBuffer); 

            } else if(calc_constants.which_surface_to_write == 11){  // Mean Free Surface Elev 
                let filename = 'current_FSmean.bin';
                downloadTextureData(device, txMeans, 1, filename, readbackBuffer);  

            } else if(calc_constants.which_surface_to_write == 12){  // Mean Fluid Flux [E-W]
                let filename = 'current_Umean.bin';
                downloadTextureData(device, txMeans, 2, filename, readbackBuffer);  

            } else if(calc_constants.which_surface_to_write == 13){  // Mean Fluid Flux [N-S]
                let filename = 'current_Vmean.bin';
                downloadTextureData(device, txMeans, 3, filename, readbackBuffer);  
            }   

            calc_constants.write_individual_surface = 0;  // reset
        }

        // Trigger write individual surface to file
        // Reset mean surfaces
        if(calc_constants.trigger_writeWaveHeight == 1 && total_time >= calc_constants.trigger_resetMeans_time){
            console.log('Trigger write - Reseting mean surfaces')
            calc_constants.n_time_steps_means = 0;  // reset means counter - compute shader will automatically reset
            calc_constants.trigger_writeWaveHeight = 2;  // step up trigger index
        }

        // Reset mean surfaces
        if(calc_constants.trigger_writeWaveHeight == 2 && total_time >= calc_constants.trigger_resetWaveHeight_time){
            console.log('Trigger write - Reseting wave height surfaces')
            calc_constants.n_time_steps_waveheight = 0;  // reset wave height counter - compute shader will automatically reset
            calc_constants.trigger_writeWaveHeight = 3;  // step up trigger index
        }        

        // write individual surfaces to file
        if(calc_constants.trigger_writeWaveHeight == 3 && total_time >= calc_constants.trigger_writeWaveHeight_time){
            console.log('Trigger write - Writing wave height and other surfaces to file')
            
            var filename = `dx.txt`;
            await saveSingleValueToFile(calc_constants.dx,filename);
    
            filename = `dy.txt`;
            await saveSingleValueToFile(calc_constants.dy,filename);
    
            filename = `nx.txt`;
            await saveSingleValueToFile(calc_constants.WIDTH,filename);
    
            filename = `ny.txt`;
            await saveSingleValueToFile(calc_constants.HEIGHT,filename);
            
            const files = [
                { tx: txBottom,       ch: 3, filename: 'current_bathytopo.bin' },
                { tx: txWaveHeight,   ch: 4, filename: 'current_Hrms.bin'  },
                { tx: txWaveHeight,   ch: 3, filename: 'current_Hs.bin'    },
                { tx: txMeans_Speed,  ch: 4, filename: 'current_FSmax.bin'},
                { tx: txMeans_Speed,  ch: 3, filename: 'current_Speedmax.bin'},
                { tx: txMeans_Momflux,ch: 3, filename: 'current_Momfluxmax.bin'},
                { tx: txMeans,        ch: 1, filename: 'current_FSmean.bin'},
                { tx: txMeans,        ch: 2, filename: 'current_Umean.bin'},
                { tx: txMeans,        ch: 3, filename: 'current_Vmean.bin'},
                { tx: txMeans,        ch: 4, filename: 'current_Foammean.bin'},
                { tx: txMeans_Momflux,ch: 4, filename: 'current_Vorticitymean.bin'},
                { tx: txBotChange_Sed,ch: 3, filename: 'current_SedTransDepthChange.bin'},
            ];
            
            for (const {tx, ch, filename} of files) {
                await downloadTextureData(device, tx, ch, filename, readbackBuffer);
                // give the browser a breather before the next one
                await sleep(calc_constants.fileWritePause);
            }

            calc_constants.trigger_writeWaveHeight = 0;  // reset

            // write complete file
            const text_complete = "Simulation Completed";
            const blob_complete = new Blob([text_complete], { type: "text/plain" });
          
            // Create a temporary URL for the Blob
            const url_complete = URL.createObjectURL(blob_complete);
          
            // Create a temporary anchor element and trigger the download
            const a_complete = document.createElement("a");
            a_complete.href = url_complete;
            a_complete.download = "completed.txt";
            document.body.appendChild(a_complete);
            a_complete.click();
          
            // Cleanup: remove the anchor and revoke the Blob URL
            document.body.removeChild(a_complete);
            URL.revokeObjectURL(url_complete);
        }

        // when in trigger mode, write current time to file
        if(calc_constants.trigger_writeWaveHeight > 0 && frame_count % 100 * calc_constants.render_step == 0) { 
            const text_current_time = String(total_time); // Convert the float to a string
            const blob_current_time = new Blob([text_current_time], { type: "text/plain" });
            
            // Create a temporary URL for the Blob
            const url_current_time = URL.createObjectURL(blob_current_time);
            
            // Create a temporary anchor element and trigger the download
            const a_current_time = document.createElement("a");
            a_current_time.href = url_current_time;
            a_current_time.download = "current_time.txt";
            document.body.appendChild(a_current_time);
            a_current_time.click();
            
            // Cleanup: remove the anchor and revoke the Blob URL
            document.body.removeChild(a_current_time);
            URL.revokeObjectURL(url_current_time);            
        }

        // write surface data stack to file
        // if using trigger, see if surface write start / end time has been reached
        if(calc_constants.trigger_writesurface == 1 && total_time >= calc_constants.trigger_writesurface_start_time) {
            console.log('Trigger write - Start 2D surface data to file')
            calc_constants.writesurfaces = 1; // write surfaces
            calc_constants.trigger_writesurface = 2; // =2 means actively writing data
        }
        else if(calc_constants.trigger_writesurface == 2 && total_time >= calc_constants.trigger_writesurface_end_time) {
            console.log('Trigger write - Stop 2D surface data to file')
            calc_constants.writesurfaces = 0; // do not write surfaces
            calc_constants.trigger_writesurface = 0; // reset trigger
        }

        if(calc_constants.writesurfaces > 0 && calc_constants.simPause < 0){
            dt_since_last_write = dt_since_last_write + calc_constants.dt * calc_constants.render_step;

            if(dt_since_last_write >= calc_constants.dt_writesurface) {
                
                try {
                    frame_count_output = frame_count_output + 1;
                    console.log('Writing 2D surface data to file at time (s) ', total_time, ' with increment(s) ', dt_since_last_write);
                    await writeSurfaceData(total_time,frame_count_output,device,txBottom,txState,txBreaking,txModelVelocities,readbackBuffer);
                    dt_since_last_write = 0.0; // reset time counter
                } catch (error) {
                    console.error("Failed to write surface data:", error);
                }
                
            }
            
        }
        
        requestAnimationFrame(frame);  // Call the next frame, restarts the function

    }

    // Invoke the `frame` function once to start the main loop.
    await frame();
}
// end compute pipeline

/////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////

// All the functions below this are for web page UI - this is also where the wave simulation is started
document.addEventListener('DOMContentLoaded', function () {
    // Get a reference to your canvas element.
    var canvas = document.getElementById('webgpuCanvas');

    ConsoleLogRedirection();

    // Logic to make sure that only one panel can be maximized at a time
    // Turns out this is fairly complex.  Also, we store which panel is maximized
    // in the calc_constants.whichPanelisOpen
    const maximizedCounts = [];

    // Function to initialize and log the state of all panels, and enforce maximization rules
    function initializeAndManagePanels() {
        const panels = document.querySelectorAll('#horizontalbar .custom-window');
        
        // Initialize the array with zeros based on the number of panels
        panels.forEach((panel, index) => {
            maximizedCounts[index] = 0; // Initialize tracking array
            const content = panel.querySelector('.window-content');
            const isMaximized = window.getComputedStyle(content).display !== 'none';
            updateButtonLabel(panel, isMaximized);  // Update button label initially
        });
    }

    // Function to update the button label based on panel state
    function updateButtonLabel(panel, isMaximized) {
        const button = panel.querySelector('.minimize-button');
        button.textContent = isMaximized ? '-' : '+';  // Set text to '-' if maximized, '+' if minimized
    }

    // Function to update panel states and enforce only one maximized panel
    function updatePanelStates() {
        const panels = document.querySelectorAll('#horizontalbar .custom-window');
        calc_constants.whichPanelisOpen = 0;
        panels.forEach((panel, index) => {
            const content = panel.querySelector('.window-content');
            const isMaximized = window.getComputedStyle(content).display !== 'none';
            
            if (isMaximized) {
                maximizedCounts[index] += 1;  // Increment count for maximized panels
            } else {
                maximizedCounts[index] = 0;
            }

            // Check if any panel has been maximized more than once
            if (maximizedCounts[index] > 1) {
                content.style.display = 'none';  // Minimize the panel
                maximizedCounts[index] = 0;  // Reset the count after minimization
            } else if(maximizedCounts[index] == 1) {
                calc_constants.whichPanelisOpen = index;
                console.log(`Changing calc_constants.whichPanelisOpen to `, calc_constants.whichPanelisOpen );
            }

            // Update button label according to the current state
            updateButtonLabel(panel, window.getComputedStyle(content).display !== 'none');
        
        });
    }

    // Setup event listeners on minimize/maximize buttons
    function setupPanelStateListeners() {
        const buttons = document.querySelectorAll('#horizontalbar .minimize-button');
        buttons.forEach(button => {
            button.addEventListener('click', function() {
                // Delay the update slightly to let the UI change occur
                setTimeout(updatePanelStates, 10);
            });
        });
    }

    // Initialize and setup listeners
    initializeAndManagePanels();
    setupPanelStateListeners();

    // Add the event listener for 'click' events - this is for modifying bathy / various maps
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

    //    console.log("Canvas clicked/moved at X:", calc_constants.xClick, " Y:", calc_constants.yClick);
    }

    // Event listener for mousedown - start of the hold
    canvas.addEventListener('pointerdown', function (event) {
        // edit for touch screens
        // 1) disable default handling immediately
        event.preventDefault();

        // 2) capture this pointer until it's released
        canvas.setPointerCapture(event.pointerId);

        // 3) existing logic:

        if (event.button === 0 && calc_constants.viewType == 1) { // Left mouse button, Design mode
            leftMouseIsDown = true;
            handleMouseEvent(event);  // Handle the initial click
        } else if (event.button === 0 && calc_constants.viewType == 2) { // Left mouse button, Explorer mode
            leftMouseIsDown = true;
            lastMouseX_left = event.clientX;
            lastMouseY_left = event.clientY;
            calc_constants.click_update = 2;
        } else if (event.button === 2 && calc_constants.viewType == 1 && calc_constants.whichPanelisOpen == 7) { // right mouse button, Design mode for time series
            rightMouseIsDown = true;
            lastMouseX_right = event.clientX;
            lastMouseY_right = event.clientY;
            calc_constants.locationOfTimeSeries[calc_constants.changethisTimeSeries].xts = x_position;
            calc_constants.locationOfTimeSeries[calc_constants.changethisTimeSeries].yts = y_position;
            calc_constants.click_update = 2;
            calc_constants.updateTimeSeriesTx = 1;  // by setting to one, will tell timesereies shader to run and update chart
        } else if (event.button === 2 && calc_constants.viewType == 2) { // right mouse button, Explorer mode
            rightMouseIsDown = true;
            lastMouseX_right = event.clientX;
            lastMouseY_right = event.clientY;
            calc_constants.click_update = 2;
        }
    });

    // Event listener for mousemove - if mouse is down, it's equivalent to multiple clicks
    canvas.addEventListener('pointermove', function (event) {
        if (leftMouseIsDown && calc_constants.viewType == 1) {
            handleMouseEvent(event);
        } else if (leftMouseIsDown && calc_constants.viewType == 2) {
            const deltaX = event.clientX - lastMouseX_left;
            const deltaY = event.clientY - lastMouseY_left;
            const motion_inc = 0.0001 * calc_constants.forward;

            calc_constants.shift_x  += deltaX * motion_inc; // Adjust the sensitivity as needed
            calc_constants.shift_y  -= deltaY * motion_inc * calc_constants.WIDTH / calc_constants.HEIGHT; // Adjust the sensitivity as needed

            lastMouseX_left = event.clientX;
            lastMouseY_left = event.clientY;
            calc_constants.click_update = 2;
        } else if (rightMouseIsDown) {
            const deltaX = event.clientX - lastMouseX_right;
            calc_constants.rotationAngle_xy -= deltaX * 0.1; // Adjust the sensitivity as needed

            const deltaY = event.clientY - lastMouseY_right
            calc_constants.rotationAngle_xz -= deltaY * 0.1; // Adjust the sensitivity as needed

            lastMouseX_right = event.clientX;
            lastMouseY_right = event.clientY;
            calc_constants.click_update = 2;
        }
    });

    // Event listener for mouseup - end of the hold
    canvas.addEventListener('pointerup', function (event) {
        // release capture so the pointer is freed, edit for touch screens
        canvas.releasePointerCapture(event.pointerId);

        if (event.button === 0) { // Left mouse button
            leftMouseIsDown = false;
            calc_constants.click_update = 0;  // Optionally, reset the click_update here if needed
        } else if (event.button === 2) { // Right mouse button
            rightMouseIsDown = false;
            calc_constants.click_update = 0;  // Optionally, reset the click_update here if needed
        }
    });

    // To handle cases where the mouse leaves the canvas while being pressed
    canvas.addEventListener('pointerleave', function () {
        leftMouseIsDown = false;  // Consider the left mouse as no longer being held down
        rightMouseIsDown = false; // Consider the right mouse as no longer being held down
    });

    // also handle pointercancel just in case the browser forcibly cancels:
    canvas.addEventListener('pointercancel', function(event) {
        canvas.releasePointerCapture(event.pointerId);
        leftMouseIsDown = rightMouseIsDown = false;
        calc_constants.click_update = 0;
    });

    // Prevent the context menu from appearing on right-click
    canvas.addEventListener('contextmenu', function (event) {
        event.preventDefault();
    });
    // end mouse interaction functions

    // keyboard interactions
    // Event listener for keydown - to handle arrow keys for shifting
    document.addEventListener('keydown', function (event) {
        const shiftAmount = 0.001; // Change this value to shift by more or less  
        calc_constants.click_update = 2;
        switch (event.key) {
            case 'a': // 'A' key for left
            case 'A':
            case 'ArrowLeft': // Left arrow key
                calc_constants.shift_x -= shiftAmount;
                break;
            case 'd': // 'D' key for right
            case 'D':
            case 'ArrowRight': // Right arrow key
                calc_constants.shift_x += shiftAmount;
                break;
            case 'w': // 'W' key for up
            case 'W':
            case 'ArrowUp': // Up arrow key
                calc_constants.shift_y += shiftAmount;
                break;
            case 's': // 'S' key for down
            case 'S':
            case 'ArrowDown': // Down arrow key
                calc_constants.shift_y -= shiftAmount;
                break;
            case 'p': // 'P' key for pause
            case 'P':
            case 'Pause': // Pause/Break key
                if (calc_constants.simPause < 0) {
                    calc_constants.simPause = 1;
                } else {
                    calc_constants.simPause = -1;
                }
                break;
        }
    });
    // end keyboard interaction

    // mouse scroll wheel interaction
    const zoomSensitivity = 0.02;  // Adjust this value to make zoom faster or slower

    function handleZoom(event) {
        if (calc_constants.viewType !== 2) {
            // If the current view type is not 2, do nothing (or optionally, remove the event listener here)
            return;
        }
    
        if (event.cancelable) {
            event.preventDefault();
        }
    
        calc_constants.click_update = 2;
    
        // Adjust the zoom level based on the wheel delta
        if (event.deltaY < 0) {
            // Scrolling up, zoom in
            calc_constants.forward *= (1 - zoomSensitivity);
        } else if (event.deltaY > 0) {
            // Scrolling down, zoom out
            calc_constants.forward *= (1 + zoomSensitivity);
        }
    
        // Clamp the zoom level to a minimum and maximum value
        calc_constants.forward = Math.max(0.001, Math.min(100, calc_constants.forward));
    }

    function updateZoomListener() {
        if (calc_constants.viewType == 2) {
            // Add the zoom event listener only if viewType is 2
            canvas.addEventListener('wheel', handleZoom, { passive: false });
        } else {
            // Remove the zoom event listener if viewType is not 2
            canvas.removeEventListener('wheel', handleZoom, { passive: false });
        }
    }
    
    // end scroll wheel interaction


    // tooltip hover box near mouse point to display information
    const tooltip = document.getElementById('tooltip');
    
    let x_position = 0.0;
    let y_position = 0.0;
    canvas.addEventListener('mousemove', async (event) => {
        const bounds = canvas.getBoundingClientRect(); // Get the bounding rectangle of the canvas
    
        // Calculate coordinates relative to the canvas
        const x = event.clientX;
        const y = event.clientY;
        
        // Normalize the coordinates to [0, 1]
        const canvas_width = bounds.right - bounds.left;
        const canvas_height = bounds.bottom - bounds.top;
        const normalizedX = (x - bounds.left) / canvas_width; //normalizedX;
        const normalizedY = 1.0 - (y - bounds.top) / canvas_height; //normalizedY;
        
        // Update your constants for WebGPU
        //calc_constants.mouse_current_canvas_positionX = normalizedX;
        //calc_constants.mouse_current_canvas_positionY = normalizedY;
        
        calc_constants.mouse_current_canvas_indX = Math.round(normalizedX * calc_constants.WIDTH);
        calc_constants.mouse_current_canvas_indY = Math.round(normalizedY * calc_constants.HEIGHT);

        // Use WebGPU to read the data at (canvasX, canvasY)
        x_position = normalizedX * calc_constants.WIDTH * calc_constants.dx;
        y_position = normalizedY * calc_constants.HEIGHT * calc_constants.dy;
     
        // Adjust tooltip position considering the page scroll
        tooltip.style.display = 'block';
        tooltip.style.left = `${x + window.scrollX }px`; // Adjusted for page scroll
        tooltip.style.top = `${y + window.scrollY + 20}px`; // Adjusted for page scroll
        tooltip.style.backgroundColor = 'gray'; // Gray background
        tooltip.style.color = 'white'; // White text color
        tooltip.style.padding = '8px';
        tooltip.style.borderRadius = '4px';
    });
    
    function updateTooltip() {
        // Assuming x_position and y_position are updated elsewhere in your code and accessible here
        
        if (calc_constants.viewType == 1){ 
            if (calc_constants.river_sim == 1){
                let flow_depth = calc_constants.tooltipVal_eta - calc_constants.tooltipVal_bottom;
                tooltip.innerHTML = `x-coordinate (m): ${x_position.toFixed(2)}<br>y-coordinate (m): ${y_position.toFixed(2)}<br>bottom elevation (m): ${calc_constants.tooltipVal_bottom.toFixed(2)} <br>friction factor: ${calc_constants.tooltipVal_friction.toFixed(3)}<br>surface elevation (m): ${calc_constants.tooltipVal_eta.toFixed(2)} <br>flow depth (m): ${flow_depth.toFixed(2)} <br>flow speed (m/s): ${calc_constants.tooltipVal_Hs.toFixed(2)}`;    
            }
            else if (calc_constants.disturbanceType > 1) {
                tooltip.innerHTML = `x-coordinate (m): ${x_position.toFixed(2)}<br>y-coordinate (m): ${y_position.toFixed(2)}<br>bathy/topo (m): ${calc_constants.tooltipVal_bottom.toFixed(2)} <br>friction factor: ${calc_constants.tooltipVal_friction.toFixed(3)}<br>surface elevation (m): ${calc_constants.tooltipVal_eta.toFixed(2)} <br>max free surface (m): ${calc_constants.tooltipVal_Hs.toFixed(2)}`;
            }
            else {
                tooltip.innerHTML = `x-coordinate (m): ${x_position.toFixed(2)}<br>y-coordinate (m): ${y_position.toFixed(2)}<br>bathy/topo (m): ${calc_constants.tooltipVal_bottom.toFixed(2)} <br>friction factor: ${calc_constants.tooltipVal_friction.toFixed(3)}<br>surface elevation (m): ${calc_constants.tooltipVal_eta.toFixed(2)} <br>sig wave height (m): ${calc_constants.tooltipVal_Hs.toFixed(2)}`;
            }
         } else {
            tooltip.innerHTML = ``;
        }
    }
    
    // Set this function to be called every 100 milliseconds
    const updateInterval = 100; // Adjust the interval as needed
    setInterval(updateTooltip, updateInterval);

    canvas.addEventListener('mouseout', () => {
      tooltip.style.display = 'none';
    });

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
                calc_constants.whiteWaterDecayRate = 0.02;
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
        { id: 'arrow_scale-button', input: 'arrow_scale-input', property: 'arrow_scale' },
        { id: 'arrow_density-button', input: 'arrow_density-input', property: 'arrow_density' },
        { id: 'whiteWaterDecayRate-button', input: 'whiteWaterDecayRate-input', property: 'whiteWaterDecayRate' },
        { id: 'changeAmplitude-button', input: 'changeAmplitude-input', property: 'changeAmplitude' },
        { id: 'changeRadius-button', input: 'changeRadius-input', property: 'changeRadius' },
        { id: 'render_step-button', input: 'render_step-input', property: 'render_step' },
        { id: 'sedC1_d50-button', input: 'sedC1_d50-input', property: 'sedC1_d50' },
        { id: 'sedC1_n-button', input: 'sedC1_n-input', property: 'sedC1_n' },
        { id: 'sedC1_psi-button', input: 'sedC1_psi-input', property: 'sedC1_psi' },
        { id: 'sedC1_criticalshields-button', input: 'sedC1_criticalshields-input', property: 'sedC1_criticalshields' },
        { id: 'sedC1_denrat-button', input: 'sedC1_denrat-input', property: 'sedC1_denrat' },
        { id: 'disturbanceXpos-button', input: 'disturbanceXpos-input', property: 'disturbanceXpos' },
        { id: 'disturbanceYpos-button', input: 'disturbanceYpos-input', property: 'disturbanceYpos' },
        { id: 'disturbanceCrestamp-button', input: 'disturbanceCrestamp-input', property: 'disturbanceCrestamp' },
        { id: 'disturbanceDir-button', input: 'disturbanceDir-input', property: 'disturbanceDir' },
        { id: 'disturbanceWidth-button', input: 'disturbanceWidth-input', property: 'disturbanceWidth' },
        { id: 'disturbanceLength-button', input: 'disturbanceLength-input', property: 'disturbanceLength' },
        { id: 'disturbanceDip-button', input: 'disturbanceDip-input', property: 'disturbanceDip' },
        { id: 'disturbanceRake-button', input: 'disturbanceRake-input', property: 'disturbanceRake' },
        { id: 'changeXTimeSeries-button', input: 'changeXTimeSeries-input', property: 'changeXTimeSeries' },
        { id: 'changeYTimeSeries-button', input: 'changeYTimeSeries-input', property: 'changeYTimeSeries' },
        { id: 'dzdt_I_coef-button', input: 'dzdt_I_coef-input', property: 'dzdt_I_coef' },
        { id: 'dzdt_F_coef-button', input: 'dzdt_F_coef-input', property: 'dzdt_F_coef' },
        { id: 'T_star_coef-button', input: 'T_star_coef-input', property: 'T_star_coef' },
        { id: 'delta_breaking-button', input: 'delta_breaking-input', property: 'delta_breaking' },
        { id: 'whiteWaterDispersion-button', input: 'whiteWaterDispersion-input', property: 'whiteWaterDispersion' },
        { id: 'infiltrationRate-button', input: 'infiltrationRate-input', property: 'infiltrationRate' },
        { id: 'maxdurationTimeSeries-button', input: 'maxdurationTimeSeries-input', property: 'maxdurationTimeSeries' },
        { id: 'AnimGif_dt-button', input: 'AnimGif_dt-input', property: 'AnimGif_dt' },
        { id: 'JPEGstack_dt-button', input: 'JPEGstack_dt-input', property: 'JPEGstack_dt' },
        { id: 'JPEGstack_frames-button', input: 'JPEGstack_frames-input', property: 'JPEGstack_frames' },
        { id: 'designcomponent_Radius-button', input: 'designcomponent_Radius-input', property: 'designcomponent_Radius' },
        { id: 'designcomponent_Fric_Coral-button', input: 'designcomponent_Fric_Coral-input', property: 'designcomponent_Fric_Coral' },
        { id: 'designcomponent_Fric_Oyser-button', input: 'designcomponent_Fric_Oyser-input', property: 'designcomponent_Fric_Oyser' },
        { id: 'designcomponent_Fric_Mangrove-button', input: 'designcomponent_Fric_Mangrove-input', property: 'designcomponent_Fric_Mangrove' },
        { id: 'designcomponent_Fric_Kelp-button', input: 'designcomponent_Fric_Kelp-input', property: 'designcomponent_Fric_Kelp' },
        { id: 'designcomponent_Fric_Grass-button', input: 'designcomponent_Fric_Grass-input', property: 'designcomponent_Fric_Grass' },
        { id: 'designcomponent_Fric_Scrub-button', input: 'designcomponent_Fric_Scrub-input', property: 'designcomponent_Fric_Scrub' },
        { id: 'designcomponent_Fric_RubbleMound-button', input: 'designcomponent_Fric_RubbleMound-input', property: 'designcomponent_Fric_RubbleMound' },
        { id: 'designcomponent_Fric_Dune-button', input: 'designcomponent_Fric_Dune-input', property: 'designcomponent_Fric_Dune' },
        { id: 'designcomponent_Fric_Berm-button', input: 'designcomponent_Fric_Berm-input', property: 'designcomponent_Fric_Berm' },
        { id: 'designcomponent_Fric_Seawall-button', input: 'designcomponent_Fric_Seawall-input', property: 'designcomponent_Fric_Seawall' },
        { id: 'changeSeaLevel-button', input: 'changeSeaLevel-input', property: 'changeSeaLevel' },
        { id: 'dt_writesurface-button', input: 'dt_writesurface-input', property: 'dt_writesurface' },
        { id: 'incident_wave_H-button', input: 'incident_wave_H-input', property: 'incident_wave_H' },
        { id: 'incident_wave_T-button', input: 'incident_wave_T-input', property: 'incident_wave_T' },
        { id: 'incident_wave_direction-button', input: 'incident_wave_direction-input', property: 'incident_wave_direction' },
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
        { input: 'disturbanceType-select', property: 'disturbanceType' },
        { input: 'NumberOfTimeSeries-select', property: 'NumberOfTimeSeries' },
        { input: 'changethisTimeSeries-select', property: 'changethisTimeSeries' },
        { input: 'useBreakingModel-select', property: 'useBreakingModel' },
        { input: 'designcomponentToAdd-select', property: 'designcomponentToAdd' },
        { input: 'ShowArrows-select', property: 'ShowArrows' },
        { input: 'ShowLogos-select', property: 'ShowLogos' },
        { input: 'write_eta-select', property: 'write_eta' },
        { input: 'write_P-select', property: 'write_P' },
        { input: 'write_Q-select', property: 'write_Q' },
        { input: 'write_turb-select', property: 'write_turb' },
        { input: 'which_surface_to_write-select', property: 'which_surface_to_write' },
        { input: 'incident_wave_type-select', property: 'incident_wave_type' },
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
        
        let grid_ratio = calc_constants.dx / calc_constants.dy;
        if (document.fullscreenElement) {
            const window_width = window.innerWidth;
            const window_height = window.innerHeight;

            // canvas_width_ratio and height will be updated at render time
            
            canvas.width = window_width;
            canvas.height = window_height;
        } else {
            // Set canvas size back to normal when exiting full screen
            if (grid_ratio >= 1.0) {
                canvas.width = Math.ceil(calc_constants.WIDTH/64*grid_ratio)*64;  // width needs to have a multiple of 256 bytes per row.  Data will have four channels (rgba), so mulitple os 256/4 = 64;
                canvas.height = Math.round(calc_constants.HEIGHT * canvas.width / calc_constants.WIDTH / grid_ratio);
                calc_constants.canvas_width_ratio = 1/grid_ratio;
                calc_constants.canvas_height_ratio = 1.0; 
            }
            else {
                canvas.width = Math.ceil(calc_constants.WIDTH/64)*64;  // width needs to have a multiple of 256 bytes per row.  Data will have four channels (rgba), so mulitple os 256/4 = 64;
                canvas.height = Math.round(calc_constants.HEIGHT * canvas.width / calc_constants.WIDTH / grid_ratio);
                calc_constants.canvas_width_ratio = grid_ratio;
                calc_constants.canvas_height_ratio = 1.0; 
            }
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
        updateZoomListener(); // Ensure the listener state matches the new viewType, turns on/off scrolling over canvas
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

    // listener for renderstep change - if new value is > 0 then do not try to automatically find best step render_step
    document.getElementById('render_step-button').addEventListener('click', function () {
        if(calc_constants.render_step > 0){
            calc_constants.setRenderStep = 1;  // by setting to one, render step will not change
        }
        else {
            calc_constants.setRenderStep = 0;  
        }
    });

    // listener for overlay option change
    document.getElementById('GoogleMapOverlay-select').addEventListener('change', function () {
        calc_constants.OverlayUpdate = 1;  // triggers logic to update transforms for the two overlay options
    });    
    
    // if changing sea level, make sure surfaceToChange == 1 (bathy / topo)
    document.getElementById('changeSeaLevel-button').addEventListener('click', function () {
        calc_constants.click_update = 1; // trigger click update block so txBottom gets updated
        calc_constants.surfaceToChange = 1;  // by setting to one, will tell timesereies shader to run
        calc_constants.changeSeaLevel_delta = calc_constants.changeSeaLevel - calc_constants.changeSeaLevel_current;
        calc_constants.changeSeaLevel_current = calc_constants.changeSeaLevel;        
    });
    
    // add time series listener, to update time series location texture changeXTimeSeries-button
    document.getElementById('changeXTimeSeries-button').addEventListener('click', function () {
        calc_constants.locationOfTimeSeries[calc_constants.changethisTimeSeries].xts = calc_constants.changeXTimeSeries;
        calc_constants.updateTimeSeriesTx = 1;  // by setting to one, will tell timesereies shader to run
    });
    document.getElementById('changeYTimeSeries-button').addEventListener('click', function () {
        calc_constants.locationOfTimeSeries[calc_constants.changethisTimeSeries].yts = calc_constants.changeYTimeSeries;
        calc_constants.updateTimeSeriesTx = 1;  // by setting to one, will tell timesereies shader to run
    });
    document.getElementById('NumberOfTimeSeries-select').addEventListener('change', function () {
        calc_constants.chartDataUpdate = 1;  // Indicate that the number of time series changed, need to update chart legends, etc.
    });

    // add remove scroll wheel functionality
    document.getElementById('viewType-select').addEventListener('change', function () {
        updateZoomListener(); // Ensure the listener state matches the new viewType
    });


    // Add disturbance button
    document.getElementById('disturbance-button').addEventListener('click', function () {
        calc_constants.add_Disturbance = 1;  // by setting to one, will add disturbance at start of next time step
        calc_constants.chartDataUpdate = 1;  // update time vector on chart to be zero when adding impluse
    });


    // Download jpg of screen output
    document.getElementById('downloadJPG-button').addEventListener('click', function () {
        saveRenderedImageAsJPEG(device, txScreen, canvas.width, canvas.height);
    });
    

    // Create animated gif
    document.getElementById('createGIF-button').addEventListener('click', function () {
        calc_constants.create_animation = 1;  //triggers save animation logic
    });
    

    // Save time stack of jpgs
    document.getElementById('createJPGstack-button').addEventListener('click', function () {
        calc_constants.create_animation = 2;  //triggers save jpegs logic
    });    

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


    // Download channel from specified texture
    document.getElementById('downloadSingleSurface-button').addEventListener('click', function () {
        calc_constants.write_individual_surface = 1;  // write surface to file
    });


    // Save 2D data to file START - start2Dwrite-button
    document.getElementById('start2Dwrite-button').addEventListener('click', function () {
        calc_constants.writesurfaces = 1;  // start writing 2D data to file
    });

    // Save 2D data to file STOP - stop2Dwrite-button
    document.getElementById('stop2Dwrite-button').addEventListener('click', function () {
        calc_constants.writesurfaces = 0;  // stop writing 2D data to file
    });

    // start simulation

    // Ensure to bind this function to your button's 'click' event in the HTML or here in the JS.
    document.getElementById('start-simulation-btn').addEventListener('click', function () {  // running with user loaded files
        calc_constants.run_example = -1;  // reset back to no example (for case when loading files after running example)
        startSimulation(); 
        const delay = 5000; // Time in milliseconds (1000 ms = 1 second)
        setTimeout(updateAllUIElements, delay);
    });

    // run example simulation

    // Ensure to bind this function to your button's 'click' event in the HTML or here in the JS.
    document.getElementById('run-example-simulation-btn').addEventListener('click', function () {  // running with user example files
        calc_constants.run_example = document.getElementById('run_example-select').value;
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
        var etaInitialConditionFile = document.getElementById('etaInitialConditionFile').files[0];
        var frictionFile = document.getElementById('frictionmapFile').files[0];
        var hardbottomFile = document.getElementById('hardbottomFile').files[0];
        var OverlayFile = document.getElementById('satimageFile').files[0];
        var modelFile = document.getElementById('modelFile').files[0];
    
        // Check if the required files are not uploaded
        if (!configFile || !bathymetryFile) {
            alert("Please upload all the required files.");
            return;  // Stop here.
        }
    
        // Create FileReader objects to read the content of the files
        var configReader = new FileReader();
        var bathymetryReader = new FileReader();
        var waveReader = new FileReader();
    
        // Setup of the FileReader callbacks to handle the data after files are read
        configReader.onload = function (e) {
            var configContent = e.target.result;
    
            bathymetryReader.onload = function (e) {
                var bathymetryContent = e.target.result;
    
                // Check if a wave file was uploaded, otherwise load a default
                if (!waveFile) {
                    // Load default wave file if none provided
                    fetch('/no_waves.txt')
                        .then(response => response.text())
                        .then(defaultWaveContent => {
                            startSimulationWithWave(configContent, bathymetryContent, defaultWaveContent, OverlayFile, modelFile, etaInitialConditionFile, frictionFile, hardbottomFile);
                        })
                        .catch(error => {
                            console.error("Failed to load the default wave file:", error);
                        });
                } else {
                    waveReader.onload = function (e) {
                        var waveContent = e.target.result;
                        startSimulationWithWave(configContent, bathymetryContent, waveContent, OverlayFile, modelFile, etaInitialConditionFile, frictionFile, hardbottomFile);
                    };
                    waveReader.readAsText(waveFile);
                }
            };
    
            bathymetryReader.readAsText(bathymetryFile);
        };
    
        configReader.readAsText(configFile);
    }
    
    function startSimulationWithWave(configContent, bathymetryContent, waveContent, OverlayFile, modelFile, etaInitialConditionFile, frictionFile, hardbottomFile) {
        // Here you could do the actual simulation initialization
    //    console.log("Starting simulation with the following data:");
    //    console.log("Config:", configContent);
    //    console.log("Bathymetry:", bathymetryContent);
    //    console.log("Wave:", waveContent);
    //    console.log("Overlay:", OverlayFile);
    
        // Initialize your WebGPU application here
        initializeWebGPUApp(configContent, bathymetryContent, waveContent, OverlayFile, modelFile, etaInitialConditionFile, frictionFile, hardbottomFile).catch(error => {
             console.error("Initialization failed:", error);
        });
    }
    

});
// end web GUI code

// the code below is for the time series plotting, using Chart.js
const ctx = document.getElementById('timeseriesChart').getContext('2d');

// Function to generate a unique color for each dataset
function getBorderColor(index) {
  const colors = [
    'rgb(75, 192, 192)',
    'rgb(255, 99, 132)',
    'rgb(54, 162, 235)',
    'rgb(255, 206, 86)',
    'rgb(75, 192, 75)',
    'rgb(153, 102, 255)',
    'rgb(255, 159, 64)',
    'rgb(199, 199, 199)',
    'rgb(83, 102, 255)',
    'rgb(40, 159, 64)',
    'rgb(210, 45, 0)',
    'rgb(0, 128, 128)',
    'rgb(128, 0, 128)',
    'rgb(128, 128, 0)',
    'rgb(0, 0, 128)'
  ];

  return colors[index % colors.length]; // Cycle through colors if more than 15 locations
}

// Dynamically create datasets for each location
let datasets = timeSeriesData.slice(0, calc_constants.NumberOfTimeSeries).map((location, index) => ({
  label: `Location ${index+1}`,
  data: location.eta,
  borderColor: getBorderColor(index),
  borderWidth: 1,
  fill: false,
  tension: 0.4,
  pointRadius: 0
}));

const timeseriesChart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: timeSeriesData[0].time, // Assuming the time vector is the same for all locations
        datasets: datasets
    },
    options: {
        scales: {
            x: {
                type: 'linear',
                position: 'bottom',
                min: 0,
                max: calc_constants.maxdurationTimeSeries,
                ticks: {
                    stepSize: calc_constants.maxdurationTimeSeries / 20.,
                },
                title: {
                    display: true,
                    text: 'Time (s)'
                }
            },
            y: {
                title: {
                    display: true,
                    text: 'Elevation (m)'
                },
                beginAtZero: true
            }
        },
        animation: {
            duration: 0
        },
        hover: {
            animationDuration: 0
        },
        responsiveAnimationDuration: 0,
    }
});


// Function to update chart data
async function updateChartData() {
    // Check if there's a need to update the chart data based on the flag
    if(calc_constants.chartDataUpdate == 1){
        // Regenerate datasets for the new number of time series
        const newDatasets = timeSeriesData.slice(0, calc_constants.NumberOfTimeSeries).map((location, index) => ({
            label: `Location ${index+1}`,
            data: location.eta,
            borderColor: getBorderColor(index),
            borderWidth: 1,
            fill: false,
            tension: 0.4,
            pointRadius: 0
        }));

        // Apply the new datasets to the chart
        timeseriesChart.data.datasets = newDatasets;
        calc_constants.chartDataUpdate = 0; // Reset the update flag
    } else if (calc_constants.NumberOfTimeSeries > 0) {
        // If no new datasets but data might have been updated
        timeseriesChart.data.datasets.forEach((dataset, index) => {
            if(timeSeriesData[index]) { // Ensure there's corresponding data
                dataset.data = timeSeriesData[index].eta; // Update existing dataset data
            }
        });
    }

    // Always update the labels and x-axis limit to reflect any changes in the time vector or chart configuration
    timeseriesChart.data.labels = timeSeriesData[0].time;
    timeseriesChart.options.scales.x.max = calc_constants.maxdurationTimeSeries;

    // Dynamically adjust the stepSize if needed
    const desiredNumberOfTicks = 20; // Example: aim for 10 ticks
    const range = calc_constants.maxdurationTimeSeries - 0; // Assuming min is 0
    const stepSize = range / desiredNumberOfTicks;
    timeseriesChart.options.scales.x.ticks.stepSize = stepSize;

    // Update the chart to apply changes
    timeseriesChart.update();
}

// Set an interval to update the chart every second (1000 milliseconds)
setInterval(updateChartData, 1000);

