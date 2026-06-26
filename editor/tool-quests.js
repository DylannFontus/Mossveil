// MOSSVEIL — tool-quests.js : the Quest editor (Edit ▸ Narrative).  Roadmap #23.
// Quests used to be emergent — defined inline wherever a dialogue choice started one (c.quest) and
// finished by another choice's completeQuest or by a done-flag. This tool gives them a HOME:
//   • a central registry (data/quests.js -> G.QUESTS_DATA) you author once; quests.js merges a
//     registry entry into any quest as it starts, so dialogue can just reference an id.
//   • a project-wide scan of every NPC dialogue shows, per quest, where it is STARTED, where it is
//     COMPLETED (completeQuest choices or a done-flag some choice sets), and lints the unobtainable
//     ones (no start) and the unfinishable ones (no completion path).
// The registry is a normal dataset (save via the data layer); the scan is read-only over G.LEVELS.
// Fully offline, editor-only.
(function () {
  const T = G.Tools; if (!T) return;
  const clone = o => JSON.parse(JSON.stringify(o));

  function el(tag, attrs, parent, text) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'style') e.style.cssText = attrs[k];
      else if (k.startsWith('on') && typeof attrs[k] === 'function') e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    }
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }

  // ---- scan every NPC dialogue across all levels for quest wiring ----
  function scan() {
    const starts = {}, completes = {}, flags = {}, L = G.LEVELS || {};
    for (const lid in L) {
      const props = (L[lid] && L[lid].props) || [];
      props.forEach((p, pi) => {
        if (!p || p.type !== 'npc' || !p.dialogue) return;
        (p.dialogue.lines || []).forEach((ln, li) => (ln.choices || []).forEach(c => {
          const where = { lid, pi, li, name: p.name || '(unnamed)' };
          if (c.quest && c.quest.id) (starts[c.quest.id] = starts[c.quest.id] || []).push(Object.assign({ inline: c.quest }, where));
          if (c.completeQuest) (completes[c.completeQuest] = completes[c.completeQuest] || []).push(where);
          if (c.flag) (flags[c.flag] = flags[c.flag] || []).push(where);
        }));
      });
    }
    return { starts, completes, flags };
  }

  let reg = {}, usage = { starts: {}, completes: {}, flags: {} }, sel = null, dirty = false, bodyEl = null, api = null;

  function refreshScan() { usage = scan(); }
  function unionIds() {
    const s = new Set(Object.keys(reg));
    Object.keys(usage.starts).forEach(id => s.add(id));
    Object.keys(usage.completes).forEach(id => s.add(id));
    return [...s].sort();
  }
  // canonical def for display: registry entry, else the first inline start, else a bare {id}
  function defOf(id) {
    if (reg[id]) return reg[id];
    const st = usage.starts[id]; if (st && st[0] && st[0].inline) return Object.assign({ id }, st[0].inline);
    return { id, title: id };
  }
  function ensureReg(id) { if (!reg[id]) reg[id] = clone(defOf(id)); return reg[id]; }
  function lint(id) {
    const w = [];
    if (!(usage.starts[id] && usage.starts[id].length)) w.push({ kind: 'bad', msg: 'No dialogue starts this quest — players cannot obtain it.' });
    const d = defOf(id);
    const hasComplete = (usage.completes[id] && usage.completes[id].length);
    const flagSet = d.doneFlag && usage.flags[d.doneFlag] && usage.flags[d.doneFlag].length;
    if (!hasComplete && !flagSet) w.push({ kind: 'warn', msg: 'No completion path — add a “finish quest” choice, or a done-flag that some dialogue choice sets.' });
    if (d.doneFlag && !flagSet && !hasComplete) w.push({ kind: 'info', msg: 'Done-flag “' + d.doneFlag + '” is not set by any dialogue choice (it may be set by a switch/lever instead).' });
    return w;
  }

  // ================= public + test API =================
  const MT = T.quests = {
    get state() { return { reg, sel, dirty }; },
    scan, usage: () => usage,
    quests() { refreshScan(); return unionIds().map(id => ({ id, def: defOf(id), registered: !!reg[id], started: !!(usage.starts[id] || []).length, completed: !!(usage.completes[id] || []).length, lint: lint(id) })); },
    list: () => Object.keys(reg).map(id => clone(reg[id])),
    load() { reg = {}; (G.Quests ? G.Quests.exportCurrent().list : (G.QUESTS_DATA && G.QUESTS_DATA.list) || []).forEach(q => { if (q && q.id) reg[q.id] = clone(q); }); refreshScan(); sel = unionIds()[0] || null; dirty = false; },
    select(id) { sel = id; if (bodyEl) render(); },
    setField(id, key, v) { const d = ensureReg(id); if (v === '' || v == null) delete d[key]; else d[key] = v; dirty = true; if (bodyEl) render(); },
    setTarget(id, room, x, y) { const d = ensureReg(id); if (!room) delete d.target; else d.target = { room, x: +x || 0, y: +y || 0 }; dirty = true; if (bodyEl) render(); },
    rename(id, nid) { nid = (nid || '').trim(); if (!nid || (reg[nid] && nid !== id)) return false; const d = ensureReg(id); delete reg[id]; d.id = nid; reg[nid] = d; sel = nid; dirty = true; if (bodyEl) render(); return true; },
    addQuest(base) { let n = base || 'newQuest', i = 1; while (reg[n] || usage.starts[n]) n = (base || 'newQuest') + (++i); reg[n] = { id: n, title: 'New Quest', objective: '' }; sel = n; dirty = true; if (bodyEl) render(); return n; },
    register(id) { ensureReg(id); dirty = true; if (bodyEl) render(); return true; },
    removeQuest(id) { if (!reg[id]) return false; delete reg[id]; refreshScan(); if (sel === id) sel = unionIds()[0] || null; dirty = true; if (bodyEl) render(); return true; },
    applyToEngine() { if (G.Quests) G.Quests.applyData({ list: MT.list() }); },
    async save() { await api.data.save('quests', 'QUESTS_DATA', { list: MT.list() }); MT.applyToEngine(); dirty = false; if (api) api.toast('Quest registry saved · ' + MT.list().length); if (bodyEl) render(); return true; },
    lint, openInTool() { return T.openTool('quests'); }
  };

  // ================= rendering =================
  function render() {
    bodyEl.innerHTML = ''; bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column';
    refreshScan();
    const head = el('div', { style: 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line)' }, bodyEl);
    el('button', { class: 'tbtn play', onclick: () => MT.save().catch(e => api.toast('Save failed: ' + e.message)) }, head, '💾 Save registry');
    el('button', { class: 'tbtn', onclick: () => MT.addQuest() }, head, '+ New quest');
    el('span', { class: 'tc-mut' }, head, dirty ? '● unsaved' : 'saved ✓');
    el('div', { style: 'flex:1' }, head);
    el('span', { class: 'tc-mut' }, head, MT.list().length + ' registered · ' + unionIds().length + ' total');

    const grid = el('div', { style: 'flex:1;display:grid;grid-template-columns:250px 1fr;gap:0;min-height:0' }, bodyEl);
    const left = el('div', { style: 'overflow:auto;border-right:1px solid var(--line);padding:8px;min-height:0' }, grid);
    const ids = unionIds();
    if (!ids.length) el('div', { class: 'tc-mut', style: 'padding:8px' }, left, 'No quests yet. Add one here, or start one from a dialogue choice (NPC ▸ Graph editor).');
    ids.forEach(id => {
      const d = defOf(id), w = lint(id), bad = w.some(x => x.kind === 'bad'), warn = w.some(x => x.kind === 'warn');
      const row = el('div', { class: 'tc-pal-item' + (id === sel ? ' sel' : ''), style: 'padding:5px 8px;display:flex;align-items:center;gap:6px' }, left);
      el('span', { style: 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, row, '◆ ' + (d.title || id));
      if (!reg[id]) el('span', { class: 'tc-pill planned', title: 'Defined inline in dialogue, not in the registry' }, row, 'inline');
      if (bad) el('span', { title: w.filter(x => x.kind === 'bad').map(x => x.msg).join('\n'), style: 'color:#c45a6a' }, row, '⛔');
      else if (warn) el('span', { title: 'incomplete', style: 'color:#c8a24f' }, row, '⚠');
      row.addEventListener('click', () => MT.select(id));
    });
    renderDetail(el('div', { style: 'overflow:auto;padding:14px 16px;min-height:0' }, grid));
  }

  function field(host, label, val, on, ph) {
    const r = el('div', { class: 'tc-row' }, host); el('label', {}, r, label);
    const inp = el('input', { type: 'text', placeholder: ph || '' }, r); inp.value = val == null ? '' : val;
    inp.addEventListener('change', () => on(inp.value.trim())); return inp;
  }
  function renderDetail(host) {
    if (!sel) { el('div', { class: 'tc-mut' }, host, 'Select a quest, or add one.'); return; }
    const d = defOf(sel), registered = !!reg[sel];
    const hd = el('div', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:4px' }, host);
    el('h3', { style: 'margin:0;font-size:15px;flex:1' }, hd, '◆ ' + (d.title || sel));
    if (!registered) el('button', { class: 'tbtn', title: 'Copy this inline quest into the registry so it is editable in one place', onclick: () => MT.register(sel) }, hd, '+ Register');
    else el('button', { class: 'tbtn dangerBtn', title: 'Remove from registry', onclick: () => MT.removeQuest(sel) }, hd, '🗑');

    field(host, 'Id', d.id || sel, v => { if (!MT.rename(sel, v)) api.toast('Id in use or invalid.'); }, 'quest-id');
    field(host, 'Title', d.title, v => MT.setField(sel, 'title', v), 'shown in the log');
    field(host, 'Objective', d.objective, v => MT.setField(sel, 'objective', v), 'one-line goal');
    field(host, 'Done flag', d.doneFlag, v => MT.setField(sel, 'doneFlag', v), 'auto-completes when this flag is set');
    if (!registered) el('div', { class: 'tc-mut', style: 'font-size:11px;margin:2px 0 8px' }, host, 'This quest is defined inline in dialogue. Editing any field registers it centrally (the registry then wins at runtime).');

    // target marker
    el('h4', { style: 'margin:12px 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:var(--txt2)' }, host, 'Objective marker (optional)');
    const tr = el('div', { class: 'tc-row' }, host); el('label', {}, tr, 'Room');
    const rsel = el('select', {}, tr); el('option', { value: '' }, rsel, '— none —');
    Object.keys(G.LEVELS || {}).forEach(r => { const o = el('option', { value: r }, rsel, r); if (d.target && d.target.room === r) o.selected = true; });
    const tx = el('input', { type: 'number', step: '0.5', style: 'width:70px', title: 'x' }, tr); tx.value = (d.target && d.target.x) || 0;
    const ty = el('input', { type: 'number', step: '0.5', style: 'width:70px', title: 'y' }, tr); ty.value = (d.target && d.target.y) || 0;
    const setT = () => MT.setTarget(sel, rsel.value, tx.value, ty.value);
    rsel.addEventListener('change', setT); tx.addEventListener('change', setT); ty.addEventListener('change', setT);

    // lint
    const w = lint(sel);
    if (w.length) { el('h4', { style: 'margin:12px 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:var(--txt2)' }, host, 'Checks'); w.forEach(x => el('div', { class: 'tc-card', style: 'margin:4px 0;border-left:3px solid ' + (x.kind === 'bad' ? '#c45a6a' : x.kind === 'warn' ? '#c8a24f' : '#5a7a9a') }, host, (x.kind === 'bad' ? '⛔ ' : x.kind === 'warn' ? '⚠ ' : 'ℹ ') + x.msg)); }

    // usage
    el('h4', { style: 'margin:12px 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:var(--txt2)' }, host, 'Wiring');
    usageBlock(host, 'Started by', usage.starts[sel]);
    usageBlock(host, 'Completed by', usage.completes[sel]);
    if (d.doneFlag) usageBlock(host, 'Done-flag “' + d.doneFlag + '” set by', usage.flags[d.doneFlag]);
  }
  function usageBlock(host, label, sites) {
    const r = el('div', { style: 'margin:4px 0' }, host);
    el('div', { class: 'tc-mut', style: 'font-size:11px' }, r, label + (sites && sites.length ? ':' : ': —'));
    (sites || []).forEach(s => {
      const row = el('div', { class: 'tc-row', style: 'margin:2px 0' }, r);
      el('span', { style: 'flex:1;font-size:12px' }, row, s.lid + ' · ' + s.name + ' · line #' + s.li);
      if (G.__ed && G.__ed.selectProp) el('button', { class: 'tbtn', onclick: () => { G.__ed.selectProp(s.lid, s.pi); if (G.Tools.dialogue) G.Tools.dialogue.editNPC(s.lid, s.pi); } }, row, 'Open');
    });
  }

  T.registerTool({
    id: 'quests', label: 'Quest editor', icon: '📜', group: 'Narrative',
    sub: 'quest registry · start/finish wiring · lint',
    build(host, a) { api = a; bodyEl = host; MT.load(); render(); }
  });
  if (T.roadmapDone) T.roadmapDone(23);
})();
