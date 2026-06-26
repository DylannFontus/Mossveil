// MOSSVEIL — tool-prefabs.js : Prefab system 2.0 (Edit ▸ Content).  Roadmap #35.
// The asset browser places prefabs and nests them (⊕); this is the library MANAGER. Browse every
// saved prefab with a contents breakdown, rename (rewriting nested references), duplicate, delete
// (safely stripping nested references first), compose nests, and export / import the whole library
// as JSON for backup or sharing. Prefabs live in localStorage (mossveil-ed-prefabs) as
// { name -> { items:[{kind,data,x,y}], ox, oy } }; nested prefabs reference others by name.
// Editor-only, fully offline. Persists through the editor's prefab store so the asset browser stays
// in sync.
(function () {
  const T = G.Tools;
  if (!T) return;
  const ED = () => G.__ed || {};
  const store = () => (ED().prefabsAPI || null);
  const clone = o => JSON.parse(JSON.stringify(o));

  function P() { const s = store(); return (s && s.get()) || {}; }
  function persist() { const s = store(); if (s) s.persist(); }

  function names() { return Object.keys(P()); }
  function summarize(name) {
    const pf = P()[name]; if (!pf) return null;
    const c = { prop: 0, enemy: 0, zone: 0, prefab: 0 }; const xs = [], ys = [];
    for (const it of (pf.items || [])) { c[it.kind] = (c[it.kind] || 0) + 1; xs.push(it.x || 0); ys.push(it.y || 0); }
    const nested = (pf.items || []).filter(i => i.kind === 'prefab').map(i => i.data && i.data.prefab).filter(Boolean);
    const w = xs.length ? Math.max(...xs) - Math.min(...xs) : 0, h = ys.length ? Math.max(...ys) - Math.min(...ys) : 0;
    return { counts: c, nested, items: (pf.items || []).length, w: +w.toFixed(1), h: +h.toFixed(1) };
  }
  // which prefabs embed `name` as a nested child
  function usedBy(name) { const out = []; const all = P(); for (const k in all) if ((all[k].items || []).some(it => it.kind === 'prefab' && it.data && it.data.prefab === name)) out.push(k); return out; }

  function rename(oldN, newN) {
    newN = (newN || '').trim(); const all = P();
    if (!all[oldN] || !newN || (all[newN] && newN !== oldN)) return false;
    if (newN === oldN) return true;
    all[newN] = all[oldN]; delete all[oldN];
    for (const k in all) for (const it of (all[k].items || [])) if (it.kind === 'prefab' && it.data && it.data.prefab === oldN) it.data.prefab = newN;
    persist(); return true;
  }
  function uniqueName(base) { const all = P(); let n = base, i = 2; while (all[n]) n = base + ' ' + (i++); return n; }
  function duplicate(name) { const all = P(); if (!all[name]) return null; const nn = uniqueName(name + ' copy'); all[nn] = clone(all[name]); persist(); return nn; }
  function remove(name) {
    const all = P(); if (!all[name]) return { removed: false, strippedFrom: [] };
    const users = usedBy(name);
    for (const k of users) all[k].items = (all[k].items || []).filter(it => !(it.kind === 'prefab' && it.data && it.data.prefab === name));
    delete all[name]; persist(); return { removed: true, strippedFrom: users };
  }
  // detect whether nesting `child` inside `parent` would create a cycle
  function wouldCycle(parent, child) {
    if (parent === child) return true; const all = P(); const seen = {}; const stack = [child];
    while (stack.length) { const cur = stack.pop(); if (cur === parent) return true; if (seen[cur]) continue; seen[cur] = 1; const pf = all[cur]; if (pf) for (const it of (pf.items || [])) if (it.kind === 'prefab' && it.data && it.data.prefab) stack.push(it.data.prefab); }
    return false;
  }
  function nest(parent, child, dx, dy) {
    const all = P(); if (!all[parent] || !all[child] || wouldCycle(parent, child)) return false;
    if (ED().nestPrefab) return ED().nestPrefab(parent, child, dx || 0, dy || 0);
    all[parent].items.push({ kind: 'prefab', data: { prefab: child }, x: (all[parent].ox || 0) + (dx || 0), y: (all[parent].oy || 0) + (dy || 0) });
    persist(); return true;
  }
  function exportJSON() { return JSON.stringify(P(), null, 2); }
  function importJSON(str, replace) {
    let obj; try { obj = JSON.parse(str); } catch (_) { return { ok: false, error: 'not valid JSON' }; }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, error: 'expected an object of prefabs' };
    const all = P(); let n = 0;
    if (replace) for (const k of Object.keys(all)) delete all[k];
    for (const k in obj) { const v = obj[k]; if (v && Array.isArray(v.items)) { all[k] = clone(v); n++; } }
    persist(); return { ok: true, count: n };
  }

  // =================== test / external API ===================
  T.prefabs = { list: names, summary: summarize, usedBy, rename, duplicate, remove, nest, wouldCycle, exportJSON, importJSON, openInTool: () => T.openTool('prefabs') };

  // =================== UI ===================
  let bodyEl = null, api = null, selName = null, mode = null;  // mode: 'export' | 'import' | null
  function el(t, a, p, x) { return api.el(t, a, p, x); }
  const KIND_ICO = { prop: '▦', enemy: '☠', zone: '⛬', prefab: '⊕' };

  function render() {
    bodyEl.innerHTML = ''; bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column';
    const list = names();
    if (selName && !P()[selName]) selName = null;

    // ---- header ----
    const head = el('div', { style: 'display:flex;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid var(--line);flex-wrap:wrap' }, bodyEl);
    el('span', { class: 'tc-mut' }, head, list.length + ' prefab' + (list.length === 1 ? '' : 's'));
    el('div', { style: 'flex:1' }, head);
    el('button', { class: 'tbtn' + (mode === 'export' ? ' on' : ''), onclick: () => { mode = mode === 'export' ? null : 'export'; render(); } }, head, '⤓ Export all');
    el('button', { class: 'tbtn' + (mode === 'import' ? ' on' : ''), onclick: () => { mode = mode === 'import' ? null : 'import'; render(); } }, head, '⤒ Import');

    if (mode === 'export') {
      const box = el('div', { style: 'padding:10px 12px;border-bottom:1px solid var(--line)' }, bodyEl);
      el('div', { class: 'tc-mut', style: 'margin-bottom:4px' }, box, 'The whole prefab library as JSON — copy it somewhere safe, or paste it into another project\'s Import.');
      const ta = el('textarea', { style: 'width:100%;height:120px;font-family:monospace;font-size:11px' }, box); ta.value = exportJSON(); ta.readOnly = true;
      ta.addEventListener('focus', () => ta.select());
    }
    if (mode === 'import') {
      const box = el('div', { style: 'padding:10px 12px;border-bottom:1px solid var(--line)' }, bodyEl);
      el('div', { class: 'tc-mut', style: 'margin-bottom:4px' }, box, 'Paste a prefab library JSON. Merge keeps your existing prefabs (same names overwrite); Replace wipes them first.');
      const ta = el('textarea', { placeholder: '{ "myPrefab": { "items": [...], "ox":0, "oy":0 } }', style: 'width:100%;height:100px;font-family:monospace;font-size:11px' }, box);
      const row = el('div', { class: 'tc-row' }, box);
      const doImport = replace => { const r = importJSON(ta.value, replace); if (!r.ok) api.toast('Import failed: ' + r.error); else { api.toast('Imported ' + r.count + ' prefab' + (r.count === 1 ? '' : 's')); mode = null; render(); } };
      el('button', { class: 'tbtn play', onclick: () => doImport(false) }, row, 'Merge');
      el('button', { class: 'tbtn', onclick: () => { if (confirm('Replace the entire prefab library with the pasted JSON?')) doImport(true); } }, row, 'Replace all');
    }

    if (!list.length) { el('div', { class: 'tc-mut', style: 'padding:18px' }, bodyEl, 'No prefabs yet. In the Scene tab, select objects (marquee-drag or Shift-click) and press Ctrl+G to save a prefab — it will show up here.'); return; }

    // ---- two-pane: library | detail ----
    const grid = el('div', { style: 'flex:1;display:grid;grid-template-columns:260px 1fr;min-height:0' }, bodyEl);
    const left = el('div', { style: 'overflow:auto;border-right:1px solid var(--line);padding:8px;min-height:0' }, grid);
    list.sort().forEach(name => {
      const sm = summarize(name), users = usedBy(name);
      const row = el('div', { class: 'tc-pal-item' + (name === selName ? ' sel' : ''), style: 'padding:6px 8px;display:block' }, left);
      el('div', {}, row, name);
      const meta = el('div', { class: 'tc-mut', style: 'font-size:10px;display:flex;gap:8px;margin-top:2px' }, row);
      ['prop', 'enemy', 'zone', 'prefab'].forEach(k => { if (sm.counts[k]) el('span', {}, meta, KIND_ICO[k] + sm.counts[k]); });
      if (users.length) el('span', { style: 'color:#7fb6e8' }, meta, '↳' + users.length);
      row.addEventListener('click', () => { selName = name; render(); });
    });

    const right = el('div', { style: 'overflow:auto;padding:14px 16px;min-height:0' }, grid);
    if (!selName) { el('div', { class: 'tc-mut' }, right, 'Select a prefab on the left to inspect, rename, duplicate, delete, nest, or copy its JSON.'); return; }
    const sm = summarize(selName), users = usedBy(selName);

    const nameRow = el('div', { class: 'tc-row' }, right);
    el('label', { style: 'width:60px' }, nameRow, 'Name');
    const nm = el('input', { type: 'text', value: selName, style: 'flex:1' }, nameRow);
    el('button', { class: 'tbtn', onclick: () => { const nn = nm.value.trim(); if (nn && nn !== selName) { if (rename(selName, nn)) { selName = nn; api.toast('Renamed'); render(); } else api.toast('That name is taken or invalid'); } } }, nameRow, 'Rename');

    el('div', { class: 'tc-mut', style: 'margin:8px 0' }, right, `${sm.items} object${sm.items === 1 ? '' : 's'} · ${sm.counts.prop} prop, ${sm.counts.enemy} enemy, ${sm.counts.zone} zone, ${sm.counts.prefab} nested · spans ${sm.w}×${sm.h} tiles.`);
    if (sm.nested.length) el('div', { class: 'tc-mut', style: 'margin-bottom:8px' }, right, 'Nests: ' + sm.nested.join(', '));
    if (users.length) el('div', { class: 'tc-mut', style: 'margin-bottom:8px;color:#7fb6e8' }, right, 'Embedded inside: ' + users.join(', '));

    const acts = el('div', { class: 'tc-row', style: 'flex-wrap:wrap' }, right);
    el('button', { class: 'tbtn', onclick: () => { const nn = duplicate(selName); if (nn) { selName = nn; api.toast('Duplicated → ' + nn); render(); } } }, acts, '⧉ Duplicate');
    el('button', { class: 'tbtn', onclick: () => {
      const u = usedBy(selName);
      const msg = u.length ? `Delete "${selName}"? It is nested inside ${u.length} other prefab${u.length === 1 ? '' : 's'} (${u.join(', ')}) — those references will be removed too.` : `Delete prefab "${selName}"?`;
      if (confirm(msg)) { const r = remove(selName); selName = null; api.toast(r.strippedFrom.length ? ('Deleted; cleaned ' + r.strippedFrom.length + ' nest reference' + (r.strippedFrom.length === 1 ? '' : 's')) : 'Deleted'); render(); }
    } }, acts, '🗑 Delete');
    const jsonBtn = el('button', { class: 'tbtn', onclick: () => { const ta = el('textarea', { style: 'width:100%;height:120px;margin-top:8px;font-family:monospace;font-size:11px' }, right); ta.value = JSON.stringify(P()[selName], null, 2); ta.readOnly = true; ta.focus(); ta.select(); jsonBtn.disabled = true; } }, acts, '{ } Copy JSON');

    // ---- nest composer ----
    el('h4', { style: 'margin:16px 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:var(--txt2)' }, right, 'Nest another prefab inside this one');
    const others = names().filter(n => n !== selName && !wouldCycle(selName, n));
    if (!others.length) el('div', { class: 'tc-mut' }, right, 'No other prefab can be nested here (would create a cycle).');
    else {
      const nr = el('div', { class: 'tc-row', style: 'flex-wrap:wrap' }, right);
      const csel = el('select', { style: 'flex:0 0 auto' }, nr); others.forEach(n => el('option', { value: n }, csel, n));
      el('label', { style: 'width:auto' }, nr, 'dx'); const dx = el('input', { type: 'number', value: '0', step: '0.5', style: 'width:64px;flex:0 0 auto' }, nr);
      el('label', { style: 'width:auto' }, nr, 'dy'); const dy = el('input', { type: 'number', value: '0', step: '0.5', style: 'width:64px;flex:0 0 auto' }, nr);
      el('button', { class: 'tbtn', onclick: () => { if (nest(selName, csel.value, +dx.value || 0, +dy.value || 0)) { api.toast('Nested ' + csel.value + ' inside ' + selName); render(); } else api.toast('Could not nest (cycle?)'); } }, nr, '⊕ Add nest');
    }
  }

  T.registerTool({
    id: 'prefabs', label: 'Prefab library 2.0', icon: '🧩', group: 'Content',
    sub: 'browse · rename · nest · export/import',
    build(host, a) { api = a; bodyEl = host; selName = null; mode = null; render(); }
  });
  if (T.roadmapDone) T.roadmapDone(35);
})();
