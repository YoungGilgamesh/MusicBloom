/**
 * starryBackground.js — BG type 1: starry cosmos (world-space).
 *
 * Mood colour wash (BgColorMotion top/bottom) stays the base. Procedural nebula
 * adds hue/brightness structure from that palette; multi-scale stars sit on top.
 * Elevation rule: top = denser stars + brighter nebula; bottom = darker / sparser.
 *
 * Continuous direction UVs (no atan) — avoids look-axis seams.
 */

import * as THREE from 'three';
import {
  STARRY_STAR_BRIGHTNESS,
  STARRY_DENSITY,
  STARRY_NEBULA_STRENGTH,
  STARRY_TOP_BIAS,
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
  uniform float uStarBright;
  uniform float uDensity;
  uniform float uNebula;
  uniform float uTopBias;
  uniform float uFadeMul; // 0..1 — fade-in from black during cover→game transition
  varying vec3 vWorldDir;

  ${TONE_MAP_GLSL}

  float hash21(vec2 p) {
    p = fract(p * vec2(127.1, 311.7));
    p += dot(p, p + 74.19);
    return fract(p.x * p.y);
  }

  float hash13(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  vec3 hsl2rgb(vec3 c) {
    vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    return c.z + c.y * (rgb - 0.5) * (1.0 - abs(2.0 * c.z - 1.0));
  }

  // Value noise → fbm (nebula body).
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

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 m = mat2(0.80, 0.60, -0.60, 0.80);
    for (int i = 0; i < 5; i++) {
      v += a * valueNoise(p);
      p = m * p * 2.05;
      a *= 0.5;
    }
    return v;
  }

  // Soft star disc in a cell. threshold↑ = rarer; soft = radius; glow adds halo for heroes.
  float starCell(vec2 uv, float threshold, float soft, float glow) {
    vec2 id = floor(uv);
    vec2 gv = fract(uv) - 0.5;
    float n = hash21(id);
    if (n < threshold) return 0.0;
    vec2 j = vec2(hash21(id + 17.1), hash21(id + 91.7)) - 0.5;
    float d = length(gv - j * 0.82);
    float core = smoothstep(soft, soft * 0.08, d);
    float halo = glow > 0.0 ? glow * exp(-d * d * (18.0 / max(soft, 0.01))) : 0.0;
    float b = 0.2 + 0.8 * pow(n, 3.5);
    return (core + halo) * b;
  }

  void main() {
    vec3 rd = normalize(vWorldDir);
    float up = rd.y;

    // Elevation 0 at bottom → 1 at top (rule: top starry/bright, bottom dark/sparse).
    float elev = smoothstep(-0.85, 0.80, up);
    float elevPow = pow(elev, mix(1.0, 1.65, clamp(uTopBias, 0.0, 1.0)));

    // Mood wash — kept deep so stars read; top still slightly lifted.
    float t = smoothstep(-0.85, 0.85, up);
    vec3 sky = mix(uBottom, uTop, t);
    sky *= mix(0.22, 0.68, elevPow);

    // Continuous sky domain (no atan — no look-axis seam).
    vec2 suv = vec2(rd.x * 1.25 + rd.z * 0.35, rd.y * 1.65);
    // Second sheet for nebula anisotropy (blend by direction, still continuous).
    vec2 suv2 = vec2(rd.z * 1.15 - rd.x * 0.2, rd.y * 1.4 + rd.x * 0.15);

    // ── Nebula: fbm clouds tinted from mood HSL with local hue/brightness spice ──
    float nA = fbm(suv * 1.8 + 2.7);
    float nB = fbm(suv2 * 3.4 + 11.3);
    float nC = fbm(suv * 6.2 - suv2 * 2.1 + 41.0);
    float nebMask = smoothstep(0.22, 0.72, nA * 0.55 + nB * 0.35 + nC * 0.18);
    nebMask *= mix(0.05, 1.0, elevPow); // nearly gone at bottom

    // Wispy detail / voids (reference: clumps + gaps, not flat fog).
    float wisps = smoothstep(0.35, 0.88, nB) * (0.5 + 0.5 * nC);
    nebMask *= mix(0.4, 1.25, wisps);
    nebMask = clamp(nebMask, 0.0, 1.6);

    // Hue walks around the mood top family; lift lit so nebula reads on a dark wash.
    float hue = fract(uTopHSL.x + (nA - 0.5) * 0.16 + (nB - 0.5) * 0.10);
    hue = mix(hue, fract(uBottomHSL.x + 0.04), 0.22 * (1.0 - nA) * (1.0 - elevPow));
    float sat = clamp(mix(uBottomHSL.y, uTopHSL.y, elev) * (0.85 + 0.55 * nB) + 0.12, 0.25, 1.0);
    // Nebula stays mood-tinted but dimmer so the field reads as dark space.
    float lit = clamp(0.06 + 0.26 * nA * elevPow + 0.12 * mix(uBottomHSL.z, uTopHSL.z, elevPow), 0.03, 0.42);
    vec3 nebCol = hsl2rgb(vec3(hue, sat, lit));
    float core = smoothstep(0.55, 0.90, nA * 0.5 + nB * 0.5) * elevPow;
    nebCol += mix(uTop, vec3(1.0), 0.18) * core * 0.45;
    sky += nebCol * nebMask * uNebula;

    // ── Stars: micro dust → mid → rare heroes; density follows elev × nebula ──
    float dens = uDensity * mix(0.5, 1.25, elevPow);
    dens *= mix(0.8, 1.3, clamp(nebMask, 0.0, 1.0));
    float starAmt = mix(0.12, 1.0, elevPow); // bottom sparse, not empty

    float s = 0.0;
    // Micro dust — denser grid, tiny pinpricks (threshold↓ = more stars)
    s += 0.65 * starCell(suv * (160.0 * dens), 0.72, 0.010, 0.0);
    s += 0.55 * starCell(suv2 * (130.0 * dens) + 19.0, 0.75, 0.011, 0.0);
    s += 0.45 * starCell(suv * (200.0 * dens) + 61.0, 0.78, 0.009, 0.0);
    // Mid field — still small, more frequent
    s += 0.75 * starCell(suv * (70.0 * dens) + 7.3, 0.86, 0.017, 0.06);
    s += 0.65 * starCell(suv2 * (52.0 * dens) + 33.1, 0.88, 0.019, 0.07);
    // Hero stars — rarer + slightly larger bloom
    s += 0.95 * starCell(suv * (18.0 * dens) + 51.0, 0.982, 0.030, 0.36);
    s += 0.80 * starCell(suv2 * (14.0 * dens) + 77.0, 0.988, 0.034, 0.40);

    s *= starAmt * uStarBright;

    // Stars stay bright/cool so they pop on the darker wash.
    vec3 starTint = mix(vec3(0.96, 0.97, 1.0), mix(uTop, vec3(1.0), 0.55), 0.22 + 0.30 * clamp(nebMask, 0.0, 1.0));
    starTint *= 1.05 + 0.2 * hash13(rd * 40.0);

    vec3 col = sky + starTint * s;
    gl_FragColor = vec4(applyOutputToneMap(col) * uFadeMul, 1.0);
  }
`;

export class StarryBackground {
  constructor() {
    this.enabled = true;

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      -1, -1, 0,
      3, -1, 0,
      -1, 3, 0,
    ]), 3));

    this._top = new THREE.Color(0x0a1020);
    this._bot = new THREE.Color(0x020208);
    this._topHsl = { h: 0.6, s: 0.4, l: 0.12 };
    this._botHsl = { h: 0.6, s: 0.3, l: 0.04 };

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
        uStarBright: { value: STARRY_STAR_BRIGHTNESS },
        uDensity: { value: STARRY_DENSITY },
        uNebula: { value: STARRY_NEBULA_STRENGTH },
        uTopBias: { value: STARRY_TOP_BIAS },
        uFadeMul: { value: 1.0 },
        uToneExposure: { value: TONE_MAPPING_EXPOSURE },
        uInvProjection: { value: new THREE.Matrix4() },
        uCameraMatrixWorld: { value: new THREE.Matrix4() },
      },
    });

    this.object3D = new THREE.Mesh(geom, this.material);
    this.object3D.frustumCulled = false;
    this.object3D.renderOrder = -2;
    this.object3D.name = 'StarryBackground';
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

  get fadeMul() { return this.material.uniforms.uFadeMul.value; }
  set fadeMul(v) { this.material.uniforms.uFadeMul.value = v; }

  update(camera) {
    this.object3D.visible = this.enabled;
    if (!this.enabled) return;
    camera.updateMatrixWorld();
    this.material.uniforms.uInvProjection.value.copy(camera.projectionMatrixInverse);
    this.material.uniforms.uCameraMatrixWorld.value.copy(camera.matrixWorld);
  }

  updateVisibility() {
    this.object3D.visible = this.enabled;
  }

  dispose() {
    this.object3D.geometry.dispose();
    this.material.dispose();
  }
}

