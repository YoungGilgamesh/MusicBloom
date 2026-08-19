/**
 * moodToFlowSpeed.js
 *
 * Pure mapping: 6-param mood fingerprint → normalised flow speed [0, 1].
 *
 * The caller (main.js) lerps this into [FLOW_SPEED_MIN, FLOW_SPEED_MAX] and writes
 * it to the sim's uFlowSpeed uniform every frame. Because uFlowSpeed only scales
 * the (already-baked, peak-normalised) velocity volume, this is a free live knob —
 * no velocity re-bake — so it can track the moment-to-moment mood.
 *
 * Intent (matches moodToBloomShape's tempoT convention: 60bpm→0, 180bpm→1):
 *   energy    → primary driver (loud/intense music flows faster)
 *   bpm/tempo → tempo IS speed (fast track → fast flow)
 *   dynamism  → restlessness adds a little urgency
 *   heaviness → DAMPS speed (heavy/sludgy reads slower, not faster)
 *
 * At all-mid mood this lands ~0.375 (≈ the old static SIM_FLOW_SPEED feel); calm +
 * heavy floors to 0, energetic + fast + light saturates near 1 — the full range.
 */

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * @param {object} mood - { energy, brightness, texture, heaviness, dynamism, bpm }
 * @returns {number} normalised speed in [0, 1]
 */
export function moodToFlowSpeed(mood) {
  const energy    = clamp(mood?.energy    ?? 0.5, 0, 1);
  const heaviness = clamp(mood?.heaviness ?? 0.5, 0, 1);
  const dynamism  = clamp(mood?.dynamism  ?? 0.5, 0, 1);
  const bpm       = mood?.bpm ?? 0;
  const tempoT    = clamp((bpm - 60) / 120, 0, 1); // 60→0, 180→1

  // Energy (intensity) is the main baseline driver; tempo/dynamism add urgency; heaviness damps.
  const drive = 0.65 * energy + 0.22 * tempoT + 0.13 * dynamism;
  const damp  = 0.25 * heaviness;

  return clamp(drive - damp, 0, 1);
}
