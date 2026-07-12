/**
 * tuningPanel.js — live tuning harness for the flythrough.
 *
 * Shows FPS / frame-time and exposes the knobs that trade off density, coverage
 * and performance:
 *   • kill radius   — visible bubble size (shorter = denser at fixed budget)
 *   • point size    — cube size multiplier
 *   • tile period   — instance spacing (smaller = more overlap = fewer gaps)
 *   • jitter        — per-cell origin jitter
 *   • scale max     — upper bound of per-cell random scale
 * Kill/point/tile/jitter/scale are live (uniform writes). Particle count changes
 * the texture/buffer sizes, so it reloads with a ?count=NNNN override.
 */

import { PAINT_ARCHETYPES } from '../config.js';

export function createTuningPanel(particles, particleSim, bloomField) {
  const u  = particles.material.uniforms;
  const su = particleSim.mat.uniforms;

  const panel = document.createElement('div');
  Object.assign(panel.style, {
    position: 'fixed', top: '12px', left: '12px', zIndex: 10000,
    width: '220px', padding: '12px 14px',
    font: '11px/1.5 monospace', color: '#cfe',
    background: 'rgba(10,12,20,0.82)', border: '1px solid rgba(255,255,255,0.14)',
    borderRadius: '8px', backdropFilter: 'blur(6px)', userSelect: 'none',
  });

  const fps = document.createElement('div');
  Object.assign(fps.style, { fontSize: '13px', color: '#9fe', marginBottom: '8px', letterSpacing: '0.04em' });
  fps.textContent = '– fps';
  panel.appendChild(fps);

  function slider(label, min, max, step, value, onInput) {
    const row = document.createElement('div');
    row.style.marginBottom = '8px';
    const cap = document.createElement('div');
    cap.style.display = 'flex';
    cap.style.justifyContent = 'space-between';
    const name = document.createElement('span'); name.textContent = label;
    const val  = document.createElement('span'); val.textContent = (+value).toFixed(2); val.style.color = '#7cf';
    cap.append(name, val);
    const input = document.createElement('input');
    Object.assign(input, { type: 'range', min, max, step, value });
    input.style.width = '100%';
    input.addEventListener('input', () => { const v = parseFloat(input.value); val.textContent = v.toFixed(2); onInput(v); });
    row.append(cap, input);
    panel.appendChild(row);
    return input;
  }

  function dropdown(label, options, value, onChange) {
    const row = document.createElement('div');
    row.style.marginBottom = '8px';
    const cap = document.createElement('div');
    cap.textContent = label;
    cap.style.marginBottom = '2px';
    const sel = document.createElement('select');
    Object.assign(sel.style, {
      width: '100%', font: '11px monospace', color: '#cfe',
      background: 'rgba(255,255,255,0.06)',
      border: '1px solid rgba(255,255,255,0.18)', borderRadius: '5px',
    });
    options.forEach((name, i) => {
      const opt = document.createElement('option');
      opt.value = i; opt.textContent = name;
      opt.style.color = '#0b1020';
      sel.appendChild(opt);
    });
    sel.value = value;
    sel.addEventListener('change', () => onChange(parseInt(sel.value, 10)));
    row.append(cap, sel);
    panel.appendChild(row);
    return sel;
  }

  slider('kill radius', 2, 10, 0.05, u.uKillRadius.value, (v) => { u.uKillRadius.value = v; su.uKillRadius.value = v; });
  slider('point size',  0.15, 1.5, 0.01, u.uPointSize.value, (v) => { u.uPointSize.value = v; });
  slider('tile period', 1.5, 8, 0.05, su.uInstPeriod.value, (v) => { u.uInstPeriod.value = v; su.uInstPeriod.value = v; });
  slider('jitter',      0, 0.5, 0.01, su.uInstJitter.value, (v) => { u.uInstJitter.value = v; su.uInstJitter.value = v; });
  slider('scale max',   1, 2.5, 0.05, su.uScaleMax.value, (v) => { u.uScaleMax.value = v; su.uScaleMax.value = v; });

  // ── Bloom shape (Phase 2) ─────────────────────────────────────────────────
  const sep = document.createElement('div');
  sep.textContent = 'bloom shape';
  Object.assign(sep.style, { margin: '4px 0 6px', color: '#9fe', opacity: 0.7, letterSpacing: '0.05em' });
  panel.appendChild(sep);

  if (bloomField) {
    dropdown('dominant', PAINT_ARCHETYPES, bloomField.shape.archA, (v) => { bloomField.shape.archA = v; });
    dropdown('blend partner', PAINT_ARCHETYPES, bloomField.shape.archB, (v) => { bloomField.shape.archB = v; });
    slider('blend amt', 0, 0.5, 0.01, bloomField.shape.blendAB, (v) => { bloomField.shape.blendAB = v; });
  }

  slider('outward',   0, 2,   0.02, su.uPaintOutward.value,  (v) => { su.uPaintOutward.value  = v; });
  slider('shape amt', 0, 2.5, 0.02, su.uPaintCurl.value,     (v) => { su.uPaintCurl.value     = v; });
  slider('field freq',0.2, 5, 0.05, su.uPaintCurlFreq.value, (v) => { su.uPaintCurlFreq.value = v; });
  slider('detail',    0, 1,   0.02, su.uPaintDetail.value,   (v) => { su.uPaintDetail.value   = v; });
  slider('shell',     0, 1,   0.02, su.uPaintShell.value,    (v) => { su.uPaintShell.value    = v; });

  // ── Count presets (reload with ?count) ────────────────────────────────────
  const countRow = document.createElement('div');
  countRow.style.marginTop = '10px';
  const lbl = document.createElement('div');
  lbl.textContent = `count: ${particles.count.toLocaleString()}`;
  lbl.style.marginBottom = '4px';
  countRow.appendChild(lbl);
  [20000, 40000, 60000, 100000].forEach((n) => {
    const b = document.createElement('button');
    b.textContent = n / 1000 + 'K';
    Object.assign(b.style, {
      margin: '2px', padding: '3px 7px', font: '11px monospace', cursor: 'pointer',
      color: n === particles.count ? '#0b1020' : '#cfe',
      background: n === particles.count ? '#7cf' : 'rgba(255,255,255,0.08)',
      border: '1px solid rgba(255,255,255,0.18)', borderRadius: '5px',
    });
    b.addEventListener('click', () => {
      const url = new URL(window.location.href);
      url.searchParams.set('count', n);
      window.location.href = url.toString();
    });
    countRow.appendChild(b);
  });
  panel.appendChild(countRow);

  document.body.appendChild(panel);

  // ── FPS meter (EMA over frames) ────────────────────────────────────────────
  let last = performance.now();
  let ema  = 60;
  function tick(now) {
    const dt = now - last; last = now;
    if (dt > 0) ema = ema * 0.9 + (1000 / dt) * 0.1;
    fps.textContent = `${ema.toFixed(0)} fps  ·  ${(1000 / ema).toFixed(1)} ms`;
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  return panel;
}
