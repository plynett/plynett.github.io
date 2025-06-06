// duck.frag.wgsl

struct Uniforms {
  viewProj   : mat4x4<f32>,
  model      : mat4x4<f32>,
  cameraPos  : vec3<f32>,
  _pad       : f32
};
@group(0) @binding(0) var<uniform> u : Uniforms;

@group(0) @binding(1) var albedoTex : texture_2d<f32>;
@group(0) @binding(2) var albedoSmp : sampler;

struct FSIn {
  @location(0) worldPos    : vec3<f32>,
  @location(1) worldNormal : vec3<f32>,
  @location(2) uv          : vec2<f32>
};

@fragment
fn fs_main(in: FSIn) -> @location(0) vec4<f32> {
  // Sample your albedo texture
  let baseColor = textureSample(albedoTex, albedoSmp, in.uv).rgb;

  // Simple Lambert diffuse
  let N = normalize(in.worldNormal);
  let L = normalize(vec3<f32>(1.0, 1.0, 0.8));  // a directional light
  let diff = max(dot(N, L), 0.0);
  let ambient = 0.2;
  let color = baseColor * (ambient + (1.0 - ambient) * diff);

  return vec4<f32>(color, 1.0);
}
