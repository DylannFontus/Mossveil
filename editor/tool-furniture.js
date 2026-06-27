// MOSSVEIL — tool-furniture.js : Furniture & building kit (Edit ▸ World).  Roadmap #19.
// Two halves in a tabbed panel. (1) FURNITURE: a catalog of the full-colour Victorian furniture kinds
// (W.FURN — sofa / chair / fireplace / painting / bookshelf / table / rug / chandelier / plant), each
// rendered live through G.Thumb (the same path the asset browser uses), with usage across every level
// and an inline kind <select> to retype a placed furniture prop, plus a small lint pass. Unlike the
// Decor tool (#18, which catalogs flat SILHOUETTE decor), this covers the detailed full-colour pieces
// the building generator places. (2) BUILDINGS: a parameterised front-end for W.genBuilding with a live
// FOOTPRINT preview (shell + per-storey floor slabs + furniture slots) and a one-click stamp into the
// current level. Editor-only, fully offline — no engine change; it drives existing world.js systems.
(function () {
  const T = G.Tools;
  if (!T) return;
  const ED = () => G.__ed || {};
  const W = () => G.World || {};
  const levels = () => G.LEVELS || {};
  const FURN = () => W().FURN || {};

  // ---- catalog: every full-colour furniture kind ----
  function kinds() { return Object.keys(FURN()); }

  // ---- every furniture prop across all levels (resolved kind = how it actually renders) ----
  function furnitureProps() {
    const out = [], L = levels(), f = FURN();
    for (const id in L) (L[id].props || []).forEach((p, i) => {
      if (p && p.type === 'furniture') out.push({ level: id, title: L[id].title || id, idx: i, raw: p.kind, kind: f[p.kind] ? p.kind : 'sofa', x: p.x, y: p.y, scale: p.scale || 1, flip: !!p.flip });
    });
    return out;
  }
  function propsFor(name) { return furnitureProps().filter(d => d.kind === name); }
  function usage() { const u = {}; furnitureProps().forEach(d => u[d.kind] = (u[d.kind] || 0) + 1); return u; }

  function lint() {
    const out = [], f = FURN(), props = furnitureProps(), used = usage();
    for (const d of props) if (d.raw && !f[d.raw]) out.push({ sev: 'warn', level: d.level, idx: d.idx, msg: 'furniture prop has unknown kind "' + d.raw + '" (renders as sofa)' });
    kinds().forEach(k => { if (!used[k]) out.push({ sev: 'info', level: '', idx: -1, msg: 'furniture "' + k + '" is placed in no level' }); });
    return out;
  }

  // ---- the one furniture write path: change a prop's kind + mark dirty ----
  function setKind(level, idx, kind) {
    const p = levels()[level] && (levels()[level].props || [])[idx];
    if (!p || p.type !== 'furniture' || !FURN()[kind]) return false;
    p.kind = kind; if (ED().markDirty) ED().markDirty(); return true;
  }

  // ---- live preview: build the kind through W.FURN and snapshot it (best-effort, never throws) ----
  function preview(kind, size) {
    try {
      const drawer = FURN()[kind]; if (!drawer || !G.Thumb || !window.THREE) return null;
      const grp = new THREE.Group();
      const rng = (G.U && G.U.mulberry32) ? G.U.mulberry32(20260626) : Math.random;
      drawer(grp, 1, rng);
      return G.Thumb.snapshot(grp, { size: size || 74, zoom: 1.35, az: 0, el: 0 });
    } catch (e) { return null; }
  }

  // ---- building footprint plan (pure, NO mutation) — mirrors W.genBuilding's deterministic layout ----
  function buildingPlan(o) {
    const bx = o.x | 0, by = o.y | 0, bw = Math.max(4, o.w | 0), bh = Math.max(6, o.h | 0);
    const storeyH = Math.max(4, o.storeyH || 9);
    const floors = [by + 1];
    for (let fy = by + storeyH; fy < by + bh - 3; fy += storeyH) floors.push(fy + 1);
    const ix0 = bx + 2, ix1 = bx + bw - 3;
    const slots = Math.max(0, Math.round((ix1 - ix0 - 1) / 4));   // ~furniture pieces per storey
    return { bx, by, bw, bh, storeyH, floors, ix0, ix1, slots, wallMat: o.wallMat || 'b', floorMat: o.floorMat || 'w' };
  }

  // ---- stamp a building into a level (destructive: bakes walls/floors into tiles + furniture props) ----
  function stampBuilding(levelId, o) {
    const L = levels()[levelId];
    if (!L || !W().genBuilding) return false;
    L.tiles = L.tiles || []; L.props = L.props || [];
    W().genBuilding(L, { x: o.x | 0, y: o.y | 0, w: Math.max(4, o.w | 0), h: Math.max(6, o.h | 0), seed: o.seed | 0, storeyH: Math.max(4, o.storeyH || 9), wallMat: o.wallMat || 'b', floorMat: o.floorMat || 'w' });
    if (ED().markDirty) ED().markDirty();
    return true;
  }

  // =================== test / external API ===================
  T.furniture = { kinds, furnitureProps, propsFor, usage, lint, setKind, preview, buildingPlan, stampBuilding, currentLevel: () => (ED().currentId ? ED().currentId() : null), openInTool: () => T.openTool('furniture') };

  // =================== UI ===================
  let bodyEl = null, api = null;
  const view = { tab: 'furniture', sel: null, build: { x: 8, y: 0, w: 24, h: 30, seed: 7, storeyH: 9 } };
  function el(t, a, p, x) { return api.el(t, a, p, x); }

  function jump(level, idx) {
    if (!levels()[level] || idx < 0) return;
    if (ED().selectProp) { ED().selectProp(level, idx); T.closeTool(); api.toast('Selected furniture in ' + ((levels()[level] || {}).title || level)); }
    else if (ED().openLevel) { ED().openLevel(level); T.closeTool(); }
  }

  function tabs() {
    const tb = el('div', { style: 'display:flex;gap:6px;padding:8px 12px;border-bottom:1px solid var(--line)' }, bodyEl);
    [['furniture', '🛋 Furniture'], ['buildings', '🏠 Buildings']].forEach(([id, label]) => {
      const b = el('button', { class: 'tbtn' + (view.tab === id ? ' on' : '') }, tb, label);
      b.addEventListener('click', () => { view.tab = id; render(); });
    });
  }

  // ---------- FURNITURE tab ----------
  function renderFurniture() {
    const all = kinds(), props = furnitureProps(), used = usage(), issues = lint();

    const bar = el('div', { class: 'tc-mut', style: 'padding:8px 12px;border-bottom:1px solid var(--line);display:flex;gap:14px;flex-wrap:wrap' }, bodyEl);
    const stat = (lab, val, warn) => { const w = el('span', {}, bar); el('b', { style: 'color:' + (warn && val ? '#ffcf4a' : 'var(--txt)') }, w, '' + val); w.appendChild(document.createTextNode(' ' + lab)); };
    stat('kinds', all.length);
    stat('placed', Object.keys(used).length + '/' + all.length);
    stat('furniture props', props.length);
    stat('issues', issues.length, true);

    const grid = el('div', { style: 'flex:1;display:grid;grid-template-columns:1fr 300px;gap:0;min-height:0' }, bodyEl);
    const left = el('div', { style: 'overflow:auto;padding:10px;min-height:0;display:flex;flex-wrap:wrap;gap:8px;align-content:flex-start' }, grid);
    if (!all.length) el('div', { class: 'tc-mut', style: 'padding:18px' }, left, 'No furniture kinds (W.FURN) found.');
    all.forEach(name => {
      const card = el('div', { class: 'tc-pal-item' + (view.sel === name ? ' sel' : ''), style: 'flex:0 0 auto;width:96px;flex-direction:column;align-items:center;gap:3px;padding:6px;cursor:pointer' }, left);
      const wrap = el('div', { style: 'width:74px;height:74px;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.22);border-radius:6px;overflow:hidden' }, card);
      const cv = preview(name, 74);
      if (cv) { cv.style.cssText = 'width:74px;height:74px'; wrap.appendChild(cv); } else el('span', { class: 'tc-mut', style: 'font-size:22px' }, wrap, '🛋');
      el('div', { style: 'font-size:11px;text-align:center;color:var(--txt)', title: name }, card, name);
      el('span', { class: 'tc-pill ' + (used[name] ? 'done' : 'skip'), style: 'font-size:9px;padding:0 4px', title: 'placed count' }, card, '·' + (used[name] || 0));
      card.addEventListener('click', () => { view.sel = (view.sel === name ? null : name); render(); });
    });

    const right = el('div', { style: 'overflow:auto;padding:12px 14px;border-left:1px solid var(--line);min-height:0' }, grid);
    if (view.sel) {
      const big = el('div', { style: 'width:140px;height:140px;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.22);border-radius:8px;margin:0 auto 8px' }, right);
      const cv = preview(view.sel, 140);
      if (cv) { cv.style.cssText = 'width:140px;height:140px'; big.appendChild(cv); } else el('span', { style: 'font-size:34px' }, big, '🛋');
      el('h3', { style: 'margin:0 0 8px;text-align:center' }, right, view.sel);
      const ps = propsFor(view.sel);
      el('div', { class: 'tc-mut', style: 'margin-bottom:3px' }, right, 'Placed as a furniture prop (' + ps.length + ')');
      if (!ps.length) el('span', { class: 'tc-mut' }, right, 'none — place one with the building kit, or via the asset browser.');
      ps.forEach(d => {
        const row = el('div', { class: 'tc-row', style: 'margin:2px 0;align-items:center' }, right);
        const a = el('a', { href: '#', style: 'color:var(--acc);text-decoration:none;flex:1' }, row, (d.title || d.level) + '  ' + Math.round(d.x) + ',' + Math.round(d.y) + (d.raw !== d.kind ? '  (was "' + d.raw + '")' : ''));
        a.addEventListener('click', e => { e.preventDefault(); jump(d.level, d.idx); });
        const sel = el('select', { title: 'Change kind', style: 'max-width:110px' }, row);
        all.forEach(o => { const op = el('option', { value: o }, sel, o); if (o === d.kind) op.selected = true; });
        sel.addEventListener('change', () => { setKind(d.level, d.idx, sel.value); render(); });
      });
    } else {
      el('h3', { style: 'margin:0 0 6px;font-size:13px' }, right, 'Issues · ' + issues.length);
      if (!issues.length) el('div', { class: 'tc-pill done', style: 'display:inline-block' }, right, 'No problems found.');
      issues.forEach(it => {
        const row = el('div', { class: 'tc-row', style: 'margin:2px 0;align-items:center' }, right);
        el('span', { style: 'color:' + (it.sev === 'warn' ? '#ffcf4a' : 'var(--txt2)') + ';margin-right:6px' }, row, it.sev === 'warn' ? '⚠' : 'ℹ');
        el('span', { style: 'flex:1' }, row, it.msg);
        if (it.idx >= 0 && levels()[it.level]) { const b = el('button', { class: 'tbtn', style: 'padding:1px 6px' }, row, '↗'); b.addEventListener('click', () => jump(it.level, it.idx)); }
      });
      el('div', { class: 'tc-mut', style: 'margin-top:12px;font-size:11px' }, right, 'Select a kind to preview it and find/retype its placed props. New pieces are placed by the building kit or the asset browser.');
    }
  }

  // ---------- BUILDINGS tab ----------
  function drawBuilding(canvas, plan) {
    const cx = canvas.getContext('2d'), CW = canvas.width, CH = canvas.height;
    cx.clearRect(0, 0, CW, CH); cx.fillStyle = '#0a1014'; cx.fillRect(0, 0, CW, CH);
    const pad = 10, scale = Math.min((CW - 2 * pad) / plan.bw, (CH - 2 * pad) / plan.bh);
    const ox = (CW - plan.bw * scale) / 2, oy = (CH - plan.bh * scale) / 2;
    const X = lx => ox + lx * scale, Y = ly => oy + (plan.bh - ly) * scale;   // building-local, y up
    // shell
    cx.fillStyle = 'rgba(120,90,60,0.18)'; cx.fillRect(ox, oy, plan.bw * scale, plan.bh * scale);
    cx.strokeStyle = '#9c6a44'; cx.lineWidth = Math.max(2, scale * 0.9); cx.strokeRect(ox + scale / 2, oy + scale / 2, (plan.bw - 1) * scale, (plan.bh - 1) * scale);
    // floor slabs + furniture slots per storey
    for (const fy of plan.floors) {
      const ly = fy - plan.by;
      cx.strokeStyle = '#caa24a'; cx.lineWidth = Math.max(1.5, scale * 0.5);
      cx.beginPath(); cx.moveTo(X(1), Y(ly)); cx.lineTo(X(plan.bw - 1), Y(ly)); cx.stroke();
      // a stairwell gap marker mid-span
      cx.strokeStyle = '#0a1014'; cx.beginPath(); cx.moveTo(X(plan.bw / 2 - 1), Y(ly)); cx.lineTo(X(plan.bw / 2 + 1), Y(ly)); cx.stroke();
      cx.fillStyle = '#7a2f35';
      for (let i = 0; i < plan.slots; i++) { const lx = 2.5 + (plan.bw - 5) * (plan.slots <= 1 ? 0.5 : i / (plan.slots - 1)); cx.beginPath(); cx.arc(X(lx), Y(ly + 0.8), Math.max(2, scale * 0.4), 0, 7); cx.fill(); }
    }
    cx.fillStyle = '#5a6b72'; cx.font = '11px monospace'; cx.textAlign = 'center';
    cx.fillText(plan.bw + '×' + plan.bh + '  ·  ' + plan.floors.length + ' storeys  ·  ~' + (plan.slots * plan.floors.length) + ' pieces', CW / 2, CH - 5);
  }

  function renderBuildings() {
    const cur = view.build, lid = ED().currentId ? ED().currentId() : null, L = lid ? levels()[lid] : null;
    const wrap = el('div', { style: 'flex:1;overflow:auto;padding:14px 16px;display:flex;flex-direction:column;gap:12px' }, bodyEl);

    el('div', { class: 'tc-mut', style: 'font-size:12px;line-height:1.5' }, wrap,
      'Stamp a procedural Victorian building (a stone shell + wood-floor storeys + furnished interior + warm lamps) into the current level. The footprint previews live; stamping bakes walls/floors into tiles and adds the furniture as props.');

    // footprint preview
    const plan = buildingPlan(cur);
    const cv = el('canvas', { width: 300, height: 190, style: 'width:100%;border:1px solid var(--line);border-radius:4px;background:#0a1014' }, wrap);
    drawBuilding(cv, plan);

    // params
    const grid = el('div', { style: 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px' }, wrap);
    const num = (key, label, min, max) => {
      const cell = el('label', { style: 'display:flex;flex-direction:column;gap:2px;font-size:11px;color:var(--txt2)' }, grid, label);
      const inp = el('input', { type: 'number', value: cur[key], min: '' + min, max: '' + max, step: '1', style: 'width:100%' }, cell);
      inp.addEventListener('input', () => { let v = parseInt(inp.value, 10); if (isNaN(v)) return; v = Math.max(min, Math.min(max, v)); cur[key] = v; const np = buildingPlan(cur); drawBuilding(cv, np); });
      return inp;
    };
    num('x', 'X (tiles)', 0, 400); num('y', 'Y (tiles)', 0, 400); num('w', 'Width', 4, 120);
    num('h', 'Height', 6, 120); num('storeyH', 'Storey height', 4, 30); num('seed', 'Seed', 0, 9999);

    const reseed = el('button', { class: 'tbtn', style: 'align-self:flex-start;padding:5px 10px;font-size:12px' }, wrap, '🎲 Random seed');
    reseed.addEventListener('click', () => { cur.seed = (Math.random() * 9999) | 0; render(); });

    // target + stamp
    const tgt = el('div', { style: 'padding:10px;border:1px solid var(--line);border-radius:6px;display:flex;flex-direction:column;gap:8px' }, wrap);
    if (!L) {
      el('div', { class: 'tc-mut' }, tgt, 'No level open — open a level to stamp into it.');
    } else {
      const furnN = (L.props || []).filter(p => p && p.type === 'furniture').length;
      el('div', { style: 'font-size:12px' }, tgt, 'Target: ' + (L.title || lid) + '   (' + (L.w || 0) + '×' + (L.h || 0) + ', ' + furnN + ' furniture props)');
      const stampBtn = el('button', { class: 'tbtn on', style: 'padding:9px;font-size:13px' }, tgt, '🏠 Stamp building into ' + (L.title || lid));
      stampBtn.addEventListener('click', () => {
        stampBuilding(lid, cur);
        if (ED().openLevel && lid) ED().openLevel(lid);   // rebuild the scene so the building shows
        api.toast('Stamped a ' + plan.bw + '×' + plan.bh + ' building'); render();
      });
      el('div', { class: 'tc-mut', style: 'font-size:11px' }, tgt, 'Stamping is immediate and bakes into the level (it is not a single undoable step) — preview first.');
    }
  }

  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column;height:100%';
    tabs();
    if (view.tab === 'buildings') renderBuildings(); else renderFurniture();
  }

  T.registerTool({
    id: 'furniture', label: 'Furniture & buildings', icon: '🛋️', group: 'World',
    sub: 'full-colour furniture catalog · usage · retype · building generator',
    build(host, a) { api = a; bodyEl = host; render(); }
  });
  if (T.roadmapDone) T.roadmapDone(19);
})();
