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
 * Consumers of this fingerprint:
 *   • fields/combine.js   — the 6 params shape the base cloud (dominance-weighted
 *                           warp + curl superposition + particle budget).
 *   • moodToBloomShape.js — maps the params to click-bloom archetype + modulators.
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const norm  = (v, lo, hi) => clamp((v - lo) / (hi - lo), 0, 1);

// Mean of a typed array over the half-open frame range [s, e).
function rangeMean(arr, s, e) {
  if (e <= s) return 0;
  let sum = 0;
  for (let i = s; i < e; i++) sum += arr[i];
  return sum / (e - s);
}

// Estimate BPM from the beat timestamps that fall inside [t0, t1] seconds.
// Falls back to `fallbackBpm` when there aren't enough local beats to be stable.
function bpmFromBeats(beatTimes, t0, t1, fallbackBpm = 0) {
  const intervals = [];
  let prev = null;
  for (let i = 0; i < beatTimes.length; i++) {
    const t = beatTimes[i];
    if (t < t0 || t > t1) continue;
    if (prev !== null) intervals.push(t - prev);
    prev = t;
  }
  if (intervals.length < 2) return fallbackBpm;
  intervals.sort((a, b) => a - b);
  const median = intervals[Math.floor(intervals.length / 2)];
  return median > 0 ? 60 / median : fallbackBpm;
}

/**
 * Shared core: build a 6-param fingerprint from the per-frame arrays over the
 * half-open frame range [s, e). Used by both the whole-track fingerprint and the
 * live windowed mood — identical feature definitions, only the range differs.
 * @param {object} data - analyseBuffer() output
 * @param {number} s - start frame (inclusive)
 * @param {number} e - end frame (exclusive)
 * @param {number} bpm - tempo to attach (computed by the caller)
 */
function fingerprintFromRange(data, s, e, bpm) {
  const {
    subBassArr, bassArr, lowMidArr, midArr,
    highMidArr, presenceArr, brillianceArr,
    centroidArr, spreadArr, rmsArr, zcrArr, fullFluxArr,
  } = data;

  // Per-band averages over the range.
  const avgSubBass    = rangeMean(subBassArr,    s, e);
  const avgBass       = rangeMean(bassArr,       s, e);
  const avgLowMid     = rangeMean(lowMidArr,     s, e);
  const avgMid        = rangeMean(midArr,        s, e);
  const avgHighMid    = rangeMean(highMidArr,    s, e);
  const avgPresence   = rangeMean(presenceArr,   s, e);
  const avgBrilliance = rangeMean(brillianceArr, s, e);
  const totalBands    = avgSubBass + avgBass + avgLowMid + avgMid
                      + avgHighMid + avgPresence + avgBrilliance;

  // Energy — typical windowed-RMS for mastered music sits in [0.01, 0.12].
  const energy = norm(rangeMean(rmsArr, s, e), 0.005, 0.12);

  // Brightness — spectral centroid; low = dark/bass-heavy, high = airy/treble.
  const brightness = norm(rangeMean(centroidArr, s, e), 400, 5000);

  // Texture — spectral spread (tonal → complex) blended with ZCR (percussive).
  const texSpread = norm(rangeMean(spreadArr, s, e), 500, 3500);
  const texZcr    = norm(rangeMean(zcrArr,    s, e), 0.02, 0.20);
  const texture   = texSpread * 0.7 + texZcr * 0.3;

  // Heaviness — share of band energy in sub-bass + bass.
  const heaviness = totalBands > 0
    ? clamp((avgSubBass + avgBass) / totalBands, 0, 1)
    : 0;

  // Dynamism — full-spectrum flux (how fast the spectrum changes).
  const dynamism = norm(rangeMean(fullFluxArr, s, e), 0, 0.0015);

  return {
    energy:     clamp(energy,     0, 1),
    brightness: clamp(brightness, 0, 1),
    texture:    clamp(texture,    0, 1),
    heaviness:  clamp(heaviness,  0, 1),
    dynamism:   clamp(dynamism,   0, 1),
    bpm,
  };
}

// ── Main exports ────────────────────────────────────────────────────────────

/**
 * Whole-track mood fingerprint (one-shot, static). Drives the base cloud shape.
 * @param {object} data - return value of analyseBuffer()
 * @returns {object} mood fingerprint
 */
export function computeMoodFingerprint(data) {
  const { beatTimes, numFrames } = data;

  // BPM — median inter-beat interval across the whole track.
  const bpm = bpmFromBeats(beatTimes, -Infinity, Infinity, 0);

  const fingerprint = fingerprintFromRange(data, 0, numFrames, bpm);

  return fingerprint;
}

/**
 * Live windowed mood (Step 4). Derives a fingerprint from the ~`windowSec` of
 * audio ending at `timeSec` — the "mood of the moment". Cheap (a few array
 * averages); read each frame during playback so click-blooms track the music.
 *
 * Tempo comes from beats within a wider window (a short window rarely has enough
 * beats), falling back to the track BPM.
 *
 * @param {object} data - analyseBuffer() output (per-frame arrays retained)
 * @param {number} timeSec - current playhead time (loop-relative), seconds
 * @param {number} windowSec - rolling window length, seconds
 * @param {number} trackBpm - whole-track BPM fallback
 * @returns {object} mood fingerprint
 */
export function computeWindowedMood(data, timeSec, windowSec, trackBpm = 0) {
  const { fps, numFrames, beatTimes } = data;

  const eFrame = clamp(Math.floor(timeSec * fps) + 1, 1, numFrames);
  const sFrame = clamp(eFrame - Math.max(1, Math.round(windowSec * fps)), 0, eFrame - 1);

  // Local tempo from a wider window (±2× the mood window) so a 3 s slice with
  // one or two beats doesn't produce a jumpy BPM; fall back to the track tempo.
  const wideHalf = windowSec * 2;
  const bpm = bpmFromBeats(beatTimes, timeSec - wideHalf, timeSec + wideHalf, trackBpm);

  return fingerprintFromRange(data, sFrame, eFrame, bpm);
}
