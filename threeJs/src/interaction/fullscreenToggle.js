/**
 * Double-click / double-tap toggles the Fullscreen API.
 * Ignored on UI controls and on a look-around drag. iOS Safari often
 * cannot enter real fullscreen — the request fails silently.
 */

const TAP_MS = 350;
const TAP_SLOP_PX = 12;
const PAIR_SLOP_PX = 28;

function fullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

async function toggleFullscreen() {
  try {
    if (fullscreenElement()) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) await exit.call(document);
      return;
    }
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (req) await req.call(el);
  } catch {
    /* blocked or unsupported */
  }
}

export function attachFullscreenToggle() {
  let downX = 0;
  let downY = 0;
  let dragged = false;
  let lastUp = 0;
  let lastX = 0;
  let lastY = 0;

  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    downX = e.clientX;
    downY = e.clientY;
    dragged = false;
  });

  window.addEventListener('pointermove', (e) => {
    if (Math.abs(e.clientX - downX) > TAP_SLOP_PX || Math.abs(e.clientY - downY) > TAP_SLOP_PX) {
      dragged = true;
    }
  });

  window.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (dragged) {
      lastUp = 0;
      return;
    }
    if (e.target && e.target.closest && e.target.closest('button, a, input, label, textarea')) {
      lastUp = 0;
      return;
    }
    const now = performance.now();
    const dt = now - lastUp;
    const dist = Math.hypot(e.clientX - lastX, e.clientY - lastY);
    if (lastUp && dt < TAP_MS && dist < PAIR_SLOP_PX) {
      lastUp = 0;
      toggleFullscreen();
      return;
    }
    lastUp = now;
    lastX = e.clientX;
    lastY = e.clientY;
  });
}
