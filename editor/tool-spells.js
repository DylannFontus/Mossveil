// MOSSVEIL — tool-spells.js : the in-engine Spell / ability designer (Edit ▸ Content).
// Authors the spell tree (src/spells.js -> G.Spells): name, cast hint, element flag, the three tier
// descriptions and three Glimmer costs. Saves to data/spells.js. The cast MECHANICS stay in code,
// keyed by the built-in ids (bolt/scream/dive) and elements (ember/frost/gale) — renaming those ids
// is warned against. Fully offline, editor-only.
(function () {
  const T = G.Tools, S = G.Spells;
  if (!T || !S || !S.exportDefaults) return;
  const clone = o => JSON.parse(JSON.stringify(o));
  const BUILTIN = S.exportDefaults().tree.map(s => s.id);

  let data = null, sel = 0, dirty = false, bodyEl = null, api = null;
  const MT = T.spells = {
    get state() { return { data, sel, dirty }; },
    getWorking() { return data; },
    load() { data = clone(S.exportCurrent()); sel = 0; dirty = false; },
    revert() { data = clone(S.exportDefaults()); sel = 0; dirty = true; if (bodyEl) render(); },
    applyToEngine() { S.applyData(clone(data)); },
    async save() { await api.data.save('spells', 'SPELLS_DATA', data); MT.applyToEngine(); dirty = false; if (api) api.toast('Spells saved · ' + data.tree.length); if (bodyEl) render(); return true; },
    select(i) { sel = i; if (bodyEl) render(); },
    uniqueId(base) { base = (base || 'spell').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'spell'; let n = base, i = 1; const has = x => data.tree.some(s => s.id === x); while (has(n)) n = base + (++i); return n; },
    addSpell(src) { const from = (src != null && data.tree[src]) || data.tree[sel] || { id: 'spell', name: 'New Spell', cast: 'Cast', tiers: ['', '', ''], cost: [0, 0, 0] }; const s = clone(from); s.id = MT.uniqueId(src != null ? s.id : 'spell'); if (src == null) s.name = 'New Spell'; data.tree.push(s); sel = data.tree.length - 1; dirty = true; if (bodyEl) render(); return s.id; },
    duplicateSpell(i) { return MT.addSpell(i == null ? sel : i); },
    removeSpell(i) { i = i == null ? sel : i; if (data.tree.length <= 1) return false; data.tree.splice(i, 1); if (sel >= data.tree.length) sel = data.tree.length - 1; dirty = true; if (bodyEl) render(); return true; },
    setId(i, v) { v = (v || '').trim(); if (!v || data.tree.some((s, j) => j !== i && s.id === v)) return false; data.tree[i].id = v; dirty = true; return true; },
    setField(i, key, v) { data.tree[i][key] = v; dirty = true; },
    setTier(i, t, v) { data.tree[i].tiers[t] = v; dirty = true; },
    setCost(i, t, v) { data.tree[i].cost[t] = v | 0; dirty = true; },
    toggleElement(i, on) { data.tree[i].element = !!on; dirty = true; },
    isBuiltin: id => BUILTIN.indexOf(id) >= 0,
    openInTool() { return T.openTool('spells'); }
  };

  function el(t, a, p, x) { return api.el(t, a, p, x); }
  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column';
    const head = el('div', { style: 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line)' }, bodyEl);
    el('button', { class: 'tbtn play', onclick: () => MT.save().catch(e => api.toast('Save failed: ' + e.message)) }, head, '💾 Save spells');
    el('button', { class: 'tbtn', onclick: () => { if (confirm('Replace the spell tree with the built-in defaults?')) MT.revert(); } }, head, '↺ Revert');
    el('span', { class: 'tc-mut' }, head, dirty ? '● unsaved' : 'saved ✓');
    el('div', { style: 'flex:1' }, head);
    el('span', { class: 'tc-mut' }, head, data.tree.length + ' spells');
    const grid = el('div', { style: 'flex:1;display:grid;grid-template-columns:200px 1fr;gap:0;min-height:0' }, bodyEl);
    const left = el('div', { style: 'display:flex;flex-direction:column;border-right:1px solid var(--line);min-height:0' }, grid);
    const list = el('div', { style: 'flex:1;overflow:auto;padding:8px' }, left);
    data.tree.forEach((s, i) => {
      const row = el('div', { class: 'tc-pal-item' + (i === sel ? ' sel' : ''), style: 'padding:5px 8px' }, list);
      el('span', {}, row, s.name);
      if (s.element) el('span', { class: 'tc-pill done', style: 'margin-left:auto' }, row, 'elem');
      row.addEventListener('click', () => MT.select(i));
    });
    const btns = el('div', { style: 'display:flex;gap:4px;padding:8px;border-top:1px solid var(--line)' }, left);
    el('button', { class: 'tbtn', onclick: () => MT.addSpell() }, btns, '+ New');
    el('button', { class: 'tbtn', onclick: () => MT.duplicateSpell() }, btns, '⧉');
    el('button', { class: 'tbtn', onclick: () => { if (!MT.removeSpell()) api.toast('Keep at least one spell.'); } }, btns, '🗑');
    renderSpell(el('div', { style: 'overflow:auto;padding:12px 14px;min-height:0' }, grid));
  }

  function renderSpell(host) {
    const s = data.tree[sel]; if (!s) { el('div', { class: 'tc-mut' }, host, 'Select a spell.'); return; }
    const rId = el('div', { class: 'tc-row' }, host); el('label', {}, rId, 'Id'); const idInp = el('input', { type: 'text' }, rId); idInp.value = s.id;
    idInp.addEventListener('change', () => { if (!MT.setId(sel, idInp.value)) { idInp.value = s.id; api.toast('Id in use or invalid.'); } });
    if (MT.isBuiltin(s.id)) el('div', { class: 'tc-mut', style: 'margin:2px 0 6px' }, host, 'Built-in spell — the game’s cast logic is keyed to id “' + s.id + '”. Tune its name, costs and text freely, but renaming the id detaches the mechanics.');
    const rN = el('div', { class: 'tc-row' }, host); el('label', {}, rN, 'Name'); const nInp = el('input', { type: 'text' }, rN); nInp.value = s.name;
    nInp.addEventListener('input', () => MT.setField(sel, 'name', nInp.value)); nInp.addEventListener('change', render);
    const rC = el('div', { class: 'tc-row' }, host); el('label', {}, rC, 'Cast hint'); const cInp = el('input', { type: 'text' }, rC); cInp.value = s.cast;
    cInp.addEventListener('input', () => MT.setField(sel, 'cast', cInp.value));
    const rE = el('div', { class: 'tc-row' }, host); const cb = el('input', { type: 'checkbox' }, rE); cb.checked = !!s.element;
    el('label', { style: 'width:auto' }, rE, 'Element (attunes Soul Bolt rather than a separate cast)');
    cb.addEventListener('change', () => { MT.toggleElement(sel, cb.checked); render(); });
    el('h4', { style: 'margin:12px 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:var(--txt2)' }, host, 'Tiers (description · Glimmer cost)');
    ['Base / locked', 'Tier 1', 'Tier 2'].forEach((lab, t) => {
      const card = el('div', { class: 'tc-card', style: 'margin:6px 0' }, host);
      const top = el('div', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:4px' }, card);
      el('span', { class: 'tc-pill planned' }, top, lab);
      el('div', { style: 'flex:1' }, top);
      el('span', { class: 'tc-mut' }, top, 'cost');
      const cost = el('input', { type: 'number', min: '0', max: '999', style: 'width:80px' }, top); cost.value = s.cost[t];
      cost.addEventListener('change', () => MT.setCost(sel, t, +cost.value));
      const ta = el('textarea', { rows: '2', style: 'width:100%;background:var(--bg3);color:var(--txt);border:1px solid #45454d;border-radius:5px;padding:5px 7px;font-size:13px' }, card); ta.value = s.tiers[t];
      ta.addEventListener('input', () => MT.setTier(sel, t, ta.value));
    });
  }

  T.registerTool({
    id: 'spells', label: 'Spell designer', icon: '🪄', group: 'Content',
    sub: 'names, tiers, costs & bolt elements',
    build(host, a) { api = a; bodyEl = host; if (!data) MT.load(); render(); }
  });
  if (T.roadmapDone) T.roadmapDone(12);
})();
