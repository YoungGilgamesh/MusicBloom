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
  BLOOM_SUSTAIN,
  BLOOM_GROWTH,
  BLOOM_GROW_TAU,
  BLOOM_CURL_RAMP,
  BLOOM_OPEN_TIME,
  SIM_KILL_RADIUS,
  PAINT_ARCH_A,
  PAINT_ARCH_B,
  PAINT_BLEND,
} from '../config.js';

// Outward (firework) envelope: near-instant snap to peak (BLOOM_ATTACK), then
// exponential decay (fast → slow) settling toward a small permanent floor.
function outwardEnvelope(age) {
  if (age <= 0) return 0;
  if (age < BLOOM_ATTACK) return age / BLOOM_ATTACK;
  const decay = Math.exp(-(age - BLOOM_ATTACK) / BLOOM_DECAY_TAU);
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

// Rose openness 0..1: eased ramp that the petals archetype uses to reveal its
// concentric rings one after another, then holds fully open (persists).
function openEnvelope(age) {
  if (age <= 0) return 0;
  const s = Math.min(1, age / BLOOM_OPEN_TIME);
  return s * s * (3 - 2 * s);
}

export class BloomField {
  constructor() {
    this.blooms = [];            // { pos, birth, seed, radius, strength, archA, archB, blendAB }
    this.maxActive = BLOOM_MAX_ACTIVE;
    this._active = [];           // reused scratch for the windowed selection
    // Shape selection new blooms snapshot on add. Global for now (set by the
    // tuning panel); Phase 3 will derive this per-click from the current mood.
    this.shape = { archA: PAINT_ARCH_A, archB: PAINT_ARCH_B, blendAB: PAINT_BLEND };
  }

  /** Add a persistent bloom at a world position. `time` = current elapsed seconds. */
  add(worldPos, { radius = BLOOM_RADIUS, strength = BLOOM_STRENGTH, time = 0 } = {}) {
    const b = {
      pos: worldPos.clone(),
      birth: time,
      seed: Math.random() * 1000,
      radius,
      strength,
      // Snapshot the shape at click time so each bloom keeps its identity.
      archA: this.shape.archA,
      archB: this.shape.archB,
      blendAB: this.shape.blendAB,
    };
    this.blooms.push(b);
    return b;
  }

  get count() { return this.blooms.length; }

  clear() { this.blooms.length = 0; }

  /**
   * Select the nearest in-reach blooms, birth-ramp their strength, and write
   * them into the sim material's uniforms (uBloomCount, uBloomA[], uBloomB[]).
   */
  syncUniforms(uniforms, camPos, time) {
    const active = this._active;
    active.length = 0;

    // Only blooms whose influence can reach the visible bubble matter (use the
    // fully-grown radius so a still-spreading bloom near the edge stays active).
    const maxGrow = 1 + BLOOM_GROWTH;
    for (const b of this.blooms) {
      if (b.pos.distanceTo(camPos) > SIM_KILL_RADIUS + b.radius * maxGrow) continue;
      active.push(b);
    }
    active.sort((a, b) =>
      a.pos.distanceToSquared(camPos) - b.pos.distanceToSquared(camPos));

    const n = Math.min(active.length, this.maxActive);
    const A = uniforms.uBloomA.value;
    const B = uniforms.uBloomB.value;
    const C = uniforms.uBloomC.value;

    for (let i = 0; i < n; i++) {
      const b = active[i];
      const age = time - b.birth;
      A[i].set(b.pos.x, b.pos.y, b.pos.z, bloomRadius(b.radius, age));
      // x = burst magnitude (decays to 0); z = shape blend weight 0..1 (persists).
      B[i].set(b.strength * outwardEnvelope(age), b.seed, curlEnvelope(age), 0);
      // Per-bloom shape selection: dominant + partner archetype, blend factor,
      // and rose-openness (w) that the petals archetype uses to unfurl its rings.
      C[i].set(b.archA, b.archB, b.blendAB, openEnvelope(age));
    }
    uniforms.uBloomCount.value = n;
  }
}
