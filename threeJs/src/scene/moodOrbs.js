/**
 * moodOrbs.js — sparse large soft gaussian dots (world-frozen, camera-wrap).
 *
 * Cheapest possible atmospheric colour blobs: plain `THREE.Points` sprites (no
 * geometry at all — just a perspective-scaled `gl_PointSize` dot), circular with
 * a soft exponential/gaussian falloff to a fully transparent edge (no hard disc
 * rim). Round on purpose: unlike an elongated oval, a circular sprite looks
 * identical from every angle, so even though it's technically camera-facing,
 * flying around it never reveals a "flat sticker" silhouette. Not in the flow
 * sim / paint / trails. Positions wrap in a camera-centered cube (same idea as
 * frozen dust). Colour follows trail/mood HSL with a base hue shift + per-orb
 * scatter so they breathe with the music.
 */

import * as THREE from 'three';
import {
  MOOD_ORBS_COUNT,
  MOOD_ORBS_RADIUS,
  MOOD_ORBS_SIZE,
  MOOD_ORBS_SIZE_VAR,
  MOOD_ORBS_OPACITY,
  MOOD_ORBS_NEAR,
  MOOD_ORBS_FAR,
  MOOD_ORBS_HUE_SHIFT,
  MOOD_ORBS_HUE_VAR,
  MOOD_ORBS_SAT_SCALE,
  MOOD_ORBS_LIT_SCALE,
  MOOD_ORBS_EMISSIVE,
  MOOD_ORBS_GAUSS_K,
  MOOD_ORBS_EDGE_SOFT,
  MOOD_ORBS_WRAP_FADE_TIME,
  TONE_MAPPING_EXPOSURE,
} from '../config.js';
import { TONE_MAP_GLSL } from '../render/toneMap.glsl.js';

const VERT = /* glsl */ `
  attribute float aScale;
  attribute float aHue;
  attribute float aSpawnT;

  uniform float uNear;
  uniform float uFar;
  uniform float uTime;
  uniform float uFadeInTime;

  varying float vFade;
  varying float vHue;

  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float dist = length(mv.xyz);

    float nearF = smoothstep(uNear, uNear * 2.4, dist);
    float farF  = 1.0 - smoothstep(uFar * 0.70, uFar, dist);
    // Ease in after a camera-wrap teleport instead of popping in at full opacity.
    float spawnFade = uFadeInTime > 0.0
      ? smoothstep(0.0, uFadeInTime, uTime - aSpawnT)
      : 1.0;
    vFade = nearF * farF * spawnFade;
    vHue = aHue;

    // Perspective-scaled point size (world-diameter → screen px), same pattern
    // as flowDots. 1600 tuned so MOOD_ORBS_SIZE reads as a large soft blob.
    gl_PointSize = clamp(aScale * (1600.0 / max(dist, 0.25)), 1.0, 512.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uColorHSL;
  uniform float uHueShift;
  uniform float uHueVar;
  uniform float uSatScale;
  uniform float uLitScale;
  uniform float uOpacity;
  uniform float uEmissive;
  uniform float uGaussK;
  uniform float uEdgeSoft;
  uniform float uFadeMul; // 0..1 — cover→game transition fade-in

  varying float vFade;
  varying float vHue;

  ${TONE_MAP_GLSL}

  vec3 hsl2rgb(vec3 c) {
    vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    return c.z + c.y * (rgb - 0.5) * (1.0 - abs(2.0 * c.z - 1.0));
  }

  void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float r = length(c);
    if (r > 1.0) discard;
    // Gaussian core + a smooth (not cliff) roll-off to fully transparent at r=1.
    float g = exp(-r * r * uGaussK);
    float edge = 1.0 - smoothstep(uEdgeSoft, 1.0, r);
    float a = uOpacity * uFadeMul * vFade * g * edge;
    if (a < 0.006) discard;

    float hue = fract(uColorHSL.x + uHueShift + (vHue - 0.5) * uHueVar + 1.0);
    float sat = clamp(uColorHSL.y * uSatScale, 0.0, 1.0);
    float lit = clamp(uColorHSL.z * uLitScale, 0.0, 1.0);
    vec3 rgb = hsl2rgb(vec3(hue, sat, lit)) * max(uEmissive, 1.0);

    gl_FragColor = vec4(applyOutputToneMap(rgb), a);
  }
`;

export class MoodOrbs {
  constructor({
    count = MOOD_ORBS_COUNT,
    radius = MOOD_ORBS_RADIUS,
  } = {}) {
    this.count = count;
    this.radius = radius;
    this.enabled = true;

    const centers = new Float32Array(count * 3);
    const scales = new Float32Array(count);
    const hues = new Float32Array(count);
    // Spawn timestamp (seconds) each orb last "appeared" (init or wrap-teleport).
    // Initialized well in the past so the very first frame shows them at full
    // opacity (no fade-in on load, only on subsequent wraps while flying).
    const spawnT = new Float32Array(count).fill(-MOOD_ORBS_WRAP_FADE_TIME - 1);

    for (let i = 0; i < count; i++) {
      centers[i * 3] = (Math.random() * 2 - 1) * radius;
      centers[i * 3 + 1] = (Math.random() * 2 - 1) * radius;
      centers[i * 3 + 2] = (Math.random() * 2 - 1) * radius;
      // Skew: mostly mid, occasional larger.
      const t = Math.pow(Math.random(), 0.85);
      scales[i] = MOOD_ORBS_SIZE * (1 - MOOD_ORBS_SIZE_VAR + MOOD_ORBS_SIZE_VAR * t);
      hues[i] = Math.random();
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(centers, 3));
    geom.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
    geom.setAttribute('aHue', new THREE.BufferAttribute(hues, 1));
    geom.setAttribute('aSpawnT', new THREE.BufferAttribute(spawnT, 1));

    this._centers = centers;
    this._spawnT = spawnT;
    this._elapsed = 0;
    this.geom = geom;

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      toneMapped: false,
      uniforms: {
        uColorHSL: { value: new THREE.Vector3(0.55, 0.7, 0.5) },
        uHueShift: { value: MOOD_ORBS_HUE_SHIFT },
        uHueVar: { value: MOOD_ORBS_HUE_VAR },
        uSatScale: { value: MOOD_ORBS_SAT_SCALE },
        uLitScale: { value: MOOD_ORBS_LIT_SCALE },
        uOpacity: { value: MOOD_ORBS_OPACITY },
        uEmissive: { value: MOOD_ORBS_EMISSIVE },
        uGaussK: { value: MOOD_ORBS_GAUSS_K },
        uEdgeSoft: { value: MOOD_ORBS_EDGE_SOFT },
        uNear: { value: MOOD_ORBS_NEAR },
        uFar: { value: MOOD_ORBS_FAR },
        uTime: { value: 0 },
        uFadeInTime: { value: MOOD_ORBS_WRAP_FADE_TIME },
        uFadeMul: { value: 1.0 },
        uToneExposure: { value: TONE_MAPPING_EXPOSURE },
      },
    });

    this.object3D = new THREE.Points(geom, this.material);
    this.object3D.frustumCulled = false;
    this.object3D.renderOrder = -2; // behind dust / cloud when depths are close
  }

  setColorHSL(hsl) {
    if (!hsl) return;
    this.material.uniforms.uColorHSL.value.set(hsl.h, hsl.s, hsl.l);
  }

  get fadeMul() { return this.material.uniforms.uFadeMul.value; }
  set fadeMul(v) { this.material.uniforms.uFadeMul.value = v; }

  update(camPos, elapsed = this._elapsed) {
    this.object3D.visible = this.enabled;
    if (!this.enabled) return;

    this._elapsed = elapsed;
    this.material.uniforms.uTime.value = elapsed;

    const R = this.radius;
    const twoR = R * 2;
    const pos = this._centers;
    const spawnT = this._spawnT;
    const cx = camPos.x, cy = camPos.y, cz = camPos.z;
    let dirty = false;
    let spawnDirty = false;

    for (let i = 0, n = this.count; i < n; i++) {
      const o = i * 3;
      const x = pos[o] - cx;
      const y = pos[o + 1] - cy;
      const z = pos[o + 2] - cz;
      let wrapped = false;
      if (x > R) { pos[o] -= twoR; wrapped = true; }
      else if (x < -R) { pos[o] += twoR; wrapped = true; }
      if (y > R) { pos[o + 1] -= twoR; wrapped = true; }
      else if (y < -R) { pos[o + 1] += twoR; wrapped = true; }
      if (z > R) { pos[o + 2] -= twoR; wrapped = true; }
      else if (z < -R) { pos[o + 2] += twoR; wrapped = true; }
      if (wrapped) {
        dirty = true;
        spawnT[i] = elapsed;
        spawnDirty = true;
      }
    }
    if (dirty) this.geom.getAttribute('position').needsUpdate = true;
    if (spawnDirty) this.geom.getAttribute('aSpawnT').needsUpdate = true;
  }

  dispose() {
    this.geom.dispose();
    this.material.dispose();
  }
}
