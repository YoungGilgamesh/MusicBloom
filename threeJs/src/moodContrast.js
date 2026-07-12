/**
 * moodContrast.js — push a mood fingerprint toward the extremes.
 *
 * More contrast → more distinct shapes: when one parameter sits near 1 and
 * others near 0, a single field dominates the warp chain (and the superposition
 * curl) so the emergent shape reads clearly instead of averaging into mush.
 *
 * `contrastUnit` is a smooth, symmetric S-curve (logistic gain) pinned at
 * 0→0, 0.5→0.5, 1→1.  amount = 1 is identity; amount > 1 steepens the curve so
 * highs rise toward 1 and lows fall toward 0, monotonically (no clamping flats).
 *
 * Shared by the debug presets and (later) the audio-extraction path so both
 * generate shapes with the same punch.
 */

import { MOOD_CONTRAST } from './config.js';

export function contrastUnit(v, amount = MOOD_CONTRAST) {
  const x = Math.min(1, Math.max(0, v));
  const va = Math.pow(x, amount);
  const wa = Math.pow(1 - x, amount);
  return va / (va + wa + 1e-12);
}

/**
 * Apply contrast to a full mood object.  The five [0,1] features use the curve
 * directly; bpm is normalised to [0,1] (40–200), contrasted, then mapped back.
 * @param {{energy,brightness,texture,heaviness,dynamism,bpm}} mood
 * @param {number} amount  contrast strength (defaults to config MOOD_CONTRAST)
 */
export function contrastMood(mood, amount = MOOD_CONTRAST) {
  const c = (v) => contrastUnit(v, amount);
  const bpmN = (mood.bpm - 40) / 160;
  return {
    energy:     c(mood.energy),
    brightness: c(mood.brightness),
    texture:    c(mood.texture),
    heaviness:  c(mood.heaviness),
    dynamism:   c(mood.dynamism),
    bpm:        40 + c(bpmN) * 160,
  };
}
