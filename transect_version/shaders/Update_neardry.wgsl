struct Globals {
    width: i32,
    height: i32,
};

@group(0) @binding(0) var<uniform> globals: Globals;

@group(0) @binding(1) var txBottom: texture_2d<f32>; 
@group(0) @binding(2) var txtemp_bottom: texture_storage_2d<rgba32float, write>;


@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = vec2<i32>(i32(id.x), i32(id.y));

    var B_here = textureLoad(txBottom, idx, 0);

    // update neardry
    let lengthCheck = 3;    // check within three points
    B_here.w = 99.;
   // for (var yy = idx.y - lengthCheck; yy <= idx.y + lengthCheck; yy += 1) 
   // {
        for (var xx = idx.x - lengthCheck; xx <= idx.x + lengthCheck; xx += 1) {
            let xC = min(globals.width - 1, max(0, xx));
           // let yC = min(globals.height - 1, max(0, yy));

           // let idx_C = vec2<i32>(xC, yC);
            let idx_C = vec2<i32>(xC, idx.y);
            let bathy_C = textureLoad(txBottom, idx_C, 0).z;
            if (bathy_C >= 0.) 
            {
                B_here.w = -99.;
            }
                
        }
   // }

    // check for single point islands
    let leftIdx = idx + vec2<i32>(-1, 0);
    let rightIdx = idx + vec2<i32>(1, 0);
   // let downIdx = idx + vec2<i32>(0, -1);
   // let upIdx = idx + vec2<i32>(0, 1);
   // let B_south = textureLoad(txBottom, downIdx, 0).z;
   // let B_north = textureLoad(txBottom, upIdx, 0).z;
    let B_west = textureLoad(txBottom, leftIdx, 0).z;
    let B_east = textureLoad(txBottom, rightIdx, 0).z;
    if(B_here.z > 0.){
       // if(B_south < 0.0 && B_north < 0.0 && B_west < 0.0 && B_east < 0.0) {
        if(B_west < 0.0 && B_east < 0.0) {
            B_here.z = 0.0;
           // B_here.x = B_north / 2.0;
            B_here.y = B_east / 2.0;
        }
    }

    textureStore(txtemp_bottom, idx, B_here);
}

