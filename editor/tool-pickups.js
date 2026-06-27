// MOSSVEIL — tool-pickups.js : Pickups & Items audit (Edit ▸ Content).  Roadmap #21.
// The world's "found items" — charmPickup (grants a charm), powerup (grants an ability / charm /
// currency) and the moth-wings pickup — are placed inline on each level's props[]; there is no
// world-wide view of the item economy. This is that view: a table of every pickup (room · type · what
// it grants · where), an obtainability/coverage report (which charms & abilities actually have a
// pickup somewhere, and which are unobtainable), and a lint pass (unknown charm, invalid grant,
// duplicate / redundant grants). Read-only except an inline grant/charm <select> that rewrites the
// prop + marks the world dirty (Ctrl+S to save). Editor-only, fully offline.
(function () {
  const T = G.Tools;
  if (!T) return;
  const ED = () => G.__ed || {};
  const levels = () => G.LEVELS || {};
  const charmList = () => (G.Charms && G.Charms.LIST) ? G.Charms.LIST : [];
  const charmName = id => { const c = charmList().find(c => c.id === id); return c ? c.name : id; };
  const charmIds = () => new Set(charmList().map(c => c.id));
  const hex = n => '#' + (n >>> 0).toString(16).padStart(6, '0').slice(-6);

  // the power-up grant catalog — mirrors applyGrant()/GRANT_LABEL in src/world.js. gate = a real
  // progression gate with no shop/tree fallback (so a missing pickup is a hard lock); tree = normally
  // learned at a spell well, so a missing pickup is fine; consumable/meta need no coverage.
  const ABIL = [
    { id: 'wings', label: 'Moth Wings', col: 0xdfeaff, gate: true },
    { id: 'bolt', label: 'Soul Bolt', col: 0xc9a0ff, tree: true },
    { id: 'ember', label: 'Ember Bolt', col: 0xff8a3a, tree: true },
    { id: 'frost', label: 'Frost Bolt', col: 0x8fd8ff, tree: true },
    { id: 'gale', label: 'Gale Bolt', col: 0xeaf4ff, tree: true },
    { id: 'scream', label: 'Wraith Cry', col: 0xc9d8ff, tree: true },
    { id: 'dive', label: 'Abyss Dive', col: 0xb070ff, tree: true },
    { id: 'soul', label: 'Fill Soul', col: 0xbfe8ff, consumable: true },
    { id: 'glimmer', label: '+200 Glimmer', col: 0xffd060, consumable: true },
    { id: 'all', label: 'Everything', col: 0xffffff, meta: true }
  ];
  const ABIL_IDS = new Set(ABIL.map(a => a.id));
  const abil = id => ABIL.find(a => a.id === id);
  const PTYPES = { charmPickup: '💠 Charm pickup', powerup: '⚡ Power-up', wings: '🦋 Moth Wings' };

  // resolve a pickup prop to {kind, value, label, col, charm?} matching runtime defaults exactly
  function resolveGrant(p) {
    if (p.type === 'charmPickup') {
      const cid = p.charm || (charmList()[0] && charmList()[0].id);
      return { kind: 'charm', value: cid, label: 'Charm: ' + charmName(cid), col: 0xffcf5a, charm: cid };
    }
    if (p.type === 'wings') return { kind: 'wings', value: 'wings', label: 'Moth Wings', col: 0xdfeaff };
    const g = p.grant || 'wings';                                  // powerup default = wings
    if (g.indexOf('charm:') === 0) { const cid = g.slice(6); return { kind: 'charm', value: g, label: 'Charm: ' + charmName(cid), col: 0xffcf5a, charm: cid }; }
    const a = abil(g);
    return { kind: 'ability', value: g, label: a ? a.label : g, col: a ? a.col : 0xb0f0ff };
  }

  // ---- scan every level's props for the three pickup kinds ----
  function scan() {
    const out = [], L = levels();
    for (const id in L) {
      const props = L[id].props || [];
      props.forEach((p, i) => { if (p && PTYPES[p.type]) out.push({ level: id, title: L[id].title || id, idx: i, type: p.type, x: p.x, y: p.y, g: resolveGrant(p) }); });
    }
    return out;
  }
  function hasVendor() { const L = levels(); for (const id in L) if ((L[id].props || []).some(p => p.type === 'vendor')) return true; return false; }

  // ---- obtainability: per charm & per ability, which pickups grant it ----
  function coverage() {
    const all = scan(), buyable = hasVendor();
    const charms = charmList().map(c => {
      const sources = all.filter(s => s.g.kind === 'charm' && s.g.charm === c.id);
      return { id: c.id, name: c.name, sources, buyable, ok: sources.length > 0 || buyable };
    });
    const abilities = ABIL.filter(a => !a.meta && !a.consumable).map(a => {
      const sources = all.filter(s =>
        (s.g.kind === 'ability' && s.g.value === a.id) ||                          // explicit power-up
        (a.id === 'wings' && s.type === 'wings') ||                                // the moth-wings prop
        (s.g.kind === 'ability' && s.g.value === 'all' && (a.gate || a.tree)));    // "Everything" covers gates+spells
      return { id: a.id, label: a.label, gate: !!a.gate, tree: !!a.tree, sources, ok: sources.length > 0 || !!a.tree };
    });
    return { charms, abilities, buyable };
  }

  // ---- lint ----
  function lint() {
    const out = [], all = scan(), ids = charmIds();
    for (const s of all) {
      if (s.g.kind === 'charm' && s.g.charm && ids.size && !ids.has(s.g.charm))
        out.push({ kind: 'unknown-charm', sev: 'error', level: s.level, idx: s.idx, msg: PTYPES[s.type].replace(/^\S+\s/, '') + ' grants unknown charm "' + s.g.charm + '"' });
      if (s.type === 'powerup' && s.g.kind === 'ability' && !ABIL_IDS.has(s.g.value))
        out.push({ kind: 'invalid-grant', sev: 'error', level: s.level, idx: s.idx, msg: 'power-up has invalid grant "' + s.g.value + '"' });
    }
    const byCharm = {};
    for (const s of all) if (s.type === 'charmPickup' && s.g.charm) (byCharm[s.g.charm] = byCharm[s.g.charm] || []).push(s);
    for (const cid in byCharm) if (byCharm[cid].length > 1)
      out.push({ kind: 'dup-charm', sev: 'info', level: byCharm[cid][0].level, idx: byCharm[cid][0].idx, msg: charmName(cid) + ' is placed by ' + byCharm[cid].length + ' charm pickups' });
    const cov = coverage();
    for (const c of cov.charms) if (!c.ok)
      out.push({ kind: 'unobtainable-charm', sev: 'warn', level: '', idx: -1, msg: 'Charm "' + c.name + '" has no pickup and no vendor — unobtainable' });
    for (const a of cov.abilities) if (!a.ok)
      out.push({ kind: 'unobtainable-ability', sev: 'warn', level: '', idx: -1, msg: a.label + ' has no pickup anywhere — unobtainable' });
    return out;
  }

  // ---- the one write path: change a pickup's grant/charm + mark dirty ----
  function setGrant(level, idx, value) {
    const L = levels(), p = L[level] && (L[level].props || [])[idx];
    if (!p) return false;
    if (p.type === 'charmPickup') p.charm = value;
    else if (p.type === 'powerup') p.grant = value;
    else return false;
    if (ED().markDirty) ED().markDirty();
    return true;
  }

  // grant <select> options for a given pickup type
  function grantOptions(type) {
    if (type === 'charmPickup') return charmList().map(c => ({ v: c.id, t: c.name + ' (' + c.cost + ')' }));
    if (type === 'powerup') return ABIL.map(a => ({ v: a.id, t: a.label })).concat(charmList().map(c => ({ v: 'charm:' + c.id, t: 'Charm: ' + c.name })));
    return [];
  }

  // =================== test / external API ===================
  T.pickups = { scan, coverage, lint, setGrant, hasVendor, grantOptions, openInTool: () => T.openTool('pickups') };

  // =================== UI ===================
  let bodyEl = null, api = null;
  const view = { filter: 'all', q: '' };
  const FILTERS = [['all', 'All'], ['charmPickup', 'Charms'], ['powerup', 'Power-ups'], ['wings', 'Wings'], ['issues', 'Issues']];
  function el(t, a, p, x) { return api.el(t, a, p, x); }
  const swatch = (col, parent) => el('span', { style: 'display:inline-block;width:10px;height:10px;border-radius:50%;background:' + hex(col) + ';margin-right:6px;vertical-align:middle;box-shadow:0 0 4px ' + hex(col) }, parent);

  function jump(s) {
    if (!s || s.idx < 0 || !levels()[s.level]) return;
    if (ED().selectProp) { ED().selectProp(s.level, s.idx); T.closeTool(); api.toast('Selected pickup in ' + (s.title || s.level)); }
    else if (ED().openLevel) { ED().openLevel(s.level); T.closeTool(); }
  }

  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column';
    const all = scan(), cov = coverage(), issues = lint();
    const issueIdx = new Set(issues.filter(i => i.idx >= 0).map(i => i.level + '#' + i.idx));

    // ---- stats bar ----
    const bar = el('div', { class: 'tc-mut', style: 'padding:8px 12px;border-bottom:1px solid var(--line);display:flex;gap:14px;flex-wrap:wrap' }, bodyEl);
    const stat = (lab, val, warn) => { const w = el('span', {}, bar); el('b', { style: 'color:' + (warn && val ? '#ffcf4a' : 'var(--txt)') }, w, '' + val); w.appendChild(document.createTextNode(' ' + lab)); };
    stat('pickups', all.length);
    stat('charm pickups', all.filter(s => s.type === 'charmPickup').length);
    stat('power-ups', all.filter(s => s.type === 'powerup').length);
    stat('charms covered', cov.charms.filter(c => c.ok).length + '/' + cov.charms.length, cov.charms.some(c => !c.ok));
    stat('issues', issues.length, true);

    // ---- toolbar: filters + search ----
    const tb = el('div', { style: 'display:flex;align-items:center;gap:6px;padding:8px 12px;border-bottom:1px solid var(--line);flex-wrap:wrap' }, bodyEl);
    FILTERS.forEach(([id, label]) => { const b = el('button', { class: 'tbtn' + (view.filter === id ? ' on' : '') }, tb, label); b.addEventListener('click', () => { view.filter = id; render(); }); });
    el('div', { style: 'flex:1' }, tb);
    const q = el('input', { type: 'text', placeholder: 'Search…', value: view.q, style: 'flex:0 0 160px' }, tb);
    q.addEventListener('input', () => { view.q = q.value; renderRows(); });

    // ---- pickups table ----
    const wrap = el('div', { style: 'flex:1;overflow:auto;min-height:0' }, bodyEl);
    const table = el('table', { style: 'width:100%;border-collapse:collapse;font-size:12px' }, wrap);
    const hr = el('tr', { style: 'position:sticky;top:0;background:var(--bg2);z-index:1' }, el('thead', {}, table));
    ['Room', 'Type', 'Grants', 'Pos', ''].forEach((h, i) => el('th', { style: 'padding:6px 8px;text-align:' + (i === 3 ? 'right' : 'left') + ';color:var(--txt2);white-space:nowrap' }, hr, h));
    const tbody = el('tbody', {}, table);

    function renderRows() {
      tbody.innerHTML = '';
      const txt = view.q.trim().toLowerCase();
      const rows = all.filter(s => {
        if (view.filter === 'issues') { if (!issueIdx.has(s.level + '#' + s.idx)) return false; }
        else if (view.filter !== 'all' && s.type !== view.filter) return false;
        if (txt && !(s.level + ' ' + s.title + ' ' + s.type + ' ' + s.g.label).toLowerCase().includes(txt)) return false;
        return true;
      });
      if (!rows.length) { const tr = el('tr', {}, tbody); el('td', { colspan: 5, class: 'tc-mut', style: 'padding:18px;text-align:center' }, tr, 'No pickups match.'); return; }
      rows.forEach(s => {
        const bad = issueIdx.has(s.level + '#' + s.idx);
        const tr = el('tr', { style: 'border-top:1px solid var(--line)' + (bad ? ';background:rgba(255,110,90,.07)' : '') }, tbody);
        const rc = el('td', { style: 'padding:4px 8px;white-space:nowrap' }, tr);
        const a = el('a', { href: '#', style: 'color:var(--acc);text-decoration:none' }, rc, s.title || s.level);
        a.addEventListener('click', e => { e.preventDefault(); jump(s); });
        if (s.title) el('span', { class: 'tc-mut', style: 'margin-left:6px;font-size:10px' }, rc, s.level);
        el('td', { style: 'padding:4px 8px;white-space:nowrap' }, tr, PTYPES[s.type]);
        // grants cell — editable for charmPickup/powerup
        const gc = el('td', { style: 'padding:4px 8px;white-space:nowrap' }, tr);
        swatch(s.g.col, gc);
        if (s.type === 'wings') { el('span', {}, gc, s.g.label); }
        else {
          const opts = grantOptions(s.type), sel = el('select', { style: 'max-width:200px' }, gc);
          const curV = s.type === 'charmPickup' ? s.g.charm : s.g.value;
          let has = false;
          opts.forEach(o => { const op = el('option', { value: o.v }, sel, o.t); if (o.v === curV) { op.selected = true; has = true; } });
          if (!has) { const op = el('option', { value: curV }, sel, curV + ' (?)'); op.selected = true; }
          sel.addEventListener('change', () => { setGrant(s.level, s.idx, sel.value); render(); });
        }
        if (bad) el('span', { class: 'tc-pill skip', style: 'margin-left:6px' }, gc, '!');
        el('td', { style: 'padding:4px 8px;text-align:right;white-space:nowrap;color:var(--txt2)' }, tr, Math.round(s.x) + ',' + Math.round(s.y));
        el('button', { class: 'tbtn', title: 'Select in scene', style: 'padding:1px 6px', onclick: () => jump(s) }, el('td', { style: 'padding:4px 8px' }, tr), '↗');
      });
    }
    renderRows();

    // ---- coverage + lint (two panels under the table) ----
    const foot = el('div', { style: 'border-top:1px solid var(--line);max-height:38%;overflow:auto;display:grid;grid-template-columns:1fr 1fr;gap:0' }, bodyEl);

    // coverage
    const covBox = el('div', { style: 'padding:10px 14px;border-right:1px solid var(--line)' }, foot);
    el('h3', { style: 'margin:0 0 6px;font-size:13px' }, covBox, 'Obtainability');
    el('div', { class: 'tc-mut', style: 'margin-bottom:4px;font-size:11px' }, covBox, 'Charms' + (cov.buyable ? ' — a vendor exists, so all are buyable' : ' — no vendor in the world'));
    const cw = el('div', { style: 'display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px' }, covBox);
    cov.charms.forEach(c => {
      const n = c.sources.length, where = c.sources.map(s => s.title || s.level).join(', ');
      const chip = el('span', { class: 'tc-pill ' + (c.ok ? 'done' : 'skip'), title: n ? ('Pickup in: ' + where) : (c.buyable ? 'Buyable from vendor' : 'No source!') }, cw, c.name + (n ? ' ·' + n : c.buyable ? ' ·shop' : ' ·✗'));
      if (c.sources[0]) chip.addEventListener('click', () => jump(c.sources[0]));
      if (c.sources[0]) chip.style.cursor = 'pointer';
    });
    el('div', { class: 'tc-mut', style: 'margin-bottom:4px;font-size:11px' }, covBox, 'Abilities (spells normally learned at a spell well)');
    const aw = el('div', { style: 'display:flex;flex-wrap:wrap;gap:5px' }, covBox);
    cov.abilities.forEach(a => {
      const n = a.sources.length;
      const label = a.label + (n ? ' ·' + n : a.tree ? ' ·well' : ' ·✗');
      const chip = el('span', { class: 'tc-pill ' + (a.ok ? 'done' : 'skip'), title: n ? a.sources.map(s => s.title || s.level).join(', ') : (a.tree ? 'Via spell well' : 'No pickup anywhere!') }, aw, label);
      if (a.sources[0]) { chip.style.cursor = 'pointer'; chip.addEventListener('click', () => jump(a.sources[0])); }
    });

    // lint
    const lintBox = el('div', { style: 'padding:10px 14px' }, foot);
    el('h3', { style: 'margin:0 0 6px;font-size:13px' }, lintBox, 'Issues · ' + issues.length);
    if (!issues.length) el('div', { class: 'tc-pill done', style: 'display:inline-block' }, lintBox, 'No problems found.');
    issues.forEach(it => {
      const row = el('div', { class: 'tc-row', style: 'margin:2px 0;align-items:center' }, lintBox);
      const c = it.sev === 'error' ? '#ff7a6a' : it.sev === 'warn' ? '#ffcf4a' : 'var(--txt2)';
      el('span', { style: 'color:' + c + ';margin-right:6px' }, row, it.sev === 'error' ? '✕' : it.sev === 'warn' ? '⚠' : 'ℹ');
      el('span', { style: 'flex:1' }, row, it.msg);
      if (it.idx >= 0 && levels()[it.level]) el('button', { class: 'tbtn', style: 'padding:1px 6px', onclick: () => jump({ level: it.level, idx: it.idx, title: (levels()[it.level] || {}).title }) }, row, '↗');
    });
  }

  T.registerTool({
    id: 'pickups', label: 'Pickups & items', icon: '🎁', group: 'Content',
    sub: 'every pickup · obtainability · charm/ability coverage · lint',
    build(host, a) { api = a; bodyEl = host; render(); }
  });
  if (T.roadmapDone) T.roadmapDone(21);
})();
