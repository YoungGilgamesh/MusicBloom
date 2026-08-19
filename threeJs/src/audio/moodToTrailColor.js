/**
 * moodToTrailColor.js
 *
 * Pure mapping: 6-param mood fingerprint → trail / mesh / dots base colour in HSL.
 *
 * Hue walks a wide arc. Lime/green is allowed as a brief transit (yellow ↔ turquoise)
 * but is not a resting colour — targets are pushed to the nearest edge.
 *   brightness → magenta / rose (dark) → red → orange / gold (typical) → yellow
 *                 |  turquoise → cyan → deep blue (bright)
 *   heaviness  → light pull away from the gap; also drops lightness
 *   energy + dynamism → modest section walk around the brightness hue
 *
 * Saturation stays pinned vivid. Paint accent tint stays separate (gpuTrails).
 */

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const fract = (v) => v - Math.floor(v);

// Common mixes sit around brightness ~0.30. Steep hue in that band; magenta
// only for clearly darker tracks. Cool jump after the warm peak (yellow).
const WARM_LO = 0.16;  // below: magenta → rose
const WARM_HI = 0.40;  // at/above: turquoise → deep blue

/** Lime / mid-green. Yellow (~0.16) and turquoise (~0.47) sit just outside. */
export const GREEN_HUE_LO = 0.22;
export const GREEN_HUE_HI = 0.42;

/**
 * Resting-colour nudge: if a target sits in lime/green, push it to yellow or turquoise.
 * Displayed colour should still lerp through this band (see greenPassMul).
 */
export function avoidGreenHue(h) {
  const x = fract(h + 1);
  if (x <= GREEN_HUE_LO || x >= GREEN_HUE_HI) return x;
  const mid = (GREEN_HUE_LO + GREEN_HUE_HI) * 0.5;
  return x < mid ? 0.16 : 0.47;
}

/**
 * Ease-rate multiplier while displayed hue is in green. 1 outside the band,
 * up to ~6× at the centre so a yellow↔turquoise drift passes through instead of sitting.
 */
export function greenPassMul(h) {
  const x = fract(h + 1);
  if (x <= GREEN_HUE_LO || x >= GREEN_HUE_HI) return 1;
  const t = (x - GREEN_HUE_LO) / (GREEN_HUE_HI - GREEN_HUE_LO);
  return 1 + 5 * Math.sin(Math.PI * t);
}

/**
 * Brightness 0→1. Dark → magenta; typical (~0.30) → orange/gold; bright → turquoise.
 * The 0.16–0.40 band is steep so a small centroid change changes family.
 */
function hueFromBrightness(brightness) {
  const b = clamp(brightness, 0, 1);
  if (b < WARM_LO) {
    const t = b / WARM_LO;
    return fract(0.86 + t * 0.12); // magenta 0.86 → rose 0.98
  }
  if (b < WARM_HI) {
    const t = (b - WARM_LO) / (WARM_HI - WARM_LO);
    return fract(0.98 + t * 0.17); // rose/red 0.98 → yellow 0.15
  }
  const t = (b - WARM_HI) / (1 - WARM_HI);
  return 0.47 + t * 0.24; // turquoise 0.47 → deep blue 0.71
}

/**
 * @param {object} mood - { energy, brightness, texture, heaviness, dynamism, bpm }
 * @returns {{ h: number, s: number, l: number }} HSL in Three.js ranges (h,s,l ∈ [0,1])
 */
export function moodToTrailColor(mood) {
  const energy     = clamp(mood?.energy     ?? 0.5, 0, 1);
  const brightness = clamp(mood?.brightness ?? 0.5, 0, 1);
  const heaviness  = clamp(mood?.heaviness  ?? 0.5, 0, 1);
  const dynamism   = clamp(mood?.dynamism   ?? 0.5, 0, 1);
  const bpmNorm    = clamp(((mood?.bpm ?? 120) - 40) / 160, 0, 1);

  let hue = hueFromBrightness(brightness);

  // Light pull — don't drag a typical orange start back to magenta.
  if (brightness < WARM_HI) hue = fract(hue - 0.06 * heaviness + 1);
  else hue = fract(hue + 0.06 * heaviness + 1);

  // Modest section walk around the brightness hue (centered so average
  // energy does not shove every start toward cyan).
  const drive = clamp(0.55 * energy + 0.45 * dynamism, 0, 1);
  const section = 0.16 * (drive - 0.5);
  hue = avoidGreenHue(fract(hue + section + 0.06 * (bpmNorm - 0.5) + 1));

  const sat = 1.0;
  const lit = clamp(0.46 + 0.11 * brightness - 0.11 * heaviness, 0.36, 0.60);

  return { h: hue, s: sat, l: lit };
}
