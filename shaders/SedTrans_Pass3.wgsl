struct Globals {
    width: i32,
    height: i32,
    dt: f32,
    dx: f32,
    dy: f32,
    one_over_dx: f32,
    one_over_dy: f32,
    timeScheme: i32,
    pred_or_corrector: i32,
    one_over_d2x: f32,
    one_over_d2y: f32,
    one_over_dxdy: f32,
    epsilon: f32,
    isManning: i32,
    friction: f32,
    sedC1_shields: f32,
    sedC1_criticalshields: f32,
    sedC1_erosion: f32,
    sedC1_n: f32,
    sedC1_fallvel: f32,
};

@group(0) @binding(0) var<uniform> globals: Globals;

@group(0) @binding(1) var txState_Sed: texture_2d<f32>;
@group(0) @binding(2) var txXFlux_Sed: texture_2d<f32>;
@group(0) @binding(3) var txYFlux_Sed: texture_2d<f32>;
@group(0) @binding(4) var oldGradients_Sed: texture_2d<f32>;
@group(0) @binding(5) var oldOldGradients_Sed: texture_2d<f32>;
@group(0) @binding(6) var predictedGradients_Sed: texture_2d<f32>;
@group(0) @binding(7) var txBottom: texture_2d<f32>;
@group(0) @binding(8) var txState: texture_2d<f32>;

@group(0) @binding(9) var txNewState_Sed: texture_storage_2d<rgba32float, write>;
@group(0) @binding(10) var dU_by_dt_Sed: texture_storage_2d<rgba32float, write>;
@group(0) @binding(11) var erosion_Sed: texture_storage_2d<rgba32float, write>;
@group(0) @binding(12) var depostion_Sed: texture_storage_2d<rgba32float, write>;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = vec2<i32>(i32(id.x), i32(id.y));

    if (idx.x >= globals.width - 2 || idx.y >= globals.height - 2 || idx.x <= 1 || idx.y <= 1) {
        let zero = vec4<f32>(0.0, 0.0, 0.0, 0.0);
        textureStore(txNewState_Sed, idx, zero);
        textureStore(dU_by_dt_Sed, idx, zero);
        return;
    }

    let leftIdx = idx + vec2<i32>(-1, 0);
    let rightIdx = idx + vec2<i32>(1, 0);
    let downIdx = idx + vec2<i32>(0, -1);
    let upIdx = idx + vec2<i32>(0, 1);
    let upleftIdx = idx + vec2<i32>(-1, 1);
    let uprightIdx = idx + vec2<i32>(1, 1);
    let downleftIdx = idx + vec2<i32>(-1, -1);
    let downrightIdx = idx + vec2<i32>(1, -1);

    // Load values from txXFlux and txYFlux using idx
    var xflux_here = textureLoad(txXFlux_Sed, idx, 0);
    var xflux_west = textureLoad(txXFlux_Sed, leftIdx, 0);
    var yflux_here = textureLoad(txYFlux_Sed, idx, 0);
    var yflux_south = textureLoad(txYFlux_Sed, downIdx, 0);

    // Calculate scalar transport additions
    let C_state_here = textureLoad(txState_Sed, idx, 0);
    let C_state_right = textureLoad(txState_Sed, rightIdx, 0);
    let C_state_left = textureLoad(txState_Sed, leftIdx, 0);
    let C_state_up = textureLoad(txState_Sed, upIdx, 0);
    let C_state_down = textureLoad(txState_Sed, downIdx, 0);
    let C_state_up_left = textureLoad(txState_Sed, upleftIdx, 0);
    let C_state_up_right = textureLoad(txState_Sed, uprightIdx, 0);
    let C_state_down_left = textureLoad(txState_Sed, downleftIdx, 0);
    let C_state_down_right = textureLoad(txState_Sed, downrightIdx, 0);

    let Dxx = 1.0;
    let Dxy = 1.0;
    let Dyy = 1.0;

    let hc_by_dx_dx = Dxx * globals.one_over_d2x * (C_state_right - 2.0 * C_state_here + C_state_left);
    let hc_by_dy_dy = Dyy * globals.one_over_d2y * (C_state_up - 2.0 * C_state_here + C_state_down);
    let hc_by_dx_dy = Dxy * globals.one_over_dxdy * (C_state_up_right - C_state_up_left - C_state_down_right + C_state_down_left) / 4.0;

    let B = textureLoad(txBottom, idx, 0).z;
    let in_state_here = textureLoad(txState, idx, 0);
    let eta = in_state_here.x;
    let hu = in_state_here.y;
    let hv = in_state_here.z;
    let h = eta - B;

    let h2 = h * h;
    let divide_by_h = 2.0 * h / sqrt(h2 + max(h2, globals.epsilon));

    var f: f32;
    if (globals.isManning == 1) {
        f = 9.81 * pow(globals.friction, 2.0) * pow(abs(divide_by_h), 1.0 / 3.0);
    } else {
        f = globals.friction / 2.0;
    }

    let u = hu * divide_by_h;
    let v = hv * divide_by_h;
    let local_speed = sqrt(u * u + v * v);
    let shear_velocity = sqrt(f) * local_speed;
    let shields = shear_velocity * shear_velocity * globals.sedC1_shields;

    var erosion = 0.0;
    if (shields >= globals.sedC1_criticalshields) {
        erosion = globals.sedC1_erosion * (shields - globals.sedC1_criticalshields) * local_speed * divide_by_h;
    }

    let Cmin = max(1.0e-6, C_state_here.x);   // only for C1 right now
    let deposition = min(2.0, (1.0 - globals.sedC1_n) / Cmin) * C_state_here.x * globals.sedC1_fallvel;

    let source_term = hc_by_dx_dx + hc_by_dy_dy + 2.0 * hc_by_dx_dy + erosion - deposition;

    let d_by_dt = (xflux_west - xflux_here) * globals.one_over_dx + (yflux_south - yflux_here) * globals.one_over_dy + source_term;

    // previous derivatives
    let oldies = textureLoad(oldGradients_Sed, idx, 0);
    let oldOldies = textureLoad(oldOldGradients_Sed, idx, 0);

    var newState = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    if (globals.timeScheme == 0) {
        newState = C_state_here + globals.dt * d_by_dt;

    } else if (globals.pred_or_corrector == 1) {
        newState = C_state_here + globals.dt / 12.0 * (23.0 * d_by_dt - 16.0 * oldies + 5.0 * oldOldies);

    } else if (globals.pred_or_corrector == 2) {
        let predicted = textureLoad(predictedGradients_Sed, idx, 0);
        newState = C_state_here + globals.dt / 24.0 * (9.0 * d_by_dt + 19.0 * predicted - 5.0 * oldies + oldOldies);
    }

    textureStore(txNewState_Sed, idx, newState);
    textureStore(dU_by_dt_Sed, idx, d_by_dt);
    textureStore(erosion_Sed, idx, vec4<f32>(erosion, 0.0, 0.0, 0.0));
    textureStore(depostion_Sed, idx, vec4<f32>(deposition, 0.0, 0.0, 0.0));
}