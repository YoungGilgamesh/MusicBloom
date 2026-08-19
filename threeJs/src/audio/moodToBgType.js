/**
 * moodToBgType.js — pure mapping: 6-param mood → one of cosmos | clouds | leaks.
 *
 * One-shot at track mood bake (not per-frame). Wash is excluded from select.
 *
 * Visual affinities:
 *   cosmos — darker, heavier, textured / crystalline night
 *   clouds — bright, airy, light atmosphere (needs room vs leaks)
 *   leaks  — soft/dreamy bokeh (low grain + calm dynamism), not just "bright"
 */

const BG_TYPES = /** @type {const} */ (['clouds', 'leaks', 'cosmos']);

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * @param {object} mood
 * @returns {{ cosmos: number, clouds: number, leaks: number }}
 */
export function scoreBgTypes(mood) {
  const E = clamp(mood?.energy ?? 0.5, 0, 1);
  const B = clamp(mood?.brightness ?? 0.5, 0, 1);
  const T = clamp(mood?.texture ?? 0.5, 0, 1);
  const H = clamp(mood?.heaviness ?? 0.5, 0, 1);
  const D = clamp(mood?.dynamism ?? 0.5, 0, 1);
  const bpmNorm = clamp(((mood?.bpm ?? 120) - 40) / 160, 0, 1);

  // Clouds was losing to leaks on bright+soft tracks (both liked B and 1−T).
  // Rebalance: clouds owns bright/airy; leaks owns soft/calm dreaminess.
  return {
    cosmos: clamp(0.35 * (1 - B) + 0.25 * H + 0.25 * T + 0.10 * (1 - D) + 0.05 * (1 - E), 0, 1),
    clouds: clamp(0.45 * B + 0.28 * (1 - H) + 0.12 * (1 - T) + 0.12 * bpmNorm + 0.08 * (1 - E), 0, 1),
    leaks:  clamp(0.28 * B + 0.30 * (1 - T) + 0.22 * (1 - D) + 0.12 * (1 - H) + 0.08 * E, 0, 1),
  };
}

/**
 * @param {object} mood
 * @returns {{ type: 'cosmos'|'clouds'|'leaks', scores: Record<string, number> }}
 */
export function moodToBgType(mood) {
  const scores = scoreBgTypes(mood);
  // Tie-break order: clouds → leaks → cosmos (stable, rare).
  let type = /** @type {'cosmos'|'clouds'|'leaks'} */ ('clouds');
  let best = -1;
  for (const id of BG_TYPES) {
    const s = scores[id];
    if (s > best) {
      best = s;
      type = id;
    }
  }
  return { type, scores };
}
