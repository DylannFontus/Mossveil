// MOSSVEIL — tool-search.js : Search everything (Edit ▸ Tools).  Roadmap #48.
// One omni-search box over the WHOLE project: every level, prop, enemy, transition and spawn, plus a
// quick jump into the datasets. Type any text (a type, a signal name, a sign's words, a biome, a level
// title…) and every match lists with where it lives; click to open that room and select the exact
// object (it reuses the editor's own focus hook so it works for props, enemies, zones and spawns alike).
// Read-only — it never mutates the world; it only navigates. Editor-only, fully offline.
(function () {
  const T = G.Tools;
  if (!T) return;
  const ED = () => G.__ed || {};
  const levels = () => G.LEVELS || {};

  // ---- flatten the whole world into searchable records ----
  function index() {
    const out = [], L = levels();
    for (const id in L) {
      const lv = L[id], title = lv.title || id;
      out.push({ level: id, title, kind: 'level', label: title, sub: 'room · ' + (lv.biome || '?') + ' · ' + (lv.w || 0) + '×' + (lv.h || 0), terms: (id + ' ' + title + ' ' + (lv.biome || '') + ' room level').toLowerCase(), sel: null });
      (lv.props || []).forEach((p, i) => {
        const extra = [p.kind, p.signal, p.text, p.title, p.charm, p.boss, p.name, p.to, p.sound, p.grant].filter(Boolean).join(' ');
        out.push({ level: id, title, kind: 'prop', i, label: p.type + (p.kind ? ':' + p.kind : ''), sub: title + '  ·  ' + Math.round(p.x) + ',' + Math.round(p.y) + (extra ? '  ·  ' + extra.slice(0, 48) : ''), terms: (p.type + ' ' + extra + ' ' + title + ' prop').toLowerCase(), sel: { kind: 'prop', i } });
      });
      (lv.enemies || []).forEach((e, i) => out.push({ level: id, title, kind: 'enemy', i, label: e.type, sub: title + '  ·  ' + Math.round(e.x) + ',' + Math.round(e.y), terms: (e.type + ' ' + title + ' enemy foe creature').toLowerCase(), sel: { kind: 'enemy', i } }));
      (lv.transitions || []).forEach((t, i) => { const r = t.rect || t; out.push({ level: id, title, kind: 'zone', i, label: '→ ' + (t.to || '?'), sub: title + '  ·  to ' + (t.to || '?') + ' @ ' + (t.spawn || 'P'), terms: ((t.to || '') + ' ' + (t.spawn || '') + ' ' + title + ' transition exit portal door').toLowerCase(), sel: { kind: 'zone', i } }); });
      for (const key in (lv.spawns || {})) { const s = lv.spawns[key]; out.push({ level: id, title, kind: 'spawn', key, label: 'spawn ' + key, sub: title + '  ·  ' + Math.round(s.x) + ',' + Math.round(s.y), terms: ('spawn ' + key + ' ' + title + ' marker start').toLowerCase(), sel: { kind: 'spawn', key } }); }
    }
    return out;
  }

  function query(q) {
    q = String(q || '').trim().toLowerCase();
    const toks = q.split(/\s+/).filter(Boolean);
    let recs = index();
    if (toks.length) recs = recs.filter(r => toks.every(t => r.terms.includes(t)));
    return recs;
  }

  function jump(rec) {
    if (!rec || !levels()[rec.level]) return false;
    if (ED().openLevel) ED().openLevel(rec.level);
    if (rec.sel) {
      const c = ED().companion;
      if (c && c.focusSel) c.focusSel(rec.sel);
      else if (rec.sel.kind === 'prop' && ED().selectProp) ED().selectProp(rec.level, rec.sel.i);
    } else if (ED().setTab) ED().setTab('scene');
    T.closeTool();
    return true;
  }

  // =================== test / external API ===================
  T.search = {
    index, query,
    count: q => query(q).length,
    stats: () => { const all = index(), by = {}; all.forEach(r => by[r.kind] = (by[r.kind] || 0) + 1); return by; },
    jump, open: () => T.openTool('search')
  };

  // =================== UI ===================
  let bodyEl = null, api = null, inputEl = null, listEl = null, filter = 'all', q = '';
  function el(t, a, p, x) { return api.el(t, a, p, x); }
  const KINDS = [['all', 'All'], ['level', 'Rooms'], ['prop', 'Props'], ['enemy', 'Enemies'], ['zone', 'Exits'], ['spawn', 'Spawns']];
  const ICO = { level: '🗺', prop: '◆', enemy: '🐛', zone: '→', spawn: '⚑' };

  function renderList() {
    listEl.innerHTML = '';
    let recs = query(q);
    if (filter !== 'all') recs = recs.filter(r => r.kind === filter);
    const total = recs.length;
    recs = recs.slice(0, 300);
    if (!recs.length) { el('div', { class: 'tc-mut', style: 'padding:18px;text-align:center' }, listEl, q ? 'No matches for “' + q + '”.' : 'Type to search the whole project.'); return; }
    recs.forEach(r => {
      const row = el('div', { class: 'tc-pal-item', style: 'cursor:pointer;align-items:center;gap:9px' }, listEl);
      el('span', { style: 'width:18px;text-align:center;opacity:.85' }, row, ICO[r.kind] || '•');
      const txt = el('div', { style: 'flex:1;min-width:0' }, row);
      el('div', { style: 'color:var(--txt);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, txt, r.label);
      el('div', { class: 'tc-mut', style: 'font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, txt, r.sub);
      el('span', { class: 'pal-hint' }, row, r.kind);
      row.addEventListener('click', () => jump(r));
    });
    if (total > recs.length) el('div', { class: 'tc-mut', style: 'padding:8px 10px' }, listEl, '…and ' + (total - recs.length) + ' more — refine the search.');
  }

  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column;height:100%';
    const head = el('div', { style: 'padding:10px 12px;border-bottom:1px solid var(--line);display:flex;flex-direction:column;gap:8px' }, bodyEl);
    inputEl = el('input', { type: 'text', placeholder: 'Search every room, prop, enemy, exit, spawn…', value: q, style: 'background:var(--bg2);border:1px solid var(--line);border-radius:6px;color:var(--txt);font-size:14px;padding:9px 11px;outline:none' }, head);
    inputEl.addEventListener('input', () => { q = inputEl.value; renderList(); });
    const filters = el('div', { style: 'display:flex;gap:5px;flex-wrap:wrap' }, head);
    const st = T.search.stats();
    KINDS.forEach(([id, label]) => {
      const n = id === 'all' ? Object.values(st).reduce((a, b) => a + b, 0) : (st[id] || 0);
      const b = el('button', { class: 'tbtn' + (filter === id ? ' on' : ''), style: 'padding:3px 9px;font-size:11px' }, filters, label + ' · ' + n);
      b.addEventListener('click', () => { filter = id; [...filters.children].forEach(c => c.classList.remove('on')); b.classList.add('on'); renderList(); });
    });
    listEl = el('div', { style: 'flex:1;overflow:auto;padding:6px' }, bodyEl);
    renderList();
    setTimeout(() => { try { inputEl.focus(); } catch (_) { } }, 0);
  }

  T.registerTool({
    id: 'search', label: 'Search everything', icon: '🔎', group: 'Tools',
    sub: 'find any room · prop · enemy · exit · spawn — click to jump',
    build(host, a) { api = a; bodyEl = host; render(); }
  });
  if (T.roadmapDone) T.roadmapDone(48);
})();
