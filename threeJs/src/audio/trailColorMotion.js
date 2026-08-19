/**
 * trailColorMotion.js — trail base colour: slow mood drift + rare big-beat swift change.
 *
 * Displayed HSL eases toward a mood-derived target. Normally the ease is slow (section
 * drift). On a seldom "big" beat (isBeat + loudness gate + cooldown) the target updates
 * and a bloom-like surge envelope ramps the ease rate up → swift smooth colour change,
 * then settles back to slow drift. Not every beat (that's the flow surge's job).
 *
 * Flat tracks (windowed hue barely moves across the song) get one forced mid-song
 * retarget so the palette still breathes once — eased at the normal drift rate.
 */

import { moodToTrailColor, avoidGreenHue, greenPassMul } from './moodToTrailColor.js';
import { computeWindowedMood } from './audioMoodAnalyze.js';
import {
  TRAIL_COLOR_DRIFT,
  TRAIL_COLOR_BEAT_DRIFT,
  TRAIL_COLOR_BEAT_DECAY,
  TRAIL_COLOR_BEAT_LOUD,
  TRAIL_COLOR_BEAT_COOLDOWN,
  TRAIL_COLOR_BEAT_HUE,
  TRAIL_COLOR_FORCE_SPAN,
  TRAIL_COLOR_FORCE_HUE,
  TRAIL_COLOR_FORCE_AT,
  MOOD_WINDOW_SEC,
} from '../config.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const fract = (v) => v - Math.floor(v);

function lerpHue(a, b, t) {
  let d = b - a;
  if (d > 0.5) d -= 1;
  if (d < -0.5) d += 1;
  let h = a + d * t;
  h = h - Math.floor(h);
  return h;
}

function lerpHsl(from, to, t) {
  return {
    h: lerpHue(from.h, to.h, t),
    s: from.s + (to.s - from.s) * t,
    l: from.l + (to.l - from.l) * t,
  };
}

function hueDist(a, b) {
  const d = Math.abs(a - b);
  return Math.min(d, 1 - d);
}

/**
 * Sample windowed mood→colour across a track; return circular hue span [0, 0.5].
 * Used to decide whether a forced mid-song colour change is needed.
 *
 * @param {object} analysed - analyseBuffer() output
 * @param {number} [trackBpm]
 * @param {{ windowSec?: number, stepSec?: number }} [opts]
 * @returns {{ span: number, samples: number, flat: boolean }}
 */
export function measureTrackColorHueSpan(analysed, trackBpm = 0, opts = {}) {
  const duration = analysed?.duration ?? 0;
  const windowSec = opts.windowSec ?? MOOD_WINDOW_SEC;
  const stepSec = opts.stepSec ?? Math.max(2, windowSec);
  if (!(duration > 0.5) || !analysed) {
    return { span: 0, samples: 0, flat: true };
  }

  const hues = [];
  for (let t = windowSec; t <= duration; t += stepSec) {
    const mood = computeWindowedMood(analysed, t, windowSec, trackBpm);
    hues.push(moodToTrailColor(mood).h);
  }
  // Always include near the end.
  const endT = Math.max(windowSec, duration - 0.05);
  hues.push(moodToTrailColor(computeWindowedMood(analysed, endT, windowSec, trackBpm)).h);

  let span = 0;
  for (let i = 0; i < hues.length; i++) {
    for (let j = i + 1; j < hues.length; j++) {
      span = Math.max(span, hueDist(hues[i], hues[j]));
    }
  }
  return {
    span,
    samples: hues.length,
    flat: span <= TRAIL_COLOR_FORCE_SPAN,
  };
}

export class TrailColorMotion {
  /**
   * @param {object} [ctl] live-mutable amounts
   * @param {(mood: object) => {h:number,s:number,l:number}} [colorFn] palette mapper
   *        (default mood→trail; pass moodToPaintColor for the ink palette)
   */
  constructor(ctl = {}, colorFn = moodToTrailColor) {
    // Live-mutable ctl object — fill missing defaults once.
    this.ctl = ctl;
    this.colorFn = colorFn;
    if (ctl.drift        === undefined) ctl.drift        = TRAIL_COLOR_DRIFT;
    if (ctl.beatDrift    === undefined) ctl.beatDrift    = TRAIL_COLOR_BEAT_DRIFT;
    if (ctl.beatDecay    === undefined) ctl.beatDecay    = TRAIL_COLOR_BEAT_DECAY;
    if (ctl.beatLoud     === undefined) ctl.beatLoud     = TRAIL_COLOR_BEAT_LOUD;
    if (ctl.beatCooldown === undefined) ctl.beatCooldown = TRAIL_COLOR_BEAT_COOLDOWN;
    if (ctl.beatHue      === undefined) ctl.beatHue      = TRAIL_COLOR_BEAT_HUE;
    if (ctl.forceHue     === undefined) ctl.forceHue     = TRAIL_COLOR_FORCE_HUE;
    if (ctl.forceAtFrac  === undefined) ctl.forceAtFrac  = TRAIL_COLOR_FORCE_AT;
    const seed = colorFn(null);
    this.current = { ...seed };
    this.target  = { ...seed };
    this.surge   = 0;   // big-beat colour envelope [0,1]
    this.cool    = 0;   // cooldown seconds remaining
    // Forced mid-song retarget (armed only when track colour span is flat).
    this.forceAt     = -1;
    this.forceFired  = false;
    this.forceHueOff = 0;
    this.startHueOff = 0;
    this._prevPlayT  = 0;
  }

  /** Snap to a mood colour (audio start / track identity). */
  setFromMood(mood, startHue = null) {
    const c = this.colorFn(mood);
    if (startHue != null && Number.isFinite(startHue)) {
      const want = fract(startHue + 1);
      let d = want - c.h;
      if (d > 0.5) d -= 1;
      if (d < -0.5) d += 1;
      this.startHueOff = d;
      c.h = want;
    } else {
      this.startHueOff = 0;
    }
    this.current = { ...c };
    this.target  = { ...c };
    this.surge   = 0;
    this.forceHueOff = 0;
  }

  /**
   * Arm / disarm a one-shot mid-song hue retarget for flat colour tracks.
   * @param {number} durationSec track length
   * @param {boolean} enabled
   */
  armForceMid(durationSec, enabled) {
    const dur = Math.max(0, durationSec || 0);
    this.forceAt = enabled && dur > 1
      ? dur * clamp01(this.ctl.forceAtFrac ?? TRAIL_COLOR_FORCE_AT)
      : -1;
    this.forceFired = false;
    this.forceHueOff = 0;
    this._prevPlayT = 0;
  }

  /**
   * @param {object} mood live currentMood
   * @param {number} dt
   * @param {{ isBeat?: boolean, loud?: number } | null} audio
   * @param {number | null} [playheadSec] loop-relative playhead (for force-mid)
   * @returns {{ h: number, s: number, l: number }}
   */
  update(mood, dt, audio = null, playheadSec = null) {
    const c = this.ctl;

    // Flat-track mid-song force first so this frame's target already includes it.
    if (this.forceAt >= 0 && playheadSec != null) {
      if (playheadSec < this._prevPlayT) {
        this.forceFired = false;
        this.forceHueOff = 0;
      }
      if (!this.forceFired && this._prevPlayT < this.forceAt && playheadSec >= this.forceAt) {
        this.forceFired = true;
        const fh = c.forceHue ?? TRAIL_COLOR_FORCE_HUE;
        this.forceHueOff = fract(this.forceHueOff + fh);
        this.target.h = avoidGreenHue(fract(this.target.h + fh));
        this.cool  = Math.max(this.cool, Math.max(0.05, c.beatCooldown));
      }
      this._prevPlayT = playheadSec;
    }

    const moodColor = this.colorFn(mood);
    if (this.startHueOff) {
      moodColor.h = fract(moodColor.h + this.startHueOff + 1);
    }
    if (this.forceHueOff) {
      moodColor.h = avoidGreenHue(fract(moodColor.h + this.forceHueOff));
    }

    if (this.cool > 0) this.cool = Math.max(0, this.cool - dt);

    // Live palette every frame (don't freeze the target during a beat surge —
    // that left ribbons parked on the start hue while the sky kept walking).
    this.target = { h: moodColor.h, s: moodColor.s, l: moodColor.l };
    const isBeat = !!(audio && audio.isBeat);
    const loud   = audio ? clamp01(audio.loud ?? 0) : 0;
    if (isBeat && loud >= c.beatLoud && this.cool <= 0) {
      this.target.h = ((moodColor.h + c.beatHue) % 1 + 1) % 1;
      this.target.s = clamp01(moodColor.s + 0.08 * loud);
      this.surge = 1.0;
      this.cool  = Math.max(0.05, c.beatCooldown);
    }

    // Surge envelope: linear decay, smoothstep'd for bloom-like ease when driving rate.
    if (this.surge > 0) {
      this.surge = Math.max(0, this.surge - dt / Math.max(1e-3, c.beatDecay));
    }
    const s = this.surge;
    const surgeT = s * s * (3 - 2 * s); // smoothstep
    const rate = (c.drift + (c.beatDrift - c.drift) * surgeT) * greenPassMul(this.current.h);
    const t = 1 - Math.exp(-Math.max(0, rate) * dt);
    this.current = lerpHsl(this.current, this.target, t);
    return this.current;
  }
}
