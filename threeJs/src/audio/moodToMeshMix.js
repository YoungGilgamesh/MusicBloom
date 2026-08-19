/**
 * moodToMeshMix.js — pure mapping: 6-param mood → 1 major + 2 accents + counts.
 *
 * One-shot at track mood bake (not per-frame). Counts are cost-weighted from
 * MESH_BUDGET so heavy types (flower/pedal/marble) use fewer instances.
 */

import { MESH_TYPES, MESH_BUDGET } from '../config.js';

const TYPE_IDS = Object.keys(MESH_TYPES);

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * @param {object} mood
 * @returns {Record<string, number>}
 */
export function scoreMeshTypes(mood) {
  const E = clamp(mood?.energy ?? 0.5, 0, 1);
  const B = clamp(mood?.brightness ?? 0.5, 0, 1);
  const T = clamp(mood?.texture ?? 0.5, 0, 1);
  const H = clamp(mood?.heaviness ?? 0.5, 0, 1);
  const D = clamp(mood?.dynamism ?? 0.5, 0, 1);
  const bpmNorm = clamp(((mood?.bpm ?? 120) - 40) / 160, 0, 1);

  // Rock was winning most library tracks: mid/high H+T is common after contrastMood,
  // and rock is cheap (cost 1.3) so it also *looks* dominant. Soften rock; give
  // flower/marble clearer bright/calm ownership.
  return {
    triangle: clamp(0.35 * E + 0.30 * D + 0.25 * T - 0.20 * H, 0, 1),
    flower:   clamp(0.48 * B + 0.28 * (1 - H) + 0.14 * (1 - E) + 0.12 * bpmNorm, 0, 1),
    pedal:    clamp(0.30 * B + 0.25 * T + 0.20 * (1 - H) + 0.15 * D, 0, 1),
    rock:     clamp(0.32 * H + 0.20 * T + 0.18 * (1 - B) + 0.10 * (1 - D) + 0.08 * (1 - E), 0, 1),
    marble:   clamp(0.40 * B + 0.28 * (1 - D) + 0.18 * (1 - E) + 0.18 * (1 - H), 0, 1),
  };
}

/**
 * @param {object} mood
 * @param {{ budget?: number }} [opts]
 * @returns {{
 *   major: string,
 *   accents: [string, string],
 *   types: [string, string, string],
 *   ratios: Record<string, number>,
 *   counts: Record<string, number>,
 *   totalCount: number,
 *   scores: Record<string, number>,
 *   budget: number,
 * }}
 */
export function moodToMeshMix(mood, opts = {}) {
  const budget = Math.max(100, opts.budget ?? MESH_BUDGET);
  const scores = scoreMeshTypes(mood);

  const ranked = TYPE_IDS
    .map((id) => ({ id, s: scores[id] }))
    .sort((a, b) => b.s - a.s);

  const top = ranked.slice(0, 3);
  // Guarantee three distinct types even if scores tie / zero.
  while (top.length < 3) {
    const next = ranked.find((r) => !top.some((t) => t.id === r.id));
    if (!next) break;
    top.push({ id: next.id, s: Math.max(next.s, 0.05) });
  }
  // Soft floor so accents never get zero weight.
  const raw = top.map((t) => Math.max(t.s, 0.08));
  const sumRaw = raw.reduce((a, b) => a + b, 0) || 1;
  const w = raw.map((v) => v / sumRaw);

  // Major bias: 55–70%, accents share the rest (accent B ≥ 10% of total).
  let majorR = clamp(0.55 + 0.15 * w[0], 0.55, 0.70);
  let rest = 1 - majorR;
  const aSum = w[1] + w[2] || 1;
  let accentAR = rest * (w[1] / aSum);
  let accentBR = rest * (w[2] / aSum);
  if (accentBR < 0.10) {
    const need = 0.10 - accentBR;
    accentBR = 0.10;
    accentAR = Math.max(0.08, accentAR - need * 0.5);
    majorR = 1 - accentAR - accentBR;
  }

  const types = /** @type {[string, string, string]} */ ([top[0].id, top[1].id, top[2].id]);
  const ratios = {
    [types[0]]: majorR,
    [types[1]]: accentAR,
    [types[2]]: accentBR,
  };

  const counts = {};
  let totalCount = 0;
  for (const id of types) {
    const cost = MESH_TYPES[id]?.cost ?? 1;
    const n = Math.max(1, Math.floor((budget * ratios[id]) / cost));
    counts[id] = n;
    totalCount += n;
  }

  return {
    major: types[0],
    accents: [types[1], types[2]],
    types,
    ratios,
    counts,
    totalCount,
    scores,
    budget,
  };
}
