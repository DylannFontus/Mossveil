// MOSSVEIL — tool-achievements.js : the Achievements editor (Edit ▸ Systems).
// Authors achievements/trophies (src/achievements.js -> data/achievements.js). Each has a name, a
// description and a declarative condition checked against the save at save-time. Fully offline.
(function () {
  const T = G.Tools, A = G.Achievements;
  if (!T || !A || !A.exportDefaults) return;
  const clone = o => JSON.parse(JSON.stringify(o));
  const COND_LABELS = {
    bossCount: 'Bosses defeated ≥ N', boss: 'Specific boss defeated', charmCount: 'Charms owned ≥ N',
    charm: 'Specific charm owned', allCharms: 'All charms owned', spell: 'Spell learned',
    anySpell: 'Any of these spells learned', glimmer: 'Glimmer held ≥ N', nail: 'Nail level ≥ N'
  };
  const NEEDS_N = ['bossCount', 'charmCount', 'glimmer', 'nail'];
  const NEEDS_ID = ['boss', 'charm', 'spell'];

  let data = null, sel = null, dirty = false, bodyEl = null, api = null;
  const ids = () => data.list.map(a => a.id);
  const MT = T.achievements = {
    get state() { return { data, sel, dirty }; },
    getWorking() { return data; },
    load() { data = clone(A.exportCurrent()); sel = 0; dirty = false; },
    revert() { data = clone(A.exportDefaults()); sel = 0; dirty = true; if (bodyEl) render(); },
    applyToEngine() { A.applyData(clone(data)); },
    async save() { await api.data.save('achievements', 'ACHIEVEMENTS_DATA', data); MT.applyToEngine(); dirty = false; if (api) api.toast('Achievements saved · ' + data.list.length); if (bodyEl) render(); return true; },
    select(i) { sel = i; if (bodyEl) render(); },
    uniqueId(base) { base = (base || 'ach').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'ach'; let n = base, i = 1; const has = x => data.list.some(a => a.id === x); while (has(n)) n = base + (++i); return n; },
    addAch(src) { const from = (src != null && data.list[src]) || data.list[sel] || { id: 'ach', name: 'New Achievement', desc: '', cond: { type: 'glimmer', n: 100 } }; const a = clone(from); a.id = MT.uniqueId(src != null ? a.id : 'ach'); if (src == null) a.name = 'New Achievement'; data.list.push(a); sel = data.list.length - 1; dirty = true; if (bodyEl) render(); return a.id; },
    duplicateAch(i) { return MT.addAch(i == null ? sel : i); },
    removeAch(i) { i = i == null ? sel : i; if (data.list.length <= 1) return false; data.list.splice(i, 1); if (sel >= data.list.length) sel = data.list.length - 1; dirty = true; if (bodyEl) render(); return true; },
    setId(i, v) { v = (v || '').trim(); if (!v || data.list.some((a, j) => j !== i && a.id === v)) return false; data.list[i].id = v; dirty = true; return true; },
    setField(i, key, v) { data.list[i][key] = v; dirty = true; },
    setCondType(i, type) { data.list[i].cond = { type }; if (NEEDS_N.includes(type)) data.list[i].cond.n = 1; if (NEEDS_ID.includes(type)) data.list[i].cond.id = ''; if (type === 'anySpell') data.list[i].cond.ids = ['ember', 'frost', 'gale']; dirty = true; },
    setCondParam(i, key, v) { data.list[i].cond[key] = v; dirty = true; },
    openInTool() { return T.openTool('achievements'); }
  };

  function el(t, a, p, x) { return api.el(t, a, p, x); }
  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column';
    const head = el('div', { style: 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line)' }, bodyEl);
    el('button', { class: 'tbtn play', onclick: () => MT.save().catch(e => api.toast('Save failed: ' + e.message)) }, head, '💾 Save achievements');
    el('button', { class: 'tbtn', onclick: () => { if (confirm('Replace achievements with the built-in defaults?')) MT.revert(); } }, head, '↺ Revert');
    el('span', { class: 'tc-mut' }, head, dirty ? '● unsaved' : 'saved ✓');
    el('div', { style: 'flex:1' }, head);
    el('span', { class: 'tc-mut' }, head, data.list.length + ' achievements');
    const grid = el('div', { style: 'flex:1;display:grid;grid-template-columns:220px 1fr;gap:0;min-height:0' }, bodyEl);
    const left = el('div', { style: 'display:flex;flex-direction:column;border-right:1px solid var(--line);min-height:0' }, grid);
    const list = el('div', { style: 'flex:1;overflow:auto;padding:8px' }, left);
    data.list.forEach((a, i) => {
      const row = el('div', { class: 'tc-pal-item' + (i === sel ? ' sel' : ''), style: 'padding:5px 8px' }, list);
      el('span', {}, row, '🏆 ' + a.name);
      row.addEventListener('click', () => MT.select(i));
    });
    const btns = el('div', { style: 'display:flex;gap:4px;padding:8px;border-top:1px solid var(--line)' }, left);
    el('button', { class: 'tbtn', onclick: () => MT.addAch() }, btns, '+ New');
    el('button', { class: 'tbtn', onclick: () => MT.duplicateAch() }, btns, '⧉');
    el('button', { class: 'tbtn', onclick: () => { if (!MT.removeAch()) api.toast('Keep at least one.'); } }, btns, '🗑');
    renderAch(el('div', { style: 'overflow:auto;padding:12px 14px;min-height:0' }, grid));
  }

  function renderAch(host) {
    const a = data.list[sel]; if (!a) { el('div', { class: 'tc-mut' }, host, 'Select an achievement.'); return; }
    const rId = el('div', { class: 'tc-row' }, host); el('label', {}, rId, 'Id'); const idInp = el('input', { type: 'text' }, rId); idInp.value = a.id;
    idInp.addEventListener('change', () => { if (!MT.setId(sel, idInp.value)) { idInp.value = a.id; api.toast('Id in use or invalid.'); } });
    const rN = el('div', { class: 'tc-row' }, host); el('label', {}, rN, 'Name'); const nInp = el('input', { type: 'text' }, rN); nInp.value = a.name;
    nInp.addEventListener('input', () => MT.setField(sel, 'name', nInp.value)); nInp.addEventListener('change', render);
    const rD = el('div', { class: 'tc-row', style: 'align-items:flex-start' }, host); el('label', {}, rD, 'Description'); const dInp = el('textarea', { rows: '2', style: 'flex:1;background:var(--bg3);color:var(--txt);border:1px solid #45454d;border-radius:5px;padding:5px 7px;font-size:13px' }, rD); dInp.value = a.desc;
    dInp.addEventListener('input', () => MT.setField(sel, 'desc', dInp.value));
    el('h4', { style: 'margin:12px 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:var(--txt2)' }, host, 'Unlock condition');
    const rC = el('div', { class: 'tc-row' }, host); el('label', {}, rC, 'When'); const cSel = el('select', {}, rC);
    A.CONDS.forEach(t => { const o = el('option', { value: t }, cSel, COND_LABELS[t] || t); if (t === a.cond.type) o.selected = true; });
    cSel.addEventListener('change', () => { MT.setCondType(sel, cSel.value); render(); });
    if (NEEDS_N.includes(a.cond.type)) { const r = el('div', { class: 'tc-row' }, host); el('label', {}, r, 'N ='); const inp = el('input', { type: 'number', min: '1', max: '9999' }, r); inp.value = a.cond.n || 1; inp.addEventListener('change', () => MT.setCondParam(sel, 'n', +inp.value)); }
    if (NEEDS_ID.includes(a.cond.type)) { const r = el('div', { class: 'tc-row' }, host); el('label', {}, r, 'Id'); const inp = el('input', { type: 'text', placeholder: a.cond.type + ' id' }, r); inp.value = a.cond.id || ''; inp.addEventListener('change', () => MT.setCondParam(sel, 'id', inp.value.trim())); }
    if (a.cond.type === 'anySpell') { const r = el('div', { class: 'tc-row' }, host); el('label', {}, r, 'Spell ids'); const inp = el('input', { type: 'text', placeholder: 'ember, frost, gale' }, r); inp.value = (a.cond.ids || []).join(', '); inp.addEventListener('change', () => MT.setCondParam(sel, 'ids', inp.value.split(',').map(s => s.trim()).filter(Boolean))); }
    // live status vs current save
    const met = A.evalCond(a.cond, G.save || {});
    el('div', { class: 'tc-card', style: 'margin-top:10px' }, host).appendChild(el('span', { class: 'tc-pill ' + (met ? 'done' : 'planned') }, null, met ? 'condition met by current save' : 'not yet met by current save'));
  }

  T.registerTool({
    id: 'achievements', label: 'Achievements', icon: '🏆', group: 'Systems',
    sub: 'trophies & unlock conditions',
    build(host, a) { api = a; bodyEl = host; if (!data) MT.load(); render(); }
  });
  if (T.roadmapDone) T.roadmapDone(88);
})();
