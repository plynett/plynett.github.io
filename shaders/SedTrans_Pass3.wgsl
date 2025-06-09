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
    base_depth: f32,
    delta: f32,
    sedTurbDispersion: f32,
    sedBreakingDispersionCoef: f32,
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

@group(0) @binding(13) var txBreaking: texture_2d<f32>;
@group(0) @binding(14) var txU: texture_2d<f32>;
@group(0) @binding(15) var txV: texture_2d<f32>;
@group(0) @binding(16) var txSed_C1: texture_2d<f32>;
@group(0) @binding(17) var txHardBottom: texture_2d<f32>;

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

    let B = textureLoad(txBottom, idx, 0).z;
    let in_state_here = textureLoad(txState, idx, 0);
    let eta = in_state_here.x;
    let hu = in_state_here.y;
    let hv = in_state_here.z;
    let h = eta - B;

    // Load values from txXFlux and txYFlux using idx
    var xflux_here = textureLoad(txXFlux_Sed, idx, 0);
    var xflux_west = textureLoad(txXFlux_Sed, leftIdx, 0);
    var yflux_here = textureLoad(txYFlux_Sed, idx, 0);
    var yflux_south = textureLoad(txYFlux_Sed, downIdx, 0);

    // Calculate scalar transport additions
    // var c4 = textureLoad(txSed_C1, idx, 0);
    // let C_here = (c4.x + c4.y + c4.z + c4.w) / 4.0;
    // let H_here = h;
    // c4 = textureLoad(txSed_C1, rightIdx, 0);
    // let C_right = (c4.x + c4.y + c4.z + c4.w) / 4.0;
    // let H_right = textureLoad(txState, rightIdx, 0).x - textureLoad(txBottom, rightIdx, 0).z;
    // c4 = textureLoad(txSed_C1, leftIdx, 0);
    // let C_left = (c4.x + c4.y + c4.z + c4.w) / 4.0;
    // let H_left = textureLoad(txState, leftIdx, 0).x - textureLoad(txBottom, leftIdx, 0).z;
    // c4 = textureLoad(txSed_C1, upIdx, 0);
    // let C_up = (c4.x + c4.y + c4.z + c4.w) / 4.0;
    // let H_up = textureLoad(txState, upIdx, 0).x - textureLoad(txBottom, upIdx, 0).z;
    // c4 = textureLoad(txSed_C1, downIdx, 0);
    // let C_down = (c4.x + c4.y + c4.z + c4.w) / 4.0;
    // let H_down = textureLoad(txState, downIdx, 0).x - textureLoad(txBottom, downIdx, 0).z;
    
    // let max_Kh = min(10.0, 0.5 * globals.dx * globals.dy / globals.dt);
    // let Kh_here = min(max_Kh, globals.sedTurbDispersion + globals.sedBreakingDispersionCoef * textureLoad(txBreaking, idx, 0).y);
    // let Kh_right = min(max_Kh, globals.sedTurbDispersion + globals.sedBreakingDispersionCoef * textureLoad(txBreaking, rightIdx, 0).y);
    // let Kh_up = min(max_Kh, globals.sedTurbDispersion + globals.sedBreakingDispersionCoef * textureLoad(txBreaking, upIdx, 0).y);
    // let Kh_left = min(max_Kh, globals.sedTurbDispersion + globals.sedBreakingDispersionCoef * textureLoad(txBreaking, leftIdx, 0).y);
    // let Kh_down = min(max_Kh, globals.sedTurbDispersion + globals.sedBreakingDispersionCoef * textureLoad(txBreaking, downIdx, 0).y);
    // let Kh_average = Kh_here; // + 0.125 * (Kh_right + Kh_up + Kh_left + Kh_down); // background nu of 1.0, good for tsunami models

    // let C_xx = globals.one_over_d2x * (C_right - 2.0 * C_here + C_left);
    // let C_yy = globals.one_over_d2y * (C_up - 2.0 * C_here + C_down);
    // let C_x  = 0.5 * globals.one_over_dx * (C_right - C_left);
    // let C_y  = 0.5 * globals.one_over_dy * (C_up - C_down);

    // let Kh_x = 0.5 * globals.one_over_dx * (Kh_right * H_right - Kh_left * H_left);
    // let Kh_y = 0.5 * globals.one_over_dy * (Kh_up * H_up - Kh_down * H_down);

    // let hc_by_dx_dx = Kh_average * H_here * C_xx + Kh_x * C_x;
    // let hc_by_dy_dy = Kh_average * H_here * C_yy + Kh_y * C_y;

    // friction
    let h_scaled = h / globals.base_depth;
    let h2 = h_scaled * h_scaled;
    let divide_by_h = 2.0 * h_scaled / (h2 + max(h2, 1.e-6)) / globals.base_depth;

    var f: f32;
    if (globals.isManning == 1) {
        f = 9.81 * pow(globals.friction, 2.0) * pow(abs(divide_by_h), 1.0 / 3.0);
    } else {
        f = globals.friction;
    }

    // u, v here
    var u4 = textureLoad(txU, idx, 0);
    var v4 = textureLoad(txV, idx, 0);
    let u = (u4.x + u4.y + u4.z + u4.w) / 4.0;
    let v = (v4.x + v4.y + v4.z + v4.w) / 4.0;
    let local_speed = sqrt(u * u + v * v);
    let shear_velocity = sqrt(f) * local_speed;
    let shields = shear_velocity * shear_velocity * globals.sedC1_shields;

    var erosion = 0.0;
    if (shields >= globals.sedC1_criticalshields) {
        erosion = globals.sedC1_erosion * (shields - globals.sedC1_criticalshields) * local_speed * divide_by_h;
        erosion = max(erosion, 0.0);
    }
    let hardbottom = textureLoad(txHardBottom, idx, 0).x;
    let avaliable_depth = B - hardbottom;
    if (avaliable_depth < globals.delta) {
        erosion = 0.0;
    }

    var deposition = min(2.0 * C_here, 1.0 - globals.sedC1_n) * globals.sedC1_fallvel;
    deposition = max(deposition, 0.0);

    let source_term = erosion - deposition;

    let d_by_dt = (xflux_west - xflux_here) * globals.one_over_dx + (yflux_south - yflux_here) * globals.one_over_dy + source_term;

    // previous derivatives
    let oldies = textureLoad(oldGradients_Sed, idx, 0);
    let oldOldies = textureLoad(oldOldGradients_Sed, idx, 0);

    var newState = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    let C_state_here = textureLoad(txState_Sed, idx, 0);
    if (globals.timeScheme == 0) {
        newState = C_state_here + globals.dt * d_by_dt;

    } else if (globals.pred_or_corrector == 1) {
        newState = C_state_here + globals.dt / 12.0 * (23.0 * d_by_dt - 16.0 * oldies + 5.0 * oldOldies);

    } else if (globals.pred_or_corrector == 2) {
        let predicted = textureLoad(predictedGradients_Sed, idx, 0);
        newState = C_state_here + globals.dt / 24.0 * (9.0 * d_by_dt + 19.0 * predicted - 5.0 * oldies + oldOldies);
    }

    newState = max(newState, vec4<f32>(0.0, 0.0, 0.0, 0.0)); // ensure no negative concentrations

    textureStore(txNewState_Sed, idx, newState);
    textureStore(dU_by_dt_Sed, idx, d_by_dt);
    textureStore(erosion_Sed, idx, vec4<f32>(erosion, 0.0, 0.0, 0.0));
    textureStore(depostion_Sed, idx, vec4<f32>(deposition, 0.0, 0.0, 0.0));
}