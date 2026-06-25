// MOSSVEIL — tool-charms.js : the in-engine Charm designer (Edit ▸ Content).
// Authors the charm set + synergies that used to be hard-coded in src/charms.js. Each charm has a
// cost (notches) and a data-driven effects block (additive masks/damage, multiplicative dash /
// focus / soul). Saves to data/charms.js (window.G.CHARMS); the game reads that as the source of
// truth, so charms can be added / edited / removed forever. Fully offline, editor-only.
(function () {
  const T = G.Tools, C = G.Charms;
  if (!T || !C) return;
  const clone = o => JSON.parse(JSON.stringify(o));
  const DEFAULT_CHARM = { id: 'charm', name: 'New Charm', cost: 1, desc: '', effects: {} };
  // each effect key: [label, kind ('add'|'mul'), min, max, step, default]
  const FX = {
    hp: ['Masks (HP)', 'add', -3, 5, 1, 0],
    nail: ['Nail damage', 'add', -3, 6, 1, 0],
    dashMul: ['Dash cooldown ×', 'mul', 0.2, 1.5, 0.05, 1],
    focusMul: ['Focus time ×', 'mul', 0.2, 1.5, 0.05, 1],
    soulMul: ['Soul gain ×', 'mul', 0.5, 3, 0.05, 1]
  };
  function fxSummary(e) {
    const p = [];
    if (e.hp) p.push((e.hp > 0 ? '+' : '') + e.hp + ' mask' + (Math.abs(e.hp) !== 1 ? 's' : ''));
    if (e.nail) p.push((e.nail > 0 ? '+' : '') + e.nail + ' damage');
    if (e.dashMul != null) p.push('dash cd ×' + e.dashMul);
    if (e.focusMul != null) p.push('focus ×' + e.focusMul);
    if (e.soulMul != null) p.push('soul ×' + e.soulMul);
    return p.length ? p.join(', ') : 'no stat effect';
  }

  // ---------------- controller (also the test API: G.Tools.charms) ----------------
  let data = null, selI = 0, dirty = false, bodyEl = null, api = null, subTab = 'charms';
  const MT = T.charms = {
    get state() { return { data, selI, dirty }; },
    getWorking() { return data; },
    load() { data = clone(C.exportCurrent()); selI = 0; dirty = false; },
    revert() { data = clone(C.exportDefaults()); selI = 0; dirty = true; if (bodyEl) render(); },
    applyToEngine() { C.applyData(clone(data)); },
    async save() {
      await api.data.save('charms', 'CHARMS', data);
      MT.applyToEngine(); dirty = false;
      if (api && api.toast) api.toast('Charms saved · ' + data.list.length + ' charms');
      if (bodyEl) render();
      return true;
    },
    select(i) { selI = i; if (bodyEl) render(); },
    uniqueId(base) { base = (base || 'charm').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'charm'; let id = base, i = 1; const has = x => data.list.some(c => c.id === x); while (has(id)) id = base + (++i); return id; },
    addCharm(src) {
      const from = (src != null && data.list[src]) || data.list[selI] || DEFAULT_CHARM;
      const c = clone(from); c.id = MT.uniqueId(src != null ? c.id : 'charm'); if (src == null) c.name = 'New Charm';
      data.list.push(c); selI = data.list.length - 1; dirty = true; if (bodyEl) render(); return c.id;
    },
    duplicateCharm(i) { return MT.addCharm(i == null ? selI : i); },
    removeCharm(i) {
      i = i == null ? selI : i;
      if (data.list.length <= 1) return false;
      const id = data.list[i].id;
      data.list.splice(i, 1);
      data.synergies.forEach(s => { s.need = s.need.filter(n => n !== id); });
      data.synergies = data.synergies.filter(s => s.need.length >= 2);   // drop synergies left with <2 charms
      if (selI >= data.list.length) selI = data.list.length - 1;
      dirty = true; if (bodyEl) render(); return true;
    },
    setCharm(i, key, val) {
      const c = data.list[i]; if (!c) return;
      if (key === 'id') { val = (val || '').trim(); if (!val || data.list.some((x, j) => j !== i && x.id === val)) return false; const old = c.id; c.id = val; data.synergies.forEach(s => { s.need = s.need.map(n => n === old ? val : n); }); }
      else if (key === 'cost') c.cost = Math.max(0, val | 0);
      else c[key] = val;
      dirty = true; return true;
    },
    setEffect(i, key, val) {
      const c = data.list[i]; if (!c) return;
      const def = FX[key][5], kind = FX[key][1];
      c.effects = c.effects || {};
      if ((kind === 'add' && val === 0) || (kind === 'mul' && Math.abs(val - 1) < 1e-9)) delete c.effects[key];
      else c.effects[key] = val;
      dirty = true;
    },
    // synergies
    addSynergy() { data.synergies.push({ need: data.list.slice(0, 2).map(c => c.id), name: 'New Synergy', desc: '', effects: {} }); dirty = true; if (bodyEl) render(); },
    removeSynergy(i) { data.synergies.splice(i, 1); dirty = true; if (bodyEl) render(); },
    setSynergy(i, key, val) { const s = data.synergies[i]; if (!s) return; s[key] = val; dirty = true; },
    toggleSynNeed(i, id) { const s = data.synergies[i]; const k = s.need.indexOf(id); if (k >= 0) s.need.splice(k, 1); else s.need.push(id); dirty = true; },
    setSynEffect(i, key, val) { const s = data.synergies[i]; if (!s) return; const kind = FX[key][1]; s.effects = s.effects || {}; if ((kind === 'add' && val === 0) || (kind === 'mul' && Math.abs(val - 1) < 1e-9)) delete s.effects[key]; else s.effects[key] = val; dirty = true; },
    openInTool() { return T.openTool('charms'); }
  };

  // ---------------- UI ----------------
  function el(t, a, p, x) { return api.el(t, a, p, x); }
  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column';
    const head = el('div', { style: 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line)' }, bodyEl);
    el('button', { class: 'tbtn play', onclick: () => MT.save().catch(e => api.toast('Save failed: ' + e.message)) }, head, '💾 Save charms');
    el('button', { class: 'tbtn', onclick: () => { if (confirm('Replace all charms with the built-in defaults? (not saved until you Save)')) MT.revert(); } }, head, '↺ Revert');
    el('span', { class: 'tc-mut' }, head, dirty ? '● unsaved' : 'saved ✓');
    el('div', { style: 'flex:1' }, head);
    el('span', { class: 'tc-mut' }, head, data.list.length + ' charms · ' + data.synergies.length + ' synergies');
    const tabs = el('div', { style: 'display:flex;gap:4px;padding:8px 14px 0' }, bodyEl);
    [['charms', '🔮 Charms'], ['syn', '✦ Synergies']].forEach(([id, lab]) => {
      el('button', { class: 'tbtn' + (subTab === id ? ' on' : ''), onclick: () => { subTab = id; render(); } }, tabs, lab);
    });
    const c = el('div', { style: 'flex:1;overflow:auto;padding:12px 14px' }, bodyEl);
    if (subTab === 'charms') renderCharms(c); else renderSyn(c);
  }

  function renderCharms(host) {
    const grid = el('div', { style: 'display:grid;grid-template-columns:230px 1fr;gap:14px;height:100%' }, host);
    const left = el('div', { style: 'display:flex;flex-direction:column;min-height:0' }, grid);
    const list = el('div', { class: 'tc-card', style: 'flex:1;overflow:auto;padding:6px' }, left);
    data.list.forEach((c, i) => {
      const row = el('div', { class: 'tc-pal-item' + (i === selI ? ' sel' : ''), style: 'padding:6px 9px' }, list);
      el('span', {}, row, c.name);
      el('span', { class: 'pal-hint' }, row, c.cost + '◈');
      row.addEventListener('click', () => MT.select(i));
    });
    const btns = el('div', { style: 'display:flex;gap:4px;margin-top:6px' }, left);
    el('button', { class: 'tbtn', onclick: () => MT.addCharm() }, btns, '+ New');
    el('button', { class: 'tbtn', onclick: () => MT.duplicateCharm() }, btns, '⧉ Dup');
    el('button', { class: 'tbtn', onclick: () => { if (!MT.removeCharm()) api.toast('Keep at least one charm.'); } }, btns, '🗑 Del');

    const c = data.list[selI];
    const right = el('div', { style: 'overflow:auto;min-height:0' }, grid);
    if (!c) { el('div', { class: 'tc-mut' }, right, 'Select a charm.'); return; }
    const rId = el('div', { class: 'tc-row' }, right); el('label', {}, rId, 'Id'); const idInp = el('input', { type: 'text' }, rId); idInp.value = c.id;
    idInp.addEventListener('change', () => { if (MT.setCharm(selI, 'id', idInp.value) === false) { idInp.value = c.id; api.toast('Id in use or invalid.'); } });
    const rN = el('div', { class: 'tc-row' }, right); el('label', {}, rN, 'Name'); const nInp = el('input', { type: 'text' }, rN); nInp.value = c.name;
    nInp.addEventListener('input', () => MT.setCharm(selI, 'name', nInp.value)); nInp.addEventListener('change', render);
    const rC = el('div', { class: 'tc-row' }, right); el('label', {}, rC, 'Cost (notches)'); const cInp = el('input', { type: 'number', min: '0', max: '9' }, rC); cInp.value = c.cost;
    cInp.addEventListener('change', () => { MT.setCharm(selI, 'cost', +cInp.value); render(); });
    const rD = el('div', { class: 'tc-row', style: 'align-items:flex-start' }, right); el('label', {}, rD, 'Description'); const dInp = el('textarea', { rows: '2' }, rD); dInp.value = c.desc;
    dInp.addEventListener('input', () => MT.setCharm(selI, 'desc', dInp.value));
    el('h4', { style: 'margin:14px 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:var(--txt2)' }, right, 'Effects');
    Object.keys(FX).forEach(key => effectRow(right, c.effects || {}, key, v => MT.setEffect(selI, key, v)));
    const sum = el('div', { class: 'tc-card', style: 'margin-top:10px' }, right);
    el('span', { class: 'tc-mut' }, sum, 'Equip effect: '); el('span', {}, sum, fxSummary(c.effects || {}));
  }

  function effectRow(parent, effects, key, onChange) {
    const [label, kind, min, max, step, dflt] = FX[key];
    const cur = effects[key] != null ? effects[key] : dflt;
    const r = el('div', { class: 'tc-row' }, parent); el('label', {}, r, label);
    const inp = el('input', { type: 'range', min, max, step }, r); inp.value = cur;
    const lbl = el('span', { class: 'tc-mut', style: 'width:54px;text-align:right' }, r, kind === 'mul' ? '×' + (+cur).toFixed(2) : (cur > 0 ? '+' + cur : '' + cur));
    inp.addEventListener('input', () => { const v = kind === 'mul' ? +(+inp.value).toFixed(2) : Math.round(+inp.value); onChange(v); lbl.textContent = kind === 'mul' ? '×' + v.toFixed(2) : (v > 0 ? '+' + v : '' + v); });
  }

  function renderSyn(host) {
    el('div', { class: 'tc-mut', style: 'margin-bottom:10px' }, host, 'Bonus effects granted when a set of charms is equipped together. Tick the charms a synergy needs (2 or more).');
    data.synergies.forEach((s, i) => {
      const card = el('div', { class: 'tc-card', style: 'margin-bottom:10px' }, host);
      const top = el('div', { class: 'tc-row', style: 'margin-top:0' }, card);
      const nInp = el('input', { type: 'text', style: 'flex:0 0 200px' }, top); nInp.value = s.name;
      nInp.addEventListener('input', () => MT.setSynergy(i, 'name', nInp.value));
      el('div', { style: 'flex:1' }, top);
      el('button', { class: 'tbtn', onclick: () => MT.removeSynergy(i) }, top, '🗑');
      const dInp = el('input', { type: 'text', placeholder: 'description' }, el('div', { class: 'tc-row' }, card)); dInp.value = s.desc;
      dInp.addEventListener('input', () => MT.setSynergy(i, 'desc', dInp.value));
      el('div', { class: 'tc-mut', style: 'margin:6px 0 2px' }, card, 'Requires:');
      const needWrap = el('div', { style: 'display:flex;flex-wrap:wrap;gap:8px' }, card);
      data.list.forEach(c => {
        const lab = el('label', { class: 'tc-mut', style: 'display:flex;align-items:center;gap:4px' }, needWrap);
        const cb = el('input', { type: 'checkbox' }, lab); cb.checked = s.need.indexOf(c.id) >= 0;
        el('span', {}, lab, c.name);
        cb.addEventListener('change', () => MT.toggleSynNeed(i, c.id));
      });
      el('div', { class: 'tc-mut', style: 'margin:8px 0 2px' }, card, 'Bonus effects:');
      Object.keys(FX).forEach(key => effectRow(card, s.effects || {}, key, v => MT.setSynEffect(i, key, v)));
    });
    el('button', { class: 'tbtn', onclick: () => MT.addSynergy() }, host, '+ Add synergy');
  }

  T.registerTool({
    id: 'charms', label: 'Charm designer', icon: '🔮', group: 'Content',
    sub: 'author charms, costs, effects & synergies',
    build(host, a) { api = a; bodyEl = host; if (!data) MT.load(); render(); }
  });
  if (T.roadmapDone) T.roadmapDone(11);
})();
