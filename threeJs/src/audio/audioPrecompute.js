/**
 * audioPrecompute.js
 *
 * Reconstructed from aijinglemaker.com/free-audio-analyzer source code.
 *
 * The website's analysis logic (deobfuscated & adapted for per-frame use):
 *  — 7 standard frequency bands with perceptual weighting
 *  — Hann window applied before each FFT frame
 *  — Bass/sub-bass boosted 2×, low-mid 1.5×, brilliance 0.7× (perceptual)
 *
 * Our additions for particle animation:
 *  — Per-frame analysis (not one-shot static) using Cooley-Tukey FFT
 *  — Temporal smoothing on dB-scaled mags → smooth band values for visuals
 *  — One-sided spectral flux on LINEAR mags → sharp beat onset detection
 *  — Local peak-pick on flux array → clean beat timestamps
 */

import {
  BAND_SUB_BASS, BAND_BASS, BAND_LOW_MID, BAND_MID,
  BAND_HIGH_MID, BAND_PRESENCE, BAND_BRILLIANCE,
  BEAT_FLUX_THRESHOLD, BEAT_MIN_FLUX, BEAT_COOLDOWN_MS, BEAT_PEAK_WINDOW,
} from '../config.js';
import { computeMoodFingerprint } from './audioMoodAnalyze.js';

// ── Analysis constants ────────────────────────────────────────────────────────

const FFT_SIZE = 2048;   // window size → 23.4 Hz/bin at 48 kHz
const HOP_SIZE = 512;    // hop → ~93.75 frames/sec at 48 kHz
const HALF     = FFT_SIZE >>> 1;

// dB range for visual band mapping (same philosophy as the website's linear-to-display conversion)
const DB_MIN   = -90;    // floor (silence)
const DB_MAX   = -20;    // ceiling (loud music)
const DB_RANGE = DB_MAX - DB_MIN;

// Temporal smoothing — mirrors Web Audio API AnalyserNode.smoothingTimeConstant = 0.8
const SMOOTH   = 0.8;

// ── Pre-computed tables ───────────────────────────────────────────────────────

const _hann = Float32Array.from({ length: FFT_SIZE },
  (_, i) => 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1))));

const _bitrev = new Uint32Array(FFT_SIZE);
{
  let j = 0;
  for (let i = 1; i < FFT_SIZE; i++) {
    let b = FFT_SIZE >> 1;
    for (; j & b; b >>= 1) j ^= b;
    j ^= b;
    _bitrev[i] = j;
  }
}

const _twRe = new Float32Array(HALF);
const _twIm = new Float32Array(HALF);
for (let k = 0; k < HALF; k++) {
  const angle = (-2 * Math.PI * k) / FFT_SIZE;
  _twRe[k] = Math.cos(angle);
  _twIm[k] = Math.sin(angle);
}

// ── Cooley-Tukey FFT (radix-2, in-place) ─────────────────────────────────────

function fft(re, im) {
  for (let i = 0; i < FFT_SIZE; i++) {
    const j = _bitrev[i];
    if (i < j) {
      let t;
      t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= FFT_SIZE; len <<= 1) {
    const half = len >>> 1, step = FFT_SIZE / len;
    for (let k = 0; k < FFT_SIZE; k += len) {
      for (let j = 0; j < half; j++) {
        const ti = j * step;
        const tR = _twRe[ti], tI = _twIm[ti];
        const p = k + j, q = p + half;
        const vR = re[q] * tR - im[q] * tI;
        const vI = re[q] * tI + im[q] * tR;
        re[q] = re[p] - vR;  im[q] = im[p] - vI;
        re[p] += vR;         im[p] += vI;
      }
    }
  }
}

// ── Perceptual weighting (from aijinglemaker.com source, deobfuscated) ────────
// Sub-bass and kick drum range (< 200 Hz) → 2× amplified so beats register clearly.
// Low-mid warmth (< 500 Hz) → 1.5×.
// High-frequency air (> 8000 Hz) → 0.7× de-emphasised.
function percWeight(hz) {
  if (hz < 200)  return 2.0;
  if (hz < 500)  return 1.5;
  if (hz > 8000) return 0.7;
  return 1.0;
}

// ── Band helpers ─────────────────────────────────────────────────────────────

/**
 * Weighted average of dB-scaled, time-smoothed magnitudes → [0, 1].
 * Used for smooth visual/particle-driving band values.
 */
function bandAvgDB(dbMags, loHz, hiHz, binHz) {
  const s = Math.max(0,        Math.round(loHz / binHz));
  const e = Math.min(HALF - 1, Math.round(hiHz / binHz));
  if (s > e) return 0;
  let sum = 0, wTotal = 0;
  for (let i = s; i <= e; i++) {
    const w = percWeight(i * binHz);
    sum    += dbMags[i] * w;
    wTotal += w;
  }
  return wTotal > 0 ? sum / wTotal : 0;
}

/**
 * One-sided spectral flux on RAW linear magnitudes → sharp onset detection.
 * Only accumulates positive differences (energy arriving, not leaving).
 * Perceptual weighting applied so kick drums spike strongly.
 */
function bandFluxLinear(linMags, prevLinMags, loHz, hiHz, binHz) {
  const s = Math.max(0,        Math.round(loHz / binHz));
  const e = Math.min(HALF - 1, Math.round(hiHz / binHz));
  if (s > e) return 0;
  let sum = 0;
  for (let i = s; i <= e; i++) {
    const diff = linMags[i] - prevLinMags[i];
    if (diff > 0) sum += diff * percWeight(i * binHz);
  }
  return sum / (e - s + 1);
}

// ── Offline analysis ──────────────────────────────────────────────────────────

function analyseBuffer(audioBuffer) {
  const len        = audioBuffer.length;
  const nCh        = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const binHz      = sampleRate / FFT_SIZE;

  // Mix to mono (same as website — treats stereo symmetrically).
  const mono = new Float32Array(len);
  for (let c = 0; c < nCh; c++) {
    const ch = audioBuffer.getChannelData(c);
    for (let i = 0; i < len; i++) mono[i] += ch[i] / nCh;
  }

  const numFrames = Math.max(1, Math.floor((len - FFT_SIZE) / HOP_SIZE) + 1);
  const fps       = sampleRate / HOP_SIZE;

  // Output arrays — one entry per analysis frame for all 7 bands + flux.
  const subBassArr    = new Float32Array(numFrames);
  const bassArr       = new Float32Array(numFrames);
  const lowMidArr     = new Float32Array(numFrames);
  const midArr        = new Float32Array(numFrames);
  const highMidArr    = new Float32Array(numFrames);
  const presenceArr   = new Float32Array(numFrames);
  const brillianceArr = new Float32Array(numFrames);
  const bassFluxArr   = new Float32Array(numFrames);
  // Mood feature arrays (computed in the same loop, nearly free).
  const centroidArr   = new Float32Array(numFrames); // spectral centroid (Hz)
  const spreadArr     = new Float32Array(numFrames); // spectral spread   (Hz)
  const rmsArr        = new Float32Array(numFrames); // windowed RMS amplitude
  const zcrArr        = new Float32Array(numFrames); // zero-crossing rate [0-1]
  const fullFluxArr   = new Float32Array(numFrames); // full-spectrum flux

  // Working buffers.
  const re           = new Float32Array(FFT_SIZE);
  const im           = new Float32Array(FFT_SIZE);
  const linMags      = new Float32Array(HALF);   // current raw linear magnitudes
  const prevLinMags  = new Float32Array(HALF);   // previous frame (for flux)
  const dbMags       = new Float32Array(HALF);   // temporally-smoothed dB magnitudes
  const prevDbMags   = new Float32Array(HALF);   // previous frame (for smoothing)

  for (let frame = 0; frame < numFrames; frame++) {
    // --- Apply Hann window and run FFT (same as website) ---
    const offset = frame * HOP_SIZE;
    for (let i = 0; i < FFT_SIZE; i++) {
      const si = offset + i;
      re[i] = si < len ? mono[si] * _hann[i] : 0;
      im[i] = 0;
    }

    // --- RMS + ZCR from windowed samples (before FFT overwrites re[]) ---
    {
      let rmsSum = 0, zcr = 0;
      for (let i = 0; i < FFT_SIZE; i++) {
        rmsSum += re[i] * re[i];
        if (i > 0 && (re[i - 1] >= 0) !== (re[i] >= 0)) zcr++;
      }
      rmsArr[frame] = Math.sqrt(rmsSum / FFT_SIZE);
      zcrArr[frame] = zcr / FFT_SIZE;
    }

    fft(re, im);

    // --- Linear magnitudes (normalised by FFT size, matching website) ---
    for (let i = 0; i < HALF; i++) {
      linMags[i] = Math.hypot(re[i], im[i]) / FFT_SIZE;
    }

    // --- Spectral centroid + spread + full-band flux (mood features) ---
    {
      let centHz = 0, totalMag = 0, fullFlux = 0;
      for (let i = 1; i < HALF; i++) {
        const hz = i * binHz;
        centHz   += linMags[i] * hz;
        totalMag += linMags[i];
        const diff = linMags[i] - prevLinMags[i];
        if (diff > 0) fullFlux += diff;
      }
      centHz = totalMag > 0 ? centHz / totalMag : 0;
      centroidArr[frame] = centHz;

      let spread = 0;
      for (let i = 1; i < HALF; i++) {
        const d = i * binHz - centHz;
        spread += linMags[i] * d * d;
      }
      spreadArr[frame]  = totalMag > 0 ? Math.sqrt(spread / totalMag) : 0;
      fullFluxArr[frame] = fullFlux / HALF;
    }

    // --- dB-scaled magnitudes with temporal smoothing (for visual bands) ---
    for (let i = 0; i < HALF; i++) {
      const db     = linMags[i] > 0 ? 20 * Math.log10(linMags[i]) : DB_MIN;
      const scaled = Math.max(0, Math.min(1, (db - DB_MIN) / DB_RANGE));
      dbMags[i]    = SMOOTH * prevDbMags[i] + (1 - SMOOTH) * scaled;
    }

    // --- 7 standard bands (dB-scaled, smooth) — drive visual particle effects ---
    subBassArr[frame]    = bandAvgDB(dbMags, ...BAND_SUB_BASS,   binHz);
    bassArr[frame]       = bandAvgDB(dbMags, ...BAND_BASS,       binHz);
    lowMidArr[frame]     = bandAvgDB(dbMags, ...BAND_LOW_MID,    binHz);
    midArr[frame]        = bandAvgDB(dbMags, ...BAND_MID,        binHz);
    highMidArr[frame]    = bandAvgDB(dbMags, ...BAND_HIGH_MID,   binHz);
    presenceArr[frame]   = bandAvgDB(dbMags, ...BAND_PRESENCE,   binHz);
    brillianceArr[frame] = bandAvgDB(dbMags, ...BAND_BRILLIANCE, binHz);

    // --- Bass spectral flux on RAW linear mags — sharp beat trigger ---
    bassFluxArr[frame] = bandFluxLinear(linMags, prevLinMags, ...BAND_BASS, binHz);

    // Advance state buffers.
    prevLinMags.set(linMags);
    prevDbMags.set(dbMags);
  }

  // ── Beat detection: local peak-pick on bass spectral flux ─────────────────
  // Global mean flux sets a relative threshold → handles both sparse intro
  // and dense drop without parameter changes.
  const meanFlux   = bassFluxArr.reduce((a, b) => a + b, 0) / numFrames;
  const fluxThresh = meanFlux * BEAT_FLUX_THRESHOLD;
  const cooldownF  = Math.ceil((BEAT_COOLDOWN_MS / 1000) * fps);
  const WIN        = BEAT_PEAK_WINDOW;

  const beatTimes   = [];
  let lastBeatFrame = -cooldownF;

  for (let f = WIN; f < numFrames - WIN; f++) {
    const v = bassFluxArr[f];
    if (v < BEAT_MIN_FLUX || v < fluxThresh) continue;

    // Local maximum check within ±WIN frames.
    let isPeak = true;
    for (let k = -WIN; k <= WIN; k++) {
      if (k !== 0 && bassFluxArr[f + k] >= v) { isPeak = false; break; }
    }
    if (!isPeak || f - lastBeatFrame <= cooldownF) continue;

    beatTimes.push((f * HOP_SIZE) / sampleRate);
    lastBeatFrame = f;
  }

  console.log(
    `[audio] ${numFrames} frames @ ${fps.toFixed(1)} fps`
    + ` | flux mean=${meanFlux.toFixed(6)}  thresh=${fluxThresh.toFixed(6)}`
    + ` | ${beatTimes.length} beats detected`
  );
  if (beatTimes.length > 0)
    console.log(`[audio] beat timestamps (s): ${beatTimes.slice(0, 12).map(t => t.toFixed(3)).join('  ')}`);

  return {
    subBassArr, bassArr, lowMidArr, midArr,
    highMidArr, presenceArr, brillianceArr,
    bassFluxArr,
    centroidArr, spreadArr, rmsArr, zcrArr, fullFluxArr,
    beatTimes, fps, numFrames,
    sampleRate,
    duration: audioBuffer.duration,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Load, decode and fully pre-analyse `src` offline.
 * Returns { getAudioData(), context }.
 *
 * getAudioData() → {
 *   subBass, bass, lowMid, mid, highMid, presence, brilliance,  // 0-1 each
 *   mids, treble, volume,   // legacy aliases for shaders
 *   isBeat,                 // true for the one frame the beat fires
 * }
 */
export async function createPrecomputedAnalyser(src) {
  console.log('[audio] pre-computing…');
  const t0 = performance.now();

  const res         = await fetch(src);
  const arrayBuffer = await res.arrayBuffer();
  const ctx         = new AudioContext();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

  const analysed = analyseBuffer(audioBuffer);
  const {
    subBassArr, bassArr, lowMidArr, midArr,
    highMidArr, presenceArr, brillianceArr,
    beatTimes, fps, numFrames, duration,
  } = analysed;

  const mood = computeMoodFingerprint(analysed);

  console.log(`[audio] pre-compute done in ${((performance.now() - t0) / 1000).toFixed(2)} s`);

  // Start looping playback.
  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.loop   = true;
  source.connect(ctx.destination);
  source.start(0);
  const startCtxTime = ctx.currentTime;

  let prevLoopTime = 0;
  let nextBeatIdx  = 0;

  return {
    get context() { return ctx; },
    mood,

    getAudioData() {
      const rawTime  = ctx.currentTime - startCtxTime;
      const loopTime = rawTime % duration;

      // Reset beat cursor on loop wrap-around.
      if (loopTime < prevLoopTime) nextBeatIdx = 0;
      prevLoopTime = loopTime;

      const frame = Math.min(Math.floor(loopTime * fps), numFrames - 1);

      // Fire isBeat=true for any beat timestamp we just passed.
      let isBeat = false;
      while (nextBeatIdx < beatTimes.length && beatTimes[nextBeatIdx] <= loopTime) {
        isBeat = true;
        nextBeatIdx++;
      }

      return {
        subBass:    subBassArr[frame],
        bass:       bassArr[frame],
        lowMid:     lowMidArr[frame],
        mid:        midArr[frame],
        highMid:    highMidArr[frame],
        presence:   presenceArr[frame],
        brilliance: brillianceArr[frame],
        // Legacy aliases — shaders / main.js use these names.
        mids:       midArr[frame],
        treble:     brillianceArr[frame],
        volume:     (bassArr[frame] + midArr[frame] + brillianceArr[frame]) / 3,
        isBeat,
      };
    },
  };
}
