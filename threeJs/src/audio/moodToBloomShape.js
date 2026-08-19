/**
 * moodToBloomShape.js  (Pick-paint Phase 3, Step 1)
 *
 * Pure mapping: 6-param mood fingerprint → per-bloom shape descriptor.
 *
 * This is deliberately STANDALONE and side-effect free. Nothing calls it yet —
 * Step 3 will wire it into BloomField.add() so every click snapshots the shape
 * of the current mood. Because a bloom is analytic and reads its shape only once
 * (at click), driving this from a live/time-varying mood costs nothing extra on
 * the GPU (no velocity re-bake).
 *
 * Input mood (see computeMoodFingerprint):
 *   energy      0-1   overall intensity / loudness
 *   brightness  0-1   dark/warm → bright/airy (spectral centroid)
 *   texture     0-1   tonal/pure → complex/noisy (spectral spread)
 *   heaviness   0-1   sub-bass + bass dominance
 *   dynamism    0-1   rate of spectral change (calm → restless)
 *   bpm         number tempo (0 if unknown)
 *
 * Output shape descriptor (matches the per-bloom fields Step 2 will snapshot,
 * and the uPaint* uniform semantics in config.js / paintField.glsl.js):
 *   archA         int   dominant archetype index  (0..4)
 *   archB         int   blend-partner archetype index (0..4)
 *   blendAB       0-0.5 partner weight (0 = pure dominant .. 0.5 = equal mix)
 *   outward       1.1-2.2 burst radial (outward) pop strength    → uPaintOutward
 *   shapeAmt      0.8-1.3 shape redirect weight (strong/persist) → uPaintCurl
 *   fieldFreq     1.8-4.0 field scale in world space (finer)     → uPaintCurlFreq
 *   detail        0.55-1.0 sharpness (smooth folds → jagged)     → uPaintDetail
 *   shell         0.0-0.6 burst radial profile                   → uPaintShell
 *   radiusScale   0.8-1.7 size multiplier on BLOOM_RADIUS        (mood → size)
 *   strengthScale 0.8-2.0 force multiplier on BLOOM_STRENGTH     (mood → force)
 *
 * radiusScale/strengthScale are the main "weak when calm / strong at climax"
 * levers: both ride an overall `intensity` (loudness + tempo + a little bass).
 * They multiply the config bases so config.js stays the anchor; bloomField.add
 * applies them at click time.
 *
 * Archetype index legend:
 *   0 CURL · 1 VORTEX · 2 LIGHTNING · 3 SMOKE RING · 4 CELLS
 *
 * Mood → archetype intent
 * ──────────────────────────────────────────────────────────────────────────
 *   CURL       organic tangle      calm + complex (mid energy, some texture)
 *   VORTEX     coherent whirlpool  energetic + tonal (low texture)
 *   LIGHTNING  jagged bolts        restless + heavy (high dynamism/heaviness)
 *   SMOKE RING smooth toroid       bright + airy + calm (low heaviness/texture)
 *   CELLS      foamy clusters      complex/textured, brighter
 */

export const ARCH = {
  CURL: 0,
  VORTEX: 1,
  LIGHTNING: 2,
  SMOKE_RING: 3,
  CELLS: 4,
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp  = (a, b, t) => a + (b - a) * clamp(t, 0, 1);

/**
 * @param {object} mood - { energy, brightness, texture, heaviness, dynamism, bpm }
 * @returns {object} bloom shape descriptor (see file header)
 */
export function moodToBloomShape(mood) {
  const energy     = clamp(mood?.energy     ?? 0.5, 0, 1);
  const brightness = clamp(mood?.brightness ?? 0.5, 0, 1);
  const texture    = clamp(mood?.texture    ?? 0.5, 0, 1);
  const heaviness  = clamp(mood?.heaviness  ?? 0.5, 0, 1);
  const dynamism   = clamp(mood?.dynamism   ?? 0.5, 0, 1);
  const bpm        = mood?.bpm ?? 0;
  const tempoT     = clamp((bpm - 60) / 120, 0, 1); // 60→0, 180→1

  // ── Archetype scores ───────────────────────────────────────────────────────
  // Each archetype gets a 0..~1 affinity from the mood. Highest two become the
  // dominant + partner; their ratio sets the blend. A small baseline on CURL
  // keeps it as a graceful fallback so blends never collapse to nothing.
  const scores = [];
  scores[ARCH.CURL]       = 0.30 + 0.55 * texture * (1 - dynamism);              // organic, calm-complex
  scores[ARCH.VORTEX]     = energy * (1 - texture) + 0.25 * (1 - dynamism);      // coherent spin
  scores[ARCH.LIGHTNING]  = dynamism * (0.55 + 0.45 * heaviness) + 0.35 * energy * heaviness; // jagged, intense
  scores[ARCH.SMOKE_RING] = brightness * (1 - heaviness) * (1 - texture) + 0.20 * (1 - energy); // airy, smooth
  scores[ARCH.CELLS]      = texture * (0.55 + 0.45 * brightness);               // foamy, complex

  // Rank: find the top two archetypes.
  let iA = 0, iB = 1;
  for (let i = 1; i < scores.length; i++) if (scores[i] > scores[iA]) iA = i;
  for (let i = 0; i < scores.length; i++) {
    if (i === iA) continue;
    if (iB === iA || scores[i] > scores[iB]) iB = i;
  }

  // Blend from the score ratio: closer scores → stronger mix, capped at 0.5.
  const sA = Math.max(scores[iA], 1e-4);
  const sB = Math.max(scores[iB], 0);
  const blendAB = clamp(0.5 * (sB / sA), 0.1, 0.5);

  // ── Size + force ────────────────────────────────────────────────────────────
  // One overall "intensity" (loudness + tempo + a little bass) drives how BIG and
  // how HARD the bloom is. This is the main calm↔climax lever the user tunes: at
  // low intensity blooms are small + soft, at high intensity large + punchy.
  const intensity     = clamp(0.65 * energy + 0.20 * tempoT + 0.15 * heaviness, 0, 1);
  const radiusScale   = lerp(0.8, 1.7, intensity);
  const strengthScale = lerp(0.8, 2.0, intensity);

  // ── Modulators (continuous, independent of archetype selection) ─────────────
  // Floors raised so even calm/slow music still pops and shows its click shape
  // clearly; the intense end stays high for distinct calm↔climax character.
  const outward   = lerp(1.1, 2.2, energy);                          // radial (outward) pop strength — raised so the firework kick reads strong even with the boosted shaped term
  const shapeAmt  = lerp(0.8, 1.3, 0.5 * texture + 0.5 * dynamism);  // busier → more fully shaped; floor+ceiling raised → STRONGER, more permanent persistent redirect
  const fieldFreq = lerp(1.8, 4.0, 0.6 * texture + 0.4 * brightness); // complex/bright → finer field; range raised so shape DETAIL reads instead of one big blob
  const detail    = lerp(0.55, 1.0, dynamism);                       // restless → jagged / sharp; floor raised so folds stay crisp
  const shell     = lerp(0.0, 0.6, heaviness);                       // heavy → mid-radius shell

  return {
    archA: iA,
    archB: iB,
    blendAB: +blendAB.toFixed(3),
    outward: +outward.toFixed(3),
    shapeAmt: +shapeAmt.toFixed(3),
    fieldFreq: +fieldFreq.toFixed(3),
    detail: +detail.toFixed(3),
    shell: +shell.toFixed(3),
    radiusScale: +radiusScale.toFixed(3),
    strengthScale: +strengthScale.toFixed(3),
  };
}
