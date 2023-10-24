struct Globals {
    width: i32,
    height: i32,
    p: i32,
    s: i32,
};

@group(0) @binding(0) var<uniform> globals: Globals;

@group(0) @binding(1) var coefMatx: texture_2d<f32>;
@group(0) @binding(2) var current_state: texture_2d<f32>;
@group(0) @binding(3) var current_stateUVstar: texture_2d<f32>;

@group(0) @binding(4) var txtemp: texture_storage_2d<rgba32float, write>;
@group(0) @binding(5) var txtemp2: texture_storage_2d<rgba32float, write>;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = vec2<i32>(i32(id.x), i32(id.y));
    let CurrentState = textureLoad(current_state, idx, 0);
    
    let s = (globals.s);
    let width = (globals.width);
    let height = (globals.height);

 //   let zero = vec4<f32>(0.0, 1.0, 0.0, CurrentState.g);
//    textureStore(txtemp, idx, zero);
//    textureStore(txtemp2, idx, CurrentState);

    // Return if in imaginary grid points
//    if (idx.x >= width - 2 || idx.y >= height - 2 || idx.x <= 1 || idx.y <= 1) {
//        return;
//    }

    let idx_left =  vec2<i32>((idx.x - s + width) % width, idx.y);
    let idx_right = vec2<i32>((idx.x + s + width) % width, idx.y);

    var aIn = 0.0;
    var bIn = 0.0;
    var cIn = 0.0;
    var dIn = 0.0;

    var aInLeft = 0.0;
    var bInLeft = 0.0;
    var cInLeft = 0.0;
    var dInLeft = 0.0;

    var aInRight = 0.0;
    var bInRight = 0.0;
    var cInRight = 0.0;
    var dInRight = 0.0;
    
    if (globals.p == 0) {
        
        bIn = textureLoad(coefMatx, idx, 0).g;
        bInLeft = textureLoad(coefMatx, idx_left, 0).g;
        bInRight = textureLoad(coefMatx, idx_right, 0).g;
        
        aIn = textureLoad(coefMatx, idx, 0).r / bIn;
        aInLeft = textureLoad(coefMatx, idx_left, 0).r / bInLeft;
        aInRight = textureLoad(coefMatx, idx_right, 0).r / bInRight;
        
        cIn = textureLoad(coefMatx, idx, 0).b / bIn;
        cInLeft = textureLoad(coefMatx, idx_left, 0).b / bInLeft;
        cInRight = textureLoad(coefMatx, idx_right, 0).b / bInRight;
        
        dIn = textureLoad(current_stateUVstar, idx, 0).g / bIn;
        dInLeft = textureLoad(current_stateUVstar, idx_left, 0).g / bInLeft;
        dInRight = textureLoad(current_stateUVstar, idx_right, 0).g / bInRight;
    } else {
        
        aIn = textureLoad(coefMatx, idx, 0).r;
        aInLeft = textureLoad(coefMatx, idx_left, 0).r;
        aInRight = textureLoad(coefMatx, idx_right, 0).r;
        
        cIn = textureLoad(coefMatx, idx, 0).b;
        cInLeft = textureLoad(coefMatx, idx_left, 0).b;
        cInRight = textureLoad(coefMatx, idx_right, 0).b;
        
        dIn = textureLoad(coefMatx, idx, 0).a;
        dInLeft = textureLoad(coefMatx, idx_left, 0).a;
        dInRight = textureLoad(coefMatx, idx_right, 0).a;
    }
    
    let r = 1.0 / (1.0 - aIn * cInLeft - cIn * aInRight);
    let aOut = -r * aIn * aInLeft;
    let cOut = -r * cIn * cInRight;
    let dOut = r * (dIn - aIn * dInLeft - cIn * dInRight);
    
    let txtemp_out = vec4<f32>(aOut, 1.0, cOut, dOut);
    let txtemp2_out = vec4<f32>(CurrentState.r, dOut, CurrentState.b, CurrentState.a);

    textureStore(txtemp, idx,  txtemp_out);
    textureStore(txtemp2, idx, txtemp2_out);
}

