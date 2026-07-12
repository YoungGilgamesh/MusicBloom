/**
 * moodToConfig.js
 *
 * Each audio feature directly drives one visual dimension of the particle flow.
 * Named moods emerge naturally from their combinations — no classification needed.
 *
 * feature → visual behavior
 * ──────────────────────────────────────────────────────────────────────────────
 * energy     → flow speed + displacement magnitude
 * brightness → noise scale  (dark = large sweeping arcs, bright = fine strands)
 * texture    → domain warp  (tonal = clean parallel, complex = chaotic fracture)
 * heaviness  → vertical bias (light = float upward, heavy = sag downward)
 * dynamism   → jitter       (static = calm, restless = erratic high-freq tremor)
 * bpm        → shape scale tempo multiplier
 *
 * Resulting mood archetypes (emerge from combinations):
 *   Anxious     high texture + high dynamism + high energy
 *   Happy       low heaviness + mid brightness + mid-high energy
 *   Melancholic high heaviness + low energy + low dynamism
 *   Peaceful    low texture + low dynamism + low energy + low heaviness
 */

import { SHAPE_SCALE } from '../config.js';

const lerp  = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ── Feature → parameter ranges ────────────────────────────────────────────────

const SPEED_MIN = 0.08;   // energy=0 → almost still
const SPEED_MAX = 0.70;   // energy=1 → fast vigorous flow

const DISP_MIN  = 0.5;    // energy=0 → particles barely leave origin
const DISP_MAX  = 3.2;    // energy=1 → wide spread displacement

const NOISE_MIN = 0.08;   // brightness=0 → very large sweeping arcs  (dark)
const NOISE_MAX = 0.55;   // brightness=1 → fine-grained dense strands (bright)

const WARP_MIN  = 0.10;   // texture=0 → clean ordered parallel streams
const WARP_MAX  = 2.8;    // texture=1 → heavily fractured chaotic folds

const BIAS_UP   =  0.7;   // heaviness=0 → clear upward float           (airy/happy)
const BIAS_DOWN = -1.8;   // heaviness=1 → strong downward gravity sag   (melancholic)

const ORBIT_MAX  = 1.0;
const JITTER_MAX = 1.0;

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * @param {object} fingerprint — from computeMoodFingerprint()
 * @returns {object} uniform target values to apply to the particle material
 */
export function moodToConfig(fingerprint) {
  const { energy, brightness, texture, heaviness, dynamism, bpm } = fingerprint;

  // BPM normalised over 60–180 range.
  const tempoT = clamp((bpm - 60) / 120, 0, 1);

  const flowSpeed    = lerp(SPEED_MIN, SPEED_MAX, energy) * (1 + tempoT * 0.3);
  const displacement = lerp(DISP_MIN,  DISP_MAX,  energy);
  const noiseScale   = lerp(NOISE_MIN, NOISE_MAX, brightness);
  const domainWarp   = lerp(WARP_MIN,  WARP_MAX,  texture);
  const biasY        = lerp(BIAS_UP, BIAS_DOWN, heaviness);

  // shapeScale: BPM ±30 % variation around the configured base (SHAPE_SCALE).
  // Slow tempo feels intimate (smaller), fast tempo feels expansive (larger).
  const shapeScale = SHAPE_SCALE * lerp(0.7, 1.3, tempoT);

  const peacefulness  = (1 - texture) * (1 - dynamism) * (1 - energy);
  const orbitStrength = peacefulness * ORBIT_MAX;
  const jitter        = Math.sqrt(texture * dynamism) * JITTER_MAX;

  // ── Shape weights ─────────────────────────────────────────────────────────
  // Powers sharpen distribution so dominant moods produce dominant shapes.
  const wSpiral  = Math.pow(brightness, 1.4) * Math.pow(1 - heaviness, 1.2); // happy/bright  → flow
  const wFunnel  = Math.pow(heaviness,  1.6) * Math.pow(1 - energy,    1.0); // melancholic   → shell
  const wBurst   = Math.pow(texture * dynamism, 0.65);                        // anxious       → vortex
  // (1-heaviness) prevents Melancholic (heavy but calm) from also scoring
  // high on blob — it must go to shell instead.
  const wOrbital = Math.pow((1-texture) * (1-dynamism) * (1-energy) * (1-heaviness), 0.50); // peaceful → blob

  const wTotal = wSpiral + wFunnel + wBurst + wOrbital + 1e-6;
  const shapeWeights = [wSpiral / wTotal, wFunnel / wTotal, wBurst / wTotal, wOrbital / wTotal];

  const result = {
    flowSpeed:     +flowSpeed.toFixed(4),
    displacement:  +displacement.toFixed(4),
    noiseScale:    +noiseScale.toFixed(4),
    domainWarp:    +domainWarp.toFixed(4),
    biasY:         +biasY.toFixed(4),
    orbitStrength: +orbitStrength.toFixed(4),
    jitter:        +jitter.toFixed(4),
    shapeWeights:  shapeWeights.map(v => +v.toFixed(3)),
    shapeScale:    +shapeScale.toFixed(3),
  };

  console.log('[mood→config]', JSON.stringify(result));
  return result;
}
