// MOSSVEIL — tool-decals.js : persistent mark / decal editor (Edit ▸ World).  Roadmap #72.
// Authors the lingering ground marks (src/decals.js -> data/decals.js): the KIND LIBRARY (each a
// procedural texture + colour + size/jitter + alpha + lifetime + fade-in/out + rotation + blend),
// the EVENT BINDINGS (which game event — enemy death, boss death, hard landing, bolt-on-wall —
// leaves which kind, or none), and the globals (enabled · max live · global size). A LIVE PREVIEW
// paints the selected kind and loops its fade so you SEE how it looks and how long it lasts. Edits
// the overlay through the data layer; applies immediately (new marks use the new tuning).
(function () {
  const T = G.Tools, DEC = G.Decals;
  if (!T || !DEC || !DEC.exportDefaults) return;
  const clone = o => JSON.parse(JSON.stringify(o));
  const EVENT_LABELS = { enemyDeath: 'Enemy death', bossDeath: 'Boss death', playerLand: 'Hard landing', fireballHit: 'Bolt hits wall' };
  let data = null, dirty = false, bodyEl = null, api = null, pcv = null, sim = null, sel = null;

  const MT = T.decals = {
    get state() { return { data, dirty }; },
    getWorking() { return data; },
    load() { data = clone(DEC.exportCurrent()); dirty = false; if (!sel || !data.kinds[sel]) sel = Object.keys(data.kinds)[0] || null; },
    revert() { data = clone(DEC.exportDefaults()); sel = Object.keys(data.kinds)[0] || null; dirty = true; if (bodyEl) render(); },
    applyToEngine() { DEC.applyData(clone(data)); },
    async save() { await api.data.save('decals', 'DECALS_DATA', data); MT.applyToEngine(); dirty = false; if (api) api.toast('Decals saved'); if (bodyEl) render(); return true; },
    setGlobal(k, v) { data[k] = v; dirty = true; },
    setKind(id, k, v) { if (data.kinds[id]) { data.kinds[id][k] = v; dirty = true; } },
    setEvent(ev, kindId) { data.events[ev] = kindId; dirty = true; },
    select(id) { if (data.kinds[id]) { sel = id; if (bodyEl) render(); } },
    addKind() {
      let base = 'mark', i = 1, id = base + i;
      while (data.kinds[id]) { i++; id = base + i; }
      data.kinds[id] = DEC.cleanKind({ tex: 'stain', color: 0x808890, size: 1.2, sizeVar: 0.3, alpha: 0.55, life: 8, fadeIn: 0.15, fadeOut: 2, rot: 'random', blend: 'normal', yOff: 0 });
      sel = id; dirty = true; if (bodyEl) render();
    },
    removeKind(id) {
      if (!data.kinds[id]) return;
      delete data.kinds[id];
      // any event pointing at the removed kind falls back to none
      for (const ev in data.events) if (data.events[ev] === id) data.events[ev] = '';
      if (sel === id) sel = Object.keys(data.kinds)[0] || null;
      dirty = true; if (bodyEl) render();
    },
    openInTool() { return T.openTool('decals'); }
  };

  // ===================== live mark preview (paints the selected kind & loops its fade) =====================
  const TAU = Math.PI * 2;
  function seeded(seed) { let s = (seed * 2654435761) >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function rgb(hex) { return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255]; }
  function paintMark(cx, type, ox, oy, R, c, a) {
    const rnd = seeded(({ scorch: 1, stain: 2, splat: 3, ring: 4, scuff: 5, crack: 6 })[type] || 9);
    const rs = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',';
    if (type === 'scorch') {
      for (let k = 0; k < 3; k++) {
        cx.beginPath(); const lobes = 9;
        for (let i = 0; i <= lobes; i++) { const ang = i / lobes * TAU, r = R * (0.7 + 0.3 * rnd()) * (1 - k * 0.13), x = ox + Math.cos(ang) * r, y = oy + Math.sin(ang) * r; i ? cx.lineTo(x, y) : cx.moveTo(x, y); }
        cx.closePath(); const g = cx.createRadialGradient(ox, oy, 2, ox, oy, R * 1.05);
        g.addColorStop(0, rs + (a * (0.6 - k * 0.14)) + ')'); g.addColorStop(1, rs + '0)'); cx.fillStyle = g; cx.fill();
      }
      for (let i = 0; i < 40; i++) { const ang = rnd() * TAU, r = rnd() * R; cx.fillStyle = rs + (a * (0.3 + rnd() * 0.5)) + ')'; cx.beginPath(); cx.arc(ox + Math.cos(ang) * r, oy + Math.sin(ang) * r, rnd() * 2.4, 0, TAU); cx.fill(); }
    } else if (type === 'stain') {
      const g = cx.createRadialGradient(ox, oy, 2, ox, oy, R * 1.05);
      g.addColorStop(0, rs + (a * 0.85) + ')'); g.addColorStop(0.6, rs + (a * 0.4) + ')'); g.addColorStop(1, rs + '0)'); cx.fillStyle = g; cx.beginPath(); cx.arc(ox, oy, R * 1.05, 0, TAU); cx.fill();
    } else if (type === 'splat') {
      cx.fillStyle = rs + (a * 0.9) + ')'; cx.beginPath(); const lobes = 8;
      for (let i = 0; i <= lobes; i++) { const ang = i / lobes * TAU, r = R * 0.62 * (0.7 + 0.5 * rnd()), x = ox + Math.cos(ang) * r, y = oy + Math.sin(ang) * r; i ? cx.lineTo(x, y) : cx.moveTo(x, y); }
      cx.closePath(); cx.fill();
      for (let i = 0; i < 11; i++) { const ang = rnd() * TAU, r = R * (0.7 + rnd() * 0.45), rad = R * (0.05 + rnd() * 0.12); cx.fillStyle = rs + (a * (0.5 + rnd() * 0.4)) + ')'; cx.beginPath(); cx.arc(ox + Math.cos(ang) * r, oy + Math.sin(ang) * r, rad, 0, TAU); cx.fill(); }
    } else if (type === 'ring') {
      for (let k = 0; k < 2; k++) { cx.strokeStyle = rs + (a * (0.8 - k * 0.34)) + ')'; cx.lineWidth = R * (0.11 - k * 0.045); cx.beginPath(); cx.arc(ox, oy, R * (0.66 + k * 0.22), 0, TAU); cx.stroke(); }
    } else if (type === 'scuff') {
      cx.save(); cx.translate(ox, oy); cx.scale(1.7, 0.5);
      const g = cx.createRadialGradient(0, 0, 2, 0, 0, R); g.addColorStop(0, rs + (a * 0.6) + ')'); g.addColorStop(1, rs + '0)'); cx.fillStyle = g; cx.beginPath(); cx.arc(0, 0, R, 0, TAU); cx.fill(); cx.restore();
      for (let i = 0; i < 16; i++) { const x = ox + (rnd() - 0.5) * R * 1.7, y = oy + (rnd() - 0.5) * R * 0.45; cx.fillStyle = rs + (a * (0.25 + rnd() * 0.4)) + ')'; cx.fillRect(x, y, rnd() * R * 0.25, 1.6); }
    } else if (type === 'crack') {
      cx.strokeStyle = rs + (a * 0.85) + ')'; cx.lineCap = 'round'; const arms = 11;
      for (let i = 0; i < arms; i++) { let x = ox, y = oy; const a0 = i / arms * TAU + rnd() * 0.35, len = R * (0.75 + rnd() * 0.45); cx.lineWidth = 2.4; cx.beginPath(); cx.moveTo(x, y); for (let s = 0; s < 4; s++) { const aa = a0 + (rnd() - 0.5) * 0.5; x += Math.cos(aa) * len / 4; y += Math.sin(aa) * len / 4; cx.lineTo(x, y); } cx.stroke(); }
      const g = cx.createRadialGradient(ox, oy, 2, ox, oy, R * 0.5); g.addColorStop(0, rs + (a * 0.7) + ')'); g.addColorStop(1, rs + '0)'); cx.fillStyle = g; cx.beginPath(); cx.arc(ox, oy, R * 0.5, 0, TAU); cx.fill();
    }
  }
  function frame(now) {
    if (!pcv || !document.body.contains(pcv)) { sim = null; return; }
    const dt = Math.min(0.05, (now - sim.last) / 1000 || 0.016); sim.last = now; sim.t += dt;
    draw(sim.t); requestAnimationFrame(frame);
  }
  function draw(t) {
    if (!pcv) return;
    const cx = pcv.getContext('2d'), W = pcv.width, H = pcv.height;
    const grd = cx.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, '#1a2520'); grd.addColorStop(1, '#0d1512');
    cx.globalAlpha = 1; cx.fillStyle = grd; cx.fillRect(0, 0, W, H);
    // a hint of a surface line
    cx.strokeStyle = 'rgba(120,150,130,0.25)'; cx.lineWidth = 1; cx.beginPath(); cx.moveTo(0, H * 0.62); cx.lineTo(W, H * 0.62); cx.stroke();
    const k = sel && data.kinds[sel];
    if (k) {
      // loop the kind's real fade (sped so long-lived marks still animate): in -> hold -> out
      const inT = Math.max(0.001, k.fadeIn), outT = Math.max(0.001, k.fadeOut);
      const visible = Math.max(0.6, Math.min(k.life, inT + outT + 1.4));   // shown window, capped for the loop
      const loop = (t * Math.max(0.4, 3 / visible)) % 1, lt = loop * visible;
      let a = k.alpha;
      if (lt < inT) a *= lt / inT; else if (lt > visible - outT) a *= (visible - lt) / outT;
      a = Math.max(0, a);
      const R = Math.min(W, H) * 0.34 * Math.min(2.2, k.size / 1.6) * (k.blend === 'additive' ? 1 : 1);
      if (k.blend === 'additive') cx.globalCompositeOperation = 'lighter';
      paintMark(cx, k.tex, W / 2, H * 0.5, R, rgb(k.color), a);
      cx.globalCompositeOperation = 'source-over';
      cx.fillStyle = 'rgba(230,240,220,0.9)'; cx.font = '12px monospace'; cx.textAlign = 'left'; cx.textBaseline = 'top';
      cx.fillText(sel + '  ·  ' + k.tex + '  ·  life ' + k.life + 's', 8, 6);
      cx.fillStyle = 'rgba(200,220,235,0.6)'; cx.fillText('looping its fade-in → hold → fade-out', 8, H - 16);
    } else {
      cx.fillStyle = 'rgba(220,220,220,0.7)'; cx.font = '12px monospace'; cx.textAlign = 'center'; cx.fillText('no kind selected', W / 2, H / 2);
    }
  }
  function startSim() { sim = { t: 0, last: performance.now() }; draw(0); requestAnimationFrame(frame); }

  function el(t, a, p, x) { return api.el(t, a, p, x); }

  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column';
    const head = el('div', { style: 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line)' }, bodyEl);
    el('button', { class: 'tbtn play', onclick: () => MT.save().catch(e => api.toast('Save failed: ' + e.message)) }, head, '💾 Save');
    el('button', { class: 'tbtn', onclick: () => { if (confirm('Reset all decals to defaults?')) MT.revert(); } }, head, '↺ Revert');
    el('span', { class: 'tc-mut' }, head, dirty ? '● unsaved' : 'saved ✓');
    el('div', { style: 'flex:1' }, head);
    el('span', { class: 'tc-mut' }, head, 'new marks use the new tuning');

    const grid = el('div', { style: 'flex:1;display:grid;grid-template-columns:1fr 420px;gap:0;min-height:0' }, bodyEl);
    const ctl = el('div', { style: 'overflow:auto;padding:14px 16px;display:flex;flex-direction:column;gap:16px;min-height:0;max-width:620px' }, grid);
    const side = el('div', { style: 'border-left:1px solid var(--line);padding:14px;display:flex;flex-direction:column;gap:8px;overflow:auto' }, grid);

    // globals
    const sg = section(ctl, '⚙ Global', 'Marks are flat textured quads that linger where things happen, then fade. Cap recycles the oldest once exceeded.');
    const gr = el('div', { class: 'tc-row' }, sg);
    const cb = el('input', { type: 'checkbox' }, gr); cb.checked = data.enabled !== false;
    cb.addEventListener('change', () => { MT.setGlobal('enabled', cb.checked); });
    el('label', {}, gr, 'Enabled');
    gslider(sg, 'Max live marks', 'cap', 1, 300, 1);
    gslider(sg, 'Global size', 'scale', 0.2, 4, 0.05);

    // event bindings
    const se = section(ctl, '🎯 Event bindings', 'Which game event leaves which mark. Set to “(none)” to suppress a mark for that event.');
    Object.keys(data.events).forEach(ev => eventRow(se, ev));

    // kinds
    const sk = section(ctl, '🩹 Mark kinds', 'The library of mark types. Pick a kind to preview it on the right. Texture, colour, size & jitter, opacity, lifetime, fade, rotation and blend are all yours.');
    Object.keys(data.kinds).forEach(id => kindCard(sk, id));
    el('button', { class: 'tbtn', style: 'align-self:flex-start;margin-top:4px', onclick: () => MT.addKind() }, sk, '➕ Add kind');

    el('div', { class: 'tc-mut', style: 'align-self:flex-start' }, side, 'Live mark preview');
    pcv = el('canvas', { width: '380', height: '220', style: 'border:1px solid var(--line);border-radius:6px;background:#0d1512;max-width:100%' }, side);
    el('div', { class: 'tc-mut', style: 'font-size:11px' }, side, 'Shows the selected kind painted in its colour, looping its real fade-in → hold → fade-out so you can judge look & lifetime.');
    startSim();
  }

  function eventRow(parent, ev) {
    const r = el('div', { class: 'tc-row' }, parent);
    el('label', { style: 'flex:1' }, r, EVENT_LABELS[ev] || ev);
    const seln = el('select', {}, r);
    el('option', { value: '' }, seln, '(none)');
    Object.keys(data.kinds).forEach(id => el('option', { value: id }, seln, id));
    seln.value = data.events[ev] || '';
    seln.addEventListener('change', () => MT.setEvent(ev, seln.value));
  }

  function kindCard(parent, id) {
    const k = data.kinds[id];
    const box = el('div', { style: 'border:1px solid ' + (sel === id ? 'var(--accent,#6cf)' : 'var(--line)') + ';border-radius:6px;padding:8px 10px;display:flex;flex-direction:column;gap:6px' }, parent);
    const top = el('div', { style: 'display:flex;align-items:center;gap:6px' }, box);
    el('button', { class: 'tbtn', style: 'padding:1px 8px', title: 'preview this kind', onclick: () => MT.select(id) }, top, sel === id ? '◉' : '○');
    el('span', { style: 'font-weight:600;font-size:13px' }, top, id);
    el('div', { style: 'flex:1' }, top);
    el('button', { class: 'tbtn', style: 'padding:1px 7px', title: 'remove kind', onclick: () => { if (confirm('Remove mark kind “' + id + '”?')) MT.removeKind(id); } }, top, '✕');

    const row1 = el('div', { class: 'tc-row' }, box);
    el('label', { style: 'flex:1' }, row1, 'Texture');
    const ts = el('select', {}, row1); DEC.TEXES().forEach(tx => el('option', { value: tx }, ts, tx)); ts.value = k.tex;
    ts.addEventListener('change', () => { MT.setKind(id, 'tex', ts.value); if (sel === id) {} });
    el('label', {}, row1, 'Colour');
    const col = el('input', { type: 'color' }, row1); col.value = '#' + (k.color & 0xffffff).toString(16).padStart(6, '0');
    col.addEventListener('input', () => MT.setKind(id, 'color', parseInt(col.value.slice(1), 16)));

    kslider(box, id, 'Size', 'size', 0.1, 8, 0.05);
    kslider(box, id, 'Size jitter', 'sizeVar', 0, 4, 0.05);
    kslider(box, id, 'Opacity', 'alpha', 0, 1, 0.01);
    kslider(box, id, 'Lifetime (s)', 'life', 0.2, 60, 0.1);
    kslider(box, id, 'Fade in (s)', 'fadeIn', 0, 10, 0.02);
    kslider(box, id, 'Fade out (s)', 'fadeOut', 0, 20, 0.05);
    kslider(box, id, 'Y offset', 'yOff', -3, 3, 0.05);

    const row2 = el('div', { class: 'tc-row' }, box);
    el('label', { style: 'flex:1' }, row2, 'Rotation');
    const rs = el('select', {}, row2); DEC.ROTS().forEach(rt => el('option', { value: rt }, rs, rt)); rs.value = k.rot;
    rs.addEventListener('change', () => MT.setKind(id, 'rot', rs.value));
    el('label', {}, row2, 'Blend');
    const bs = el('select', {}, row2); ['normal', 'additive'].forEach(bl => el('option', { value: bl }, bs, bl)); bs.value = k.blend;
    bs.addEventListener('change', () => { MT.setKind(id, 'blend', bs.value); });
  }

  function kslider(p, id, label, key, min, max, step) {
    const r = el('div', { class: 'tc-row' }, p); el('label', { style: 'flex:1' }, r, label);
    const inp = el('input', { type: 'range', min: '' + min, max: '' + max, step: '' + step }, r); inp.value = data.kinds[id][key];
    const nm = el('input', { type: 'number', min: '' + min, max: '' + max, step: '' + step, style: 'width:64px' }, r); nm.value = data.kinds[id][key];
    inp.addEventListener('input', () => { nm.value = inp.value; MT.setKind(id, key, +inp.value); });
    nm.addEventListener('change', () => { inp.value = nm.value; MT.setKind(id, key, +nm.value); });
  }
  function gslider(p, label, key, min, max, step) {
    const r = el('div', { class: 'tc-row' }, p); el('label', { style: 'flex:1' }, r, label);
    const inp = el('input', { type: 'range', min: '' + min, max: '' + max, step: '' + step }, r); inp.value = data[key];
    const nm = el('input', { type: 'number', min: '' + min, max: '' + max, step: '' + step, style: 'width:64px' }, r); nm.value = data[key];
    inp.addEventListener('input', () => { nm.value = inp.value; MT.setGlobal(key, +inp.value); });
    nm.addEventListener('change', () => { inp.value = nm.value; MT.setGlobal(key, +nm.value); });
  }
  function section(parent, title, desc) {
    const box = el('div', {}, parent);
    el('h3', { style: 'margin:0 0 2px;font-size:14px' }, box, title);
    if (desc) el('div', { class: 'tc-mut', style: 'margin-bottom:6px;font-size:11px;line-height:1.4' }, box, desc);
    return box;
  }

  T.registerTool({
    id: 'decals', label: 'Decals & marks', icon: '🩸', group: 'World',
    sub: 'scorch · splat · scuff · lifetime',
    build(host, a) { api = a; bodyEl = host; if (!data) MT.load(); render(); }
  });
  if (T.roadmapDone) T.roadmapDone(72);
})();
