struct FragmentOutput {
    @location(0) color: vec4<f32>,
};

struct Globals {
    colorVal_max: f32,
    colorVal_min: f32,
    colorMap_choice: i32,
    surfaceToPlot: i32,
    showBreaking: i32,
    GoogleMapOverlay: i32,
    scaleX: f32,
    scaleY: f32,
    offsetX: f32,
    offsetY: f32,
    dx: f32,
    dy: f32,
    WIDTH: i32,
    HEIGHT: i32,
};

@group(0) @binding(0) var<uniform> globals: Globals;

@group(0) @binding(1) var etaTexture: texture_2d<f32>;
@group(0) @binding(2) var bottomTexture: texture_2d<f32>;
@group(0) @binding(3) var txMeans: texture_2d<f32>;
@group(0) @binding(4) var txWaveHeight: texture_2d<f32>; 
@group(0) @binding(5) var txBaseline_WaveHeight: texture_2d<f32>; 
@group(0) @binding(6) var txBottomFriction: texture_2d<f32>; 
@group(0) @binding(7) var txGoogleMap: texture_2d<f32>;
@group(0) @binding(8) var textureSampler: sampler;

@fragment
fn fs_main(@location(1) uv: vec2<f32>) -> FragmentOutput {
    var out: FragmentOutput;
    
    var colorMap: array<vec3<f32>, 16>;
    let colorMap_choice = globals.colorMap_choice;

    // scale the image coordinates to the domain coordinates
    var uv_mod = uv;
    uv_mod.x = uv.x * globals.scaleX + globals.offsetX;
    uv_mod.y = uv.y * globals.scaleY + globals.offsetY;  // flip the image

    // colormpa options
    if(colorMap_choice == 0) {  // blue to white waves colormap
        colorMap = array<vec3<f32>, 16>(
        vec3<f32>(0.0, 0.0, 0.3),      // very dark blue
        vec3<f32>(0.0, 0.0, 0.4),
        vec3<f32>(0.0, 0.0, 0.5),
        vec3<f32>(0.0, 0.0, 0.6),
        vec3<f32>(0.0, 0.0, 0.7),
        vec3<f32>(0.2, 0.2, 0.8),
        vec3<f32>(0.3, 0.3, 0.9),
        vec3<f32>(0.4, 0.4, 0.9),
        vec3<f32>(0.5, 0.5, 0.9),      // light blue
        vec3<f32>(0.6, 0.6, 0.9),
        vec3<f32>(0.7, 0.7, 0.9),
        vec3<f32>(0.8, 0.8, 0.9),
        vec3<f32>(0.85, 0.85, 0.95),
        vec3<f32>(0.9, 0.9, 1.0),      // very light blue
        vec3<f32>(0.95, 0.95, 1.0),
        vec3<f32>(1.0, 1.0, 1.0)  );
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
    
    let bottom = textureSample(bottomTexture, textureSampler, uv).b;
    let waves = textureSample(etaTexture, textureSampler, uv).r;  // free surface elevation
    let GoogleMap = textureSample(txGoogleMap, textureSampler, uv_mod).rgb;
    let H = max(0.01, waves - bottom);
    var render_surface = waves;

    // if not just plotting waves, load the other stuff
    if (surfaceToPlot == 1) {  // fluid speed
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
        render_surface = textureSample(etaTexture, textureSampler, uv).a;

    } else if (surfaceToPlot == 6) {  // bathy/topo
        render_surface = bottom;

    } else if (surfaceToPlot == 7) {  // mean eta
        render_surface = textureSample(txMeans, textureSampler, uv).r;;
   
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
    } else if (surfaceToPlot == 15) {  // bottom friction mao
        render_surface = textureSample(txBottomFriction, textureSampler, uv).r; 
    }
    
    var color_rgb: vec3<f32>;
    if (bottom + 0.0001 > waves && surfaceToPlot != 6) {
        if(globals.GoogleMapOverlay == 1) {
            color_rgb = GoogleMap;
        }
        else {
            color_rgb = vec3<f32>(210.0 / 255.0, 180.0 / 255.0, 140.0 / 255.0) + 0.05 * bottom;
        }
    } else {
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

    
    if (globals.showBreaking ==1 ) {
        let breaking = textureSample(etaTexture, textureSampler, uv).a;
        color_rgb = color_rgb + vec3<f32>(breaking, breaking, breaking);
    } else if (globals.showBreaking == 2 ) {
        let tracer = textureSample(etaTexture, textureSampler, uv).a;
        color_rgb = color_rgb + vec3<f32>(tracer, 0., 0.);
    }

    out.color = vec4<f32>(color_rgb, 1.0); //vec4<f32>(color_rgb, 1.0);
    return out;
}
