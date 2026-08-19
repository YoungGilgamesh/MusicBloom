/**
 * toneMap.glsl.js — ACES filmic + linear→sRGB (matches Three.js ACESFilmicToneMapping).
 *
 * Custom ShaderMaterial / RawShaderMaterial don't get renderer.toneMapping for free;
 * include this and call applyOutputToneMap(rgb) before writing the fragment.
 */

export const TONE_MAP_GLSL = /* glsl */ `
#ifndef TONE_MAP_GLSL_INCLUDED
#define TONE_MAP_GLSL_INCLUDED

#ifndef saturate
#define saturate(a) clamp(a, 0.0, 1.0)
#endif

uniform float uToneExposure;

vec3 RRTAndODTFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}

// Three.js ACESFilmicToneMapping (brighter viewing environment, / 0.6).
vec3 toneMapACES(vec3 color) {
  const mat3 ACESInputMat = mat3(
    vec3(0.59719, 0.07600, 0.02840),
    vec3(0.35458, 0.90834, 0.13383),
    vec3(0.04823, 0.01566, 0.83777)
  );
  const mat3 ACESOutputMat = mat3(
    vec3( 1.60475, -0.10208, -0.00327),
    vec3(-0.53108,  1.10813, -0.07276),
    vec3(-0.07367, -0.00605,  1.07602)
  );
  color *= uToneExposure / 0.6;
  color = ACESInputMat * color;
  color = RRTAndODTFit(color);
  color = ACESOutputMat * color;
  return saturate(color);
}

vec3 linearToSRGB(vec3 value) {
  return mix(
    value * 12.92,
    1.055 * pow(value, vec3(1.0 / 2.4)) - 0.055,
    step(vec3(0.0031308), value)
  );
}

vec3 applyOutputToneMap(vec3 linearRgb) {
  return linearToSRGB(toneMapACES(linearRgb));
}

#endif
`;
