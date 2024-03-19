// Define structures and bindings

struct Globals {
    width: u32,
    height: u32,
    one_over_dx: f32,
    one_over_dy: f32,
    dissipation_threshold: f32,
    TWO_THETA: f32,
    epsilon: f32,
    whiteWaterDecayRate: f32,
    dt: f32,
    base_depth: f32,
    dx_global: f32,
    dy_global: f32,
};

@group(0) @binding(0) var<uniform> globals: Globals;

@group(0) @binding(1) var txState_Sed: texture_2d<f32>;
@group(0) @binding(2) var txBottom: texture_2d<f32>;
@group(0) @binding(3) var txH: texture_2d<f32>;
@group(0) @binding(4) var txSed_C1: texture_storage_2d<rgba32float, write>;
@group(0) @binding(5) var txSed_C2: texture_storage_2d<rgba32float, write>;
@group(0) @binding(6) var txSed_C3: texture_storage_2d<rgba32float, write>;
@group(0) @binding(7) var txSed_C4: texture_storage_2d<rgba32float, write>;

fn MinMod(a: f32, b: f32, c: f32) -> f32 {
    if (a > 0.0 && b > 0.0 && c > 0.0) {
        return min(min(a, b), c);
    } else if (a < 0.0 && b < 0.0 && c < 0.0) {
        return max(max(a, b), c);
    } else {
        return 0.0;
    }
}

fn Reconstruct(west: f32, here: f32, east: f32, TWO_THETAc: f32) -> vec2<f32> {
    let z1 = TWO_THETAc * (here - west);
    let z2 = (east - west);
    let z3 = TWO_THETAc * (east - here);

    let dx_grad_over_two = 0.25 * MinMod(z1, z2, z3);

    let out_east = here + dx_grad_over_two;
    let out_west = here - dx_grad_over_two;

    return vec2(out_west, out_east);
}

@compute @workgroup_size(16, 16) //
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    // Convert the 3D thread ID to a 2D grid coordinate
    let idx = vec2<i32>(i32(id.x), i32(id.y));

    // Compute the coordinates of the neighbors for each pixel, and enforce boundary conditions
    let rightIdx = min(idx + vec2<i32>(1, 0), vec2<i32>(i32(globals.width)-1, i32(globals.height)-1));
    let upIdx = min(idx + vec2<i32>(0, 1), vec2<i32>(i32(globals.width)-1, i32(globals.height)-1));
    let leftIdx = max(idx + vec2<i32>(-1, 0), vec2<i32>(0, 0));
    let downIdx = max(idx + vec2<i32>(0, -1), vec2<i32>(0, 0));

    // Read in the state of the water at this pixel and its neighbors
    let in_here = textureLoad(txState_Sed, idx, 0);
    let in_south = textureLoad(txState_Sed, downIdx, 0);
    let in_north = textureLoad(txState_Sed, upIdx, 0);
    let in_west = textureLoad(txState_Sed, leftIdx, 0);
    let in_east = textureLoad(txState_Sed, rightIdx, 0);

    let B_here = textureLoad(txBottom, idx, 0).z;
    let B_south = textureLoad(txBottom, downIdx, 0).z;
    let B_north = textureLoad(txBottom, upIdx, 0).z;
    let B_west = textureLoad(txBottom, leftIdx, 0).z;
    let B_east = textureLoad(txBottom, rightIdx, 0).z;

    let dB_west = abs(B_here - B_west);
    let dB_east = abs(B_here - B_east);
    let dB_south = abs(B_here - B_south);
    let dB_north = abs(B_here - B_north);
    let dB_max = 0.5*vec4<f32>(dB_north, dB_east, dB_south, dB_west);

    let h_here = in_here.x - B_here;
    let h_south = in_south.x - B_south;
    let h_north = in_north.x - B_north;
    let h_west = in_west.x - B_west;
    let h_east = in_east.x - B_east;

    // Initialize variables for water height, momentum components, and standard deviation
    var hc1 = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    var hc2 = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    var hc3 = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    var hc4 = vec4<f32>(0.0, 0.0, 0.0, 0.0);

    // modify limiters based on whether near the inundation limit
    let wetdry = min(h_here, min(h_south, min(h_north, min(h_west, h_east))));
    let rampcoef = min(max(0.0, wetdry / (0.02 * globals.base_depth)), 1.0);
    let TWO_THETAc = globals.TWO_THETA * rampcoef + 2.0 * (1.0 - rampcoef);  // transition to full upwinding with overland flow, start transition at base_depth/50.

    let c1_wy = Reconstruct(in_west.x, in_here.x, in_east.x, TWO_THETAc);
    let c1_zx = Reconstruct(in_south.x, in_here.x, in_north.x, TWO_THETAc);
    hc1 = vec4<f32>(c1_zx.y, c1_wy.y, c1_zx.x, c1_wy.x);

    let c2_wy = Reconstruct(in_west.y, in_here.y, in_east.y, TWO_THETAc);
    let c2_zx = Reconstruct(in_south.y, in_here.y, in_north.y, TWO_THETAc);
    hc2 = vec4<f32>(c2_zx.y, c2_wy.y, c2_zx.x, c2_wy.x);

    let c3_wy = Reconstruct(in_west.z, in_here.z, in_east.z, TWO_THETAc);
    let c3_zx = Reconstruct(in_south.z, in_here.z, in_north.z, TWO_THETAc);
    hc3 = vec4<f32>(c3_zx.y, c3_wy.y, c3_zx.x, c3_wy.x);

    let c4_wy = Reconstruct(in_west.w, in_here.w, in_east.w, TWO_THETAc);
    let c4_zx = Reconstruct(in_south.w, in_here.w, in_north.w, TWO_THETAc);
    hc4 = vec4<f32>(c4_zx.y, c4_wy.y, c4_zx.x, c4_wy.x);

    // CalcUVC 
    var c1 = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    var c2 = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    var c3 = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    var c4 = vec4<f32>(0.0, 0.0, 0.0, 0.0);

    let h = textureLoad(txH, idx, 0);
    let h2 = h * h;
    let epsilon_c = max(vec4<f32>(globals.epsilon), dB_max);
    let divide_by_h = 2.0 * h / (h2 + max(h2, epsilon_c));  // this is important - the local depth used for the edges should not be less than the difference in water depth across the edge
    c1 = divide_by_h * hc1;
    c2 = divide_by_h * hc2;
    c3 = divide_by_h * hc3;
    c4 = divide_by_h * hc4;        

    textureStore(txSed_C1, idx, c1);
    textureStore(txSed_C2, idx, c2);
    textureStore(txSed_C3, idx, c3);
    textureStore(txSed_C4, idx, c4);  

}

