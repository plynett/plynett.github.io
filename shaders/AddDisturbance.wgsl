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
};

@group(0) @binding(0) var<uniform> globals: Globals;

@group(0) @binding(1) var txBottom: texture_2d<f32>;  
@group(0) @binding(2) var txState: texture_2d<f32>; 
@group(0) @binding(3) var txtemp_AddDisturbance: texture_storage_2d<rgba32float, write>;


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



@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = vec2<i32>(i32(id.x), i32(id.y));

    let bottom = textureLoad(txBottom, idx, 0).z;
    let depth = globals.base_depth;
    let in_state_here = textureLoad(txState, idx, 0);

    var disturbance = vec4<f32>(0.0, 0.0, 0.0, 0.0);

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

    }

    let state_out = in_state_here + disturbance;

    textureStore(txtemp_AddDisturbance, idx, state_out);
}

