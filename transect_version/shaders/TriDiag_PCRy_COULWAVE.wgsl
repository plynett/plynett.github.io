struct Globals {
    width: i32,
    height: i32,
    p: i32,
    s: i32,
    Py: i32,
    delta: f32,
};

@group(0) @binding(0) var<uniform> globals: Globals;

@group(0) @binding(1) var coefMaty: texture_2d<f32>;
@group(0) @binding(2) var current_state: texture_2d<f32>;
@group(0) @binding(3) var current_stateUVstar: texture_2d<f32>;

@group(0) @binding(4) var txtemp: texture_storage_2d<rgba32float, write>;
@group(0) @binding(5) var txtemp2: texture_storage_2d<rgba32float, write>;

@group(0) @binding(6) var txBottom: texture_2d<f32>;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = vec2<i32>(i32(id.x), i32(id.y));
    let CurrentState = textureLoad(current_state, idx, 0);
    
    let s = (globals.s);
    let width = (globals.width);
    let height = (globals.height);

//    let zero = vec4<f32>(0.0, 1.0, 0.0, CurrentState.b);
//    textureStore(txtemp, idx, zero);
//    textureStore(txtemp2, idx, CurrentState);

    // Return if in imaginary grid points
//    if (idx.x >= width - 2 || idx.y >= height - 2 || idx.x <= 1 || idx.y <= 1) {
//        return;
//    }

    let idx_left =  vec2<i32>(idx.x, (idx.y - s + height) % height);
    let idx_right = vec2<i32>(idx.x, (idx.y + s + height) % height);
    
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

        bIn = textureLoad(coefMaty, idx, 0).g;
        bInLeft = textureLoad(coefMaty, idx_left, 0).g;
        bInRight = textureLoad(coefMaty, idx_right, 0).g;
        
        aIn = textureLoad(coefMaty, idx, 0).r / bIn;
        aInLeft = textureLoad(coefMaty, idx_left, 0).r / bInLeft;
        aInRight = textureLoad(coefMaty, idx_right, 0).r / bInRight;
        
        cIn = textureLoad(coefMaty, idx, 0).b / bIn;
        cInLeft = textureLoad(coefMaty, idx_left, 0).b / bInLeft;
        cInRight =  textureLoad(coefMaty, idx_right, 0).b / bInRight;
        
        dIn = textureLoad(coefMaty, idx, 0).a / bIn;
        dInLeft = textureLoad(coefMaty, idx_left, 0).a / bInLeft;
        dInRight = textureLoad(coefMaty, idx_right, 0).a / bInRight;
        
    } else {
        
        aIn = textureLoad(coefMaty, idx, 0).r;
        aInLeft = textureLoad(coefMaty, idx_left, 0).r;
        aInRight = textureLoad(coefMaty, idx_right, 0).r;
        
        cIn = textureLoad(coefMaty, idx, 0).b;
        cInLeft = textureLoad(coefMaty, idx_left, 0).b;
        cInRight = textureLoad(coefMaty, idx_right, 0).b;
        
        dIn = textureLoad(coefMaty, idx, 0).a;
        dInLeft = textureLoad(coefMaty, idx_left, 0).a;
        dInRight = textureLoad(coefMaty, idx_right, 0).a;
    }
    
    let r = 1.0 / (1.0 - aIn * cInLeft - cIn * aInRight);
    let aOut = -r * aIn * aInLeft;
    let cOut = -r * cIn * cInRight;
    var dOut = r * (dIn - aIn * dInLeft - cIn * dInRight);
    
    if(globals.p == globals.Py - 1) {  // for COULWAVE need to convert velocity back to flux
        let H_loc = max(globals.delta, CurrentState.r - textureLoad(txBottom, idx, 0).z);
        dOut = dOut * H_loc;
    }

    let txtemp_out = vec4<f32>(aOut, 1.0, cOut, dOut);
    let txtemp2_out = vec4<f32>(CurrentState.r, CurrentState.g, dOut, CurrentState.a);

    textureStore(txtemp, idx,  txtemp_out);
    textureStore(txtemp2, idx, txtemp2_out);




}
