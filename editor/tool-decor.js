// MOSSVEIL — tool-decor.js : Decor & Foliage browser (Edit ▸ World).  Roadmap #18.
// Decor silhouettes (mushroom / tree / column / stalactite / furniture / gravestones…) live in the
// W.SIL drawer registry, are categorised standing vs hanging in W.DECOR_KINDS, scattered into each
// biome's parallax background via that palette's `deco` list, and placed individually as `decor`
// props. The Biome editor exposes `deco` only as a comma-separated text box — you can't see what a
// kind looks like or where it's used. This tool is that catalog: a LIVE PREVIEW of every decor kind
// (rendered through W.SIL + G.Thumb, the same path the asset browser uses), which biomes scatter it,
// which level props use it, and a lint pass (unknown kind on a prop, unknown decor in a biome, a
// listed kind with no drawer, an unused kind). Read-only except an inline kind <select> on each prop
// usage row that rewrites p.kind + marks dirty. Editor-only, fully offline.
(function () {
  const T = G.Tools;
  if (!T) return;
  const ED = () => G.__ed || {};
  const W = () => G.World || {};
  const levels = () => G.LEVELS || {};
  const SIL = () => W().SIL || {};
  const PAL = () => W().PAL || {};

  // ---- catalog: every placeable decor kind + its anchor + whether a drawer exists ----
  function kinds() {
    const dk = W().DECOR_KINDS || { standing: [], hanging: [] }, sil = SIL(), seen = {}, list = [];
    (dk.standing || []).forEach(n => { if (!seen[n]) { seen[n] = 1; list.push({ name: n, anchor: 'standing', valid: !!sil[n] }); } });
    (dk.hanging || []).forEach(n => { if (!seen[n]) { seen[n] = 1; list.push({ name: n, anchor: 'hanging', valid: !!sil[n] }); } });
    return list;
  }
  function biomesFor(name) { const P = PAL(); return Object.keys(P).filter(b => (P[b].deco || []).indexOf(name) >= 0); }

  // ---- every decor prop across all levels (resolved kind = how it actually renders) ----
  function decorProps() {
    const out = [], L = levels(), sil = SIL();
    for (const id in L) (L[id].props || []).forEach((p, i) => {
      if (p && p.type === 'decor') out.push({ level: id, title: L[id].title || id, idx: i, raw: p.kind, kind: sil[p.kind] ? p.kind : 'mushroom', x: p.x, y: p.y, z: p.z });
    });
    return out;
  }
  function propsFor(name) { return decorProps().filter(d => d.kind === name); }

  function lint() {
    const out = [], sil = SIL(), P = PAL(), props = decorProps();
    for (const d of props) if (d.raw && !sil[d.raw]) out.push({ kind: 'unknown-prop-kind', sev: 'warn', level: d.level, idx: d.idx, msg: 'decor prop has unknown kind "' + d.raw + '" (renders as mushroom)' });
    for (const b in P) for (const n of (P[b].deco || [])) if (!sil[n]) out.push({ kind: 'unknown-biome-deco', sev: 'warn', level: '', idx: -1, msg: 'biome "' + b + '" scatters unknown decor "' + n + '"' });
    const usedByProp = {}; props.forEach(d => usedByProp[d.kind] = 1);
    kinds().forEach(k => {
      if (!k.valid) out.push({ kind: 'no-drawer', sev: 'error', level: '', idx: -1, msg: 'decor "' + k.name + '" is listed but has no drawer (SIL)' });
      else if (!biomesFor(k.name).length && !usedByProp[k.name]) out.push({ kind: 'unused-decor', sev: 'info', level: '', idx: -1, msg: 'decor "' + k.name + '" is used by no biome and no prop' });
    });
    return out;
  }

  // ---- the one write path: change a decor prop's kind + mark dirty ----
  function setKind(level, idx, kind) {
    const L = levels(), p = L[level] && (L[level].props || [])[idx];
    if (!p || p.type !== 'decor') return false;
    p.kind = kind; if (ED().markDirty) ED().markDirty(); return true;
  }

  // ---- live preview: build the kind through W.SIL and snapshot it (best-effort, never throws) ----
  function preview(kind, size) {
    try {
      const sil = SIL()[kind]; if (!sil || !G.Thumb || !window.THREE) return null;
      const grp = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color: 0xcfe0d8, side: THREE.DoubleSide });
      const rng = (G.U && G.U.mulberry32) ? G.U.mulberry32(20260626) : Math.random;
      sil(grp, mat, 0, 0, 1, rng);
      return G.Thumb.snapshot(grp, { size: size || 74, zoom: 1.4, az: 0, el: 0.04 });
    } catch (e) { return null; }
  }

  // =================== test / external API ===================
  T.decor = { kinds, biomesFor, decorProps, propsFor, lint, setKind, preview, openInTool: () => T.openTool('decor') };

  // =================== UI ===================
  let bodyEl = null, api = null;
  const view = { filter: 'all', q: '', sel: null };
  const FILTERS = [['all', 'All'], ['standing', 'Standing'], ['hanging', 'Hanging'], ['unused', 'Unused'], ['issues', 'Issues']];
  function el(t, a, p, x) { return api.el(t, a, p, x); }

  function jump(level, idx) {
    if (!levels()[level] || idx < 0) return;
    if (ED().selectProp) { ED().selectProp(level, idx); T.closeTool(); api.toast('Selected decor in ' + ((levels()[level] || {}).title || level)); }
    else if (ED().openLevel) { ED().openLevel(level); T.closeTool(); }
  }

  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column';
    const all = kinds(), props = decorProps(), issues = lint();
    const usedKinds = {}; props.forEach(d => usedKinds[d.kind] = (usedKinds[d.kind] || 0) + 1);
    const issueKinds = {}; issues.forEach(it => { const m = /decor "([^"]+)"/.exec(it.msg); if (m) issueKinds[m[1]] = 1; });
    const used = name => biomesFor(name).length > 0 || usedKinds[name] > 0;

    // ---- stats bar ----
    const bar = el('div', { class: 'tc-mut', style: 'padding:8px 12px;border-bottom:1px solid var(--line);display:flex;gap:14px;flex-wrap:wrap' }, bodyEl);
    const stat = (lab, val, warn) => { const w = el('span', {}, bar); el('b', { style: 'color:' + (warn && val ? '#ffcf4a' : 'var(--txt)') }, w, '' + val); w.appendChild(document.createTextNode(' ' + lab)); };
    stat('kinds', all.length);
    stat('standing', all.filter(k => k.anchor === 'standing').length);
    stat('hanging', all.filter(k => k.anchor === 'hanging').length);
    stat('used', all.filter(k => used(k.name)).length + '/' + all.length);
    stat('decor props', props.length);
    stat('issues', issues.length, true);

    // ---- toolbar ----
    const tb = el('div', { style: 'display:flex;align-items:center;gap:6px;padding:8px 12px;border-bottom:1px solid var(--line);flex-wrap:wrap' }, bodyEl);
    FILTERS.forEach(([id, label]) => { const b = el('button', { class: 'tbtn' + (view.filter === id ? ' on' : '') }, tb, label); b.addEventListener('click', () => { view.filter = id; render(); }); });
    el('div', { style: 'flex:1' }, tb);
    const q = el('input', { type: 'text', placeholder: 'Search…', value: view.q, style: 'flex:0 0 160px' }, tb);
    q.addEventListener('input', () => { view.q = q.value; render(); });

    // ---- 2-pane: catalog grid (left) + detail (right) ----
    const grid = el('div', { style: 'flex:1;display:grid;grid-template-columns:1fr 300px;gap:0;min-height:0' }, bodyEl);
    const left = el('div', { style: 'overflow:auto;padding:10px;min-height:0;display:flex;flex-wrap:wrap;gap:8px;align-content:flex-start' }, grid);

    const txt = view.q.trim().toLowerCase();
    const vis = all.filter(k => {
      if (view.filter === 'standing' && k.anchor !== 'standing') return false;
      if (view.filter === 'hanging' && k.anchor !== 'hanging') return false;
      if (view.filter === 'unused' && used(k.name)) return false;
      if (view.filter === 'issues' && !issueKinds[k.name]) return false;
      if (txt && k.name.toLowerCase().indexOf(txt) < 0) return false;
      return true;
    });
    if (!vis.length) el('div', { class: 'tc-mut', style: 'padding:18px' }, left, 'No decor kinds match.');
    vis.forEach(k => {
      const card = el('div', { class: 'tc-pal-item' + (view.sel === k.name ? ' sel' : ''), style: 'flex:0 0 auto;width:96px;flex-direction:column;align-items:center;gap:3px;padding:6px;cursor:pointer' }, left);
      const thumbWrap = el('div', { style: 'width:74px;height:74px;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.22);border-radius:6px;overflow:hidden' }, card);
      const cv = preview(k.name, 74);
      if (cv) { cv.style.cssText = 'width:74px;height:74px'; thumbWrap.appendChild(cv); }
      else el('span', { class: 'tc-mut', style: 'font-size:22px' }, thumbWrap, k.valid ? '🌿' : '⚠');
      el('div', { style: 'font-size:11px;text-align:center;color:var(--txt);max-width:88px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap', title: k.name }, card, k.name);
      const tags = el('div', { style: 'display:flex;gap:3px' }, card);
      el('span', { class: 'tc-pill', style: 'font-size:9px;padding:0 4px', title: 'anchor' }, tags, k.anchor === 'hanging' ? '⤓ hang' : '⤒ stand');
      const n = (usedKinds[k.name] || 0) + biomesFor(k.name).length;
      el('span', { class: 'tc-pill ' + (used(k.name) ? 'done' : 'skip'), style: 'font-size:9px;padding:0 4px', title: 'biome + prop uses' }, tags, n ? '·' + n : '·0');
      card.addEventListener('click', () => { view.sel = (view.sel === k.name ? null : k.name); render(); });
    });

    // ---- detail / lint pane ----
    const right = el('div', { style: 'overflow:auto;padding:12px 14px;border-left:1px solid var(--line);min-height:0' }, grid);
    if (view.sel) {
      const k = all.find(x => x.name === view.sel) || { name: view.sel, anchor: '?', valid: false };
      const big = el('div', { style: 'width:120px;height:120px;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.22);border-radius:8px;margin:0 auto 8px' }, right);
      const cv = preview(k.name, 120);
      if (cv) { cv.style.cssText = 'width:120px;height:120px'; big.appendChild(cv); } else el('span', { style: 'font-size:34px' }, big, k.valid ? '🌿' : '⚠');
      el('h3', { style: 'margin:0 0 2px;text-align:center' }, right, k.name);
      el('div', { class: 'tc-mut', style: 'text-align:center;margin-bottom:10px' }, right, (k.anchor === 'hanging' ? 'Hanging (ceiling)' : 'Standing (ground)') + (k.valid ? '' : ' · NO DRAWER'));

      const bs = biomesFor(k.name);
      el('div', { class: 'tc-mut', style: 'margin-bottom:3px' }, right, 'Biomes scattering it (' + bs.length + ')');
      const bw = el('div', { style: 'display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px' }, right);
      if (!bs.length) el('span', { class: 'tc-mut' }, bw, 'none — edit a biome’s "Decor kinds" in the Biome editor to add it.');
      bs.forEach(b => el('span', { class: 'tc-pill done' }, bw, b));

      const ps = propsFor(k.name);
      el('div', { class: 'tc-mut', style: 'margin-bottom:3px' }, right, 'Placed as a decor prop (' + ps.length + ')');
      if (!ps.length) el('span', { class: 'tc-mut' }, right, 'none');
      ps.forEach(d => {
        const row = el('div', { class: 'tc-row', style: 'margin:2px 0;align-items:center' }, right);
        const a = el('a', { href: '#', style: 'color:var(--acc);text-decoration:none;flex:1' }, row, (d.title || d.level) + '  ' + Math.round(d.x) + ',' + Math.round(d.y) + (d.raw !== d.kind ? '  (was "' + d.raw + '")' : ''));
        a.addEventListener('click', e => { e.preventDefault(); jump(d.level, d.idx); });
        const sel = el('select', { title: 'Change kind', style: 'max-width:110px' }, row);
        all.forEach(o => { const op = el('option', { value: o.name }, sel, o.name); if (o.name === d.kind) op.selected = true; });
        sel.addEventListener('change', () => { setKind(d.level, d.idx, sel.value); render(); });
      });
    } else {
      el('h3', { style: 'margin:0 0 6px;font-size:13px' }, right, 'Issues · ' + issues.length);
      if (!issues.length) el('div', { class: 'tc-pill done', style: 'display:inline-block' }, right, 'No problems found.');
      issues.forEach(it => {
        const row = el('div', { class: 'tc-row', style: 'margin:2px 0;align-items:center' }, right);
        const c = it.sev === 'error' ? '#ff7a6a' : it.sev === 'warn' ? '#ffcf4a' : 'var(--txt2)';
        el('span', { style: 'color:' + c + ';margin-right:6px' }, row, it.sev === 'error' ? '✕' : it.sev === 'warn' ? '⚠' : 'ℹ');
        el('span', { style: 'flex:1' }, row, it.msg);
        if (it.idx >= 0 && levels()[it.level]) el('button', { class: 'tbtn', style: 'padding:1px 6px', onclick: () => jump(it.level, it.idx) }, row, '↗');
      });
      el('div', { class: 'tc-mut', style: 'margin-top:12px;font-size:11px' }, right, 'Select a decor kind to preview it, see which biomes scatter it, and find/retarget its placed props. Per-biome decor lists are edited in the Biome editor.');
    }
  }

  T.registerTool({
    id: 'decor', label: 'Decor & Foliage', icon: '🌿', group: 'World',
    sub: 'silhouette catalog · live preview · biome & prop usage · lint',
    build(host, a) { api = a; bodyEl = host; render(); }
  });
  if (T.roadmapDone) T.roadmapDone(18);
})();
