// MOSSVEIL — tool-weather.js : the in-engine Weather preset editor (Edit ▸ World).
// Authors the atmosphere presets that used to be hard-coded in src/weather.js. Each preset blends
// rain / snow / leaves / embers / wind / fog / wetness / lightning. Saves to data/weather.js
// (window.G.WEATHER_DATA); new presets become selectable per room. Live preview. Offline, editor-only.
(function () {
  const T = G.Tools, W = G.Weather;
  if (!T || !W || !W.exportDefaults) return;
  const clone = o => JSON.parse(JSON.stringify(o));
  // [key, label, min, max, step]
  const PROPS = [
    ['rain', 'Rain', 0, 1, 0.05], ['snow', 'Snow', 0, 1, 0.05], ['leaves', 'Leaves', 0, 1, 0.05],
    ['embers', 'Embers / ash', 0, 1, 0.05], ['wind', 'Wind', 0, 1, 0.05], ['fog', 'Fog / haze', 0, 1, 0.05],
    ['wet', 'Wetness (reflections/grade)', 0, 1, 0.05]
  ];

  // ---------------- controller (test API: G.Tools.weather) ----------------
  let data = null, sel = null, dirty = false, bodyEl = null, api = null;
  let loopOn = false, lastT = 0, prevCanvas = null, prevCtx = null;
  const ids = () => Object.keys(data.presets);
  const MT = T.weather = {
    get state() { return { data, sel, dirty }; },
    getWorking() { return data; },
    load() { data = clone(W.exportCurrent()); sel = ids().find(k => k !== 'none') || ids()[0]; dirty = false; },
    revert() { data = clone(W.exportDefaults()); sel = ids().find(k => k !== 'none'); dirty = true; if (bodyEl) render(); },
    applyToEngine() { W.applyData(clone(data)); },
    async save() { await api.data.save('weather', 'WEATHER_DATA', data); MT.applyToEngine(); dirty = false; if (api) api.toast('Weather saved · ' + ids().length + ' presets'); if (bodyEl) render(); return true; },
    select(k) { sel = k; if (bodyEl) render(); },
    uniqueId(base) { base = (base || 'weather').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'weather'; let n = base, i = 1; while (data.presets[n]) n = base + (++i); return n; },
    addPreset(src) { const n = MT.uniqueId(src || 'weather'); data.presets[n] = clone((src && data.presets[src]) || data.presets[sel] || {}); data.labels[n] = (src && data.labels[src]) ? data.labels[src] + ' copy' : 'New Weather'; sel = n; dirty = true; if (bodyEl) render(); return n; },
    duplicatePreset(k) { return MT.addPreset(k || sel); },
    removePreset(k) { k = k || sel; if (k === 'none') return false; if (ids().length <= 1) return false; delete data.presets[k]; delete data.labels[k]; if (sel === k) sel = ids().find(x => x !== 'none') || ids()[0]; dirty = true; if (bodyEl) render(); return true; },
    renamePreset(k, nk) { nk = (nk || '').trim(); if (k === 'none' || !nk || nk === k || data.presets[nk]) return false; data.presets[nk] = data.presets[k]; data.labels[nk] = data.labels[k]; delete data.presets[k]; delete data.labels[k]; if (sel === k) sel = nk; dirty = true; return true; },
    setLabel(k, v) { data.labels[k] = v; dirty = true; },
    setProp(k, key, val) { const p = data.presets[k]; if (!val) delete p[key]; else p[key] = val; dirty = true; updatePreview(); },
    setLightning(k, on) { const p = data.presets[k]; if (on) p.lightning = 1; else delete p.lightning; dirty = true; updatePreview(); },
    openInTool() { return T.openTool('weather'); }
  };

  function updatePreview() { if (sel && data.presets[sel] && W.previewProps) W.previewProps(data.presets[sel]); }
  function startLoop() {
    if (loopOn) return; loopOn = true; lastT = performance.now();
    const tick = (now) => {
      const ov = document.getElementById('toolHost');
      if (!ov || !ov.classList.contains('on')) { loopOn = false; if (W.previewEnd) W.previewEnd(); return; }
      const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
      if (prevCtx && W.update && W.draw) {
        const w = prevCanvas.width, h = prevCanvas.height;
        const g = prevCtx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#1a2233'); g.addColorStop(1, '#10161f');
        prevCtx.fillStyle = g; prevCtx.fillRect(0, 0, w, h);
        try { W.update(dt); W.draw(prevCtx, w, h); } catch (_) { }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // ---------------- UI ----------------
  function el(t, a, p, x) { return api.el(t, a, p, x); }
  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column';
    const head = el('div', { style: 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line)' }, bodyEl);
    el('button', { class: 'tbtn play', onclick: () => MT.save().catch(e => api.toast('Save failed: ' + e.message)) }, head, '💾 Save weather');
    el('button', { class: 'tbtn', onclick: () => { if (confirm('Replace all presets with the built-in defaults? (not saved until you Save)')) MT.revert(); } }, head, '↺ Revert');
    el('span', { class: 'tc-mut' }, head, dirty ? '● unsaved' : 'saved ✓');
    el('div', { style: 'flex:1' }, head);
    el('span', { class: 'tc-mut' }, head, ids().length + ' presets');
    const grid = el('div', { style: 'flex:1;display:grid;grid-template-columns:200px 1fr;gap:0;min-height:0' }, bodyEl);
    const left = el('div', { style: 'display:flex;flex-direction:column;border-right:1px solid var(--line);min-height:0' }, grid);
    const list = el('div', { style: 'flex:1;overflow:auto;padding:8px' }, left);
    ids().forEach(k => {
      const row = el('div', { class: 'tc-pal-item' + (k === sel ? ' sel' : ''), style: 'padding:5px 8px' }, list);
      el('span', {}, row, data.labels[k] || k);
      el('span', { class: 'pal-hint' }, row, k);
      row.addEventListener('click', () => MT.select(k));
    });
    const btns = el('div', { style: 'display:flex;gap:4px;padding:8px;border-top:1px solid var(--line)' }, left);
    el('button', { class: 'tbtn', onclick: () => MT.addPreset() }, btns, '+ New');
    el('button', { class: 'tbtn', onclick: () => MT.duplicatePreset() }, btns, '⧉');
    el('button', { class: 'tbtn', onclick: () => { if (!MT.removePreset()) api.toast('Cannot delete this preset.'); } }, btns, '🗑');
    renderPreset(el('div', { style: 'overflow:auto;padding:12px 14px;min-height:0' }, grid));
  }

  function renderPreset(host) {
    if (!sel || !data.presets[sel]) { el('div', { class: 'tc-mut' }, host, 'Select a preset.'); return; }
    const p = data.presets[sel];
    // preview canvas
    prevCanvas = el('canvas', { width: '400', height: '150', style: 'width:100%;max-width:400px;border:1px solid var(--line);border-radius:6px;background:#10161f;display:block' }, host);
    prevCtx = prevCanvas.getContext('2d');
    updatePreview();
    const rId = el('div', { class: 'tc-row', style: 'margin-top:10px' }, host); el('label', {}, rId, 'Id'); const idInp = el('input', { type: 'text' }, rId); idInp.value = sel; idInp.disabled = sel === 'none';
    idInp.addEventListener('change', () => { if (!MT.renamePreset(sel, idInp.value)) { idInp.value = sel; api.toast('Id in use, invalid, or “none” is protected.'); } else render(); });
    const rL = el('div', { class: 'tc-row' }, host); el('label', {}, rL, 'Label'); const lInp = el('input', { type: 'text' }, rL); lInp.value = data.labels[sel] || '';
    lInp.addEventListener('input', () => MT.setLabel(sel, lInp.value)); lInp.addEventListener('change', render);
    if (sel === 'none') { el('div', { class: 'tc-mut', style: 'margin-top:8px' }, host, '“none” is clear weather — usually left empty.'); }
    PROPS.forEach(([key, label, min, max, step]) => {
      const r = el('div', { class: 'tc-row' }, host); el('label', {}, r, label);
      const inp = el('input', { type: 'range', min, max, step }, r); inp.value = p[key] || 0;
      const lbl = el('span', { class: 'tc-mut', style: 'width:40px;text-align:right' }, r, (+(p[key] || 0)).toFixed(2));
      inp.addEventListener('input', () => { const v = +inp.value; MT.setProp(sel, key, v); lbl.textContent = v.toFixed(2); });
    });
    const rLi = el('div', { class: 'tc-row' }, host); const cb = el('input', { type: 'checkbox' }, rLi); cb.checked = !!p.lightning;
    el('label', { style: 'width:auto' }, rLi, 'Lightning (thunder + bloom flash)');
    cb.addEventListener('change', () => MT.setLightning(sel, cb.checked));
    el('div', { class: 'tc-mut', style: 'margin-top:10px' }, host, 'Tip: rain/snow values let fire react (douse), wind drifts flames and pushes the player. Custom presets named “snow”/“blizzard” also pile deep snow.');
  }

  T.registerTool({
    id: 'weather', label: 'Weather presets', icon: '🌧', group: 'World',
    sub: 'author atmosphere presets with live preview',
    build(host, a) { api = a; bodyEl = host; if (!data) MT.load(); render(); startLoop(); }
  });
  if (T.roadmapDone) T.roadmapDone(16);
})();
