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

@group(0) @binding(1) var txState: texture_2d<f32>;
@group(0) @binding(2) var txBottom: texture_2d<f32>;
@group(0) @binding(3) var txH: texture_storage_2d<rgba32float, write>;
@group(0) @binding(4) var txU: texture_storage_2d<rgba32float, write>;
@group(0) @binding(5) var txV: texture_storage_2d<rgba32float, write>;
@group(0) @binding(6) var txC: texture_storage_2d<rgba32float, write>;

fn MinMod(a: f32, b: f32, c: f32) -> f32 {
    if (a > 0.0 && b > 0.0 && c > 0.0) {
        return min(min(a, b), c);
    } else if (a < 0.0 && b < 0.0 && c < 0.0) {
        return max(max(a, b), c);
    } else {
        return 0.0;
    }
}


fn Reconstruct_w(west: f32, here: f32, east: f32, TWO_THETAc: f32) -> vec2<f32> {
    let z1 = TWO_THETAc * (here - west);
    let z2 = (east - west);
    let z3 = TWO_THETAc * (east - here);

    let dx_grad_over_two = 0.25 * MinMod(z1, z2, z3);

    let out_east = here + dx_grad_over_two;
    let out_west = here - dx_grad_over_two;

    return vec2(out_west, out_east);
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
    let in_here = textureLoad(txState, idx, 0);
    let in_south = textureLoad(txState, downIdx, 0);
    let in_north = textureLoad(txState, upIdx, 0);
    let in_west = textureLoad(txState, leftIdx, 0);
    let in_east = textureLoad(txState, rightIdx, 0);

    // Load bed elevation data for this pixel's edges
    let Bxy = textureLoad(txBottom, idx, 0).xy;
    let Bz = textureLoad(txBottom, downIdx, 0).x;
    let Bw = textureLoad(txBottom, leftIdx, 0).y;
    let B = vec4<f32>(Bxy, Bz, Bw);

    let B_here = textureLoad(txBottom, idx, 0).z;
    let B_south = textureLoad(txBottom, downIdx, 0).z;
    let B_north = textureLoad(txBottom, upIdx, 0).z;
    let B_west = textureLoad(txBottom, leftIdx, 0).z;
    let B_east = textureLoad(txBottom, rightIdx, 0).z;

    let h_here = in_here.x - B_here;
    let h_south = in_south.x - B_south;
    let h_north = in_north.x - B_north;
    let h_west = in_west.x - B_west;
    let h_east = in_east.x - B_east;

    // Initialize variables for water height, momentum components, and standard deviation
    var h = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    var w = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    var hu = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    var hv = vec4<f32>(0.0, 0.0, 0.0, 0.0);

    // Prepare for water height reconstruction based on whether the flow is overland or not
    let wetdry = min(B.w, min(B.z, min(B.y, B.x)));
    let rampcoef = min(max(0.0, wetdry / (0.02 * globals.base_depth)), 1.0);
    let TWO_THETAc = globals.TWO_THETA * rampcoef + 2.0 * (1.0 - rampcoef);  // transition to full upwinding with overland flow, start transition at base_depth/50.

    if (wetdry >= 0.0) {
        let hwy = Reconstruct(h_west, h_here, h_east, TWO_THETAc);
        let hzx = Reconstruct(h_south, h_here, h_north, TWO_THETAc);
        h = vec4<f32>(hzx.y, hwy.y, hzx.x, hwy.x);
        w = h + B;
    } else {
        let wwy = Reconstruct_w(in_west.x, in_here.x, in_east.x, TWO_THETAc);
        let wzx = Reconstruct_w(in_south.x, in_here.x, in_north.x, TWO_THETAc);
        w = vec4<f32>(wzx.y, wwy.y, wzx.x, wwy.x);
        h = w - B;
    }

    let huwy = Reconstruct(in_west.y, in_here.y, in_east.y, TWO_THETAc);
    let huzx = Reconstruct(in_south.y, in_here.y, in_north.y, TWO_THETAc);
    hu = vec4<f32>(huzx.y, huwy.y, huzx.x, huwy.x);

    let hvwy = Reconstruct(in_west.z, in_here.z, in_east.z, TWO_THETAc);
    let hvzx = Reconstruct(in_south.z, in_here.z, in_north.z, TWO_THETAc);
    hv = vec4<f32>(hvzx.y, hvwy.y, hvzx.x, hvwy.x);

    // Scalar reconstruct
    var hc: vec4<f32>; 
    let hcwy = Reconstruct(in_west.w, in_here.w, in_east.w, TWO_THETAc);
    let hczx = Reconstruct(in_south.w, in_here.w, in_north.w, TWO_THETAc);
    hc = vec4<f32>(hczx.y, hcwy.y, hczx.x, hcwy.x);

    // CalcUVC 
    var u: vec4<f32>;
    var v: vec4<f32>;
    var c: vec4<f32>;
    let h2 = h * h;
    let divide_by_h = 2.0 * h / (h2 + max(h2, vec4<f32>(globals.epsilon)));
    u = divide_by_h * hu;
    v = divide_by_h * hv;
    c = divide_by_h * hc;
    let speed = sqrt(u * u + v * v);
    let Fr = speed / sqrt(9.81 / divide_by_h);
    let Frumax = max(Fr.x, max(Fr.y, max(Fr.z, Fr.w)));
    let Fr_maxallowed = 3.0;
    if (Frumax > Fr_maxallowed) {
        let Fr_red = Fr_maxallowed / Frumax;
        u = u * Fr_red;
        v = v * Fr_red;
    }

    if (h_here <= 0.0) {
        h = vec4<f32>(0.0, 0.0, 0.0, 0.0);
        u = vec4<f32>(0.0, 0.0, 0.0, 0.0);
        v = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    }

    textureStore(txH, idx, h);
    textureStore(txU, idx, u);
    textureStore(txV, idx, v);
    textureStore(txC, idx, c);

}

