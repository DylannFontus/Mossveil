// MOSSVEIL — tool-templates.js : Starter templates & generators (Edit ▸ World).  Roadmap #53.
// Stamp a whole room from a preset instead of hand-placing every tile and prop. Each template is a
// pure generator: gen(opts) -> { w, h, tiles[], props[], enemies[], spawns{}, note } built from the
// game's OWN registries (biomes, enemy types, bosses, decor), so it always matches what exists. Two
// apply paths: (1) "New room" creates a fresh G.LEVELS entry (mirrors the editor's New-level flow) and
// opens it; (2) "Stamp into current" overlays the template's solids + props into the open level at a
// tile offset (destructive, like the building kit). Editor-only, fully offline — no engine change.
(function () {
  const T = G.Tools;
  if (!T) return;
  const ED = () => G.__ed || {};
  const levels = () => G.LEVELS || {};
  const W = () => G.World || {};
  const rng = seed => (G.U && G.U.mulberry32) ? G.U.mulberry32((seed >>> 0) || 1) : Math.random;
  const biomeList = () => (W().BIOMES && W().BIOMES.slice()) || Object.keys((W().PAL) || { cavern: 1 });
  const biomeLabel = b => ((W().PAL && W().PAL[b] && W().PAL[b].label) || b);
  const enemyTypes = () => ((G.Enemies && G.Enemies.TYPES) || []).map(t => t.id);
  const bossId = () => (((G.Bosses && G.Bosses.LIST) || [])[0] || {}).id || '';
  const decorStanding = () => (((W().DECOR_KINDS && W().DECOR_KINDS.standing) || ['fern']))[0];
  const otherLevels = (notId) => Object.keys(levels()).filter(k => k !== notId);

  // ---- tile grid helper (row 0 = top; world-y is up, so floor lives in the bottom rows) ----
  const SOLID = '#', ONEWAY = '=', SPIKE = '^';
  function Grid(w, h) {
    const a = []; for (let r = 0; r < h; r++) a.push(new Array(w).fill(' '));
    return {
      w, h,
      set(c, r, ch) { if (c >= 0 && c < w && r >= 0 && r < h) a[r][c] = ch; },
      rect(c0, r0, c1, r1, ch) { for (let r = Math.max(0, r0); r <= Math.min(h - 1, r1); r++) for (let c = Math.max(0, c0); c <= Math.min(w - 1, c1); c++) a[r][c] = ch; },
      hline(c0, c1, r, ch) { this.rect(c0, r, c1, r, ch); },
      get(c, r) { return (r >= 0 && r < h && c >= 0 && c < w) ? a[r][c] : ' '; },
      rows() { return a.map(row => row.join('')); }
    };
  }
  // a closed room shell: 1-thick ceiling + side walls, `ft`-thick floor. Floor top surface = world-y `ft`.
  function shell(w, h, ft) {
    const g = Grid(w, h);
    g.rect(0, 0, w - 1, 0, SOLID);          // ceiling
    g.rect(0, 0, 0, h - 1, SOLID);          // left wall
    g.rect(w - 1, 0, w - 1, h - 1, SOLID);  // right wall
    g.rect(0, h - ft, w - 1, h - 1, SOLID); // floor
    return g;
  }
  // tile-row for a given world-y standing height (top of a 1-tile ledge at world-y `y`)
  const rowForY = (h, y) => h - 1 - Math.floor(y);

  // =================== templates ===================
  // Each: gen(o) -> { w,h, tiles[], props[], enemies[], spawns{}, note }. o = { biome, seed, w, h, count, enemy }.
  const TEMPLATES = [
    {
      id: 'blank', label: 'Empty room', icon: '⬛', group: 'Rooms',
      desc: 'A clean walled box with a floor and one spawn — the bare canvas.',
      def: { w: 50, h: 22 },
      gen(o) {
        const w = o.w, h = o.h, ft = 3, g = shell(w, h, ft);
        return { w, h, tiles: g.rows(), props: [], enemies: [], spawns: { P: { x: 4, y: ft + 0.5 } }, note: 'walled box · floor · spawn P' };
      }
    },
    {
      id: 'arena', label: 'Combat arena', icon: '⚔️', group: 'Rooms',
      desc: 'Enclosed room with two side ledges and a handful of enemies on the floor.',
      def: { w: 48, h: 22, count: 3 },
      gen(o) {
        const w = o.w, h = o.h, ft = 3, g = shell(w, h, ft), R = rng(o.seed);
        const ledgeR = rowForY(h, Math.round(h * 0.45));
        g.hline(3, Math.round(w * 0.32), ledgeR, ONEWAY);
        g.hline(w - 1 - Math.round(w * 0.32), w - 4, ledgeR, ONEWAY);
        const type = o.enemy || enemyTypes()[0] || 'tumblebug';
        const n = Math.max(1, Math.min(8, o.count | 0 || 3)), enemies = [];
        for (let i = 0; i < n; i++) enemies.push({ type, x: +(6 + (w - 12) * (n === 1 ? 0.5 : i / (n - 1))).toFixed(1), y: ft + 0.6 });
        const props = [{ type: 'sign', x: 3.5, y: ft + 0.5, text: 'They are already awake.' }];
        return { w, h, tiles: g.rows(), props, enemies, spawns: { P: { x: 3, y: ft + 0.5 } }, note: n + '× ' + type + ' · 2 ledges' };
      }
    },
    {
      id: 'boss', label: 'Boss arena', icon: '👑', group: 'Rooms',
      desc: 'A wide sealed arena: a boss trigger centre-stage and boss gates at both exits.',
      def: { w: 58, h: 26 },
      gen(o) {
        const w = o.w, h = o.h, ft = 3, g = shell(w, h, ft);
        const bid = o.boss || bossId();
        const props = [
          { type: 'gate', x: 2.5, y: ft, id: 0 },
          { type: 'gate', x: w - 2.5, y: ft, id: 0 },
          { type: 'bossTrigger', x: +(w / 2).toFixed(1), y: ft + 0.4, boss: bid }
        ];
        return { w, h, tiles: g.rows(), props, enemies: [], spawns: { P: { x: 5, y: ft + 0.5 } }, note: (bid || 'boss') + ' · 2 gates' };
      }
    },
    {
      id: 'platform', label: 'Platforming gauntlet', icon: '🪜', group: 'Rooms',
      desc: 'Staggered one-way platforms climbing upward, with spike gaps between.',
      def: { w: 40, h: 30 },
      gen(o) {
        const w = o.w, h = o.h, ft = 2, g = shell(w, h, ft), R = rng(o.seed);
        // spikes scattered on the floor between safe spots
        for (let c = 6; c < w - 6; c += 3) if (R() < 0.5) g.set(c, h - ft - 1, SPIKE);
        const steps = Math.max(3, Math.floor((h - 6) / 4));
        for (let i = 1; i <= steps; i++) {
          const r = rowForY(h, ft + i * 3 + 1);
          const left = (i % 2 === 0);
          const cx = left ? 3 + Math.floor((w - 14) * R()) : Math.floor(w * 0.45 + (w * 0.4) * R());
          g.hline(cx, Math.min(w - 3, cx + 4 + Math.floor(R() * 3)), r, ONEWAY);
        }
        return { w, h, tiles: g.rows(), props: [{ type: 'sign', x: 3.5, y: ft + 0.5, text: 'Up, then. Mind the teeth.' }], enemies: [], spawns: { P: { x: 3, y: ft + 0.5 } }, note: steps + ' platforms · spikes' };
      }
    },
    {
      id: 'save', label: 'Save room', icon: '🪑', group: 'Rooms',
      desc: 'A small calm chamber — a bench to rest at, lamps and a touch of foliage.',
      def: { w: 26, h: 16 },
      gen(o) {
        const w = o.w, h = o.h, ft = 3, g = shell(w, h, ft);
        const dk = decorStanding();
        const props = [
          { type: 'bench', x: +(w / 2).toFixed(1), y: ft + 0.2 },
          { type: 'lamp', x: 4, y: ft + 0.2 }, { type: 'lamp', x: w - 4, y: ft + 0.2 },
          { type: 'decor', kind: dk, x: 6.5, y: ft + 0.1, scale: 1 },
          { type: 'decor', kind: dk, x: w - 6.5, y: ft + 0.1, scale: 1 },
          { type: 'sign', x: +(w / 2 - 3).toFixed(1), y: ft + 0.5, text: 'Rest. The dark keeps.' }
        ];
        return { w, h, tiles: g.rows(), props, enemies: [], spawns: { P: { x: 3, y: ft + 0.5 } }, note: 'bench · 2 lamps · decor' };
      }
    },
    {
      id: 'corridor', label: 'Connector corridor', icon: '↔️', group: 'Rooms',
      desc: 'A long thin hall with a transition zone at each end (wired to neighbouring rooms).',
      def: { w: 64, h: 12 },
      gen(o) {
        const w = o.w, h = o.h, ft = 3, g = shell(w, h, ft);
        const others = otherLevels(o.newId || '');
        const trans = [
          { rect: { x: 1.5, y: ft + 1.6, w: 2, h: 3.4 }, to: others[0] || (o.newId || ''), spawn: 'P' },
          { rect: { x: w - 1.5, y: ft + 1.6, w: 2, h: 3.4 }, to: others[1] || others[0] || (o.newId || ''), spawn: 'P' }
        ];
        return { w, h, tiles: g.rows(), props: [{ type: 'sign', x: +(w / 2).toFixed(1), y: ft + 0.5, text: 'The passage narrows.' }], enemies: [], transitions: trans, spawns: { P: { x: 5, y: ft + 0.5 } }, note: 'exits both ends' };
      }
    },
    {
      id: 'shaft', label: 'Vertical shaft', icon: '🧗', group: 'Rooms',
      desc: 'A tall narrow climb with zig-zagging one-way platforms and an updraft.',
      def: { w: 18, h: 40 },
      gen(o) {
        const w = o.w, h = o.h, ft = 2, g = shell(w, h, ft), R = rng(o.seed);
        const steps = Math.floor((h - 6) / 4);
        for (let i = 1; i <= steps; i++) {
          const r = rowForY(h, ft + i * 4);
          const left = (i % 2 === 0);
          if (left) g.hline(1, Math.floor(w * 0.5), r, ONEWAY); else g.hline(Math.floor(w * 0.5), w - 2, r, ONEWAY);
        }
        const props = [{ type: 'windzone', x: +(w / 2).toFixed(1), y: +(h / 2).toFixed(1), w: w - 2, h: h - 4, fx: 0, fy: 12 }];
        return { w, h, tiles: g.rows(), props, enemies: [], spawns: { P: { x: 3, y: ft + 0.5 } }, note: steps + ' platforms · updraft' };
      }
    },
    {
      id: 'hazard', label: 'Hazard hall', icon: '🌋', group: 'Rooms',
      desc: 'A floor broken by lava pools, with safe one-way stepping stones across.',
      def: { w: 52, h: 20 },
      gen(o) {
        const w = o.w, h = o.h, ft = 3, g = shell(w, h, ft), R = rng(o.seed);
        const props = [], pools = 2;
        const stepR = rowForY(h, ft + 4);
        for (let i = 0; i < pools; i++) {
          const px = +(w * (i + 1) / (pools + 1)).toFixed(1);
          props.push({ type: 'pool', kind: 'lava', x: px, y: ft + 0.1, w: 8, h: 1.8, dmg: 1 });
          g.hline(Math.round(px - 2), Math.round(px + 2), stepR, ONEWAY);   // a stepping stone above each pool
        }
        props.push({ type: 'sign', x: 3.5, y: ft + 0.5, text: 'The floor runs molten.' });
        return { w, h, tiles: g.rows(), props, enemies: [], spawns: { P: { x: 3, y: ft + 0.5 } }, note: pools + ' lava pools · stepping stones' };
      }
    }
  ];
  const byId = id => TEMPLATES.find(t => t.id === id);
  function optsFor(tpl, over) { return Object.assign({ biome: biomeList()[0], seed: 7, count: 3, enemy: enemyTypes()[0] }, tpl.def, over || {}); }

  // =================== apply paths ===================
  // (1) create a brand-new level from a template and open it
  function createRoom(tplId, o) {
    const tpl = byId(tplId); if (!tpl) return null;
    let id = (o && o.id ? String(o.id) : tplId + 'room').replace(/[^a-zA-Z0-9_]/g, '');
    if (!id) id = 'room';
    if (levels()[id]) { let n = 2; while (levels()[id + n]) n++; id = id + n; }
    const opt = optsFor(tpl, Object.assign({}, o, { newId: id }));
    const plan = tpl.gen(opt);
    const maxMx = Math.max(0, ...Object.values(levels()).map(L => (L.mapPos ? L.mapPos.mx : 0) + (L.w || 0)));
    levels()[id] = {
      id, title: (o && o.title) || (tpl.label), area: null, biome: opt.biome,
      w: plan.w, h: plan.h, mapPos: { mx: maxMx + 8, my: 0 },
      tiles: plan.tiles, spawns: plan.spawns || { P: { x: 4, y: 3.5 } },
      enemies: plan.enemies || [], props: plan.props || [], transitions: plan.transitions || []
    };
    if (ED().markDirty) ED().markDirty();
    if (ED().openLevel) ED().openLevel(id);
    return id;
  }

  // (2) overlay a template's solids + props into the OPEN level at a tile offset (destructive bake)
  function stampInto(levelId, tplId, ox, oy, o) {
    const L = levels()[levelId], tpl = byId(tplId); if (!L || !tpl) return false;
    const plan = tpl.gen(optsFor(tpl, Object.assign({}, o, { newId: levelId })));
    L.tiles = L.tiles || []; L.props = L.props || []; L.enemies = L.enemies || [];
    // ensure the target grid is big enough (pad rows / columns with spaces)
    while (L.tiles.length < L.h) L.tiles.push('');
    ox = ox | 0; oy = oy | 0;
    plan.tiles.forEach((row, r) => {
      const tr = oy + r; if (tr < 0 || tr >= L.h) return;
      let dst = (L.tiles[tr] || '').padEnd(L.w, ' ').split('');
      for (let c = 0; c < row.length; c++) { const ch = row[c]; if (ch !== ' ') { const tc = ox + c; if (tc >= 0 && tc < L.w) dst[tc] = ch; } }
      L.tiles[tr] = dst.join('');
    });
    // props/enemies: shift world-x by ox; world-y by (template floor relative) — keep simple: offset x only,
    // and lift y by the offset from the template's bottom to the stamp's bottom row.
    const dyWorld = (L.h - (oy + plan.h));   // bottom of the stamped block in world-y
    const shift = (arr, dst) => (arr || []).forEach(p => { const q = JSON.parse(JSON.stringify(p)); q.x = +(q.x + ox).toFixed(2); q.y = +(q.y + Math.max(0, dyWorld)).toFixed(2); dst.push(q); });
    shift(plan.props, L.props); shift(plan.enemies, L.enemies);
    if (ED().markDirty) ED().markDirty();
    if (ED().openLevel && ED().currentId && ED().currentId() === levelId) ED().openLevel(levelId);
    return true;
  }

  // =================== test / external API ===================
  T.templates = {
    list: () => TEMPLATES.map(t => ({ id: t.id, label: t.label, group: t.group })),
    gen: (id, o) => { const t = byId(id); return t ? t.gen(optsFor(t, o)) : null; },
    validate: (id, o) => { const p = T.templates.gen(id, o); if (!p) return { ok: false, why: 'no template' }; const okRows = Array.isArray(p.tiles) && p.tiles.length === p.h && p.tiles.every(r => r.length === p.w); const okSpawn = !!(p.spawns && p.spawns.P); return { ok: okRows && okSpawn, rows: p.tiles.length, h: p.h, spawn: okSpawn, w: p.w }; },
    createRoom, stampInto,
    biomes: biomeList, enemyTypes, currentLevel: () => (ED().currentId ? ED().currentId() : null),
    open: () => T.openTool('templates')
  };

  // =================== UI ===================
  let bodyEl = null, api = null;
  const view = { sel: 'arena', mode: 'new', id: '', biome: null, seed: 7, count: 3, enemy: null, ox: 4, oy: 2 };
  function el(t, a, p, x) { return api.el(t, a, p, x); }

  function previewCanvas(plan, cw, ch) {
    const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
    cv.style.cssText = 'width:100%;border:1px solid var(--line);border-radius:5px;background:#0a1014';
    const cx = cv.getContext('2d'); cx.clearRect(0, 0, cw, ch);
    if (!plan) return cv;
    const pad = 8, sc = Math.min((cw - 2 * pad) / plan.w, (ch - 2 * pad) / plan.h);
    const ox = (cw - plan.w * sc) / 2, oy = (ch - plan.h * sc) / 2;
    // tiles
    for (let r = 0; r < plan.h; r++) for (let c = 0; c < plan.w; c++) {
      const chc = plan.tiles[r][c]; if (chc === ' ') continue;
      cx.fillStyle = chc === SPIKE ? '#e8b85f' : chc === ONEWAY ? '#7fe8c0' : '#6a7686';
      cx.fillRect(ox + c * sc, oy + r * sc, Math.max(1, sc), Math.max(1, sc));
    }
    // props / enemies / spawns as dots (world-y up → screen-y down)
    const Y = wy => oy + (plan.h - wy) * sc, X = wx => ox + wx * sc;
    (plan.props || []).forEach(p => { cx.fillStyle = '#9bd0ff'; cx.beginPath(); cx.arc(X(p.x), Y(p.y), 2.4, 0, 7); cx.fill(); });
    (plan.enemies || []).forEach(p => { cx.fillStyle = '#ff8f8f'; cx.beginPath(); cx.arc(X(p.x), Y(p.y), 2.6, 0, 7); cx.fill(); });
    Object.values(plan.spawns || {}).forEach(s => { cx.fillStyle = '#a0e87f'; cx.beginPath(); cx.arc(X(s.x), Y(s.y), 3, 0, 7); cx.fill(); });
    cx.fillStyle = '#5a6b72'; cx.font = '11px monospace'; cx.textAlign = 'center';
    cx.fillText(plan.w + '×' + plan.h + '  ·  ' + (plan.note || ''), cw / 2, ch - 5);
    return cv;
  }

  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column;height:100%';
    if (view.biome == null) view.biome = biomeList()[0];
    if (view.enemy == null) view.enemy = enemyTypes()[0] || 'tumblebug';

    const grid = el('div', { style: 'flex:1;display:grid;grid-template-columns:240px 1fr;gap:0;min-height:0' }, bodyEl);

    // left: template list
    const left = el('div', { style: 'overflow:auto;border-right:1px solid var(--line);padding:8px;min-height:0' }, grid);
    el('div', { class: 'tc-mut', style: 'padding:2px 4px 8px' }, left, 'Pick a starter, tweak it, then create it as a new room or stamp it into the open one.');
    TEMPLATES.forEach(t => {
      const card = el('div', { class: 'tc-pal-item' + (view.sel === t.id ? ' sel' : ''), style: 'align-items:flex-start;gap:8px;cursor:pointer;margin:3px 0' }, left);
      el('span', { style: 'font-size:18px' }, card, t.icon);
      const txt = el('div', { style: 'flex:1;min-width:0' }, card);
      el('div', { style: 'color:var(--txt);font-size:12px' }, txt, t.label);
      el('div', { class: 'tc-mut', style: 'font-size:10px;line-height:1.35' }, txt, t.desc);
      card.addEventListener('click', () => { view.sel = t.id; render(); });
    });

    // right: preview + params + apply
    const right = el('div', { style: 'overflow:auto;padding:12px 14px;min-height:0;display:flex;flex-direction:column;gap:10px' }, grid);
    const tpl = byId(view.sel);
    const opt = optsFor(tpl, { biome: view.biome, seed: view.seed, count: view.count, enemy: view.enemy, w: view.w, h: view.h, newId: 'preview' });
    let plan = null; try { plan = tpl.gen(opt); } catch (e) { }
    el('h3', { style: 'margin:0;font-size:14px' }, right, tpl.icon + '  ' + tpl.label);
    right.appendChild(previewCanvas(plan, 360, 200));

    // params
    const pr = el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:8px' }, right);
    const numField = (key, label, min, max) => {
      const cell = el('label', { style: 'display:flex;flex-direction:column;gap:2px;font-size:11px;color:var(--txt2)' }, pr, label);
      const inp = el('input', { type: 'number', value: (opt[key]), min: '' + min, max: '' + max, step: '1' }, cell);
      inp.addEventListener('input', () => { let v = parseInt(inp.value, 10); if (isNaN(v)) return; v = Math.max(min, Math.min(max, v)); view[key] = v; render(); });
      return inp;
    };
    numField('w', 'Width', 12, 200); numField('h', 'Height', 10, 100);
    numField('seed', 'Seed', 0, 9999);
    if (tpl.id === 'arena') {
      numField('count', 'Enemies', 1, 8);
      const cell = el('label', { style: 'display:flex;flex-direction:column;gap:2px;font-size:11px;color:var(--txt2)' }, pr, 'Enemy type');
      const sel = el('select', {}, cell); enemyTypes().forEach(t => { const o = el('option', { value: t }, sel, t); if (t === view.enemy) o.selected = true; });
      sel.addEventListener('change', () => { view.enemy = sel.value; render(); });
    }
    const bcell = el('label', { style: 'display:flex;flex-direction:column;gap:2px;font-size:11px;color:var(--txt2)' }, pr, 'Biome');
    const bsel = el('select', {}, bcell); biomeList().forEach(b => { const o = el('option', { value: b }, bsel, biomeLabel(b)); if (b === view.biome) o.selected = true; });
    bsel.addEventListener('change', () => { view.biome = bsel.value; render(); });
    const reseed = el('button', { class: 'tbtn', style: 'align-self:flex-start;padding:4px 10px' }, right, '🎲 Random seed');
    reseed.addEventListener('click', () => { view.seed = (Math.random() * 9999) | 0; render(); });

    // apply — new room
    const box1 = el('div', { style: 'padding:10px;border:1px solid var(--line);border-radius:6px;display:flex;flex-direction:column;gap:8px' }, right);
    el('div', { style: 'font-size:12px;color:var(--txt)' }, box1, 'Create as a new room');
    const idrow = el('div', { class: 'tc-row' }, box1); el('label', {}, idrow, 'Room id');
    const idIn = el('input', { type: 'text', value: view.id || (tpl.id + 'room'), placeholder: tpl.id + 'room' }, idrow);
    idIn.addEventListener('input', () => { view.id = idIn.value; });
    const mk = el('button', { class: 'tbtn on', style: 'padding:8px' }, box1, '➕ Create "' + tpl.label + '" room');
    mk.addEventListener('click', () => {
      const id = createRoom(tpl.id, { id: idIn.value, biome: view.biome, seed: view.seed, count: view.count, enemy: view.enemy, w: view.w, h: view.h });
      if (id) { api.toast('Created room "' + id + '" and opened it'); T.closeTool(); }
    });

    // apply — stamp into current
    const cur = ED().currentId ? ED().currentId() : null, L = cur ? levels()[cur] : null;
    const box2 = el('div', { style: 'padding:10px;border:1px solid var(--line);border-radius:6px;display:flex;flex-direction:column;gap:8px' }, right);
    el('div', { style: 'font-size:12px;color:var(--txt)' }, box2, 'Stamp into the open room');
    if (!L) { el('div', { class: 'tc-mut' }, box2, 'No level open.'); }
    else {
      const orow = el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:8px' }, box2);
      const o1 = el('label', { style: 'display:flex;flex-direction:column;gap:2px;font-size:11px;color:var(--txt2)' }, orow, 'Tile X');
      const ox = el('input', { type: 'number', value: view.ox, min: '0', max: '' + (L.w || 200) }, o1); ox.addEventListener('input', () => view.ox = parseInt(ox.value, 10) || 0);
      const o2 = el('label', { style: 'display:flex;flex-direction:column;gap:2px;font-size:11px;color:var(--txt2)' }, orow, 'Tile Y (from top)');
      const oy = el('input', { type: 'number', value: view.oy, min: '0', max: '' + (L.h || 100) }, o2); oy.addEventListener('input', () => view.oy = parseInt(oy.value, 10) || 0);
      const st = el('button', { class: 'tbtn', style: 'padding:8px' }, box2, '⬛ Stamp into ' + (L.title || cur));
      st.addEventListener('click', () => { stampInto(cur, tpl.id, view.ox | 0, view.oy | 0, { biome: view.biome, seed: view.seed, count: view.count, enemy: view.enemy, w: view.w, h: view.h }); api.toast('Stamped ' + tpl.label + ' into ' + (L.title || cur)); });
      el('div', { class: 'tc-mut', style: 'font-size:11px' }, box2, 'Bakes solids + props into the open room (not a single undo step) — preview first.');
    }
  }

  T.registerTool({
    id: 'templates', label: 'Starter templates', icon: '🏗️', group: 'World',
    sub: 'generate a room from a preset — arena · boss · platforming · save · hazard',
    build(host, a) { api = a; bodyEl = host; render(); }
  });
  if (T.roadmapDone) T.roadmapDone(53);
})();
