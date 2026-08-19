/**
 * coverBgm.js — looped cover-page music, independent of the gameplay analyser.
 * HTMLAudio so it doesn't share (or get torn down with) the track AudioContext.
 */

export function createCoverBgm({ src, volume = 0.7 }) {
  const el = new Audio(src);
  el.loop = true;
  el.preload = 'auto';
  el.volume = 0;

  let fade = null;

  function update(now) {
    if (!fade) return;
    const t = Math.min(1, (now - fade.start) / fade.dur);
    el.volume = Math.max(0, Math.min(1, fade.from + (fade.to - fade.from) * t));
    if (t >= 1) {
      if (fade.pauseAtEnd) el.pause();
      fade = null;
    }
  }

  function fadeTo(to, dur, now, pauseAtEnd = false) {
    fade = {
      from: el.volume,
      to: Math.max(0, Math.min(1, to)),
      start: now,
      dur: Math.max(0.0001, dur),
      pauseAtEnd,
    };
  }

  async function play() {
    try {
      await el.play();
      return true;
    } catch {
      return false;
    }
  }

  return {
    update,
    fadeTo,
    play,
    get paused() { return el.paused; },
    get targetVolume() { return volume; },
  };
}
