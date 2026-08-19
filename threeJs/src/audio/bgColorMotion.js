/**
 * bgColorMotion.js — background gradient: slow mood drift (no beat kick in v1).
 *
 * Top/bottom HSL ease toward moodToBgGradient targets. Drift is intentionally
 * slower than trail colour so the sky feels like room tone.
 */

import { moodToBgGradient, avoidGreenHue } from './moodToBgGradient.js';
import { greenPassMul, moodToTrailColor } from './moodToTrailColor.js';
import { BG_COLOR_DRIFT, BG_CONTRAST_SCALE } from '../config.js';

function lerpHue(a, b, t) {
  let d = b - a;
  if (d > 0.5) d -= 1;
  if (d < -0.5) d += 1;
  let h = a + d * t;
  return h - Math.floor(h);
}

function lerpHsl(from, to, t) {
  return {
    h: lerpHue(from.h, to.h, t),
    s: from.s + (to.s - from.s) * t,
    l: from.l + (to.l - from.l) * t,
  };
}

export class BgColorMotion {
  /**
   * @param {object} [ctl] live-mutable amounts
   */
  constructor(ctl = {}) {
    this.ctl = ctl;
    if (ctl.drift         === undefined) ctl.drift         = BG_COLOR_DRIFT;
    if (ctl.contrastScale === undefined) ctl.contrastScale = BG_CONTRAST_SCALE;

    const seed = moodToBgGradient(null, { contrastScale: ctl.contrastScale });
    this.top    = { ...seed.top };
    this.bottom = { ...seed.bottom };
    this.relation = seed.relation;
    this.hueOff = 0;
  }

  /** Snap to a mood gradient (audio start / track identity). */
  setFromMood(mood) {
    const g = moodToBgGradient(mood, {
      contrastScale: this.ctl.contrastScale,
      trailHsl: moodToTrailColor(mood),
    });
    this.top    = { ...g.top };
    this.bottom = { ...g.bottom };
    this.relation = g.relation;
    this.hueOff = 0;
  }

  /** Persistent hue offset (paired with forced mid-song trail colour on flat tracks). */
  setHueOff(delta) {
    this.hueOff = ((delta || 0) % 1 + 1) % 1;
  }

  /**
   * @param {object} mood live currentMood
   * @param {number} dt
   * @param {{ h: number, s: number, l: number } | null} [trailHsl] displayed/target trail colour
   *        (keeps sky on the same hue family as the ribbons, including force offset)
   * @returns {{ top: {h,s,l}, bottom: {h,s,l}, relation: number }}
   */
  update(mood, dt, trailHsl = null) {
    const target = moodToBgGradient(mood, {
      contrastScale: this.ctl.contrastScale,
      trailHsl,
    });
    if (this.hueOff && !trailHsl) {
      target.top.h = avoidGreenHue(((target.top.h + this.hueOff) % 1 + 1) % 1);
      target.bottom.h = avoidGreenHue(((target.bottom.h + this.hueOff) % 1 + 1) % 1);
    }
    this.relation = target.relation;
    const boost = Math.max(greenPassMul(this.top.h), greenPassMul(this.bottom.h));
    const t = 1 - Math.exp(-Math.max(0, this.ctl.drift) * boost * dt);
    this.top    = lerpHsl(this.top, target.top, t);
    this.bottom = lerpHsl(this.bottom, target.bottom, t);
    return { top: this.top, bottom: this.bottom, relation: this.relation };
  }
}
