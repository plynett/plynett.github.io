// constants_load_calc.js


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
    seaLevel: 0.0,  // Water level shift from given datum.
    base_depth: 20.0,  // characteristic_depth (m), used to estimate time step, use depth in area of wave generation, or expected largest depth in domain.
    Theta: 1.3,  // Midmod limiter parameter. 1.0 most dissipative(upwind) to 2.0 least dissipative(centered).
    friction: 0.001,  // Dimensionless friction coefficient, or Mannings 'n', depending on isManning choice.
    isManning: 1,  // A boolean friction model value, if==1 'friction' is a Mannnigs n, otherwise it is a dimensionless friction factor (Moody).

    // Boundary condition parameters
    west_boundary_type: 0,  // Type of boundary condition at the west boundary. 0: solid wall, 1 :sponge layer, 2: waves loaded from file, created by spectrum_2D.
    east_boundary_type: 0,  // Type of boundary condition at the east boundary. 0: solid wall, 1 :sponge layer, 2: waves loaded from file, created by spectrum_2D.
    south_boundary_type: 0,  // Type of boundary condition at the south boundary. 0: solid wall, 1 :sponge layer, 2: waves loaded from file, created by spectrum_2D.
    north_boundary_type: 0,  // Type of boundary condition at the north boundary. 0: solid wall, 1 :sponge layer, 2: waves loaded from file, created by spectrum_2D.

    // generic wave parameters used mostly for debug
    amplitude: 0.0,
    period: 10.0,
    direction: 0.0,
    rand_phase: 0.0,
    numberOfWaves: 0,

    // Vessel motion parameters (initial development)
    ship_posx: -100.0,  // initial ship position, if initially inside domain, the initial free surface must include the ship displacement 
    ship_posy: 450.0,
    ship_width: 10.0,  // ship beam
    ship_length: 30.0,  // ship length
    ship_draft: 2.0,  // max draft in m
    ship_heading: 0.0,  // 0=moving to the east

    // plotting parameters
    colorVal_max: 1.0,  // value that maps to the "highest" color
    colorVal_min: -1.0,  // value that maps to the "lowest" color
    colorMap_choice: 0,  // decision variable for the colormap to use during rendering
    surfaceToPlot: 0, // which surface (eta, u, v, vort) to plot
    showBreaking: 0,  //  show breaking (foam) areas when ==1
    GoogleMapOverlay: 0, // load satellite image and plot over dry land, requires proper values of lat,lon at lower left and upper right corners
    IsGoogleMapLoaded: 0, // = 0 if not loaded, change to one if already loaded
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
    render_step: 10, // number of compute steps to run for every render step, the biggest the number the choppier the viz, but also the faster it runs
    simPause: -1, // check variable, simulation is paused when this value is =1, running when = -1
    html_update: -1,  // check variable - if the user has updated ANY parameter from the interface, =1, and buffers are updated

    // canvas interaction parameters
    xClick: 0, // pixel coordinate of x-click
    yClick: 0, // pixel coordinate of y-click
    click_update: -1,   // check variable - if the user has clicked on the canvas =1, and surfaces are updated as specified
    surfaceToChange: 0, // which surface to change (bathy, friction)
    changeRadius: 1, // lengthscale of change function, in meters
    changeAmplitude: 1, // amplitude of change function, in units of the surfaceToChange

};

// load the control file
let loadedConfig = null;
async function loadConfig() {
    try {
        const response = await fetch('config.json');
        if (!response.ok) {
            throw new Error("HTTP error " + response.status);
        }
        loadedConfig = await response.json();
        calc_constants = { ...calc_constants, ...loadedConfig };
     //   console.log(calc_constants);
        console.log("config.json loaded successfully.");
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
        console.log("Failed to parse configuration file, loading server side config.json file");
        await loadConfig();  // for the json to be loaded
    }


    // Add/update parameters in calc_constants
    calc_constants.dt = calc_constants.Courant_num * calc_constants.dx / Math.sqrt(calc_constants.g * calc_constants.base_depth);
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
    calc_constants.epsilon = Math.pow(calc_constants.base_depth / 1000.0, 2);
    calc_constants.PI = Math.PI;
    calc_constants.boundary_epsilon = calc_constants.epsilon;
    calc_constants.boundary_nx = calc_constants.WIDTH - 1;
    calc_constants.boundary_ny = calc_constants.HEIGHT - 1;
    calc_constants.reflect_x = 2 * (calc_constants.WIDTH - 1) - 2;
    calc_constants.reflect_y = 2 * (calc_constants.HEIGHT - 1) - 2;
    calc_constants.BoundaryWidth = 25.0;
    calc_constants.boundary_g = calc_constants.g;
    calc_constants.Px = Math.ceil(Math.log(calc_constants.WIDTH)  / Math.log(2));
    calc_constants.Py = Math.ceil(Math.log(calc_constants.HEIGHT) / Math.log(2));

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
    calc_constants.changeRadius = 100. * calc_constants.dx;
    calc_constants.changeAmplitude = 0.1 * calc_constants.base_depth;
    
    // Set the canvas dimensions based on the above-defined WIDTH and HEIGHT values.
    canvas.width = Math.ceil(calc_constants.WIDTH/64)*64;  // widht needs to have a multiple of 256 bytes per row.  Data will have four channels (rgba), so mulitple os 256/4 = 64;
    canvas.height = Math.round(calc_constants.HEIGHT * canvas.width / calc_constants.WIDTH);

    console.log("Simulation parameters set.");
}

export { calc_constants, loadConfig, init_sim_parameters };
