struct Uniforms {
    k: f32,
    omega: f32,
    t: f32,
};


@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var etaTexture: texture_storage_2d<rgba32float, write>;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    var texelCoord: vec2<u32> = global_id.xy; 
    let x = f32(global_id.x);
    let y = f32(global_id.y);

    let eta = 0.5*sin(uniforms.k * x - uniforms.omega * uniforms.t);

    textureStore(etaTexture, texelCoord, vec4<f32>(eta, 0.0, 0.0, 0.0));

}
