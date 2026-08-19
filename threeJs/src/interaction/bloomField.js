/**
 * bloomField.js — persistent, world-anchored store of click-paint blooms.
 *
 * Every click pushes one bloom onto `blooms`, which is never trimmed — that
 * array *is* the persistence (world-anchored, so revisiting a spot works for
 * free). Each frame `syncUniforms()` selects the nearest blooms within reach of
 * the camera, applies the firework strength envelope + ink-spread radius growth,
 * and packs them into the sim shader's uniform arrays. GPU cost stays bounded
 * (BLOOM_MAX_ACTIVE) regardless of how many blooms exist in the world.
 */

import {
  BLOOM_MAX_ACTIVE,
  BLOOM_RADIUS,
  BLOOM_STRENGTH,
  BLOOM_ATTACK,
  BLOOM_DECAY_TAU,
  BLOOM_DECAY_SOFT_TAU,
  BLOOM_DECAY_FAST_W,
  BLOOM_SUSTAIN,
  BLOOM_GROWTH,
  BLOOM_GROW_TAU,
  BLOOM_RADIUS_DIST_NEAR,
  BLOOM_RADIUS_DIST_FAR,
  BLOOM_RADIUS_NEAR_MUL,
  BLOOM_RADIUS_FAR_MUL,
  BLOOM_CURL_RAMP,
  BLOOM_OPEN_TIME,
  BLOOM_HOLD,
  BLOOM_FADE,
  BLOOM_MAX_STORED,
  BLOOM_COLOR_RADIUS_MUL,
  BLOOM_COLOR_GROWTH,
  BLOOM_COLOR_GROW_TAU,
  BLOOM_COLOR_LIFE,
  BLOOM_PAINT_HUE_JITTER,
  BLOOM_PAINT_HUE_REPLACE_SHIFT,
  BLOOM_PAINT_SAT,
  BLOOM_PAINT_LIT,
  BLOOM_COLOR_REPLACE_DIST,
  SIM_KILL_RADIUS,
  PAINT_ARCH_A,
  PAINT_ARCH_B,
  PAINT_BLEND,
  PAINT_OUTWARD,
  PAINT_CURL,
  PAINT_CURL_FREQ,
  PAINT_DETAIL,
  PAINT_SHELL,
} from '../config.js';
import { moodToBloomShape } from '../audio/moodToBloomShape.js';
import { moodToPaintColor, paintColorFromMain } from '../audio/moodToPaintColor.js';

// Outward (firework) envelope:
//   1) short smoothstep attack → peak (explosive)
//   2) dual exponential: mostly fast dump, then soft residual → hands off to shape
function outwardEnvelope(age) {
  if (age <= 0) return 0;
  if (age < BLOOM_ATTACK) {
    const s = age / BLOOM_ATTACK;
    // Bias toward the top of the smoothstep so peak arrives sooner (more "bang").
    const e = s * s * (3 - 2 * s);
    return e * e;
  }
  const t = age - BLOOM_ATTACK;
  const fast = Math.exp(-t / Math.max(1e-3, BLOOM_DECAY_TAU));
  const soft = Math.exp(-t / Math.max(1e-3, BLOOM_DECAY_SOFT_TAU));
  const w = Math.max(0, Math.min(1, BLOOM_DECAY_FAST_W));
  const decay = w * fast + (1 - w) * soft;
  return BLOOM_SUSTAIN + (1 - BLOOM_SUSTAIN) * decay;
}

// Curl (tangle) envelope: eases in over BLOOM_CURL_RAMP, then persists at full
// so the swirling abstract shape stays in the world.
function curlEnvelope(age) {
  if (age <= 0) return 0;
  const s = Math.min(1, age / BLOOM_CURL_RAMP);
  return s * s * (3 - 2 * s);
}

// Ink spread: radius eases outward (fast → slow) past the burst, settling at
// (1 + BLOOM_GROWTH)× the initial radius.
function bloomRadius(r0, age) {
  if (age <= 0) return r0;
  return r0 * (1 + BLOOM_GROWTH * (1 - Math.exp(-age / BLOOM_GROW_TAU)));
}

// Colour stain radius: wider base + slower bleed than the shape redirect.
function bloomColorRadius(r0, age) {
  const r = r0 * BLOOM_COLOR_RADIUS_MUL;
  if (age <= 0) return r;
  return r * (1 + BLOOM_COLOR_GROWTH * (1 - Math.exp(-age / BLOOM_COLOR_GROW_TAU)));
}

// LRU soft-fade: a mark holds at full for BLOOM_HOLD seconds, then eases to 0 over
// BLOOM_FADE. Multiplies the persistent shape weight, so as it fades the redirect weakens
// and the trail life-boost (paintInfluence reads the same weight) drops → captured trails
// release. Returns 0 once fully expired (caller prunes / skips those).
function fadeEnvelope(age) {
  if (age <= BLOOM_HOLD) return 1;
  const s = Math.min(1, (age - BLOOM_HOLD) / BLOOM_FADE);
  return 1 - s * s * (3 - 2 * s);   // smooth 1 → 0
}
const BLOOM_SHAPE_LIFE = BLOOM_HOLD + BLOOM_FADE;   // shape redirect gone
// Colour outlives shape; store prune uses the longer colour life (still LRU-capped).
const BLOOM_STORE_LIFE = Math.max(BLOOM_SHAPE_LIFE, BLOOM_COLOR_LIFE);

// Rose openness 0..1: eased ramp that the petals archetype uses to reveal its
// concentric rings one after another, then holds fully open (persists).
function openEnvelope(age) {
  if (age <= 0) return 0;
  const s = Math.min(1, age / BLOOM_OPEN_TIME);
  return s * s * (3 - 2 * s);
}

export class BloomField {
  constructor() {
    this.blooms = [];            // { pos, birth, seed, radius, strength, + shape fields }
    this.maxActive = BLOOM_MAX_ACTIVE;
    this._active = [];           // reused scratch for the windowed selection
    // Manual shape descriptor (archetype selection + the five modulators), used
    // when mood-driven is off. Defaults from config.
    this.shape = {
      archA: PAINT_ARCH_A, archB: PAINT_ARCH_B, blendAB: PAINT_BLEND,
      outward: PAINT_OUTWARD, shapeAmt: PAINT_CURL, fieldFreq: PAINT_CURL_FREQ,
      detail: PAINT_DETAIL, shell: PAINT_SHELL,
      // Size/force multipliers on the config bases (1 = the config value).
      radiusScale: 1, strengthScale: 1,
    };
    // Phase 3: when moodDriven, each click derives its shape from the current mood
    // (getMood → moodToBloomShape) instead of the manual `shape`. getMood is a
    // function returning the live 6-param mood; set by main.js. lastShape holds the
    // descriptor of the most recent bloom (for the tuning-panel readout).
    this.moodDriven = true;
    this.getMood = null;
    this.lastShape = null;
    // Live paint palette (main colour + hue shift each frame) — stains drift with music.
    this.paintColor = moodToPaintColor(null);
    // Elapsed time of the most recent click — trails use it to run their (transient)
    // tail-bend only for a short window after a paint, then go free again.
    this.lastAddTime = -1e9;
  }

  /**
   * Add a persistent bloom at a world position. `time` = current elapsed seconds.
   * `camDist` = distance from the camera to the clicked point (for distance-based radius).
   */
  add(worldPos, { time = 0, camDist = null } = {}) {
    // Mood-driven: derive the shape from the current mood; else use the manual
    // shape. Either way we snapshot it so the bloom keeps its
    // identity even as the mood / panel changes for later clicks.
    const shape = (this.moodDriven && this.getMood)
      ? moodToBloomShape(this.getMood())
      : this.shape;
    this.lastShape = shape;

    // Distance-based radius: far clicks bloom bigger, near clicks smaller (baked at click).
    let distMul = 1;
    if (camDist != null) {
      const span = Math.max(1e-3, BLOOM_RADIUS_DIST_FAR - BLOOM_RADIUS_DIST_NEAR);
      const t = Math.max(0, Math.min(1, (camDist - BLOOM_RADIUS_DIST_NEAR) / span));
      distMul = BLOOM_RADIUS_NEAR_MUL + (BLOOM_RADIUS_FAR_MUL - BLOOM_RADIUS_NEAR_MUL) * t;
    }

    // Per-click hue scatter around the live paint palette (palette itself drifts with music).
    let hueJitter = (Math.random() - 0.5) * 2 * BLOOM_PAINT_HUE_JITTER;

    // Re-paint: drop older marks near this click so the new colour replaces the old stain.
    // Same-spot clicks also step hue further so the new stain reads as a new colour.
    const replaceDist = BLOOM_COLOR_REPLACE_DIST;
    const replaceDistSq = replaceDist * replaceDist;
    if (this.blooms.length > 0) {
      let nearest = null;
      let nearestD = replaceDistSq;
      for (const m of this.blooms) {
        const d = m.pos.distanceToSquared(worldPos);
        if (d <= nearestD) {
          nearestD = d;
          nearest = m;
        }
      }
      if (nearest) {
        const dir = Math.random() < 0.5 ? 1 : -1;
        hueJitter = (nearest.colorHueJitter || 0)
          + dir * (BLOOM_PAINT_HUE_REPLACE_SHIFT + Math.random() * 0.08);
      }
      this.blooms = this.blooms.filter(
        (m) => m.pos.distanceToSquared(worldPos) > replaceDistSq,
      );
    }

    // Size + force ride the mood via scale multipliers on the config bases.
    const b = {
      pos: worldPos.clone(),
      birth: time,
      seed: Math.random() * 1000,
      radius:   BLOOM_RADIUS   * (shape.radiusScale   ?? 1) * distMul,
      strength: BLOOM_STRENGTH * (shape.strengthScale ?? 1),
      archA: shape.archA,
      archB: shape.archB,
      blendAB: shape.blendAB,
      outward: shape.outward,
      shapeAmt: shape.shapeAmt,
      fieldFreq: shape.fieldFreq,
      detail: shape.detail,
      shell: shape.shell,
      // Relative to live paintColor (synced each frame) — not a frozen absolute hue.
      colorHueJitter: hueJitter,
    };
    this.blooms.push(b);
    this.lastAddTime = time;

    // Prune expired colour marks, then LRU-cap so heavy painting can't grow unbounded.
    // Shape may have already faded; colour life is what keeps the stain in the store.
    if (this.blooms.length > 1) {
      this.blooms = this.blooms.filter((m) => time - m.birth < BLOOM_STORE_LIFE);
      const overflow = this.blooms.length - BLOOM_MAX_STORED;
      if (overflow > 0) this.blooms.splice(0, overflow);
    }
    return b;
  }

  get count() { return this.blooms.length; }

  clear() { this.blooms.length = 0; }

  /**
   * Select the nearest in-reach blooms, birth-ramp their strength, and write
   * them into the sim material's uniforms (uBloomCount, uBloomA[], uBloomB[]).
   */
  syncUniforms(uniforms, camPos, time) {
    // Drive the living-field animation (swirl + evolve) for whichever sim this is.
    if (uniforms.uPaintTime) uniforms.uPaintTime.value = time;

    const active = this._active;
    active.length = 0;

    // Include marks while colour ink still lives (shape may already be 0). Reach uses
    // the larger fully-grown colour radius so distant stains stay windowed in.
    const maxColorR = BLOOM_COLOR_RADIUS_MUL * (1 + BLOOM_COLOR_GROWTH);
    for (const b of this.blooms) {
      if (time - b.birth >= BLOOM_STORE_LIFE) continue;
      if (b.pos.distanceTo(camPos) > SIM_KILL_RADIUS + b.radius * maxColorR) continue;
      active.push(b);
    }
    active.sort((a, b) =>
      a.pos.distanceToSquared(camPos) - b.pos.distanceToSquared(camPos));

    const n = Math.min(active.length, this.maxActive);
    const A = uniforms.uBloomA.value;
    const B = uniforms.uBloomB.value;
    const C = uniforms.uBloomC.value;
    const D = uniforms.uBloomD.value;
    const E = uniforms.uBloomE?.value;

    for (let i = 0; i < n; i++) {
      const b = active[i];
      const age = time - b.birth;
      A[i].set(b.pos.x, b.pos.y, b.pos.z, bloomRadius(b.radius, age));
      // x = burst magnitude (decays to 0); z = shape blend weight 0..1 (ramps up, holds,
      // then LRU-fades to 0 → releases captured trails); w = shell (burst radial profile).
      B[i].set(b.strength * outwardEnvelope(age), b.seed, curlEnvelope(age) * fadeEnvelope(age), b.shell);
      // Per-bloom shape selection: dominant + partner archetype, blend factor,
      // and rose-openness (w) that the smoke-ring archetype uses to grow.
      C[i].set(b.archA, b.archB, b.blendAB, openEnvelope(age));
      // Per-bloom modulators (frozen at click): outward, shapeAmt, fieldFreq, detail.
      D[i].set(b.outward, b.shapeAmt, b.fieldFreq, b.detail);
      // Ink colour: live paint palette (+ per-click jitter) + growing stain radius.
      if (E) {
        const pc = this.paintColor || paintColorFromMain(null);
        const h = ((pc.h + (b.colorHueJitter || 0)) % 1 + 1) % 1;
        E[i].set(h, pc.s ?? BLOOM_PAINT_SAT, pc.l ?? BLOOM_PAINT_LIT, bloomColorRadius(b.radius, age));
      }
    }
    uniforms.uBloomCount.value = n;
  }
}
