// MOSSVEIL — tool-fx.js : the in-engine Particle / FX editor (Edit ▸ World).
// The 12 built-in bursts in src/fx.js stay exactly as they are; this tool authors NEW burst ids as
// parametric emitter specs saved to data/fx.js (window.G.FX_DATA). Any new id is then usable
// anywhere FX.burst(name, x, y) is called (cutscene fx events, particle markers, code). It includes
// a CPU canvas preview because the real GPU particles render behind the modal. Offline, editor-only.
(function () {
  const T = G.Tools, FX = G.FX;
  if (!T || !FX || !FX.exportDefaults) return;
  const clone = o => JSON.parse(JSON.stringify(o));
  const rnd = (v, d) => Array.isArray(v) ? (v[0] + Math.random() * (v[1] - v[0])) : (typeof v === 'number' ? v : d);
  const hex = v => '#' + ((v >>> 0) & 0xffffff).toString(16).padStart(6, '0');
  const NEW_EMITTER = () => ({ glow: true, count: 14, dist: 'radial', speed: [3, 8], life: [0.3, 0.7], size: [0.15, 0.35], sizeEnd: 0.05, color: 0xffd060, alpha: [0.7, 1], grav: 6, drag: 2, swirl: [0, 0] });
  const NEW_BURST = () => ({ emitters: [NEW_EMITTER()] });

  // ---------------- controller (test API: G.Tools.fx) ----------------
  let data = null, sel = null, dirty = false, bodyEl = null, api = null;
  const ids = () => Object.keys(data.bursts);
  const MT = T.fx = {
    get state() { return { data, sel, dirty }; },
    getWorking() { return data; },
    load() { data = clone(FX.exportCurrent()); sel = ids()[0] || null; dirty = false; },
    applyToEngine() { FX.applyData(clone(data)); },
    async save() { await api.data.save('fx', 'FX_DATA', data); MT.applyToEngine(); dirty = false; if (api) api.toast('Effects saved · ' + ids().length + ' custom'); if (bodyEl) render(); return true; },
    select(k) { sel = k; if (bodyEl) render(); },
    uniqueId(base) { base = (base || 'effect').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'effect'; let n = base, i = 1; while (data.bursts[n]) n = base + (++i); return n; },
    addBurst(srcSpec, baseName) { const n = MT.uniqueId(baseName || 'effect'); data.bursts[n] = srcSpec ? clone(srcSpec) : NEW_BURST(); sel = n; dirty = true; if (bodyEl) render(); return n; },
    duplicateBurst(k) { return MT.addBurst(data.bursts[k || sel]); },
    cloneBuiltin(name) { return MT.addBurst(BUILTIN_TEMPLATES[name] || NEW_BURST(), name); },
    removeBurst(k) { k = k || sel; delete data.bursts[k]; sel = ids()[0] || null; dirty = true; if (bodyEl) render(); return true; },
    renameBurst(k, nk) { nk = (nk || '').trim(); if (!nk || nk === k || data.bursts[nk]) return false; data.bursts[nk] = data.bursts[k]; delete data.bursts[k]; if (sel === k) sel = nk; dirty = true; return true; },
    addEmitter() { data.bursts[sel].emitters.push(NEW_EMITTER()); dirty = true; if (bodyEl) render(); },
    removeEmitter(i) { data.bursts[sel].emitters.splice(i, 1); dirty = true; if (bodyEl) render(); },
    setEm(i, key, val) { data.bursts[sel].emitters[i][key] = val; dirty = true; preview(); },
    play() { preview(); if (FX.playSpec && sel) FX.playSpec(data.bursts[sel], 0, 0); },
    openInTool() { return T.openTool('fx'); }
  };
  // rough emitter templates so "clone a built-in" gives a usable starting point
  const BUILTIN_TEMPLATES = {
    spark: { emitters: [{ glow: true, count: 10, dist: 'radial', speed: [4, 11], life: [0.12, 0.3], size: [0.12, 0.3], color: 0xfff4c8, grav: 12, drag: 2 }] },
    soul: { emitters: [{ glow: true, count: 7, dist: 'radial', speed: [2, 6], vyBias: 2, life: [0.5, 0.9], size: [0.18, 0.4], color: 0xcfeaff, drag: 3.5, home: true, alpha: 0.9 }] },
    death: { emitters: [{ glow: true, count: 36, dist: 'radial', speed: [2, 12], life: [0.4, 1.2], size: [0.2, 0.55], color: 0xcfeaff, drag: 2.5 }, { glow: false, count: 10, dist: 'box', spreadX: 0, spreadY: 0, vx: [-3, 3], vy: [1, 5], life: [0.5, 1], size: [0.4, 0.8], sizeEnd: 1.4, color: 0x2a3038, alpha: 0.5, grav: 2 }] },
    dust: { emitters: [{ glow: false, count: 6, dist: 'box', spreadX: 0.3, spreadY: 0.2, vx: [-1.5, 1.5], vy: [0.5, 2], life: [0.3, 0.7], size: [0.25, 0.5], sizeEnd: 0.9, color: 0x5a6a60, alpha: 0.28, drag: 2 }] }
  };

  // ---------------- CPU canvas preview ----------------
  let pv = [], pvCanvas = null, pvCtx = null, loopOn = false, lastT = 0;
  const SCALE = 14;   // world units -> canvas px
  function preview() {
    if (!pvCanvas || !sel) return;
    const spec = data.bursts[sel]; pv = [];
    const cx = pvCanvas.width / 2, cy = pvCanvas.height * 0.55;
    (spec.emitters || []).forEach(em => {
      const n = Math.min(120, Math.max(1, em.count | 0) || 8);
      for (let i = 0; i < n; i++) {
        let x = cx, y = cy, vx = 0, vy = 0;
        if (em.dist === 'ring' || em.dist === 'radial') {
          const a = em.dist === 'ring' ? (i / n) * 6.283 : Math.random() * 6.283, sp = rnd(em.speed, 4);
          vx = Math.cos(a) * sp; vy = Math.sin(a) * sp;
        } else { x = cx + rnd([-(em.spreadX || 0), em.spreadX || 0], 0) * SCALE; y = cy + rnd([-(em.spreadY || 0), em.spreadY || 0], 0) * SCALE; vx = rnd(em.vx, 0); vy = rnd(em.vy, 0); }
        vy += em.vyBias || 0;
        const life = rnd(em.life, 0.6);
        pv.push({ x, y, vx: vx * SCALE, vy: -vy * SCALE, life, maxLife: life, s0: rnd(em.size, 0.2), s1: em.sizeEnd != null ? em.sizeEnd : rnd(em.size, 0.2) * 0.3, grav: (em.grav || 0) * SCALE, drag: em.drag || 0, a0: em.alpha != null ? rnd(em.alpha, 1) : 1, color: hex(em.color != null ? em.color : 0xffffff), glow: !!em.glow, swirl: rnd(em.swirl, 0) });
      }
    });
  }
  function pvStep(dt) {
    for (const p of pv) {
      p.life -= dt; if (p.life <= 0) continue;
      p.vy += p.grav * dt;
      if (p.drag) { const d = Math.max(0, 1 - p.drag * dt); p.vx *= d; p.vy *= d; }
      if (p.swirl) { const a = p.swirl * dt, nx = p.vx * Math.cos(a) - p.vy * Math.sin(a); p.vy = p.vx * Math.sin(a) + p.vy * Math.cos(a); p.vx = nx; }
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    pv = pv.filter(p => p.life > 0);
  }
  function pvDraw() {
    const w = pvCanvas.width, h = pvCanvas.height;
    pvCtx.globalCompositeOperation = 'source-over';
    pvCtx.fillStyle = '#0c1016'; pvCtx.fillRect(0, 0, w, h);
    for (const p of pv) {
      const t = 1 - p.life / p.maxLife, sz = (p.s0 + (p.s1 - p.s0) * t) * SCALE;
      const al = p.a0 * (t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85);
      pvCtx.globalCompositeOperation = p.glow ? 'lighter' : 'source-over';
      pvCtx.globalAlpha = Math.max(0, Math.min(1, al));
      pvCtx.fillStyle = p.color;
      pvCtx.beginPath(); pvCtx.arc(p.x, p.y, Math.max(0.5, sz), 0, 6.283); pvCtx.fill();
    }
    pvCtx.globalAlpha = 1; pvCtx.globalCompositeOperation = 'source-over';
  }
  function startLoop() {
    if (loopOn) return; loopOn = true; lastT = performance.now();
    const tick = now => {
      const ov = document.getElementById('toolHost');
      if (!ov || !ov.classList.contains('on')) { loopOn = false; return; }
      const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
      if (pvCtx) { pvStep(dt); pvDraw(); }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // ---------------- UI ----------------
  function el(t, a, p, x) { return api.el(t, a, p, x); }
  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column';
    const head = el('div', { style: 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line);flex-wrap:wrap' }, bodyEl);
    el('button', { class: 'tbtn play', onclick: () => MT.save().catch(e => api.toast('Save failed: ' + e.message)) }, head, '💾 Save effects');
    el('span', { class: 'tc-mut' }, head, dirty ? '● unsaved' : 'saved ✓');
    el('div', { style: 'flex:1' }, head);
    el('span', { class: 'tc-mut' }, head, 'clone built-in:');
    const bsel = el('select', {}, head); el('option', { value: '' }, bsel, '…');
    (FX.BUILTIN_BURSTS ? FX.BUILTIN_BURSTS() : []).forEach(b => el('option', { value: b }, bsel, b));
    bsel.addEventListener('change', () => { if (bsel.value) MT.cloneBuiltin(bsel.value); });
    const grid = el('div', { style: 'flex:1;display:grid;grid-template-columns:180px 1fr;gap:0;min-height:0' }, bodyEl);
    const left = el('div', { style: 'display:flex;flex-direction:column;border-right:1px solid var(--line);min-height:0' }, grid);
    const list = el('div', { style: 'flex:1;overflow:auto;padding:8px' }, left);
    if (!ids().length) el('div', { class: 'tc-mut', style: 'padding:6px' }, list, 'No custom effects yet. Add one or clone a built-in.');
    ids().forEach(k => {
      const row = el('div', { class: 'tc-pal-item' + (k === sel ? ' sel' : ''), style: 'padding:5px 8px' }, list);
      el('span', {}, row, k);
      row.addEventListener('click', () => MT.select(k));
    });
    const btns = el('div', { style: 'display:flex;gap:4px;padding:8px;border-top:1px solid var(--line)' }, left);
    el('button', { class: 'tbtn', onclick: () => MT.addBurst() }, btns, '+ New');
    el('button', { class: 'tbtn', onclick: () => { if (sel) MT.duplicateBurst(); } }, btns, '⧉');
    el('button', { class: 'tbtn', onclick: () => { if (sel) MT.removeBurst(); } }, btns, '🗑');
    renderBurst(el('div', { style: 'overflow:auto;padding:12px 14px;min-height:0' }, grid));
  }

  function renderBurst(host) {
    // preview canvas always present
    pvCanvas = el('canvas', { width: '420', height: '150', style: 'width:100%;max-width:420px;border:1px solid var(--line);border-radius:6px;background:#0c1016;display:block;margin-bottom:8px' }, host);
    pvCtx = pvCanvas.getContext('2d');
    if (!sel || !data.bursts[sel]) { el('div', { class: 'tc-mut' }, host, 'Create or select an effect.'); return; }
    const top = el('div', { class: 'tc-row' }, host); el('label', {}, top, 'Effect id'); const idInp = el('input', { type: 'text' }, top); idInp.value = sel;
    idInp.addEventListener('change', () => { if (!MT.renameBurst(sel, idInp.value)) { idInp.value = sel; api.toast('Id in use or invalid.'); } else render(); });
    el('button', { class: 'tbtn play', onclick: () => MT.play() }, top, '▶ Play');
    el('div', { class: 'tc-mut', style: 'margin:2px 0 6px' }, host, 'Use this id anywhere FX.burst("' + sel + '", x, y) is called — cutscene FX events, particle markers, logic.');
    data.bursts[sel].emitters.forEach((em, i) => renderEmitter(host, em, i));
    el('button', { class: 'tbtn', style: 'margin-top:6px', onclick: () => MT.addEmitter() }, host, '+ Add emitter');
    preview();
  }

  function renderEmitter(host, em, i) {
    const card = el('div', { class: 'tc-card', style: 'margin:8px 0' }, host);
    const bar = el('div', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:6px' }, card);
    el('span', { class: 'tc-pill planned' }, bar, 'emitter ' + (i + 1));
    el('div', { style: 'flex:1' }, bar);
    el('button', { class: 'tbtn', onclick: () => MT.removeEmitter(i) }, bar, '🗑');
    const g = el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:3px 12px' }, card);
    boolRow(g, 'Additive glow', em.glow, v => MT.setEm(i, 'glow', v));
    numRow(g, 'Count', em.count, 1, 120, 1, v => MT.setEm(i, 'count', v));
    selRow(g, 'Distribution', ['radial', 'ring', 'box'], em.dist || 'radial', v => { MT.setEm(i, 'dist', v); render(); });
    if (em.dist === 'box') {
      numRow(g, 'Spread X', em.spreadX || 0, 0, 3, 0.05, v => MT.setEm(i, 'spreadX', v));
      numRow(g, 'Spread Y', em.spreadY || 0, 0, 3, 0.05, v => MT.setEm(i, 'spreadY', v));
      rangeRow(g, 'Vel X', em.vx || [0, 0], -10, 10, 0.5, v => MT.setEm(i, 'vx', v));
      rangeRow(g, 'Vel Y', em.vy || [0, 0], -10, 10, 0.5, v => MT.setEm(i, 'vy', v));
    } else {
      rangeRow(g, 'Speed', em.speed || [3, 8], 0, 16, 0.5, v => MT.setEm(i, 'speed', v));
      numRow(g, 'Vy bias', em.vyBias || 0, -6, 6, 0.5, v => MT.setEm(i, 'vyBias', v));
    }
    rangeRow(g, 'Life (s)', em.life || [0.3, 0.7], 0.05, 4, 0.05, v => MT.setEm(i, 'life', v));
    rangeRow(g, 'Size', em.size || [0.15, 0.35], 0.02, 1, 0.02, v => MT.setEm(i, 'size', v));
    numRow(g, 'Size end', em.sizeEnd != null ? em.sizeEnd : 0.05, 0, 2, 0.02, v => MT.setEm(i, 'sizeEnd', v));
    colorRow(g, 'Colour', em.color != null ? em.color : 0xffffff, v => MT.setEm(i, 'color', v));
    rangeRow(g, 'Alpha', Array.isArray(em.alpha) ? em.alpha : [em.alpha != null ? em.alpha : 1, em.alpha != null ? em.alpha : 1], 0, 1, 0.05, v => MT.setEm(i, 'alpha', v));
    numRow(g, 'Gravity', em.grav || 0, -24, 24, 0.5, v => MT.setEm(i, 'grav', v));
    numRow(g, 'Drag', em.drag || 0, 0, 6, 0.1, v => MT.setEm(i, 'drag', v));
    rangeRow(g, 'Swirl', em.swirl || [0, 0], -3, 3, 0.1, v => MT.setEm(i, 'swirl', v));
    boolRow(g, 'Home to player', em.home, v => MT.setEm(i, 'home', v));
    numRow(g, 'Dir mult', em.dirMul || 0, 0, 6, 0.5, v => MT.setEm(i, 'dirMul', v));
  }

  // field helpers
  function numRow(p, label, v, min, max, step, onCh) { const r = el('div', { class: 'tc-row', style: 'margin:1px 0' }, p); el('label', { style: 'width:80px' }, r, label); const inp = el('input', { type: 'number', min, max, step }, r); inp.value = v; inp.addEventListener('change', () => onCh(+inp.value)); }
  function boolRow(p, label, v, onCh) { const r = el('div', { class: 'tc-row', style: 'margin:1px 0' }, p); const cb = el('input', { type: 'checkbox' }, r); cb.checked = !!v; el('label', { style: 'width:auto' }, r, label); cb.addEventListener('change', () => onCh(cb.checked)); }
  function selRow(p, label, opts, v, onCh) { const r = el('div', { class: 'tc-row', style: 'margin:1px 0' }, p); el('label', { style: 'width:80px' }, r, label); const s = el('select', {}, r); opts.forEach(o => { const op = el('option', { value: o }, s, o); if (o === v) op.selected = true; }); s.addEventListener('change', () => onCh(s.value)); }
  function colorRow(p, label, v, onCh) { const r = el('div', { class: 'tc-row', style: 'margin:1px 0' }, p); el('label', { style: 'width:80px' }, r, label); const ci = el('input', { type: 'color' }, r); ci.value = hex(v); ci.addEventListener('input', () => onCh(parseInt(ci.value.slice(1), 16))); }
  function rangeRow(p, label, v, min, max, step, onCh) {
    const r = el('div', { class: 'tc-row', style: 'margin:1px 0' }, p); el('label', { style: 'width:80px' }, r, label);
    const a = el('input', { type: 'number', min, max, step, style: 'flex:1;min-width:0' }, r); a.value = v[0];
    el('span', { class: 'tc-mut' }, r, '–');
    const b = el('input', { type: 'number', min, max, step, style: 'flex:1;min-width:0' }, r); b.value = v[1];
    const fire = () => onCh([+a.value, +b.value]);
    a.addEventListener('change', fire); b.addEventListener('change', fire);
  }

  T.registerTool({
    id: 'fx', label: 'Particle / FX editor', icon: '✨', group: 'World',
    sub: 'author new particle-burst effect ids',
    build(host, a) { api = a; bodyEl = host; if (!data) MT.load(); render(); startLoop(); }
  });
  if (T.roadmapDone) T.roadmapDone(17);
})();
