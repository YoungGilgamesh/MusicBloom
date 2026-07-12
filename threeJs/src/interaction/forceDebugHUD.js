export function createForceDebugHUD(getState) {
  const el = document.createElement('div');
  el.id = 'force-debug-hud';
  Object.assign(el.style, {
    position: 'fixed', top: '10px', left: '10px',
    padding: '10px 12px', fontFamily: 'monospace', fontSize: '12px',
    lineHeight: '1.5', color: '#7fff7f',
    background: 'rgba(0,0,0,0.72)',
    border: '1px solid rgba(127,255,127,0.35)',
    borderRadius: '6px', zIndex: '9999',
    pointerEvents: 'none', whiteSpace: 'pre',
  });
  document.body.appendChild(el);

  function tick() {
    const s = getState();
    const c = s.lastCenter;
    const pos = c ? `[${[c.x, c.y, c.z].map((v) => v.toFixed(2)).join(', ')}]` : '—';
    el.textContent = [
      'PAINT DEBUG',
      `zones: ${s.stoneCount}`,
      `last:  ${pos}`,
      `radius: ${s.radius}`,
    ].join('\n');
    requestAnimationFrame(tick);
  }

  tick();
  return { dispose() { el.remove(); } };
}
