/**
 * audioMoodAnalyze.js
 *
 * Derives a one-shot mood fingerprint from the per-frame arrays produced by
 * analyseBuffer() in audioPrecompute.js.  All features are pure signal
 * processing — no ML model required.
 *
 * Fingerprint shape:
 * {
 *   energy:     0-1   overall loudness / RMS intensity
 *   brightness: 0-1   spectral centroid (dark/warm → bright/airy)
 *   texture:    0-1   spectral spread   (tonal/pure → complex/wide)
 *   heaviness:  0-1   sub-bass+bass dominance
 *   dynamism:   0-1   rate of spectral change across the whole track
 *   bpm:        number  estimated tempo (0 if < 2 beats detected)
 * }
 *
 * Intended mapping to particle config (see moodToConfig.js):
 *   energy     → FLOW_SPEED, FLOW_DISPLACEMENT
 *   brightness → FLOW_NOISE_SCALE  (fine-grained vs sweeping arcs)
 *   texture    → DOMAIN_WARP       (clean streams vs chaotic merging)
 *   heaviness  → STRAND_WIDTH_MAX  (heavy bass = thick ribbons)
 *   dynamism   → STRAND_COUNT      (restless = many strands)
 *   bpm        → FLOW_SPEED        (tempo-sync base speed)
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

const mean  = arr => arr.reduce((s, v) => s + v, 0) / arr.length;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const norm  = (v, lo, hi) => clamp((v - lo) / (hi - lo), 0, 1);

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * @param {object} data - return value of analyseBuffer()
 * @returns {object} mood fingerprint
 */
export function computeMoodFingerprint(data) {
  const {
    subBassArr, bassArr, lowMidArr, midArr,
    highMidArr, presenceArr, brillianceArr,
    centroidArr, spreadArr, rmsArr, zcrArr, fullFluxArr,
    beatTimes,
  } = data;

  // Per-band averages.
  const avgSubBass    = mean(subBassArr);
  const avgBass       = mean(bassArr);
  const avgLowMid     = mean(lowMidArr);
  const avgMid        = mean(midArr);
  const avgHighMid    = mean(highMidArr);
  const avgPresence   = mean(presenceArr);
  const avgBrilliance = mean(brillianceArr);
  const totalBands    = avgSubBass + avgBass + avgLowMid + avgMid
                      + avgHighMid + avgPresence + avgBrilliance;

  // ── Energy ─────────────────────────────────────────────────────────────────
  // Typical windowed-RMS for modern mastered music sits in [0.01, 0.12].
  const energy = norm(mean(rmsArr), 0.005, 0.12);

  // ── Brightness ─────────────────────────────────────────────────────────────
  // Centroid of most music: 500–4 500 Hz.
  // Low centroid = bass-heavy/dark; high = treble-heavy/airy.
  const brightness = norm(mean(centroidArr), 400, 5000);

  // ── Texture ────────────────────────────────────────────────────────────────
  // Spread (std-dev of energy distribution around centroid):
  // narrow spread (< 800 Hz) = tonal/pure, wide (> 3 000 Hz) = complex/noisy.
  // ZCR blended in to catch percussive content that may have a narrow centroid.
  const avgSpread = mean(spreadArr);
  const avgZcr    = mean(zcrArr);
  const texSpread = norm(avgSpread, 500, 3500);
  const texZcr    = norm(avgZcr,    0.02, 0.20);
  const texture   = texSpread * 0.7 + texZcr * 0.3;

  // ── Heaviness ──────────────────────────────────────────────────────────────
  // Share of total band energy carried by sub-bass + bass.
  const heaviness = totalBands > 0
    ? clamp((avgSubBass + avgBass) / totalBands, 0, 1)
    : 0;

  // ── Dynamism ───────────────────────────────────────────────────────────────
  // Full-spectrum spectral flux: how quickly the spectrum changes frame-to-frame.
  // Dense/active music (EDM, metal) scores high; ambient/solo piano scores low.
  const dynamism = norm(mean(fullFluxArr), 0, 0.0015);

  // ── BPM ────────────────────────────────────────────────────────────────────
  // Median inter-beat interval → convert to beats-per-minute.
  let bpm = 0;
  if (beatTimes.length > 1) {
    const intervals = [];
    for (let i = 1; i < beatTimes.length; i++)
      intervals.push(beatTimes[i] - beatTimes[i - 1]);
    intervals.sort((a, b) => a - b);
    const median = intervals[Math.floor(intervals.length / 2)];
    bpm = median > 0 ? 60 / median : 0;
  }

  const fingerprint = {
    energy:     clamp(energy,     0, 1),
    brightness: clamp(brightness, 0, 1),
    texture:    clamp(texture,    0, 1),
    heaviness:  clamp(heaviness,  0, 1),
    dynamism:   clamp(dynamism,   0, 1),
    bpm,
  };

  console.log('[mood] fingerprint:', JSON.stringify(
    Object.fromEntries(
      Object.entries(fingerprint).map(([k, v]) =>
        [k, typeof v === 'number' ? +v.toFixed(3) : v]
      )
    )
  ));

  return fingerprint;
}
