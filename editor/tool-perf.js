// MOSSVEIL — tool-perf.js : Per-room performance budgets (Edit ▸ Tools).  Roadmap #67.
// An editor-only QA scanner (the lint / deps / world standalone-tool pattern — ZERO engine change,
// read-only over G.LEVELS + the engine registries). Each room's content is tallied into a weighted
// "cost" estimate (in arbitrary budget units) so you can SPOT the heavy rooms before they cost frames:
// enemies (AI + animation every frame — the dominant runtime item), dynamic lights, light shafts,
// props (weighted by mesh complexity), terrain size, weather/water passes, buildings, logic nodes.
// A tunable warn / over budget flags rooms; the cost model is fully visible (legend + costModel())
// so the numbers are transparent. Sortable table, filters, per-room cost breakdown. Fully offline.
(function () {
  const T = G.Tools;
  if (!T) return;
  const ED = () => G.__ed || {};

  // ---- cost model (documented weights, in budget "units") ----------------------------------------
  // Calibrated so a typical room lands well under the default warn budget and genuinely heavy rooms
  // (many foes / lights / weather) stand out. Tune the budget in-tool; the WEIGHTS are fixed here.
  const COST = {
    tile: 0.15,       // per solid terrain char (terrain is merged, so geometry-size not draw-call)
    area: 0.01,       // per w×h cell — ambient motes, decor scatter, parallax & the lighting SDF all scale with area
    enemy: 10,        // per enemy — AI + procedural animation + physics EVERY frame (the heaviest runtime item)
    light: 12,        // per `light` prop — a dynamic light in the 2.5D lighting pass
    ray: 4,           // per `ray` prop — a volumetric light shaft
    weather: 16,      // flat — the room runs a weather particle system (rain / snow / embers …)
    water: 14,        // flat — a reflective-water surface override (an extra post pass)
    building: 6,      // per procedural building stamp (generates walls/floors + interior props)
    graphNode: 0.5,   // per logic-graph (visual-scripting) node
    boss: 6,          // per bossTrigger — a boss CAN spawn here (a big runtime spike during the fight)
    propDefault: 3    // any prop type not in PROP_COST
  };
  // per-prop-type mesh / effect weight.  light / ray / bossTrigger are counted on their own axes (0 here).
  const PROP_COST = {
    sign: 1, readable: 1, textTrigger: 1, cutsceneTrigger: 1, setActiveTrigger: 1, lookTrigger: 1,
    door: 2, lever: 2, plate: 2, audio: 2,
    charmPickup: 3, powerup: 3, wall: 3, fallfloor: 3, lamp: 3,
    gate: 4, bench: 4, breakable: 4, spiketrap: 4, mire: 4, windzone: 4, wings: 4,
    crystal: 5, shrine: 5, platform: 5, conveyor: 5, pool: 5, decor: 5,
    gas: 6, furniture: 6, bioflora: 6, crusher: 6, spellwell: 6,
    npc: 8, vendor: 8, smith: 8, model: 8,
    light: 0, ray: 0, bossTrigger: 0
  };

  // ---- budget (editor-only QA preference, NOT a committed dataset) -------------------------------
  const BKEY = 'mossveil-ed-perfbudget';
  const DEF_BUDGET = { warn: 150, over: 260 };
  function budget() {
    try { const b = JSON.parse(localStorage.getItem(BKEY) || 'null'); if (b && b.warn > 0 && b.over > 0) return { warn: +b.warn, over: +b.over }; } catch (_) { }
    return Object.assign({}, DEF_BUDGET);
  }
  function setBudget(warn, over) {
    warn = Math.max(1, Math.round(+warn || DEF_BUDGET.warn));
    over = Math.max(warn + 1, Math.round(+over || DEF_BUDGET.over));
    try { localStorage.setItem(BKEY, JSON.stringify({ warn, over })); } catch (_) { }
    return { warn, over };
  }

  // ---- per-room analysis (pure; no DOM) ----------------------------------------------------------
  const solidTiles = lv => (lv.tiles || []).reduce((a, row) => a + (('' + (row || '')).match(/[^\s]/g) || []).length, 0);
  function graphNodes(lv) { const g = lv.graph; if (!g) return 0; if (Array.isArray(g.nodes)) return g.nodes.length; if (g.nodes && typeof g.nodes === 'object') return Object.keys(g.nodes).length; return 0; }

  function roomCost(id) {
    const lv = (G.LEVELS || {})[id]; if (!lv) return null;
    const area = (lv.w || 0) * (lv.h || 0);
    const tiles = solidTiles(lv);
    // props, split onto their cost axes
    let propsCost = 0, propCount = 0, lights = 0, rays = 0, bosses = 0;
    for (const p of (lv.props || [])) {
      const t = p && p.type;
      if (t === 'light') { lights++; continue; }
      if (t === 'ray') { rays++; continue; }
      if (t === 'bossTrigger') { bosses++; continue; }
      propCount++;
      propsCost += (PROP_COST[t] != null ? PROP_COST[t] : COST.propDefault);
    }
    const enemies = (lv.enemies || []).length;
    const weather = lv.weather && lv.weather !== 'none' ? 1 : 0;
    const water = lv.water ? 1 : 0;
    const buildings = Array.isArray(lv.buildings) ? lv.buildings.length : 0;
    const gnodes = graphNodes(lv);
    // weighted breakdown (each line = its contribution to the total cost)
    const breakdown = {
      terrain: tiles * COST.tile,
      area: area * COST.area,
      props: propsCost,
      enemies: enemies * COST.enemy,
      lights: lights * COST.light,
      rays: rays * COST.ray,
      bosses: bosses * COST.boss,
      weather: weather * COST.weather,
      water: water * COST.water,
      buildings: buildings * COST.building,
      logic: gnodes * COST.graphNode
    };
    const cost = Math.round(Object.values(breakdown).reduce((a, v) => a + v, 0));
    const draws = 6 + propCount + lights + rays + enemies + bosses;   // ≈ mesh groups (backdrop+wall+parallax×3+motes = 6)
    return {
      id, title: lv.title || '', biome: lv.biome || '', w: lv.w || 0, h: lv.h || 0, area, tiles,
      props: propCount, enemies, lights, rays, bosses, weather: !!weather, water: !!water,
      buildings, logic: gnodes, draws, cost, breakdown
    };
  }

  function rooms() {
    const L = G.LEVELS || {}, b = budget();
    return Object.keys(L).map(id => {
      const r = roomCost(id);
      r.over = r.cost > b.over; r.warn = !r.over && r.cost > b.warn;
      r.status = r.over ? 'over' : r.warn ? 'warn' : 'ok';
      return r;
    });
  }

  function stats() {
    const r = rooms();
    const costs = r.map(x => x.cost);
    return {
      rooms: r.length,
      totalCost: costs.reduce((a, v) => a + v, 0),
      avgCost: r.length ? Math.round(costs.reduce((a, v) => a + v, 0) / r.length) : 0,
      maxCost: r.length ? Math.max.apply(null, costs) : 0,
      over: r.filter(x => x.over).length, warn: r.filter(x => x.warn).length,
      enemies: r.reduce((a, x) => a + x.enemies, 0), props: r.reduce((a, x) => a + x.props, 0),
      lights: r.reduce((a, x) => a + x.lights, 0)
    };
  }

  const costModel = () => ({ COST: Object.assign({}, COST), PROP_COST: Object.assign({}, PROP_COST), defaultBudget: Object.assign({}, DEF_BUDGET) });

  // =================== test / external API ===================
  T.perf = { rooms, stats, roomCost, budget, setBudget, costModel, openInTool: () => T.openTool('perf') };

  // =================== UI ===================
  let bodyEl = null, api = null;
  const BD_LABELS = { terrain: 'terrain', area: 'area / ambient', props: 'props', enemies: 'enemies', lights: 'lights', rays: 'light shafts', bosses: 'boss triggers', weather: 'weather', water: 'water surface', buildings: 'buildings', logic: 'logic nodes' };
  const COLS = [
    { key: 'id', label: 'Room', get: r => r.title || r.id, num: false, grow: true },
    { key: 'biome', label: 'Biome', get: r => r.biome, num: false },
    { key: 'size', label: 'Size', get: r => r.area, show: r => r.w + '×' + r.h, num: true },
    { key: 'tiles', label: 'Tiles', get: r => r.tiles, num: true },
    { key: 'props', label: 'Props', get: r => r.props, num: true },
    { key: 'enemies', label: 'Foes', get: r => r.enemies, num: true },
    { key: 'lights', label: 'Lights', get: r => r.lights, show: r => r.lights || '·', num: true },
    { key: 'draws', label: '≈Meshes', get: r => r.draws, num: true },
    { key: 'cost', label: 'Cost', get: r => r.cost, num: true }
  ];
  const FILTERS = [
    ['all', 'All', () => true],
    ['over', 'Over budget', r => r.over],
    ['warn', 'Near budget', r => r.warn],
    ['heavy', 'Over or near', r => r.over || r.warn],
    ['enemies', 'Has foes', r => r.enemies > 0],
    ['lights', 'Has lights', r => r.lights > 0]
  ];
  const view = { sort: 'cost', dir: -1, q: '', filter: 'all', expanded: new Set() };

  function el(t, a, p, x) { return api.el(t, a, p, x); }
  const statusColor = s => s === 'over' ? '#ff7a6a' : s === 'warn' ? '#ffcf4a' : '#7fd89a';
  function jump(id) { if (G.LEVELS[id] && ED().openLevel) { ED().openLevel(id); T.closeTool(); api.toast('Opened ' + id); } }

  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column';
    const b = budget();
    const all = rooms(), s = stats();

    // ---- stats bar ----
    const bar = el('div', { class: 'tc-mut', style: 'padding:8px 12px;border-bottom:1px solid var(--line);display:flex;gap:14px;flex-wrap:wrap;align-items:center' }, bodyEl);
    const stat = (lab, val, warn) => { const w = el('span', {}, bar); el('b', { style: 'color:' + (warn && val ? '#ffcf4a' : 'var(--txt)') }, w, '' + val); w.appendChild(document.createTextNode(' ' + lab)); };
    stat('rooms', s.rooms); stat('avg cost', s.avgCost); stat('max', s.maxCost);
    stat('over budget', s.over, true); stat('near', s.warn, true);
    stat('foes', s.enemies); stat('lights', s.lights);

    // ---- toolbar: search + filters + budget sliders ----
    const tb = el('div', { style: 'display:flex;align-items:center;gap:6px;padding:8px 12px;border-bottom:1px solid var(--line);flex-wrap:wrap' }, bodyEl);
    const q = el('input', { type: 'text', placeholder: 'Search rooms…', value: view.q, style: 'flex:0 0 170px' }, tb);
    q.addEventListener('input', () => { view.q = q.value; renderTable(); });
    FILTERS.forEach(([id, label]) => { const bt = el('button', { class: 'tbtn' + (view.filter === id ? ' on' : '') }, tb, label); bt.addEventListener('click', () => { view.filter = id; render(); }); });
    el('div', { style: 'flex:1' }, tb);
    // budget controls
    const budBox = el('span', { class: 'tc-mut', style: 'display:flex;gap:8px;align-items:center' }, tb);
    const mkBud = (lab, key, col) => {
      const wrap = el('span', { style: 'display:flex;gap:3px;align-items:center;color:' + col }, budBox);
      el('span', {}, wrap, lab);
      const inp = el('input', { type: 'number', min: '1', step: '10', value: '' + b[key], title: lab + ' budget (cost units)', style: 'width:62px' }, wrap);
      inp.addEventListener('change', () => { const nb = setBudget(key === 'warn' ? inp.value : b.warn, key === 'over' ? inp.value : b.over); render(); api.toast(lab + ' budget = ' + nb[key]); });
      return inp;
    };
    mkBud('warn ≥', 'warn', '#ffcf4a'); mkBud('over ≥', 'over', '#ff7a6a');
    const reset = el('button', { class: 'tbtn', title: 'Reset budget to defaults' }, tb, '↺');
    reset.addEventListener('click', () => { setBudget(DEF_BUDGET.warn, DEF_BUDGET.over); render(); api.toast('Budget reset'); });

    // ---- table ----
    const wrap = el('div', { style: 'flex:1;overflow:auto' }, bodyEl);
    const table = el('table', { style: 'width:100%;border-collapse:collapse;font-size:12px' }, wrap);
    const thead = el('thead', {}, table);
    const hr = el('tr', { style: 'position:sticky;top:0;background:var(--bg2);z-index:1' }, thead);
    COLS.forEach(c => {
      const th = el('th', { style: 'padding:6px 8px;text-align:' + (c.num ? 'right' : 'left') + ';cursor:pointer;white-space:nowrap;color:var(--txt2)' }, hr, c.label + (view.sort === c.key ? (view.dir > 0 ? ' ▲' : ' ▼') : ''));
      th.addEventListener('click', () => { if (view.sort === c.key) view.dir = -view.dir; else { view.sort = c.key; view.dir = c.num ? -1 : 1; } renderTable(); });
    });
    el('th', { style: 'padding:6px 8px' }, hr, '');
    const tbody = el('tbody', {}, table);

    function visibleRooms() {
      const txt = view.q.trim().toLowerCase();
      const filt = (FILTERS.find(f => f[0] === view.filter) || FILTERS[0])[2];
      let r = all.filter(x => filt(x) && (!txt || (x.id + ' ' + x.title + ' ' + x.biome).toLowerCase().includes(txt)));
      const col = COLS.find(c => c.key === view.sort) || COLS[0];
      r.sort((a2, b2) => { const va = col.get(a2), vb = col.get(b2); const d = (typeof va === 'number') ? va - vb : ('' + va).localeCompare('' + vb); return d * view.dir; });
      return r;
    }

    function renderTable() {
      tbody.innerHTML = '';
      const vis = visibleRooms();
      if (!vis.length) { const tr = el('tr', {}, tbody); el('td', { colspan: COLS.length + 1, class: 'tc-mut', style: 'padding:18px;text-align:center' }, tr, 'No rooms match.'); return; }
      vis.forEach(r => {
        const tr = el('tr', { style: 'border-top:1px solid var(--line)' }, tbody);
        COLS.forEach(c => {
          const td = el('td', { style: 'padding:4px 8px;white-space:nowrap;text-align:' + (c.num ? 'right' : 'left') }, tr);
          if (c.key === 'id') {
            el('span', { title: r.status, style: 'display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:7px;background:' + statusColor(r.status) }, td);
            const a = el('a', { href: '#', style: 'color:var(--acc);text-decoration:none' }, td, r.title || r.id);
            a.addEventListener('click', e => { e.preventDefault(); jump(r.id); });
            if (r.title) el('span', { class: 'tc-mut', style: 'margin-left:6px;font-size:10px' }, td, r.id);
          } else if (c.key === 'cost') {
            el('b', { style: 'color:' + statusColor(r.status) }, td, '' + r.cost);
          } else {
            const txt = c.show ? c.show(r) : (c.get(r) || (c.num ? 0 : '·'));
            el('span', { style: 'color:var(--txt2)' }, td, '' + txt);
          }
        });
        const act = el('td', { style: 'padding:4px 8px;text-align:right;white-space:nowrap' }, tr);
        const exp = el('button', { class: 'tbtn', title: 'Cost breakdown', style: 'padding:1px 6px' }, act, view.expanded.has(r.id) ? '▾' : '▸');
        exp.addEventListener('click', () => { view.expanded.has(r.id) ? view.expanded.delete(r.id) : view.expanded.add(r.id); renderTable(); });
        if (view.expanded.has(r.id)) {
          const dr = el('tr', {}, tbody); const dc = el('td', { colspan: COLS.length + 1, style: 'padding:6px 16px 12px;background:var(--bg2)' }, dr);
          const line = el('div', { style: 'display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end' }, dc);
          const entries = Object.keys(r.breakdown).filter(k => r.breakdown[k] > 0).sort((a2, b2) => r.breakdown[b2] - r.breakdown[a2]);
          if (!entries.length) el('span', { class: 'tc-mut' }, line, 'empty room');
          entries.forEach(k => {
            const v = Math.round(r.breakdown[k] * 10) / 10;
            const cell = el('div', { style: 'min-width:64px' }, line);
            const barH = Math.max(2, Math.min(46, v / Math.max(1, r.cost) * 90));
            el('div', { style: 'height:' + barH + 'px;width:18px;border-radius:2px 2px 0 0;background:var(--acc);opacity:.55' }, cell);
            el('div', { style: 'font-size:11px;color:var(--txt)' }, cell, '' + v);
            el('div', { class: 'tc-mut', style: 'font-size:10px' }, cell, BD_LABELS[k] || k);
          });
        }
      });
    }
    renderTable();
  }

  T.registerTool({
    id: 'perf', label: 'Per-room perf budgets', icon: '📊', group: 'Tools',
    sub: 'room cost estimate · budget flags · cost breakdown',
    build(host, a) { api = a; bodyEl = host; render(); }
  });
  if (T.roadmapDone) T.roadmapDone(67);
})();
