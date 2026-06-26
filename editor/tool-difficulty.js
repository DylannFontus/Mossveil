// MOSSVEIL — tool-difficulty.js : the Difficulty / accessibility editor (Edit ▸ Systems).
// Authors the difficulty modes (src/difficulty.js -> data/difficulty.js). Each mode tweaks the
// player's derived stats: extra/fewer masks, nail-damage bonus, and a soul-gain multiplier — applied
// consistently to every foe and boss. Pick which mode new games start in. Fully offline, editor-only.
(function () {
  const T = G.Tools, D = G.Difficulty;
  if (!T || !D || !D.exportDefaults) return;
  const clone = o => JSON.parse(JSON.stringify(o));
  const BASE_MASKS = 5, BASE_NAIL = 1;

  let data = null, sel = null, dirty = false, bodyEl = null, api = null;
  const ids = () => Object.keys(data.modes);
  const MT = T.difficulty = {
    get state() { return { data, sel, dirty }; },
    getWorking() { return data; },
    load() { data = clone(D.exportCurrent()); sel = data.default || ids()[0]; dirty = false; },
    revert() { data = clone(D.exportDefaults()); sel = data.default; dirty = true; if (bodyEl) render(); },
    applyToEngine() { D.applyData(clone(data)); },
    async save() { await api.data.save('difficulty', 'DIFFICULTY_DATA', data); MT.applyToEngine(); dirty = false; if (api) api.toast('Difficulty saved · ' + ids().length + ' modes'); if (bodyEl) render(); return true; },
    select(id) { sel = id; if (bodyEl) render(); },
    uniqueId(base) { base = (base || 'mode').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'mode'; let n = base, i = 1; while (data.modes[n]) n = base + (++i); return n; },
    addMode(src) { const n = MT.uniqueId(src || 'mode'); data.modes[n] = clone((src && data.modes[src]) || data.modes[sel] || { name: 'New Mode', desc: '', maskBonus: 0, dmgBonus: 0, soulMul: 1 }); data.modes[n].name = src ? data.modes[n].name + ' copy' : 'New Mode'; sel = n; dirty = true; if (bodyEl) render(); return n; },
    duplicateMode(id) { return MT.addMode(id || sel); },
    removeMode(id) { id = id || sel; if (ids().length <= 1) return false; delete data.modes[id]; if (data.default === id) data.default = ids()[0]; if (sel === id) sel = ids()[0]; dirty = true; if (bodyEl) render(); return true; },
    renameId(id, nid) { nid = (nid || '').trim(); if (!nid || nid === id || data.modes[nid]) return false; data.modes[nid] = data.modes[id]; delete data.modes[id]; if (data.default === id) data.default = nid; if (sel === id) sel = nid; dirty = true; return true; },
    setField(id, key, v) { data.modes[id][key] = v; dirty = true; },
    setDefault(id) { data.default = id; dirty = true; if (bodyEl) render(); },
    openInTool() { return T.openTool('difficulty'); }
  };

  function el(t, a, p, x) { return api.el(t, a, p, x); }
  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column';
    const head = el('div', { style: 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line)' }, bodyEl);
    el('button', { class: 'tbtn play', onclick: () => MT.save().catch(e => api.toast('Save failed: ' + e.message)) }, head, '💾 Save modes');
    el('button', { class: 'tbtn', onclick: () => { if (confirm('Replace difficulty modes with the built-in defaults?')) MT.revert(); } }, head, '↺ Revert');
    el('span', { class: 'tc-mut' }, head, dirty ? '● unsaved' : 'saved ✓');
    el('div', { style: 'flex:1' }, head);
    el('span', { class: 'tc-mut' }, head, ids().length + ' modes');
    const grid = el('div', { style: 'flex:1;display:grid;grid-template-columns:210px 1fr;gap:0;min-height:0' }, bodyEl);
    const left = el('div', { style: 'display:flex;flex-direction:column;border-right:1px solid var(--line);min-height:0' }, grid);
    const list = el('div', { style: 'flex:1;overflow:auto;padding:8px' }, left);
    ids().forEach(id => {
      const m = data.modes[id];
      const row = el('div', { class: 'tc-pal-item' + (id === sel ? ' sel' : ''), style: 'padding:5px 8px' }, list);
      el('span', {}, row, m.name);
      if (id === data.default) el('span', { class: 'tc-pill done', style: 'margin-left:auto' }, row, 'default');
      row.addEventListener('click', () => MT.select(id));
    });
    const btns = el('div', { style: 'display:flex;gap:4px;padding:8px;border-top:1px solid var(--line)' }, left);
    el('button', { class: 'tbtn', onclick: () => MT.addMode() }, btns, '+ New');
    el('button', { class: 'tbtn', onclick: () => MT.duplicateMode() }, btns, '⧉');
    el('button', { class: 'tbtn', onclick: () => { if (!MT.removeMode()) api.toast('Keep at least one mode.'); } }, btns, '🗑');
    renderMode(el('div', { style: 'overflow:auto;padding:12px 14px;min-height:0' }, grid));
  }

  function renderMode(host) {
    const m = data.modes[sel]; if (!m) { el('div', { class: 'tc-mut' }, host, 'Select a mode.'); return; }
    const rId = el('div', { class: 'tc-row' }, host); el('label', {}, rId, 'Id'); const idInp = el('input', { type: 'text' }, rId); idInp.value = sel;
    idInp.addEventListener('change', () => { if (!MT.renameId(sel, idInp.value)) { idInp.value = sel; api.toast('Id in use or invalid.'); } else render(); });
    const rN = el('div', { class: 'tc-row' }, host); el('label', {}, rN, 'Name'); const nInp = el('input', { type: 'text' }, rN); nInp.value = m.name;
    nInp.addEventListener('input', () => MT.setField(sel, 'name', nInp.value)); nInp.addEventListener('change', render);
    const rD = el('div', { class: 'tc-row', style: 'align-items:flex-start' }, host); el('label', {}, rD, 'Description'); const dInp = el('textarea', { rows: '2', style: 'flex:1;background:var(--bg3);color:var(--txt);border:1px solid #45454d;border-radius:5px;padding:5px 7px;font-size:13px' }, rD); dInp.value = m.desc;
    dInp.addEventListener('input', () => MT.setField(sel, 'desc', dInp.value));
    rng(host, 'Mask bonus', m.maskBonus, -3, 5, 1, v => { MT.setField(sel, 'maskBonus', v); upd(); });
    rng(host, 'Nail damage bonus', m.dmgBonus, -1, 3, 1, v => { MT.setField(sel, 'dmgBonus', v); upd(); });
    rng(host, 'Soul gain ×', m.soulMul, 0.5, 2, 0.05, v => { MT.setField(sel, 'soulMul', v); });
    const eff = el('div', { class: 'tc-card', style: 'margin-top:10px' }, host);
    function upd() { eff.textContent = 'With this mode: ' + Math.max(1, BASE_MASKS + (data.modes[sel].maskBonus | 0)) + ' masks · nail does ' + Math.max(1, BASE_NAIL + (data.modes[sel].dmgBonus | 0)) + ' · soul ×' + (+data.modes[sel].soulMul).toFixed(2) + ' (before charms).'; }
    upd();
    const rDef = el('div', { class: 'tc-row', style: 'margin-top:10px' }, host);
    const db = el('input', { type: 'checkbox' }, rDef); db.checked = data.default === sel; db.disabled = data.default === sel;
    el('label', { style: 'width:auto' }, rDef, data.default === sel ? 'This is the default mode for new games' : 'Make this the default mode');
    db.addEventListener('change', () => { if (db.checked) MT.setDefault(sel); });
  }

  function rng(p, label, v, min, max, step, onCh) {
    const r = el('div', { class: 'tc-row' }, p); el('label', {}, r, label);
    const inp = el('input', { type: 'range', min, max, step }, r); inp.value = v;
    const lbl = el('span', { class: 'tc-mut', style: 'width:48px;text-align:right' }, r, step < 1 ? (+v).toFixed(2) : (v > 0 ? '+' + v : '' + v));
    inp.addEventListener('input', () => { const x = step < 1 ? +(+inp.value).toFixed(2) : Math.round(+inp.value); onCh(x); lbl.textContent = step < 1 ? x.toFixed(2) : (x > 0 ? '+' + x : '' + x); });
  }

  T.registerTool({
    id: 'difficulty', label: 'Difficulty / accessibility', icon: '⚖', group: 'Systems',
    sub: 'modes: masks, damage & soul',
    build(host, a) { api = a; bodyEl = host; if (!data) MT.load(); render(); }
  });
  if (T.roadmapDone) T.roadmapDone(92);
})();
