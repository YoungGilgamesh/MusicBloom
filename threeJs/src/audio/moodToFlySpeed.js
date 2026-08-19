/**
 * moodToFlySpeed.js
 *
 * Pure mapping: 6-param mood → normalised camera fly scale [0, 1].
 *
 * Tempo-led (unlike moodToFlowSpeed, which is energy-led for particle advection):
 *   bpm/tempo → primary (fast track → fast flight, slow → crawl)
 *   energy    → secondary push on intense sections
 *   dynamism  → small restlessness bump
 *   heaviness → slight damp
 *
 * Caller lerps into [FLY_SPEED_SCALE_MIN, FLY_SPEED_SCALE_MAX].
 */

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * @param {object} mood - { energy, brightness, texture, heaviness, dynamism, bpm }
 * @returns {number} normalised fly drive in [0, 1]
 */
export function moodToFlySpeed(mood) {
  const energy    = clamp(mood?.energy    ?? 0.5, 0, 1);
  const dynamism  = clamp(mood?.dynamism  ?? 0.5, 0, 1);
  const heaviness = clamp(mood?.heaviness ?? 0.5, 0, 1);
  const bpm       = mood?.bpm ?? 0;
  // 50bpm → 0, 180bpm → 1 (wider floor so ballads sit clearly slow)
  const tempoT    = clamp((bpm - 50) / 130, 0, 1);

  const drive = 0.72 * tempoT + 0.18 * energy + 0.10 * dynamism;
  const damp  = 0.12 * heaviness;
  return clamp(drive - damp, 0, 1);
}
