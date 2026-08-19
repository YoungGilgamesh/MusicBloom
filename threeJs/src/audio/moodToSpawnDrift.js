/**
 * moodToSpawnDrift.js
 *
 * Pure mapping: 6-param mood → normalised spawn-drift amount [0, 1].
 *
 * Caller lerps into [TRAIL_SPAWN_DRIFT_MIN, TRAIL_SPAWN_DRIFT_MAX] and writes
 * uSpawnDrift each frame. Intense / restless music → births slide farther
 * downstream; calm → stay near the seed.
 *
 *   energy    → primary (loud/intense → more drift)
 *   dynamism  → restlessness adds travel
 *   heaviness → slight damp (heavy/sludgy stays planted)
 */

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * @param {object} mood - { energy, brightness, texture, heaviness, dynamism, bpm }
 * @returns {number} normalised drift in [0, 1]
 */
export function moodToSpawnDrift(mood) {
  const energy    = clamp(mood?.energy    ?? 0.5, 0, 1);
  const dynamism  = clamp(mood?.dynamism  ?? 0.5, 0, 1);
  const heaviness = clamp(mood?.heaviness ?? 0.5, 0, 1);

  const drive = 0.62 * energy + 0.38 * dynamism;
  const damp  = 0.18 * heaviness;
  return clamp(drive - damp, 0, 1);
}
