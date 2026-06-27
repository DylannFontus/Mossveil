// MOSSVEIL — tool-gates.js : Progression & gates analyser (Edit ▸ Tools).  Roadmap #89.
// A read-only scanner of the game's LOCK graph — the switches, signals, flags and gates that gate
// progress — in the lint / deps / perf / dps mould (no engine change, no data overlay). It reads every
// level's props + logic graph (def.graph) and cross-references KEYS against LOCKS:
//   • signals are ROOM-LOCAL: a lever/plate (or an Emit-Signal node) drives a door (or On-Signal node)
//     in the SAME room, matched by name.
//   • flags are GLOBAL/persistent: a lever/plate/Set-Flag sets a flag that a door / If-Flag anywhere
//     reads.
//   • gates are oid-controlled: a Set-Active node or a setActiveTrigger's target toggles a gate by oid.
// It surfaces the dead ends: doors that never open, switches that drive nothing, gates nothing toggles,
// flags read-but-never-set (a soft-lock) or set-but-never-read. Editor-only, fully offline.
(function () {
  const T = G.Tools;
  if (!T) return;
  const ED = () => G.__ed || {};
  const levels = () => G.LEVELS || {};
  const lnodes = lv => (lv && lv.graph && lv.graph.nodes) || [];

  // ---- per-level inventory: locks (door/gate), keys (lever/plate), and the room-local signal map ----
  function levelReport(id) {
    const lv = levels()[id]; if (!lv) return null;
    const props = lv.props || [], nodes = lnodes(lv);
    const locks = [], keys = [], gates = [], sigSources = {}, sigSinks = {}, emits = [], onSignals = [];
    props.forEach((p, idx) => {
      if (!p) return;
      if (p.type === 'lever' || p.type === 'plate') {
        const name = p.signal || (p.type + (p.oid != null ? p.oid : ''));
        keys.push({ kind: p.type, idx, signal: name, flag: p.flag || null, x: p.x, y: p.y });
        sigSources[name] = (sigSources[name] || 0) + 1;
      } else if (p.type === 'door') {
        locks.push({ kind: 'door', idx, signal: p.signal || null, flag: p.flag || null, invert: !!p.invert, x: p.x, y: p.y });
        if (p.signal) sigSinks[p.signal] = (sigSinks[p.signal] || 0) + 1;
      } else if (p.type === 'gate') {
        const g = { kind: 'gate', idx, oid: (p.oid != null ? p.oid : null), x: p.x, y: p.y };
        locks.push(g); gates.push(g);
      }
    });
    nodes.forEach(n => {
      const pp = n.p || {};
      if (n.type === 'signal') { const nm = pp.name || 'sig'; emits.push(nm); sigSources[nm] = (sigSources[nm] || 0) + 1; }
      else if (n.type === 'onSignal') { const nm = pp.name || 'sig'; onSignals.push(nm); sigSinks[nm] = (sigSinks[nm] || 0) + 1; }
    });
    return { id, title: lv.title || id, locks, keys, gates, sigSources, sigSinks, emits, onSignals };
  }

  // ---- whole-world view: flag setter/reader table + the set of oids something controls ----
  function world() {
    const L = levels(), ids = Object.keys(L), flags = {}, controlled = {}, reports = {};
    const flag = (name, role, level, idx, kind) => { if (!name) return; (flags[name] = flags[name] || { setters: [], readers: [] })[role].push({ level, idx, kind }); };
    ids.forEach(id => {
      const lv = L[id], props = lv.props || [], nodes = lnodes(lv);
      reports[id] = levelReport(id);
      props.forEach((p, idx) => {
        if (!p) return;
        if ((p.type === 'lever' || p.type === 'plate') && p.flag) flag(p.flag, 'setters', id, idx, p.type);
        if (p.type === 'door' && p.flag) flag(p.flag, 'readers', id, idx, 'door');
        if (p.type === 'setActiveTrigger' && Array.isArray(p.targets)) p.targets.forEach(t => { if (t && t.oid != null) controlled[(t.level || id) + '|' + t.oid] = true; });
      });
      nodes.forEach(n => {
        const pp = n.p || {};
        if (n.type === 'setFlag' && pp.flag) flag(pp.flag, 'setters', id, -1, 'logic:setFlag');
        if ((n.type === 'ifFlag' || n.type === 'ifNotFlag') && pp.flag) flag(pp.flag, 'readers', id, -1, 'logic:' + n.type);
        if (n.type === 'setActive' && pp.oid != null && pp.oid !== '') controlled[(pp.level || id) + '|' + pp.oid] = true;
      });
    });
    return { ids, flags, controlled, reports };
  }

  function lint() {
    const w = world(), out = [];
    const flagSet = n => w.flags[n] && w.flags[n].setters.length > 0;
    const flagRead = n => w.flags[n] && w.flags[n].readers.length > 0;
    for (const id of w.ids) {
      const r = w.reports[id];
      r.locks.filter(l => l.kind === 'door').forEach(d => {
        const hasSig = d.signal && r.sigSources[d.signal] > 0;
        const hasFlag = d.flag && flagSet(d.flag);
        if (!hasSig && !hasFlag) {
          if (d.invert) out.push({ sev: 'info', level: id, idx: d.idx, kind: 'door-open', msg: 'inverted door has no switch/flag — it stays OPEN' });
          else out.push({ sev: 'error', level: id, idx: d.idx, kind: 'door-stuck', msg: 'door never opens — no in-room switch emits "' + (d.signal || '(no signal)') + '"' + (d.flag ? ' and flag "' + d.flag + '" is never set' : '') });
        }
      });
      r.gates.forEach(g => {
        if (g.oid == null) out.push({ sev: 'warn', level: id, idx: g.idx, kind: 'gate-noid', msg: 'gate has no oid — nothing can toggle it (stays open)' });
        else if (!w.controlled[id + '|' + g.oid]) out.push({ sev: 'info', level: id, idx: g.idx, kind: 'gate-free', msg: 'gate (oid ' + g.oid + ') is toggled by no Set-Active — stays open' });
      });
      r.keys.forEach(k => {
        const drivesSig = r.sigSinks[k.signal] > 0, drivesFlag = k.flag && flagRead(k.flag);
        if (!drivesSig && !drivesFlag) out.push({ sev: 'info', level: id, idx: k.idx, kind: 'key-dead', msg: k.kind + ' "' + k.signal + '" drives no door/logic in this room' + (k.flag ? ' and flag "' + k.flag + '" is read nowhere' : '') });
      });
      r.onSignals.forEach(nm => { if (!(r.sigSources[nm] > 0)) out.push({ sev: 'warn', level: id, idx: -1, kind: 'onsig-dead', msg: 'On-Signal "' + nm + '" never fires — nothing emits it in this room' }); });
      r.emits.forEach(nm => { if (!(r.sigSinks[nm] > 0)) out.push({ sev: 'info', level: id, idx: -1, kind: 'emit-dead', msg: 'Emit-Signal "' + nm + '" reaches no door/On-Signal in this room' }); });
    }
    for (const f in w.flags) {
      const fl = w.flags[f];
      if (fl.readers.length && !fl.setters.length) out.push({ sev: 'warn', level: fl.readers[0].level, idx: fl.readers[0].idx, kind: 'flag-noset', msg: 'flag "' + f + '" is read but never set — its gate/condition is unreachable' });
      if (fl.setters.length && !fl.readers.length) out.push({ sev: 'info', level: fl.setters[0].level, idx: fl.setters[0].idx, kind: 'flag-noread', msg: 'flag "' + f + '" is set but never read' });
    }
    return out;
  }

  function flags() { return world().flags; }

  function stats() {
    const w = world(); let doors = 0, gates = 0, keys = 0; const sigNames = {};
    for (const id of w.ids) { const r = w.reports[id]; doors += r.locks.filter(l => l.kind === 'door').length; gates += r.gates.length; keys += r.keys.length; Object.keys(r.sigSources).forEach(s => sigNames[s] = 1); Object.keys(r.sigSinks).forEach(s => sigNames[s] = 1); }
    return { levels: w.ids.length, doors, gates, keys, signals: Object.keys(sigNames).length, flags: Object.keys(w.flags).length, issues: lint().length };
  }

  // =================== test / external API ===================
  T.gates = { levelReport, world, lint, flags, stats, openInTool: () => T.openTool('gates') };

  // =================== UI ===================
  let bodyEl = null, api = null;
  const view = { filter: 'all', q: '', sel: null, mode: 'issues' };
  function el(t, a, p, x) { return api.el(t, a, p, x); }
  const SEV = { error: '#ff7a6a', warn: '#ffcf4a', info: 'var(--txt2)' };
  const SEVICON = { error: '✕', warn: '⚠', info: 'ℹ' };

  function jump(level, idx) {
    if (!levels()[level]) return;
    if (idx >= 0 && ED().selectProp) { ED().selectProp(level, idx); T.closeTool(); api.toast('Selected in ' + ((levels()[level] || {}).title || level)); }
    else if (ED().openLevel) { ED().openLevel(level); T.closeTool(); }
  }

  function issueRow(parent, it) {
    const row = el('div', { class: 'tc-row', style: 'margin:2px 0;align-items:center' }, parent);
    el('span', { style: 'color:' + SEV[it.sev] + ';margin-right:6px' }, row, SEVICON[it.sev]);
    el('span', { style: 'flex:1;font-size:12px' }, row, (levels()[it.level] ? ((levels()[it.level].title || it.level) + ': ') : '') + it.msg);
    const b = el('button', { class: 'tbtn', style: 'padding:1px 6px' }, row, '↗');
    b.addEventListener('click', () => jump(it.level, it.idx));
  }

  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column;height:100%';
    const w = world(), issues = lint(), st = stats();
    const issuesByLevel = {}; issues.forEach(it => { (issuesByLevel[it.level] = issuesByLevel[it.level] || []).push(it); });

    // stats bar
    const bar = el('div', { class: 'tc-mut', style: 'padding:8px 12px;border-bottom:1px solid var(--line);display:flex;gap:14px;flex-wrap:wrap' }, bodyEl);
    const stat = (lab, val, warn) => { const s = el('span', {}, bar); el('b', { style: 'color:' + (warn && val ? '#ffcf4a' : 'var(--txt)') }, s, '' + val); s.appendChild(document.createTextNode(' ' + lab)); };
    stat('levels', st.levels); stat('doors', st.doors); stat('gates', st.gates); stat('switches', st.keys); stat('signals', st.signals); stat('flags', st.flags); stat('issues', st.issues, true);

    // toolbar
    const tb = el('div', { style: 'display:flex;align-items:center;gap:6px;padding:8px 12px;border-bottom:1px solid var(--line);flex-wrap:wrap' }, bodyEl);
    [['all', 'All levels'], ['issues', 'With issues'], ['locks', 'With locks']].forEach(([id, label]) => { const b = el('button', { class: 'tbtn' + (view.filter === id ? ' on' : '') }, tb, label); b.addEventListener('click', () => { view.filter = id; render(); }); });
    el('div', { style: 'flex:1' }, tb);
    const fb = el('button', { class: 'tbtn' + (view.mode === 'flags' ? ' on' : '') }, tb, '🚩 Flags');
    fb.addEventListener('click', () => { view.mode = (view.mode === 'flags' ? 'issues' : 'flags'); render(); });
    const q = el('input', { type: 'text', placeholder: 'Search…', value: view.q, style: 'flex:0 0 150px' }, tb);
    q.addEventListener('input', () => { view.q = q.value; render(); });

    // 2-pane
    const grid = el('div', { style: 'flex:1;display:grid;grid-template-columns:1fr 320px;gap:0;min-height:0' }, bodyEl);
    const left = el('div', { style: 'overflow:auto;min-height:0' }, grid);
    const txt = view.q.trim().toLowerCase();
    const visIds = w.ids.filter(id => {
      const r = w.reports[id];
      if (view.filter === 'issues' && !(issuesByLevel[id] || []).length) return false;
      if (view.filter === 'locks' && !r.locks.length) return false;
      if (txt && (r.title + ' ' + id).toLowerCase().indexOf(txt) < 0) return false;
      return true;
    });
    if (!visIds.length) el('div', { class: 'tc-mut', style: 'padding:18px' }, left, 'No levels match.');
    visIds.forEach(id => {
      const r = w.reports[id], iss = issuesByLevel[id] || [];
      const errN = iss.filter(i => i.sev === 'error').length, warnN = iss.filter(i => i.sev === 'warn').length;
      const row = el('div', { class: 'tc-row' + (view.sel === id ? ' sel' : ''), style: 'padding:6px 12px;border-bottom:1px solid var(--line);cursor:pointer;align-items:center;gap:8px' }, left);
      el('span', { style: 'flex:1;font-size:13px;color:var(--txt)' }, row, r.title);
      el('span', { class: 'tc-mut', style: 'font-size:11px' }, row, r.locks.length + '🔒 · ' + r.keys.length + '🔑');
      if (errN) el('span', { class: 'tc-pill', style: 'background:#ff7a6a;color:#1a0d0a;font-size:10px' }, row, '✕' + errN);
      if (warnN) el('span', { class: 'tc-pill', style: 'background:#ffcf4a;color:#1a1408;font-size:10px' }, row, '⚠' + warnN);
      if (!iss.length) el('span', { class: 'tc-pill done', style: 'font-size:10px' }, row, '✓');
      row.addEventListener('click', () => { view.sel = (view.sel === id ? null : id); view.mode = 'issues'; render(); });
    });

    // detail pane
    const right = el('div', { style: 'overflow:auto;padding:12px 14px;border-left:1px solid var(--line);min-height:0' }, grid);
    if (view.mode === 'flags') {
      el('h3', { style: 'margin:0 0 8px;font-size:13px' }, right, 'Flags (' + Object.keys(w.flags).length + ')');
      const names = Object.keys(w.flags).sort();
      if (!names.length) el('div', { class: 'tc-mut' }, right, 'No flags used anywhere.');
      names.forEach(f => {
        const fl = w.flags[f], bad = (fl.readers.length && !fl.setters.length);
        const box = el('div', { style: 'margin-bottom:8px;padding:6px 8px;border:1px solid var(--line);border-radius:5px' }, right);
        el('div', { style: 'font-size:12px;color:' + (bad ? '#ffcf4a' : 'var(--txt)') }, box, '🚩 ' + f + (bad ? '  — never set!' : ''));
        el('div', { class: 'tc-mut', style: 'font-size:11px' }, box, 'set by ' + fl.setters.length + ' · read by ' + fl.readers.length);
      });
    } else if (view.sel) {
      const r = w.reports[view.sel], iss = issuesByLevel[view.sel] || [];
      el('h3', { style: 'margin:0 0 6px;font-size:13px' }, right, r.title);
      el('div', { class: 'tc-mut', style: 'margin-bottom:8px;font-size:11px' }, right, r.locks.length + ' locks · ' + r.keys.length + ' switches · ' + Object.keys(r.sigSources).length + ' signal sources');
      el('div', { class: 'tc-mut', style: 'font-size:11px;margin-bottom:3px' }, right, 'ISSUES (' + iss.length + ')');
      if (!iss.length) el('div', { class: 'tc-pill done', style: 'display:inline-block' }, right, 'No problems in this room.');
      iss.forEach(it => issueRow(right, it));
      if (r.keys.length) { el('div', { class: 'tc-mut', style: 'font-size:11px;margin:10px 0 3px' }, right, 'SWITCHES'); r.keys.forEach(k => el('div', { style: 'font-size:11px;color:var(--txt2)' }, right, '🔑 ' + k.kind + ' → "' + k.signal + '"' + (k.flag ? ' + flag ' + k.flag : ''))); }
      if (r.locks.length) { el('div', { class: 'tc-mut', style: 'font-size:11px;margin:10px 0 3px' }, right, 'LOCKS'); r.locks.forEach(l => el('div', { style: 'font-size:11px;color:var(--txt2)' }, right, (l.kind === 'gate' ? '🚪 gate oid ' + (l.oid != null ? l.oid : '—') : '🔒 door ← "' + (l.signal || '') + '"' + (l.flag ? ' / flag ' + l.flag : '') + (l.invert ? ' (inverted)' : '')))); }
    } else {
      el('h3', { style: 'margin:0 0 6px;font-size:13px' }, right, 'Issues · ' + issues.length);
      if (!issues.length) el('div', { class: 'tc-pill done', style: 'display:inline-block' }, right, 'No progression problems found.');
      const order = { error: 0, warn: 1, info: 2 };
      issues.slice().sort((a, b) => order[a.sev] - order[b.sev]).forEach(it => issueRow(right, it));
      el('div', { class: 'tc-mut', style: 'margin-top:12px;font-size:11px' }, right, 'Signals are room-local (a switch opens a door in the same room); flags are global. Select a level for its lock graph, or 🚩 for the flag table.');
    }
  }

  T.registerTool({
    id: 'gates', label: 'Progression & gates', icon: '🔒', group: 'Tools',
    sub: 'switches · signals · flags · gates — dead-ends & soft-locks',
    build(host, a) { api = a; bodyEl = host; render(); }
  });
  if (T.roadmapDone) T.roadmapDone(89);
})();
