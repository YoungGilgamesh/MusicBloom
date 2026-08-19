/**
 * moodToPaintColor.js — paint-ink palette from the live main colour + a fixed hue offset.
 *
 * Ink drifts with music because it rides the displayed trail colour, but the goal stays
 * a clear wheel step away so stains never collapse into the main ribbon family
 * (TRAIL_HUE_JITTER is wide — paint shift must sit outside that band).
 */

import { moodToTrailColor } from './moodToTrailColor.js';
import {
  BLOOM_PAINT_HUE_SHIFT,
  BLOOM_PAINT_SAT,
  BLOOM_PAINT_LIT,
} from '../config.js';

const fract = (v) => v - Math.floor(v);

/**
 * Paint HSL from the current main/trail colour (preferred — always visibly offset).
 * @param {{ h: number, s?: number, l?: number } | null} mainHsl
 */
export function paintColorFromMain(mainHsl) {
  const h0 = mainHsl?.h ?? 0;
  return {
    h: fract(h0 + BLOOM_PAINT_HUE_SHIFT + 1),
    s: BLOOM_PAINT_SAT,
    l: BLOOM_PAINT_LIT,
  };
}

/**
 * Fallback from mood alone (before trail motion exists).
 * @param {object} mood
 */
export function moodToPaintColor(mood) {
  return paintColorFromMain(moodToTrailColor(mood));
}
