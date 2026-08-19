/**
 * flowDots.js — cheap flowing light dots (additional to meshes + trails).
 *
 * Soft point sprites advected by their own ParticleSim on the SAME baked volume /
 * paint / kill bubble as the mesh cloud. Theme colour follows trail/mood HSL with
 * mild hue scatter. Sprites stretch slightly along local flow (screen-space ellipse).
 */

import * as THREE from 'three';
import { ParticleSim } from './particleSim.js';
import { sampleAll6Cloud } from './fields/combine.js';
import { INSTANCE_GLSL } from './instanceTransform.glsl.js';
import {
  FLOW_DOTS_SIZE,
  FLOW_DOTS_SIZE_VAR,
  FLOW_DOTS_OPACITY,
  FLOW_DOTS_HUE_VAR,
  FLOW_DOTS_SAT_SCALE,
  FLOW_DOTS_LIT_SCALE,
  FLOW_DOTS_STRETCH,
  SIM_KILL_RADIUS,
  CLOUD_BEHIND_FRAC,
  SIM_BIRTH_TIME,
  SIM_DEATH_TIME,
  SIM_VOL_HALF,
  SIM_INST_PERIOD,
  SIM_INST_JITTER,
  SIM_INST_SCALE_MIN,
  SIM_INST_SCALE_MAX,
  FIELD_WARP_AMOUNT,
  FIELD_WARP_FREQ,
  FIELD_WARP_RATE,
  TONE_MAPPING_EXPOSURE,
  TRANSITION_SPAWN_RAMP_TIME,
  TRANSITION_SPAWN_FADE_DUR,
  TRAIL_PAINT_COLOR_AMT,
} from '../config.js';
import { TONE_MAP_GLSL } from '../render/toneMap.glsl.js';
import { PAINT_COLOR_GLSL } from './paintField.glsl.js';

const VERT = /* glsl */ `
  precision highp float;
  precision highp sampler2D;
  precision highp sampler3D;

  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;
  uniform sampler2D uSimPos;
  uniform sampler2D uSimCell;
  uniform float uSimW;
  uniform vec2  uSimRes;
  uniform vec3  uCamPos;
  uniform vec3  uCamFwd;
  uniform float uKillRadius;
  uniform float uBehindFrac;
  uniform float uBirthTime;
  uniform float uDeathTime;
  // Near-camera dead zone (world units) — dots closer than uNearFadeStart are
  // fully invisible, fading in up to uNearFadeEnd. Defaults (0.25/0.7) are
  // calibrated for the FULL-SIZE gameplay shape/kill-radius; scaled down
  // proportionally during cover (see main.js) since cover's whole shape/kill
  // bubble is itself scaled down (COVER_CLOUD_RADIUS) — otherwise this
  // fixed-size dead zone eats a much bigger fraction of the shrunk cover
  // volume, hiding a disproportionate share of the population.
  uniform float uNearFadeStart;
  uniform float uNearFadeEnd;
  uniform float uSpawnFrac; // sparse→full ramp (1 = normal, all revealed)
  // See shaders.js's uSpawnElapsed comment — decouples population growth rate
  // from each dot's own fixed-duration individual fade-in.
  uniform float uSpawnElapsed;
  uniform float uSpawnRampTime;
  uniform float uSpawnFadeDur;
  // Hides all dots while a shape-change's velocity bake is pending — see
  // createQuantumCloud.js's uFlowReady comment. 1 = off (normal).
  uniform float uFlowReady;
  uniform float uSize;
  uniform float uSizeVar;
  uniform float uStretch;
  uniform float uInstPeriod;
  uniform float uInstJitter;
  uniform float uScaleMin;
  uniform float uScaleMax;
  uniform highp sampler3D uVelVolume;
  uniform float uVolHalf;

  in vec3 position;
  in float aParticleId;
  in float aSize;
  in float aHue;

  out float vFade;
  out float vSeed;
  out float vHue;
  out vec3  vWorldPos;
  out vec2  vStretchDir; // screen / point-sprite stretch axis
  out float vStretch;    // elongation along motion (≥1)

  ${INSTANCE_GLSL}

  // Integer (Wang) hash -- exact regardless of magnitude, unlike a sin()-based
  // hash whose float32 argument-reduction precision collapses once i gets
  // into the thousands (this clouds particle-id range), which was clumping
  // many particles onto nearly the same reveal threshold -- they popped in as
  // visible batches instead of one-by-one, smoothly, across the spawn ramp.
  float revealHash(float i) {
    uint n = uint(i);
    n = (n ^ 61u) ^ (n >> 16u);
    n *= 9u;
    n = n ^ (n >> 4u);
    n *= 0x27d4eb2du;
    n = n ^ (n >> 15u);
    return float(n) * (1.0 / 4294967296.0);
  }

  void main() {
    float fi = aParticleId;
    vec2 simUV = (vec2(mod(fi, uSimW), floor(fi / uSimW)) + 0.5) / uSimRes;
    vec4 sp = texture(uSimPos, simUV);
    vec3 p = sp.xyz;
    float age = sp.w;
    vec4 cellT = texture(uSimCell, simUV);
    vec3 cell = cellT.xyz;
    float life = cellT.w;

    float birth = smoothstep(0.0, uBirthTime, age);
    float dCam = distance(p, uCamPos);
    float s = 0.5 * (dot(normalize(p - uCamPos + vec3(1e-6)), uCamFwd) + 1.0);
    float reach = uKillRadius * mix(uBehindFrac, 1.0, s);
    float farFade = 1.0 - smoothstep(reach * 0.72, reach, dCam);
    float nearFade = smoothstep(uNearFadeStart, uNearFadeEnd, dCam);
    float death = life > 0.001 ? 1.0 - smoothstep(life - uDeathTime, life, age) : 1.0;
    // See shaders.js's mesh-cloud comment — fixed-duration individual fade,
    // decoupled from population growth rate.
    float revealAt  = revealHash(fi) * uSpawnRampTime;
    float timeSince = uSpawnElapsed - revealAt;
    float spawnFade = smoothstep(0.0, uSpawnFadeDur, timeSince) * step(0.0001, uSpawnFrac);
    vFade = birth * farFade * death * nearFade * spawnFade * uFlowReady;
    vSeed = aSize;
    vHue = aHue;
    vWorldPos = p;

    // Flow direction → view XY → stretch the soft sprite into a short streak.
    vec3 vel = instSampleVel(p, cell);
    vec3 vView = (modelViewMatrix * vec4(vel, 0.0)).xyz;
    float spd = length(vView.xy);
    vec2 dir = spd > 1e-5 ? normalize(vView.xy) : vec2(1.0, 0.0);
    // PointCoord Y is often flipped vs view Y — flip so streak matches motion.
    vStretchDir = vec2(dir.x, -dir.y);
    float speedAmt = smoothstep(0.02, 0.55, length(vel));
    vStretch = mix(1.0, max(uStretch, 1.0), speedAmt);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float dist = length(mv.xyz);
    float t = pow(aSize, 1.85);
    float mul = mix(max(0.05, 1.0 - uSizeVar), 1.0 + 1.1 * uSizeVar, t);
    // Grow the point square a bit so elongated tips aren't clipped.
    float sizeBoost = mix(1.0, 1.0 + 0.35 * (vStretch - 1.0), speedAmt);
    gl_PointSize = clamp(uSize * mul * sizeBoost * (380.0 / max(dist, 0.25)), 0.4, 36.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  precision highp float;

  uniform vec3 uColorHSL;
  uniform float uHueVar;
  uniform float uSatScale;
  uniform float uLitScale;
  uniform float uOpacity;

  ${PAINT_COLOR_GLSL}

  in float vFade;
  in float vSeed;
  in float vHue;
  in vec3  vWorldPos;
  in vec2  vStretchDir;
  in float vStretch;
  out vec4 fragColor;

  ${TONE_MAP_GLSL}

  vec3 hsl2rgb(vec3 c) {
    vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    return c.z + c.y * (rgb - 0.5) * (1.0 - abs(2.0 * c.z - 1.0));
  }

  void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    // Ellipse elongated along motion: compress the along-axis in distance metric.
    vec2 along = vStretchDir;
    vec2 across = vec2(-along.y, along.x);
    float u = dot(c, along) / max(vStretch, 1.0);
    float v = dot(c, across);
    float r2 = u * u + v * v;
    if (r2 > 1.0) discard;
    float soft = 1.0 - smoothstep(0.15, 1.0, sqrt(r2));
    float tw = 0.7 + 0.3 * vSeed;
    float a = uOpacity * vFade * soft * tw;
    if (a < 0.02) discard;

    vec3 hsl = applyPaintInk(
      vec3(
        fract(uColorHSL.x + (vHue - 0.5) * uHueVar + 1.0),
        clamp(uColorHSL.y * uSatScale, 0.0, 1.0),
        clamp(uColorHSL.z * uLitScale, 0.0, 1.0)
      ),
      vWorldPos);
    vec3 rgb = hsl2rgb(vec3(fract(hsl.x + 1.0), hsl.y, hsl.z));

    fragColor = vec4(applyOutputToneMap(rgb), a);
  }
`;

export class FlowDots {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {object} opts
   * @param {number} opts.count
   * @param {THREE.Data3DTexture} opts.volTex
   * @param {number} [opts.volHalf]
   * @param {object} [opts.mood] seed sample mood
   * @param {string[]} [opts.warpOrder]
   * @param {number} [opts.dominance]
   */
  constructor(renderer, {
    count,
    volTex,
    volHalf = SIM_VOL_HALF,
    mood = { energy: 0.5, brightness: 0.5, texture: 0.5, heaviness: 0.5, dynamism: 0.5, bpm: 120 },
    warpOrder = ['energy', 'brightness'],
    dominance,
  }) {
    this.count = Math.max(1, count | 0);
    this.enabled = true;
    // Scratch vector for the camera forward direction — see update()'s sim.update
    // call (forward-biased respawn reach, matching this element's own fade below).
    this._camFwd = new THREE.Vector3(0, 0, -1);

    const { positions } = sampleAll6Cloud(
      this.count,
      mood.energy, mood.brightness, mood.texture,
      mood.heaviness, mood.dynamism, mood.bpm,
      warpOrder, dominance,
    );
    this.seedPositions = positions;

    this.sim = new ParticleSim(renderer, this.count, positions);
    this.sim.setVolume(volTex, volHalf);

    const ids = new Float32Array(this.count);
    const sizes = new Float32Array(this.count);
    const hues = new Float32Array(this.count);
    for (let i = 0; i < this.count; i++) {
      ids[i] = i;
      sizes[i] = Math.pow(Math.random(), 2.4);
      hues[i] = Math.random();
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.count * 3), 3));
    geom.setAttribute('aParticleId', new THREE.BufferAttribute(ids, 1));
    geom.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geom.setAttribute('aHue', new THREE.BufferAttribute(hues, 1));
    this.geom = geom;

    this.material = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      uniforms: {
        uSimPos: { value: this.sim.getPositionTexture() },
        uSimCell: { value: this.sim.getCellTexture() },
        uSimW: { value: this.sim.width },
        uSimRes: { value: new THREE.Vector2(this.sim.width, this.sim.height) },
        uCamPos: { value: new THREE.Vector3() },
        uCamFwd: { value: new THREE.Vector3(0, 0, -1) },
        uKillRadius: { value: SIM_KILL_RADIUS },
        uBehindFrac: { value: CLOUD_BEHIND_FRAC },
        uNearFadeStart: { value: 0.25 },
        uNearFadeEnd: { value: 0.7 },
        uBirthTime: { value: SIM_BIRTH_TIME },
        uDeathTime: { value: SIM_DEATH_TIME },
        uSpawnFrac: { value: 1.0 },
        uSpawnElapsed: { value: TRANSITION_SPAWN_RAMP_TIME + TRANSITION_SPAWN_FADE_DUR },
        uSpawnRampTime: { value: TRANSITION_SPAWN_RAMP_TIME },
        uSpawnFadeDur: { value: TRANSITION_SPAWN_FADE_DUR },
        uFlowReady: { value: 1.0 },
        uSize: { value: FLOW_DOTS_SIZE },
        uSizeVar: { value: FLOW_DOTS_SIZE_VAR },
        uStretch: { value: FLOW_DOTS_STRETCH },
        uColorHSL: { value: new THREE.Vector3(0.55, 0.7, 0.62) },
        uBloomCount: this.sim.mat.uniforms.uBloomCount,
        uBloomA: this.sim.mat.uniforms.uBloomA,
        uBloomE: this.sim.mat.uniforms.uBloomE,
        uPaintColorAmt: { value: TRAIL_PAINT_COLOR_AMT },
        uHueVar: { value: FLOW_DOTS_HUE_VAR },
        uSatScale: { value: FLOW_DOTS_SAT_SCALE },
        uLitScale: { value: FLOW_DOTS_LIT_SCALE },
        uOpacity: { value: FLOW_DOTS_OPACITY },
        uToneExposure: { value: TONE_MAPPING_EXPOSURE },
        uVelVolume: { value: volTex },
        uVolHalf: { value: volHalf },
        uInstPeriod: { value: SIM_INST_PERIOD },
        uInstJitter: { value: SIM_INST_JITTER },
        uScaleMin: { value: SIM_INST_SCALE_MIN },
        uScaleMax: { value: SIM_INST_SCALE_MAX },
        uFieldWarpAmt: { value: FIELD_WARP_AMOUNT },
        uFieldWarpFreq: { value: FIELD_WARP_FREQ },
        uFieldWarpRate: { value: FIELD_WARP_RATE },
        uFieldWarpTime: { value: 0 },
      },
    });

    this.object3D = new THREE.Points(geom, this.material);
    this.object3D.frustumCulled = false;
    this.object3D.name = 'FlowDots';
  }

  get size() { return this.material.uniforms.uSize.value; }
  set size(v) { this.material.uniforms.uSize.value = v; }
  // Live count: how many dots to actually draw (0…count), via drawRange — cheap
  // fill control, same idea as GPUTrails' drawCount (used by the cover page's
  // dedicated dot count — see COVER_FLOW_DOTS_COUNT in config.js).
  get drawCount() { return this.geom.drawRange.count === Infinity ? this.count : this.geom.drawRange.count; }
  set drawCount(n) { this.geom.setDrawRange(0, Math.max(0, Math.min(this.count, Math.round(n)))); }
  get opacity() { return this.material.uniforms.uOpacity.value; }
  set opacity(v) { this.material.uniforms.uOpacity.value = v; }
  get spawnFrac() { return this.material.uniforms.uSpawnFrac.value; }
  set spawnFrac(v) { this.material.uniforms.uSpawnFrac.value = v; }
  get spawnElapsed() { return this.material.uniforms.uSpawnElapsed.value; }
  set spawnElapsed(v) { this.material.uniforms.uSpawnElapsed.value = v; }
  // Per-particle reveal-instant timescale (seconds) — see GPUTrails' identical
  // spawnRampTime comment for the full rationale (must match whichever ramp
  // duration is actually driving spawnElapsed, or the population visibly
  // stalls sparse long after the ramp appears to have finished).
  get spawnRampTime() { return this.material.uniforms.uSpawnRampTime.value; }
  set spawnRampTime(v) { this.material.uniforms.uSpawnRampTime.value = v; }
  get flowReady() { return this.material.uniforms.uFlowReady.value; }
  set flowReady(v) { this.material.uniforms.uFlowReady.value = v; }
  // Sim-side lifetime cap (seconds) — see GPUTrails' maxLife comment: pushed
  // way out during the spawn ramp so revealed dots don't age-out/respawn
  // (which would fade them back to 0 and pop them back in) before the ramp
  // finishes growing the population. Restored to SIM_MAX_LIFE once done.
  get maxLife() { return this.sim.mat.uniforms.uMaxLife.value; }
  set maxLife(v) { this.sim.mat.uniforms.uMaxLife.value = v; }
  // Recycle-bubble radius (world units). No auto-sync between sim/material
  // here (unlike GPUTrails) — both uKillRadius uniforms must be set.
  get killRadius() { return this.sim.mat.uniforms.uKillRadius.value; }
  set killRadius(v) {
    this.sim.mat.uniforms.uKillRadius.value = v;
    this.material.uniforms.uKillRadius.value = v;
  }
  // Near-camera dead-zone band (world units) — see uNearFadeStart/uNearFadeEnd
  // comment in the shader above. Scaled down during cover, restored to
  // (0.25, 0.7) for real gameplay (see main.js).
  get nearFadeStart() { return this.material.uniforms.uNearFadeStart.value; }
  set nearFadeStart(v) { this.material.uniforms.uNearFadeStart.value = v; }
  get nearFadeEnd() { return this.material.uniforms.uNearFadeEnd.value; }
  set nearFadeEnd(v) { this.material.uniforms.uNearFadeEnd.value = v; }
  // Forward-bias strength (sim respawn reach + render fade) — see GPUTrails'
  // behindFrac comment for the full rationale. 1.0 = symmetric (cover page);
  // CLOUD_BEHIND_FRAC (<1) = forward-biased (real gameplay flight).
  get behindFrac() { return this.sim.mat.uniforms.uBehindFrac.value; }
  set behindFrac(v) {
    this.sim.mat.uniforms.uBehindFrac.value = v;
    this.material.uniforms.uBehindFrac.value = v;
  }
  get stretch() { return this.material.uniforms.uStretch.value; }
  set stretch(v) { this.material.uniforms.uStretch.value = Math.max(1, v); }

  setColorHSL(hsl) {
    if (!hsl) return;
    this.material.uniforms.uColorHSL.value.set(hsl.h, hsl.s, hsl.l);
  }

  /**
   * Re-sample seeds to a new mood shape and respawn (call with mesh reshape).
   */
  reshape(mood, warpOrder, dominance) {
    const { positions } = sampleAll6Cloud(
      this.count,
      mood.energy, mood.brightness, mood.texture,
      mood.heaviness, mood.dynamism, mood.bpm,
      warpOrder, dominance,
    );
    this.seedPositions = positions;
    this.sim.reset(positions);
  }

  /**
   * @param {number} dt
   * @param {THREE.Camera} camera
   * @param {number} flowSpeed
   * @param {{ field: import('../interaction/bloomField.js').BloomField, elapsed: number } | null} paint
   */
  update(dt, camera, flowSpeed, paint = null) {
    this.object3D.visible = this.enabled;
    if (!this.enabled) return;

    this.sim.mat.uniforms.uFlowSpeed.value = flowSpeed;
    if (paint?.field) {
      paint.field.syncUniforms(this.sim.mat.uniforms, camera.position, paint.elapsed);
    }
    this.sim.update(dt, camera.position, camera.getWorldDirection(this._camFwd));

    const u = this.material.uniforms;
    u.uSimPos.value = this.sim.getPositionTexture();
    u.uSimCell.value = this.sim.getCellTexture();
    u.uCamPos.value.copy(camera.position);
    camera.getWorldDirection(u.uCamFwd.value);
    if (paint?.elapsed != null) u.uFieldWarpTime.value = paint.elapsed;
  }

  dispose() {
    this.geom.dispose();
    this.material.dispose();
  }
}
