// MOSSVEIL — tool-lighting.js : Lighting editor (Edit ▸ World).  Roadmap #28.
// The authoring surface for the dynamic-2D-lighting system (src/lights.js + post.js) and its light
// shafts. It catalogs every `light` and `ray` prop across all levels, lets you tune each one inline
// (colour / radius / brightness / flicker for lights; size / opacity / angle for shafts), and shows a
// LIVE per-room light-map preview — the actual light pools (additive radial falloff) + shafts over the
// room — so you can see where the light lands. A small lint catches invisible or oversized lights.
// Read-only over G.LEVELS except the inline edits; NO engine change (lights.js is untouched).
(function () {
  const T = G.Tools;
  if (!T) return;
  const ED = () => G.__ed || {};
  const levels = () => G.LEVELS || {};
  const LIGHT_DEF = '#ffeecc';

  function hexRgb(h) { const n = parseInt(String(h || LIGHT_DEF).replace('#', ''), 16) || 0xffeecc; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

  function levelReport(id) {
    const lv = levels()[id]; if (!lv) return null;
    const lights = [], rays = [];
    (lv.props || []).forEach((p, idx) => {
      if (!p) return;
      if (p.type === 'light') lights.push({ idx, x: p.x, y: p.y, color: p.color || LIGHT_DEF, scale: p.scale != null ? p.scale : 8, opacity: p.opacity != null ? p.opacity : 0.3, flicker: !!p.flicker });
      else if (p.type === 'ray') rays.push({ idx, x: p.x, y: p.y, w: p.w != null ? p.w : 5, h: p.h != null ? p.h : 18, opacity: p.opacity != null ? p.opacity : 0.1, rot: p.rot != null ? p.rot : -0.15 });
    });
    return { id, title: lv.title || id, w: lv.w || 0, h: lv.h || 0, tiles: lv.tiles || [], lights, rays };
  }
  function allLights() { const out = []; for (const id in levels()) { const r = levelReport(id); r.lights.forEach(l => out.push(Object.assign({ level: id, title: r.title }, l))); } return out; }
  function allRays() { const out = []; for (const id in levels()) { const r = levelReport(id); r.rays.forEach(l => out.push(Object.assign({ level: id, title: r.title }, l))); } return out; }

  function lint() {
    const out = [];
    for (const id in levels()) {
      const r = levelReport(id);
      r.lights.forEach(l => {
        if (l.opacity <= 0) out.push({ sev: 'warn', level: id, idx: l.idx, msg: 'light has 0 brightness (opacity) — it casts no light' });
        else if (l.scale > 40) out.push({ sev: 'info', level: id, idx: l.idx, msg: 'light radius is very large (scale ' + l.scale + ')' });
      });
      r.rays.forEach(l => { if (l.opacity <= 0) out.push({ sev: 'warn', level: id, idx: l.idx, msg: 'light shaft has 0 opacity — invisible' }); });
    }
    return out;
  }

  function stats() {
    let lights = 0, rays = 0, lit = 0, total = 0;
    for (const id in levels()) { const r = levelReport(id); total++; lights += r.lights.length; rays += r.rays.length; if (r.lights.length || r.rays.length) lit++; }
    return { levels: total, lights, rays, lit, issues: lint().length };
  }

  function setLight(level, idx, key, val) {
    const p = levels()[level] && (levels()[level].props || [])[idx];
    if (!p || p.type !== 'light') return false;
    if (key === 'flicker') p.flicker = !!val; else if (key === 'color') p.color = val; else p[key] = +val;
    if (ED().markDirty) ED().markDirty(); return true;
  }
  function setRay(level, idx, key, val) {
    const p = levels()[level] && (levels()[level].props || [])[idx];
    if (!p || p.type !== 'ray') return false;
    p[key] = +val; if (ED().markDirty) ED().markDirty(); return true;
  }

  // =================== test / external API ===================
  T.lighting = { levelReport, allLights, allRays, lint, stats, setLight, setRay, openInTool: () => T.openTool('lighting') };

  // =================== UI ===================
  let bodyEl = null, api = null;
  const view = { filter: 'all', q: '', sel: null };
  function el(t, a, p, x) { return api.el(t, a, p, x); }

  function jump(level, idx) {
    if (!levels()[level]) return;
    if (idx >= 0 && ED().selectProp) { ED().selectProp(level, idx); T.closeTool(); api.toast('Selected in ' + ((levels()[level] || {}).title || level)); }
    else if (ED().openLevel) { ED().openLevel(level); T.closeTool(); }
  }

  // live light-map: additive radial pools (lights) + tinted shafts (rays) over the room schematic
  function drawLightmap(canvas, r) {
    const cx = canvas.getContext('2d'), CW = canvas.width, CH = canvas.height;
    cx.globalCompositeOperation = 'source-over';
    cx.clearRect(0, 0, CW, CH); cx.fillStyle = '#05080a'; cx.fillRect(0, 0, CW, CH);
    const w = r.w, h = r.h; if (!w || !h) { cx.fillStyle = '#5a6b72'; cx.font = '12px monospace'; cx.textAlign = 'center'; cx.fillText('no room dimensions', CW / 2, CH / 2); return; }
    const pad = 6, scale = Math.min((CW - 2 * pad) / w, (CH - 2 * pad) / h), ox = (CW - w * scale) / 2, oy = (CH - h * scale) / 2;
    const X = x => ox + x * scale, Y = y => oy + (h - y) * scale;
    // faint tiles
    const tiles = r.tiles;
    if (tiles && tiles.length) { cx.fillStyle = 'rgba(90,110,130,0.16)'; for (let rr = 0; rr < tiles.length; rr++) { const row = '' + (tiles[rr] || ''); for (let c = 0; c < row.length; c++) if (row[c] !== ' ' && row[c] !== '') cx.fillRect(ox + c * scale, oy + rr * scale, scale + 0.5, scale + 0.5); } }
    cx.strokeStyle = 'rgba(120,150,160,0.35)'; cx.lineWidth = 1; cx.strokeRect(ox, oy, w * scale, h * scale);
    // shafts (additive)
    cx.globalCompositeOperation = 'lighter';
    r.rays.forEach(ry => {
      const [rr, gg, bb] = hexRgb('#bfe0ff'); const a = Math.min(0.5, ry.opacity * 2.5);
      cx.save(); cx.translate(X(ry.x), Y(ry.y)); cx.rotate(-(ry.rot || 0));
      const g = cx.createLinearGradient(0, -ry.h * scale / 2, 0, ry.h * scale / 2);
      g.addColorStop(0, 'rgba(' + rr + ',' + gg + ',' + bb + ',' + a + ')'); g.addColorStop(1, 'rgba(' + rr + ',' + gg + ',' + bb + ',0)');
      cx.fillStyle = g; cx.fillRect(-ry.w * scale / 2, -ry.h * scale / 2, ry.w * scale, ry.h * scale); cx.restore();
    });
    // light pools (additive radial falloff)
    r.lights.forEach(l => {
      const [rr, gg, bb] = hexRgb(l.color), rad = Math.max(2, l.scale * 1.3 * scale), inten = Math.min(0.95, 0.18 + l.opacity * 0.6);
      const g = cx.createRadialGradient(X(l.x), Y(l.y), 0, X(l.x), Y(l.y), rad);
      g.addColorStop(0, 'rgba(' + rr + ',' + gg + ',' + bb + ',' + inten + ')'); g.addColorStop(1, 'rgba(' + rr + ',' + gg + ',' + bb + ',0)');
      cx.fillStyle = g; cx.beginPath(); cx.arc(X(l.x), Y(l.y), rad, 0, 7); cx.fill();
    });
    cx.globalCompositeOperation = 'source-over';
  }

  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column;height:100%';
    const st = stats(), issues = lint();
    const issByLevel = {}; issues.forEach(it => { (issByLevel[it.level] = issByLevel[it.level] || []).push(it); });

    const bar = el('div', { class: 'tc-mut', style: 'padding:8px 12px;border-bottom:1px solid var(--line);display:flex;gap:14px;flex-wrap:wrap' }, bodyEl);
    const stat = (lab, val, warn) => { const s = el('span', {}, bar); el('b', { style: 'color:' + (warn && val ? '#ffcf4a' : 'var(--txt)') }, s, '' + val); s.appendChild(document.createTextNode(' ' + lab)); };
    stat('levels lit', st.lit + '/' + st.levels); stat('lights', st.lights); stat('shafts', st.rays); stat('issues', st.issues, true);

    const tb = el('div', { style: 'display:flex;align-items:center;gap:6px;padding:8px 12px;border-bottom:1px solid var(--line);flex-wrap:wrap' }, bodyEl);
    [['all', 'All'], ['lit', 'With lights'], ['issues', 'With issues']].forEach(([id, label]) => { const b = el('button', { class: 'tbtn' + (view.filter === id ? ' on' : '') }, tb, label); b.addEventListener('click', () => { view.filter = id; render(); }); });
    el('div', { style: 'flex:1' }, tb);
    const q = el('input', { type: 'text', placeholder: 'Search…', value: view.q, style: 'flex:0 0 150px' }, tb); q.addEventListener('input', () => { view.q = q.value; render(); });

    const grid = el('div', { style: 'flex:1;display:grid;grid-template-columns:1fr 360px;gap:0;min-height:0' }, bodyEl);
    const left = el('div', { style: 'overflow:auto;min-height:0' }, grid);
    const txt = view.q.trim().toLowerCase();
    const ids = Object.keys(levels()).filter(id => {
      const r = levelReport(id);
      if (view.filter === 'lit' && !(r.lights.length || r.rays.length)) return false;
      if (view.filter === 'issues' && !(issByLevel[id] || []).length) return false;
      if (txt && (r.title + ' ' + id).toLowerCase().indexOf(txt) < 0) return false;
      return true;
    });
    if (!ids.length) el('div', { class: 'tc-mut', style: 'padding:18px' }, left, 'No levels match.');
    ids.forEach(id => {
      const r = levelReport(id), iss = issByLevel[id] || [];
      const row = el('div', { class: 'tc-row' + (view.sel === id ? ' sel' : ''), style: 'padding:6px 12px;border-bottom:1px solid var(--line);cursor:pointer;align-items:center;gap:8px' }, left);
      el('span', { style: 'flex:1;font-size:13px;color:var(--txt)' }, row, r.title);
      el('span', { class: 'tc-mut', style: 'font-size:11px' }, row, r.lights.length + '☀ · ' + r.rays.length + '🌤');
      if (iss.length) el('span', { class: 'tc-pill', style: 'background:#ffcf4a;color:#1a1408;font-size:10px' }, row, '⚠' + iss.length);
      row.addEventListener('click', () => { view.sel = (view.sel === id ? null : id); render(); });
    });

    const right = el('div', { style: 'overflow:auto;padding:12px 14px;border-left:1px solid var(--line);min-height:0' }, grid);
    if (!view.sel) {
      el('div', { class: 'tc-mut', style: 'font-size:12px;line-height:1.5' }, right, 'Select a level to see its light-map and tune its lights and shafts. Global light strength lives in the in-game Settings; per-biome ambient is set in the Biome editor.');
      el('h4', { style: 'margin:12px 0 4px;font-size:12px;color:var(--txt2)' }, right, 'Issues · ' + issues.length);
      if (!issues.length) el('div', { class: 'tc-pill done', style: 'display:inline-block' }, right, 'No lighting problems found.');
      issues.forEach(it => { const row = el('div', { class: 'tc-row', style: 'margin:2px 0;align-items:center' }, right); el('span', { style: 'color:' + (it.sev === 'warn' ? '#ffcf4a' : 'var(--txt2)') + ';margin-right:6px' }, row, it.sev === 'warn' ? '⚠' : 'ℹ'); el('span', { style: 'flex:1;font-size:12px' }, row, (levels()[it.level] ? (levels()[it.level].title || it.level) + ': ' : '') + it.msg); const b = el('button', { class: 'tbtn', style: 'padding:1px 6px' }, row, '↗'); b.addEventListener('click', () => jump(it.level, it.idx)); });
      return;
    }
    const r = levelReport(view.sel);
    el('h3', { style: 'margin:0 0 8px;font-size:13px' }, right, r.title);
    const cv = el('canvas', { width: 400, height: 230, style: 'width:100%;border:1px solid var(--line);border-radius:4px;background:#05080a' }, right);
    drawLightmap(cv, r);
    const refresh = () => drawLightmap(cv, levelReport(view.sel));

    if (r.lights.length) {
      el('div', { class: 'tc-mut', style: 'font-size:11px;margin:10px 0 3px' }, right, 'LIGHTS (' + r.lights.length + ')');
      r.lights.forEach(l => {
        const box = el('div', { style: 'border:1px solid var(--line);border-radius:5px;padding:6px 8px;margin-bottom:6px' }, right);
        const hd = el('div', { style: 'display:flex;align-items:center;gap:6px;margin-bottom:4px' }, box);
        el('span', { style: 'flex:1;font-size:11px;color:var(--txt2)' }, hd, '☀ at ' + Math.round(l.x) + ',' + Math.round(l.y));
        const jb = el('button', { class: 'tbtn', style: 'padding:1px 6px' }, hd, '↗'); jb.addEventListener('click', () => jump(view.sel, l.idx));
        const fields = el('div', { style: 'display:grid;grid-template-columns:auto 1fr auto 1fr;gap:4px 6px;align-items:center;font-size:11px' }, box);
        const col = el('input', { type: 'color', style: 'width:34px;height:22px;padding:0;border:none;background:none' }, null); col.value = l.color.length === 7 ? l.color : '#ffeecc';
        el('label', { style: 'color:var(--txt2)' }, fields, 'Colour'); fields.appendChild(col); col.addEventListener('input', () => { setLight(view.sel, l.idx, 'color', col.value); refresh(); });
        const num = (lab, key, val, min, max, step) => { el('label', { style: 'color:var(--txt2)' }, fields, lab); const i = el('input', { type: 'number', value: val, min: '' + min, max: '' + max, step: '' + step, style: 'width:100%' }, fields); i.addEventListener('change', () => { setLight(view.sel, l.idx, key, i.value); refresh(); }); };
        num('Radius', 'scale', l.scale, 1, 60, 0.5);
        num('Bright', 'opacity', l.opacity, 0, 2, 0.05);
        const fl = el('label', { style: 'color:var(--txt2);display:flex;align-items:center;gap:4px' }, fields, ''); const fcb = el('input', { type: 'checkbox' }, fl); fcb.checked = l.flicker; fl.appendChild(document.createTextNode('Flicker')); fcb.addEventListener('change', () => { setLight(view.sel, l.idx, 'flicker', fcb.checked); });
      });
    }
    if (r.rays.length) {
      el('div', { class: 'tc-mut', style: 'font-size:11px;margin:10px 0 3px' }, right, 'LIGHT SHAFTS (' + r.rays.length + ')');
      r.rays.forEach(ry => {
        const box = el('div', { style: 'border:1px solid var(--line);border-radius:5px;padding:6px 8px;margin-bottom:6px' }, right);
        const hd = el('div', { style: 'display:flex;align-items:center;gap:6px;margin-bottom:4px' }, box);
        el('span', { style: 'flex:1;font-size:11px;color:var(--txt2)' }, hd, '🌤 at ' + Math.round(ry.x) + ',' + Math.round(ry.y));
        const jb = el('button', { class: 'tbtn', style: 'padding:1px 6px' }, hd, '↗'); jb.addEventListener('click', () => jump(view.sel, ry.idx));
        const fields = el('div', { style: 'display:grid;grid-template-columns:auto 1fr auto 1fr;gap:4px 6px;align-items:center;font-size:11px' }, box);
        const num = (lab, key, val, min, max, step) => { el('label', { style: 'color:var(--txt2)' }, fields, lab); const i = el('input', { type: 'number', value: val, min: '' + min, max: '' + max, step: '' + step, style: 'width:100%' }, fields); i.addEventListener('change', () => { setRay(view.sel, ry.idx, key, i.value); refresh(); }); };
        num('Width', 'w', ry.w, 1, 40, 0.5); num('Height', 'h', ry.h, 1, 60, 0.5);
        num('Opacity', 'opacity', ry.opacity, 0, 1, 0.02); num('Angle', 'rot', ry.rot, -3.2, 3.2, 0.05);
      });
    }
    if (!r.lights.length && !r.rays.length) el('div', { class: 'tc-mut', style: 'margin-top:8px' }, right, 'No lights or shafts placed here — this room is lit only by the biome ambient. Place a “light” or “ray” object in the world editor.');
  }

  T.registerTool({
    id: 'lighting', label: 'Lighting', icon: '🔦', group: 'World',
    sub: 'lights & shafts catalog · live light-map · tune colour / radius / brightness',
    build(host, a) { api = a; bodyEl = host; render(); }
  });
  if (T.roadmapDone) T.roadmapDone(28);
})();
