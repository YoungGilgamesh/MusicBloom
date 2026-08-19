/**
 * gpuTrails.js — cheap, GPU-resident particle trails (depth-writing quad ribbons).
 *
 * This replaces the CPU TrailField for high counts. Per frame the CPU only does a
 * couple of uniform writes + two draws; everything else lives on the GPU:
 *
 *   1. HEADS  — a second ParticleSim advects the trail heads along the SAME baked
 *      velocity volume + per-cell instance transform as the mesh cloud (so trails
 *      follow the identical tiled shape), with the same lifetime + camera-relative
 *      respawn. We just reuse the tested sim rather than re-implementing advection.
 *
 *   2. HISTORY — a ping-pong float texture of size Wt × (Ht·L) stores each trail's
 *      last L positions (slot 0 = live head, slot L-1 = tail). Recording is ADAPTIVE
 *      (version B): a small "advance" pass decides PER TRAIL whether to store a new
 *      point this frame — when the head has moved MAX_DIST (straight) or turned past
 *      TURN_DEG (a bend) since the last stored point. The "record" pass then scrolls
 *      each trail's ring by that per-trail flag, keeps slot 0 glued to the live head,
 *      and COLLAPSES a trail to a point the frame it respawns (age≈0) so a recycled
 *      head never draws a teleport streak. Net: the fixed L points concentrate on
 *      bends → smoother curves at the same vertex count.
 *
 *   3. RIBBON — an InstancedBufferGeometry drawn once per trail as a camera-facing quad
 *      strip following a CENTRIPETAL Catmull-Rom spline through the history points
 *      (TRAIL_SMOOTH_SUB subdivisions per segment → smooth bends, no overshoot/loops on
 *      the unevenly-spaced adaptive points). The vertex shader texelFetches the 4
 *      control points around its continuous slot (gl_InstanceID → trail), interpolates,
 *      expands sideways by a per-trail world-space WIDTH (WebGL can't do lineWidth>1),
 *      projects, and fades/colours by slot. Normal blending + depth-write → nearer trails
 *      occlude farther ones (dense-area fill win), reading as solid filaments of varying
 *      thickness that fade out along their tails.
 *
 * Cost scales with the GPU, not the CPU, so TRAIL_COUNT can be tens of thousands.
 */

import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { ParticleSim } from './particleSim.js';
import { computeSeedDensity, densityWeightedIndices } from './seedDensity.js';
import { BURST_FRAG, ADVANCE_FRAG, RECORD_FRAG, RIBBON_VERT, RIBBON_FRAG } from './gpuTrailsShaders.js';
import {
  TRAIL_COUNT,
  TRAIL_CLUSTER_BIAS,
  TRAIL_HISTORY,
  TRAIL_SMOOTH_SUB,
  TRAIL_SAMPLE_MIN_DIST,
  TRAIL_SAMPLE_MAX_DIST,
  TRAIL_SAMPLE_TURN_DEG,
  TRAIL_SAMPLE_PAINT_MIN_DIST,
  TRAIL_SPEED,
  TRAIL_OPACITY,
  TRAIL_SOFT_ADD,
  TRAIL_EMISSIVE,
  TRAIL_FRINGE,
  TRAIL_COLOR,
  TRAIL_PAINT_COLOR_AMT,
  TRAIL_HUE_JITTER,
  TRAIL_CONTRAST_FRAC,
  TRAIL_CONTRAST_HUE,
  TRAIL_CONTRAST_SAT,
  TRAIL_CONTRAST_LIT,
  TRAIL_FADE_POW,
  TRAIL_WIDTH,
  TRAIL_WIDTH_VAR,
  TRAIL_WIDTH_CONTRAST,
  TRAIL_THIN_RATIO,
  TRAIL_TAPER_HEAD,
  TRAIL_TAPER_TAIL,
  TRAIL_CURVE_WIDTH,
  TRAIL_CURVE_SCALE,
  TRAIL_PULSE_STRENGTH,
  TRAIL_PULSE_SPEED,
  TRAIL_PULSE_DENSITY,
  TRAIL_SPAWN_CHURN,
  TRAIL_SPAWN_DRIFT,
  TRAIL_SPAWN_DRIFT_MIN,
  TRAIL_SPAWN_DRIFT_MAX,
  TRAIL_SPAWN_DRIFT_RATE,
  TRAIL_DEATH_TIME,
  TRAIL_DEATH_FADE_FLOOR,
  BEAT_DISPLACE_AMT_TRAIL,
  BEAT_DISPLACE_FREQ,
  BEAT_FIELD_DRIFT,
  TRAIL_NEAR_CULL,
  TRAIL_FAR_CULL,
  TRAIL_FAR_SAT_MUL,
  TRAIL_FAR_LIT_ADD,
  TRAIL_FAR_OPACITY_MUL,
  TRAIL_AUDIO_BEAT_WHIP,
  TRAIL_AUDIO_LENGTH,
  TRAIL_AUDIO_GLOW_BEAT,
  TRAIL_AUDIO_GLOW_LOUD,
  TRAIL_OPACITY_BREATH_MIN,
  TRAIL_AUDIO_THICKNESS,
  TRAIL_AUDIO_PULSE_BEAT,
  TRAIL_AUDIO_PULSE_LOUD,
  TRAIL_AUDIO_PULSE_SPEED,
  TRAIL_PAINT_STRENGTH,
  TRAIL_TAIL_BURST,
  TRAIL_TAIL_BURST_WINDOW,
  TRAIL_TAIL_BURST_MAX,
  TRAIL_TAIL_BURST_FALLOFF,
  PAINT_LIFE_BOOST,
  PAINT_DRIFT,
  CLOUD_BEHIND_FRAC,
  SIM_VOL_HALF,
  SIM_KILL_RADIUS,
  TONE_MAPPING_EXPOSURE,
  SHAPE_SCALE,
  TRANSITION_SPAWN_RAMP_TIME,
  TRANSITION_SPAWN_FADE_DUR,
} from '../config.js';

export class GPUTrails {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {object} opts
   * @param {number}       opts.count          number of trails
   * @param {Float32Array} opts.seedPositions  shape seeds (any length; sampled to count)
   * @param {THREE.Data3DTexture} [opts.volTex]
   * @param {number}       [opts.volHalf]
   */
  constructor(renderer, { count = TRAIL_COUNT, seedPositions = null, volTex = null, volHalf = SIM_VOL_HALF } = {}) {
    this.renderer = renderer;
    this.count = count;
    this.historyLen = TRAIL_HISTORY;
    this.speedMul = TRAIL_SPEED;
    this.enabled = true;
    this._seeds = seedPositions;
    // Scratch vector for the camera forward direction — see update()'s sim.update
    // call (forward-biased respawn reach, matching the ribbon shader's own fade).
    this._camFwd = new THREE.Vector3(0, 0, -1);

    // Trails home preferentially to DENSE shape regions (∝ density^clusterBias) so they
    // braid into bundles; sparse regions get few/no trails (mesh-only). Density is cached
    // per seed source so the 'cluster bias' slider can re-seed without recomputing it.
    this.clusterBias = TRAIL_CLUSTER_BIAS;
    this._densityRadius = SHAPE_SCALE * 0.12;
    this._density = null;
    this._densityFor = null;

    // Adaptive recording (version B): per-trail sample spacing. Live-tunable.
    // audio "length" eases sampleMaxDist up (longer trails on loud sections).
    this.sampleMinDist = TRAIL_SAMPLE_MIN_DIST;
    this.sampleMaxDist = TRAIL_SAMPLE_MAX_DIST;
    this.sampleTurnDeg = TRAIL_SAMPLE_TURN_DEG;
    // While blooms are active, raise the spacing floor so paint bends the ribbon
    // instead of bunching it into a stub (keeps length). See _advancePass / config.
    this.samplePaintMinDist = TRAIL_SAMPLE_PAINT_MIN_DIST;

    // Base appearance (sliders); audio flares the actual uniforms on top each frame in update().
    this.baseOpacity = TRAIL_OPACITY;
    this.baseWidth = TRAIL_WIDTH;
    this.basePulseStrength = TRAIL_PULSE_STRENGTH;
    this.basePulseSpeed = TRAIL_PULSE_SPEED;
    // Live-tunable audio-reaction gains.
    this.audio = {
      beatWhip: TRAIL_AUDIO_BEAT_WHIP,
      length: TRAIL_AUDIO_LENGTH,
      glowBeat: TRAIL_AUDIO_GLOW_BEAT,
      glowLoud: TRAIL_AUDIO_GLOW_LOUD,
      thickness: TRAIL_AUDIO_THICKNESS,       // beat → width swell
      pulseBeat: TRAIL_AUDIO_PULSE_BEAT,      // beat → pulse strength
      pulseLoud: TRAIL_AUDIO_PULSE_LOUD,      // loud → pulse strength
      pulseSpeed: TRAIL_AUDIO_PULSE_SPEED,    // beat → pulse travel speed
    };
    // How much click-paint bends the trails (0…1+), independent of the meshes.
    this.paintStrength = TRAIL_PAINT_STRENGTH;
    // How strongly a click's burst bends the frozen HISTORY tail (whole-ribbon bloom).
    this.tailBurst = TRAIL_TAIL_BURST;
    // PEAK per-frame cap on the tail displacement. This cap is FIREWORK-SHAPED over the
    // burst window (see update): it governs the ribbon's outward speed so the bloom goes
    // fast → smooth slow → dead stop, and bounds the total so it can't fling out.
    this.tailBurstMax = TRAIL_TAIL_BURST_MAX;
    this.tailBurstFalloff = TRAIL_TAIL_BURST_FALLOFF;
    this._tailBurstNow = 0;      // gain gate — nonzero only during the post-click window
    this._tailBurstCapNow = 0;   // firework-shaped per-frame budget, recomputed each frame

    // 1. Heads — a dedicated flow sim (same code as the mesh cloud). Painted trail heads
    //    live longer than mesh particles (uPaintLifeBoost) so a ribbon holds the mark
    //    longer before recycling; meshes keep the default 0.
    this.sim = new ParticleSim(renderer, count, this._buildSeeds(seedPositions, count));
    this.sim.mat.uniforms.uPaintLifeBoost.value = PAINT_LIFE_BOOST;
    // Trails-only post-surge creep: settled painted ribbons keep a gentle outward drift
    // instead of freezing once the firework decays (meshes keep 0 — see paintField.glsl).
    this.sim.mat.uniforms.uPaintDrift.value = PAINT_DRIFT;
    // Trails-only animated spawn: gently reshuffle which streamline each ribbon rides + slide
    // the birth point downstream, so the bundle stops looking frozen (meshes keep 0).
    this.sim.mat.uniforms.uSpawnChurn.value = TRAIL_SPAWN_CHURN;
    this.sim.mat.uniforms.uSpawnDrift.value = TRAIL_SPAWN_DRIFT;
    this.sim.mat.uniforms.uSpawnDriftRate.value = TRAIL_SPAWN_DRIFT_RATE;
    // Mood maps into this band each frame (main.js); panel edits min/max live.
    this.spawnDriftMin = TRAIL_SPAWN_DRIFT_MIN;
    this.spawnDriftMax = TRAIL_SPAWN_DRIFT_MAX;
    if (volTex) this.sim.setVolume(volTex, volHalf);
    this.Wt = this.sim.width;
    this.Ht = this.sim.height;

    // 2. History ping-pong (Wt × Ht·L float RGBA).
    const L = this.historyLen;
    const rtOpts = {
      type: THREE.FloatType, format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
      wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false, stencilBuffer: false,
    };
    this.histA = new THREE.WebGLRenderTarget(this.Wt, this.Ht * L, rtOpts);
    this.histB = new THREE.WebGLRenderTarget(this.Wt, this.Ht * L, rtOpts);

    // 2b. Per-trail shaped burst vector (Wt × Ht). Recomputed by the burst pass while
    // a click is fresh; the record pass reads it (one fetch/slot) to bend the tail.
    this.burstTex = new THREE.WebGLRenderTarget(this.Wt, this.Ht, {
      type: THREE.FloatType, format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
      wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false, stencilBuffer: false,
    });

    this.burstMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: /* glsl */ `
        precision highp float;
        in vec3 position;
        void main() { gl_Position = vec4(position, 1.0); }
      `,
      fragmentShader: BURST_FRAG,
      uniforms: {
        uHead: { value: null },
        // Share the SAME bloom uniform objects as the trail sim (syncUniforms writes
        // into these each frame), so the burst pass sees the current active blooms.
        uBloomCount: this.sim.mat.uniforms.uBloomCount,
        uPaintStrength: this.sim.mat.uniforms.uPaintStrength,
        uBloomA: this.sim.mat.uniforms.uBloomA,
        uBloomB: this.sim.mat.uniforms.uBloomB,
        uBloomC: this.sim.mat.uniforms.uBloomC,
        uBloomD: this.sim.mat.uniforms.uBloomD,
        // Share the living-field animation uniforms too (paintBurst → paintWarp uses them),
        // so the tail-burst shape swirls/evolves in lock-step with the sim's paintApply.
        uPaintTime: this.sim.mat.uniforms.uPaintTime,
        uPaintSwirl: this.sim.mat.uniforms.uPaintSwirl,
        uPaintEvolve: this.sim.mat.uniforms.uPaintEvolve,
      },
    });
    this.burstQuad = new FullScreenQuad(this.burstMat);

    // 2c. Per-trail advance flag (Wt × Ht, r = 1 → store a point this frame). Written
    // by the advance pass each frame; read by the record pass. Adaptive recording.
    this.advanceTex = new THREE.WebGLRenderTarget(this.Wt, this.Ht, {
      type: THREE.FloatType, format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
      wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false, stencilBuffer: false,
    });

    this.advanceMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: /* glsl */ `
        precision highp float;
        in vec3 position;
        void main() { gl_Position = vec4(position, 1.0); }
      `,
      fragmentShader: ADVANCE_FRAG,
      uniforms: {
        uHead: { value: null },
        uHist: { value: null },
        uHt: { value: this.Ht },
        uMinDist: { value: this.sampleMinDist },
        uMaxDist: { value: this.sampleMaxDist },
        uTurnCos: { value: Math.cos(this.sampleTurnDeg * Math.PI / 180) },
        uDt: { value: 0 },
      },
    });
    this.advanceQuad = new FullScreenQuad(this.advanceMat);

    this.recordMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: /* glsl */ `
        precision highp float;
        in vec3 position;
        void main() { gl_Position = vec4(position, 1.0); }
      `,
      fragmentShader: RECORD_FRAG,
      uniforms: {
        uHead: { value: null },
        uPrevHist: { value: null },
        uBurst: { value: this.burstTex.texture },
        uAdvanceTex: { value: this.advanceTex.texture },
        uHt: { value: this.Ht },
        uL: { value: L },
        uDt: { value: 0 },
        uInit: { value: 0 },
        uTailBurst: { value: this.tailBurst },
        uTailBurstMax: { value: this.tailBurstMax },
      },
    });
    this.recordQuad = new FullScreenQuad(this.recordMat);

    // 3. Ribbon geometry: a camera-facing quad strip along a Catmull-Rom spline through
    //    the L recorded points. Each of the L-1 segments is subdivided SUB times, so the
    //    curve reads smooth (not faceted). M points → 2M verts, M-1 quads (2 tris each).
    //    aParam is the continuous slot [0..L-1] the vertex shader interpolates at.
    const SUB = Math.max(1, TRAIL_SMOOTH_SUB | 0);
    const M = (L - 1) * SUB + 1;
    const vertCount = M * 2;
    const aParam = new Float32Array(vertCount);
    const aSide = new Float32Array(vertCount);
    for (let m = 0; m < M; m++) {
      const fj = m / SUB;   // continuous slot in [0, L-1]
      aParam[m * 2] = fj; aSide[m * 2] = -1;
      aParam[m * 2 + 1] = fj; aSide[m * 2 + 1] = 1;
    }
    const index = [];
    for (let s = 0; s < M - 1; s++) {
      const a = s * 2, b = s * 2 + 1, c = s * 2 + 2, d = s * 2 + 3;
      index.push(a, b, c, b, d, c);   // two triangles per drawn segment
    }

    const geom = new THREE.InstancedBufferGeometry();
    geom.instanceCount = count;
    geom.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(vertCount * 3), 3));
    geom.setAttribute('aParam', new THREE.Float32BufferAttribute(aParam, 1));
    geom.setAttribute('aSide', new THREE.Float32BufferAttribute(aSide, 1));
    geom.setIndex(index);
    this.geom = geom;

    const base = new THREE.Color(TRAIL_COLOR);
    const hsl = { h: 0, s: 0, l: 0 };
    base.getHSL(hsl);

    this.material = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: RIBBON_VERT,
      fragmentShader: RIBBON_FRAG,
      transparent: true,
      // Soft-additive (SrcAlpha/One) with depthWrite ON: nearer trails still occlude farther
      // ones → overdraw stays capped (the FPS win). Glow adds against the scene / meshes,
      // not as a milky trail stack. softAdd=0 falls back to NormalBlending (solid ribbons).
      depthTest: true,
      depthWrite: true,
      side: THREE.DoubleSide,   // ribbon can face either way; a solid ribbon reads the same
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneFactor,
      uniforms: {
        uHist: { value: this.histA.texture },
        uWt: { value: this.Wt },
        uHt: { value: this.Ht },
        uL: { value: L },
        uProj: { value: new THREE.Matrix4() },
        uView: { value: new THREE.Matrix4() },
        uCamPos: { value: new THREE.Vector3() },
        uCamFwd: { value: new THREE.Vector3(0, 0, -1) },
        uNearCull: { value: TRAIL_NEAR_CULL },
        uFarCull: { value: TRAIL_FAR_CULL },
        uKillRadius: { value: SIM_KILL_RADIUS },
        uBehindFrac: { value: CLOUD_BEHIND_FRAC },
        uFarSatMul: { value: TRAIL_FAR_SAT_MUL },
        uFarLitAdd: { value: TRAIL_FAR_LIT_ADD },
        uFarOpacityMul: { value: TRAIL_FAR_OPACITY_MUL },
        uColorHSL: { value: new THREE.Vector3(hsl.h, hsl.s, hsl.l) },
        uHueJitter: { value: TRAIL_HUE_JITTER },
        uContrastFrac: { value: TRAIL_CONTRAST_FRAC },
        uContrastHue: { value: TRAIL_CONTRAST_HUE },
        uContrastSat: { value: TRAIL_CONTRAST_SAT },
        uContrastLit: { value: TRAIL_CONTRAST_LIT },
        uFadePow: { value: TRAIL_FADE_POW },
        uOpacity: { value: TRAIL_OPACITY },
        uSpawnFrac: { value: 1.0 },
        uSpawnElapsed: { value: TRANSITION_SPAWN_RAMP_TIME + TRANSITION_SPAWN_FADE_DUR },
        uSpawnRampTime: { value: TRANSITION_SPAWN_RAMP_TIME },
        uSpawnFadeDur: { value: TRANSITION_SPAWN_FADE_DUR },
        uFlowReady: { value: 1.0 },
        uSoftAdd: { value: TRAIL_SOFT_ADD },
        uEmissive: { value: TRAIL_EMISSIVE },
        uFringe: { value: TRAIL_FRINGE },
        uToneExposure: { value: TONE_MAPPING_EXPOSURE },
        // Permanent ink colour — bloom arrays shared with the trail sim (syncUniforms).
        uBloomCount: this.sim.mat.uniforms.uBloomCount,
        uBloomA: this.sim.mat.uniforms.uBloomA,
        uBloomE: this.sim.mat.uniforms.uBloomE,
        uPaintColorAmt: { value: TRAIL_PAINT_COLOR_AMT },
        uWidth: { value: TRAIL_WIDTH },
        uWidthVar: { value: TRAIL_WIDTH_VAR },
        uWidthContrast: { value: TRAIL_WIDTH_CONTRAST },
        uThinRatio: { value: TRAIL_THIN_RATIO },
        uTaperHead: { value: TRAIL_TAPER_HEAD },
        uTaperTail: { value: TRAIL_TAPER_TAIL },
        uCurveWidth: { value: TRAIL_CURVE_WIDTH },
        uCurveScale: { value: TRAIL_CURVE_SCALE },
        uPulseTime: { value: 0.0 },
        uPulseSpeed: { value: TRAIL_PULSE_SPEED },
        uPulseDensity: { value: TRAIL_PULSE_DENSITY },
        uPulseStrength: { value: TRAIL_PULSE_STRENGTH },
        // Age-death reel-in: the ribbon reads the head's age+life from the sim (refreshed each
        // frame in update() because the sim ping-pongs its render targets).
        uSimState: { value: this.sim.getPositionTexture() },
        uSimCell: { value: this.sim.getCellTexture() },
        uDeathTime: { value: TRAIL_DEATH_TIME },
        uDeathFadeFloor: { value: TRAIL_DEATH_FADE_FLOOR },
        // Phase B: cluster-local beat displacement (shared config with the mesh so overlapping
        // dots + ribbons punch together). uBeatPulse + uBeatTime written each frame in update().
        uBeatAmt: { value: BEAT_DISPLACE_AMT_TRAIL },  // toned WAY down vs the mesh
        uBeatFreq: { value: BEAT_DISPLACE_FREQ },
        uBeatPulse: { value: 0.0 },
        uBeatTime: { value: 0.0 },
        uBeatDrift: { value: BEAT_FIELD_DRIFT },
      },
    });

    this.object3D = new THREE.Mesh(geom, this.material);
    this.object3D.frustumCulled = false;
    this._applyBlendMode(TRAIL_SOFT_ADD);   // soft-add or solid, matching the baked default

    // Trails share the main framebuffer's depth (see render()): they draw straight onto
    // the screen after the meshes, depth-tested against the mesh depth so meshes occlude
    // them. A tiny scene wrapper lets renderer.render() draw just the ribbon object.
    this.trailScene = new THREE.Scene();
    this.trailScene.add(this.object3D);

    this._view = new THREE.Matrix4();

    // Seed the history from the initial head positions so nothing draws garbage
    // before the ring fills.
    this._initHistory();
  }

  // Build a count-length seed array by DENSITY-WEIGHTED sampling of the shape seeds
  // (∝ density^clusterBias, with replacement) so trails cluster into the dense regions.
  // Density is cached per seed source (recomputed only when the shape changes).
  _buildSeeds(seedPositions, count) {
    const out = new Float32Array(count * 3);
    const n = seedPositions ? (seedPositions.length / 3) | 0 : 0;
    if (n === 0) return out;

    if (this._densityFor !== seedPositions) {
      this._density = computeSeedDensity(seedPositions, this._densityRadius);
      this._densityFor = seedPositions;
    }

    const idx = densityWeightedIndices(this._density, count, this.clusterBias);
    for (let i = 0; i < count; i++) {
      const s = idx[i];
      out[i * 3] = seedPositions[s * 3];
      out[i * 3 + 1] = seedPositions[s * 3 + 1];
      out[i * 3 + 2] = seedPositions[s * 3 + 2];
    }
    return out;
  }

  // Re-draw the trail home seeds from the current shape with the current clusterBias
  // (used by the 'cluster bias' slider). Cheap — reuses the cached density.
  reseed() {
    if (!this._seeds) return;
    this.sim.reset(this._buildSeeds(this._seeds, this.count));
    this._initHistory();
  }

  // Evaluate the full shaped archetype burst once per trail (at the head) → burstTex.
  // Called only while a click is fresh (see update); the record pass reads the result.
  _burstPass() {
    this.burstMat.uniforms.uHead.value = this.sim.getPositionTexture();
    this.renderer.setRenderTarget(this.burstTex);
    this.burstQuad.render(this.renderer);
    this.renderer.setRenderTarget(null);
  }

  // Adaptive recording: decide per trail whether to store a point this frame → advanceTex.
  // Reads the head + the two most-recent stored points; cheap (~count fetches). Must run
  // before _recordPass (which reads its result) and reflects the audio-eased max spacing.
  _advancePass(minDist, maxDist, dt) {
    const u = this.advanceMat.uniforms;
    u.uHead.value = this.sim.getPositionTexture();
    u.uHist.value = this.histA.texture;
    u.uMinDist.value = Math.min(minDist, maxDist);
    u.uMaxDist.value = maxDist;
    u.uTurnCos.value = Math.cos(this.sampleTurnDeg * Math.PI / 180);
    u.uDt.value = dt;
    this.renderer.setRenderTarget(this.advanceTex);
    this.advanceQuad.render(this.renderer);
    this.renderer.setRenderTarget(null);
  }

  _recordPass(dt, init) {
    const u = this.recordMat.uniforms;
    u.uHead.value = this.sim.getPositionTexture();
    u.uPrevHist.value = this.histA.texture;
    u.uAdvanceTex.value = this.advanceTex.texture;
    u.uDt.value = dt;
    u.uInit.value = init ? 1 : 0;
    u.uTailBurst.value = this._tailBurstNow;
    u.uTailBurstMax.value = this._tailBurstCapNow;   // firework-shaped per-frame budget
    this.renderer.setRenderTarget(this.histB);
    this.recordQuad.render(this.renderer);
    this.renderer.setRenderTarget(null);
    const t = this.histA; this.histA = this.histB; this.histB = t;
    this.material.uniforms.uHist.value = this.histA.texture;
  }

  _initHistory() {
    // Collapse every slot onto the current head, into BOTH targets (init ignores advance).
    this._recordPass(1, true);
    this._recordPass(1, true);
  }

  // Head opacity BASE. The audio glow flares the uOpacity uniform above this each frame.
  get opacity() { return this.baseOpacity; }
  set opacity(v) { this.baseOpacity = v; this.material.uniforms.uOpacity.value = v; }
  get spawnFrac() { return this.material.uniforms.uSpawnFrac.value; }
  set spawnFrac(v) { this.material.uniforms.uSpawnFrac.value = v; }
  get spawnElapsed() { return this.material.uniforms.uSpawnElapsed.value; }
  set spawnElapsed(v) { this.material.uniforms.uSpawnElapsed.value = v; }
  // Per-particle reveal-instant timescale (seconds) — revealHash() spreads each
  // trail's individual reveal moment across [0, spawnRampTime]. MUST match
  // whichever ramp duration is actually driving spawnElapsed (coverFadeInDuration
  // for the cover-page ramps, TRANSITION_SPAWN_RAMP_TIME for the real cover→game
  // ramp) — left at the wrong (longer) value, spawnElapsed catches up to spawnFrac's
  // st=1 well before most particles' individual revealAt thresholds are crossed,
  // so the population visibly stalls sparse/mostly-hidden long after the ramp
  // "finished" (see main.js's cover-fade-in / applyRealTrackMood callers).
  get spawnRampTime() { return this.material.uniforms.uSpawnRampTime.value; }
  set spawnRampTime(v) { this.material.uniforms.uSpawnRampTime.value = v; }
  get flowReady() { return this.material.uniforms.uFlowReady.value; }
  set flowReady(v) { this.material.uniforms.uFlowReady.value = v; }
  // Sim-side lifetime cap (seconds) — pushed way out (e.g. 9999) during the
  // spawn ramp so revealed trail-heads don't age-out/respawn (which would
  // fade them back to 0 via the render shader's age-based `death` envelope,
  // then birth-fade back in) before the ramp finishes growing the population.
  // That looked like "particles die then come back" instead of pure growth.
  // Restored to SIM_MAX_LIFE once the ramp completes (see main.js).
  get maxLife() { return this.sim.mat.uniforms.uMaxLife.value; }
  set maxLife(v) { this.sim.mat.uniforms.uMaxLife.value = v; }
  // Recycle-bubble radius (world units). Setting the sim's is enough — the
  // render material's uKillRadius is re-synced from it every frame (see update()).
  get killRadius() { return this.sim.mat.uniforms.uKillRadius.value; }
  set killRadius(v) { this.sim.mat.uniforms.uKillRadius.value = v; }
  // Forward-bias strength for both the respawn reach (sim) and the render
  // fade (material) — 1.0 = symmetric (no bias, used on the cover page, which
  // only rotates in place and never consumes space by flying forward, so
  // there's nothing to compensate for); CLOUD_BEHIND_FRAC (<1) = shrinks the
  // reach/fade behind the camera, used during real forward flight to avoid a
  // "gap" ahead. Unlike killRadius, NOT auto-synced between sim/material each
  // frame, so both must be set explicitly.
  get behindFrac() { return this.sim.mat.uniforms.uBehindFrac.value; }
  set behindFrac(v) {
    this.sim.mat.uniforms.uBehindFrac.value = v;
    this.material.uniforms.uBehindFrac.value = v;
  }

  // Soft-additive glow strength (0 = solid NormalBlending; >0 = SrcAlpha/One + depthWrite).
  get softAdd() { return this.material.uniforms.uSoftAdd.value; }
  set softAdd(v) {
    const a = Math.max(0, v);
    this.material.uniforms.uSoftAdd.value = a;
    this._applyBlendMode(a);
  }

  get emissive() { return this.material.uniforms.uEmissive.value; }
  set emissive(v) { this.material.uniforms.uEmissive.value = Math.max(0, v); }

  get fringe() { return this.material.uniforms.uFringe.value; }
  set fringe(v) { this.material.uniforms.uFringe.value = Math.max(0, v); }

  // Paint accent mix (0 = no tint, 1 = full paint color at bloom core).
  get paintColorAmt() { return this.material.uniforms.uPaintColorAmt.value; }
  set paintColorAmt(v) { this.material.uniforms.uPaintColorAmt.value = v; }

  _applyBlendMode(softAdd) {
    const m = this.material;
    if (softAdd > 0) {
      m.blending = THREE.CustomBlending;
      m.blendEquation = THREE.AddEquation;
      m.blendSrc = THREE.SrcAlphaFactor;
      m.blendDst = THREE.OneFactor;
    } else {
      m.blending = THREE.NormalBlending;
    }
    m.needsUpdate = true;
  }

  // Live count: how many trails to actually draw (0…count). Cheap fill control.
  get drawCount() { return this.geom.instanceCount; }
  set drawCount(n) { this.geom.instanceCount = Math.max(0, Math.min(this.count, Math.round(n))); }

  get nearCull() { return this.material.uniforms.uNearCull.value; }
  set nearCull(v) { this.material.uniforms.uNearCull.value = v; }
  get farCull() { return this.material.uniforms.uFarCull.value; }
  set farCull(v) { this.material.uniforms.uFarCull.value = v; }

  // Width BASE; audio thickness swells uWidth above this each frame in update().
  get width() { return this.baseWidth; }
  set width(v) { this.baseWidth = v; this.material.uniforms.uWidth.value = v; }
  get widthVar() { return this.material.uniforms.uWidthVar.value; }
  set widthVar(v) { this.material.uniforms.uWidthVar.value = v; }
  get widthContrast() { return this.material.uniforms.uWidthContrast.value; }
  set widthContrast(v) { this.material.uniforms.uWidthContrast.value = v; }
  get thinRatio() { return this.material.uniforms.uThinRatio.value; }
  set thinRatio(v) { this.material.uniforms.uThinRatio.value = v; }
  get taperHead() { return this.material.uniforms.uTaperHead.value; }
  set taperHead(v) { this.material.uniforms.uTaperHead.value = v; }
  get taperTail() { return this.material.uniforms.uTaperTail.value; }
  set taperTail(v) { this.material.uniforms.uTaperTail.value = v; }
  get curveWidth() { return this.material.uniforms.uCurveWidth.value; }
  set curveWidth(v) { this.material.uniforms.uCurveWidth.value = v; }
  get curveScale() { return this.material.uniforms.uCurveScale.value; }
  set curveScale(v) { this.material.uniforms.uCurveScale.value = v; }
  // Post-surge outward creep for settled painted ribbons (0 = frozen after the surge).
  get paintDrift() { return this.sim.mat.uniforms.uPaintDrift.value; }
  set paintDrift(v) { this.sim.mat.uniforms.uPaintDrift.value = v; }
  // Pulse BASES; audio boosts the actual uniforms each frame in update().
  get pulseStrength() { return this.basePulseStrength; }
  set pulseStrength(v) { this.basePulseStrength = v; this.material.uniforms.uPulseStrength.value = v; }
  get pulseSpeed() { return this.basePulseSpeed; }
  set pulseSpeed(v) { this.basePulseSpeed = v; this.material.uniforms.uPulseSpeed.value = v; }
  get pulseDensity() { return this.material.uniforms.uPulseDensity.value; }
  set pulseDensity(v) { this.material.uniforms.uPulseDensity.value = v; }
  // Living base-field warp amount (0 = frozen field; shared with the mesh sim look).
  get fieldWarpAmt() { return this.sim.mat.uniforms.uFieldWarpAmt.value; }
  set fieldWarpAmt(v) { this.sim.mat.uniforms.uFieldWarpAmt.value = v; }
  // Animated spawn: churn = seeds/sec the ridden streamline reshuffles; drift = downstream
  // spawn offset along the flow line (0 = fixed-seed old behaviour).
  get spawnChurn() { return this.sim.mat.uniforms.uSpawnChurn.value; }
  set spawnChurn(v) { this.sim.mat.uniforms.uSpawnChurn.value = v; }
  get spawnDrift() { return this.sim.mat.uniforms.uSpawnDrift.value; }
  set spawnDrift(v) { this.sim.mat.uniforms.uSpawnDrift.value = v; }
  // Age-death reel-in window (seconds the tail takes to retract into the head; 0 = off).
  get deathTime() { return this.material.uniforms.uDeathTime.value; }
  set deathTime(v) { this.material.uniforms.uDeathTime.value = v; }
  // Subtle age-death alpha floor layered on the reel-in (1 = pure retract, 0 = fade fully out).
  get deathFadeFloor() { return this.material.uniforms.uDeathFadeFloor.value; }
  set deathFadeFloor(v) { this.material.uniforms.uDeathFadeFloor.value = v; }

  // Phase B cluster-local beat punch (trail side). Magnitude (world units) at a full beat.
  get beatAmt() { return this.material.uniforms.uBeatAmt.value; }
  set beatAmt(v) { this.material.uniforms.uBeatAmt.value = v; }
  // Cluster field frequency (cluster size ≈ 1/freq); keep low so ribbons flex, not shatter.
  get beatFreq() { return this.material.uniforms.uBeatFreq.value; }
  set beatFreq(v) { this.material.uniforms.uBeatFreq.value = v; }

  setVolume(tex, half) {
    this.sim.setVolume(tex, half);
  }

  // Re-seed onto a new shape (base-shape change).
  reset(seedPositions) {
    this._seeds = seedPositions;
    this.sim.reset(this._buildSeeds(seedPositions, this.count));
    this._initHistory();
  }

  /**
   * @param {number} dt
   * @param {THREE.Vector3} camPos
   * @param {number} flowSpeed   live mood/audio flow speed (matches the mesh sim)
   * @param {THREE.Camera} camera
   */
  update(dt, camPos, flowSpeed, camera, audioMod = null, paint = null) {
    if (!this.enabled) { this.object3D.visible = false; return; }
    this.object3D.visible = true;

    // Audio reactions (Phase A). {beat, loud} come from the SAME AudioMotion source
    // as the meshes (or null when no track is playing → resting behaviour). All layer
    // on top of the base slider values so manual tuning still reads as the baseline.
    const beat = audioMod ? audioMod.beat : 0;
    const loud = audioMod ? audioMod.loud : 0;
    const a = this.audio;

    // Speed: extra beat WHIP on top of the already-shared flow accent (punchy).
    const speed = flowSpeed * this.speedMul * (1 + a.beatWhip * beat);
    this.sim.mat.uniforms.uFlowSpeed.value = speed;

    // Paint (click blooms): feed the SAME camera-windowed blooms into the trail sim,
    // scaled by paintStrength so trails can bend more/less than the meshes. Must run
    // before sim.update so this step's advection includes the paint force.
    if (paint && paint.field) paint.field.syncUniforms(this.sim.mat.uniforms, camPos, paint.elapsed);
    this.sim.mat.uniforms.uPaintStrength.value = this.paintStrength;

    // Tail bend is transient: only displace the frozen history for a short window after a
    // click (then the record pass skips it → free). Within the window, the per-frame budget
    // follows a FIREWORK curve — full at the click (fast bloom), decaying smoothly to 0 at
    // the window end (slow-down → dead stop, no cliff). The cap (not the raw burst) sets the
    // ribbon's outward speed, so the profile is predictable and the total stays bounded.
    const sinceClick = paint && paint.field
      ? paint.elapsed - (paint.field.lastAddTime ?? -1e9)
      : 1e9;
    if (sinceClick >= 0 && sinceClick < TRAIL_TAIL_BURST_WINDOW) {
      this._tailBurstNow = this.tailBurst;
      const x = sinceClick / TRAIL_TAIL_BURST_WINDOW;      // 0 at click .. 1 at window end
      const F = Math.max(0.01, this.tailBurstFalloff);
      // exp falloff normalized to 1 at x=0 and exactly 0 at x=1 → fast start, gentle tail,
      // guaranteed smooth close (no residual to cut off).
      const shape = (Math.exp(-F * x) - Math.exp(-F)) / (1 - Math.exp(-F));
      this._tailBurstCapNow = this.tailBurstMax * shape;
    } else {
      this._tailBurstNow = 0;
      this._tailBurstCapNow = 0;
    }

    this.sim.update(dt, camPos, camera.getWorldDirection(this._camFwd));

    // Length: loud sections lengthen the trail by easing the max sample spacing up
    // (section-level, since re-spacing the ring takes ~L samples — not beat-instant).
    const maxDist = this.sampleMaxDist * (1 + a.length * loud);

    // Opacity breathe: loudness maps into [BREATH_MIN, 1] × base (not 0↔1). glowLoud =
    // how strongly that range is applied (0 = flat at base, 1 = full 0.6→1). Beat still
    // flashes up on top, capped at 1.
    const loudT = Math.min(1, Math.max(0, loud));
    const breathTarget = TRAIL_OPACITY_BREATH_MIN + (1 - TRAIL_OPACITY_BREATH_MIN) * loudT;
    const breathAmt = Math.min(1, Math.max(0, a.glowLoud));
    const breath = 1 + breathAmt * (breathTarget - 1);
    this.material.uniforms.uOpacity.value =
      Math.min(1.0, this.baseOpacity * breath * (1 + a.glowBeat * beat));

    // Thickness on the beat: swell ribbon width (path stays put — no dizziness).
    this.material.uniforms.uWidth.value =
      this.baseWidth * (1 + a.thickness * beat);

    // Music-driven traveling pulse: stronger + faster "current" on beats / loud sections.
    this.material.uniforms.uPulseStrength.value =
      this.basePulseStrength * (1 + a.pulseBeat * beat + a.pulseLoud * loud);
    this.material.uniforms.uPulseSpeed.value =
      this.basePulseSpeed * (1 + a.pulseSpeed * beat);

    // While a click is fresh, evaluate the shaped burst once per trail (into burstTex)
    // so the record pass can bend the whole ribbon by it. Skipped otherwise → free.
    if (this._tailBurstNow > 0) this._burstPass();

    // Record adaptively: the advance pass flags which trails moved/turned enough to
    // store a new point this frame; the record pass scrolls each ring by that flag.
    // While blooms are active, raise the spacing floor so paint BENDS the ribbon rather
    // than bunching every point onto the tight paint-curl (which collapsed it to a stub).
    const bloomsActive = (this.sim.mat.uniforms.uBloomCount?.value ?? 0) > 0;
    const minDist = bloomsActive ? this.samplePaintMinDist : this.sampleMinDist;
    const rdt = Math.min(dt, 1 / 30);
    this._advancePass(minDist, maxDist, rdt);
    this._recordPass(rdt, false);

    // Camera matrices for the ribbon projection (fresh, not last frame's).
    camera.updateMatrixWorld();
    this._view.copy(camera.matrixWorld).invert();
    this.material.uniforms.uView.value.copy(this._view);
    this.material.uniforms.uProj.value.copy(camera.projectionMatrix);
    this.material.uniforms.uCamPos.value.copy(camera.position);
    camera.getWorldDirection(this.material.uniforms.uCamFwd.value);  // forward-biased fade
    // Traveling brightness pulse clock (prefer the shared elapsed; fall back to the sim's).
    this.material.uniforms.uPulseTime.value = paint?.elapsed ?? (this.sim._fieldTime || 0);
    // Refresh the sim age/life textures for the death reel-in (ping-pong → ref changes/frame).
    this.material.uniforms.uSimState.value = this.sim.getPositionTexture();
    this.material.uniforms.uSimCell.value = this.sim.getCellTexture();
    // Keep the front-reach reference in sync with the (live-tunable) sim kill radius.
    this.material.uniforms.uKillRadius.value = this.sim.mat.uniforms.uKillRadius.value;
  }

  /**
   * Prime the paint/burst GPU path once at load so the first user click doesn't hitch
   * on shader compile. Seeds a dummy bloom, runs burst (+ record with tail bend), then
   * restores clean history and clears bloom uniforms — no lasting visual effect.
   * @param {THREE.Vector3} [camPos]
   */
  warmupPaint(camPos = new THREE.Vector3()) {
    const u = this.sim.mat.uniforms;
    const prevCount = u.uBloomCount.value;
    const prevStrength = u.uPaintStrength.value;

    // One dummy bloom so paintBurst exercises the archetype loop (not just the empty path).
    u.uBloomCount.value = 1;
    u.uPaintStrength.value = Math.max(0.01, this.paintStrength);
    u.uBloomA.value[0].set(camPos.x, camPos.y, camPos.z, 1.5);
    u.uBloomB.value[0].set(1.0, 0.42, 1.0, 0.5);
    u.uBloomC.value[0].set(0, 1, 0.35, 0.6);
    u.uBloomD.value[0].set(1.4, 1.0, 2.5, 0.5);
    if (u.uBloomE?.value?.[0]) u.uBloomE.value[0].set(0.9, 0.9, 0.5, 2.2);

    this._burstPass();

    // Compile/run the record path with tail-burst enabled (branch is cold until first paint).
    this._tailBurstNow = this.tailBurst;
    this._tailBurstCapNow = this.tailBurstMax;
    this._recordPass(1 / 60, false);
    this._tailBurstNow = 0;
    this._tailBurstCapNow = 0;

    // Undo any dummy displacement — collapse history back onto heads.
    this._initHistory();

    u.uBloomCount.value = prevCount;
    u.uPaintStrength.value = prevStrength;
  }

  /**
   * Render the trails directly onto the currently-bound target (the screen), which
   * already holds the meshes' colour AND depth. depthTest+Write → meshes AND nearer trails
   * occlude farther trails (overdraw capped). Blend is soft-additive (SrcAlpha/One) when
   * softAdd > 0, else NormalBlending. autoClear off preserves mesh colour + depth.
   * Call AFTER the main scene render.
   */
  render(renderer, camera) {
    if (!this.enabled) return;
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;   // keep the meshes' colour + depth already in the buffer
    renderer.render(this.trailScene, camera);
    renderer.autoClear = prevAutoClear;
  }

  dispose() {
    this.sim.dispose?.();
    this.histA.dispose();
    this.histB.dispose();
    this.burstTex.dispose();
    this.burstMat.dispose();
    this.burstQuad.dispose();
    this.advanceTex.dispose();
    this.advanceMat.dispose();
    this.advanceQuad.dispose();
    this.recordMat.dispose();
    this.recordQuad.dispose();
    this.geom.dispose();
    this.material.dispose();
  }
}
