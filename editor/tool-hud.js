// MOSSVEIL — tool-hud.js : HUD layout & colours editor (Edit ▸ Systems).  Roadmap #29.
// Authors where the HUD pieces sit and what colour they are (src/hud.js -> data/hud.js): the soul orb,
// the row of masks, and the Glimmer counter. A live preview re-draws a representative HUD (5 masks, a
// half-full orb, a sample Glimmer count) at 1:1 from the working values as you drag the sliders, so you
// can position it without launching the game. Edits the overlay through the data layer; applies on next
// Play. Fully offline, editor-only. Defaults are byte-identical to the old constants in src/ui.js.
(function () {
  const T = G.Tools, H = G.HUD;
  if (!T || !H || !H.exportDefaults) return;
  const clone = o => JSON.parse(JSON.stringify(o));
  const serif = 'Georgia, "Times New Roman", serif';
  let data = null, dirty = false, bodyEl = null, api = null, pcv = null;

  const MT = T.hud = {
    get state() { return { data, dirty }; },
    getWorking() { return data; },
    load() { data = clone(H.exportCurrent()); dirty = false; },
    revert() { data = clone(H.exportDefaults()); dirty = true; if (bodyEl) render(); },
    applyToEngine() { H.applyData(clone(data)); },
    async save() { await api.data.save('hud', 'HUD_DATA', data); MT.applyToEngine(); dirty = false; if (api) api.toast('HUD layout saved'); if (bodyEl) render(); return true; },
    set(group, key, v) { data[group][key] = v; dirty = true; if (pcv) draw(); },
    openInTool() { return T.openTool('hud'); }
  };

  // ---- a faithful-ish miniature of drawHud(), at 1:1, from the working `data` ----
  function maskPath(cx, x, y, s) {
    cx.beginPath();
    cx.moveTo(x, y - s * 0.55);
    cx.bezierCurveTo(x + s * 0.62, y - s * 0.55, x + s * 0.62, y - s * 0.05, x + s * 0.45, y + s * 0.32);
    cx.bezierCurveTo(x + s * 0.3, y + s * 0.62, x, y + s * 0.72, x, y + s * 0.72);
    cx.bezierCurveTo(x, y + s * 0.72, x - s * 0.3, y + s * 0.62, x - s * 0.45, y + s * 0.32);
    cx.bezierCurveTo(x - s * 0.62, y - s * 0.05, x - s * 0.62, y - s * 0.55, x, y - s * 0.55);
    cx.closePath();
  }
  function draw() {
    if (!pcv) return;
    const cx = pcv.getContext('2d'), W = pcv.width, Hh = pcv.height;
    const bg = cx.createLinearGradient(0, 0, 0, Hh); bg.addColorStop(0, '#1a2230'); bg.addColorStop(1, '#0c1118');
    cx.fillStyle = bg; cx.fillRect(0, 0, W, Hh);
    const TAU = Math.PI * 2, s = data.soul, m = data.masks, g = data.glimmer;
    // soul orb (half full)
    cx.save();
    cx.beginPath(); cx.arc(s.x, s.y, s.r, 0, TAU); cx.fillStyle = 'rgba(8,14,16,0.75)'; cx.fill();
    cx.save(); cx.beginPath(); cx.arc(s.x, s.y, s.r - 2.5, 0, TAU); cx.clip();
    const lvl = s.y + (s.r - 2.5) - 0.5 * 2 * (s.r - 2.5);
    const sg = cx.createLinearGradient(0, lvl, 0, s.y + s.r); sg.addColorStop(0, s.fillTop); sg.addColorStop(1, s.fillBot);
    cx.fillStyle = sg; cx.fillRect(s.x - s.r, lvl, s.r * 2, s.r * 2); cx.restore();
    cx.lineWidth = 3; cx.strokeStyle = s.fillTop; cx.beginPath(); cx.arc(s.x, s.y, s.r, 0, TAU); cx.stroke();
    cx.restore();
    // masks (5, last one empty)
    for (let i = 0; i < 5; i++) {
      const mx = m.x + i * m.spacing, my = m.y, alive = i < 4;
      maskPath(cx, mx, my, m.size);
      if (alive) { cx.fillStyle = m.color; cx.shadowColor = 'rgba(233,228,212,0.7)'; cx.shadowBlur = 8; cx.fill(); cx.shadowBlur = 0; }
      else { cx.fillStyle = 'rgba(10,16,18,0.6)'; cx.fill(); cx.lineWidth = 1.5; cx.strokeStyle = 'rgba(180,190,195,0.35)'; cx.stroke(); }
    }
    // glimmer
    cx.textAlign = 'left'; cx.textBaseline = 'middle';
    cx.beginPath(); cx.arc(g.x, g.y, g.dotR, 0, TAU); cx.fillStyle = g.dotColor; cx.shadowColor = 'rgba(255,226,138,0.7)'; cx.shadowBlur = 8; cx.fill(); cx.shadowBlur = 0;
    cx.fillStyle = g.textColor; cx.font = g.fontSize + 'px ' + serif; cx.fillText('120', g.textX, g.textY);
  }

  function el(t, a, p, x) { return api.el(t, a, p, x); }
  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column';
    const head = el('div', { style: 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line)' }, bodyEl);
    el('button', { class: 'tbtn play', onclick: () => MT.save().catch(e => api.toast('Save failed: ' + e.message)) }, head, '💾 Save');
    el('button', { class: 'tbtn', onclick: () => { if (confirm('Reset the HUD layout to defaults?')) MT.revert(); } }, head, '↺ Revert');
    el('span', { class: 'tc-mut' }, head, dirty ? '● unsaved' : 'saved ✓');
    el('div', { style: 'flex:1' }, head);
    el('span', { class: 'tc-mut' }, head, 'applies on next Play');

    const grid = el('div', { style: 'flex:1;display:grid;grid-template-columns:1fr 420px;gap:0;min-height:0' }, bodyEl);
    const ctl = el('div', { style: 'overflow:auto;padding:12px 16px;display:flex;flex-direction:column;gap:14px;min-height:0' }, grid);
    const prev = el('div', { style: 'border-left:1px solid var(--line);padding:14px;display:flex;flex-direction:column;align-items:center;gap:8px' }, grid);

    // ---- soul orb ----
    const s1 = section(ctl, '◔ Soul orb');
    numRow(s1, 'x', data.soul.x, 0, 400, 1, v => MT.set('soul', 'x', v));
    numRow(s1, 'y', data.soul.y, 0, 300, 1, v => MT.set('soul', 'y', v));
    numRow(s1, 'radius', data.soul.r, 6, 80, 1, v => MT.set('soul', 'r', Math.max(4, v)));
    colorRow(s1, 'fill top', data.soul.fillTop, v => MT.set('soul', 'fillTop', v));
    colorRow(s1, 'fill bottom', data.soul.fillBot, v => MT.set('soul', 'fillBot', v));

    // ---- masks ----
    const s2 = section(ctl, '🩷 Masks (health)');
    numRow(s2, 'start x', data.masks.x, 0, 400, 1, v => MT.set('masks', 'x', v));
    numRow(s2, 'y', data.masks.y, 0, 300, 1, v => MT.set('masks', 'y', v));
    numRow(s2, 'spacing', data.masks.spacing, 12, 80, 1, v => MT.set('masks', 'spacing', v));
    numRow(s2, 'size', data.masks.size, 4, 40, 1, v => MT.set('masks', 'size', Math.max(2, v)));
    colorRow(s2, 'colour', data.masks.color, v => MT.set('masks', 'color', v));

    // ---- glimmer ----
    const s3 = section(ctl, '✦ Glimmer counter');
    numRow(s3, 'dot x', data.glimmer.x, 0, 400, 1, v => MT.set('glimmer', 'x', v));
    numRow(s3, 'dot y', data.glimmer.y, 0, 300, 1, v => MT.set('glimmer', 'y', v));
    numRow(s3, 'dot radius', data.glimmer.dotR, 0, 20, 1, v => MT.set('glimmer', 'dotR', Math.max(0, v)));
    numRow(s3, 'text x', data.glimmer.textX, 0, 400, 1, v => MT.set('glimmer', 'textX', v));
    numRow(s3, 'text y', data.glimmer.textY, 0, 300, 1, v => MT.set('glimmer', 'textY', v));
    numRow(s3, 'font size', data.glimmer.fontSize, 8, 40, 1, v => MT.set('glimmer', 'fontSize', Math.max(6, v)));
    colorRow(s3, 'dot colour', data.glimmer.dotColor, v => MT.set('glimmer', 'dotColor', v));
    textRow(s3, 'text colour', data.glimmer.textColor, v => MT.set('glimmer', 'textColor', v));

    // ---- preview ----
    el('div', { class: 'tc-mut', style: 'align-self:flex-start' }, prev, 'Live preview (top-left corner, 1:1)');
    pcv = el('canvas', { width: '400', height: '180', style: 'border:1px solid var(--line);border-radius:6px;background:#0c1118;max-width:100%' }, prev);
    el('div', { class: 'tc-mut', style: 'font-size:11px;align-self:flex-start' }, prev, 'Orb shown half-full; 5 masks (last empty); sample count 120.');
    draw();
  }

  function section(parent, title) {
    const box = el('div', {}, parent);
    el('h3', { style: 'margin:0 0 6px;font-size:13px' }, box, title);
    return box;
  }
  function numRow(p, label, v, min, max, step, onCh) {
    const r = el('div', { class: 'tc-row' }, p); el('label', {}, r, label);
    const inp = el('input', { type: 'range', min, max, step }, r); inp.value = v;
    const num = el('input', { type: 'number', min, max, step, style: 'width:64px' }, r); num.value = v;
    inp.addEventListener('input', () => { num.value = inp.value; onCh(+inp.value); });
    num.addEventListener('change', () => { inp.value = num.value; onCh(+num.value); });
  }
  function colorRow(p, label, v, onCh) {
    const r = el('div', { class: 'tc-row' }, p); el('label', {}, r, label);
    const inp = el('input', { type: 'color' }, r); inp.value = /^#[0-9a-f]{6}$/i.test(v) ? v : '#ffffff';
    const tx = el('input', { type: 'text', style: 'width:90px' }, r); tx.value = v;
    inp.addEventListener('input', () => { tx.value = inp.value; onCh(inp.value); });
    tx.addEventListener('change', () => { if (/^#[0-9a-f]{6}$/i.test(tx.value)) inp.value = tx.value; onCh(tx.value); });
  }
  function textRow(p, label, v, onCh) {
    const r = el('div', { class: 'tc-row' }, p); el('label', {}, r, label);
    const tx = el('input', { type: 'text', style: 'flex:1' }, r); tx.value = v;
    tx.addEventListener('change', () => onCh(tx.value));
  }

  T.registerTool({
    id: 'hud', label: 'HUD layout & colours', icon: '🖥', group: 'Systems',
    sub: 'soul orb · masks · Glimmer — position & recolour',
    build(host, a) { api = a; bodyEl = host; if (!data) MT.load(); render(); }
  });
  if (T.roadmapDone) T.roadmapDone(29);
})();
