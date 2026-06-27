// MOSSVEIL — tool-sfxvar.js : Randomization pools (Edit ▸ Audio).
// Authors the per-play pitch/gain wobble that keeps repeated sound effects from sounding robotic.
// Each SFX can have its own "pool" (± pitch semitones, ± gain), with a global default for sounds
// without one. An animated scatter shows the spread (each dot = one possible play); "Audition ×6"
// fires the real sound several times so you hear it wander. Saves to data/sfxvar.js (G.SFXVAR_DATA);
// the game's playSpec() reads G.SfxVar as the source of truth. Inert (all-zero) = byte-identical.
(function () {
  const T = G.Tools, A = G.Audio, V = G.SfxVar;
  if (!T || !A || !V) return;
  const clone = o => JSON.parse(JSON.stringify(o));
  const DEF = '__default__';                                  // sentinel: the global-default pool
  const AXES = [
    ['pitch', 'Pitch wobble', '± semitones each play', V.range('pitch')],
    ['gain', 'Volume wobble', '± of its loudness', V.range('gain')]
  ];
  const sfxNames = () => Object.keys((A.sfxExportCurrent() || { sfx: {} }).sfx);

  // ---------------- controller (test API: G.Tools.sfxvar) ----------------
  let data = null, sel = DEF, dirty = false, bodyEl = null, api = null, prevTimer = 0;
  function entry() {
    if (sel === DEF) return data.default;
    if (!data.pools[sel]) data.pools[sel] = { pitch: 0, gain: 0 };
    return data.pools[sel];
  }
  // strip all-zero pools so the saved/applied overlay stays minimal & honestly inert
  function normalized() {
    const out = { default: clone(data.default), pools: {} };
    for (const n in data.pools) { const e = data.pools[n]; if (e.pitch || e.gain) out.pools[n] = clone(e); }
    return out;
  }
  const inertFor = name => { const e = (name === DEF) ? data.default : (data.pools[name] || data.default); return !e.pitch && !e.gain; };

  const MT = T.sfxvar = {
    get state() { return { data, sel, dirty }; },
    getWorking() { return data; },
    load() { data = clone(V.exportCurrent()); if (!data.pools) data.pools = {}; sel = DEF; dirty = false; },
    revert() { data = clone(V.exportDefaults()); sel = DEF; dirty = true; if (bodyEl) render(); },
    applyToEngine() { V.applyData(normalized()); },
    async save() { await api.data.save('sfxvar', 'SFXVAR_DATA', normalized()); MT.applyToEngine(); dirty = false; if (api) api.toast('Randomization saved'); if (bodyEl) render(); return true; },
    select(n) { sel = n; if (bodyEl) render(); },
    setField(axis, val) { const r = V.range(axis); entry()[axis] = Math.max(r[0], Math.min(r[1], +val || 0)); dirty = true; },
    clearPool(n) { n = n || sel; if (n === DEF) { data.default = { pitch: 0, gain: 0 }; } else { delete data.pools[n]; } dirty = true; if (bodyEl) render(); },
    // audition: push the working pools to the engine, then fire the sound n times so you hear it vary
    audition(n) {
      if (A.init) { try { A.init(); } catch (_) { } }
      MT.applyToEngine();
      const name = (sel === DEF) ? (sfxNames().indexOf('hit') >= 0 ? 'hit' : sfxNames()[0]) : sel;
      if (!name) return;
      const times = n || 6;
      for (let i = 0; i < times; i++) setTimeout(() => { try { A.sfx(name); } catch (_) { } }, i * 230);
    },
    openInTool() { return T.openTool('sfxvar'); }
  };

  // ---------------- UI ----------------
  function el(t, a, p, x) { return api.el(t, a, p, x); }
  function render() {
    if (prevTimer) { clearInterval(prevTimer); prevTimer = 0; }
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column';
    const head = el('div', { style: 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line)' }, bodyEl);
    el('button', { class: 'tbtn play', onclick: () => MT.save().catch(e => api.toast('Save failed: ' + e.message)) }, head, '💾 Save');
    el('button', { class: 'tbtn', onclick: () => { if (confirm('Clear all randomization back to none? (not saved until you Save)')) MT.revert(); } }, head, '↺ Reset all');
    el('span', { class: 'tc-mut' }, head, dirty ? '● unsaved' : 'saved ✓');
    el('div', { style: 'flex:1' }, head);
    const npool = Object.keys(data.pools).filter(n => data.pools[n].pitch || data.pools[n].gain).length;
    el('span', { class: 'tc-mut' }, head, npool + ' custom pool' + (npool === 1 ? '' : 's'));
    const grid = el('div', { style: 'flex:1;display:grid;grid-template-columns:210px 1fr;gap:0;min-height:0' }, bodyEl);
    // ---- list: global default + every SFX ----
    const left = el('div', { style: 'display:flex;flex-direction:column;border-right:1px solid var(--line);min-height:0' }, grid);
    const list = el('div', { style: 'flex:1;overflow:auto;padding:8px' }, left);
    const addRow = (name, label) => {
      const row = el('div', { class: 'tc-pal-item' + (name === sel ? ' sel' : ''), style: 'padding:5px 8px;display:flex;align-items:center;gap:6px' }, list);
      el('span', {}, row, label);
      if (!inertFor(name)) el('span', { class: 'tc-pill done', style: 'margin-left:auto' }, row, 'varies');
      row.addEventListener('click', () => MT.select(name));
    };
    addRow(DEF, '★ Global default');
    el('div', { class: 'tc-mut', style: 'padding:6px 8px 2px;font-size:11px' }, list, 'Per-sound pools');
    sfxNames().forEach(n => addRow(n, n));
    // ---- editor ----
    const right = el('div', { style: 'overflow:auto;padding:14px 16px;min-height:0' }, grid);
    const title = sel === DEF ? 'Global default' : sel;
    el('div', { style: 'font-weight:600;font-size:15px;margin-bottom:2px' }, right, sel === DEF ? '★ ' + title : '🔊 ' + title);
    el('div', { class: 'tc-mut', style: 'margin-bottom:12px' }, right,
      sel === DEF ? 'Applied to every sound that has no pool of its own.'
        : 'Overrides the global default for “' + sel + '” only.');
    const e = entry();
    AXES.forEach(([key, label, hint, range]) => {
      const r = el('div', { class: 'tc-row', style: 'margin:8px 0' }, right);
      el('label', { style: 'width:110px' }, r, label);
      const slider = el('input', { type: 'range', min: range[0], max: range[1], step: (key === 'pitch' ? 0.1 : 0.01), style: 'flex:1' }, r);
      slider.value = e[key];
      const out = el('span', { class: 'tc-mut', style: 'width:74px;text-align:right' }, r, fmt(key, e[key]));
      el('span', { class: 'tc-mut', style: 'flex-basis:100%;font-size:11px;margin:-2px 0 0 110px' }, r, hint);
      slider.addEventListener('input', () => { MT.setField(key, slider.value); out.textContent = fmt(key, e[key]); drawSpread(cv, e); markDirty(); });
    });
    const btns = el('div', { style: 'display:flex;gap:8px;margin:14px 0 6px' }, right);
    el('button', { class: 'tbtn play', onclick: () => MT.audition(6) }, btns, '▶ Audition ×6');
    el('button', { class: 'tbtn', onclick: () => { MT.clearPool(); } }, btns, '○ No variation');
    // ---- animated spread preview ----
    el('div', { class: 'tc-mut', style: 'margin:10px 0 4px;font-size:11px' }, right, 'Each dot is one possible play. Wider cloud = more variety; the cross is the unchanged sound.');
    const cv = el('canvas', { width: 360, height: 170, style: 'border:1px solid var(--line);border-radius:6px;background:#0d0f14' }, right);
    drawSpread(cv, e);
    prevTimer = setInterval(() => { if (!document.body.contains(cv)) { clearInterval(prevTimer); prevTimer = 0; return; } drawSpread(cv, entry()); }, 650);
  }

  function markDirty() {
    const tag = bodyEl && bodyEl.querySelector('.tc-mut');
    // refresh the unsaved indicator + list "varies" pills without a full re-render mid-drag
    if (tag && tag.textContent.indexOf('saved') >= 0) tag.textContent = '● unsaved';
  }
  function fmt(key, v) { return key === 'pitch' ? ('±' + (+v).toFixed(1) + ' st') : ('±' + Math.round(v * 100) + '%'); }

  // scatter of sampled plays: x = pitch offset (semitones), y = gain factor; recomputed each tick
  function drawSpread(cv, e) {
    const g = cv.getContext('2d'), W = cv.width, H = cv.height;
    g.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, xR = 13, yR = 1;      // ±13 st across, gain 0..2 vertical
    const X = st => cx + (st / xR) * (W / 2 - 14);
    const Y = gf => cy - ((gf - 1) / yR) * (H / 2 - 14);
    // grid lines
    g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, cy); g.lineTo(W, cy); g.moveTo(cx, 0); g.lineTo(cx, H); g.stroke();
    g.fillStyle = 'rgba(180,190,210,0.5)'; g.font = '10px system-ui';
    g.fillText('quieter', 6, H - 6); g.fillText('louder', 6, 14);
    g.fillText('lower', 6, cy + 13); g.fillText('higher', W - 40, cy + 13);
    const inert = !e.pitch && !e.gain;
    // sampled possible plays
    const N = inert ? 1 : 60;
    for (let i = 0; i < N; i++) {
      const f = V.factors(e);
      const st = 12 * Math.log2(f.pitch);
      const x = X(st), y = Y(f.gain);
      g.fillStyle = 'rgba(150,120,235,' + (inert ? 0.9 : 0.5) + ')';
      g.beginPath(); g.arc(x, y, inert ? 4 : 3, 0, 7); g.fill();
    }
    // the unvaried sound (cross at center)
    g.strokeStyle = '#e85d9a'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(cx - 7, cy); g.lineTo(cx + 7, cy); g.moveTo(cx, cy - 7); g.lineTo(cx, cy + 7); g.stroke();
    if (inert) { g.fillStyle = 'rgba(180,190,210,0.6)'; g.font = '11px system-ui'; g.fillText('no variation — plays identically every time', 56, H - 24); }
  }

  T.registerTool({
    id: 'sfxvar', label: 'Randomization pools', icon: '🔀', group: 'Audio',
    sub: 'per-play pitch/volume variation so repeats don’t sound robotic',
    build(host, a) { api = a; bodyEl = host; if (!data) MT.load(); render(); }
  });
  if (T.roadmapDone) T.roadmapDone(85);
})();
