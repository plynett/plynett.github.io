// box_facecolor.vert.wgsl

struct Uniforms {
  viewProj  : mat4x4<f32>,
  model     : mat4x4<f32>,
  cameraPos : vec3<f32>,
  _pad      : f32
};
@group(0) @binding(0) var<uniform> u : Uniforms;

struct VSOut {
  @builtin(position) Position : vec4<f32>,
  @location(0)       localPos : vec3<f32>
};

@vertex
fn vs_main(@location(0) position: vec3<f32>) -> VSOut {
  var o : VSOut;
  o.localPos = position;
  let worldPos = u.model * vec4<f32>(position, 1.0);
  o.Position = u.viewProj * worldPos;
  return o;
}
