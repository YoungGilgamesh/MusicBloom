/**
 * lightLeakBackground.js — BG type 3: soft blurry light-leak / bokeh wash.
 *
 * Mood colour wash (BgColorMotion top/bottom) stays the base. Soft discs sit in
 * WORLD direction space (same sky domain as cosmos/clouds). Mild soap-bubble
 * caustic on a few discs. Perf-trimmed: fewer blobs, no per-disc noise/atan,
 * cheap chroma, early-out when looking down.
 */

import * as THREE from 'three';
import {
  LIGHT_LEAK_STRENGTH,
  LIGHT_LEAK_TOP_BIAS,
  LIGHT_LEAK_CHROMA,
  LIGHT_LEAK_CAUSTIC,
  LIGHT_LEAK_DRIFT,
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
  uniform float uLeakAmt;
  uniform float uTopBias;
  uniform float uChroma;
  uniform float uCaustic;
  uniform float uDrift;
  uniform float uTime;
  uniform float uFadeMul;
  varying vec3 vWorldDir;

  ${TONE_MAP_GLSL}

  float hash11(float n) {
    return fract(sin(n * 127.1) * 43758.5453);
  }

  vec3 hsl2rgb(vec3 c) {
    vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    return c.z + c.y * (rgb - 0.5) * (1.0 - abs(2.0 * c.z - 1.0));
  }

  void main() {
    vec3 rd = normalize(vWorldDir);
    float up = rd.y;

    float elev = smoothstep(-0.85, 0.80, up);
    float elevPow = pow(elev, mix(1.15, 2.1, clamp(uTopBias, 0.0, 1.0)));

    float t = smoothstep(-0.85, 0.85, up);
    vec3 sky = mix(uBottom, uTop, t);
    sky *= mix(0.28, 1.18, elevPow);

    vec3 lightH = vec3(uTopHSL.x, clamp(uTopHSL.y * 0.45, 0.08, 0.55), clamp(uTopHSL.z * 1.55 + 0.18, 0.35, 0.72));
    vec3 lightCol = hsl2rgb(lightH);

    // Bottom of sky: wash only — skip the blob loop (big win when looking down).
    if (elevPow > 0.05) {
      float ch = clamp(uChroma, 0.0, 1.0);
      float ca = clamp(uCaustic, 0.0, 1.0);
      float drift = uTime * uDrift;
      vec3 fringeA = hsl2rgb(vec3(fract(uTopHSL.x + 0.08), clamp(uTopHSL.y * 0.7, 0.2, 0.85), 0.55));
      vec3 fringeB = hsl2rgb(vec3(fract(uTopHSL.x - 0.10), clamp(uTopHSL.y * 0.65, 0.2, 0.85), 0.52));

      vec3 leak = vec3(0.0);
      // 8 discs (was 14). One soft core each; cheap rim chroma; caustic on ~3.
      for (int i = 0; i < 8; i++) {
        float fi = float(i);
        float hx = hash11(fi * 3.17 + 1.3);
        float hy = hash11(fi * 5.91 + 2.7);
        float hr = hash11(fi * 7.13 + 0.4);
        float ha = hash11(fi * 9.77 + 4.1);

        float elevBias = (i < 6) ? mix(0.18, 0.45, ha) : mix(0.0, 0.12, ha);
        float az = hx * 6.2831853 + drift * (0.22 + 0.18 * hy) + fi * 0.7;
        float el = clamp(mix(0.08, 0.92, hy) + elevBias, -0.05, 0.98);
        float ce = cos(el);
        vec3 cN = normalize(vec3(ce * cos(az), sin(el), ce * sin(az)));

        float rad = mix(0.05, 0.15, hr);
        float ang = 1.0 - max(dot(rd, cN), 0.0);
        float dn = ang / max(rad, 1e-4);
        // Far from this disc — skip (helps when looking between sparse blobs).
        if (dn > 1.6) continue;

        float core = exp(-dn * dn * 2.6);
        // Cheap grain (no valueNoise).
        float grain = hash11(fi * 13.0 + rd.x * 17.0 + rd.y * 9.0);
        core *= mix(0.90, 1.06, grain);

        vec3 blob = lightCol * core * 0.90;
        blob += vec3(1.0, 0.98, 0.96) * core * 0.32;
        // Cheap chroma: tint rim by dn (no extra disc samples).
        float rimCh = smoothstep(0.45, 1.05, dn) * core;
        blob += mix(fringeA, fringeB, ha) * rimCh * ch * 0.35;

        // Soap-bubble rim on a few discs only — no atan, one spectrum sample.
        float causticGate = step(0.62, hash11(fi * 11.3 + 0.7));
        if (ca * causticGate > 0.001) {
          float rim = smoothstep(0.60, 0.85, dn) * (1.0 - smoothstep(1.0, 1.30, dn));
          vec3 upRef = abs(cN.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
          vec3 tang = normalize(cross(cN, upRef));
          vec3 toP = rd - cN * dot(rd, cN);
          float azProxy = dot(toP, tang) * 6.0 + ha;
          float specT = fract(azProxy * 0.12 + dn * 1.2 + ha + drift * 0.25);
          vec3 film = hsl2rgb(vec3(fract(uTopHSL.x + specT * 0.65 + 0.10), 0.72, 0.54));
          blob += film * rim * ca * causticGate * 0.52;
        }

        leak += blob * mix(0.40, 1.0, ha);
      }

      leak = leak / (1.0 + leak * 0.55);
      float leakGate = mix(0.08, 1.0, elevPow);
      sky += leak * uLeakAmt * leakGate;
      sky += lightCol * 0.018 * uLeakAmt * elevPow;
    }

    gl_FragColor = vec4(applyOutputToneMap(sky) * uFadeMul, 1.0);
  }
`;

export class LightLeakBackground {
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
        uLeakAmt: { value: LIGHT_LEAK_STRENGTH },
        uTopBias: { value: LIGHT_LEAK_TOP_BIAS },
        uChroma: { value: LIGHT_LEAK_CHROMA },
        uCaustic: { value: LIGHT_LEAK_CAUSTIC },
        uDrift: { value: LIGHT_LEAK_DRIFT },
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
    this.object3D.name = 'LightLeakBackground';
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
