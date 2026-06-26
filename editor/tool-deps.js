// MOSSVEIL — tool-deps.js : Dependency view + safe-delete (Edit ▸ Project).
// "What uses this?" — scans every level for references to a dataset item (enemy type, boss, charm,
// biome, music track) so you know what's in use and what is safe to remove. Read-only analysis on
// G.LEVELS; precise extractors so an "unused" verdict is reliable. Editor-only, fully offline.
(function () {
  const T = G.Tools;
  if (!T) return;
  const levels = () => G.LEVELS || {};
  // scan all levels; pred(levelDef, id) -> boolean (references the item)
  function scan(pred) { const out = []; const L = levels(); for (const id in L) { try { if (pred(L[id], id)) out.push(id); } catch (_) { } } return out; }
  const props = d => d.props || [];

  function CATS() {
    return [
      ['Enemies', () => (G.Enemies ? G.Enemies.TYPES : []).map(t => ({ id: t.id, label: t.label })),
        id => scan(d => (d.enemies || []).some(e => e.type === id) || props(d).some(p => p.type === 'enemy' && p.kind === id))],
      ['Bosses', () => (G.Bosses ? G.Bosses.LIST : []).map(b => ({ id: b.id, label: b.label })),
        id => scan(d => props(d).some(p => p.type === 'bossTrigger' && (p.boss || 'mossSovereign') === id))],
      ['Charms', () => (G.Charms ? G.Charms.LIST : []).map(c => ({ id: c.id, label: c.name })),
        id => scan(d => props(d).some(p => p.type === 'charmPickup' && (p.charm === id || (p.charm == null && G.Charms.LIST[0] && G.Charms.LIST[0].id === id))) || props(d).some(p => p.type === 'powerup' && p.grant === id))],
      ['Biomes', () => (G.World ? G.World.BIOMES : []).map(b => ({ id: b, label: (G.World.PAL[b] && G.World.PAL[b].label) || b })),
        id => scan(d => d.biome === id || props(d).some(p => p.biome === id) || (d.transitions || []).some(t => t.biome === id))],
      ['Music', () => (G.Music ? G.Music.TRACK_IDS : []).map(t => ({ id: t, label: t })),
        id => scan(d => d.music === id)]
    ];
  }

  let bodyEl = null, api = null, catI = 0, sel = null;
  const MT = T.deps = {
    cats: CATS,
    refs(catLabel, id) { const c = CATS().find(x => x[0] === catLabel); return c ? c[2](id) : []; },
    items(catLabel) { const c = CATS().find(x => x[0] === catLabel); return c ? c[1]() : []; },
    openInTool() { return T.openTool('deps'); }
  };

  function el(t, a, p, x) { return api.el(t, a, p, x); }
  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column';
    const cats = CATS();
    const head = el('div', { style: 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line);flex-wrap:wrap' }, bodyEl);
    el('span', { class: 'tc-mut' }, head, 'What uses…');
    cats.forEach(([label], i) => el('button', { class: 'tbtn' + (i === catI ? ' on' : ''), onclick: () => { catI = i; sel = null; render(); } }, head, label));
    el('div', { style: 'flex:1' }, head);
    const grid = el('div', { style: 'flex:1;display:grid;grid-template-columns:230px 1fr;gap:0;min-height:0' }, bodyEl);
    const left = el('div', { style: 'overflow:auto;border-right:1px solid var(--line);padding:8px;min-height:0' }, grid);
    const [label, itemsFn, refsFn] = cats[catI];
    const items = itemsFn();
    let unused = 0;
    items.forEach(it => {
      const refs = refsFn(it.id), n = refs.length; if (!n) unused++;
      const row = el('div', { class: 'tc-pal-item' + (it.id === sel ? ' sel' : ''), style: 'padding:5px 8px' }, left);
      el('span', {}, row, it.label);
      el('span', { class: 'tc-pill ' + (n ? 'done' : 'skip'), style: 'margin-left:auto' }, row, n ? (n + ' used') : 'unused');
      row.addEventListener('click', () => { sel = it.id; render(); });
    });
    const right = el('div', { style: 'overflow:auto;padding:14px 16px;min-height:0' }, grid);
    el('div', { class: 'tc-mut', style: 'margin-bottom:8px' }, right, label + ': ' + items.length + ' items · ' + unused + ' unused (safe to remove). Click one to see which levels use it.');
    if (sel) {
      const refs = refsFn(sel);
      el('h3', { style: 'margin:0 0 6px' }, right, (items.find(i => i.id === sel) || {}).label || sel);
      if (!refs.length) { el('div', { class: 'tc-pill skip', style: 'display:inline-block' }, right, 'Not referenced by any level — safe to delete.'); }
      else {
        el('div', { class: 'tc-mut', style: 'margin-bottom:4px' }, right, 'Used in ' + refs.length + ' level' + (refs.length === 1 ? '' : 's') + ':');
        refs.forEach(lid => {
          const row = el('div', { class: 'tc-row', style: 'margin:2px 0' }, right);
          el('span', { style: 'flex:1' }, row, lid);
          if (G.__ed && G.__ed.openLevel) el('button', { class: 'tbtn', onclick: () => { G.__ed.openLevel(lid); api.toast('Opened ' + lid); } }, row, 'Open level');
        });
      }
    } else el('div', { class: 'tc-mut' }, right, 'Select an item on the left.');
  }

  T.registerTool({
    id: 'deps', label: 'Dependency view', icon: '🔍', group: 'Project',
    sub: 'what uses this? safe-delete check',
    build(host, a) { api = a; bodyEl = host; render(); }
  });
  if (T.roadmapDone) T.roadmapDone(96);
})();
