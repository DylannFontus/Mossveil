// MOSSVEIL — tool-sidechain.js : Music ducking / sidechain (Edit ▸ Audio).  Roadmap #84.
// Authors which sound effects momentarily dip the music and by how much (src/sidechain.js ->
// data/sidechain.js, G.SIDECHAIN_DATA). A shared envelope (depth, attack, hold, release) shapes the
// dip; a per-sound strength (0..1) decides which sounds duck and how hard. An animated preview traces
// the music-gain dip; "Audition" plays a music bed and fires the chosen sound so you HEAR it pump.
// INERT (depth 0 or no sounds) = byte-identical: audio.js never even splices the duck node, so the
// soundtrack — which tracks per level, how they sound, every transition — is exactly as before.
(function () {
  const T = G.Tools, A = G.Audio, S = G.Sidechain;
  if (!T || !A || !S) return;
  const clone = o => JSON.parse(JSON.stringify(o));
  const sfxNames = () => Object.keys((A.sfxExportCurrent() || { sfx: {} }).sfx);
  const ENV = [
    ['depth', 'Dip depth', 'how far the music drops', S.range('depth'), v => Math.round(v * 100) + '%'],
    ['attack', 'Attack', 'how fast it ducks down', S.range('attack'), v => (v * 1000 | 0) + ' ms'],
    ['hold', 'Hold', 'time held at the bottom', S.range('hold'), v => (v * 1000 | 0) + ' ms'],
    ['release', 'Release', 'how fast it recovers', S.range('release'), v => (v * 1000 | 0) + ' ms']
  ];

  // ---------------- controller (test API: G.Tools.sidechain) ----------------
  let data = null, sel = null, dirty = false, bodyEl = null, api = null, prevTimer = 0;
  let auditLoop = false, auditEnd = 0;
  function trig() { return data.triggers || (data.triggers = {}); }
  // drop 0-strength sounds so the saved/applied overlay stays minimal & honestly inert
  function normalized() {
    const out = { depth: data.depth, attack: data.attack, hold: data.hold, release: data.release, triggers: {} };
    const t = trig(); for (const n in t) if (t[n] > 0) out.triggers[n] = t[n];
    return out;
  }
  const nDucking = () => { const t = trig(); return Object.keys(t).filter(n => t[n] > 0).length; };
  const auditionName = () => { const t = trig(); if (sel && t[sel] > 0) return sel; return Object.keys(t).filter(n => t[n] > 0)[0] || null; };

  const MT = T.sidechain = {
    get state() { return { data, sel, dirty }; },
    getWorking() { return data; },
    load() { data = clone(S.exportCurrent()); if (!data.triggers) data.triggers = {}; sel = sfxNames()[0] || null; dirty = false; },
    revert() { data = clone(S.exportDefaults()); sel = sfxNames()[0] || null; dirty = true; if (bodyEl) render(); },
    applyToEngine() { S.applyData(normalized()); },
    async save() { await api.data.save('sidechain', 'SIDECHAIN_DATA', normalized()); MT.applyToEngine(); dirty = false; if (api) api.toast('Ducking saved'); if (bodyEl) render(); return true; },
    select(n) { sel = n; if (bodyEl) render(); },
    setEnv(key, val) { const r = S.range(key); data[key] = Math.max(r[0], Math.min(r[1], +val || 0)); dirty = true; },
    setTrigger(name, val) { const v = Math.max(0, Math.min(1, +val || 0)); if (v > 0) trig()[name] = v; else delete trig()[name]; dirty = true; },
    clearAll() { data.triggers = {}; dirty = true; if (bodyEl) render(); },
    // audition: splice the duck node, start a music bed, fire the chosen sound so you hear it pump
    audition() {
      if (A.init) { try { A.init(); } catch (_) { } }
      if (A._duckInsert) A._duckInsert();
      MT.applyToEngine();
      const tracks = (G.Music && G.Music.exportCurrent && G.Music.exportCurrent().tracks) || {};
      const def = tracks.gloom || tracks[Object.keys(tracks)[0]];
      if (G.Music && G.Music.previewDef && def) { G.Music.previewDef(def, 0.0); auditEnd = (typeof performance !== 'undefined' ? performance.now() : Date.now()) + 3600; startAuditLoop(); }
      const name = auditionName();
      if (name) for (let i = 0; i < 5; i++) setTimeout(() => { try { A.sfx(name); } catch (_) { } }, 480 + i * 560);
    },
    openInTool() { return T.openTool('sidechain'); }
  };

  function startAuditLoop() {
    if (auditLoop) return; auditLoop = true;
    const tick = () => {
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      if (!bodyEl || !document.body.contains(bodyEl) || now > auditEnd) { if (G.Music && G.Music.stopPreview) G.Music.stopPreview(); auditLoop = false; return; }
      if (G.Music && G.Music.update) G.Music.update();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // ---------------- UI ----------------
  function el(t, a, p, x) { return api.el(t, a, p, x); }
  function render() {
    if (prevTimer) { clearInterval(prevTimer); prevTimer = 0; }
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column';
    const head = el('div', { style: 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line)' }, bodyEl);
    el('button', { class: 'tbtn play', onclick: () => MT.save().catch(e => api.toast('Save failed: ' + e.message)) }, head, '💾 Save');
    el('button', { class: 'tbtn', onclick: () => { if (confirm('Clear all ducking back to none? (not saved until you Save)')) MT.revert(); } }, head, '↺ Reset all');
    el('span', { class: 'tc-mut' }, head, dirty ? '● unsaved' : 'saved ✓');
    el('div', { style: 'flex:1' }, head);
    const n = nDucking();
    el('span', { class: 'tc-mut' }, head, (data.depth <= 0 || !n) ? 'inert — music plays untouched' : (n + ' sound' + (n === 1 ? '' : 's') + ' duck the music'));

    const grid = el('div', { style: 'flex:1;display:grid;grid-template-columns:230px 1fr;gap:0;min-height:0' }, bodyEl);
    // ---- left: which sounds duck (per-sound strength) ----
    const left = el('div', { style: 'display:flex;flex-direction:column;border-right:1px solid var(--line);min-height:0' }, grid);
    el('div', { class: 'tc-mut', style: 'padding:8px 10px 2px;font-size:11px' }, left, 'Sounds that duck the music');
    const list = el('div', { style: 'flex:1;overflow:auto;padding:6px 8px' }, left);
    sfxNames().forEach(name => {
      const s = trig()[name] || 0;
      const row = el('div', { class: 'tc-pal-item' + (name === sel ? ' sel' : ''), style: 'display:flex;flex-direction:column;gap:3px;padding:5px 8px' }, list);
      const top = el('div', { style: 'display:flex;align-items:center;gap:6px' }, row);
      el('span', {}, top, name);
      if (s > 0) el('span', { class: 'tc-pill done', style: 'margin-left:auto' }, top, 'ducks');
      const sld = el('input', { type: 'range', min: 0, max: 1, step: 0.05, style: 'width:100%' }, row); sld.value = s;
      const out = el('span', { class: 'tc-mut', style: 'font-size:10px' }, top, s > 0 ? Math.round(s * 100) + '%' : 'off');
      if (s <= 0) out.style.marginLeft = 'auto';
      row.addEventListener('click', e => { if (e.target !== sld) MT.select(name); });
      sld.addEventListener('input', () => { MT.setTrigger(name, sld.value); out.textContent = +sld.value > 0 ? Math.round(sld.value * 100) + '%' : 'off'; markDirty(); drawEnv(cv); });
      sld.addEventListener('change', () => render());
    });
    const lb = el('div', { style: 'display:flex;gap:6px;padding:6px 8px;border-top:1px solid var(--line)' }, left);
    el('button', { class: 'tbtn', style: 'flex:1', onclick: () => MT.clearAll() }, lb, '○ None duck');

    // ---- right: shared dip envelope + preview + audition ----
    const right = el('div', { style: 'overflow:auto;padding:14px 16px;min-height:0' }, grid);
    el('div', { style: 'font-weight:600;font-size:15px;margin-bottom:2px' }, right, '📉 Duck envelope');
    el('div', { class: 'tc-mut', style: 'margin-bottom:12px' }, right, 'Shared by every ducking sound. A sound at 100% dips the music the full depth; lower strengths dip proportionally less.');
    ENV.forEach(([key, label, hint, range, fmt]) => {
      const r = el('div', { class: 'tc-row', style: 'margin:8px 0' }, right);
      el('label', { style: 'width:96px' }, r, label);
      const slider = el('input', { type: 'range', min: range[0], max: range[1], step: (key === 'depth' ? 0.01 : 0.005), style: 'flex:1' }, r);
      slider.value = data[key];
      const out = el('span', { class: 'tc-mut', style: 'width:64px;text-align:right' }, r, fmt(data[key]));
      el('span', { class: 'tc-mut', style: 'flex-basis:100%;font-size:11px;margin:-2px 0 0 96px' }, r, hint);
      slider.addEventListener('input', () => { MT.setEnv(key, slider.value); out.textContent = fmt(data[key]); drawEnv(cv); markDirty(); });
    });
    const btns = el('div', { style: 'display:flex;gap:8px;margin:14px 0 6px' }, right);
    el('button', { class: 'tbtn play', onclick: () => MT.audition() }, btns, '▶ Audition');
    el('span', { class: 'tc-mut', style: 'align-self:center;font-size:11px' }, btns, auditionName() ? 'plays a music bed + fires “' + auditionName() + '”' : 'add a ducking sound at left first');
    // ---- animated preview: the music gain dipping over time ----
    el('div', { class: 'tc-mut', style: 'margin:10px 0 4px;font-size:11px' }, right, 'The music level over one duck — it dips to make room for the sound, then recovers.');
    const cv = el('canvas', { width: 360, height: 150, style: 'border:1px solid var(--line);border-radius:6px;background:#0d0f14' }, right);
    drawEnv(cv);
    prevTimer = setInterval(() => { if (!document.body.contains(cv)) { clearInterval(prevTimer); prevTimer = 0; return; } drawEnv(cv); }, 1000 / 30);
  }

  function markDirty() {
    const tag = bodyEl && bodyEl.querySelector('.tc-mut');
    if (tag && tag.textContent.indexOf('saved') >= 0) tag.textContent = '● unsaved';
  }

  // gain of the music at time t (s) into one full-strength duck (lo = 1 - depth)
  function gainAt(t, atk, hold, rel, lo) {
    if (t <= 0) return 1;
    if (t < atk) return 1 - (1 - lo) * (t / atk);
    if (t < atk + hold) return lo;
    if (t < atk + hold + rel) return lo + (1 - lo) * ((t - atk - hold) / rel);
    return 1;
  }
  let phase = 0;
  function drawEnv(cv) {
    if (!cv) return;
    const g = cv.getContext('2d'), W = cv.width, H = cv.height, padL = 8, padR = 8, padT = 14, padB = 16;
    g.clearRect(0, 0, W, H);
    const atk = data.attack, hold = data.hold, rel = data.release, lo = Math.max(0.02, 1 - data.depth);
    const span = Math.max(0.2, atk + hold + rel);
    const total = span * 1.25;                          // a little tail at full level
    const X = t => padL + (t / total) * (W - padL - padR);
    const Y = gv => padT + (1 - gv) * (H - padT - padB);
    // gridlines at full + dipped level
    g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(padL, Y(1)); g.lineTo(W - padR, Y(1)); g.moveTo(padL, Y(lo)); g.lineTo(W - padR, Y(lo)); g.stroke();
    g.fillStyle = 'rgba(180,190,210,0.55)'; g.font = '10px system-ui';
    g.fillText('full', W - padR - 22, Y(1) - 3);
    if (data.depth > 0) g.fillText('-' + Math.round(data.depth * 100) + '%', W - padR - 30, Y(lo) + 11);
    // the dip curve (filled)
    g.beginPath(); g.moveTo(X(0), Y(gainAt(0, atk, hold, rel, lo)));
    for (let px = 0; px <= W - padL - padR; px += 2) { const t = (px / (W - padL - padR)) * total; g.lineTo(X(t), Y(gainAt(t, atk, hold, rel, lo))); }
    g.lineTo(X(total), Y(1)); g.lineTo(X(total), Y(0)); g.lineTo(X(0), Y(0)); g.closePath();
    g.fillStyle = 'rgba(150,120,235,0.16)'; g.fill();
    g.beginPath(); g.moveTo(X(0), Y(gainAt(0, atk, hold, rel, lo)));
    for (let px = 0; px <= W - padL - padR; px += 2) { const t = (px / (W - padL - padR)) * total; g.lineTo(X(t), Y(gainAt(t, atk, hold, rel, lo))); }
    g.strokeStyle = '#9678eb'; g.lineWidth = 2; g.stroke();
    // moving playhead tracing the curve (loops); shows the duck "pumping"
    if (data.depth > 0) {
      phase = (phase + (1000 / 30) / 1000) % (total + 0.4);
      const pt = Math.min(phase, total), gv = gainAt(pt, atk, hold, rel, lo);
      g.fillStyle = '#e85d9a'; g.beginPath(); g.arc(X(pt), Y(gv), 4, 0, 7); g.fill();
    } else {
      g.fillStyle = 'rgba(180,190,210,0.6)'; g.font = '11px system-ui';
      g.fillText('no ducking — music plays at full level', 64, H / 2 + 4);
    }
  }

  T.registerTool({
    id: 'sidechain', label: 'Music ducking', icon: '📉', group: 'Audio',
    sub: 'dip the music under chosen sound effects (sidechain)',
    build(host, a) { api = a; bodyEl = host; if (!data) MT.load(); render(); }
  });
  if (T.roadmapDone) T.roadmapDone(84);
})();
