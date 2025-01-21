struct FragmentOutput {
    @location(0) color: vec4<f32>,
};

struct Globals {
    colorVal_max: f32,
    colorVal_min: f32,
    colorMap_choice: i32,
    surfaceToPlot: i32,
    showBreaking: i32,
    IsOverlayMapLoaded: i32,
    scaleX: f32,
    scaleY: f32,
    offsetX: f32,
    offsetY: f32,
    dx: f32,
    dy: f32,
    WIDTH: i32,
    HEIGHT: i32,
    rotationAngle_xy: f32,
    shift_x: f32,
    shift_y: f32,
    forward: f32,
    canvas_width_ratio: f32,
    canvas_height_ratio: f32,
    delta: f32,
    CB_show: i32,
    CB_xbuffer_uv: f32,
    CB_xstart_uv: f32,
    CB_width_uv: f32,
    CB_ystart: i32,
    CB_label_height: i32,
    base_depth: f32,
    NumberOfTimeSeries: i32,
    time: f32,
    west_boundary_type: i32,
    east_boundary_type: i32,
    south_boundary_type: i32,
    north_boundary_type: i32, 
    designcomponent_Fric_Coral: f32,
    designcomponent_Fric_Oyser: f32,
    designcomponent_Fric_Mangrove: f32,
    designcomponent_Fric_Kelp: f32,
    designcomponent_Fric_Grass: f32,
    designcomponent_Fric_Scrub: f32,
    designcomponent_Fric_RubbleMound: f32,
    designcomponent_Fric_Dune: f32,
    designcomponent_Fric_Berm: f32,
    designcomponent_Fric_Seawall: f32,
};

@group(0) @binding(0) var<uniform> globals: Globals;

@group(0) @binding(1) var etaTexture: texture_2d<f32>;
@group(0) @binding(2) var bottomTexture: texture_2d<f32>;
@group(0) @binding(3) var txMeans: texture_2d<f32>;
@group(0) @binding(4) var txWaveHeight: texture_2d<f32>; 
@group(0) @binding(5) var txBaseline_WaveHeight: texture_2d<f32>; 
@group(0) @binding(6) var txBottomFriction: texture_2d<f32>; 
@group(0) @binding(7) var txNewState_Sed: texture_2d<f32>; 
@group(0) @binding(8) var erosion_Sed: texture_2d<f32>; 
@group(0) @binding(9) var txBotChange_Sed: texture_2d<f32>; 
@group(0) @binding(10) var txDesignComponents: texture_2d<f32>; 
@group(0) @binding(11) var txOverlayMap: texture_2d<f32>;
@group(0) @binding(12) var txDraw: texture_2d<f32>;
@group(0) @binding(13) var textureSampler: sampler;
@group(0) @binding(14) var txTimeSeries_Locations: texture_2d<f32>;
@group(0) @binding(15) var txBreaking: texture_2d<f32>;  
@group(0) @binding(16) var txSamplePNGs: texture_2d_array<f32>;


fn calculateChangeEta(x_global: f32, y_global: f32, dx: f32, amplitude: f32, thetap: f32) -> f32 {
    var change_eta: f32 = 0.0;
    let directions: array<f32, 7> = array<f32, 7>(-25.0, -20.0, -10.0, 0.0, 10.0, 20.0, 25.0); // Directions in degrees
    let pi: f32 = 3.141592653589793;

    // Convert directions to radians for math functions
    for (var i: i32 = 0; i < 7; i = i + 1) {
        let dirRad: f32 = (thetap + directions[i]) * pi / 180.0; // Direction in radians

        // Loop through wavelengths
        for (var j: f32 = 0.2; j <= 1.0; j = j + 0.2) {
            let wavelength: f32 = 10.*min(dx,2.0) * j;
            let k: f32 = 2.0 * pi / wavelength; // Wave number
            let w: f32 = pow(9.81 * k, 0.5);

            // Calculate wave vector components
            let kx: f32 = cos(dirRad) * k;
            let ky: f32 = sin(dirRad) * k;

            // Calculate position in direction of wave vector
            let x: f32 = x_global * cos(dirRad) + y_global * sin(dirRad);

            // Add sine wave contribution to change_eta
            change_eta = change_eta + amplitude * sin(k * x + w * globals.time);
        }
    }

    return change_eta;
}



@fragment
fn fs_main(@location(1) uv: vec2<f32>) -> FragmentOutput {
    var out: FragmentOutput;
    
    var colorMap: array<vec3<f32>, 16>;
    let colorMap_choice = globals.colorMap_choice;

    // grid size ratio, for irregular grids
    let grid_ratio = globals.dx / globals.dy;
    var grid_ratio_x = 1.0;
    var grid_ratio_y = 1.0;
    if (grid_ratio < 1.0) {
        grid_ratio_x = grid_ratio;
    } else {
        grid_ratio_y = 1.0 / grid_ratio;
    }

    // scale the image coordinates to the domain coordinates
    var uv_mod = uv;
    uv_mod.x = uv.x * globals.scaleX + globals.offsetX;
    uv_mod.y = uv.y * globals.scaleY + globals.offsetY;  // flip the image

    // colormpa options
    if(colorMap_choice == 0) {  // blue to white waves colormap
        colorMap = array<vec3<f32>, 16>(
        vec3<f32>(0.2, 0.2, 0.496),    // Adjusted very dark blue
        vec3<f32>(0.2, 0.2, 0.532),
        vec3<f32>(0.2, 0.2, 0.568),
        vec3<f32>(0.2, 0.24, 0.604),
        vec3<f32>(0.2, 0.28, 0.64),
        vec3<f32>(0.2, 0.32, 0.676),
        vec3<f32>(0.2, 0.36, 0.712),
        vec3<f32>(0.24, 0.4, 0.748),
        vec3<f32>(0.28, 0.44, 0.784),
        vec3<f32>(0.32, 0.48, 0.82),
        vec3<f32>(0.36, 0.52, 0.856),
        vec3<f32>(0.4, 0.56, 0.892),
        vec3<f32>(0.44, 0.6, 0.928),
        vec3<f32>(0.48, 0.64, 0.9424),
        vec3<f32>(0.52, 0.68, 0.9568),
        vec3<f32>(0.56, 0.72, 0.9712));  // Adjusted light blue
    } else if(colorMap_choice == 1) {  // parula colormap
        colorMap = array<vec3<f32>, 16>(
        vec3<f32>(0.2422, 0.1504, 0.6603),
        vec3<f32>(0.2717, 0.2184, 0.8439),
        vec3<f32>(0.2814, 0.3095, 0.9483),
        vec3<f32>(0.2647, 0.4030, 0.9935),
        vec3<f32>(0.1847, 0.5030, 0.9819),
        vec3<f32>(0.1540, 0.5902, 0.9218),
        vec3<f32>(0.1085, 0.6669, 0.8734),
        vec3<f32>(0.0009, 0.7248, 0.7815),
        vec3<f32>(0.1609, 0.7635, 0.6671),
        vec3<f32>(0.2809, 0.7964, 0.5266),
        vec3<f32>(0.5044, 0.7993, 0.3480),
        vec3<f32>(0.7344, 0.7679, 0.1852),
        vec3<f32>(0.9184, 0.7308, 0.1890),
        vec3<f32>(0.9962, 0.7798, 0.2095),
        vec3<f32>(0.9619, 0.8840, 0.1557),
        vec3<f32>(0.9769, 0.9839, 0.0805) );
    } else if(colorMap_choice == 2) {  // turbo colormap
        colorMap = array<vec3<f32>, 16>(
        vec3<f32>(0.1900, 0.0718, 0.2322),
        vec3<f32>(0.2537, 0.2633, 0.6541),
        vec3<f32>(0.2769, 0.4415, 0.9133),
        vec3<f32>(0.2443, 0.6094, 0.9970),
        vec3<f32>(0.1328, 0.7716, 0.8858),
        vec3<f32>(0.1034, 0.8960, 0.7150),
        vec3<f32>(0.2760, 0.9709, 0.5165),
        vec3<f32>(0.5325, 0.9992, 0.3058),
        vec3<f32>(0.7260, 0.9647, 0.2064),
        vec3<f32>(0.8833, 0.8655, 0.2172),
        vec3<f32>(0.9800, 0.7300, 0.2216),
        vec3<f32>(0.9930, 0.5521, 0.1542),
        vec3<f32>(0.9408, 0.3557, 0.0703),
        vec3<f32>(0.8393, 0.2065, 0.0231),
        vec3<f32>(0.6860, 0.0954, 0.0048),
        vec3<f32>(0.4796, 0.0158, 0.0106) );
    } else if(colorMap_choice == 3) {  // HSV colormap
        colorMap = array<vec3<f32>, 16>(
        vec3<f32>(1.0000, 0.0000, 0.0000),
        vec3<f32>(1.0000, 0.3750, 0.0000),
        vec3<f32>(1.0000, 0.7500, 0.0000),
        vec3<f32>(0.8750, 1.0000, 0.0000),
        vec3<f32>(0.5000, 1.0000, 0.0000),
        vec3<f32>(0.1250, 1.0000, 0.0000),
        vec3<f32>(0.0000, 1.0000, 0.2500),
        vec3<f32>(0.0000, 1.0000, 0.6250),
        vec3<f32>(0.0000, 1.0000, 1.0000),
        vec3<f32>(0.0000, 0.6250, 1.0000),
        vec3<f32>(0.0000, 0.2500, 1.0000),
        vec3<f32>(0.1250, 0.0000, 1.0000),
        vec3<f32>(0.5000, 0.0000, 1.0000),
        vec3<f32>(0.8750, 0.0000, 1.0000),
        vec3<f32>(1.0000, 0.0000, 0.7500),
        vec3<f32>(1.0000, 0.0000, 0.3750) );
    } else if(colorMap_choice == 4) {  // gray colormap
        colorMap = array<vec3<f32>, 16>(
        vec3<f32>(0.0000, 0.0000, 0.0000), // black
        vec3<f32>(0.0667, 0.0667, 0.0667),
        vec3<f32>(0.1333, 0.1333, 0.1333),
        vec3<f32>(0.2000, 0.2000, 0.2000),
        vec3<f32>(0.2667, 0.2667, 0.2667),
        vec3<f32>(0.3333, 0.3333, 0.3333),
        vec3<f32>(0.4000, 0.4000, 0.4000),
        vec3<f32>(0.4667, 0.4667, 0.4667),
        vec3<f32>(0.5333, 0.5333, 0.5333),
        vec3<f32>(0.6000, 0.6000, 0.6000),
        vec3<f32>(0.6667, 0.6667, 0.6667),
        vec3<f32>(0.7333, 0.7333, 0.7333),
        vec3<f32>(0.8000, 0.8000, 0.8000),
        vec3<f32>(0.8667, 0.8667, 0.8667),
        vec3<f32>(0.9333, 0.9333, 0.9333),
        vec3<f32>(1.0000, 1.0000, 1.0000) );  // white
    } else if(colorMap_choice == 5) {  // pink colormap
        colorMap = array<vec3<f32>, 16>(
        vec3<f32>(0.2357, 0.0000, 0.0000),
        vec3<f32>(0.3944, 0.2108, 0.2108),
        vec3<f32>(0.5055, 0.2981, 0.2981),
        vec3<f32>(0.5963, 0.3651, 0.3651),
        vec3<f32>(0.6749, 0.4216, 0.4216),
        vec3<f32>(0.7454, 0.4714, 0.4714),
        vec3<f32>(0.7746, 0.5676, 0.5164),
        vec3<f32>(0.8028, 0.6498, 0.5578),
        vec3<f32>(0.8300, 0.7226, 0.5963),
        vec3<f32>(0.8563, 0.7888, 0.6325),
        vec3<f32>(0.8819, 0.8498, 0.6667),
        vec3<f32>(0.9068, 0.9068, 0.6992),
        vec3<f32>(0.9309, 0.9309, 0.7853),
        vec3<f32>(0.9545, 0.9545, 0.8628),
        vec3<f32>(0.9775, 0.9775, 0.9339),
        vec3<f32>(1.0000, 1.0000, 1.0000) );  // white
    }  else if(colorMap_choice == 6) {  // haxby for bathy/topo colormap
        colorMap = array<vec3<f32>, 16>(
        vec3<f32>(0.1451, 0.2235, 0.6863),
        vec3<f32>(0.1569, 0.4980, 0.9843),
        vec3<f32>(0.1961, 0.7451, 1.0000),
        vec3<f32>(0.3373, 0.8549, 1.0000),
        vec3<f32>(0.4784, 0.9216, 1.0000),
        vec3<f32>(0.5412, 0.9255, 0.6824),
        vec3<f32>(0.6745, 0.9647, 0.6588),
        vec3<f32>(0.8039, 1.0000, 0.6353),
        vec3<f32>(0.8706, 0.9647, 0.5569),
        vec3<f32>(0.9412, 0.9255, 0.4745),
        vec3<f32>(0.9686, 0.8353, 0.4078),
        vec3<f32>(1.0000, 0.7412, 0.3412),
        vec3<f32>(1.0000, 0.6863, 0.3020),
        vec3<f32>(1.0000, 0.6314, 0.2667),
        vec3<f32>(1.0000, 0.8000, 0.3922),
        vec3<f32>(1.0000, 1.0000, 1.0000) );

    } 

    let maxWave = globals.colorVal_max;
    let minWave = globals.colorVal_min;
    let surfaceToPlot = globals.surfaceToPlot;
    var photorealistic = i32(0);  // globals.photorealistic
    
    let bottom = textureSample(bottomTexture, textureSampler, uv).b;
    var waves = textureSample(etaTexture, textureSampler, uv).r;  // free surface elevation
    let friction = textureSample(txBottomFriction, textureSampler, uv).r;  // friction
    let GoogleMap = textureSample(txOverlayMap, textureSampler, uv_mod).rgb;
    let TextDraw = textureSample(txDraw, textureSampler, uv).rgb;
    let H = max(globals.delta, waves - bottom);
    var render_surface = waves;

    // if not just plotting waves, load the other stuff
    if (surfaceToPlot == 0) {  // waves
        // nothing to be done, but break the if loop since it is so long
        if(colorMap_choice == 0) {photorealistic = i32(1);}  // globals.photorealistic

    } else if (surfaceToPlot == 1) {  // fluid speed
        let P = textureSample(etaTexture, textureSampler, uv).g; 
        let Q = textureSample(etaTexture, textureSampler, uv).b; 
        let u = P/H;
        let v = Q/H;
        render_surface = sqrt(u * u + v * v);

    } else if (surfaceToPlot == 2) { // x-component of fluid speed
        let P = textureSample(etaTexture, textureSampler, uv).g; 
        render_surface = P/H;

    } else if (surfaceToPlot == 3) {  // y-component of fluid speed
        let Q = textureSample(etaTexture, textureSampler, uv).b; 
        render_surface = Q/H;

    } else if (surfaceToPlot == 4) {  // total vertical vorticity
        // up
        var uv_vort = uv;
        uv_vort.y = uv_vort.y + 1/f32(globals.HEIGHT);
        let P_up = textureSample(etaTexture, textureSampler, uv_vort).g; 

        // down
        uv_vort = uv;
        uv_vort.y = uv_vort.y - 1/f32(globals.HEIGHT);
        let P_down = textureSample(etaTexture, textureSampler, uv_vort).g; 

        // right
        uv_vort = uv;
        uv_vort.x = uv_vort.x + 1/f32(globals.WIDTH);
        let Q_right = textureSample(etaTexture, textureSampler, uv_vort).b; 
        
        // left
        uv_vort = uv;
        uv_vort.x = uv_vort.x - 1/f32(globals.WIDTH);
        let Q_left = textureSample(etaTexture, textureSampler, uv_vort).b; 

        render_surface = 0.5*(P_up - P_down)/globals.dy - 0.5*(Q_right - Q_left)/globals.dx;

    } else if (surfaceToPlot == 5) {  // breaking
        render_surface = textureSample(txBreaking, textureSampler, uv).g;

    } else if (surfaceToPlot == 6) {  // bathy/topo
        render_surface = bottom;

    } else if (surfaceToPlot == 7) {  // mean eta
        render_surface = textureSample(txMeans, textureSampler, uv).r;
   
    } else if (surfaceToPlot == 8) {  // mean fluid flux
        let P = textureSample(txMeans, textureSampler, uv).g; 
        let Q = textureSample(txMeans, textureSampler, uv).b; 
        render_surface = sqrt(P * P + Q * Q);

    } else if (surfaceToPlot == 9) {  // mean x-dir flux
        render_surface = textureSample(txMeans, textureSampler, uv).g; 
    
    } else if (surfaceToPlot == 10) {  // mean y-dir flux
        render_surface = textureSample(txMeans, textureSampler, uv).b; 

    } else if (surfaceToPlot == 11) {  // mean breaking intensity
        render_surface = textureSample(txMeans, textureSampler, uv).a; 
    
    } else if (surfaceToPlot == 12) {  // mean wave height
        render_surface = textureSample(txWaveHeight, textureSampler, uv).a; 

    } else if (surfaceToPlot == 13) {  // significant wave height
        render_surface = textureSample(txWaveHeight, textureSampler, uv).b; 

    } else if (surfaceToPlot == 14) {  // deviation from basesline
        render_surface = textureSample(txWaveHeight, textureSampler, uv).b - textureSample(txBaseline_WaveHeight, textureSampler, uv).b; 
    } else if (surfaceToPlot == 15) {  // bottom friction map
        render_surface = textureSample(txBottomFriction, textureSampler, uv).r; 
    } else if (surfaceToPlot == 16) {  // max free surface map
        render_surface = textureSample(txMeans, textureSampler, uv).a;  
        waves = render_surface; // change to max so maxs are plotted everywhere, including high runup areas that are not currently wet
    } else if (surfaceToPlot == 17) {  // sed C1 concentration
        render_surface = textureSample(txNewState_Sed, textureSampler, uv).r / H; 
    } else if (surfaceToPlot == 18) {  // sed C1 erosion
        render_surface = textureSample(erosion_Sed, textureSampler, uv).r; 
  //  } else if (surfaceToPlot == 19) {  // sed C1 deposition
  //      render_surface = textureSample(depostion_Sed, textureSampler, uv).r; 
 //   } else if (surfaceToPlot == 20) {  // sed C1 net deposition 
 //       render_surface = textureSample(depostion_Sed, textureSampler, uv).r - textureSample(erosion_Sed, textureSampler, uv).r; 
    } else if (surfaceToPlot == 21) {  // sed C1 net deposition 
        render_surface = textureSample(txBotChange_Sed, textureSampler, uv).r; 
    } else if (surfaceToPlot == 22) {  // design components 
        render_surface = textureSample(txDesignComponents, textureSampler, uv).r; 
    }
    
    var light_effects = vec3<f32>(1.0, 1.0, 1.0);
    var vorticiy_magn = 0.0;  // this will be used to viz sediment plumes
    var breaking_texture = 1.0;  // this will be used to modulate the breaking form, to make it look more realistic
    var component_index = 0; // this is equivalent to a floor operation, so add the shift just in case
    var component_colors = vec3<f32>(0.0, 0.0, 0.0);
    var component_colors_abovewater = vec3<f32>(0.0, 0.0, 0.0);


    if (photorealistic == 1) {  // add lighting for photo-realistic view
        let width = f32(globals.WIDTH) * globals.dx;
        let length = f32(globals.HEIGHT) * globals.dy;     

        // define local component index
        component_index = i32(0.01 + textureSample(txDesignComponents, textureSampler, uv).r); // this is equivalent to a floor operation, so add the shift just in case

        // Lighting parameters
        let lightColor = vec3<f32>(1.0, 1.0, 1.0); // White light
        var thetap = 180.;

        var light_x = 0.5 * width;
        if(globals.west_boundary_type == 2){
            light_x =  width;
            thetap = 180.;
        }
        else if(globals.east_boundary_type == 2){
            light_x = -width;
            thetap = 0.;
        }

        var light_y = 0.5 * length;
        if(globals.north_boundary_type == 2){
            light_y = -length;
            thetap = 90.;
        }
        else if(globals.south_boundary_type == 2){
            light_y = length;
            thetap = -90.;
        }

        let light_z = 10.0 * (length + width);


        let lightPos = vec3<f32>(light_x, light_y, light_z); // Simulate overhead sun position, world coordinates
        let ambientStrength = 0.1;
        let diffuseStrength = 0.5;
        let specularStrength = 0.5;
        let shininess = 32.0; // Shininess factor for specular highlight

        // find worldspace coordinates
        let x_world = uv.x * width;
        let y_world = uv.y * length;

        // Normal vector calcs
        var roughnessFactor = 0.002 * min(H, globals.base_depth / 2.);
        if(component_index == 4) {roughnessFactor = 0.0;}  // kelp knocks out chop
        var delta_eta = calculateChangeEta(x_world, y_world, globals.dx, roughnessFactor, thetap);   
        render_surface = render_surface + delta_eta;
            // up
        var uv_grad = uv;
        uv_grad.y = uv_grad.y + 1/f32(globals.HEIGHT);
        delta_eta = calculateChangeEta(x_world, y_world + globals.dy, globals.dx, roughnessFactor, thetap);        
        let eta_up = delta_eta + textureSample(etaTexture, textureSampler, uv_grad).r; 
            // down
        uv_grad = uv;
        uv_grad.y = uv_grad.y - 1/f32(globals.HEIGHT);
        delta_eta = calculateChangeEta(x_world, y_world - globals.dy, globals.dx, roughnessFactor, thetap);   
        let eta_down = delta_eta + textureSample(etaTexture, textureSampler, uv_grad).r; 
            // right
        uv_grad = uv;
        uv_grad.x = uv_grad.x + 1/f32(globals.WIDTH);
        delta_eta = calculateChangeEta(x_world + globals.dx, y_world, globals.dx, roughnessFactor, thetap);   
        let eta_right = delta_eta + textureSample(etaTexture, textureSampler, uv_grad).r;  
            // left
        uv_grad = uv;
        uv_grad.x = uv_grad.x - 1/f32(globals.WIDTH);
        delta_eta = calculateChangeEta(x_world - globals.dx, y_world, globals.dx, roughnessFactor, thetap);   
        let eta_left = delta_eta + textureSample(etaTexture, textureSampler, uv_grad).r; 

        let detadx = 0.5*(eta_right - eta_left)/globals.dx;
        let detady = 0.5*(eta_up - eta_down)/globals.dy;
        let normal = vec3<f32>(-detadx, -detady, 1.0);  

        // Ambient component
        let ambient = ambientStrength * lightColor;

        // Diffuse component
        let FragPos = vec3<f32>(x_world, y_world, waves);
        let lightDir = normalize(lightPos - FragPos);
        let diff = max(dot(normal, lightDir), 0.0);
        let diffuse = diffuseStrength * diff * lightColor;

        // Specular component
        let viewPos =vec3<f32>(0.5 * width, 0.5 * length, light_z); // directly overhead, world coordinates
        let viewDir = normalize(viewPos - FragPos);
        let reflectDir = reflect(-lightDir, normal);
        let spec = pow(max(dot(viewDir, reflectDir), 0.0), shininess);
        let specular = specularStrength * spec * lightColor;

        // Combine components
        light_effects = ambient + diffuse + specular;

        //Vorticity, this is used to color the water brownish, as a proxy for a vorticity induced sediment plume
        //one issue is that along the center of the vorticity field, there is a line of zero vorticity, where vort goes from + -> -
        // the fix for this would be to smooth or find the local max vorticity, but less like overkill right now.
        var uv_vort = uv;
        // up
        uv_vort.y = uv_vort.y + 1/f32(globals.HEIGHT);
        let P_up = textureSample(etaTexture, textureSampler, uv_vort).g; 

        // down
        uv_vort = uv;
        uv_vort.y = uv_vort.y - 1/f32(globals.HEIGHT);
        let P_down = textureSample(etaTexture, textureSampler, uv_vort).g; 

        // right
        uv_vort = uv;
        uv_vort.x = uv_vort.x + 1/f32(globals.WIDTH);
        let Q_right = textureSample(etaTexture, textureSampler, uv_vort).b; 
            
        // left
        uv_vort = uv;
        uv_vort.x = uv_vort.x - 1/f32(globals.WIDTH);
        let Q_left = textureSample(etaTexture, textureSampler, uv_vort).b; 

        vorticiy_magn = min(0.25, 0.5 * abs(0.5*(P_up - P_down)/globals.dy - 0.5*(Q_right - Q_left)/globals.dx));

        var uv_turb = uv; //vec3<f32>(uv.x, uv.y, 0.0) ;
        let PQ_scale = globals.base_depth * sqrt(9.81 * globals.base_depth); 
        let max_shift = globals.base_depth / (width + length);
        var xshift = 0.005 * (P_up + P_down)/PQ_scale;
        if (xshift < -max_shift) {xshift = -max_shift;} else if (xshift > max_shift) {xshift = max_shift;} 
        var yshift = 0.005 * (Q_right + Q_left)/PQ_scale;
        if (yshift < -max_shift) {yshift = -max_shift;} else if (yshift > max_shift) {yshift = max_shift;} 
        uv_turb.x = fract(uv_turb.x + xshift);
        uv_turb.y = fract(uv_turb.y + yshift);


        // add design components
        let texture_scale_x = width/250.;  // 
        let texture_scale_y = length/250.;
        var uv_turb_scaled = uv_turb;
        uv_turb_scaled.x = uv_turb.x * texture_scale_x;  // textures will mirror-repeat with current smpaler settings
        uv_turb_scaled.y = uv_turb.y * texture_scale_y;
        var uv_scale = uv;
        uv_scale.x = uv.x * texture_scale_x;
        uv_scale.y = uv.y * texture_scale_y;

        // turbulence
        let layer = 0; // first layer is turbulence
        let breaking_texture_colors = textureSample(txSamplePNGs, textureSampler, uv_turb, i32(layer)).xyz;
        breaking_texture = (breaking_texture_colors.x + breaking_texture_colors.y + breaking_texture_colors.z)/3.0;

        // vorticity / sediment plumes
        vorticiy_magn = vorticiy_magn * breaking_texture;  // add turbulence noise texture to vort / sed as well

        // design components
        component_colors = textureSample(txSamplePNGs, textureSampler, uv_turb_scaled, component_index).xyz;
        component_colors_abovewater =  textureSample(txSamplePNGs, textureSampler, uv_scale, component_index).xyz;
    } 


    var color_rgb: vec3<f32>;
    var design_component_allowed_on_land = 0;
    
    if(photorealistic != 0 && (component_index == 3 || component_index >= 5)){design_component_allowed_on_land = 1;}  //magroves, and other components that can exist above zero datum

    if (bottom + globals.delta >= waves && surfaceToPlot != 6 && design_component_allowed_on_land == 0) {
        if(globals.IsOverlayMapLoaded == 1) {
            color_rgb = GoogleMap;
        }
        else {
            color_rgb = vec3<f32>(210.0 / 255.0, 180.0 / 255.0, 140.0 / 255.0) + 0.5 * bottom / globals.base_depth;
        }
    } else {
        if (photorealistic == 0) {
            // Determine where 'render_surface' falls in the range from 'minWave' to 'maxWave'.
            var wavePosition = f32((render_surface - minWave) / (maxWave - minWave));

            // Clamp the position between 0 and 1 to stay within the color map.
            wavePosition = clamp(wavePosition, 0.0, 1.0);

            // Determine the indices of the two colors we'll be interpolating between.
            // This requires the color map to have a known and fixed size.
            let lowerIndex = i32(floor(wavePosition * 15.0)); // Because we have 16 colors.
            let upperIndex = lowerIndex + 1;

            // Calculate how far between the two colors 'render_surface' falls.
            let mixAmount = fract(wavePosition * 15.0); // Fractional part represents the mix amount between colors.

            // Interpolate between the two colors in the color map.
            let color_wave = mix(colorMap[lowerIndex], colorMap[upperIndex], mixAmount);
            color_rgb = color_wave;
        }
        else {
            let color_shallow = vec3<f32>(0.2, 0.45, 0.45); // deep water ocean color
            let color_deep = vec3<f32>(0.0, 0.25, 0.5); // shallow ocean color
            var color_sand = vec3<f32>(0.76, 0.70, 0.50); // sand color
            if(globals.IsOverlayMapLoaded == 1 && bottom >= 0.0) {color_sand = GoogleMap;}

            var color_wave = color_shallow;
            let deep = 50.0;
            let sand = 1.0;

            if (H > deep) {
                color_wave = color_deep;
            }
            else if (H > sand) {
                let ratio = (H - sand) / (deep - sand);
                color_wave = ratio * color_deep + (1. - ratio) * color_shallow;
            }
            else {
                let ratio = pow(H / sand, 0.25);
                color_wave = ratio * color_shallow + (1. - ratio) * color_sand;
            }

            // add vorticity - sediment viz
            color_wave = (1.0 - vorticiy_magn) * color_wave + vorticiy_magn * color_sand;

           // add design components
            var component_frac = 0.0;
            var friction_edge_mod = 1.0;
            var design_colors = component_colors;
            
            if(component_index == 1) {  // coral reef
                friction_edge_mod = min(1.0, pow(friction / globals.designcomponent_Fric_Coral, 0.5));
                let vis_depth = 10.0;
                if (H < vis_depth) {
                    component_frac = 0.5*max(0.05, (vis_depth - H) / vis_depth);
                }               
            } else if(component_index == 2) {  // oyster beds
                friction_edge_mod = min(1.0, pow(friction / globals.designcomponent_Fric_Oyser, 0.5));
                let vis_depth = 10.0;
                if (H < vis_depth) {
                    component_frac = 0.5*max(0.05, (vis_depth - H) / vis_depth);
                }               
            } else if(component_index == 3) {  // mangroves
                friction_edge_mod = min(1.0, pow(friction / globals.designcomponent_Fric_Mangrove, 0.5));
                component_frac = 1.0;
                light_effects = vec3<f32>(1.0, 1.0, 1.0);
                design_colors = component_colors_abovewater;
                breaking_texture = 0.25 * breaking_texture; // breaking less visable through mangroves            
            } else if(component_index == 4) {  // kelp
                friction_edge_mod = min(1.0, pow(friction / globals.designcomponent_Fric_Kelp, 0.5));
                let sum_colors = design_colors.x + design_colors.y + design_colors.z;
                component_frac = min(0.25, sum_colors);            
            } else if(component_index == 5) {  // grass
                friction_edge_mod = min(1.0, pow(friction / globals.designcomponent_Fric_Grass, 0.5));
                let vis_depth = 10.0;
                if (H < 0.05) {
                    component_frac = 1.0;
                    design_colors = component_colors_abovewater;
                    light_effects = vec3<f32>(1.0, 1.0, 1.0);
                } else if (H < vis_depth) {
                    component_frac = 0.5*max(0.05, (vis_depth - H) / vis_depth);
                }                         
            } else if(component_index == 6) {  // shrubs
                friction_edge_mod = min(1.0, pow(friction / globals.designcomponent_Fric_Scrub, 0.5));
                let vis_depth = 10.0;
                if (H < 0.05) {
                    component_frac = 1.0;
                    design_colors = component_colors_abovewater;
                    light_effects = vec3<f32>(1.0, 1.0, 1.0);
                    breaking_texture = 0.5 * breaking_texture; // breaking less visable through scrub with small depths  
                } else if (H < vis_depth) {
                    component_frac = 0.5*max(0.05, (vis_depth - H) / vis_depth);
                } 

            } else if(component_index == 7) {  // rubble mound
                let vis_depth = 10.0;
                if (H < 0.05) {
                    component_frac = 1.0;
                    design_colors = component_colors_abovewater;
                    light_effects = vec3<f32>(1.0, 1.0, 1.0);
                } else if (H < vis_depth) {
                    component_frac = 0.5*max(0.05, (vis_depth - H) / vis_depth);
                } 

            } else if(component_index == 8) {  // vegetated dune
                let vis_depth = 10.0;
                if (H < 0.05) {
                    component_frac = 1.0;
                    design_colors = component_colors_abovewater;
                    light_effects = vec3<f32>(1.0, 1.0, 1.0);
                } else if (H < vis_depth) {
                    component_frac = 0.5*max(0.05, (vis_depth - H) / vis_depth);
                } 

            } else if(component_index == 9) {  // berm / simple sand dune
                let vis_depth = 10.0;
                component_colors_abovewater = vec3<f32>(0.76, 0.70, 0.50);
                if (H < 0.05) {
                    component_frac = 1.0;
                    design_colors = component_colors_abovewater;
                    light_effects = vec3<f32>(1.0, 1.0, 1.0);
                } else if (H < vis_depth) {
                    component_frac = 0.5*max(0.05, (vis_depth - H) / vis_depth);
                } 

            } else if(component_index == 10) {  // seawall
                let vis_depth = 10.0;
                component_colors_abovewater = vec3<f32>(0.25, 0.25, 0.25);
                if (H < 0.05) {
                    component_frac = 1.0;
                    design_colors = component_colors_abovewater;
                    light_effects = vec3<f32>(1.0, 1.0, 1.0);
                } else if (H < vis_depth) {
                    component_frac = 0.5*max(0.05, (vis_depth - H) / vis_depth);
                } 

            }

            component_frac = component_frac * friction_edge_mod;

            color_wave = (1.0 - component_frac) * color_wave + component_frac * design_colors ;

            color_rgb = light_effects * color_wave;
        }

    }

    
    if (globals.showBreaking ==1 ) {
        let breaking =  breaking_texture * textureSample(etaTexture, textureSampler, uv).a;
        color_rgb = color_rgb + vec3<f32>(breaking, breaking, breaking);
    } else if (globals.showBreaking == 2 ) {
        let tracer = textureSample(etaTexture, textureSampler, uv).a;
        color_rgb = color_rgb + vec3<f32>(tracer, 0., 0.);
    }

    // Add dots for time series
    let ts_colors = array<vec3<f32>, 15>(
    vec3<f32>(0.2941, 0.7529, 0.7529),
    vec3<f32>(1.0000, 0.3882, 0.5176),
    vec3<f32>(0.2118, 0.6353, 0.9216),
    vec3<f32>(1.0000, 0.8078, 0.3373),
    vec3<f32>(0.2941, 0.7529, 0.2941),
    vec3<f32>(0.6000, 0.4000, 1.0000),
    vec3<f32>(1.0000, 0.6235, 0.2510),
    vec3<f32>(0.7804, 0.7804, 0.7804),
    vec3<f32>(0.3255, 0.4000, 1.0000),
    vec3<f32>(0.1569, 0.6235, 0.2510),
    vec3<f32>(0.8235, 0.1765, 0.0000),
    vec3<f32>(0.0000, 0.5020, 0.5020),
    vec3<f32>(0.5020, 0.0000, 0.5020),
    vec3<f32>(0.5020, 0.5020, 0.0000),
    vec3<f32>(0.0000, 0.0000, 0.5020));

    for (var i: i32 = 0; i < globals.NumberOfTimeSeries; i = i + 1) {  // cycle through all time series
        let idx = vec2<i32>(i + 1, 0);
        let ts_location = textureLoad(txTimeSeries_Locations, idx, 0).xy;
        let uv_tsx_diff = (uv.x - ts_location.x / f32(globals.WIDTH)) / grid_ratio_y;
        let uv_tsy_diff = (uv.y - ts_location.y / f32(globals.HEIGHT)) * f32(globals.HEIGHT) / f32(globals.WIDTH) / grid_ratio_x;
        let uv_dist = sqrt(uv_tsx_diff * uv_tsx_diff + uv_tsy_diff * uv_tsy_diff);
        if (uv_dist <= 0.005){
            color_rgb = ts_colors[i];
        }
        else if (uv_dist <= 0.0075){
            color_rgb = vec3<f32>(0., 0., 0.);
        }
    }

    // Add colorbar
    if (globals.CB_show == 1  && (photorealistic == 0  || uv.y > 0.8) ) {
        let colorbar_LL = vec2<f32>(globals.CB_xstart_uv, 0.0);
        let colorbar_width = globals.CB_width_uv;
        let colorbar_height = f32(globals.CB_ystart + 20) / f32(globals.HEIGHT) * grid_ratio; // 20 pixels above tick marks
        let colorbar_UR = vec2<f32>(colorbar_LL.x + colorbar_width, colorbar_LL.y + colorbar_height);
        let colorbar_buffer =  vec4<f32>(globals.CB_xbuffer_uv, globals.CB_xbuffer_uv, colorbar_LL.y, 0.5*globals.CB_xbuffer_uv);

        if(uv.x >= colorbar_LL.x - colorbar_buffer.x && uv.x <= colorbar_UR.x + colorbar_buffer.y  && uv.y >= colorbar_LL.y - colorbar_buffer.z && uv.y <= colorbar_UR.y + colorbar_buffer.a){
            color_rgb = vec3<f32>(211, 211, 211)/256;  //light gray
        }

        if(uv.x >= colorbar_LL.x && uv.x <= colorbar_UR.x && uv.y >= colorbar_LL.y && uv.y <= colorbar_UR.y){
            // Determine where 'render_surface' falls in the range from 'minWave' to 'maxWave'.
            var wavePosition = f32((uv.x  -  colorbar_LL.x) / (colorbar_UR.x -  colorbar_LL.x));

            // Clamp the position between 0 and 1 to stay within the color map.
            wavePosition = clamp(wavePosition, 0.0, 1.0);

            // Determine the indices of the two colors we'll be interpolating between.
            // This requires the color map to have a known and fixed size.
            let lowerIndex = i32(floor(wavePosition * 15.0)); // Because we have 16 colors.
            let upperIndex = lowerIndex + 1;

            // Calculate how far between the two colors 'render_surface' falls.
            let mixAmount = fract(wavePosition * 15.0); // Fractional part represents the mix amount between colors.

            // Interpolate between the two colors in the color map.
            let color_wave = mix(colorMap[lowerIndex], colorMap[upperIndex], mixAmount);        
            
            color_rgb = color_wave;
        }

        if(TextDraw.r + TextDraw.g + TextDraw.b <= 3.*0.99){
            color_rgb = TextDraw;
        }
    }

    // deprecated - data now stored in seperate texture - below can be deleted
    // tooltip hover - encode values to a corner pixel.  This is a bit of a hack, but I think it is still faster than
    // creating a new compute shader, since this value-extract is dependent on the current state of the rendered texture
    // which can change in explorer mode (and thus would require re-doing all the calcs in the vertex shader transformation)
    // let uv_mouse = vec2<f32>(globals.mouse_current_canvas_positionX, globals.mouse_current_canvas_positionY);
    // let bottom_hover = (globals.base_depth + textureSample(bottomTexture, textureSampler, uv_mouse).b) / (2.0 * globals.base_depth);  // Bottom elevation, need to scale by some value that will keep value between [0 1]
    // let waves_hover = (0.1*globals.base_depth + textureSample(etaTexture, textureSampler, uv_mouse).r) / (0.2 * globals.base_depth);  // Free surface elevation
    // let hsig_hover = textureSample(txWaveHeight, textureSampler, uv_mouse).b / (0.2 * globals.base_depth);   // Significant wave height
    // let friction_hover = textureSample(txBottomFriction, textureSampler, uv_mouse).r * 20.;   // friction factor, always between [0 and 1], no normalization needed
    // Determine if this fragment is close to the bottom-left corner
    // if (uv.x < 1.0 / f32(globals.WIDTH) && uv.y > 1.0 - 1.0 / f32(globals.HEIGHT)) {
        // Encode data into this pixel's color channels
    //     out.color = vec4<f32>(bottom_hover, waves_hover, hsig_hover, friction_hover);
    // } else {
    //     out.color = vec4<f32>(color_rgb, 1.0); // Normal shader output
    // }

    out.color = vec4<f32>(color_rgb, 1.0); // Normal shader output
    
    return out;
}
