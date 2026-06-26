// MOSSVEIL — tool-moves.js : the Attack / move editor (Edit ▸ Content).  Roadmap #10.
// The boss/enemy move library (leap, slash, rain, volley, ring, summon, spikes, swoop, orbs, burrow)
// has bespoke behaviours in code, but every number that gives an attack its FEEL — telegraph time,
// damage, projectile counts / speeds / spread, leap power — is now data. This tool tunes those
// per move (src/bosses.js -> data/moves.js = G.MOVES_DATA), shows which bosses use each move, and
// applies live. Authoring brand-new move TYPES still needs code; this tunes the ten that exist.
// Dataset tool (data-layer save), fully offline.
(function () {
  const T = G.Tools, B = G.Bosses;
  if (!T || !B || !B.MOVE_SCHEMA) return;
  const clone = o => JSON.parse(JSON.stringify(o));

  function el(tag, attrs, parent, text) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'style') e.style.cssText = attrs[k];
      else if (k.startsWith('on') && typeof attrs[k] === 'function') e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    }
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  const ICON = { leap: '🦗', slash: '🗡', rain: '🌧', volley: '➹', ring: '◎', summon: '🐛', spikes: '⩕', swoop: '🦅', orbs: '🔮', burrow: '⛏' };
  const moveIds = () => Object.keys(B.MOVE_SCHEMA);

  let data = null, sel = null, dirty = false, bodyEl = null, api = null;
  const MT = T.moves = {
    get state() { return { data, sel, dirty }; },
    moves: moveIds,
    schema: id => B.MOVE_SCHEMA[id] || [],
    usedBy: id => (B.movesUsedBy ? B.movesUsedBy(id) : []),
    getWorking() { return data; },
    load() { data = clone(B.exportMoveCurrent()); sel = moveIds()[0]; dirty = false; },
    revert() { data = clone(B.exportMoveDefaults()); dirty = true; MT.applyToEngine(); if (bodyEl) render(); },
    select(id) { sel = id; if (bodyEl) render(); },
    set(id, key, v) { if (!data[id]) data[id] = {}; data[id][key] = +v; dirty = true; MT.applyToEngine(); if (bodyEl) syncStatus(); },
    applyToEngine() { B.applyMoveData(clone(data)); },
    async save() { await api.data.save('moves', 'MOVES_DATA', data); MT.applyToEngine(); dirty = false; if (api) api.toast('Move parameters saved'); if (bodyEl) syncStatus(); return true; },
    openInTool() { return T.openTool('moves'); }
  };

  let statusEl = null;
  function syncStatus() { if (statusEl) statusEl.textContent = dirty ? '● unsaved' : 'saved ✓'; }

  function render() {
    bodyEl.innerHTML = ''; bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column';
    const head = el('div', { style: 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line)' }, bodyEl);
    el('button', { class: 'tbtn play', onclick: () => MT.save().catch(e => api.toast('Save failed: ' + e.message)) }, head, '💾 Save moves');
    el('button', { class: 'tbtn', onclick: () => { if (confirm('Reset every move to its built-in tuning?')) MT.revert(); } }, head, '↺ Revert all');
    statusEl = el('span', { class: 'tc-mut' }, head); syncStatus();
    el('div', { style: 'flex:1' }, head);
    el('span', { class: 'tc-mut' }, head, moveIds().length + ' moves');

    const grid = el('div', { style: 'flex:1;display:grid;grid-template-columns:200px 1fr;gap:0;min-height:0' }, bodyEl);
    const left = el('div', { style: 'overflow:auto;border-right:1px solid var(--line);padding:8px;min-height:0' }, grid);
    moveIds().forEach(id => {
      const used = MT.usedBy(id).length;
      const row = el('div', { class: 'tc-pal-item' + (id === sel ? ' sel' : ''), style: 'padding:5px 8px;display:flex;align-items:center;gap:6px' }, left);
      el('span', { style: 'flex:1' }, row, (ICON[id] || '•') + ' ' + id);
      el('span', { class: 'tc-pill ' + (used ? 'done' : 'planned'), title: used + ' boss' + (used === 1 ? '' : 'es') + ' use this' }, row, String(used));
      row.addEventListener('click', () => MT.select(id));
    });
    renderMove(el('div', { style: 'overflow:auto;padding:14px 16px;min-height:0' }, grid));
  }

  function renderMove(host) {
    if (!sel) { el('div', { class: 'tc-mut' }, host, 'Select a move.'); return; }
    el('h3', { style: 'margin:0 0 2px' }, host, (ICON[sel] || '•') + '  ' + sel);
    const used = MT.usedBy(sel);
    el('div', { class: 'tc-mut', style: 'margin-bottom:10px' }, host, used.length ? 'Used by: ' + used.map(b => b.label).join(', ') : 'Not used by any boss yet — assign it in the Boss designer.');

    const def = B.exportMoveDefaults()[sel] || {};
    MT.schema(sel).forEach(([key, label, min, max, step]) => {
      const r = el('div', { class: 'tc-row' }, host);
      el('label', { title: key, style: 'width:140px' }, r, label);
      const cur = data[sel][key];
      const rng = el('input', { type: 'range', min, max, step, value: cur }, r);
      const num = el('input', { type: 'number', min, max, step, value: cur, style: 'width:78px;flex:0 0 auto' }, r);
      const dflt = el('span', { class: 'tc-mut', style: 'width:64px;text-align:right;font-size:11px', title: 'built-in default' }, r, 'def ' + def[key]);
      const onSet = v => { rng.value = v; num.value = v; MT.set(sel, key, v); dflt.style.color = (+v === def[key]) ? '' : 'var(--acc)'; };
      rng.addEventListener('input', () => onSet(rng.value));
      num.addEventListener('change', () => onSet(num.value));
      if (cur !== def[key]) dflt.style.color = 'var(--acc)';
    });
    el('div', { class: 'tc-mut', style: 'margin-top:12px;font-size:11px' }, host,
      'Changes apply on the next boss attack. Telegraph is the warning time before the hit lands; set Damage to 0 for a pure-telegraph (fake-out) attack.');
  }

  T.registerTool({
    id: 'moves', label: 'Attack / move editor', icon: '⚔', group: 'Content',
    sub: 'tune the feel of every boss attack',
    build(host, a) { api = a; bodyEl = host; if (!data) MT.load(); render(); }
  });
  if (T.roadmapDone) T.roadmapDone(10);
})();
