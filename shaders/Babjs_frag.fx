precision highp float;

// Varying: received from the vertex shader
varying vec2 vUV;

// Uniforms
uniform sampler2D textureSampler;

void main() {
    gl_FragColor = texture2D(textureSampler, vUV);
}

