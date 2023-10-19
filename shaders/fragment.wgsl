struct FragmentOutput {
    @location(0) color: vec4<f32>,
};

@group(0) @binding(0) var etaTexture: texture_2d<f32>;
@group(0) @binding(1) var bottomTexture: texture_2d<f32>;
@group(0) @binding(2) var textureSampler: sampler;

@fragment
fn fs_main(@location(1) uv: vec2<f32>) -> FragmentOutput {
    var out: FragmentOutput;
    
    let waves = textureSample(etaTexture, textureSampler, uv);
    let bottom = textureSample(bottomTexture, textureSampler, uv);

    var color_rgb: vec3<f32>;
    if (bottom.b + 0.01 > waves.r) {
        color_rgb = vec3<f32>(210.0 / 255.0, 180.0 / 255.0, 140.0 / 255.0) + 0.05 * bottom.b;
    } else {
        let color_wave = vec3<f32>(0.5, 0.5, 1.0) + 0.5*waves.r;
        color_rgb = color_wave;
    }

    out.color = vec4<f32>(color_rgb, 1.0);
    return out;
}