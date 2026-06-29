// MOSSVEIL — tool-clipboard.js : Cross-room copy & paste (Edit ▸ Tools).  Roadmap #42.
// The editor's object clipboard already survives switching rooms (it's mirrored to localStorage); this
// tool makes that explicit and adds a destination picker. Copy a selection (props / enemies / exits) in
// one room, then paste the whole cluster into ANY other room — at its centre, at coordinates you type,
// or pinned to the exact coordinates it was copied from (handy for relocating a region between rooms).
// It drives the editor's own copy/paste hooks, so pastes are normal undoable edits. Editor-only, offline.
(function () {
  const T = G.Tools;
  if (!T) return;
  const ED = () => G.__ed || {};
  const levels = () => G.LEVELS || {};

  const clip = () => (ED().getClip ? ED().getClip() : null);
  function copyNow() { if (ED().copySelection) ED().copySelection(); return clip(); }
  // paste the current clipboard into a level. keepCoords pins it to its original centroid; else at (x,y).
  function pasteInto(level, x, y, keepCoords) {
    const c = clip(); if (!c || !c.items || !c.items.length) return false;
    if (!levels()[level]) return false;
    if (ED().openLevel) ED().openLevel(level);
    const wx = keepCoords ? c.ox : x, wy = keepCoords ? c.oy : y;
    if (ED().setLastWorld) ED().setLastWorld(wx, wy);
    if (ED().pasteClipboard) ED().pasteClipboard();
    return true;
  }
  function stats() { const c = clip(); if (!c || !c.items) return { items: 0, kinds: {} }; const k = {}; c.items.forEach(it => k[it.kind] = (k[it.kind] || 0) + 1); return { items: c.items.length, kinds: k, ox: c.ox, oy: c.oy }; }

  // =================== test / external API ===================
  T.clipboard = { clip, copyNow, pasteInto, stats, open: () => T.openTool('clipboard') };

  // =================== UI ===================
  let bodyEl = null, api = null;
  const view = { target: null, x: null, y: null, keep: false };
  function el(t, a, p, x) { return api.el(t, a, p, x); }

  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:14px 16px;display:flex;flex-direction:column;gap:14px;height:100%;overflow:auto';
    const s = stats(), cur = ED().currentId ? ED().currentId() : null;

    // clipboard state
    const card = el('div', { style: 'padding:12px;border:1px solid var(--line);border-radius:8px;background:var(--bg2)' }, bodyEl);
    el('div', { style: 'font-size:13px;color:var(--txt);margin-bottom:6px' }, card, '📋 Clipboard');
    if (!s.items) {
      el('div', { class: 'tc-mut' }, card, 'Empty. Select objects in a room (marquee-drag, or Shift-click to add several), then copy.');
    } else {
      const parts = Object.keys(s.kinds).map(k => s.kinds[k] + '× ' + k).join('  ·  ');
      el('div', { style: 'color:var(--txt)' }, card, s.items + ' object' + (s.items === 1 ? '' : 's') + '  —  ' + parts);
      el('div', { class: 'tc-mut', style: 'font-size:11px;margin-top:3px' }, card, 'copied from around ' + Math.round(s.ox) + ', ' + Math.round(s.oy));
    }
    const copyBtn = el('button', { class: 'tbtn', style: 'margin-top:9px;padding:6px 12px' }, card, '⎘ Copy current selection');
    copyBtn.addEventListener('click', () => { const c = copyNow(); api.toast(c && c.items ? 'Copied ' + c.items.length + ' object(s)' : 'Nothing selected to copy'); render(); });

    // paste target
    const ids = Object.keys(levels());
    if (view.target == null) view.target = cur && levels()[cur] ? cur : ids[0] || null;
    const box = el('div', { style: 'padding:12px;border:1px solid var(--line);border-radius:8px;display:flex;flex-direction:column;gap:9px' }, bodyEl);
    el('div', { style: 'font-size:13px;color:var(--txt)' }, box, 'Paste into a room');

    const trow = el('div', { class: 'tc-row' }, box); el('label', {}, trow, 'Destination');
    const tsel = el('select', {}, trow);
    ids.forEach(id => { const o = el('option', { value: id }, tsel, ((levels()[id].title || id)) + '  (' + id + ')'); if (id === view.target) o.selected = true; });
    tsel.addEventListener('change', () => { view.target = tsel.value; });

    const krow = el('div', { class: 'tc-row' }, box);
    const cb = el('input', { type: 'checkbox' }, krow); cb.checked = !!view.keep;
    el('label', { style: 'width:auto' }, krow, 'Keep original coordinates (relocate in place)');
    cb.addEventListener('change', () => { view.keep = cb.checked; xrow.style.opacity = view.keep ? '.4' : '1'; xin.disabled = yin.disabled = view.keep; });

    const xrow = el('div', { class: 'tc-row', style: view.keep ? 'opacity:.4' : '' }, box);
    el('label', {}, xrow, 'At tile X / Y');
    const L = levels()[view.target];
    const xin = el('input', { type: 'number', value: view.x != null ? view.x : (L ? Math.round(L.w / 2) : 10), style: 'max-width:70px', disabled: view.keep }, xrow);
    const yin = el('input', { type: 'number', value: view.y != null ? view.y : (L ? Math.round(L.h / 2) : 8), style: 'max-width:70px', disabled: view.keep }, xrow);
    xin.addEventListener('input', () => view.x = parseFloat(xin.value));
    yin.addEventListener('input', () => view.y = parseFloat(yin.value));

    const pasteBtn = el('button', { class: 'tbtn on', style: 'padding:9px' }, box, '📥 Paste here');
    pasteBtn.disabled = !s.items;
    pasteBtn.style.opacity = s.items ? '1' : '.45';
    pasteBtn.addEventListener('click', () => {
      const L2 = levels()[view.target]; if (!L2) return;
      const x = view.x != null ? view.x : Math.round(L2.w / 2), y = view.y != null ? view.y : Math.round(L2.h / 2);
      if (pasteInto(view.target, x, y, view.keep)) { api.toast('Pasted into ' + (L2.title || view.target)); T.closeTool(); }
    });
    el('div', { class: 'tc-mut', style: 'font-size:11px' }, box, 'Tip: copy with Ctrl+C in the scene, switch rooms, Ctrl+V also works — this panel just adds a destination picker.');
  }

  T.registerTool({
    id: 'clipboard', label: 'Cross-room clipboard', icon: '📋', group: 'Tools',
    sub: 'copy a cluster · paste it into any other room',
    build(host, a) { api = a; bodyEl = host; render(); }
  });
  if (T.roadmapDone) T.roadmapDone(42);
})();
