// MOSSVEIL — tool-versions.js : Version snapshots (Edit ▸ Project).
// Take named snapshots of the whole project (all levels + cutscenes) into this browser, restore any
// of them, and diff one against the current state. Uses the editor's snapshot/loadWorld hooks; no
// engine change. Snapshots are local to this device (separate from Git). Offline, editor-only.
(function () {
  const T = G.Tools;
  if (!T) return;
  const ED = () => G.__ed || {};
  const KEY = 'mossveil-versions';
  const MAX = 10;

  function read() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (_) { return []; } }
  function write(list) { try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch (e) { return false; } }
  function levelCount(snap) { return snap && snap.levels ? Object.keys(snap.levels).length : 0; }
  function objCount(snap) {
    let n = 0; const L = (snap && snap.levels) || {};
    for (const id in L) { const d = L[id]; n += (d.props || []).length + (d.enemies || []).length + (d.transitions || []).length; }
    return n;
  }

  let bodyEl = null, api = null, diffView = null;
  const MT = T.versions = {
    list() { return read(); },
    takeSnapshot(name) {
      if (!ED().snapshot) return false;
      const snap = ED().snapshot();
      const list = read();
      list.unshift({ name: name || ('Snapshot ' + (list.length + 1)), ts: Date.now(), levels: snap.levels, cutscenes: snap.cutscenes, id: snap.id });
      while (list.length > MAX) list.pop();
      const ok = write(list);
      if (!ok && api) api.toast('Too large to store this many snapshots — delete an old one.');
      if (bodyEl) render();
      return ok;
    },
    restore(i) { const v = read()[i]; if (!v || !ED().loadWorld) return false; ED().loadWorld(v.levels, v.cutscenes, v.id); if (api) api.toast('Restored “' + v.name + '” — review and Save.'); return true; },
    remove(i) { const list = read(); list.splice(i, 1); write(list); if (bodyEl) render(); },
    // shallow diff of a snapshot's levels vs the live project
    diff(i) {
      const v = read()[i]; if (!v) return null;
      const a = v.levels || {}, b = G.LEVELS || {};
      const added = [], removed = [], changed = [];
      for (const id in b) if (!a[id]) added.push(id);
      for (const id in a) { if (!b[id]) removed.push(id); else if (JSON.stringify(a[id]) !== JSON.stringify(b[id])) changed.push(id); }
      return { added, removed, changed };
    },
    openInTool() { return T.openTool('versions'); }
  };

  function el(t, a, p, x) { return api.el(t, a, p, x); }
  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = '';
    el('div', { class: 'tc-mut', style: 'margin-bottom:10px' }, bodyEl, 'Local checkpoints of the whole project (every level + cutscene), stored in this browser — handy before a big change. This is separate from saving/committing to Git.');
    const head = el('div', { style: 'display:flex;gap:8px;margin-bottom:12px' }, bodyEl);
    el('button', { class: 'tbtn play', onclick: () => { const n = prompt('Name this snapshot:', 'Snapshot ' + new Date().toLocaleString()); if (n !== null) MT.takeSnapshot(n.trim() || undefined); } }, head, '📸 Take snapshot');
    el('span', { class: 'tc-mut', style: 'align-self:center' }, head, read().length + ' / ' + MAX + ' stored');
    const list = read();
    if (!list.length) { el('div', { class: 'tc-mut' }, bodyEl, 'No snapshots yet. Take one before risky edits, then restore if needed.'); }
    list.forEach((v, i) => {
      const card = el('div', { class: 'tc-card', style: 'margin:8px 0' }, bodyEl);
      const top = el('div', { style: 'display:flex;align-items:center;gap:10px' }, card);
      el('span', { style: 'font-weight:600' }, top, v.name);
      el('span', { class: 'tc-mut' }, top, new Date(v.ts).toLocaleString());
      el('div', { style: 'flex:1' }, top);
      el('span', { class: 'tc-mut' }, top, levelCount(v) + ' levels · ' + objCount(v) + ' objects');
      const btns = el('div', { style: 'display:flex;gap:6px;margin-top:8px' }, card);
      el('button', { class: 'tbtn', onclick: () => { if (confirm('Restore “' + v.name + '”? This replaces the current project in the editor (not yet saved to Git).')) MT.restore(i); } }, btns, '↩ Restore');
      el('button', { class: 'tbtn', onclick: () => showDiff(i) }, btns, '≠ Diff vs current');
      el('button', { class: 'tbtn', onclick: () => { if (confirm('Delete snapshot “' + v.name + '”?')) MT.remove(i); } }, btns, '🗑');
    });
    diffView = el('div', { style: 'margin-top:8px' }, bodyEl);
  }
  function showDiff(i) {
    const d = MT.diff(i); diffView.innerHTML = '';
    if (!d) return;
    const card = el('div', { class: 'tc-card' }, diffView);
    el('div', { style: 'font-weight:600;margin-bottom:4px' }, card, 'Changes since this snapshot');
    const line = (label, arr, cls) => { const r = el('div', { class: 'tc-row', style: 'margin:2px 0' }, card); el('span', { class: 'tc-pill ' + cls, style: 'min-width:64px;text-align:center' }, r, label + ' ' + arr.length); el('span', { class: 'tc-mut' }, r, arr.length ? arr.join(', ') : '—'); };
    line('added', d.added, 'done'); line('changed', d.changed, 'planned'); line('removed', d.removed, 'skip');
    if (!d.added.length && !d.changed.length && !d.removed.length) el('div', { class: 'tc-mut' }, card, 'Identical to the current project.');
  }

  T.registerTool({
    id: 'versions', label: 'Version snapshots', icon: '🕓', group: 'Project',
    sub: 'local project checkpoints + restore + diff',
    build(host, a) { api = a; bodyEl = host; render(); }
  });
  if (T.roadmapDone) T.roadmapDone(46);
})();
