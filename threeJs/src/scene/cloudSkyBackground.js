/**
 * cloudSkyBackground.js — BG type 2: abstract cloud sky (world-space).
 *
 * Mood colour wash (BgColorMotion top/bottom) stays the base. Anisotropic fbm
 * wisps (cirrus / brushstroke streaks) layer on top. Elevation rule: top =
 * denser / brighter clouds; bottom = darker / sparser.
 *
 * Cost budget ≈ starry cosmos (one fullscreen FS; 4-oct fbm × a few sheets,
 * no star cells — typically a bit cheaper than cosmos).
 */

import * as THREE from 'three';
import {
  CLOUD_SKY_STRENGTH,
  CLOUD_SKY_TOP_BIAS,
  CLOUD_SKY_STRETCH,
  CLOUD_SKY_DRIFT,
  TONE_MAPPING_EXPOSURE,
} from '../config.js';
import { TONE_MAP_GLSL } from '../render/toneMap.glsl.js';

const VERT = /* glsl */ `
  uniform mat4 uInvProjection;
  uniform mat4 uCameraMatrixWorld;
  varying vec3 vWorldDir;

  void main() {
    gl_Position = vec4(position.xy, 1.0, 1.0);
    vec4 viewPos = uInvProjection * vec4(position.xy, 1.0, 1.0);
    viewPos.xyz /= max(viewPos.w, 1e-6);
    vWorldDir = mat3(uCameraMatrixWorld) * viewPos.xyz;
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uBottom;
  uniform vec3 uTopHSL;
  uniform vec3 uBottomHSL;
  uniform float uCloudAmt;
  uniform float uTopBias;
  uniform float uStretch;
  uniform float uDrift;
  uniform float uTime;
  uniform float uFadeMul;
  varying vec3 vWorldDir;

  ${TONE_MAP_GLSL}

  float hash21(vec2 p) {
    p = fract(p * vec2(127.1, 311.7));
    p += dot(p, p + 74.19);
    return fract(p.x * p.y);
  }

  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  // 4 octaves — same ballpark as cosmos fbm cost (cosmos uses 5×3; we use 4×3 sheets).
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 m = mat2(0.80, 0.60, -0.60, 0.80);
    for (int i = 0; i < 4; i++) {
      v += a * valueNoise(p);
      p = m * p * 2.02;
      a *= 0.5;
    }
    return v;
  }

  vec3 hsl2rgb(vec3 c) {
    vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    return c.z + c.y * (rgb - 0.5) * (1.0 - abs(2.0 * c.z - 1.0));
  }

  // Horizontally stretched domain → cirrus / brushstroke streaks (no atan).
  // stretchMul / warpAmt vary per sheet so bands aren't a uniform deck.
  vec2 streakUV(vec3 rd, float scale, float phase, float stretchMul, float warpAmt) {
    vec2 uv = vec2(rd.x * 1.15 + rd.z * 0.4, rd.y * 1.55);
    float st = max(uStretch * stretchMul, 0.15);
    uv.x *= 1.0 / st;
    uv.y *= st;
    // Low-freq warp breaks parallel "ruled paper" streaks.
    vec2 w = vec2(
      valueNoise(uv * 0.55 + phase * 2.7),
      valueNoise(uv * 0.45 + vec2(9.1, phase * -1.3))
    );
    uv += (w - 0.5) * warpAmt;
    uv.x += uTime * uDrift * (0.35 + phase);
    uv.y += uTime * uDrift * 0.08 * phase;
    return uv * scale;
  }

  void main() {
    vec3 rd = normalize(vWorldDir);
    float up = rd.y;

    float elev = smoothstep(-0.85, 0.80, up);
    float elevPow = pow(elev, mix(1.0, 1.7, clamp(uTopBias, 0.0, 1.0)));

    // Mood wash; brighter toward top (rule).
    float t = smoothstep(-0.85, 0.85, up);
    vec3 sky = mix(uBottom, uTop, t);
    sky *= mix(0.50, 1.12, elevPow);

    // Three anisotropic fbm sheets — uneven stretch / warp / thresholds.
    float n1 = fbm(streakUV(rd, 1.45, 0.0, 0.85, 1.35) + 3.1);
    float n2 = fbm(streakUV(rd, 3.05, 1.3, 1.35, 0.95) + vec2(17.0, -9.0));
    float n3 = fbm(streakUV(rd, 7.2, -0.7, 2.1, 1.7) + vec2(-11.0, 28.0));
    // Large voids + clumpy islands (not a uniform veil).
    // NOTE: do not name this "patch" — reserved word in GLSL (tessellation).
    float voidMask = fbm(streakUV(rd, 0.55, 0.4, 1.0, 0.6) + 41.0);

    // Higher / wider thresholds → thinner, broken streaks.
    float w1 = smoothstep(0.48, 0.78, n1);
    float w2 = smoothstep(0.52, 0.84, n2);
    float w3 = smoothstep(0.58, 0.88, n3);
    float clouds = w1 * 0.42 + w2 * 0.48 + w3 * 0.22;
    clouds *= mix(0.15, 1.2, smoothstep(0.38, 0.72, voidMask)); // tear big gaps
    clouds *= mix(0.35, 1.15, smoothstep(0.35, 0.8, n2));
    clouds *= mix(0.05, 1.0, elevPow); // top denser, bottom sparse
    clouds = clamp(clouds, 0.0, 1.15);

    // Cloud tint: mood family, lifted toward soft bright (not pure white neon).
    float hue = fract(mix(uBottomHSL.x, uTopHSL.x, elevPow) + (n1 - 0.5) * 0.05);
    float sat = clamp(mix(uBottomHSL.y, uTopHSL.y, elev) * 0.28, 0.0, 0.45);
    float lit = clamp(0.48 + 0.28 * elevPow + 0.1 * n2, 0.32, 0.82);
    vec3 cloudCol = hsl2rgb(vec3(hue, sat, lit));
    cloudCol = mix(cloudCol, mix(uTop, vec3(1.0), 0.45), 0.28);

    sky = mix(sky, cloudCol, clamp(clouds * uCloudAmt, 0.0, 0.55));
    sky += uTop * clouds * 0.03 * elevPow * uCloudAmt;

    gl_FragColor = vec4(applyOutputToneMap(sky) * uFadeMul, 1.0);
  }
`;

export class CloudSkyBackground {
  constructor() {
    this.enabled = true;

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      -1, -1, 0,
      3, -1, 0,
      -1, 3, 0,
    ]), 3));

    this._top = new THREE.Color(0x2a6ab8);
    this._bot = new THREE.Color(0x0a1830);
    this._topHsl = { h: 0.58, s: 0.55, l: 0.42 };
    this._botHsl = { h: 0.58, s: 0.4, l: 0.12 };

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
      fog: false,
      toneMapped: false,
      uniforms: {
        uTop: { value: this._top },
        uBottom: { value: this._bot },
        uTopHSL: { value: new THREE.Vector3(this._topHsl.h, this._topHsl.s, this._topHsl.l) },
        uBottomHSL: { value: new THREE.Vector3(this._botHsl.h, this._botHsl.s, this._botHsl.l) },
        uCloudAmt: { value: CLOUD_SKY_STRENGTH },
        uTopBias: { value: CLOUD_SKY_TOP_BIAS },
        uStretch: { value: CLOUD_SKY_STRETCH },
        uDrift: { value: CLOUD_SKY_DRIFT },
        uTime: { value: 0 },
        uFadeMul: { value: 1.0 },
        uToneExposure: { value: TONE_MAPPING_EXPOSURE },
        uInvProjection: { value: new THREE.Matrix4() },
        uCameraMatrixWorld: { value: new THREE.Matrix4() },
      },
    });

    this.object3D = new THREE.Mesh(geom, this.material);
    this.object3D.frustumCulled = false;
    this.object3D.renderOrder = -2;
    this.object3D.name = 'CloudSkyBackground';
  }

  /**
   * @param {{ h: number, s: number, l: number }} topHsl
   * @param {{ h: number, s: number, l: number }} bottomHsl
   */
  setColors(topHsl, bottomHsl) {
    this._topHsl = topHsl;
    this._botHsl = bottomHsl;
    this._top.setHSL(topHsl.h, topHsl.s, topHsl.l);
    this._bot.setHSL(bottomHsl.h, bottomHsl.s, bottomHsl.l);
    this.material.uniforms.uTopHSL.value.set(topHsl.h, topHsl.s, topHsl.l);
    this.material.uniforms.uBottomHSL.value.set(bottomHsl.h, bottomHsl.s, bottomHsl.l);
  }

  update(camera, elapsed = 0) {
    this.object3D.visible = this.enabled;
    if (!this.enabled) return;
    camera.updateMatrixWorld();
    this.material.uniforms.uInvProjection.value.copy(camera.projectionMatrixInverse);
    this.material.uniforms.uCameraMatrixWorld.value.copy(camera.matrixWorld);
    this.material.uniforms.uTime.value = elapsed;
  }

  get fadeMul() { return this.material.uniforms.uFadeMul.value; }
  set fadeMul(v) { this.material.uniforms.uFadeMul.value = v; }

  dispose() {
    this.object3D.geometry.dispose();
    this.material.dispose();
  }
}