// MOSSVEIL — tool-bestiary.js : the in-engine Journal / bestiary editor (Edit ▸ Narrative).
// Authors the Hunter's Journal lore (src/enemies.js E.BESTIARY -> data/bestiary.js). One entry per
// enemy type; the lore shows in the in-game Journal. Fully offline, editor-only.
(function () {
  const T = G.Tools, E = G.Enemies;
  if (!T || !E || !E.exportBestiaryDefaults) return;
  const clone = o => JSON.parse(JSON.stringify(o));
  const TYPES = (E.TYPES || []).slice();

  let data = null, sel = null, dirty = false, bodyEl = null, api = null;
  const MT = T.bestiary = {
    get state() { return { data, sel, dirty }; },
    getWorking() { return data; },
    load() { data = clone(E.exportBestiaryCurrent()); sel = TYPES[0] && TYPES[0].id; dirty = false; },
    revert() { data = clone(E.exportBestiaryDefaults()); dirty = true; if (bodyEl) render(); },
    applyToEngine() { E.applyBestiaryData(clone(data)); },
    async save() { await api.data.save('bestiary', 'BESTIARY_DATA', data); MT.applyToEngine(); dirty = false; if (api) api.toast('Bestiary saved'); if (bodyEl) render(); return true; },
    select(id) { sel = id; if (bodyEl) render(); },
    lore(id) { return (data.lore && data.lore[id]) || ''; },
    setLore(id, v) { data.lore = data.lore || {}; data.lore[id] = v; dirty = true; },
    openInTool() { return T.openTool('bestiary'); }
  };

  function el(t, a, p, x) { return api.el(t, a, p, x); }
  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column';
    const head = el('div', { style: 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line)' }, bodyEl);
    el('button', { class: 'tbtn play', onclick: () => MT.save().catch(e => api.toast('Save failed: ' + e.message)) }, head, '💾 Save bestiary');
    el('button', { class: 'tbtn', onclick: () => { if (confirm('Restore all journal lore to the built-in text?')) MT.revert(); } }, head, '↺ Revert');
    el('span', { class: 'tc-mut' }, head, dirty ? '● unsaved' : 'saved ✓');
    el('div', { style: 'flex:1' }, head);
    el('span', { class: 'tc-mut' }, head, TYPES.length + ' creatures');
    const grid = el('div', { style: 'flex:1;display:grid;grid-template-columns:230px 1fr;gap:0;min-height:0' }, bodyEl);
    const left = el('div', { style: 'overflow:auto;border-right:1px solid var(--line);padding:8px;min-height:0' }, grid);
    TYPES.forEach(t => {
      const row = el('div', { class: 'tc-pal-item' + (t.id === sel ? ' sel' : ''), style: 'padding:5px 8px' }, left);
      el('span', {}, row, t.label);
      if (!MT.lore(t.id)) el('span', { class: 'tc-pill planned', style: 'margin-left:auto' }, row, 'empty');
      row.addEventListener('click', () => MT.select(t.id));
    });
    const right = el('div', { style: 'overflow:auto;padding:14px 16px;min-height:0' }, grid);
    renderEntry(right);
  }

  function renderEntry(host) {
    const t = TYPES.find(x => x.id === sel); if (!t) { el('div', { class: 'tc-mut' }, host, 'Select a creature.'); return; }
    el('h3', { style: 'margin:0 0 2px' }, host, t.label);
    el('div', { class: 'tc-mut', style: 'margin-bottom:10px' }, host, 'Id: ' + t.id + ' · this text appears in the Hunter’s Journal when the player encounters it.');
    const ta = el('textarea', { rows: '6', style: 'width:100%;background:var(--bg3);color:var(--txt);border:1px solid #45454d;border-radius:6px;padding:8px 10px;font-size:14px;line-height:1.5' }, host);
    ta.value = MT.lore(sel);
    ta.addEventListener('input', () => MT.setLore(sel, ta.value));
    ta.addEventListener('change', render);
    const len = el('div', { class: 'tc-mut', style: 'margin-top:6px' }, host, ta.value.length + ' characters');
    ta.addEventListener('input', () => len.textContent = ta.value.length + ' characters');
  }

  T.registerTool({
    id: 'bestiary', label: 'Journal / bestiary', icon: '📖', group: 'Narrative',
    sub: 'Hunter’s Journal lore per creature',
    build(host, a) { api = a; bodyEl = host; if (!data) MT.load(); render(); }
  });
  if (T.roadmapDone) T.roadmapDone(26);
})();
