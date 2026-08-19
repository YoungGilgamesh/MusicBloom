/**
 * moodToSize.js
 *
 * Pure mapping: 6-param mood fingerprint → overall particle-size multiplier.
 *
 * This is the EXPRESSIVE size channel (the shader-side grain/taper is the random +
 * structural part; see shaders.js). The caller (main.js) writes the result to the
 * render material's uSizeMoodScale uniform every frame — a free live knob (just a
 * scalar multiply, no re-sample), so the whole cloud gently swells / shrinks with
 * the mood. currentMood is already EMA-smoothed, so the size eases rather than jumps.
 *
 * Intent:
 *   heaviness → chunkier / bigger grains (heavy, dense music reads coarse)
 *   brightness → finer / smaller grains (bright, airy music reads fine)
 *   neutral mood (0.5 / 0.5) → 1.0 (no change vs the panel's base grain)
 */

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * @param {object} mood - { energy, brightness, texture, heaviness, dynamism, bpm }
 * @returns {number} overall size multiplier (≈ 0.6 … 1.7, 1.0 at neutral)
 */
export function moodToSize(mood) {
  const heaviness  = clamp(mood?.heaviness  ?? 0.5, 0, 1);
  const brightness = clamp(mood?.brightness ?? 0.5, 0, 1);
  return clamp(1.0 + 0.6 * (heaviness - 0.5) - 0.5 * (brightness - 0.5), 0.6, 1.7);
}
