struct Globals {
    width: i32,
    height: i32,
};

@group(0) @binding(0) var<uniform> globals: Globals;

@group(0) @binding(1) var txNewState: texture_2d<f32>;
@group(0) @binding(2) var txBottom: texture_2d<f32>;
@group(0) @binding(3) var txMeans_Speed: texture_2d<f32>;
@group(0) @binding(4) var txRenderVarsf16: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = vec2<i32>(i32(id.x), i32(id.y));
    
    let eta = textureLoad(txNewState, idx, 0).r;
    let foam = textureLoad(txNewState, idx, 0).a;
    let bottom = textureLoad(txBottom, idx, 0).b;
    let max_eta = textureLoad(txMeans_Speed, idx, 0).a;

    let output = vec4<f32>(eta, max_eta, bottom, foam);

    textureStore(txRenderVarsf16, idx,  output);
}

