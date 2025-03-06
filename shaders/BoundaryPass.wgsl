struct Globals {
    width: i32,
    height: i32,
    dt: f32,
    dx: f32,
    dy: f32,
    total_time: f32,
    reflect_x: i32,
    reflect_y: i32,
    PI: f32,
    BoundaryWidth: i32,
    seaLevel: f32,
    boundary_nx: i32,
    boundary_ny: i32,
    numberOfWaves: i32,
    west_boundary_type: i32,
    east_boundary_type: i32,
    south_boundary_type: i32,
    north_boundary_type: i32,
    boundary_g: f32,
    delta: f32,
    boundary_shift: i32,
    base_depth: f32,
    incident_wave_type: i32,
    incident_wave_H: f32,
    incident_wave_T: f32,
    incident_wave_direction: f32,
};

@group(0) @binding(0) var<uniform> globals: Globals;
@group(0) @binding(1) var txState: texture_2d<f32>;
@group(0) @binding(2) var txBottom: texture_2d<f32>;
@group(0) @binding(3) var txWaves: texture_2d<f32>;
@group(0) @binding(4) var txState_Sed: texture_2d<f32>;

@group(0) @binding(5) var txNewState: texture_storage_2d<rgba32float, write>;
@group(0) @binding(6) var txNewState_Sed: texture_storage_2d<rgba32float, write>;

@group(0) @binding(7) var txBreaking: texture_2d<f32>;
@group(0) @binding(8) var txtemp_Breaking: texture_storage_2d<rgba32float, write>;

fn WestBoundarySolid(idx: vec2<i32>) -> vec4<f32> {
    let real_idx = vec2<i32>(globals.boundary_shift  - idx.x, idx.y); 
    let in_state_real = textureLoad(txState, real_idx, 0);
    return vec4<f32>(in_state_real.r, -in_state_real.g, in_state_real.b, in_state_real.a);
}

fn EastBoundarySolid(idx: vec2<i32>) -> vec4<f32> {
    let real_idx = vec2<i32>(globals.reflect_x - idx.x, idx.y);
    let in_state_real = textureLoad(txState, real_idx, 0);
    return vec4<f32>(in_state_real.r, -in_state_real.g, in_state_real.b, in_state_real.a);
}

fn SouthBoundarySolid(idx: vec2<i32>) -> vec4<f32> {
    let real_idx = vec2<i32>(idx.x, globals.boundary_shift  - idx.y);
    let in_state_real = textureLoad(txState, real_idx, 0);
    return vec4<f32>(in_state_real.r, in_state_real.g, -in_state_real.b, in_state_real.a);
}

fn NorthBoundarySolid(idx: vec2<i32>) -> vec4<f32> {
    let real_idx = vec2<i32>(idx.x, globals.reflect_y - idx.y);
    let in_state_real = textureLoad(txState, real_idx, 0);
    return vec4<f32>(in_state_real.r, in_state_real.g, -in_state_real.b, in_state_real.a);
}

fn WestBoundarySponge(idx: vec2<i32>) -> vec4<f32> {
    let gamma = pow(0.5 * (0.5 + 0.5 * cos(globals.PI * (f32(globals.BoundaryWidth - idx.x) + 2.0) / f32(globals.BoundaryWidth - 1))), 0.005);
    let new_state = textureLoad(txState, idx, 0);
    return vec4<f32>(gamma * new_state.r, gamma * new_state.g, gamma * new_state.b, gamma * new_state.a);
}

fn EastBoundarySponge(idx: vec2<i32>) -> vec4<f32> {
    let gamma = pow(0.5 * (0.5 + 0.5 * cos(globals.PI * (f32(globals.BoundaryWidth - globals.boundary_nx - idx.x)) / f32(globals.BoundaryWidth - 1))), 0.005);
    let new_state = textureLoad(txState, idx, 0);
    return vec4<f32>(gamma * new_state.r, gamma * new_state.g, gamma * new_state.b, gamma * new_state.a);
}

fn SouthBoundarySponge(idx: vec2<i32>) -> vec4<f32> {
    let gamma = pow(0.5 * (0.5 + 0.5 * cos(globals.PI * (f32(globals.BoundaryWidth - idx.y) + 2.0) / f32(globals.BoundaryWidth - 1))), 0.005);
    let new_state = textureLoad(txState, idx, 0);
    return vec4<f32>(new_state.r, gamma * new_state.g, gamma * new_state.b, gamma * new_state.a);
}

fn NorthBoundarySponge(idx: vec2<i32>) -> vec4<f32> {
    let gamma = pow(0.5 * (0.5 + 0.5 * cos(globals.PI * (f32(globals.BoundaryWidth - globals.boundary_ny - idx.y)) / f32(globals.BoundaryWidth - 1))), 0.005);
    let new_state = textureLoad(txState, idx, 0);
    return vec4<f32>(new_state.r, gamma * new_state.g, gamma * new_state.b, gamma * new_state.a);
}

fn calc_wavenumber_approx(omega: f32, d: f32) -> f32 {
    let k = omega * omega / (globals.boundary_g * sqrt(tanh(omega * omega * d / globals.boundary_g)));
    return k;
}

fn SolitaryWave(idx: vec2<i32>, x0: f32, y0: f32, theta: f32) -> vec4<f32> {

    let B_here = -globals.base_depth; //textureLoad(txBottom, idx, 0).b;
    let d = max(0.0, -B_here);
    let x = f32(idx.x) * globals.dx;
    let y = f32(idx.y) * globals.dy;
    let t = globals.total_time;
    let amplitude = 0.5;

    let xloc = x - x0;
    let yloc = y - y0;
    let k = sqrt(0.75 * abs(amplitude)/pow(d,3.0));
    let c = sqrt(globals.boundary_g * (amplitude + d));

    let eta = amplitude / pow(cosh(k * (xloc * cos(theta) + yloc * sin(theta) - c * t)),2.0);
    let hu = sqrt(1.0 + 0.5 * amplitude / d) * eta * c * cos(theta);
    let hv = sqrt(1.0 + 0.5 * amplitude / d) * eta * c * sin(theta);

    return vec4<f32>(eta, hu, hv, 0.0);
}

fn sineWave(x: f32, y: f32, t: f32, d: f32, amplitude: f32, period: f32, theta: f32, phase: f32, current_boundary: i32) -> vec3<f32> {
    let omega = 2.0 * globals.PI / period;
    let k = calc_wavenumber_approx(omega, d);
    let c = omega / k;
    let L = 2 * globals.PI / k;
    let theta_mod = theta;

    // modulate the location of the origin slowly in time to reduce the Hs finger effect
    var yshift= 0.0;
    var xshift= 0.0;
    if (current_boundary == 1 || current_boundary == 3) {
        yshift= 5.0 * L + 0.05 * L * t / period;
    }
    if (current_boundary == 2 || current_boundary == 4) {
        xshift= 5.0 * L + 0.05 * L * t / period;
    }
    
    let kx = cos(theta_mod) * (x + xshift) * k;
    let ky = sin(theta_mod) * (y + yshift) * k;
    var eta = amplitude * sin(omega * t - kx - ky + phase) * min(1.0, t / period);
    var num_waves = 0;
    if (globals.incident_wave_type == 2){ // transient pulse
        num_waves = 4;
    }
    if(num_waves > 0){
        eta = eta * max(0.0, min(1.0, ((f32(num_waves) * period - t)/(period))));
    }
    let speed = globals.boundary_g * eta / (c * k) * tanh(k * d);
    let hu = speed * cos(theta_mod);
    let hv = speed * sin(theta_mod);
    return vec3<f32>(eta, hu, hv);
}

fn BoundarySineWave(idx: vec2<i32>, iBC: i32, jBC: i32, current_boundary: i32) -> vec4<f32> {
    let B_here = -globals.base_depth; //textureLoad(txBottom, idx, 0).b;
    let d_here = max(0.0, -B_here);
    let x = f32(idx.x - iBC) * globals.dx;
    let y = f32(idx.y - jBC) * globals.dy;
    var result: vec3<f32> = vec3<f32>(0.0, 0.0, 0.0);
    
    if (d_here > 0.0001) {
        for (var iw: i32 = 0; iw < globals.numberOfWaves; iw = iw + 1) {
            let wave = textureLoad(txWaves, vec2<i32>(iw, 0), 0);
            result = result + sineWave(x, y, globals.total_time, d_here, wave.r, wave.g, wave.b, wave.a, current_boundary);
        }
    }
    return vec4<f32>(result, 0.0);
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = vec2<i32>(i32(id.x), i32(id.y));
    var BCState = textureLoad(txState, idx, 0);
    var BCState_Sed = textureLoad(txState_Sed, idx, 0);
    var BCState_Breaking = textureLoad(txBreaking, idx, 0);
    let B_here = textureLoad(txBottom, idx, 0).z;
    let zero = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    BCState_Sed = max(BCState_Sed,zero);  // concentration can not go negative
    
    // Sponge Layers
    // west boundary
    if (globals.west_boundary_type == 1 && idx.x <= 2 + (globals.BoundaryWidth)) {
        BCState = WestBoundarySponge(idx);
        BCState_Sed = zero;
    }

    // east boundary
    if (globals.east_boundary_type == 1 && idx.x >= globals.width - (globals.BoundaryWidth) - 1) {
        BCState = EastBoundarySponge(idx);
        BCState_Sed = zero;
    }

    // south boundary
    if (globals.south_boundary_type == 1 && idx.y <= 2 + (globals.BoundaryWidth)) {
        BCState = SouthBoundarySponge(idx);
        BCState_Sed = zero;
    }

    // north boundary
    if (globals.north_boundary_type == 1 && idx.y >= globals.height - (globals.BoundaryWidth) - 1) {
        BCState = NorthBoundarySponge(idx);
        BCState_Sed = zero;
    }

    // Solid Walls
    // west boundary
    if (globals.west_boundary_type <= 1) {
        if (idx.x <= 1) {
            BCState = WestBoundarySolid(idx);
            BCState_Sed = zero;
        } else if (idx.x == 2) {
            BCState.y = 0.0;
            BCState_Sed = zero;
        }
    }

    // east boundary
    if (globals.east_boundary_type <= 1) {
        if (idx.x >= globals.width - 2) {
            BCState = EastBoundarySolid(idx);
            BCState_Sed = zero;
        } else if (idx.x == globals.width - 3) {
            BCState.y = 0.0;
            BCState_Sed = zero;
        }
    }

    // south boundary
    if (globals.south_boundary_type <= 1) {
        if (idx.y <= 1) {
            BCState = SouthBoundarySolid(idx);
            BCState_Sed = zero;
        } else if (idx.y == 2) {
            BCState.z = 0.0;
            BCState_Sed = zero;
        }
    }

    // north boundary
    if (globals.north_boundary_type <= 1) {
        if (idx.y >= globals.height - 2) {
            BCState = NorthBoundarySolid(idx);
            BCState_Sed = zero;
        } else if (idx.y == globals.height - 3) {
            BCState.z = 0.0;
            BCState_Sed = zero;
        }
    }

    // Incoming Waves
    // west boundary
    if (globals.west_boundary_type == 2 && idx.x <= 2) {
        if (globals.incident_wave_type <= 2) { // Sine Waves
            let iBC = 1;
            let jBC = 1;
            let current_boundary = 1;
            BCState = BoundarySineWave(idx, iBC, jBC, current_boundary);
            BCState_Sed = zero;
        } else if (globals.incident_wave_type == 3) {  // solitary wave
            let x0 = -10.0 * globals.base_depth;
            let y0 = 0.0;
            let theta = 0.0;
            BCState = SolitaryWave(idx, x0, y0, theta);
            BCState_Sed = zero;
        }
    }

    // east boundary
    if (globals.east_boundary_type == 2 && idx.x >= globals.width - 3) {
        if (globals.incident_wave_type <= 2) { // Sine Waves
            let iBC = globals.width - 2;
            let jBC = 1;
            let current_boundary = 3;
            BCState = BoundarySineWave(idx, iBC, jBC, current_boundary);
            BCState_Sed = zero;
        } else if (globals.incident_wave_type == 3) {  // solitary wave
            let x0 = f32(globals.width) * globals.dx + 10.0 * globals.base_depth;
            let y0 = 0.0;
            let theta = -3.1415;
            BCState = SolitaryWave(idx, x0, y0, theta);
            BCState_Sed = zero;
        }
    } 

    // south boundary
    if (globals.south_boundary_type == 2 && idx.y <= 2) {
        if (globals.incident_wave_type <= 2) { // Sine Waves
            let iBC = 1;
            let jBC = 1;
            let current_boundary = 2;
            BCState = BoundarySineWave(idx, iBC, jBC, current_boundary);
            BCState_Sed = zero;
        } else if (globals.incident_wave_type == 3) {  // solitary wave
            let x0 = 0.0;
            let y0 = -10.0 * globals.base_depth;
            let theta = 3.1415 / 2.0;
            BCState = SolitaryWave(idx, x0, y0, theta);
            BCState_Sed = zero;
        }
    }

    // north boundary
    if (globals.north_boundary_type == 2 && idx.y >= globals.height - 3) {
        if (globals.incident_wave_type <= 2) { // Sine Waves
            let iBC = 1;
            let jBC = globals.height - 2;
            let current_boundary = 4;
            BCState = BoundarySineWave(idx, iBC, jBC, current_boundary);
            BCState_Sed = zero;
        } else if (globals.incident_wave_type == 3) {  // solitary wave
            let x0 = 0.0;
            let y0 = f32(globals.height) * globals.dy + 10.0 * globals.base_depth;
            let theta = -3.1415 / 2.0;
            BCState = SolitaryWave(idx, x0, y0, theta);
            BCState_Sed = zero;
        }
    }

    // Periodic boundary conditions
    // west boundary
    if (globals.west_boundary_type == 3) {
        if (idx.x <= 1) {
            let idx_east = vec2<i32>(globals.width - (6 - idx.x), idx.y);
            BCState = textureLoad(txState, idx_east, 0);
            BCState_Sed = textureLoad(txState_Sed, idx_east, 0);
            BCState_Breaking = textureLoad(txBreaking, idx_east, 0);
        }
    }

    // east boundary
    if (globals.east_boundary_type == 3) {
        if (idx.x >= globals.width - 2) {
            let idx_west = vec2<i32>(idx.x + 6 - globals.width, idx.y);
            BCState = textureLoad(txState, idx_west, 0);
            BCState_Sed = textureLoad(txState_Sed, idx_west, 0);
            BCState_Breaking = textureLoad(txBreaking, idx_west, 0);
        }
    }

    // south boundary
    if (globals.south_boundary_type == 3) {
        if (idx.y <= 1) {
            let idx_north = vec2<i32>(idx.x, globals.height - (6 - idx.y));
            BCState = textureLoad(txState, idx_north, 0);
            BCState_Sed = textureLoad(txState_Sed, idx_north, 0);
            BCState_Breaking = textureLoad(txBreaking, idx_north, 0);
        }
    }

    // north boundary
    if (globals.north_boundary_type == 3) {
        if (idx.y >= globals.height - 2) {
            let idx_south = vec2<i32>(idx.x, idx.y + 6 - globals.height);
            BCState = textureLoad(txState, idx_south, 0);
            BCState_Sed = textureLoad(txState_Sed, idx_south, 0);
            BCState_Breaking = textureLoad(txBreaking, idx_south, 0);
        }
    }

    // Constant elevation boundary conditions
    // west boundary
    var stage_elevation = 0.0;
    var stage_speed = 0.0;
    if (globals.incident_wave_type == 10) {  // 10-year flood
        stage_elevation = 8.2;
        stage_speed = 1.5;
    }
    else if (globals.incident_wave_type == 11) { // 50-year flood
        stage_elevation = 10.2;
        stage_speed = 2.;
    }
    else if (globals.incident_wave_type == 12) { // 100-yr flood
        stage_elevation = 10.6;
        stage_speed = 2.2;
    }
    else if (globals.incident_wave_type == 13) {  // 200-yr flood
        stage_elevation = 11.2;
        stage_speed = 2.3;
    }
    else if (globals.incident_wave_type == 14) {  // 500-yr flood
        stage_elevation = 11.8;
        stage_speed = 2.5;
    }


    if (globals.west_boundary_type == 4) {
        var left_bottom_start = 490.;
        if (stage_elevation > 10.0) {left_bottom_start = 390.;}
        if (idx.x <= 1 && f32(idx.y) * globals.dy > left_bottom_start && f32(idx.y) * globals.dy < 600. ) {  //LARIVER MOD
            let flow_depth = max(stage_elevation - B_here, 0.0);
            let hu = flow_depth * stage_speed;
            let hv = 0.0;
            var conc = 0.0;
            if (f32(idx.y) * globals.dy > 505 && f32(idx.y) * globals.dy < 570. && i32(globals.total_time / 30.0) % 2 == 0) {conc = 1.0;}
            BCState = vec4<f32>(stage_elevation, hu, hv, conc);
            BCState_Sed = vec4<f32>(0.0, 0.0, 0.0, 0.0);
            BCState_Breaking = vec4<f32>(0.0, 0.0, 0.0, 0.0);
        }
    }
    // east boundary
    if (globals.east_boundary_type == 4) {
        if (idx.x >= globals.width - 2 && f32(idx.y) * globals.dy > 575. && f32(idx.y) * globals.dy < 685. ) {  //LARIVER MOD
            let elev_downstream = stage_elevation - 5.0; 
            let flow_depth = max(elev_downstream - B_here, 0.0);
            let hu = flow_depth * stage_speed;
            let hv = 0.0;
            BCState = vec4<f32>(elev_downstream , hu, hv, 0.0);
            BCState_Sed = vec4<f32>(0.0, 0.0, 0.0, 0.0);
            BCState_Breaking = vec4<f32>(0.0, 0.0, 0.0, 0.0);
        }
    }


    let leftIdx = idx + vec2<i32>(-1, 0);
    let rightIdx = idx + vec2<i32>(1, 0);
    let downIdx = idx + vec2<i32>(0, -1);
    let upIdx = idx + vec2<i32>(0, 1);

    let B_south = textureLoad(txBottom, downIdx, 0).z;
    let B_north = textureLoad(txBottom, upIdx, 0).z;
    let B_west = textureLoad(txBottom, leftIdx, 0).z;
    let B_east = textureLoad(txBottom, rightIdx, 0).z;

    let state_west = textureLoad(txState, leftIdx, 0);
    let state_east = textureLoad(txState, rightIdx, 0);
    let state_south = textureLoad(txState, downIdx, 0);
    let state_north = textureLoad(txState, upIdx, 0);

    var eta_here = BCState.x;
    var eta_west = state_west.x;
    var eta_east = state_east.x;
    var eta_south = state_south.x;
    var eta_north = state_north.x;
    
    var u_west = state_west.y;
    var u_east = state_east.y;
    var u_south = state_south.y;
    var u_north = state_north.y;
    
    var v_west = state_west.z;
    var v_east = state_east.z;
    var v_south = state_south.z;
    var v_north = state_north.z;

    var h_here = eta_here - B_here;
    let h_west = eta_west - B_west;
    let h_east = eta_east - B_east;
    let h_south = eta_south - B_south;
    let h_north = eta_north - B_north;

    var h_cut = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    h_cut.x= max(globals.delta, abs(B_here - B_north));
    h_cut.y= max(globals.delta, abs(B_here - B_east));
    h_cut.z= max(globals.delta, abs(B_here - B_south));
    h_cut.w= max(globals.delta, abs(B_here - B_west));

    var dry_here = 1;
    var dry_west = 1;
    var dry_east = 1;
    var dry_south = 1;
    var dry_north = 1;

    if (h_here <= globals.delta) { dry_here = 0;}
    if (h_west <= h_cut.w) { dry_west = 0;}
    if (h_east <= h_cut.y) { dry_east = 0;}
    if (h_south <= h_cut.z) { dry_south = 0;}
    if (h_north <= h_cut.x) { dry_north = 0;}

    let sum_dry = dry_west + dry_east + dry_south + dry_north;

    var h_min = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    h_min.x= min(h_here, h_north);
    h_min.y= min(h_here, h_east);
    h_min.z= min(h_here, h_south);
    h_min.w= min(h_here, h_west);

    let wetdry = min(h_here, min(h_south, min(h_north, min(h_west, h_east))));
    let nearshore = min(B_here, min(B_south, min(B_north, min(B_west, B_east))));

    var boundary_boolean = -1;
    if (idx.x >= globals.width - 2 || idx.y >= globals.height - 3 || idx.x <= 1 || idx.y <= 3) {
        boundary_boolean = 1;
    }

    // remove islands
    if( dry_here == 1 && boundary_boolean < 0) {  // point is wet
        if (sum_dry == 0) {  // freeze single point wet areas
            if (B_here <= 0.0) {
                BCState = vec4<f32>(max(BCState.x,B_here), 0.0, 0.0, 0.0);
                BCState_Sed = zero;
            }
            else {
                BCState = vec4<f32>(B_here, 0.0, 0.0, 0.0);
                BCState_Sed = zero;
            }
        }
        else if (sum_dry == 1) {  // freeze end of single grid channel, with free surface gradient equal to zero
            let wet_eta = (f32(dry_west)*eta_west + f32(dry_east)*eta_east + f32(dry_south)*eta_south + f32(dry_north)*eta_north) / f32(sum_dry);
            BCState = vec4<f32>(wet_eta, 0.0, 0.0, 0.0);
            BCState_Sed = zero;
        }
    }

    // Check for negative depths
    h_here = BCState.x  - B_here;
    if (h_here <= globals.delta) {
            if (B_here <= 0.0) {
                BCState = vec4<f32>(max(BCState.x,B_here), 0.0, 0.0, 0.0);
            }
            else {
                BCState = vec4<f32>(B_here, 0.0, 0.0, 0.0);
            }
            BCState_Sed = zero;
    }

    textureStore(txNewState, idx, BCState);
    textureStore(txNewState_Sed, idx, BCState_Sed);
    textureStore(txtemp_Breaking, idx, BCState_Breaking);
}
