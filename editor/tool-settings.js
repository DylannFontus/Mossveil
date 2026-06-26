// MOSSVEIL — tool-settings.js : Settings menu editor (Edit ▸ Systems).  Roadmap #87.
// Authors the player-facing Settings screen (src/settings.js -> data/settings.js): the value a new
// game starts each option at, plus the menu schema — relabel rows, reorder them, hide ones a build
// doesn't want, and edit the option lists of the cycle settings (soundtrack / quality / tone mapping)
// and the slider range. The key-specific apply logic (volume -> Audio, quality -> Post, ...) stays in
// main.js, so the row TYPE is fixed; everything else is yours. A live preview mirrors the in-game
// menu. Edits the overlay through the data layer; applies on next Play. Defaults byte-identical.
(function () {
  const T = G.Tools, S = G.Settings;
  if (!T || !S || !S.exportDefaults) return;
  const clone = o => JSON.parse(JSON.stringify(o));
  const cap = v => ('' + v).charAt(0).toUpperCase() + ('' + v).slice(1);
  let data = null, dirty = false, bodyEl = null, api = null, prevWrap = null;

  // value formatting identical to main.js fmtSetting
  function fmtVal(d) {
    if (d.type === 'action') return '▶';
    const v = data.values[d.key];
    if (d.type === 'slider') return Math.round(v * 100) + '%';
    if (d.type === 'cycle') return cap(v);
    return v ? 'On' : 'Off';
  }

  const MT = T.settingsMenu = {
    get state() { return { data, dirty }; },
    getWorking() { return data; },
    load() { data = clone(S.exportCurrent()); dirty = false; },
    revert() { data = clone(S.exportDefaults()); dirty = true; if (bodyEl) render(); },
    applyToEngine() { S.applyData(clone(data)); },
    async save() { await api.data.save('settings', 'SETTINGS_DATA', data); MT.applyToEngine(); dirty = false; if (api) api.toast('Settings menu saved'); if (bodyEl) render(); return true; },
    setValue(key, v) { data.values[key] = v; dirty = true; refreshPreview(); },
    setLabel(i, v) { if (data.defs[i]) { data.defs[i].label = v; dirty = true; refreshPreview(); } },
    setShow(i, on) { if (data.defs[i]) { data.defs[i].show = on; dirty = true; if (bodyEl) render(); } },
    move(i, dir) { const a = data.defs, j = i + dir; if (a[i] && a[j]) { const t = a[i]; a[i] = a[j]; a[j] = t; dirty = true; if (bodyEl) render(); } },
    setOpts(i, arr) {
      const d = data.defs[i]; if (!d || d.type !== 'cycle') return;
      d.opts = arr.length ? arr : ['A'];
      if (data.values[d.key] != null && d.opts.indexOf(data.values[d.key]) < 0) data.values[d.key] = d.opts[0];
      dirty = true; if (bodyEl) render();
    },
    setSlider(i, field, v) { const d = data.defs[i]; if (d && d.type === 'slider') { d[field] = v; dirty = true; refreshPreview(); } },
    visibleDefs() { return data.defs.filter(d => d.show !== false); },
    openInTool() { return T.openTool('settings'); }
  };

  function el(t, a, p, x) { return api.el(t, a, p, x); }

  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column';
    const head = el('div', { style: 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line)' }, bodyEl);
    el('button', { class: 'tbtn play', onclick: () => MT.save().catch(e => api.toast('Save failed: ' + e.message)) }, head, '💾 Save');
    el('button', { class: 'tbtn', onclick: () => { if (confirm('Reset the Settings menu to defaults?')) MT.revert(); } }, head, '↺ Revert');
    el('span', { class: 'tc-mut' }, head, dirty ? '● unsaved' : 'saved ✓');
    el('div', { style: 'flex:1' }, head);
    el('span', { class: 'tc-mut' }, head, 'applies on next Play');

    const grid = el('div', { style: 'flex:1;display:grid;grid-template-columns:1fr 320px;gap:0;min-height:0' }, bodyEl);
    const ctl = el('div', { style: 'overflow:auto;padding:14px 16px;display:flex;flex-direction:column;gap:18px;min-height:0' }, grid);
    prevWrap = el('div', { style: 'border-left:1px solid var(--line);padding:14px;display:flex;flex-direction:column;gap:6px;overflow:auto;background:#0d1512' }, grid);

    // ---- default values ----
    const s1 = section(ctl, '🎛 Default values', 'What each option starts at for a brand-new game (saved games keep their own choices). The Controls row is an action, so it has no value.');
    data.defs.forEach((d) => { if (d.type !== 'action') valueRow(s1, d); });

    // ---- menu schema ----
    const s2 = section(ctl, '☰ Menu rows', 'Reorder, rename, hide, and edit the option lists. The row type is fixed (it drives the apply logic), but the rest is yours. Hidden rows keep their default value and still apply — they just vanish from the menu.');
    data.defs.forEach((d, i) => schemaRow(s2, d, i));

    refreshPreview();
  }

  function valueRow(parent, d) {
    const r = el('div', { class: 'tc-row' }, parent);
    el('label', { style: 'flex:1' }, r, d.label);
    if (d.type === 'toggle') {
      const cb = el('input', { type: 'checkbox' }, r); cb.checked = !!data.values[d.key];
      cb.addEventListener('change', () => MT.setValue(d.key, cb.checked));
    } else if (d.type === 'slider') {
      const inp = el('input', { type: 'range', min: d.min != null ? d.min : 0, max: d.max != null ? d.max : 1, step: d.step || 0.1 }, r); inp.value = data.values[d.key];
      const lbl = el('span', { class: 'tc-mut', style: 'width:42px;text-align:right' }, r, Math.round(data.values[d.key] * 100) + '%');
      inp.addEventListener('input', () => { const v = +(+inp.value).toFixed(2); MT.setValue(d.key, v); lbl.textContent = Math.round(v * 100) + '%'; });
    } else if (d.type === 'cycle') {
      const sel = el('select', {}, r); (d.opts || []).forEach(o => el('option', { value: o }, sel, cap(o)));
      sel.value = data.values[d.key];
      sel.addEventListener('change', () => MT.setValue(d.key, sel.value));
    }
  }

  function schemaRow(parent, d, i) {
    const r = el('div', { class: 'tc-row', style: 'flex-wrap:wrap;gap:6px;opacity:' + (d.show === false ? '0.55' : '1') }, parent);
    el('button', { class: 'tbtn', style: 'padding:1px 6px', title: 'Move up', onclick: () => MT.move(i, -1) }, r, '↑');
    el('button', { class: 'tbtn', style: 'padding:1px 6px', title: 'Move down', onclick: () => MT.move(i, 1) }, r, '↓');
    const cb = el('input', { type: 'checkbox', title: 'Show in menu' }, r); cb.checked = d.show !== false;
    cb.addEventListener('change', () => MT.setShow(i, cb.checked));
    const lab = el('input', { type: 'text', style: 'flex:1;min-width:120px;font-size:12px' }, r); lab.value = d.label;
    lab.addEventListener('input', () => MT.setLabel(i, lab.value));
    el('span', { class: 'tc-mut', style: 'font-size:10px;border:1px solid var(--line);border-radius:3px;padding:0 5px' }, r, d.type);
    if (d.type === 'cycle') {
      const opt = el('input', { type: 'text', title: 'Options (comma-separated)', style: 'min-width:150px;font-size:11px' }, r);
      opt.value = (d.opts || []).join(', ');
      opt.addEventListener('change', () => MT.setOpts(i, opt.value.split(',').map(s => s.trim()).filter(Boolean)));
    } else if (d.type === 'slider') {
      ['min', 'max', 'step'].forEach(f => {
        el('span', { class: 'tc-mut', style: 'font-size:10px' }, r, f);
        const inp = el('input', { type: 'number', step: '0.05', style: 'width:52px' }, r); inp.value = d[f];
        inp.addEventListener('change', () => MT.setSlider(i, f, +inp.value || 0));
      });
    }
  }

  // live menu preview, mirroring the in-game Settings screen layout (label .... value)
  function refreshPreview() {
    if (!prevWrap) return;
    prevWrap.innerHTML = '';
    el('div', { class: 'tc-mut', style: 'margin-bottom:6px;letter-spacing:2px;font-size:11px' }, prevWrap, 'SETTINGS — preview');
    const vis = MT.visibleDefs();
    if (!vis.length) { el('div', { class: 'tc-mut' }, prevWrap, '(no rows visible)'); return; }
    vis.forEach(d => {
      const row = el('div', { class: 'setPrevRow', style: 'display:flex;align-items:baseline;gap:8px;padding:4px 2px;border-bottom:1px solid rgba(255,255,255,0.05)' }, prevWrap);
      el('span', { style: 'flex:1;font-family:Georgia,serif;font-size:13px;color:#dfe8df' }, row, d.label);
      el('span', { style: 'font-family:monospace;font-size:12px;color:#ffe28a' }, row, fmtVal(d));
    });
    el('div', { class: 'tc-mut', style: 'margin-top:6px;font-size:10px' }, prevWrap, vis.length + ' of ' + data.defs.length + ' rows shown');
  }

  function section(parent, title, desc) {
    const box = el('div', {}, parent);
    el('h3', { style: 'margin:0 0 2px;font-size:14px' }, box, title);
    if (desc) el('div', { class: 'tc-mut', style: 'margin-bottom:8px;font-size:11px;line-height:1.4' }, box, desc);
    return box;
  }

  T.registerTool({
    id: 'settings', label: 'Settings menu', icon: '⚙', group: 'Systems',
    sub: 'options screen · labels · defaults · order',
    build(host, a) { api = a; bodyEl = host; if (!data) MT.load(); render(); }
  });
  if (T.roadmapDone) T.roadmapDone(87);
})();
