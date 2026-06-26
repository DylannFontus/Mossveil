// MOSSVEIL — tool-lint.js : Lint 2.0 (Edit ▸ Tools).  Roadmap #40.
// The bottom-bar lint shows the latest issue at a glance; this is the full workbench: a rule-based
// world validator with ~26 checks across Connectivity / References / Logic / Narrative / Content,
// per-issue severity, filtering by severity + category + text, grouping by level / category / rule,
// and one-click jump-to-issue. Read-only analysis over G.LEVELS / G.CUTSCENES + the live datasets
// (enemies, bosses, charms, biomes, music). Editor-only, fully offline. Never mutates the world.
(function () {
  const T = G.Tools;
  if (!T) return;
  const ED = () => G.__ed || {};
  const setOf = a => new Set(a || []);

  // ---- reference sets pulled live from the engine datasets ----
  function refSets() {
    return {
      charmIds: setOf((G.Charms && G.Charms.LIST || []).map(c => c.id)),
      bossIds: setOf((G.Bosses && G.Bosses.LIST || []).map(b => b.id)),
      enemyIds: setOf((G.Enemies && G.Enemies.TYPES || []).map(t => t.id)),
      biomeIds: setOf((G.World && G.World.BIOMES) || []),
      trackIds: setOf((G.Music && G.Music.TRACK_IDS) || []),
      cs: G.CUTSCENES || {}
    };
  }

  // ---- shared world analysis (reachability, incoming links, signal + usage maps) ----
  function analyze(L) {
    const ids = Object.keys(L), startId = ids[0];
    const incoming = {}, reachable = {};
    for (const id of ids) for (const tz of (L[id].transitions || [])) if (tz.to) incoming[tz.to] = (incoming[tz.to] || 0) + 1;
    if (startId) { reachable[startId] = true; const q = [startId];
      while (q.length) { const cur = q.shift(); for (const tz of (L[cur].transitions || [])) { const to = tz.to; if (to && L[to] && !reachable[to]) { reachable[to] = true; q.push(to); } } } }
    // signals — emitters (logic Emit Signal nodes + lever/plate/breakable props) vs listeners (onSignal nodes + doors)
    const emitted = new Set(), heard = new Set();
    const bossTriggersUsed = new Set(), cutscenesUsed = new Set();
    for (const id of ids) {
      const lv = L[id];
      for (const p of (lv.props || [])) {
        if (p.type === 'bossTrigger') bossTriggersUsed.add(p.boss || 'mossSovereign');
        if (p.type === 'cutsceneTrigger' && p.cutscene) cutscenesUsed.add(p.cutscene);
        if ((p.type === 'lever' || p.type === 'plate' || p.type === 'breakable') && p.signal) emitted.add(p.signal);
        if (p.type === 'door' && p.signal) heard.add(p.signal);
      }
      if (lv.intro) cutscenesUsed.add(lv.intro);
      const g = lv.graph;
      if (g) for (const n of (g.nodes || [])) {
        if (n.type === 'signal' && n.p && n.p.name) emitted.add(n.p.name);
        if (n.type === 'onSignal' && n.p && n.p.name) heard.add(n.p.name);
        if (n.type === 'cutscene' && n.p && n.p.id) cutscenesUsed.add(n.p.id);
      }
    }
    return { ids, startId, incoming, reachable, emitted, heard, bossTriggersUsed, cutscenesUsed };
  }

  function hasTerrain(lv) { return (lv.tiles || []).some(row => /[^\s]/.test(row || '')); }

  // ---- the rule registry. Each rule: { id, cat, sev (legend default), label, desc, scan(ctx)->issues }.
  //      An issue = { id:levelId|'', msg, sev, sel? }.  ctx = { L, R, A } (levels, refSets, analysis). ----
  const CAT = { CONN: 'Connectivity', REF: 'References', LOGIC: 'Logic', NARR: 'Narrative', CONT: 'Content' };
  const RULES = [
    // ---------- Connectivity ----------
    { id: 'exit-missing', cat: CAT.CONN, sev: 'error', label: 'Exit to missing room', desc: 'A transition points to a level that does not exist.',
      scan: ({ L }) => { const o = []; for (const id in L) (L[id].transitions || []).forEach((tz, i) => { if (!tz.to || !L[tz.to]) o.push({ id, msg: `exit points to missing room "${tz.to || '∅'}"`, sev: 'error', sel: { kind: 'zone', i } }); }); return o; } },
    { id: 'exit-bad-spawn', cat: CAT.CONN, sev: 'error', label: 'Arrival spawn not found', desc: 'A transition names a spawn point that the destination room does not define.',
      scan: ({ L }) => { const o = []; for (const id in L) (L[id].transitions || []).forEach((tz, i) => { const to = tz.to; if (to && L[to] && tz.spawn && L[to].spawns && !L[to].spawns[tz.spawn]) o.push({ id, msg: `→ ${to}: arrival spawn "${tz.spawn}" missing in ${to}`, sev: 'error', sel: { kind: 'zone', i } }); }); return o; } },
    { id: 'exit-oneway', cat: CAT.CONN, sev: 'warn', label: 'One-way exit (no return)', desc: 'The destination room has no exit coming back — the player can get stuck.',
      scan: ({ L }) => { const o = []; for (const id in L) (L[id].transitions || []).forEach((tz, i) => { const to = tz.to; if (to && L[to] && to !== id && !(L[to].transitions || []).some(t2 => t2.to === id)) o.push({ id, msg: `→ ${to}: no return exit (one-way)`, sev: 'warn', sel: { kind: 'zone', i } }); }); return o; } },
    { id: 'exit-self', cat: CAT.CONN, sev: 'info', label: 'Self-referencing exit', desc: 'A transition leads back into the same room.',
      scan: ({ L }) => { const o = []; for (const id in L) (L[id].transitions || []).forEach((tz, i) => { if (tz.to === id) o.push({ id, msg: `exit loops back to this same room`, sev: 'info', sel: { kind: 'zone', i } }); }); return o; } },
    { id: 'exit-dup', cat: CAT.CONN, sev: 'warn', label: 'Duplicate exit', desc: 'Two transitions go to the same room and spawn — usually one is a mistake.',
      scan: ({ L }) => { const o = []; for (const id in L) { const seen = {}; (L[id].transitions || []).forEach((tz, i) => { if (!tz.to) return; const k = tz.to + '::' + (tz.spawn || ''); if (seen[k] != null) o.push({ id, msg: `duplicate exit to ${tz.to}${tz.spawn ? ' @' + tz.spawn : ''}`, sev: 'warn', sel: { kind: 'zone', i } }); else seen[k] = i; }); } return o; } },
    { id: 'room-deadend', cat: CAT.CONN, sev: 'warn', label: 'Dead-end room', desc: 'A room with no exits at all.',
      scan: ({ L }) => { const o = []; for (const id in L) if (!(L[id].transitions || []).length) o.push({ id, msg: `has no exits (dead-end room)`, sev: 'warn' }); return o; } },
    { id: 'room-unreachable', cat: CAT.CONN, sev: 'warn', label: 'Unreachable room', desc: 'A room you cannot walk to from the start room by following exits.',
      scan: ({ L, A }) => { const o = []; for (const id in L) if (id !== A.startId && !A.reachable[id]) o.push({ id, msg: `unreachable from the start room "${A.startId}"`, sev: 'warn' }); return o; } },
    { id: 'room-no-spawn', cat: CAT.CONN, sev: 'warn', label: 'Linked room has no spawns', desc: 'Other rooms link here, but this room has no spawn points to arrive at.',
      scan: ({ L, A }) => { const o = []; for (const id in L) if (A.incoming[id] && !(L[id].spawns && Object.keys(L[id].spawns).length)) o.push({ id, msg: `rooms link here but it has no spawn points`, sev: 'warn' }); return o; } },
    { id: 'spawn-orphan', cat: CAT.CONN, sev: 'info', label: 'Unused spawn point', desc: 'A named spawn point that no transition ever arrives at.',
      scan: ({ L }) => { const o = []; const used = {}; for (const id in L) for (const tz of (L[id].transitions || [])) if (tz.to && tz.spawn) (used[tz.to] = used[tz.to] || new Set()).add(tz.spawn);
        for (const id in L) { const sp = L[id].spawns || {}; for (const name in sp) if (!(used[id] && used[id].has(name))) o.push({ id, msg: `spawn point "${name}" is never used by any exit`, sev: 'info' }); } return o; } },

    // ---------- References ----------
    { id: 'ref-cutscene', cat: CAT.REF, sev: 'error', label: 'Trigger → missing cutscene', desc: 'A cutscene trigger references a cutscene that no longer exists.',
      scan: ({ L, R }) => { const o = []; for (const id in L) (L[id].props || []).forEach((p, i) => { if (p.type === 'cutsceneTrigger' && p.cutscene && !R.cs[p.cutscene]) o.push({ id, msg: `cutscene trigger references missing cutscene "${p.cutscene}"`, sev: 'error', sel: { kind: 'prop', i } }); }); return o; } },
    { id: 'ref-intro', cat: CAT.REF, sev: 'error', label: 'Intro cutscene missing', desc: 'A room\'s intro cutscene does not exist.',
      scan: ({ L, R }) => { const o = []; for (const id in L) if (L[id].intro && !R.cs[L[id].intro]) o.push({ id, msg: `intro cutscene "${L[id].intro}" doesn't exist`, sev: 'error' }); return o; } },
    { id: 'ref-charm', cat: CAT.REF, sev: 'error', label: 'Pickup → unknown charm', desc: 'A charm pickup references a charm id that is not in the charm library.',
      scan: ({ L, R }) => { const o = []; if (!R.charmIds.size) return o; for (const id in L) (L[id].props || []).forEach((p, i) => { if (p.type === 'charmPickup' && p.charm && !R.charmIds.has(p.charm)) o.push({ id, msg: `charm pickup has unknown charm "${p.charm}"`, sev: 'error', sel: { kind: 'prop', i } }); }); return o; } },
    { id: 'ref-boss', cat: CAT.REF, sev: 'error', label: 'Trigger → unknown boss', desc: 'A boss trigger references a boss id that is not in the boss roster.',
      scan: ({ L, R }) => { const o = []; if (!R.bossIds.size) return o; for (const id in L) (L[id].props || []).forEach((p, i) => { if (p.type === 'bossTrigger' && p.boss && !R.bossIds.has(p.boss)) o.push({ id, msg: `boss trigger has unknown boss "${p.boss}"`, sev: 'error', sel: { kind: 'prop', i } }); }); return o; } },
    { id: 'ref-enemy', cat: CAT.REF, sev: 'warn', label: 'Unknown enemy type', desc: 'An enemy uses a type id not found in the enemy roster or custom library.',
      scan: ({ L, R }) => { const o = []; if (!R.enemyIds.size) return o; for (const id in L) (L[id].enemies || []).forEach((e, i) => { if (e.type && !R.enemyIds.has(e.type)) o.push({ id, msg: `enemy uses unknown type "${e.type}"`, sev: 'warn', sel: { kind: 'enemy', i } }); }); return o; } },
    { id: 'ref-biome', cat: CAT.REF, sev: 'warn', label: 'Unknown biome', desc: 'A room or transition names a biome/palette that does not exist.',
      scan: ({ L, R }) => { const o = []; if (!R.biomeIds.size) return o; for (const id in L) { if (L[id].biome && !R.biomeIds.has(L[id].biome)) o.push({ id, msg: `room biome "${L[id].biome}" is not a known palette`, sev: 'warn' }); (L[id].transitions || []).forEach((tz, i) => { if (tz.biome && !R.biomeIds.has(tz.biome)) o.push({ id, msg: `exit sets unknown biome "${tz.biome}"`, sev: 'warn', sel: { kind: 'zone', i } }); }); } return o; } },
    { id: 'ref-music', cat: CAT.REF, sev: 'warn', label: 'Unknown music track', desc: 'A room\'s music track id is not one the soundtrack defines.',
      scan: ({ L, R }) => { const o = []; if (!R.trackIds.size) return o; for (const id in L) if (L[id].music && !R.trackIds.has(L[id].music)) o.push({ id, msg: `room music "${L[id].music}" is not a known track`, sev: 'warn' }); return o; } },
    { id: 'ref-setactive', cat: CAT.REF, sev: 'error', label: 'Set-active target invalid', desc: 'A set-active trigger has no targets, or points at a missing scene/object.',
      scan: ({ L }) => { const o = []; for (const id in L) (L[id].props || []).forEach((p, i) => { if (p.type !== 'setActiveTrigger') return; const sel = { kind: 'prop', i };
        if (!p.targets || !p.targets.length) { o.push({ id, msg: `set-active trigger has no targets`, sev: 'warn', sel }); return; }
        for (const t of p.targets) { if (!t.level || !L[t.level]) { o.push({ id, msg: `set-active target points to missing scene "${t.level || '∅'}"`, sev: 'error', sel }); continue; }
          if (t.oid == null) { o.push({ id, msg: `a set-active target has no object chosen`, sev: 'warn', sel }); continue; }
          const TL = L[t.level], found = (TL.props || []).some(x => x.oid === t.oid) || (TL.enemies || []).some(x => x.oid === t.oid) || (TL.transitions || []).some(x => x.oid === t.oid);
          if (!found) o.push({ id, msg: `set-active target object (id ${t.oid}) no longer exists in ${t.level}`, sev: 'error', sel }); } }); return o; } },

    // ---------- Logic ----------
    { id: 'logic-link-dangling', cat: CAT.LOGIC, sev: 'error', label: 'Logic link to missing node', desc: 'A wire in the Logic graph connects to a node that was deleted.',
      scan: ({ L }) => { const o = []; for (const id in L) { const g = L[id].graph; if (!g) continue; const have = new Set((g.nodes || []).map(n => n.id)); for (const lk of (g.links || [])) if (!have.has(lk.from) || !have.has(lk.to)) o.push({ id, msg: `a Logic wire connects to a deleted node`, sev: 'error' }); } return o; } },
    { id: 'logic-cutscene-ref', cat: CAT.LOGIC, sev: 'error', label: 'Logic → missing cutscene', desc: 'A Play-Cutscene logic node references a cutscene that does not exist.',
      scan: ({ L, R }) => { const o = []; for (const id in L) { const g = L[id].graph; if (!g) continue; for (const n of (g.nodes || [])) if (n.type === 'cutscene' && n.p && n.p.id && !R.cs[n.p.id]) o.push({ id, msg: `Logic "Play Cutscene" references missing cutscene "${n.p.id}"`, sev: 'error' }); } return o; } },
    { id: 'logic-boss-ref', cat: CAT.LOGIC, sev: 'warn', label: 'Logic → unknown boss', desc: 'An On-Boss-Death node names a boss that is not in the roster (blank = any boss).',
      scan: ({ L, R }) => { const o = []; if (!R.bossIds.size) return o; for (const id in L) { const g = L[id].graph; if (!g) continue; for (const n of (g.nodes || [])) if (n.type === 'onBossDeath' && n.p && n.p.id && !R.bossIds.has(n.p.id)) o.push({ id, msg: `Logic "On Boss Death" names unknown boss "${n.p.id}"`, sev: 'warn' }); } return o; } },
    { id: 'logic-orphan-node', cat: CAT.LOGIC, sev: 'info', label: 'Unwired logic node', desc: 'An action or condition node with no incoming wire — it can never fire.',
      scan: ({ L }) => { const o = []; const ET = (G.EventGraph && G.EventGraph.TYPES) || {}; for (const id in L) { const g = L[id].graph; if (!g) continue; const into = new Set((g.links || []).map(lk => lk.to)); for (const n of (g.nodes || [])) { const t = ET[n.type] || {}; if ((t.ins || 0) > 0 && !into.has(n.id)) o.push({ id, msg: `Logic "${t.title || n.type}" node has no incoming wire (never fires)`, sev: 'info' }); } } return o; } },
    { id: 'signal-unsent', cat: CAT.LOGIC, sev: 'warn', label: 'Signal listened for but never sent', desc: 'An On-Signal node or switch-door waits on a signal name that nothing emits.',
      scan: ({ A }) => { const o = []; A.heard.forEach(name => { if (!A.emitted.has(name)) o.push({ id: '', msg: `signal "${name}" is listened for but nothing emits it`, sev: 'warn' }); }); return o; } },
    { id: 'signal-unheard', cat: CAT.LOGIC, sev: 'info', label: 'Signal emitted but ignored', desc: 'A lever/plate/break or Emit-Signal node broadcasts a signal nothing reacts to.',
      scan: ({ A }) => { const o = []; A.emitted.forEach(name => { if (!A.heard.has(name)) o.push({ id: '', msg: `signal "${name}" is emitted but nothing reacts to it`, sev: 'info' }); }); return o; } },

    // ---------- Narrative ----------
    { id: 'npc-no-dialogue', cat: CAT.NARR, sev: 'info', label: 'NPC with no dialogue', desc: 'An NPC prop has no dialogue lines set.',
      scan: ({ L }) => { const o = []; for (const id in L) (L[id].props || []).forEach((p, i) => { if (p.type === 'npc' && (!p.dialogue || !(p.dialogue.lines || []).length)) o.push({ id, msg: `NPC has no dialogue lines`, sev: 'info', sel: { kind: 'prop', i } }); }); return o; } },
    { id: 'dialogue-bad-goto', cat: CAT.NARR, sev: 'warn', label: 'Dialogue jump out of range', desc: 'A dialogue line (or choice) jumps to a line index that does not exist.',
      scan: ({ L }) => { const o = []; const chk = (lines, g) => g != null && g >= 0 && g >= lines.length; for (const id in L) (L[id].props || []).forEach((p, i) => { if (p.type !== 'npc' || !p.dialogue) return; const lines = p.dialogue.lines || []; lines.forEach((ln, li) => { if (chk(lines, ln.goto)) o.push({ id, msg: `dialogue line ${li} jumps to missing line ${ln.goto}`, sev: 'warn', sel: { kind: 'prop', i } }); for (const c of (ln.choices || [])) if (chk(lines, c.goto)) o.push({ id, msg: `dialogue choice on line ${li} jumps to missing line ${c.goto}`, sev: 'warn', sel: { kind: 'prop', i } }); }); }); return o; } },
    { id: 'quest-unobtainable', cat: CAT.NARR, sev: 'warn', label: 'Quest never started / finished', desc: 'A registered quest that no dialogue can start, or that can be started but never completed.',
      scan: () => { const o = []; const Q = G.Tools && G.Tools.quests; if (!Q || !Q.lint || !Q.quests) return o; try { for (const q of Q.quests()) { const r = Q.lint(q.id) || {}; if (r.unobtainable) o.push({ id: '', msg: `quest "${q.id}" can never be started by any dialogue`, sev: 'warn' }); else if (r.unfinishable) o.push({ id: '', msg: `quest "${q.id}" can be started but never completed`, sev: 'warn' }); } } catch (_) { } return o; } },

    // ---------- Content ----------
    { id: 'room-empty', cat: CAT.CONT, sev: 'info', label: 'Empty room', desc: 'A room with no terrain, props or enemies — probably a stub.',
      scan: ({ L }) => { const o = []; for (const id in L) { const lv = L[id]; if (!hasTerrain(lv) && !(lv.props || []).length && !(lv.enemies || []).length) o.push({ id, msg: `room is empty (no terrain, props or enemies)`, sev: 'info' }); } return o; } },
    { id: 'room-untitled', cat: CAT.CONT, sev: 'info', label: 'Untitled room', desc: 'A room with no display title set.',
      scan: ({ L }) => { const o = []; for (const id in L) if (!L[id].title) o.push({ id, msg: `room has no title`, sev: 'info' }); return o; } },
    { id: 'water-oob', cat: CAT.CONT, sev: 'warn', label: 'Water line out of bounds', desc: 'A room\'s water height is outside the room.',
      scan: ({ L }) => { const o = []; for (const id in L) { const w = L[id].water; if (w && (w.y < 0 || w.y > L[id].h)) o.push({ id, msg: `water level Y (${w.y}) is outside the room`, sev: 'warn' }); } return o; } },
    { id: 'boss-unplaced', cat: CAT.CONT, sev: 'info', label: 'Boss never placed', desc: 'A boss in the roster that no boss trigger anywhere spawns.',
      scan: ({ R, A }) => { const o = []; if (!R.bossIds.size) return o; R.bossIds.forEach(bid => { if (!A.bossTriggersUsed.has(bid)) o.push({ id: '', msg: `boss "${bid}" is never placed by any trigger`, sev: 'info' }); }); return o; } },
    { id: 'cutscene-unused', cat: CAT.CONT, sev: 'info', label: 'Unused cutscene', desc: 'A defined cutscene that is never triggered, used as an intro, or played by logic.',
      scan: ({ R, A }) => { const o = []; for (const cid in R.cs) if (!A.cutscenesUsed.has(cid)) o.push({ id: '', msg: `cutscene "${cid}" is defined but never used`, sev: 'info' }); return o; } }
  ];

  // ---- run the whole rule set over the current world ----
  function run() {
    const L = G.LEVELS || {}, R = refSets(), A = analyze(L);
    const ctx = { L, R, A };
    const issues = [];
    for (const rule of RULES) {
      let got = [];
      try { got = rule.scan(ctx) || []; } catch (e) { got = []; }
      for (const it of got) { it.ruleId = rule.id; it.cat = rule.cat; if (!it.sev) it.sev = rule.sev; issues.push(it); }
    }
    const counts = { error: 0, warn: 0, info: 0, total: issues.length };
    for (const it of issues) counts[it.sev] = (counts[it.sev] || 0) + 1;
    return { issues, counts };
  }

  // =================== test / external API ===================
  T.lint = {
    rules: () => RULES.map(r => ({ id: r.id, cat: r.cat, sev: r.sev, label: r.label, desc: r.desc })),
    categories: () => Object.values(CAT),
    run,
    openInTool: () => T.openTool('lint')
  };

  // =================== UI ===================
  let bodyEl = null, api = null;
  const SEV_META = { error: { ico: '✕', col: '#ff7a6a', label: 'Errors' }, warn: { ico: '⚠', col: '#ffcf4a', label: 'Warnings' }, info: { ico: 'ℹ', col: '#7fb6e8', label: 'Info' } };
  const SEV_ORD = { error: 0, warn: 1, info: 2 };
  // view state persists across opens within a session
  const view = { sev: { error: true, warn: true, info: true }, cat: 'all', group: 'level', q: '' };

  function el(t, a, p, x) { return api.el(t, a, p, x); }

  function jump(it) {
    if (!it.id || !G.LEVELS[it.id]) return;
    const ed = ED();
    const focus = () => { const c = ed.companion; if (it.sel && c && c.focusSel) c.focusSel(it.sel); else if (ed.setTab) ed.setTab('scene'); };
    if (ed.currentId && ed.currentId() !== it.id && ed.openLevel) { ed.openLevel(it.id); setTimeout(focus, 220); }
    else focus();
    T.closeTool();
    api.toast('Jumped to ' + it.id);
  }

  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column';
    const { issues, counts } = run();

    // ---- toolbar ----
    const bar = el('div', { style: 'display:flex;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid var(--line);flex-wrap:wrap' }, bodyEl);
    el('button', { class: 'tbtn', onclick: () => render() }, bar, '⟳ Re-scan');
    el('div', { style: 'width:1px;height:18px;background:var(--line)' }, bar);
    ['error', 'warn', 'info'].forEach(s => {
      const m = SEV_META[s];
      const b = el('button', { class: 'tbtn' + (view.sev[s] ? ' on' : ''), style: 'color:' + (view.sev[s] ? m.col : 'var(--txt2)'), title: 'Toggle ' + m.label }, bar, `${m.ico} ${m.label} ${counts[s] || 0}`);
      b.addEventListener('click', () => { view.sev[s] = !view.sev[s]; render(); });
    });
    el('div', { style: 'width:1px;height:18px;background:var(--line)' }, bar);
    el('span', { class: 'tc-mut' }, bar, 'Category');
    const catSel = el('select', { style: 'flex:0 0 auto' }, bar);
    ['all'].concat(Object.values(CAT)).forEach(c => { const o = el('option', { value: c }, catSel, c === 'all' ? 'All' : c); if (c === view.cat) o.selected = true; });
    catSel.addEventListener('change', () => { view.cat = catSel.value; render(); });
    el('span', { class: 'tc-mut' }, bar, 'Group');
    const grpSel = el('select', { style: 'flex:0 0 auto' }, bar);
    [['level', 'by Room'], ['cat', 'by Category'], ['rule', 'by Rule']].forEach(([v, t]) => { const o = el('option', { value: v }, grpSel, t); if (v === view.group) o.selected = true; });
    grpSel.addEventListener('change', () => { view.group = grpSel.value; render(); });
    const q = el('input', { type: 'text', placeholder: 'Filter text…', value: view.q, style: 'flex:1;min-width:120px' }, bar);
    q.addEventListener('input', () => { view.q = q.value; renderList(); });

    // ---- summary ----
    const sum = el('div', { class: 'tc-mut', style: 'padding:7px 12px;border-bottom:1px solid var(--line)' }, bodyEl);
    if (!counts.total) sum.textContent = '✓ No issues found — every link, reference and exit checks out.';
    else sum.textContent = `${counts.total} issue${counts.total === 1 ? '' : 's'} · ${counts.error || 0} error${counts.error === 1 ? '' : 's'}, ${counts.warn || 0} warning${counts.warn === 1 ? '' : 's'}, ${counts.info || 0} info. Click a row to jump to it.`;

    const list = el('div', { style: 'flex:1;overflow:auto;padding:6px 0' }, bodyEl);

    function renderList() {
      list.innerHTML = '';
      const txt = view.q.trim().toLowerCase();
      let shown = issues.filter(it => view.sev[it.sev] && (view.cat === 'all' || it.cat === view.cat) && (!txt || (it.msg + ' ' + it.id + ' ' + it.ruleId).toLowerCase().includes(txt)));
      shown.sort((a, b) => (SEV_ORD[a.sev] - SEV_ORD[b.sev]) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      if (!shown.length) { el('div', { class: 'tc-mut', style: 'padding:18px;text-align:center' }, list, counts.total ? 'No issues match the current filters.' : '✓ Nothing to fix.'); return; }
      const keyer = { level: it => it.id || '∅ World', cat: it => it.cat, rule: it => (RULES.find(r => r.id === it.ruleId) || {}).label || it.ruleId };
      const labeler = { level: k => k === '∅ World' ? '🌍 World-wide' : ((G.LEVELS[k] && (G.LEVELS[k].title || k)) || k), cat: k => k, rule: k => k };
      const groups = {};
      for (const it of shown) (groups[keyer[view.group](it)] = groups[keyer[view.group](it)] || []).push(it);
      Object.keys(groups).forEach(gk => {
        el('div', { style: 'color:#9fd8b8;font-size:12px;margin:9px 12px 2px;font-weight:600' }, list, labeler[view.group](gk) + '  ·  ' + groups[gk].length);
        for (const it of groups[gk]) {
          const m = SEV_META[it.sev];
          const row = el('div', { class: 'lintRow', style: 'display:flex;gap:8px;align-items:flex-start;padding:5px 12px;cursor:' + (it.id ? 'pointer' : 'default') }, list);
          el('span', { style: 'color:' + m.col + ';flex:0 0 auto', title: it.sev }, row, m.ico);
          const body = el('span', { style: 'flex:1;color:#d8d2c8;min-width:0' }, row, (it.id ? (G.LEVELS[it.id] && (G.LEVELS[it.id].title || it.id)) + ': ' : '') + it.msg);
          if (view.group !== 'rule') el('span', { class: 'tc-mut', style: 'flex:0 0 auto;font-size:10px;opacity:.7' }, row, it.ruleId);
          if (it.id && G.LEVELS[it.id]) { row.addEventListener('click', () => jump(it)); body.title = 'Jump to ' + it.id; }
        }
      });
    }
    renderList();

    // ---- rules reference (collapsible) ----
    const foot = el('details', { style: 'border-top:1px solid var(--line);padding:8px 12px' }, bodyEl);
    el('summary', { class: 'tc-mut', style: 'cursor:pointer' }, foot, `What gets checked — ${RULES.length} rules`);
    const grid = el('div', { style: 'margin-top:6px;display:grid;grid-template-columns:1fr 1fr;gap:4px 16px' }, foot);
    Object.values(CAT).forEach(cat => {
      el('div', { style: 'grid-column:1/-1;color:#9fd8b8;font-size:11px;font-weight:600;margin-top:4px' }, grid, cat);
      RULES.filter(r => r.cat === cat).forEach(r => {
        const card = el('div', { class: 'tc-row', style: 'margin:0;align-items:flex-start' }, grid);
        const m = SEV_META[r.sev];
        el('span', { style: 'color:' + m.col + ';flex:0 0 auto', title: r.sev }, card, m.ico);
        const tx = el('span', { class: 'tc-mut', style: 'font-size:11px' }, card);
        el('b', { style: 'color:var(--txt)' }, tx, r.label + ' — ');
        tx.appendChild(document.createTextNode(r.desc));
      });
    });
  }

  T.registerTool({
    id: 'lint', label: 'Lint 2.0 / world check', icon: '🩺', group: 'Tools',
    sub: 'rule-based validator · jump to issues',
    build(host, a) { api = a; bodyEl = host; render(); }
  });
  if (T.roadmapDone) T.roadmapDone(40);
})();
