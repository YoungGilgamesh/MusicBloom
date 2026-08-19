/**
 * elevationHaze.js — theme-agnostic sparse horizontal haze (world elevation).
 *
 * Fullscreen clip triangle + view-ray unproject (same as Mood/Starry BG). Soft
 * bands sit in world rd.y so pitching reads altitude. Fixed tint — not mood /
 * trail driven — so any future BG theme can sit underneath unchanged.
 */

import * as THREE from 'three';
import {
  BG_HAZE_STRENGTH,
  BG_HAZE_WIDTH,
  BG_HAZE_DENSITY,
  BG_HAZE_BANDS,
  BG_HAZE_COLOR,
  BG_HAZE_WOBBLE,
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
  #define HAZE_BANDS ${BG_HAZE_BANDS}

  uniform vec3 uColor;
  uniform float uStrength;
  uniform float uWidth;
  uniform float uDensity;
  uniform float uWobble;
  uniform float uFadeMul;
  varying vec3 vWorldDir;

  ${TONE_MAP_GLSL}

  float hash11(float n) {
    return fract(sin(n * 127.1) * 43758.5453123);
  }

  void main() {
    vec3 rd = normalize(vWorldDir);
    float el = rd.y;

    // Sparse elevation slots: only some hashed bands spawn (density gate).
    float haze = 0.0;
    for (int i = 0; i < HAZE_BANDS; i++) {
      float fi = float(i);
      float spawn = hash11(fi * 3.17 + 0.11);
      // Higher uDensity → more bands; keep a few even at low density.
      if (spawn > mix(0.55, 0.92, clamp(uDensity, 0.0, 1.0))) continue;

      // Irregular centers across elevation (−0.85..0.85), avoid packing the horizon only.
      float base = mix(-0.82, 0.82, (fi + 0.5) / float(HAZE_BANDS));
      float center = base + (hash11(fi * 7.91 + 2.4) - 0.5) * 0.22;
      // Continuous bend from view direction (no atan — atan wrap was a vertical seam on-screen).
      float ang = hash11(fi + 5.0) * 6.2831853;
      float wobble = uWobble * sin(
        rd.x * cos(ang) * 4.0 + rd.z * sin(ang) * 4.0 + fi * 1.7
      );
      float w = max(0.008, uWidth * mix(0.55, 1.35, hash11(fi * 11.3 + 0.7)));
      float d = el - center - wobble;
      // Broader soft lobe (less “hard horizon stripe”).
      float band = exp(-(d * d) / (w * w));
      band *= band; // gentler shoulders
      float op = mix(0.35, 1.0, hash11(fi * 13.7 + 4.1));
      haze += band * op;
    }

    haze = min(haze, 1.35) * uStrength;

    // Soft veil: tonemap the fixed tint, coverage in alpha (NormalBlending over theme BG).
    gl_FragColor = vec4(applyOutputToneMap(uColor), haze * uFadeMul);
  }
`;

export class ElevationHaze {
  constructor() {
    this.enabled = true;

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      -1, -1, 0,
      3, -1, 0,
      -1, 3, 0,
    ]), 3));

    const col = new THREE.Color(BG_HAZE_COLOR);

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      fog: false,
      toneMapped: false,
      blending: THREE.NormalBlending,
      uniforms: {
        uColor: { value: col },
        uStrength: { value: BG_HAZE_STRENGTH },
        uWidth: { value: BG_HAZE_WIDTH },
        uDensity: { value: BG_HAZE_DENSITY },
        uWobble: { value: BG_HAZE_WOBBLE },
        uFadeMul: { value: 1.0 },
        uToneExposure: { value: TONE_MAPPING_EXPOSURE },
        uInvProjection: { value: new THREE.Matrix4() },
        uCameraMatrixWorld: { value: new THREE.Matrix4() },
      },
    });

    this.object3D = new THREE.Mesh(geom, this.material);
    this.object3D.frustumCulled = false;
    // Above theme BG (−2), below frozen dust (−1) / cloud content.
    this.object3D.renderOrder = -1.5;
    this.object3D.name = 'ElevationHaze';
  }

  get strength() { return this.material.uniforms.uStrength.value; }
  set strength(v) { this.material.uniforms.uStrength.value = v; }
  get fadeMul() { return this.material.uniforms.uFadeMul.value; }
  set fadeMul(v) { this.material.uniforms.uFadeMul.value = v; }

  update(camera) {
    this.object3D.visible = this.enabled;
    if (!this.enabled) return;
    camera.updateMatrixWorld();
    this.material.uniforms.uInvProjection.value.copy(camera.projectionMatrixInverse);
    this.material.uniforms.uCameraMatrixWorld.value.copy(camera.matrixWorld);
  }

  dispose() {
    this.object3D.geometry.dispose();
    this.material.dispose();
  }
}
