struct Globals {
    width: i32,
    height: i32,
    dx: f32,
    dy: f32,
    disturbanceType: i32,
    disturbanceXpos: f32,
    disturbanceYpos: f32,
    disturbanceCrestamp: f32,
    disturbanceDir: f32,
    disturbanceWidth: f32,
    disturbanceLength: f32,
    disturbanceDip: f32,
    disturbanceRake: f32,
    base_depth: f32,
    g: f32,
    dt: f32,
    time: f32,
    disturbance_change_timescale: f32,
    disturbance_time_shift: f32,  
    disturbance_max_distance: f32, 
    disturbance_initial_traj: f32,
    disturbance_traj_timefactor: f32,
    disturbance_final_traj: f32,  
    disturbance_expo: f32,  
    disturbance_vol_data: f32,  
    disturbance_gamma_val: f32, 
};


@group(0) @binding(0) var<uniform> globals: Globals;

@group(0) @binding(1) var txBottom: texture_2d<f32>;  
@group(0) @binding(2) var txState: texture_2d<f32>; 
@group(0) @binding(3) var txBottomInitial: texture_2d<f32>; 
@group(0) @binding(4) var txtemp_AddDisturbance: texture_storage_2d<rgba32float, write>;
@group(0) @binding(5) var txBoundaryForcing: texture_storage_2d<rgba32float, write>;
@group(0) @binding(6) var txtemp_bottom: texture_storage_2d<rgba32float, write>;
@group(0) @binding(7) var txBotChange_Sed: texture_2d<f32>; 

fn solitary_wave(xloc: f32, yloc: f32, amplitude: f32, angle: f32, depth: f32, bottom: f32) -> vec4<f32> {
    let k = sqrt(0.75 * abs(amplitude)/pow(depth,3.0));
    let c = sqrt(globals.g * (amplitude + depth));

    var eta = amplitude / pow(cosh(k * (xloc * cos(angle) + yloc * sin(angle))),2.0);
    let P = sqrt(1.0 + 0.5 * amplitude / depth) * eta * c * cos(angle);
    let Q = sqrt(1.0 + 0.5 * amplitude / depth) * eta * c * sin(angle);
    
    if(bottom > 0.0){
        eta = max(0.0, eta - bottom);  // since this is added to the existing state - which for dry areas, eta = bottom already
    }

    return vec4(eta, P, Q, 0.0);
}

fn landslide_subaerial(xloc: f32, yloc: f32, thickness: f32, angle: f32, bottom: f32, width: f32, length: f32) -> vec4<f32> {
    let kL = sqrt(3.1415) / length;
    let kW = sqrt(3.1415) / width;

    let sin_c = sin(angle);
    let cos_c = cos(angle);

    let xc = xloc * cos_c + yloc * sin_c;
    let x_sin = xloc * sin_c;
    let y_cos = yloc * cos_c;
	let yc = sqrt( x_sin * x_sin + y_cos * y_cos);

    var eta = thickness * (exp(-( xc * xc * kL * kL ))) * exp(-( yc * yc * kW * kW ));
    let h = max(1.e-5, (eta - bottom));
	let P = eta * sqrt( globals.g * h) * cos_c;
	let Q = eta * sqrt( globals.g * h) * sin_c;

    if(bottom > 0.0){
        eta = max(0.0, eta - bottom);  // since this is added to the existing state - which for dry areas, eta = bottom already
    }

    return vec4(eta, P, Q, 0.0);
}

fn landslide_submerged(xloc: f32, yloc: f32, thickness: f32, angle: f32, bottom: f32, width: f32, length: f32) -> vec4<f32> {
    let kL = sqrt(3.1415) / length / 2;  // /2 for submerged since we have both postive and negative dipole, and each should be "length" long
    let kW = sqrt(3.1415) / width;

    let sin_c = sin(angle);
    let cos_c = cos(angle);

    let xc = xloc * cos_c + yloc * sin_c;
    let x_sin = xloc * sin_c;
    let y_cos = yloc * cos_c;
    let yc = sqrt( x_sin * x_sin + y_cos * y_cos);

    // Modified eta for dipole initial condition
    var eta = thickness * (2.0 * xc * kL ) * exp(- ( xc * xc * kL * kL )) * exp(- ( yc * yc * kW * kW ));
    let h = max(1.e-5, (eta - bottom));
    let P = 0.;
    let Q = 0.;

    if(bottom > 0.0){
        eta = max(0.0, eta - bottom);  // Adjust eta for dry areas
    }

    return vec4(eta, P, Q, 0.0);
}


fn depth_motion(xloc_in: f32, yloc_in: f32, bottom: f32, time: f32, dt: f32, bottom_initial: f32) -> vec4<f32> {
    
    var time_local = time;
    if (time_local > 1.0e5*dt) {
        time_local = 1.0e5*dt;
    }

    let change_timescale = globals.disturbance_change_timescale;
    let time_shift = globals.disturbance_time_shift;
    let max_displacement = globals.disturbance_max_distance;
    let initial_traj = globals.disturbance_initial_traj;
    let traj_timefactor = globals.disturbance_traj_timefactor;
    let final_traj = globals.disturbance_final_traj;

    //let angle = globals.disturbanceDir;
    let p3 = globals.disturbanceLength;
    let p4 = globals.disturbanceWidth;

    let expo = globals.disturbance_expo;
    let vol_data = globals.disturbance_vol_data;
    let gamma_val = globals.disturbance_gamma_val;

    let displacement = max_displacement*(1.0+tanh((time_local-time_shift)/(change_timescale)))/2.0;
    let traj_angle = min(final_traj,initial_traj + displacement/max_displacement*(final_traj-initial_traj)*traj_timefactor) * 3.1415 / 180.; 
    
    let angle = 3.1415-traj_angle;

    let d_xdist=displacement*cos(traj_angle);
    let d_ydist=-displacement*sin(traj_angle);
    
    let sin_c = sin(angle);
    let cos_c = cos(angle);

    let xloc = xloc_in - d_xdist;
    let yloc = yloc_in - d_ydist;
    
    let norm = vol_data * pow(expo, 2.0) / (4.0 * pow(2.0, 2.0 / expo) * p3 * p4 * pow(gamma_val, 2.0));

    // Compute the two terms in the exponent.
    let term1 = pow( abs(xloc * cos(angle) + yloc * sin(angle)) / p3, expo);
    let term2 = pow( abs( -xloc * sin(angle) + yloc * cos(angle)) / p4, expo);

    // Compute the slide_current value.
    let d_bottom = norm * exp( - (term1 + term2) / 2.0);

    let bottom_new = bottom_initial + d_bottom;
    var dhdt = (bottom_new - bottom) / dt;

    if (time_local < 5.*dt) {
        dhdt = 0.0;
    }

    return vec4(0.0, dhdt, bottom_new, 0.0);
}


@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = vec2<i32>(i32(id.x), i32(id.y));

    let bottom_tex = textureLoad(txBottom, idx, 0);
    let bottom_initial_tex = textureLoad(txBottomInitial, idx, 0) + textureLoad(txBotChange_Sed, idx, 0);
    var bottom = bottom_tex.z;
    let depth = globals.base_depth;
    var in_state_here = textureLoad(txState, idx, 0);

    var disturbance = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    var depth_change = vec4<f32>(0.0, 0.0, bottom, bottom);
    var B_here =  bottom_tex;

    let xo = globals.disturbanceXpos;
    let yo = globals.disturbanceYpos;

    let xloc = f32(id.x)*globals.dx - xo;
    let yloc = f32(id.y)*globals.dy - yo;

    if (globals.disturbanceType == 1) {      // solitary wave
        let amplitude = globals.disturbanceCrestamp;
        let angle = globals.disturbanceDir * 3.1415 / 180.;
        disturbance = solitary_wave(xloc, yloc, amplitude, angle, depth, bottom);

    } else if (globals.disturbanceType == 2) {   // earthquake 
        let slip = globals.disturbanceCrestamp;
        let strike = globals.disturbanceDir * 3.1415 / 180.;
        let width = globals.disturbanceWidth;
        let length = globals.disturbanceLength;
        let dip = globals.disturbanceDip * 3.1415 / 180.;
        let rake = globals.disturbanceRake * 3.1415 / 180.;
  //      disturbance = earthquake(xloc, yloc, slip, strike, width, length, dip, rake);

    } else if (globals.disturbanceType == 3) {   // submerged landslide
        let thickness = globals.disturbanceCrestamp;
        let angle = globals.disturbanceDir * 3.1415 / 180.;
        let width = globals.disturbanceWidth;
        let length = globals.disturbanceLength;
        disturbance = landslide_submerged(xloc, yloc, thickness, angle, bottom, width, length);

    } else if (globals.disturbanceType == 4) {   // subaerial landslide
        let thickness = globals.disturbanceCrestamp;
        let angle = globals.disturbanceDir * 3.1415 / 180.;
        let width = globals.disturbanceWidth;
        let length = globals.disturbanceLength;
        disturbance = landslide_subaerial(xloc, yloc, thickness, angle, bottom, width, length);

    } else if (globals.disturbanceType == 5) {   // prescribed depth motion
        // North
        bottom = bottom_tex.x;
        var bottom_initial = bottom_initial_tex.x;
        depth_change = depth_motion(xloc, yloc+0.5*globals.dy, bottom, globals.time, globals.dt, bottom_initial);
        B_here.x = depth_change.z;        

        // East
        bottom = bottom_tex.y;
        bottom_initial = bottom_initial_tex.y;
        depth_change = depth_motion(xloc+0.5*globals.dx, yloc, bottom, globals.time, globals.dt, bottom_initial);
        B_here.y = depth_change.z;  

       // center - do this one last, as we will save the depth_change texture for the center only
        bottom = bottom_tex.z;
        bottom_initial = bottom_initial_tex.z;
        depth_change = depth_motion(xloc, yloc, bottom, globals.time, globals.dt, bottom_initial);
        B_here.z = depth_change.z;

     //   if(bottom_initial_tex.z > 0.0 ) {  // without this, the slide creates water on dry land (for subaerial slides).
     //       B_here = bottom_tex;
     //       depth_change.y = 0.0;
     //   } 
    }

    let state_out = in_state_here + disturbance;

    textureStore(txtemp_AddDisturbance, idx, state_out);
    textureStore(txBoundaryForcing, idx, depth_change);
    textureStore(txtemp_bottom, idx, B_here);
}

