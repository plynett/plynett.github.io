// skybox.frag.wgsl

@group(0) @binding(1) var skyboxTexture : texture_cube<f32>;
@group(0) @binding(2) var skyboxSampler : sampler;

@fragment
fn fs_main(
    @location(0) dir : vec3<f32>    // pull in the direction straight
) -> @location(0) vec4<f32> {
    return textureSample(skyboxTexture, skyboxSampler, dir);
}
