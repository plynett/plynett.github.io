// constants_load_calc.js
    //
var timeSeriesData = [];
for (let i = 0; i < 16; i++) {
    timeSeriesData.push({
        time: [],
        eta: [],
        P: [],
        Q: []
    });
}  

// set simulation parameters to default values
var calc_constants = {
    // Computational domain dimensions
    WIDTH: 800,  // Width of the computational domain.
    HEIGHT: 600,  // Height of the computational domain.

    // Grid cell dimensions
    dx: 1.0,  // Cell size in the x direction.
    dy: 1.0,  // Cell size in the y direction.

    // Time-stepping parameters
    Courant_num: 0.15,  // Target Courant number. ~0.25 for P-C, ~0.05 for explicit methods.
    timeScheme: 2,  // Time integration choices: 0: Euler, 1: 3rd-order A-B predictor, 2: A-B 4th-order predictor+corrector.
    pred_or_corrector: 1,  // variable which tells render loop which stage solver is in

    // Wave model parameters
    NLSW_or_Bous: 0,  // Choose 0 for Non-linear Shallow Water (NLSW) or 1 for Boussinesq.
    Bcoef: 1.0 / 15.0,  // Dispersion parameter, 1/15 is optimum value for this set of equations.

    // Physical parameters
    g: 9.80665,  // Gravitational constant.
    seaLevel: 0.0,  // Water level shift from given datum - depreciated - no longer used
    base_depth: 20.0,  // characteristic_depth (m), used to estimate time step, use depth in area of wave generation, or expected largest depth in domain.
    Theta: 2.0,  // Midmod limiter parameter. 1.0 most dissipative(upwind) to 2.0 least dissipative(centered).
    friction: 0.000,  // Dimensionless friction coefficient, or Mannings 'n', depending on isManning choice.
    isManning: 0,  // A boolean friction model value, if==1 'friction' is a Mannnigs n, otherwise it is a dimensionless friction factor (Moody).
    min_allowable_depth: 0.005, // min depth allowable, too large and runup accuracy is poor, too small and precision issues lead to model blowup (1/0)

    // breaking model parameters
    useBreakingModel: 1, // inlcude breaking model when == 1
    delta_breaking: 2.0,  // eddy viscosity coefficient
    T_star_coef: 5.0,  // defines length of time until breaking becomes fully developed
    dzdt_I_coef: 0.50,  // start breaking parameter
    dzdt_F_coef: 0.15,  // end breaking parameter

    // Boundary condition parameters
    west_boundary_type: 0,  // Type of boundary condition at the west boundary. 0: solid wall, 1 :sponge layer, 2: waves loaded from file, created by spectrum_2D.
    east_boundary_type: 0,  // Type of boundary condition at the east boundary. 0: solid wall, 1 :sponge layer, 2: waves loaded from file, created by spectrum_2D.
    south_boundary_type: 0,  // Type of boundary condition at the south boundary. 0: solid wall, 1 :sponge layer, 2: waves loaded from file, created by spectrum_2D.
    north_boundary_type: 0,  // Type of boundary condition at the north boundary. 0: solid wall, 1 :sponge layer, 2: waves loaded from file, created by spectrum_2D.
    BoundaryWidth: 20, //  number of grid points for sponge layer
    incident_wave_type: -1, // 0 Sine Wave (single harmonic); 1 TMA Spectrum; 2 Transient Pulse (4 waves); 3 Solitary Wave; -1 Custom Spectum from loaded file; 5 Time Series from loaded file

    // generic wave parameters used for debug 
    amplitude: 0.0,
    period: 10.0,
    direction: 0.0,
    rand_phase: 0.0,

    // incident wave properties
    incident_wave_H: 0,  // Height (m) of Sine Wave / Pulse / Solitary Wave, or Significant Wave Height of Spectrum
    incident_wave_T: 0,  //Period (sec) of Sine Wave / Pulse, or Peak Period of Spectrum [not used for Solitary Wave]
    incident_wave_direction: 0,  // Wave Direction (deg CCW from E [-180 to 180])
    numberOfWaves: 0, // number of wave components to be created

    // Vessel motion parameters (initial development)
    ship_posx: -100.0,  // initial ship position, if initially inside domain, the initial free surface must include the ship displacement 
    ship_posy: 450.0,
    ship_width: 10.0,  // ship beam
    ship_length: 30.0,  // ship length
    ship_draft: 2.0,  // max draft in m
    ship_heading: 0.0,  // 0=moving to the east

    // Sediment transport parameters
    useSedTransModel: 0, // sed model on or off [0]
    sedC1_d50: 0.2,   // D50 for Class 1 sed
    sedC1_n: 0.40,   // porosity for Class 1 sed
    sedC1_psi: 0.00005,   // psi for Class 1 sed
    sedC1_criticalshields: 0.045,   // critical shields for Class 1 sed
    sedC1_denrat: 2.65,   // desnity sed / desnity water for Class 1 sed

    // River sim parameters
    river_sim: 0, // equal to oneif running a river simulation, using river.html

    //  add disturbence parameters
    add_Disturbance: -1, // will be changed to 1 when user clicks "Add"
    disturbanceType: 1, // for various choices, 1= solitary wave, etc.
    disturbanceXpos: 0.0,
    disturbanceYpos: 0.0,
    disturbanceCrestamp: 0.0,
    disturbanceDir: 0.0,
    disturbanceWidth: 0.0,
    disturbanceLength: 0.0,
    disturbanceDip: 0.0,
    disturbanceRake: 0.0,

    // define which "Example" to run
    run_example: 0, // index corresponding to examples below
    exampleDirs: [
        "./examples/Ventura/",
        "./examples/Santa_Cruz/",
        "./examples/Santa_Cruz_tsunami/",
        "./examples/Barry_Arm/",
        "./examples/Crescent_City/",
        "./examples/DuckFRF_NC/",
        "./examples/Greenland/",
        "./examples/Half_Moon_Bay/",
        "./examples/Hania_Greece/",
        "./examples/Miami_Beach_FL/",
        "./examples/Miami_FL/",
        "./examples/Newport_OR/",
        "./examples/POLALB/",
        "./examples/SantaBarbara/",
        "./examples/Taan_fjord/",
        "./examples/OSU_WaveBasin/",
        "./examples/SF_Bay_tides/",
        "./examples/OSU_Seaside/",
        "./examples/Scripps_Pier/",
        "./examples/Scripps_Canyon/",
        "./examples/Newport_Jetties_CA/",
        "./examples/Waimea_Bay/",
        "./examples/Tyndall_FL/",
        "./examples/Mavericks/",
        "./examples/Ipan_Guam/",
        "./examples/Balboa_Pier_CA/",
        "./examples/Blacks_Beach_CA/",
        "./examples/Hermosa_Beach_CA/",
        "./examples/Morro_Rock_CA/",
        "./examples/Pacifica_CA/",
        "./examples/Toy_Config/",
        "./examples/Harrison_Lake/",
        "./examples/LA_River_Model/",
        "./examples/Oceanside_CA/",
        "./examples/Portage_Lake_AK/",
        "./examples/Greenland_Umanak/"
      ],

    // plotting parameters
    colorVal_max: 1.0,  // value that maps to the "highest" color
    colorVal_min: -1.0,  // value that maps to the "lowest" color
    colorMap_choice: 0,  // decision variable for the colormap to use during rendering
    surfaceToPlot: 0, // which surface (eta, u, v, vort) to plot
    showBreaking: 1,  //  show breaking (foam) areas when ==1
    dissipation_threshold: 0.2, // wave slope for breaking 
    whiteWaterDecayRate: 0.02, // "turbulence" decay rate   
    whiteWaterDispersion: 0.1, // "turbulence" dispersion
    infiltrationRate: 0.001, // dry beach infiltration rate
    ShowLogos: 0, // show USC and ERDC logos
    GoogleMapOverlay: 0, // load satellite image and plot over dry land, requires proper values of lat,lon at lower left and upper right corners
    IsOverlayMapLoaded: 0, // = 0 if not loaded, change to one if already loaded
    IsGMMapLoaded: 0, // = 0 if not loaded, change to one if already loaded
    IsSatMapLoaded: 0, // = 0 if not loaded, change to one if already loaded
    OverlayUpdate: 0, // = 1 when changed in GUI, triggers logic to update overlay transforms
    GMapImageWidth: 512,  // number of pixels in google maps image width
    GMapImageHeight: 512,  // number of pixels in google maps image height
    GMscaleX: 1.0, // x-direction scaling factor to make google maps image align with numerical domain
    GMscaleY: 1.0, // y-direction scaling factor to make google maps image align with numerical domain
    GMoffsetX: 0.0,  // x-direction offset for google map image
    GMoffsetY: 0.0,  // y-direction offset for google map image
    lat_LL: 0, // latitude at lower left corner
    lon_LL: 0, // longitude at lower left corner
    lat_UR: 0, // latitude at upper right corner
    lon_UR: 0, // longitude at upper right corner
    render_step: 1, // number of compute steps to run for every render step, the biggest the number the choppier the viz, but also the faster it runs
    setRenderStep: 0, // flag to automatically find best render_step when = 0
    simPause: -1, // check variable, simulation is paused when this value is =1, running when = -1
    html_update: -1,  // check variable - if the user has updated ANY parameter from the interface, =1, and buffers are updated
    n_time_steps_means: 0,  // time steps counter for means calculation
    n_time_steps_waveheight: 0, // time steps counter for wave height calculation
    save_baseline: 0, // store baseline wave height texture when = 1
    countTimeSeries: 0, // count of points stored in time series
    durationTimeSeries: 0., // current time series duration
    maxdurationTimeSeries: 120., // time series duration to plot, time series resets after this time.
    maxNumberOfTimeSeries: 16, // max number of time series allowed, inlcuding tooltip, if greater than 16, need to update readToolTipTextureData bytesperrow.  SHould be 16*N time series
    NumberOfTimeSeries: 0, //  number of time series right now
    changethisTimeSeries: 1, // changing location of this time series
    changeXTimeSeries: 0.0,  // updated x-coordinate of time series
    changeYTimeSeries: 0.0,  // updated y-coordinate of time series
    updateTimeSeriesTx: 0, // set to one to update time series locations texture
    chartDataUpdate: 0, // update the chart dataset if == 1
    locationOfTimeSeries: [  // coordinates of time series.  If change to >16, probably need to make this loop driven
        { xts: 0.0, yts: 0.0 },  // first index is used by the tooltip, so only maxNumberOfTimeSeries-1 time series 
        { xts: 0.0, yts: 0.0 },
        { xts: 0.0, yts: 0.0 },
        { xts: 0.0, yts: 0.0 },
        { xts: 0.0, yts: 0.0 },
        { xts: 0.0, yts: 0.0 },
        { xts: 0.0, yts: 0.0 },
        { xts: 0.0, yts: 0.0 },
        { xts: 0.0, yts: 0.0 },
        { xts: 0.0, yts: 0.0 },
        { xts: 0.0, yts: 0.0 },
        { xts: 0.0, yts: 0.0 },
        { xts: 0.0, yts: 0.0 },
        { xts: 0.0, yts: 0.0 },
        { xts: 0.0, yts: 0.0 },
        { xts: 0.0, yts: 0.0 }
      ],

    // canvas interaction parameters
    xClick: 0, // pixel coordinate of x-click
    yClick: 0, // pixel coordinate of y-click
    click_update: -1,   // check variable - if the user has clicked on the canvas =1, and surfaces are updated as specified
    changeSeaLevel: 0.0, // most recent user specified cumulative change in sea level
    changeSeaLevel_current: 0.0, // current change in sea level - the change currently in txBottom
    changeSeaLevel_delta: 0.0, // changeSeaLevel - changeSeaLevel_current
    surfaceToChange: 1, // which surface to change (bathy, friction)
    clearConc: 0, // will clear the concentration channel if = 1
    changeType: 1, // Change Property Continuously (1) or Set to Specific Value (2)
    changeRadius: 1, // lengthscale of change function, in meters
    changeAmplitude: 1, // amplitude of change function, in units of the surfaceToChange
    viewType: 1, // 1 = plan-view design mode, 2 = 3D explorer mode
    rotationAngle_xy: 0.0, // rotation angle of 2D plane
    shift_x: 0.0, // x shift of 2D plane
    shift_y: 0.0, // y shift of 2D plane
    forward: 1.0, // zoom in/out of 2D plane
    full_screen: 0, // = 0 regular, = 1 in fullscreen
    canvas_width_ratio: 1.0, // for full screen asepct ratio correction
    canvas_height_ratio: 1.0, // for full screen asepct ratio correction
    mouse_current_canvas_positionX: 0.0, // for tooltip hover
    mouse_current_canvas_positionY: 0.0, // for tooltip hover
    mouse_current_canvas_indX: 0, // for tooltip hover
    mouse_current_canvas_indY: 0, // for tooltip hover
    tooltipVal_eta: 0.0, // tooltip value 1
    tooltipVal_bottom: 0.0, // tooltip value 2
    tooltipVal_Hs: 0.0, // tooltip value 3
    tooltipVal_friction: 0.0, // tooltip value 4
    whichPanelisOpen: 0, // tracks which GUI panel is currently maximized
    designcomponentToAdd: 1,  // which component to add
    designcomponent_Radius: 100.0, // radius of addition for surface cover components
    designcomponent_Friction: 0.0, // friction factor of the component currently being added
    designcomponent_Fric_Coral: 0.1, // Coral Reef  friction factor
    designcomponent_Fric_Oyser: 0.035, // Mussel/Oyster Bed friction factor
    designcomponent_Fric_Mangrove: 0.15, // Mangroves friction factor
    designcomponent_Fric_Kelp: 0.025, // Kelp friction factor
    designcomponent_Fric_Grass: 0.03, // Grass friction factor
    designcomponent_Fric_Scrub: 0.075, // shrub/scrub friction factor
    designcomponent_Fric_RubbleMound: 0.04, // Rubblemound Structure friction factor
    designcomponent_Fric_Dune: 0.03, // Vegetated Dune friction factor
    designcomponent_Fric_Berm: 0.02, // Berm / Temporary Dune friction factor
    designcomponent_Fric_Seawall: 0.02, // Seawall  friction factor

    // save data parameters
    create_animation: 0, // create animated gif when = 1
    AnimGif_dt: 0.25, // time between animated gif frames
    JPEGstack_dt: 1.0,  // time between images in jpeg stack
    JPEGstack_frames: 10,  // total number of frames to save in jpg stack
    writesurfaces: 0,  //flag for writing 2D data to file
    write_eta: 1, // flag for writing eta surface data to file, write when = 1
    write_P: 0, // flag for writing x flux surface data to file, write when = 1
    write_Q: 0, // flag for writing y flux surface data to file, write when = 1
    write_turb: 0, // flag for writing eddy visc surface data to file, write when = 1
    dt_writesurface: 1.0, // incrememnt to write to file 
    fileWritePause: 100, // time (ms) to pause during 2D surface write to not overload write buffer
    write_individual_surface: 0, // flag to write individual 2D surface
    which_surface_to_write: 0  // flag for which surface to write 

};

// load the control file
let loadedConfig = null;
async function loadConfig() {
    try {
        const filePath = calc_constants.exampleDirs[calc_constants.run_example] + 'config.json';
        const response = await fetch(filePath);
        if (!response.ok) {
            throw new Error("HTTP error " + response.status);
        }
        loadedConfig = await response.json();
        calc_constants = { ...calc_constants, ...loadedConfig };
        
        console.log("Server side example config.json loaded successfully.");
    } catch (error) {
        console.error("Failed to load configuration:", error);
    }
}

// set the control parameters
async function init_sim_parameters(canvas, configContent) {

    // Try to parse the JSON content
    try {
        var configJson = JSON.parse(configContent);

        // Here, you can handle the configJson object similarly to how you did in your loadConfig function.
        // Assuming loadedConfig and calc_constants are accessible in this scope.
        loadedConfig = configJson;
        calc_constants = { ...calc_constants, ...loadedConfig };
        console.log("Config loaded successfully from the uploaded file.");

    } catch (error) {
        console.log("Loading server side config.json file");
        await loadConfig();  // for the json to be loaded
    }

    // Add/update parameters in calc_constants
    calc_constants.dt = calc_constants.Courant_num * Math.min(calc_constants.dx,calc_constants.dy) / Math.sqrt(calc_constants.g * calc_constants.base_depth);
    calc_constants.TWO_THETA = calc_constants.Theta * 2.0;
    calc_constants.half_g = calc_constants.g / 2.0;
    calc_constants.Bcoef_g = calc_constants.Bcoef * calc_constants.g;
    calc_constants.g_over_dx = calc_constants.g / calc_constants.dx;
    calc_constants.g_over_dy = calc_constants.g / calc_constants.dy;
    calc_constants.one_over_dx = 1.0 / calc_constants.dx;
    calc_constants.one_over_dy = 1.0 / calc_constants.dy;
    calc_constants.one_over_d2x = calc_constants.one_over_dx * calc_constants.one_over_dx;
    calc_constants.one_over_d3x = calc_constants.one_over_d2x * calc_constants.one_over_dx;
    calc_constants.one_over_d2y = calc_constants.one_over_dy * calc_constants.one_over_dy;
    calc_constants.one_over_d3y = calc_constants.one_over_d2y * calc_constants.one_over_dy;
    calc_constants.one_over_dxdy = calc_constants.one_over_dx * calc_constants.one_over_dy;
    calc_constants.delta = Math.min(calc_constants.min_allowable_depth,calc_constants.base_depth / 5000.0);
    calc_constants.epsilon = Math.pow(calc_constants.delta, 2);
    calc_constants.PI = Math.PI;
    calc_constants.boundary_epsilon = calc_constants.epsilon;
    calc_constants.boundary_nx = calc_constants.WIDTH - 1;
    calc_constants.boundary_ny = calc_constants.HEIGHT - 1;
    calc_constants.reflect_x = 2 * (calc_constants.WIDTH - 3);
    calc_constants.reflect_y = 2 * (calc_constants.HEIGHT - 3);
    calc_constants.boundary_shift =  4;
    calc_constants.boundary_g = calc_constants.g;
    calc_constants.Px = Math.ceil(Math.log(calc_constants.WIDTH)  / Math.log(2));
    calc_constants.Py = Math.ceil(Math.log(calc_constants.HEIGHT) / Math.log(2));

    calc_constants.exampleDirs = [
        "./examples/Ventura/",
        "./examples/Santa_Cruz/",
        "./examples/Santa_Cruz_tsunami/",
        "./examples/Barry_Arm/",
        "./examples/Crescent_City/",
        "./examples/DuckFRF_NC/",
        "./examples/Greenland/",
        "./examples/Half_Moon_Bay/",
        "./examples/Hania_Greece/",
        "./examples/Miami_Beach_FL/",
        "./examples/Miami_FL/",
        "./examples/Newport_OR/",
        "./examples/POLALB/",
        "./examples/SantaBarbara/",
        "./examples/Taan_fjord/",
        "./examples/OSU_WaveBasin/",
        "./examples/SF_Bay_tides/",
        "./examples/OSU_Seaside/",
        "./examples/Scripps_Pier/",
        "./examples/Scripps_Canyon/",
        "./examples/Newport_Jetties_CA/",
        "./examples/Waimea_Bay/",
        "./examples/Tyndall_FL/",
        "./examples/Mavericks/",
        "./examples/Ipan_Guam/",
        "./examples/Balboa_Pier_CA/",
        "./examples/Blacks_Beach_CA/",
        "./examples/Hermosa_Beach_CA/",
        "./examples/Morro_Rock_CA/",
        "./examples/Pacifica_CA/",
        "./examples/Toy_Config/",
        "./examples/Harrison_Lake/",
        "./examples/LA_River_Model/",
        "./examples/Oceanside_CA/",
        "./examples/Portage_Lake_AK/",
        "./examples/Greenland_Umanak/"
      ],

    calc_constants.setRenderStep = 0; // sim always starts trying to find best render step, eases into simulation

    calc_constants.n_write_interval = Math.ceil(calc_constants.write_dt / calc_constants.dt);
    calc_constants.write_dt = calc_constants.n_write_interval * calc_constants.dt;
    calc_constants.n_writes = Math.floor((calc_constants.end_write_time - calc_constants.start_write_time) / calc_constants.write_dt) + 1;

    calc_constants.ThreadX = 16;
    calc_constants.ThreadY = 16;
    calc_constants.DispatchX = Math.ceil(calc_constants.WIDTH / calc_constants.ThreadX);
    calc_constants.DispatchY = Math.ceil(calc_constants.HEIGHT / calc_constants.ThreadY);

    calc_constants.ship_c1a = 1.0 / (2.0 * Math.pow(calc_constants.ship_length / Math.PI, 2));
    calc_constants.ship_c1b = 1.0 / (2.0 * Math.pow(calc_constants.ship_width / Math.PI, 2));
    calc_constants.ship_c2 = (-1.0 / (4.0 * Math.pow(calc_constants.ship_length / Math.PI, 2))) + (1.0 / (4.0 * Math.pow(calc_constants.ship_width / Math.PI, 2)));
    calc_constants.ship_c3a = 1.0 / (2.0 * Math.pow(calc_constants.ship_length / Math.PI, 2));
    calc_constants.ship_c3b = 1.0 / (2.0 * Math.pow(calc_constants.ship_width / Math.PI, 2));
    calc_constants.elapsedTime = 0.0;
    calc_constants.elapsedTime_update = 0.0;
    calc_constants.changeRadius = 50. * calc_constants.dx;
    calc_constants.changeAmplitude = 0.1 * calc_constants.base_depth;

    calc_constants.sedC1_erosion = calc_constants.sedC1_psi*Math.pow(calc_constants.sedC1_d50/1000.,-0.2);
    calc_constants.sedC1_shields = 1.0 / ( (calc_constants.sedC1_denrat - 1.0) * 9.81 * calc_constants.sedC1_d50/1000.);
    let fall_vel_a = 4.0 / 3.0 * 9.81 * calc_constants.sedC1_d50/1000. / 0.2 * (calc_constants.sedC1_denrat - 1.0); 
    calc_constants.sedC1_fallvel = Math.pow(fall_vel_a, 0.5);
 
    // Set the canvas dimensions based on the above-defined WIDTH and HEIGHT values.
    let grid_ratio = calc_constants.dx / calc_constants.dy;
    if (grid_ratio >= 1.0) {
        canvas.width = Math.ceil(calc_constants.WIDTH/64*grid_ratio)*64;  // width needs to have a multiple of 256 bytes per row.  Data will have four channels (rgba), so mulitple os 256/4 = 64;
        canvas.height = Math.round(calc_constants.HEIGHT * canvas.width / calc_constants.WIDTH / grid_ratio);
        calc_constants.canvas_width_ratio = 1/grid_ratio;
    }
    else {
        canvas.width = Math.ceil(calc_constants.WIDTH/64)*64;  // width needs to have a multiple of 256 bytes per row.  Data will have four channels (rgba), so mulitple os 256/4 = 64;
        canvas.height = Math.round(calc_constants.HEIGHT * canvas.width / calc_constants.WIDTH / grid_ratio);
        calc_constants.canvas_width_ratio = grid_ratio;
    }

    // colorbar properties
    calc_constants.CB_show = 1; // show colorbar when = 1 
    calc_constants.CB_xbuffer_uv = 0.01;  // 1% width buffer on either side of colorbar area
    calc_constants.CB_xstart_uv = 0.05;  // colorbar starts at 5% of width
    calc_constants.CB_width_uv = 1.0 - 2.0 * calc_constants.CB_xstart_uv;  // 4% width buffer on either side of colorbar area
    calc_constants.CB_xbuffer = Math.floor(canvas.width*calc_constants.CB_xbuffer_uv);  // 1% width buffer on either side of colorbar area
    calc_constants.CB_xstart = Math.floor(canvas.width*calc_constants.CB_xstart_uv)+1;  // colorbar starts at 5% of width
    calc_constants.CB_width = Math.floor(canvas.width*calc_constants.CB_width_uv)-1;  // 4% width buffer on either side of colorbar area
    calc_constants.CB_ystart = 30;  // colorbar starts at pixel 30 - this is where the tick marks will be plotted
    calc_constants.CB_label_height = 10; // pixel index to place colorbar label
    
    calc_constants.chartDataUpdate = 1; // update chart to start

    console.log("Simulation parameters set.");
}

export { calc_constants, timeSeriesData, loadConfig, init_sim_parameters };
