// Define structures and bindings

struct Globals {
    width: i32,
    height: i32,
    epsilon: f32,
    dt: f32,
    base_depth: f32,
    dx_global: f32,
    dy_global: f32,
};


@group(0) @binding(0) var<uniform> globals: Globals;

@group(0) @binding(1) var txState: texture_2d<f32>;
@group(0) @binding(2) var txBottom: texture_2d<f32>;
@group(0) @binding(3) var txHnear: texture_storage_2d<rgba32float, write>;


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
//    let in_here = textureLoad(txState, idx, 0).x;
    let in_south = textureLoad(txState, downIdx, 0).x;
    let in_north = textureLoad(txState, upIdx, 0).x;
    let in_west = textureLoad(txState, leftIdx, 0).x;
    let in_east = textureLoad(txState, rightIdx, 0).x;

//    let B_here = textureLoad(txBottom, idx, 0).z;
    let B_south = textureLoad(txBottom, downIdx, 0).z;
    let B_north = textureLoad(txBottom, upIdx, 0).z;
    let B_west = textureLoad(txBottom, leftIdx, 0).z;
    let B_east = textureLoad(txBottom, rightIdx, 0).z;

//    let h_here = in_here.x - B_here;
    let h_south = in_south - B_south;
    let h_north = in_north - B_north;
    let h_west = in_west - B_west;
    let h_east = in_east - B_east;

    var h_vec = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    h_vec.x= h_north; //min(h_here, h_north);
    h_vec.y= h_east; //min(h_here, h_east);
    h_vec.z= h_south; //min(h_here, h_south);
    h_vec.w= h_west; //min(h_here, h_west);

    textureStore(txHnear, idx, h_vec);  //move this output texture to BC call, and keep the C calcs here

}

