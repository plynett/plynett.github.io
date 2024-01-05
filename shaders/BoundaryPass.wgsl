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
};

@group(0) @binding(0) var<uniform> globals: Globals;
@group(0) @binding(1) var txState: texture_2d<f32>;
@group(0) @binding(2) var txBottom: texture_2d<f32>;
@group(0) @binding(3) var txWaves: texture_2d<f32>;

@group(0) @binding(4) var txNewState: texture_storage_2d<rgba32float, write>;

fn WestBoundarySolid(idx: vec2<i32>) -> vec4<f32> {
    let shift = 8;
    let real_idx = vec2<i32>(shift  - idx.x, idx.y); 
    let in_state_real = textureLoad(txState, real_idx, 0);
    return vec4<f32>(in_state_real.r, -in_state_real.g, in_state_real.b, in_state_real.a);
}

fn EastBoundarySolid(idx: vec2<i32>) -> vec4<f32> {
    let real_idx = vec2<i32>(globals.reflect_x - idx.x, idx.y);
    let in_state_real = textureLoad(txState, real_idx, 0);
    return vec4<f32>(in_state_real.r, -in_state_real.g, in_state_real.b, in_state_real.a);
}

fn SouthBoundarySolid(idx: vec2<i32>) -> vec4<f32> {
    let shift = 8;
    let real_idx = vec2<i32>(idx.x, shift  - idx.y);
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

fn sineWave(x: f32, y: f32, t: f32, d: f32, amplitude: f32, period: f32, theta: f32, phase: f32) -> vec3<f32> {
    let omega = 2.0 * globals.PI / period;
    let k = calc_wavenumber_approx(omega, d);
    let c = omega / k;
    let theta_mod = theta;
    let kx = cos(theta_mod) * x * k;
    let ky = sin(theta_mod) * y * k;
    let eta = amplitude * sin(omega * t - kx - ky + phase) * min(1.0, t / period);
    let speed = globals.boundary_g * eta / (c * k) * tanh(k * d);
    let hu = speed * cos(theta_mod);
    let hv = speed * sin(theta_mod);
    return vec3<f32>(eta, hu, hv);
}

fn BoundarySineWave(idx: vec2<i32>) -> vec4<f32> {
    let B_here = textureLoad(txBottom, idx, 0).b;
    let d_here = max(0.0, globals.seaLevel - B_here);
    let x = f32(idx.x) * globals.dx;
    let y = f32(idx.y) * globals.dy;
    var result: vec3<f32> = vec3<f32>(0.0, 0.0, 0.0);
    
    if (d_here > 0.0001) {
        for (var iw: i32 = 0; iw < globals.numberOfWaves; iw = iw + 1) {
            let wave = textureLoad(txWaves, vec2<i32>(iw, 0), 0);
            result = result + sineWave(x, y, globals.total_time, d_here, wave.r, wave.g, wave.b, wave.a);
        }
    }
    return vec4<f32>(result, 0.0);
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx: vec2<i32> = vec2<i32>(i32(id.x), i32(id.y));
    var BCState: vec4<f32> = textureLoad(txState, idx, 0);
    
    // Sponge Layers
    // west boundary
    if (globals.west_boundary_type == 1 && idx.x <= 2 + (globals.BoundaryWidth)) {
        BCState = WestBoundarySponge(idx);
    }

    // east boundary
    if (globals.east_boundary_type == 1 && idx.x >= globals.width - (globals.BoundaryWidth) - 1) {
        BCState = EastBoundarySponge(idx);
    }

    // south boundary
    if (globals.south_boundary_type == 1 && idx.y <= 2 + (globals.BoundaryWidth)) {
        BCState = SouthBoundarySponge(idx);
    }

    // north boundary
    if (globals.north_boundary_type == 1 && idx.y >= globals.height - (globals.BoundaryWidth) - 1) {
        BCState = NorthBoundarySponge(idx);
    }

    // Solid Walls
    // west boundary
    if (globals.west_boundary_type <= 1) {
        if (idx.x <= 1) {
            BCState = WestBoundarySolid(idx);
        } else if (idx.x == 2) {
            BCState.y = 0.0;
        }
    }

    // east boundary
    if (globals.east_boundary_type <= 1) {
        if (idx.x >= globals.width - 2) {
            BCState = EastBoundarySolid(idx);
        } else if (idx.x == globals.width - 3) {
            BCState.y = 0.0;
        }
    }

    // south boundary
    if (globals.south_boundary_type <= 1) {
        if (idx.y <= 1) {
            BCState = SouthBoundarySolid(idx);
        } else if (idx.y == 2) {
            BCState.z = 0.0;
        }
    }

    // north boundary
    if (globals.north_boundary_type <= 1) {
        if (idx.y >= globals.height - 2) {
            BCState = NorthBoundarySolid(idx);
        } else if (idx.y == globals.height - 3) {
            BCState.z = 0.0;
        }
    }

    // Sine Waves
    // west boundary
    if (globals.west_boundary_type == 2 && idx.x <= 2) {
        BCState = BoundarySineWave(idx);
    }

    // east boundary
    if (globals.east_boundary_type == 2 && idx.x >= globals.width - 3) {
        BCState = BoundarySineWave(idx);
    }

    // south boundary
    if (globals.south_boundary_type == 2 && idx.y <= 2) {
        BCState = BoundarySineWave(idx);
    }

    // north boundary
    if (globals.north_boundary_type == 2 && idx.y >= globals.height - 3) {
        BCState = BoundarySineWave(idx);
    }

    // Check for negative depths
    let bottom = textureLoad(txBottom, idx, 0).z;
    if (BCState.x <= bottom) {
        BCState = vec4<f32>(bottom, 0.0, 0.0, 0.0);
    }

    textureStore(txNewState, idx, BCState);
}
