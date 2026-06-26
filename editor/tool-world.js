// MOSSVEIL — tool-world.js : World / Map editor 2.0 (Edit ▸ World).  Roadmap #37.
// The Map tab is the spatial drag-graph; this is the complementary management view — a sortable
// table of every room with computed columns (biome, music, size, props, enemies, exits, incoming,
// reachable, issue count), world-wide stats, quick filters (unreachable / dead-end / one-way /
// untitled / empty), per-room connection breakdown with jump, and bulk biome/music retheming across
// many rooms at once. Read-only except the explicit bulk-set, which sets a field + marks dirty.
// Editor-only, fully offline.
(function () {
  const T = G.Tools;
  if (!T) return;
  const ED = () => G.__ed || {};

  // ---- world analysis: reachability (BFS from the first room) + incoming-link counts ----
  function analyze() {
    const L = G.LEVELS || {}, ids = Object.keys(L), startId = ids[0];
    const incoming = {}, reachable = {};
    for (const id of ids) for (const tz of (L[id].transitions || [])) if (tz.to) incoming[tz.to] = (incoming[tz.to] || 0) + 1;
    if (startId) { reachable[startId] = true; const q = [startId]; while (q.length) { const cur = q.shift(); for (const tz of (L[cur].transitions || [])) { const to = tz.to; if (to && L[to] && !reachable[to]) { reachable[to] = true; q.push(to); } } } }
    return { L, ids, startId, incoming, reachable };
  }
  const hasTerrain = lv => (lv.tiles || []).some(row => /[^\s]/.test(row || ''));
  // issue counts per room, harvested from Lint 2.0 if it's loaded (else zeros)
  function issueMap() {
    const m = {}; try { if (T.lint && T.lint.run) for (const it of T.lint.run().issues) if (it.id) m[it.id] = (m[it.id] || 0) + 1; } catch (_) { } return m;
  }

  function rooms() {
    const { L, startId, incoming, reachable } = analyze();
    const iss = issueMap();
    return Object.keys(L).map(id => {
      const lv = L[id];
      const exits = (lv.transitions || []).filter(t => t.to);
      const noReturn = exits.some(t => L[t.to] && t.to !== id && !(L[t.to].transitions || []).some(t2 => t2.to === id));
      return {
        id, title: lv.title || '', biome: lv.biome || '', music: lv.music || '',
        w: lv.w || 0, h: lv.h || 0, props: (lv.props || []).length, enemies: (lv.enemies || []).length,
        exits: exits.length, incoming: incoming[id] || 0, reachable: id === startId || !!reachable[id],
        issues: iss[id] || 0, start: id === startId,
        deadend: !exits.length, noReturn, untitled: !lv.title,
        empty: !hasTerrain(lv) && !(lv.props || []).length && !(lv.enemies || []).length
      };
    });
  }

  function stats() {
    const r = rooms();
    return {
      rooms: r.length, reachable: r.filter(x => x.reachable).length, unreachable: r.filter(x => !x.reachable).length,
      deadends: r.filter(x => x.deadend).length, oneway: r.filter(x => x.noReturn).length,
      props: r.reduce((a, x) => a + x.props, 0), enemies: r.reduce((a, x) => a + x.enemies, 0), exits: r.reduce((a, x) => a + x.exits, 0)
    };
  }

  function connections(id) {
    const L = G.LEVELS || {}, lv = L[id]; if (!lv) return { out: [], in: [] };
    const out = (lv.transitions || []).filter(t => t.to).map(t => ({ to: t.to, spawn: t.spawn || '', exists: !!L[t.to] }));
    const inc = []; for (const fid in L) for (const t of (L[fid].transitions || [])) if (t.to === id) inc.push({ from: fid, spawn: t.spawn || '' });
    return { out, in: inc };
  }

  function setField(field, ids, value) {
    const L = G.LEVELS || {}; let n = 0;
    for (const id of ids) if (L[id]) { L[id][field] = value || undefined; n++; }
    if (n && ED().markDirty) ED().markDirty();
    return n;
  }

  // =================== test / external API ===================
  T.world = {
    rooms, stats, connections,
    setBiome: (ids, b) => setField('biome', ids, b),
    setMusic: (ids, m) => setField('music', ids, m),
    openInTool: () => T.openTool('world')
  };

  // =================== UI ===================
  let bodyEl = null, api = null;
  const COLS = [
    { key: 'id', label: 'Room', get: r => r.title || r.id, num: false, grow: true },
    { key: 'biome', label: 'Biome', get: r => r.biome, num: false },
    { key: 'music', label: 'Music', get: r => r.music, num: false },
    { key: 'size', label: 'Size', get: r => r.w * r.h, show: r => r.w + '×' + r.h, num: true },
    { key: 'props', label: 'Props', get: r => r.props, num: true },
    { key: 'enemies', label: 'Foes', get: r => r.enemies, num: true },
    { key: 'exits', label: 'Exits', get: r => r.exits, num: true },
    { key: 'incoming', label: 'In', get: r => r.incoming, num: true },
    { key: 'reachable', label: 'Reach', get: r => r.reachable ? 1 : 0, show: r => r.reachable ? '✓' : '✕', num: true },
    { key: 'issues', label: 'Issues', get: r => r.issues, show: r => r.issues ? '⚠ ' + r.issues : '·', num: true }
  ];
  const FILTERS = [
    ['all', 'All', () => true],
    ['unreachable', 'Unreachable', r => !r.reachable],
    ['deadend', 'Dead-ends', r => r.deadend],
    ['oneway', 'One-way', r => r.noReturn],
    ['untitled', 'Untitled', r => r.untitled],
    ['empty', 'Empty', r => r.empty],
    ['issues', 'Has issues', r => r.issues > 0]
  ];
  const view = { sort: 'id', dir: 1, q: '', filter: 'all', sel: new Set(), expanded: new Set() };

  function el(t, a, p, x) { return api.el(t, a, p, x); }

  function jump(id) { if (G.LEVELS[id] && ED().openLevel) { ED().openLevel(id); T.closeTool(); api.toast('Opened ' + id); } }

  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column';
    const all = rooms(), s = stats();

    // ---- stats bar ----
    const bar = el('div', { class: 'tc-mut', style: 'padding:8px 12px;border-bottom:1px solid var(--line);display:flex;gap:14px;flex-wrap:wrap' }, bodyEl);
    const stat = (lab, val, warn) => { const w = el('span', {}, bar); el('b', { style: 'color:' + (warn && val ? '#ffcf4a' : 'var(--txt)') }, w, val); w.appendChild(document.createTextNode(' ' + lab)); };
    stat('rooms', s.rooms); stat('reachable', s.reachable); stat('unreachable', s.unreachable, true);
    stat('dead-ends', s.deadends, true); stat('one-way', s.oneway, true);
    stat('props', s.props); stat('foes', s.enemies); stat('exits', s.exits);

    // ---- toolbar: search + quick filters + bulk retheme ----
    const tb = el('div', { style: 'display:flex;align-items:center;gap:6px;padding:8px 12px;border-bottom:1px solid var(--line);flex-wrap:wrap' }, bodyEl);
    const q = el('input', { type: 'text', placeholder: 'Search rooms…', value: view.q, style: 'flex:0 0 180px' }, tb);
    q.addEventListener('input', () => { view.q = q.value; renderTable(); });
    FILTERS.forEach(([id, label]) => { const b = el('button', { class: 'tbtn' + (view.filter === id ? ' on' : '') }, tb, label); b.addEventListener('click', () => { view.filter = id; render(); }); });
    el('div', { style: 'flex:1' }, tb);
    // bulk retheme
    const selInfo = el('span', { class: 'tc-mut' }, tb);
    const biomes = (G.World && G.World.BIOMES) || [];
    const tracks = (G.Music && G.Music.TRACK_IDS) || [];
    const bSel = el('select', { title: 'Set biome on selected rooms', style: 'flex:0 0 auto' }, tb);
    el('option', { value: '' }, bSel, 'Set biome…');
    biomes.forEach(b => el('option', { value: b }, bSel, b));
    bSel.addEventListener('change', () => { if (bSel.value && view.sel.size) { const n = T.world.setBiome([...view.sel], bSel.value); api.toast('Set biome on ' + n + ' room' + (n === 1 ? '' : 's') + ' — reopen to see the palette'); } bSel.value = ''; render(); });
    const mSel = el('select', { title: 'Set music on selected rooms', style: 'flex:0 0 auto' }, tb);
    el('option', { value: '' }, mSel, 'Set music…');
    tracks.forEach(m => el('option', { value: m }, mSel, m));
    mSel.addEventListener('change', () => { if (mSel.value && view.sel.size) { const n = T.world.setMusic([...view.sel], mSel.value); api.toast('Set music on ' + n + ' room' + (n === 1 ? '' : 's')); } mSel.value = ''; render(); });

    // ---- table ----
    const wrap = el('div', { style: 'flex:1;overflow:auto' }, bodyEl);
    const table = el('table', { style: 'width:100%;border-collapse:collapse;font-size:12px' }, wrap);
    const thead = el('thead', {}, table);
    const hr = el('tr', { style: 'position:sticky;top:0;background:var(--bg2);z-index:1' }, thead);
    const cbAll = el('input', { type: 'checkbox', title: 'Select all visible' }, el('th', { style: 'padding:6px 8px;text-align:left' }, hr));
    COLS.forEach(c => {
      const th = el('th', { style: 'padding:6px 8px;text-align:' + (c.num ? 'right' : 'left') + ';cursor:pointer;white-space:nowrap;color:var(--txt2)' }, hr, c.label + (view.sort === c.key ? (view.dir > 0 ? ' ▲' : ' ▼') : ''));
      th.addEventListener('click', () => { if (view.sort === c.key) view.dir = -view.dir; else { view.sort = c.key; view.dir = 1; } renderTable(); });
    });
    el('th', {}, hr, '');
    const tbody = el('tbody', {}, table);

    function visibleRooms() {
      const txt = view.q.trim().toLowerCase();
      const filt = (FILTERS.find(f => f[0] === view.filter) || FILTERS[0])[2];
      let r = all.filter(x => filt(x) && (!txt || (x.id + ' ' + x.title + ' ' + x.biome + ' ' + x.music).toLowerCase().includes(txt)));
      const col = COLS.find(c => c.key === view.sort) || COLS[0];
      r.sort((a, b) => { const va = col.get(a), vb = col.get(b); const d = (typeof va === 'number') ? va - vb : ('' + va).localeCompare('' + vb); return d * view.dir; });
      return r;
    }

    function renderTable() {
      tbody.innerHTML = '';
      const vis = visibleRooms();
      cbAll.checked = vis.length > 0 && vis.every(r => view.sel.has(r.id));
      cbAll.onclick = () => { if (cbAll.checked) vis.forEach(r => view.sel.add(r.id)); else vis.forEach(r => view.sel.delete(r.id)); renderTable(); };
      selInfo.textContent = view.sel.size ? (view.sel.size + ' selected') : '';
      if (!vis.length) { const tr = el('tr', {}, tbody); el('td', { colspan: COLS.length + 2, class: 'tc-mut', style: 'padding:18px;text-align:center' }, tr, 'No rooms match.'); return; }
      vis.forEach(r => {
        const tr = el('tr', { style: 'border-top:1px solid var(--line)' + (view.sel.has(r.id) ? ';background:rgba(79,163,255,.08)' : '') }, tbody);
        const cb = el('input', { type: 'checkbox' }, el('td', { style: 'padding:4px 8px' }, tr)); cb.checked = view.sel.has(r.id);
        cb.addEventListener('change', () => { cb.checked ? view.sel.add(r.id) : view.sel.delete(r.id); renderTable(); });
        COLS.forEach(c => {
          const td = el('td', { style: 'padding:4px 8px;white-space:nowrap;text-align:' + (c.num ? 'right' : 'left') }, tr);
          if (c.key === 'id') {
            if (r.start) el('span', { class: 'tc-pill done', style: 'margin-right:6px' }, td, 'START');
            const a = el('a', { href: '#', style: 'color:var(--acc);text-decoration:none' }, td, r.title || r.id);
            a.addEventListener('click', e => { e.preventDefault(); jump(r.id); });
            if (r.title) el('span', { class: 'tc-mut', style: 'margin-left:6px;font-size:10px' }, td, r.id);
          } else {
            const txt = c.show ? c.show(r) : (c.get(r) || (c.num ? 0 : '·'));
            const col = c.key === 'reachable' ? (r.reachable ? '#7fd89a' : '#ff7a6a') : c.key === 'issues' && r.issues ? '#ffcf4a' : 'var(--txt2)';
            el('span', { style: 'color:' + col }, td, '' + txt);
          }
        });
        const act = el('td', { style: 'padding:4px 8px;text-align:right;white-space:nowrap' }, tr);
        const link = el('button', { class: 'tbtn', title: 'Show connections', style: 'padding:1px 6px' }, act, view.expanded.has(r.id) ? '🔗▾' : '🔗');
        link.addEventListener('click', () => { view.expanded.has(r.id) ? view.expanded.delete(r.id) : view.expanded.add(r.id); renderTable(); });
        el('button', { class: 'tbtn', title: 'Open room', style: 'padding:1px 6px', onclick: () => jump(r.id) }, act, '↗');
        if (view.expanded.has(r.id)) {
          const dr = el('tr', {}, tbody); const dc = el('td', { colspan: COLS.length + 2, style: 'padding:4px 14px 10px;background:var(--bg2)' }, dr);
          const cx = connections(r.id);
          const line = el('div', { class: 'tc-mut', style: 'display:flex;gap:18px;flex-wrap:wrap' }, dc);
          const outBox = el('div', {}, line); el('b', { style: 'color:var(--txt)' }, outBox, 'Exits → ');
          if (!cx.out.length) el('span', {}, outBox, 'none');
          cx.out.forEach(o => { const t = el('a', { href: '#', style: 'color:' + (o.exists ? 'var(--acc)' : '#ff7a6a') + ';text-decoration:none;margin-right:8px' }, outBox, o.to + (o.spawn ? '@' + o.spawn : '') + (o.exists ? '' : ' (missing)')); t.addEventListener('click', e => { e.preventDefault(); if (o.exists) jump(o.to); }); });
          const inBox = el('div', {}, line); el('b', { style: 'color:var(--txt)' }, inBox, '← In from ');
          if (!cx.in.length) el('span', {}, inBox, 'nothing');
          cx.in.forEach(o => { const t = el('a', { href: '#', style: 'color:var(--acc);text-decoration:none;margin-right:8px' }, inBox, o.from); t.addEventListener('click', e => { e.preventDefault(); jump(o.from); }); });
        }
      });
    }
    renderTable();
  }

  T.registerTool({
    id: 'world', label: 'World / Map 2.0', icon: '🗺', group: 'World',
    sub: 'room table · stats · bulk retheme · connections',
    build(host, a) { api = a; bodyEl = host; render(); }
  });
  if (T.roadmapDone) T.roadmapDone(37);
})();
