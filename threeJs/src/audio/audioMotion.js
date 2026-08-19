/**
 * audioMotion.js — Phase A real-time audio → particle motion.
 *
 * Stateful companion to the pure moodTo* mappers (moodToFlowSpeed / moodToSize):
 * those turn the slow "mood of the moment" into flow-speed / size, while THIS turns
 * the fast per-frame audio features (beats, treble, loudness) into transient motion
 * layered ON TOP of the mood-driven baked flow. Nothing here re-bakes — it only
 * scales existing uniforms (uFlowSpeed, uAudioTreble), so it's effectively free.
 *
 * Envelopes:
 *   - beat: snaps to 1 on isBeat, then decays to 0 over ctl.beatDecay (firework).
 *   - bands: EMA-smoothed so the treble shimmer / loudness accent don't flicker.
 *
 * Output (per update):
 *   flowMul → multiply the mood flow speed:
 *             1 + accent·loudness + kick·beat·intensityScale
 *             (intensity = loudness EMA → quiet beats softer, intense beats drastic)
 *   treble  → write to uAudioTreble (shader turns it into a size pulse):
 *             trebleAmt·trebleEMA + beatPop·beat
 *   beat    → the raw beat envelope [0,1] (for the debug beat flash)
 *
 * `ctl` is a live-mutable object, mirroring the
 * flowSpeed pattern in main.js.
 */

import { AUDIO_BAND_SMOOTH } from '../config.js';

export class AudioMotion {
  /**
   * @param {object} ctl live amounts: { beatDecay, beatKick, kickQuiet, flowAccent, trebleAmt, beatPop }
   */
  constructor(ctl) {
    this.ctl       = ctl;
    this.beat      = 0;   // beat pulse envelope [0,1]
    this.trebleEMA = 0;   // smoothed treble/brilliance
    this.loudEMA   = 0;   // smoothed loudness (volume) — also = "intensity" for surge scaling
  }

  /**
   * @param {object} data getAudioData() result ({ treble, volume, isBeat, … })
   * @param {number} dt   seconds since last frame
   * @returns {{ flowMul: number, treble: number, beat: number, loud: number }}
   */
  update(data, dt) {
    const c = this.ctl;

    // Beat: instant attack, exponential-ish linear decay to 0.
    if (data.isBeat) this.beat = 1.0;
    else this.beat = Math.max(0, this.beat - dt / Math.max(1e-3, c.beatDecay));

    // Smooth the bands so sustained effects don't flicker frame-to-frame.
    const k = Math.min(1, dt * AUDIO_BAND_SMOOTH);
    this.trebleEMA += ((data.treble ?? 0) - this.trebleEMA) * k;
    this.loudEMA   += ((data.volume ?? 0) - this.loudEMA)   * k;

    // Intensity scales the beat SURGE: quiet → kickQuiet·kick, loud/drop → full kick.
    const intensity = Math.min(1, Math.max(0, this.loudEMA));
    const kq = c.kickQuiet !== undefined ? c.kickQuiet : 0.30;
    const kickScale = kq + (1 - kq) * intensity;

    return {
      flowMul: 1 + c.flowAccent * intensity + c.beatKick * this.beat * kickScale,
      treble:  c.trebleAmt * this.trebleEMA + c.beatPop * this.beat,
      beat:    this.beat,      // raw beat envelope [0,1] — also fed to trails
      loud:    this.loudEMA,   // smoothed loudness — also fed to trails
    };
  }
}
