/**
 * moodDebugPanel.js
 *
 * Floating overlay with 6 sliders — one per mood fingerprint feature.
 * Each slider instantly recomputes moodToConfig() and pushes the results
 * to the particle shader uniforms, so you can explore the full flow-shape
 * space without needing real audio files.
 *
 * Toggle visibility: press  D
 */

// moodToConfig removed — caller handles what to do with mood values

import { contrastMood } from '../moodContrast.js';

const FEATURES = [
  { key: 'energy',     label: 'energy',     min: 0,   max: 1,   step: 0.01, init: 0.5  },
  { key: 'brightness', label: 'brightness', min: 0,   max: 1,   step: 0.01, init: 0.5  },
  { key: 'texture',    label: 'texture',    min: 0,   max: 1,   step: 0.01, init: 0.5  },
  { key: 'heaviness',  label: 'heaviness',  min: 0,   max: 1,   step: 0.01, init: 0.5  },
  { key: 'dynamism',   label: 'dynamism',   min: 0,   max: 1,   step: 0.01, init: 0.5  },
  { key: 'bpm',        label: 'bpm',        min: 40,  max: 200, step: 1,    init: 120   },
];

// ── Styles ────────────────────────────────────────────────────────────────────

const PANEL_CSS = `
  position: fixed;
  top: 20px;
  right: 20px;
  width: 260px;
  background: rgba(6, 6, 14, 0.82);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 10px;
  padding: 14px 18px 16px;
  font-family: 'Courier New', monospace;
  font-size: 11px;
  color: rgba(255,255,255,0.75);
  backdrop-filter: blur(8px);
  user-select: none;
  z-index: 9999;
`;

const ROW_CSS = `
  display: flex;
  align-items: center;
  margin-bottom: 9px;
  gap: 8px;
`;

const LABEL_CSS = `
  width: 72px;
  flex-shrink: 0;
  color: rgba(255,255,255,0.5);
  letter-spacing: 0.04em;
`;

const SLIDER_CSS = `
  flex: 1;
  appearance: none;
  height: 2px;
  background: rgba(255,255,255,0.18);
  border-radius: 2px;
  outline: none;
  cursor: pointer;
`;

const VALUE_CSS = `
  width: 34px;
  text-align: right;
  color: rgba(255,255,255,0.9);
  flex-shrink: 0;
`;

const HEADER_CSS = `
  font-size: 10px;
  letter-spacing: 0.14em;
  color: rgba(255,255,255,0.3);
  margin-bottom: 12px;
  text-transform: uppercase;
`;

const FOOTER_CSS = `
  margin-top: 12px;
  display: flex;
  gap: 8px;
`;

const BTN_CSS = `
  flex: 1;
  padding: 5px 0;
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 5px;
  color: rgba(255,255,255,0.6);
  font-family: inherit;
  font-size: 10px;
  letter-spacing: 0.08em;
  cursor: pointer;
  text-transform: uppercase;
`;

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * @param {function} onChange  — called with the full mood state object on every slider change
 * @param {function} onReveal  — called once on first interaction to trigger reveal
 */
export function createMoodDebugPanel(onChange, onReveal) {
  const state = Object.fromEntries(FEATURES.map(f => [f.key, f.init]));
  let revealTriggered = false;

  // ── DOM ───────────────────────────────────────────────────────────────────

  const panel = document.createElement('div');
  panel.style.cssText = PANEL_CSS;

  const header = document.createElement('div');
  header.style.cssText = HEADER_CSS;
  header.textContent = 'Mood Debug  [ D ]';
  panel.appendChild(header);

  const valueEls = {};
  const sliderEls = {};

  for (const f of FEATURES) {
    const row = document.createElement('div');
    row.style.cssText = ROW_CSS;

    const label = document.createElement('span');
    label.style.cssText = LABEL_CSS;
    label.textContent = f.label;

    const slider = document.createElement('input');
    slider.type  = 'range';
    slider.min   = f.min;
    slider.max   = f.max;
    slider.step  = f.step;
    slider.value = f.init;
    slider.style.cssText = SLIDER_CSS;

    const valEl = document.createElement('span');
    valEl.style.cssText = VALUE_CSS;
    valEl.textContent = f.key === 'bpm' ? f.init : f.init.toFixed(2);

    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      state[f.key] = v;
      valEl.textContent = f.key === 'bpm' ? Math.round(v) : v.toFixed(2);
      applyMood();

      if (!revealTriggered) {
        revealTriggered = true;
        onReveal?.();
      }
    });

    sliderEls[f.key] = slider;
    valueEls[f.key]  = valEl;

    row.appendChild(label);
    row.appendChild(slider);
    row.appendChild(valEl);
    panel.appendChild(row);
  }

  // ── Footer buttons ────────────────────────────────────────────────────────

  const footer = document.createElement('div');
  footer.style.cssText = FOOTER_CSS;

  const resetBtn = document.createElement('button');
  resetBtn.style.cssText = BTN_CSS;
  resetBtn.textContent = 'Reset';
  resetBtn.addEventListener('click', () => {
    for (const f of FEATURES) {
      state[f.key] = f.init;
      sliderEls[f.key].value = f.init;
      valueEls[f.key].textContent = f.key === 'bpm' ? f.init : f.init.toFixed(2);
    }
    applyMood();
  });

  // Preset extremes for quick testing
  const PRESETS = {
    'Anxious':     { energy:0.85, brightness:0.55, texture:0.90, heaviness:0.35, dynamism:0.92, bpm:155 },
    'Happy':       { energy:0.70, brightness:0.75, texture:0.30, heaviness:0.15, dynamism:0.55, bpm:128 },
    'Melancholic': { energy:0.25, brightness:0.25, texture:0.20, heaviness:0.85, dynamism:0.20, bpm:68  },
    'Peaceful':    { energy:0.18, brightness:0.48, texture:0.10, heaviness:0.22, dynamism:0.12, bpm:72  },
  };

  const presetSel = document.createElement('select');
  Object.assign(presetSel.style, {
    flex: '1',
    padding: '5px 4px',
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '5px',
    color: 'rgba(255,255,255,0.6)',
    fontFamily: 'inherit',
    fontSize: '10px',
    cursor: 'pointer',
  });

  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = 'Presets…';
  presetSel.appendChild(defaultOpt);

  for (const name of Object.keys(PRESETS)) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    presetSel.appendChild(opt);
  }

  presetSel.addEventListener('change', () => {
    const raw = PRESETS[presetSel.value];
    if (!raw) return;
    // Push the preset toward the extremes for a more distinct shape. The sliders
    // reflect the contrasted values so what you see is what's applied.
    const preset = contrastMood(raw);
    for (const f of FEATURES) {
      const v = f.key === 'bpm' ? Math.round(preset[f.key]) : preset[f.key];
      state[f.key] = v;
      sliderEls[f.key].value = v;
      valueEls[f.key].textContent = f.key === 'bpm' ? v : v.toFixed(2);
    }
    applyMood();
    if (!revealTriggered) { revealTriggered = true; onReveal?.(); }
    presetSel.value = '';
  });

  footer.appendChild(presetSel);
  footer.appendChild(resetBtn);
  panel.appendChild(footer);

  document.body.appendChild(panel);

  // ── Toggle with D ─────────────────────────────────────────────────────────

  window.addEventListener('keydown', e => {
    if (e.key === 'd' || e.key === 'D') {
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    }
  });

  // ── Apply mood to uniforms ────────────────────────────────────────────────

  function applyMood() {
    onChange?.({ ...state });
  }

  return { panel, applyMood };
}
