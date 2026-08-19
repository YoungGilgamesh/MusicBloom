/**
 * resultBloom2d.js — 2D pigment gather / burst around the result still.
 * Soft flow-dots + short trails, sampled from the screenshot. Not the 3D sim.
 */

const SAMPLE = 72;
const MIN_LUMA = 22;

function luma(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function samplePixels(src) {
  const c = document.createElement('canvas');
  c.width = SAMPLE;
  c.height = SAMPLE;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(src, 0, 0, SAMPLE, SAMPLE);
  const { data } = ctx.getImageData(0, 0, SAMPLE, SAMPLE);
  const out = [];
  for (let y = 0; y < SAMPLE; y++) {
    for (let x = 0; x < SAMPLE; x++) {
      const i = (y * SAMPLE + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      if (a < 180 || luma(r, g, b) < MIN_LUMA) continue;
      out.push({ u: (x + 0.5) / SAMPLE, v: (y + 0.5) / SAMPLE, r, g, b });
    }
  }
  return out;
}

function pick(arr) {
  return arr[(Math.random() * arr.length) | 0];
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - ((1 - t) * 2) ** 3 / 2;
}

function grainRad() {
  return 5.5 + Math.pow(Math.random(), 1.85) * 7.5;
}

// Matches flowDots.frag: bright core, then 1 - smoothstep(0.15, 1, r).
function drawSoftDot(ctx, x, y, rad, stretch, ang, r, g, b, a) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.scale(Math.max(stretch, 1), 1);
  const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, rad);
  grd.addColorStop(0, `rgba(${r},${g},${b},${a})`);
  grd.addColorStop(0.15, `rgba(${r},${g},${b},${a})`);
  grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(0, 0, rad, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function makeOverlay() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, (vw * dpr) | 0);
  canvas.height = Math.max(1, (vh * dpr) | 0);
  Object.assign(canvas.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    width: '100%',
    height: '100%',
    zIndex: '14',
    pointerEvents: 'none',
  });
  document.body.appendChild(canvas);
  return { canvas, ctx: canvas.getContext('2d'), dpr, vw, vh };
}

function samplePool(img) {
  const samples = samplePixels(img);
  return samples.length ? samples : [{ u: 0.5, v: 0.5, r: 220, g: 180, b: 140 }];
}

/**
 * Outward burst after the still is accepted.
 * @param {{ img: HTMLImageElement, src: string, duration: number, onDone: () => void }} opts
 * @returns {{ cancel: () => void }}
 */
export function playResultBloom2d({ img, src, duration = 1.75, onDone }) {
  const rect = img.getBoundingClientRect();
  const { canvas, ctx, dpr, vw, vh } = makeOverlay();
  const cx = rect.left + rect.width * 0.5;
  const cy = rect.top + rect.height * 0.5;
  const pool = samplePool(img);
  const reach = Math.min(vw, vh) * 0.48;

  const dots = [];
  const trails = [];
  for (let i = 0; i < 200; i++) {
    const s = pick(pool);
    const x = rect.left + s.u * rect.width;
    const y = rect.top + s.v * rect.height;
    const ang = Math.atan2(y - cy, x - cx) + (Math.random() - 0.5) * 0.7;
    const spd = reach * (0.7 + Math.random() * 0.55);
    dots.push({
      x, y,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      r: s.r, g: s.g, b: s.b,
      rad: grainRad(),
      life: 0.75 + Math.random() * 0.25,
    });
  }
  for (let i = 0; i < 40; i++) {
    const s = pick(pool);
    const x = rect.left + s.u * rect.width;
    const y = rect.top + s.v * rect.height;
    const ang = Math.atan2(y - cy, x - cx) + (Math.random() - 0.5) * 0.55;
    const spd = reach * (0.55 + Math.random() * 0.5);
    trails.push({
      x, y,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      r: s.r, g: s.g, b: s.b,
      hist: [{ x, y }],
      life: 0.8 + Math.random() * 0.2,
    });
  }

  return runOverlay({
    canvas, ctx, dpr, vw, vh, duration, onDone,
    tick(dt, u, fade) {
      const drag = 1 - dt * 0.55;
      for (const p of trails) {
        p.vx *= drag;
        p.vy *= drag;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.hist.push({ x: p.x, y: p.y });
        if (p.hist.length > 12) p.hist.shift();
        const a = fade * p.life;
        if (a <= 0.02 || p.hist.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(p.hist[0].x, p.hist[0].y);
        for (let k = 1; k < p.hist.length; k++) ctx.lineTo(p.hist[k].x, p.hist[k].y);
        ctx.strokeStyle = `rgba(${p.r},${p.g},${p.b},${a * 0.45})`;
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      }
      for (const p of dots) {
        p.vx *= drag;
        p.vy *= drag;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const a = fade * p.life;
        if (a <= 0.02) continue;
        const spd = Math.hypot(p.vx, p.vy);
        drawSoftDot(ctx, p.x, p.y, p.rad, 1 + Math.min(0.85, spd / 420), Math.atan2(p.vy, p.vx), p.r, p.g, p.b, a * 0.9);
      }
    },
    fadeOf: (u) => 1 - u * u,
  });
}

/**
 * Inward gather before the still fades in — reverse of the accept burst.
 * @param {{ img: HTMLImageElement, src?: string, duration: number, revealAt?: number, onReveal?: () => void, onDone: () => void }} opts
 * @returns {{ cancel: () => void }}
 */
export function playResultGather2d({ img, duration = 2.6, revealAt = 0.58, onReveal, onDone }) {
  const rect = img.getBoundingClientRect();
  const { canvas, ctx, dpr, vw, vh } = makeOverlay();
  const cx = rect.left + rect.width * 0.5;
  const cy = rect.top + rect.height * 0.5;
  const pool = samplePool(img);
  const from = Math.min(vw, vh) * 0.46;

  const dots = [];
  const trails = [];

  function homeOf(s) {
    return {
      tx: rect.left + s.u * rect.width,
      ty: rect.top + s.v * rect.height,
    };
  }
  function startOf(tx, ty, spread) {
    const ang = Math.atan2(ty - cy, tx - cx) + (Math.random() - 0.5) * spread;
    const d = from * (0.7 + Math.random() * 0.65);
    return { x: tx + Math.cos(ang) * d, y: ty + Math.sin(ang) * d };
  }

  for (let i = 0; i < 220; i++) {
    const s = pick(pool);
    const { tx, ty } = homeOf(s);
    const p0 = startOf(tx, ty, 0.85);
    dots.push({
      x: p0.x, y: p0.y, x0: p0.x, y0: p0.y, tx, ty,
      r: s.r, g: s.g, b: s.b,
      rad: grainRad(),
      delay: Math.random() * 0.32 * duration,
      life: 0.8 + Math.random() * 0.2,
      px: p0.x, py: p0.y,
    });
  }
  for (let i = 0; i < 48; i++) {
    const s = pick(pool);
    const { tx, ty } = homeOf(s);
    const p0 = startOf(tx, ty, 0.65);
    trails.push({
      x: p0.x, y: p0.y, x0: p0.x, y0: p0.y, tx, ty,
      r: s.r, g: s.g, b: s.b,
      hist: [{ x: p0.x, y: p0.y }],
      delay: Math.random() * 0.28 * duration,
      life: 0.82 + Math.random() * 0.18,
    });
  }

  let revealed = false;

  return runOverlay({
    canvas, ctx, dpr, vw, vh, duration, onDone,
    fadeOf: () => 1,
    tick(dt, u) {
      if (!revealed && u >= revealAt) {
        revealed = true;
        onReveal?.();
      }

      for (const p of trails) {
        const span = Math.max(0.28, duration - p.delay);
        const lu = Math.min(1, Math.max(0, (u * duration - p.delay) / span));
        if (lu <= 0) continue;
        const e = easeInOutCubic(lu);
        p.x = p.x0 + (p.tx - p.x0) * e;
        p.y = p.y0 + (p.ty - p.y0) * e;
        p.hist.push({ x: p.x, y: p.y });
        if (p.hist.length > 12) p.hist.shift();
        let a = p.life;
        if (lu < 0.1) a *= lu / 0.1;
        if (lu > 0.7) a *= 1 - (lu - 0.7) / 0.3;
        if (a <= 0.02 || p.hist.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(p.hist[0].x, p.hist[0].y);
        for (let k = 1; k < p.hist.length; k++) ctx.lineTo(p.hist[k].x, p.hist[k].y);
        ctx.strokeStyle = `rgba(${p.r},${p.g},${p.b},${a * 0.45})`;
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      }

      for (const p of dots) {
        const span = Math.max(0.28, duration - p.delay);
        const lu = Math.min(1, Math.max(0, (u * duration - p.delay) / span));
        if (lu <= 0) continue;
        const e = easeInOutCubic(lu);
        const nx = p.x0 + (p.tx - p.x0) * e;
        const ny = p.y0 + (p.ty - p.y0) * e;
        const vx = nx - p.px;
        const vy = ny - p.py;
        p.px = p.x = nx;
        p.py = p.y = ny;
        let a = p.life;
        if (lu < 0.1) a *= lu / 0.1;
        if (lu > 0.7) a *= 1 - (lu - 0.7) / 0.3;
        if (a <= 0.02) continue;
        const spd = Math.hypot(vx, vy) / Math.max(dt, 0.001);
        drawSoftDot(ctx, p.x, p.y, p.rad, 1 + Math.min(0.85, spd / 420), Math.atan2(vy, vx), p.r, p.g, p.b, a * 0.9);
      }
    },
  });
}

function runOverlay({ canvas, ctx, dpr, vw, vh, duration, onDone, tick, fadeOf }) {
  let raf = 0;
  let t0 = 0;
  let dead = false;

  function cleanup() {
    if (dead) return;
    dead = true;
    cancelAnimationFrame(raf);
    canvas.remove();
  }

  function frame(now) {
    if (dead || !ctx) return;
    if (!t0) t0 = now;
    const t = (now - t0) / 1000;
    const dt = Math.min(0.033, (now - (frame.prev || now)) / 1000) || 0.016;
    frame.prev = now;
    const u = Math.min(1, t / duration);
    const fade = fadeOf(u);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, vw, vh);
    ctx.globalCompositeOperation = 'lighter';
    tick(dt, u, fade);
    ctx.globalCompositeOperation = 'source-over';

    if (u >= 1) {
      cleanup();
      onDone?.();
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  raf = requestAnimationFrame(frame);
  return { cancel: cleanup };
}
