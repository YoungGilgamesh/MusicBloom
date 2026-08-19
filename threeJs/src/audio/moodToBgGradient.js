/**
 * moodToBgGradient.js
 *
 * Pure mapping: mood fingerprint → vertical sky wash (top / bottom HSL) related to
 * trail colour via a continuous similar↔contrast axis.
 *
 * Hue stays in the trail family (small analog offset). Energy/dynamism
 * already walk the trail hue; the sky should not run to complement alone.
 *
 * Structure is fixed: bottom darker, top brighter (flythrough direction cue).
 * Saturation stays below trails so the BG reads as atmosphere, not ribbons.
 */

import { moodToTrailColor, avoidGreenHue } from './moodToTrailColor.js';
import {
  BG_HUE_ANALOG,
  BG_HUE_COMPLEMENT,
  BG_SAT_SCALE,
  BG_REL_ENERGY,
  BG_REL_DYNAMISM,
} from '../config.js';

export { avoidGreenHue };

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp  = (a, b, t) => a + (b - a) * t;
const wrap01 = (h) => ((h % 1) + 1) % 1;

/**
 * @param {object} mood - { energy, brightness, texture, heaviness, dynamism, bpm }
 * @param {{ contrastScale?: number, trailHsl?: {h:number,s:number,l:number} }} [opts]
 * @returns {{ top: {h,s,l}, bottom: {h,s,l}, relation: number }}
 */
export function moodToBgGradient(mood, opts = {}) {
  const energy     = clamp(mood?.energy     ?? 0.5, 0, 1);
  const brightness = clamp(mood?.brightness ?? 0.5, 0, 1);
  const heaviness  = clamp(mood?.heaviness  ?? 0.5, 0, 1);
  const dynamism   = clamp(mood?.dynamism   ?? 0.5, 0, 1);
  const contrastScale = clamp(opts.contrastScale ?? 1, 0, 2);

  const trail = opts.trailHsl ?? moodToTrailColor(mood);

  let r = clamp(BG_REL_ENERGY * energy + BG_REL_DYNAMISM * dynamism, 0, 1);
  r = clamp(r * contrastScale, 0, 1);

  // Follow the trail hue. A small analog offset only — complement (0.50) was
  // walking the sky magenta→cyan while ribbons stayed put.
  const dH = opts.trailHsl ? BG_HUE_ANALOG : lerp(BG_HUE_ANALOG, BG_HUE_COMPLEMENT, r);
  const h   = avoidGreenHue(wrap01(trail.h + dH));
  const sat = clamp(trail.s * lerp(0.70, 0.95, r) * BG_SAT_SCALE, 0.25, 0.98);

  // Bottom always darker than top (direction cue); keep wash deep so particles pop.
  let lBottom = lerp(0.006, 0.018, brightness) * (1 - 0.50 * heaviness);
  let lTop    = lerp(0.022, 0.055, brightness) * (1 - 0.36 * heaviness);
  lBottom = clamp(lBottom, 0.005, 0.024);
  lTop    = clamp(lTop, lBottom + 0.016, 0.07);

  return {
    top:    { h, s: sat, l: lTop },
    bottom: { h, s: sat, l: lBottom },
    relation: r,
  };
}
