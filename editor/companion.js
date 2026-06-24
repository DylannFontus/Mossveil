// MOSSVEIL — companion.js : an offline "editor companion" assistant (editor-only).
// You ask in plain language ("how do I make a door open with a lever?") and it answers with
// exact, current, clickable steps. It is NOT a neural model — it builds a knowledge base from
// the editor's OWN data (every asset, Guide concept, logic node, shortcut) + authored recipes +
// your live scene, then ranks it with a lexical/synonym/fuzzy engine. So it never invents UI
// that doesn't exist, and it's always up to date as assets/features change. Fully offline, no
// weights, no network. (Lives only here — players who open the game never load any of this.)
(function () {
  const C = G.Companion = {};
  let kb = [], idf = {}, built = false, N = 0;
  let panel, logEl, inputEl, openState = false;

  // ---------------- tiny DOM helpers ----------------
  function el(tag, attrs, parent, text) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) (k === 'class') ? (e.className = attrs[k]) : e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function esc(s) { return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
  function fmt(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>'); }

  // ---------------- text / matching ----------------
  const STOP = new Set('a an the to of in on is it i how do does can my me you want make made making create creating add adding place placing set setting get with for and or as that this what which where when why need use using into onto from at be are will would should'.split(' '));
  // word -> related words it should also match (intent / synonym expansion)
  const SYN = {
    fire: ['flame', 'burn', 'ember', 'ignite', 'lava', 'cinder'], flame: ['fire', 'burn'], burn: ['fire', 'flame', 'ember'],
    grass: ['foliage', 'plant', 'flammable'], door: ['gate', 'switch', 'open'], gate: ['door', 'boss'],
    lever: ['switch', 'pull', 'signal'], plate: ['pressure', 'switch', 'signal'], switch: ['lever', 'plate', 'signal', 'door'],
    moving: ['platform', 'move'], platform: ['moving', 'float'], lift: ['platform', 'elevator'],
    water: ['reflect', 'reflection', 'ice', 'wet'], ice: ['water', 'frost', 'freeze'],
    weather: ['rain', 'snow', 'storm', 'blizzard', 'wind', 'fog', 'embers'], rain: ['weather', 'storm'], snow: ['weather', 'blizzard'],
    hazard: ['spike', 'lava', 'acid', 'crusher', 'trap', 'damage', 'hurt'], spike: ['hazard', 'trap'], lava: ['fire', 'pool', 'hazard', 'damage'], acid: ['pool', 'hazard', 'damage'],
    mud: ['mire', 'quicksand', 'slow', 'soft'], quicksand: ['mire', 'sink', 'slow'], ash: ['mire', 'soft'],
    gas: ['poison', 'miasma', 'cloud'], poison: ['gas', 'miasma'],
    flower: ['flora', 'bioflora', 'glow', 'mushroom', 'bioluminescent'], mushroom: ['flora', 'bioflora', 'glow'], flora: ['flower', 'mushroom', 'glow'],
    enemy: ['foe', 'creature', 'monster', 'mob'], boss: ['bossfight', 'gate'], spawn: ['start', 'respawn', 'marker'],
    npc: ['dialogue', 'talk', 'speak', 'quest', 'character'], dialogue: ['npc', 'talk', 'quest'], quest: ['npc', 'objective'],
    save: ['bench', 'rest', 'checkpoint'], bench: ['save', 'rest'], shop: ['vendor', 'charm', 'buy'], vendor: ['shop', 'charm'],
    spell: ['soul', 'bolt', 'ember', 'frost', 'gale', 'well'], well: ['spell', 'soul'], bolt: ['spell', 'ember', 'frost', 'gale'],
    rotate: ['rotation', 'angle', 'turn', 'spin'], collision: ['collider', 'solid', 'hitbox', 'hurtbox', 'box'], hurtbox: ['hit', 'collision', 'hitbox'],
    portal: ['transition', 'door', 'connect', 'link', 'room', 'travel'], transition: ['portal', 'room', 'connect'], room: ['level', 'portal', 'transition'], level: ['room', 'scene'],
    music: ['soundtrack', 'song', 'audio', 'score'], sound: ['audio', 'music', 'sfx'], light: ['glow', 'lamp', 'ray', 'lighting'],
    paint: ['terrain', 'tile', 'solid', 'block', 'brush'], terrain: ['tile', 'solid', 'paint', 'ground'], tile: ['terrain', 'paint'],
    model: ['mymodel', 'rig', 'character'], cutscene: ['cinematic', 'scene'], logic: ['graph', 'trigger', 'event', 'script'], trigger: ['logic', 'event', 'zone'],
    delete: ['remove', 'erase'], copy: ['duplicate', 'paste'], wind: ['gale', 'gust', 'weather'], frost: ['ice', 'freeze', 'cold'], gale: ['wind', 'push'],
    charm: ['shop', 'vendor', 'pickup'], breakable: ['wall', 'secret', 'break'], conveyor: ['belt', 'move'], crusher: ['hazard', 'crush']
  };
  function tokenize(s) { return (String(s).toLowerCase().match(/[a-z0-9]+/g) || []).filter(t => t.length > 1 && !STOP.has(t)); }
  function expand(tokens) {
    const out = new Set(tokens);
    for (const t of tokens) { const s = SYN[t]; if (s) for (const w of s) out.add(w); }
    return [...out];
  }
  function lev1(a, b) {                                   // is edit distance <= 1 ? (typo tolerance)
    if (a === b) return true; const la = a.length, lb = b.length; if (Math.abs(la - lb) > 1) return false;
    let i = 0, j = 0, edits = 0;
    while (i < la && j < lb) { if (a[i] === b[j]) { i++; j++; } else { if (++edits > 1) return false; if (la > lb) i++; else if (lb > la) j++; else { i++; j++; } } }
    return edits + (la - i) + (lb - j) <= 1;
  }

  // character-trigram "semantic" vectors — a tiny offline stand-in for embeddings that catches
  // paraphrases / word-order the token index misses (no model, no download, no network).
  function grams(s) { s = ' ' + String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ') + ' '; const g = new Map(); for (let i = 0; i < s.length - 2; i++) { const k = s.substr(i, 3); g.set(k, (g.get(k) || 0) + 1); } return g; }
  function gnorm(g) { let n = 0; for (const v of g.values()) n += v * v; return Math.sqrt(n) || 1; }
  function gcos(a, an, b, bn) { let dot = 0; const s = a.size < b.size ? a : b, l = a.size < b.size ? b : a; for (const [k, v] of s) { const w = l.get(k); if (w) dot += v * w; } return dot / (an * bn); }

  // ---------------- knowledge base ----------------
  function entry(e) { e.tokens = tokenize(e.text + ' ' + e.title); e.tset = new Set(e.tokens); e.g = grams(e.title + ' ' + (e.syn || '')); e.gn = gnorm(e.g); kb.push(e); }

  const ASSET_DESC = {
    bench: 'a bench — sit to rest and save (a checkpoint).', sign: 'a tutorial/lore sign that shows text when you stand near it.',
    readable: 'a lore tablet/effigy/totem with your own title + text.', lamp: 'a hanging lamp that casts a warm glow.', crystal: 'a glowing crystal.',
    spellwell: 'a soul well — commune to open the spell tree and learn/attune spells.', vendor: 'a charm-shop vendor.', smith: 'a nailsmith who forges a stronger nail.',
    npc: 'a character with branching dialogue you author inline (can start quests).', charmPickup: 'a charm you can pick up.',
    gate: 'a boss gate that seals an arena (pair with a boss trigger).', bossTrigger: 'a boss-fight trigger — walking in spawns the chosen boss.',
    platform: 'a moving platform that carries you (set its travel dx/dy and speed).', crusher: 'a crusher that slams on a timer.', conveyor: 'a conveyor belt that pushes you.',
    windzone: 'a wind current that pushes you (set force fx/fy).', fallfloor: 'a floor that shakes then drops when stood on, and respawns.',
    spiketrap: 'timed spikes that extend/retract — only dangerous while out.', breakable: 'a breakable wall (nail it to reveal a secret).',
    lever: 'a lever — pull it to toggle a named switch/signal.', plate: 'a pressure plate — on while stood on (or latched).', door: 'a door that opens when its switch/flag is on (solid while closed).',
    mire: 'soft ground — mud/quicksand/ash that slows (quicksand sinks you).', pool: 'a lava/acid pool — sears on contact and bounces you out.',
    gas: 'a poison cloud — damages over time, disperses in wind, ignites from an Ember Bolt.', bioflora: 'bioluminescent flora that brightens as you pass (optionally destructible).',
    light: 'a glow light (optionally flickering).', ray: 'a god-ray light shaft.', decor: 'a decorative piece (place on any depth layer).', furniture: 'a furniture piece.',
    building: 'a procedural multi-storey building shell.', wall: 'a wall backdrop panel.', model: 'a custom model you built in the Models tab.',
    textTrigger: 'an invisible zone that pops text when you walk through.', cutsceneTrigger: 'a zone that plays a cutscene in place.',
    setActiveTrigger: 'a zone that turns objects on/off (by their id).', lookTrigger: 'a zone that changes the biome/grade/weather/water.',
    audio: 'an audio zone — ambient emitter, reverb zone, or music-mood trigger.', spawn: 'a spawn point (players arrive here; portals target it).', portal: 'a portal/transition to another room.'
  };
  const ASSET_SYN = {
    bench: 'rest save checkpoint', spellwell: 'spell tree learn upgrade attune ember frost gale', mire: 'mud quicksand ash slow soft sink',
    pool: 'lava acid fire damage hazard burn', gas: 'poison miasma cloud toxic', bioflora: 'glow flower mushroom bioluminescent reactive destructible',
    bossTrigger: 'boss fight spawn arena', portal: 'transition connect link travel room exit', spawn: 'start respawn arrive', door: 'switch open close signal',
    lever: 'switch toggle signal pull', plate: 'pressure switch signal stand', windzone: 'wind push current updraft', audio: 'music sound reverb ambient mood'
  };

  function buildKB() {
    kb = []; idf = {};
    const ed = (G.__ed && G.__ed.companion) || null;
    // ---- assets ("how do I place X") ----
    if (ed) for (const group of ed.allAssets()) {
      for (const it of group.items) {
        if (!it || it.cat === 'none' || !it.id) continue;
        const akind = it.kind || it.boss || it.model || null;
        const desc = ASSET_DESC[(it.id + ':' + akind)] || ASSET_DESC[it.id] || ('a ' + group.label.toLowerCase() + ' object you can place.');
        entry({
          id: 'asset:' + group.cat + ':' + it.id + ':' + (akind || ''), kind: 'asset', title: 'Place ' + it.label,
          text: it.label + ' ' + group.label + ' ' + (akind || '') + ' ' + (ASSET_SYN[it.id] || '') + ' ' + desc + ' place add create',
          body: '**' + it.label + '** — ' + desc,
          steps: [
            { text: 'Be on the **Scene** tab. In the **Asset browser** (bottom), open the **' + group.label + '** tab.', action: { kind: 'assetCat', cat: group.cat } },
            { text: 'Click **' + it.label + '**, then click in the scene to place it (hold **Shift** to place several).', action: { kind: 'place', cat: group.cat, id: it.id, akind, label: it.label } },
            { text: 'With it selected, tune it in the **Inspector** on the right — I can walk you through each field.', action: { kind: 'walk' } }
          ], weight: 1.0
        });
      }
    }
    // ---- Guide concepts, tools/shortcuts, logic nodes ----
    if (ed) {
      const g = ed.guide();
      for (const [name, d] of (g.concepts || [])) entry({ id: 'concept:' + name, kind: 'concept', title: name, text: name + ' ' + d, body: d, actions: [{ label: 'Open the Guide', action: { kind: 'guide' } }], weight: 0.9 });
      for (const [name, d] of (g.tools || [])) entry({ id: 'tool:' + name, kind: 'tool', title: name, text: name + ' ' + d, body: d, weight: 0.9 });
      const T = g.nodes || {}, ND = g.nodeDesc || {};
      for (const k in T) { const def = T[k]; entry({ id: 'logic:' + k, kind: 'logic', title: 'Logic ' + def.kind + ': ' + def.title, text: def.title + ' ' + (ND[k] || '') + ' logic graph trigger event condition action', body: (ND[k] || def.title) + ' — add it in the **Logic** tab.', actions: [{ label: 'Open Logic tab', action: { kind: 'tab', tab: 'logic' } }], weight: 0.7 });
      }
    }
    // ---- authored recipes (the high-value "how do I make X") ----
    for (const r of RECIPES) entry(Object.assign({ kind: 'recipe', weight: 1.6 }, r, { text: (r.title + ' ' + (r.syn || '') + ' ' + (r.body || '') + ' ' + r.steps.map(s => s.text).join(' ')) }));
    // ---- meta / capabilities ----
    entry({ id: 'meta:help', kind: 'meta', title: 'What can you ask me?', text: 'help what can you do companion assistant guide how list topics', body: 'Ask me how to do anything in the editor — e.g. *“how do I make a door open with a lever?”*, *“add lava”*, *“connect two rooms”*, *“change the weather”*, *“rotate an object”*, *“set up a boss fight”*. I read your editor live, so my steps always match the current buttons and assets. I can also **do steps for you** — buttons under an answer switch tabs and arm placement.', actions: [{ label: 'Open the Guide', action: { kind: 'guide' } }], weight: 0.5 });

    // idf over the corpus
    N = kb.length; const df = {};
    for (const e of kb) for (const t of e.tset) df[t] = (df[t] || 0) + 1;
    for (const t in df) idf[t] = Math.log(1 + N / df[t]);
    built = true;
  }

  // ---------------- retrieval ----------------
  function search(query) {
    if (!built) buildKB();
    const qraw = tokenize(query); if (!qraw.length) return [];
    const q = expand(qraw);
    const qg = grams(query), qn = gnorm(qg);
    const scored = [];
    for (const e of kb) {
      let s = 0;
      for (let i = 0; i < q.length; i++) {
        const t = q[i], base = (idf[t] || 1.2) * (qraw.includes(t) ? 1 : 0.55);   // expanded synonyms count a bit less
        if (e.tset.has(t)) s += base * 2.2;
        else { for (const et of e.tset) { if (et.length > 3 && (et.startsWith(t) || t.startsWith(et) || lev1(et, t))) { s += base * 0.9; break; } } }
      }
      // title-hit boost + a small semantic (trigram-cosine) nudge for paraphrases
      const tl = e.title.toLowerCase(); let tb = 0; for (const t of qraw) if (tl.includes(t)) tb += 1.4;
      const sem = gcos(qg, qn, e.g, e.gn) * 1.6;
      s = (s + tb + sem) * (e.weight || 1);
      if (s > 0) scored.push({ e, s });
    }
    scored.sort((a, b) => b.s - a.s);
    return scored;
  }

  // ---------------- scene awareness ----------------
  function sceneSummary() {
    const ed = G.__ed && G.__ed.companion; if (!ed) return null;
    const L = ed.level(); if (!L) return null;
    const props = {}; for (const p of (L.props || [])) props[p.type] = (props[p.type] || 0) + 1;
    const ens = (L.enemies || []).length, zones = (L.transitions || []).length, spawns = Object.keys(L.spawns || {}).length;
    const parts = [];
    const order = Object.keys(props).sort((a, b) => props[b] - props[a]);
    for (const k of order.slice(0, 8)) parts.push(props[k] + '× ' + k);
    if (ens) parts.push(ens + ' enemy' + (ens > 1 ? '/ies' : '')); if (zones) parts.push(zones + ' transition' + (zones > 1 ? 's' : '')); if (spawns) parts.push(spawns + ' spawn' + (spawns > 1 ? 's' : ''));
    return { id: ed.currentId(), w: L.w, h: L.h, biome: L.biome, parts };
  }

  // ---------------- scene diagnostics ("check this room") ----------------
  function diagnose() {
    const ed = G.__ed && G.__ed.companion; if (!ed) return [];
    const L = ed.level(), id = ed.currentId(); if (!L) return [];
    const props = L.props || [], out = [];
    const idxOf = p => ({ kind: 'prop', i: props.indexOf(p) });
    const emit = p => p.signal || ((p.type === 'lever' ? 'lever' : 'plate') + (p.oid || ''));
    const emitters = props.filter(p => p.type === 'lever' || p.type === 'plate');
    const emitted = new Set(emitters.map(emit));
    const doors = props.filter(p => p.type === 'door');
    for (const d of doors) {
      if (!d.signal) out.push({ sev: 'warn', msg: 'A **door** has no **Signal** set — it will never open.', sel: idxOf(d) });
      else if (!emitted.has(d.signal)) out.push({ sev: 'warn', msg: 'A door listens for signal `' + d.signal + '`, but no lever/plate emits it.', sel: idxOf(d) });
    }
    const doorSignals = new Set(doors.map(d => d.signal).filter(Boolean));
    for (const e of emitters) { const s = e.signal; if (s && !doorSignals.has(s)) out.push({ sev: 'info', msg: 'A ' + e.type + ' emits `' + s + '`, but no door listens for it.', sel: idxOf(e) }); }
    if (props.some(p => p.type === 'bossTrigger') && !props.some(p => p.type === 'gate')) out.push({ sev: 'warn', msg: 'A **boss trigger** has no **boss gates** — the arena won’t seal.', sel: null });
    // pull in the world validator's findings for THIS room
    const v = ed.lint(); for (const w of (v.warns || [])) if (w.id === id) out.push({ sev: w.sev, msg: w.msg.replace(id + ':', '').replace(id + ' →', '→').trim(), sel: w.sel });
    return out;
  }
  // a cheap wiring-issue count for the proactive badge (no full world validation)
  function quickIssueCount() {
    const ed = G.__ed && G.__ed.companion; if (!ed) return 0; const L = ed.level(); if (!L) return 0;
    const props = L.props || []; let n = 0;
    const emit = p => p.signal || ((p.type === 'lever' ? 'lever' : 'plate') + (p.oid || ''));
    const emitted = new Set(props.filter(p => p.type === 'lever' || p.type === 'plate').map(emit));
    for (const d of props.filter(p => p.type === 'door')) if (!d.signal || !emitted.has(d.signal)) n++;
    if (props.some(p => p.type === 'bossTrigger') && !props.some(p => p.type === 'gate')) n++;
    return n;
  }
  function answerDiagnostics() {
    const ed = G.__ed && G.__ed.companion; const id = ed ? ed.currentId() : '';
    const issues = diagnose();
    if (!issues.length) { addAnswer({ title: 'This room looks wired up', body: 'I didn’t spot any wiring problems in **' + id + '**. For full world validation (links, reachability), open the **Lint** tab.', actions: [{ label: 'Open Lint', action: { kind: 'lint' } }] }); return; }
    const b = addMsg('bot', '');
    el('div', { class: 'cpTitle' }, b).textContent = 'Found ' + issues.length + ' thing' + (issues.length > 1 ? 's' : '') + ' to check in ' + id + ':';
    const ul = el('ul', { class: 'cpSteps' }, b);
    for (const is of issues) { const li = el('li', {}, ul); el('span', {}, li).innerHTML = fmt((is.sev === 'error' ? '⛔ ' : is.sev === 'info' ? 'ℹ ' : '⚠ ') + is.msg); if (is.sel) actBtn(li, '▶ Show', { kind: 'focus', sel: is.sel }); }
    const row = el('div', { class: 'cpRow' }, b); actBtn(row, 'Open Lint tab', { kind: 'lint' });
  }

  // ---------------- answering ----------------
  let lastEntry = null;
  function answer(query) {
    addMsg('user', null, query);
    const ql = query.toLowerCase().trim();
    // diagnostics intent
    if (/\b(check|lint|problem|issue|wrong|broken|mistake|error|validate|diagnos|why (isn'?t|won'?t|doesn'?t))\b/.test(ql)) { answerDiagnostics(); return; }
    // follow-up ("more", "related", "what else") -> related of the last topic
    if (lastEntry && /^(more|related|what else|anything else|else|others?|next|continue|go on)\b/.test(ql)) {
      const rel = search(lastEntry.title).slice(1, 6).map(r => r.e).filter(e => e.title);
      if (rel.length) { addRelated(rel); return; }
    }
    // scene questions
    if (/\b(this room|this level|this scene|my scene|my level|my room|what('?s| is| do i have| have i)|how many)\b/.test(ql) && /\b(room|level|scene|place|object|have|here)\b/.test(ql)) {
      const sc = sceneSummary();
      if (sc) { addAnswer({ title: 'In this room (' + sc.id + ')', body: '**' + sc.id + '** — ' + sc.w + '×' + sc.h + ', biome *' + sc.biome + '*.' + (sc.parts.length ? '\nPlaced: ' + sc.parts.join(' · ') : '\nNothing placed yet.'), steps: [], actions: [] }); return; }
    }
    const res = search(query);
    if (!res.length || res[0].s < 1.1) {
      const sugg = res.slice(0, 5).map(r => r.e);
      addNoMatch(sugg);
      return;
    }
    addAnswer(res[0].e);
    maybeSceneTip(res[0].e.id);
    const related = res.slice(1, 4).map(r => r.e).filter(e => e.title);
    if (related.length) addRelated(related);
  }
  // weave in live-scene context for a few recipes
  function maybeSceneTip(id) {
    const ed = G.__ed && G.__ed.companion; if (!ed) return; const L = ed.level(); if (!L) return; const props = L.props || [];
    if (id === 'rec:lever-door' || id === 'rec:plate-door') {
      const sigs = [...new Set(props.filter(p => p.type === 'lever' || p.type === 'plate').map(p => p.signal).filter(Boolean))];
      if (sigs.length) addMsg('bot', '<div class="cpBody">💡 This room already has switch signal' + (sigs.length > 1 ? 's' : '') + ': <b>' + sigs.join('</b>, <b>') + '</b>. Reuse one as the door’s <b>Signal</b> to link them.</div>');
    } else if (id === 'rec:portal') {
      const others = Object.keys(G.LEVELS || {}).filter(k => k !== ed.currentId());
      if (others.length) addMsg('bot', '<div class="cpBody">💡 Rooms you can link to: <b>' + others.slice(0, 8).join('</b>, <b>') + '</b>' + (others.length > 8 ? '…' : '') + '.</div>');
    } else if (id === 'rec:boss' && !props.some(p => p.type === 'gate')) {
      addMsg('bot', '<div class="cpBody">💡 This room has no <b>boss gates</b> yet — add some so the arena seals during the fight.</div>');
    }
  }

  // ---------------- UI ----------------
  function dispatch(a, label) {
    const c = G.__ed && G.__ed.companion; if (!c || !a) return;
    if (a.kind === 'place') { if (c.armPlace(a.cat, a.id, a.akind || a.kind2)) { setOpen(false); flash('Armed — click in the scene to place ' + (a.label || 'it') + '.'); } }
    else if (a.kind === 'assetCat') { c.openAssetCat(a.cat); flash('Opened the ' + a.cat + ' assets (bottom).'); }
    else if (a.kind === 'tab') { c.gotoTab(a.tab); }
    else if (a.kind === 'guide') { c.openGuide(); flash('Opened the Guide (left panel).'); }
    else if (a.kind === 'lint') { if (c.openLint) c.openLint(); flash('Opened the Lint panel (left).'); }
    else if (a.kind === 'focus') { if (c.focusSel) c.focusSel(a.sel); setOpen(false); flash('Selected it in the scene.'); }
    else if (a.kind === 'highlight') { highlightUI(a); }
    else if (a.kind === 'walk') { walkFields(); }
  }
  // step through the selected object's Inspector fields, flashing each in turn
  let walkT = null;
  function walkFields() {
    const rows = [].slice.call(document.querySelectorAll('#insBody .frow'));
    if (!rows.length) { addMsg('bot', '<div class="cpBody">Select an object in the scene first — then I’ll walk you through each of its Inspector fields.</div>'); return 0; }
    clearTimeout(walkT); rows.forEach(r => r.classList.remove('cpFlash')); let i = 0;
    const step = () => {
      rows.forEach(r => r.classList.remove('cpFlash'));
      if (i >= rows.length) { flash('That’s every field on this object.'); return; }
      const r = rows[i++]; r.classList.add('cpFlash'); if (r.scrollIntoView) r.scrollIntoView({ block: 'nearest' });
      const lab = r.querySelector('label'); flash('Field ' + i + '/' + rows.length + (lab ? ': ' + lab.textContent : ''));
      walkT = setTimeout(step, 1150);
    };
    step(); return rows.length;
  }
  function highlightUI(a) {
    let t = null;
    if (a.sel) t = document.querySelector(a.sel);
    else if (a.field) { for (const r of document.querySelectorAll('#insBody .frow')) { const lab = r.querySelector('label'); if (lab && lab.textContent.toLowerCase().includes(String(a.field).toLowerCase())) { t = r; break; } } if (!t) t = document.getElementById('inspector'); }
    if (t) { t.classList.add('cpFlash'); if (t.scrollIntoView) t.scrollIntoView({ block: 'nearest' }); setTimeout(() => t.classList.remove('cpFlash'), 1700); }
    else flash('Select the object first — then I can point to its “' + (a.field || '') + '” field.');
  }
  function actLabel(a) {
    if (a.kind === 'place') return '▶ ' + (a.label ? 'Place ' + a.label : 'Place');
    if (a.kind === 'assetCat') return '▶ Open assets';
    if (a.kind === 'tab') return '▶ Go to ' + a.tab;
    if (a.kind === 'guide') return '▶ Open Guide';
    if (a.kind === 'lint') return '▶ Lint';
    if (a.kind === 'highlight') return '▶ Show field';
    if (a.kind === 'focus') return '▶ Show';
    if (a.kind === 'walk') return '▶ Walk fields';
    return '▶ Do';
  }
  function actBtn(parent, label, action) {
    const b = el('button', { class: 'cpAct' }, parent, label);
    b.addEventListener('click', () => dispatch(action, label));
    return b;
  }
  function addMsg(who, html, text) {
    const m = el('div', { class: 'cpMsg cp' + who }, logEl);
    const b = el('div', { class: 'cpBub' }, m);
    if (html != null) b.innerHTML = html; else b.textContent = text;
    logEl.scrollTop = logEl.scrollHeight; return b;
  }
  function addAnswer(e) {
    if (e && e.title) lastEntry = e;                     // remember for "more / related" follow-ups
    const b = addMsg('bot', '');
    if (e.title) el('div', { class: 'cpTitle' }, b).innerHTML = fmt(e.title);
    if (e.body) { const bd = el('div', { class: 'cpBody' }, b); bd.innerHTML = fmt(e.body).replace(/\n/g, '<br>'); }
    if (e.steps && e.steps.length) {
      const ol = el('ol', { class: 'cpSteps' }, b);
      for (const st of e.steps) {
        const li = el('li', {}, ol); el('span', {}, li).innerHTML = fmt(st.text);
        if (st.action) actBtn(li, actLabel(st.action), st.action);
      }
    }
    if (e.actions) { const row = el('div', { class: 'cpRow' }, b); for (const a of e.actions) actBtn(row, a.label, a.action); }
    logEl.scrollTop = logEl.scrollHeight;
  }
  function addRelated(list) {
    const b = addMsg('bot', '<div class="cpRel">Related:</div>');
    const row = b.querySelector('.cpRel');
    for (const e of list) { const c = el('span', { class: 'cpChip' }, row, e.title.replace(/^Place /, '')); c.addEventListener('click', () => { addAnswer(e); }); }
  }
  function addNoMatch(sugg) {
    const b = addMsg('bot', '<div class="cpBody">I’m not certain what you mean. Try rephrasing, or pick a topic:</div>');
    if (sugg && sugg.length) { const row = el('div', { class: 'cpRel' }, b); for (const e of sugg) { const c = el('span', { class: 'cpChip' }, row, e.title.replace(/^Place /, '')); c.addEventListener('click', () => addAnswer(e)); } }
    const row2 = el('div', { class: 'cpRow' }, b); actBtn(row2, 'Open the Guide', { kind: 'guide' });
  }
  let flashT;
  function flash(text) { const h = G.$ ? null : document.getElementById('viewportHint'); if (h) { h.textContent = text; clearTimeout(flashT); flashT = setTimeout(() => { if (h.textContent === text) h.textContent = ''; }, 3500); } }

  function setOpen(v) {
    openState = v; panel.style.display = v ? 'flex' : 'none'; btn.classList.toggle('on', v);
    try { localStorage.setItem('mossveil-cp-open', v ? '1' : '0'); } catch (e) { }
    if (v) { if (!built) buildKB(); inputEl.focus(); }
  }
  function savePos() { try { localStorage.setItem('mossveil-cp-pos', JSON.stringify({ l: panel.style.left, t: panel.style.top })); } catch (e) { } }
  function restorePos() { try { const p = JSON.parse(localStorage.getItem('mossveil-cp-pos') || 'null'); if (p && p.l && p.t) { panel.style.right = 'auto'; panel.style.bottom = 'auto'; panel.style.left = p.l; panel.style.top = p.t; } } catch (e) { } }
  let btn, badge;
  function updateBadge() {                               // proactive: show a wiring-issue count on the Ask button
    if (!badge) return; let n = 0; try { n = quickIssueCount(); } catch (e) { n = 0; }
    badge.textContent = n; badge.style.display = n > 0 ? 'block' : 'none';
    badge.title = n + ' possible wiring issue' + (n > 1 ? 's' : '') + ' in this room — ask me to “check this room”.';
  }
  function injectStyle() {
    el('style', {}, document.head).textContent = `
    #cpBtn.on{background:var(--acc);color:#0c1014;border-color:var(--acc);}
    #cpPanel{position:fixed;right:14px;bottom:34px;width:360px;max-width:94vw;height:62vh;max-height:660px;z-index:60;display:none;flex-direction:column;
      background:#121820;border:1px solid rgba(120,200,180,.3);border-radius:12px;box-shadow:0 18px 60px rgba(0,0,0,.6);overflow:hidden;font:12px "Segoe UI",sans-serif;}
    #cpHead{display:flex;align-items:center;gap:8px;padding:9px 12px;background:#16202a;border-bottom:1px solid rgba(120,200,180,.18);}
    #cpHead .t{color:#9fd8b8;font-weight:600;letter-spacing:.04em;flex:1;}
    #cpHead button{width:26px;height:24px;border:1px solid rgba(120,200,180,.25);background:#0b1117;color:#9fc;border-radius:6px;cursor:pointer;}
    #cpLog{flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:9px;}
    .cpMsg{display:flex;} .cpuser{justify-content:flex-end;} .cpbot{justify-content:flex-start;}
    .cpBub{max-width:90%;border-radius:10px;padding:8px 10px;line-height:1.5;}
    .cpuser .cpBub{background:#27506f;color:#eaf4ff;} .cpbot .cpBub{background:#1a2530;color:#d8e6e0;border:1px solid rgba(120,200,180,.12);}
    .cpTitle{color:#bfeede;font-weight:600;margin-bottom:4px;} .cpBody{color:#cfe0d8;} code{background:#0b1117;border-radius:3px;padding:0 3px;color:#9fe6c8;font-family:ui-monospace,Consolas,monospace;}
    .cpSteps{margin:7px 0 2px;padding-left:20px;color:#cfe0d8;} .cpSteps li{margin:5px 0;}
    .cpAct{margin:4px 0 0;display:inline-block;background:#0e1c18;color:#9fe6c8;border:1px solid rgba(95,214,168,.4);border-radius:6px;padding:3px 9px;cursor:pointer;font-size:11px;}
    .cpAct:hover{background:#1d3a30;border-color:#5fd6a8;}
    .cpRow{margin-top:7px;display:flex;flex-wrap:wrap;gap:6px;} .cpRel{margin-top:4px;color:#86a89c;font-size:11px;}
    .cpChip{display:inline-block;margin:4px 4px 0 0;background:#13202b;color:#bfe6da;border:1px solid rgba(120,200,180,.28);border-radius:12px;padding:3px 9px;cursor:pointer;font-size:11px;}
    .cpChip:hover{background:#1d3340;border-color:#5fd6a8;}
    #cpInputRow{display:flex;gap:6px;padding:9px;border-top:1px solid rgba(120,200,180,.18);background:#0e151c;}
    #cpInput{flex:1;background:#0b1117;border:1px solid rgba(120,200,180,.3);border-radius:8px;color:#dfeee8;font-size:13px;padding:8px 10px;outline:none;}
    #cpInput:focus{border-color:#5fd6a8;} #cpSend{background:#2f7d4f;color:#eafff0;border:1px solid #2f7d4f;border-radius:8px;padding:0 12px;cursor:pointer;font-weight:600;}
    #cpSend:hover{background:#379159;}
    #cpHead{cursor:grab;} #cpHead.drag{cursor:grabbing;}
    #cpBtn{position:relative;} #cpBadge{position:absolute;top:-6px;right:-6px;min-width:16px;height:16px;border-radius:9px;background:#e0a020;color:#1b1300;font:700 10px/16px "Segoe UI";text-align:center;padding:0 3px;display:none;box-shadow:0 1px 3px rgba(0,0,0,.5);}
    .cpFlash{outline:2px solid #5fd6a8 !important;outline-offset:1px;background:rgba(95,214,168,.12) !important;transition:background .2s;}
    @media (pointer:coarse){#cpPanel{width:92vw;height:70vh;}}
    `;
  }
  function build() {
    injectStyle();
    btn = el('button', { class: 'tbtn', id: 'cpBtn', title: 'Editor Companion — ask how to do anything (offline). Press ? to toggle.' }, $tb(), '🤖 Ask');
    btn.addEventListener('click', () => setOpen(!openState));
    badge = el('span', { id: 'cpBadge', title: 'Possible wiring issues in this room — ask me to “check”.' }, btn);
    panel = el('div', { id: 'cpPanel' }, document.body);
    const head = el('div', { id: 'cpHead' }, panel);
    el('div', { class: 't' }, head, '🤖 Companion');
    const wf = el('button', { title: 'Walk me through the selected object’s Inspector fields' }, head, '🚶'); wf.addEventListener('click', walkFields);
    const clr = el('button', { title: 'Clear' }, head, '⟲'); clr.addEventListener('click', () => { logEl.innerHTML = ''; greet(); });
    const cls = el('button', { title: 'Close' }, head, '✕'); cls.addEventListener('click', () => setOpen(false));
    logEl = el('div', { id: 'cpLog' }, panel);
    const row = el('div', { id: 'cpInputRow' }, panel);
    inputEl = el('input', { id: 'cpInput', type: 'text', placeholder: 'Ask how to do something…', autocomplete: 'off', spellcheck: 'false' }, row);
    const send = el('button', { id: 'cpSend' }, row, 'Ask');
    const go = () => { const q = inputEl.value.trim(); if (!q) return; inputEl.value = ''; answer(q); };
    send.addEventListener('click', go);
    inputEl.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') go(); else if (e.key === 'Escape') setOpen(false); });
    // drag the panel by its header; remember where you put it
    let drag = null;
    head.addEventListener('pointerdown', e => {
      if (e.target.tagName === 'BUTTON') return;
      const r = panel.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      panel.style.right = 'auto'; panel.style.bottom = 'auto'; panel.style.left = r.left + 'px'; panel.style.top = r.top + 'px';
      head.classList.add('drag'); try { head.setPointerCapture(e.pointerId); } catch (_) { }
    });
    head.addEventListener('pointermove', e => {
      if (!drag) return;
      const x = Math.max(4, Math.min(innerWidth - 90, e.clientX - drag.dx)), y = Math.max(4, Math.min(innerHeight - 44, e.clientY - drag.dy));
      panel.style.left = x + 'px'; panel.style.top = y + 'px';
    });
    head.addEventListener('pointerup', () => { if (drag) { drag = null; head.classList.remove('drag'); savePos(); } });
    restorePos();
    // open with "?" (anywhere but a text field); the panel's own input is exempt
    window.addEventListener('keydown', e => {
      if (/INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || '')) return;
      if (e.key === '?') { e.preventDefault(); setOpen(!openState); }
    }, true);
    greet();
    try { if (localStorage.getItem('mossveil-cp-open') === '1') setOpen(true); } catch (e) { }
    updateBadge(); setInterval(updateBadge, 2500);       // keep the proactive issue badge current
  }
  function $tb() { return document.getElementById('toolbar') || document.body; }
  function greet() {
    addMsg('bot', '<div class="cpTitle">🤖 Editor Companion</div><div class="cpBody">Ask me how to do anything in the editor and I’ll give exact, current steps — with buttons that do them for you. Drag my header to move me; press <b>?</b> anytime to toggle. Try one:</div>');
    const b = logEl.lastChild.querySelector('.cpBub');
    const row = el('div', { class: 'cpRel' }, b);
    for (const s of ['Make a door open with a lever', 'Add a lava pool', 'Connect two rooms', 'Set up a boss fight', 'Change the weather', 'What’s in this room?', 'Check this room for problems'])
      { const c = el('span', { class: 'cpChip' }, row, s); c.addEventListener('click', () => answer(s)); }
  }

  // ---------------- authored recipes ----------------
  const RECIPES = [
    { id: 'rec:lever-door', title: 'Make a door open with a lever', syn: 'switch signal gate open close trigger',
      body: 'Wire a **lever** to a **door** with a shared **Signal** name.',
      steps: [
        { text: 'Asset browser → **Dynamic** → place a **Lever**.', action: { kind: 'place', cat: 'dynamic', id: 'lever', label: 'Lever' } },
        { text: 'Select the lever; in the **Inspector** set **Signal** to a name, e.g. `gate1`.' },
        { text: 'Dynamic → place a **Door**, and set its **Signal** to the same `gate1`.', action: { kind: 'place', cat: 'dynamic', id: 'door', label: 'Door' } },
        { text: 'Press **▶ Play here** and pull the lever — the door opens. (A **pressure plate** works the same way.)' }
      ] },
    { id: 'rec:plate-door', title: 'Pressure plate that opens a door', syn: 'stand latch switch signal',
      body: 'A **pressure plate** is on while you stand on it (or latches once pressed).',
      steps: [
        { text: 'Dynamic → place a **Pressure plate**; set its **Signal** (and **Latch** if it should stay on).', action: { kind: 'place', cat: 'dynamic', id: 'plate', label: 'Pressure plate' } },
        { text: 'Dynamic → place a **Door** with the **same Signal**.', action: { kind: 'place', cat: 'dynamic', id: 'door', label: 'Door' } }
      ] },
    { id: 'rec:moving-platform', title: 'Create a moving platform', syn: 'lift elevator carry travel pingpong',
      body: 'A moving platform carries you along a travel vector.',
      steps: [
        { text: 'Dynamic → place a **Moving platform**.', action: { kind: 'place', cat: 'dynamic', id: 'platform', label: 'Moving platform' } },
        { text: 'In the Inspector set **dx/dy** (how far it travels), **Speed**, and **Mode** (ping-pong / loop). The dashed line + dot in the viewport shows its path.' }
      ] },
    { id: 'rec:boss', title: 'Set up a boss fight', syn: 'arena gate seal trigger spawn hurtbox',
      body: 'A **boss trigger** spawns the boss; pair it with **boss gates** to seal the arena.',
      steps: [
        { text: 'Asset browser → **Bosses** → pick a boss and place its **trigger** where the fight should start.', action: { kind: 'assetCat', cat: 'bosses' } },
        { text: 'Dynamic → place one or more **Boss gates** at the arena exits — they close when the fight begins and open on the boss’s death.', action: { kind: 'place', cat: 'dynamic', id: 'gate', label: 'Boss gate' } },
        { text: 'Optional: select the boss trigger and tick **Custom hit area** to make the boss easier/harder to strike.' }
      ] },
    { id: 'rec:portal', title: 'Connect two rooms', syn: 'transition portal door travel link exit spawn',
      body: 'A **portal/transition** sends the player to a spawn point in another room.',
      steps: [
        { text: 'In the destination room, place a **Spawn point** (Markers) and note its number.', action: { kind: 'place', cat: 'markers', id: 'spawn', label: 'Spawn point' } },
        { text: 'Back in this room, Markers → place a **Portal / transition** at the edge.', action: { kind: 'place', cat: 'markers', id: 'portal', label: 'Portal' } },
        { text: 'Select the portal; set **To level** and **Arrive at** (the spawn id you made). The **Map** tab shows the link.' }
      ] },
    { id: 'rec:weather', title: 'Change the weather', syn: 'rain snow storm blizzard wind fog embers atmosphere',
      body: 'Weather is a **per-level** setting (and a Logic action / lookTrigger can change it live).',
      steps: [
        { text: 'Click empty space to deselect, so the **Inspector** shows **Level settings**.' },
        { text: 'Set **Weather** (Clear / Rain / Storm / Windy / Fog / Snow / Embers / Blizzard). It draws live in the viewport and drives the dynamic environment (fire spread, ice, deep snow…).' },
        { text: 'To change it mid-level, place a **Biome / look changer** zone (Markers) and set its Weather.', action: { kind: 'place', cat: 'markers', id: 'lookTrigger', label: 'Biome / look changer' } }
      ] },
    { id: 'rec:fire', title: 'Make grass catch fire', syn: 'burn flame ember bolt ignite flammable spread',
      body: 'Grassy ground is flammable. In play, an **Ember Bolt** ignites it.',
      steps: [
        { text: 'Paint **Grassy** terrain (toolbar terrain material) where you want flammable ground.' },
        { text: 'Place a **Soul well** so the player can attune **Ember Bolt** (Dynamic/Props).', action: { kind: 'place', cat: 'props', id: 'spellwell', label: 'Soul well' } },
        { text: 'In play, attune Ember at the well and cast at the grass. Rain/snow douse it; wind spreads it; embers make it burn longer.' }
      ] },
    { id: 'rec:hazard', title: 'Add a hazard (lava, acid, mud, gas)', syn: 'lava acid pool mud quicksand ash poison gas damage trap spike',
      body: 'Hazards are placeable **Dynamic** blocks you size in the Inspector.',
      steps: [
        { text: 'Asset browser → **Dynamic**. Pick **Lava/Acid pool** (sears + bounces you out), **Mud/Quicksand/Ash** (slows/sinks), or **Poison gas** (DOT, ignitable).', action: { kind: 'assetCat', cat: 'dynamic' } },
        { text: 'Place it over walkable terrain, then set **Width/Height** (and **Kind/Damage**) in the Inspector.' }
      ] },
    { id: 'rec:flora', title: 'Add bioluminescent flora', syn: 'glow flower mushroom reactive destructible bioflora light',
      body: 'Glow flora brightens as you pass; you choose if it can die.',
      steps: [
        { text: 'Asset browser → **Lights** → place a **Glow flower** or **Glow mushroom**.', action: { kind: 'place', cat: 'lights', id: 'bioflora', kind: 'flower', label: 'Glow flower' } },
        { text: 'In the Inspector pick a **Glow colour**, and tick **Destructible** if the nail should cut it / fire should wither it (otherwise it’s permanent).' }
      ] },
    { id: 'rec:npc', title: 'Add an NPC with dialogue', syn: 'talk speak character quest conversation branching',
      body: 'Place an **NPC** and author its branching dialogue inline.',
      steps: [
        { text: 'Asset browser → **Props** → place an **NPC**.', action: { kind: 'place', cat: 'props', id: 'npc', label: 'NPC' } },
        { text: 'In the Inspector add **lines** (speaker + text) and per-line **choices** (label / goto line / set flag / start quest). Interact in play to talk.' }
      ] },
    { id: 'rec:enemy', title: 'Place an enemy (or a custom one)', syn: 'creature monster foe behavior ai custom',
      body: 'Drop a built-in creature, or design one with the **Custom (behavior)** type.',
      steps: [
        { text: 'Asset browser → **Enemies** → click a creature, then click to place it.', action: { kind: 'assetCat', cat: 'enemies' } },
        { text: 'For a bespoke foe choose **Custom (behavior)** and author its spec (health/speed/sight/size, flies, idle, on-sight, attack) — no code.' },
        { text: 'Tune the **Hit area (hurtbox)** in the Inspector if attacks feel like they miss.' }
      ] },
    { id: 'rec:rotate', title: 'Rotate or resize an object’s collision', syn: 'rotation angle turn collider hitbox hurtbox solid box',
      body: 'Any object can be rotated; props get a solid collision box, enemies/bosses a hit area.',
      steps: [
        { text: 'Select the object. In the Inspector set **Rotation°** (or press **[** / **]** in the viewport, Shift = fine).' },
        { text: 'For a prop, tick **Solid box** and set its **W/H + offset** (red outline). For an enemy/boss, tick **Custom hit area** (green outline) to resize where attacks land.' }
      ] },
    { id: 'rec:music', title: 'Change the music / soundtrack', syn: 'song audio score soundtrack mood track',
      body: 'Each level can pick a **Score** track, or you can trigger a music mood by zone.',
      steps: [
        { text: 'Deselect to show **Level settings**; set the **Music (Score)** field (a specific theme, or Auto-by-biome).' },
        { text: 'For a mid-room change, Markers → place an **Audio zone** set to **music** mood.', action: { kind: 'place', cat: 'markers', id: 'audio', label: 'Audio zone' } }
      ] },
    { id: 'rec:secret', title: 'Make a hidden/secret passage', syn: 'breakable wall break secret reveal',
      body: 'A **breakable wall** hides a passage until you nail it open.',
      steps: [
        { text: 'Dynamic → place a **Breakable wall** over the opening; set **Hits to break**.', action: { kind: 'place', cat: 'dynamic', id: 'breakable', label: 'Breakable wall' } },
        { text: 'Optionally set a **Flag** so it stays broken after you leave.' }
      ] },
    { id: 'rec:terrain', title: 'Paint terrain (ground, platforms, spikes)', syn: 'tile solid oneway block brush ground floor wall',
      body: 'Use the toolbar tile tools to paint terrain straight into the viewport.',
      steps: [
        { text: 'Toolbar: pick **Solid** (1‑5 keys also work), **One-way**, **Spikes**, or **Erase**; choose a **Brush shape** (pencil/line/rect/fill) and **size**.' },
        { text: 'Pick a **terrain material** in the toolbar; **⊞ Auto** auto-tiles edges. Paint by dragging in the scene.', action: { kind: 'tab', tab: 'scene' } }
      ] },
    { id: 'rec:save', title: 'Add a save point / bench', syn: 'rest checkpoint bench',
      body: 'A **bench** lets the player rest (heal) and saves the game.',
      steps: [{ text: 'Props → place a **Bench (rest & save)**.', action: { kind: 'place', cat: 'props', id: 'bench', label: 'Bench' } }] },
    { id: 'rec:cutscene', title: 'Play a cutscene', syn: 'cinematic trigger zone intro',
      body: 'Build a cutscene in the **Cutscene** tab, then trigger it in a room.',
      steps: [
        { text: 'Open the **Cutscene** tab and author your timeline.', action: { kind: 'tab', tab: 'cutscene' } },
        { text: 'In the Scene, Markers → place a **Cutscene trigger** zone and pick your cutscene.', action: { kind: 'place', cat: 'markers', id: 'cutsceneTrigger', label: 'Cutscene trigger' } }
      ] },
    { id: 'rec:logic', title: 'Use the Logic graph (visual scripting)', syn: 'trigger event condition action signal flag script node',
      body: 'The **Logic** tab wires events → conditions → actions (set flags, set-active, weather, signals…).',
      steps: [
        { text: 'Open the **Logic** tab; drag from the palette to add **event / condition / action** nodes and link them.', action: { kind: 'tab', tab: 'logic' } },
        { text: 'Reference an object by its **id** (Inspector shows it) in a Set-active action or trigger. See the **Guide** for every node.', action: { kind: 'guide' } }
      ] },
    { id: 'rec:charm-pickup', title: 'Place a charm to find', syn: 'charm pickup equip notch collect',
      body: 'Drop a **charm pickup** the player can collect, then equip at a bench.',
      steps: [
        { text: 'Props → place a **Charm pickup**.', action: { kind: 'place', cat: 'props', id: 'charmPickup', label: 'Charm pickup' } },
        { text: 'In the Inspector choose **which charm** it grants.', action: { kind: 'highlight', field: 'charm' } }
      ] },
    { id: 'rec:vendor', title: 'Add a charm shop (vendor)', syn: 'shop buy glimmer merchant charm',
      body: 'A **vendor** sells charms for Glimmer.',
      steps: [{ text: 'Props → place a **Vendor (charm shop)**.', action: { kind: 'place', cat: 'props', id: 'vendor', label: 'Vendor' } }] },
    { id: 'rec:nailsmith', title: 'Upgrade the nail (nailsmith)', syn: 'forge damage glimmer weapon stronger smith',
      body: 'A **nailsmith** forges a stronger nail for Glimmer.',
      steps: [{ text: 'Props → place a **Nailsmith (forge)**.', action: { kind: 'place', cat: 'props', id: 'smith', label: 'Nailsmith' } }] },
    { id: 'rec:spellwell', title: 'Add a soul well (learn / attune spells)', syn: 'spell tree ember frost gale bolt upgrade learn well soul',
      body: 'A **soul well** opens the spell tree — learn/empower spells and **attune** the bolt to Ember / Frost / Gale.',
      steps: [
        { text: 'Props → place a **Soul well**.', action: { kind: 'place', cat: 'props', id: 'spellwell', label: 'Soul well' } },
        { text: 'In play, commune at it: confirm a learned element (Ember/Frost/Gale) to switch the bolt to it.' }
      ] },
    { id: 'rec:setactive', title: 'Turn objects on/off with a trigger', syn: 'set active enable disable hide show appear toggle id',
      body: 'A **set-active trigger** flips chosen objects on/off when entered (referenced by their **id**).',
      steps: [
        { text: 'Markers → place a **Set-active trigger** zone.', action: { kind: 'place', cat: 'markers', id: 'setActiveTrigger', label: 'Set-active trigger' } },
        { text: 'In the Inspector add **targets** (pick objects by id with the ⌖ button) and set each to on/off. Inactive objects start hidden until flipped.' }
      ] },
    { id: 'rec:texttrigger', title: 'Pop up a message when the player walks by', syn: 'text trigger zone hint lore tutorial note',
      body: 'A **text trigger** is an invisible zone that shows text when entered.',
      steps: [
        { text: 'Props/Markers → place a **Text trigger zone**.', action: { kind: 'place', cat: 'props', id: 'textTrigger', label: 'Text trigger' } },
        { text: 'Set its **Text** and size, and **Only once** if it should fire a single time.', action: { kind: 'highlight', field: 'Text' } }
      ] },
    { id: 'rec:audio', title: 'Add ambient sound / reverb / a music mood', syn: 'audio zone sound reverb music emitter ambient sfx mood',
      body: 'An **Audio zone** can be an ambient emitter, a reverb zone, or a music-mood trigger.',
      steps: [
        { text: 'Markers → place an **Audio zone**.', action: { kind: 'place', cat: 'markers', id: 'audio', label: 'Audio zone' } },
        { text: 'Pick the **mode** (emitter / reverb / music) and its settings in the Inspector.', action: { kind: 'highlight', field: 'mode' } }
      ] },
    { id: 'rec:water', title: 'Add reflective water', syn: 'water reflection mirror wet pool surface ice freeze',
      body: 'Reflective water is a **per-level** surface that mirrors the scene (and freezes to ice in snow/blizzard).',
      steps: [
        { text: 'Deselect to show **Level settings**; enable **Water** and set its **Y** (surface height), strength and ripple.', action: { kind: 'highlight', field: 'Water' } },
        { text: 'Tip: in a snow/blizzard weather it becomes mirror-ice automatically.' }
      ] },
    { id: 'rec:building', title: 'Generate a building / house', syn: 'building house manor tower procedural generate walls floors furniture',
      body: 'The **Build** category stamps a procedural multi-storey building (walls + floors + furniture).',
      steps: [
        { text: 'Asset browser → **Build** → pick a size (House / Manor) and click to stamp it.', action: { kind: 'assetCat', cat: 'build' } },
        { text: 'Also here: tileable **wall backdrop** panels.' }
      ] },
    { id: 'rec:model', title: 'Build & place a custom model', syn: 'model rig animate primitives parts character mymodels',
      body: 'Build characters/props from primitives in the **Models** tab, then place them.',
      steps: [
        { text: 'Open the **Models** tab; add parts, parent them into a rig, and author idle/walk clips (🦴 Auto-rig builds a humanoid skeleton).', action: { kind: 'tab', tab: 'models' } },
        { text: 'Back in Scene, place it from **Props → Model** (it appears under the **My Models** asset tab).', action: { kind: 'assetCat', cat: 'mymodels' } }
      ] },
    { id: 'rec:prefab', title: 'Save & reuse a group of objects (prefab)', syn: 'prefab group cluster reuse stamp nest template',
      body: 'Select several objects and save them as a **prefab** to stamp again later.',
      steps: [
        { text: 'Marquee-drag (or Shift-click) to select multiple objects, then press **Ctrl+G** to save a prefab.' },
        { text: 'Find it in the **Prefabs** asset tab and click to stamp. ⊕ on a prefab card nests another inside it.', action: { kind: 'assetCat', cat: 'prefabs' } }
      ] },
    { id: 'rec:scatter', title: 'Scatter lots of decor quickly', syn: 'scatter brush decor cluster random trees plants foliage',
      body: 'The **⁂ Scatter** toolbar toggle stamps a randomized cluster when you place decor.',
      steps: [
        { text: 'Turn on **⁂ Scatter** in the toolbar, open the **Decor** assets, pick a piece, and click to drop a randomized cluster.', action: { kind: 'assetCat', cat: 'decor' } }
      ] },
    { id: 'rec:trap', title: 'Add a trap (spikes, crusher, conveyor, wind, collapsing floor)', syn: 'trap spikes crusher conveyor wind current collapsing floor fall hazard moving',
      body: 'The **Dynamic** category has timed/interactive traps and movers.',
      steps: [
        { text: 'Asset browser → **Dynamic**: Timed spikes, Crusher, Conveyor belt, Wind current, Collapsing floor.', action: { kind: 'assetCat', cat: 'dynamic' } },
        { text: 'Place one, then set its timing/size/force in the Inspector.' }
      ] },
    { id: 'rec:play', title: 'Test / play your level', syn: 'play test run preview hot reload start debug',
      body: 'Play right inside the editor and hot-reload edits.',
      steps: [
        { text: 'Click **▶ Play here** (top toolbar) to play this room; **▶ From Start** plays from the title.' },
        { text: 'In the play overlay, **↻ Reload** applies your latest edits in place; **F4** opens a live entity inspector.' }
      ] },
    { id: 'rec:savework', title: 'Save your work', syn: 'save export write github local persist',
      body: 'Save all levels to local files or GitHub.',
      steps: [
        { text: 'Press **Ctrl+S** or **💾 Save**. Use **→ …** to choose where Save writes (local files vs GitHub).' }
      ] },
    { id: 'rec:newlevel', title: 'Create / open / duplicate a level', syn: 'new level room create scene biome size duplicate delete open',
      body: 'Manage rooms in the **Levels** left-panel tab.',
      steps: [
        { text: 'Left panel → **Levels** tab → New (pick a size + biome), or open/duplicate/delete an existing room.' },
        { text: 'Arrange the world layout by dragging rooms in the **Map** tab.', action: { kind: 'tab', tab: 'map' } }
      ] }
  ];

  C.init = function () { if (!document.getElementById('cpBtn')) build(); };
  // headless-test / programmatic API
  C.search = q => { if (!built) buildKB(); return search(q).slice(0, 6).map(r => ({ title: r.e.title, score: +r.s.toFixed(2), kind: r.e.kind, id: r.e.id })); };
  C.kbSize = () => { if (!built) buildKB(); return kb.length; };
  C.open = v => setOpen(v !== false);
  C.ask = q => { if (!logEl) build(); answer(q); };
  C.issueCount = () => quickIssueCount();
  C.walkFields = () => walkFields();
  C.refreshBadge = () => { updateBadge(); return badge ? badge.style.display : 'none'; };
  // editor.js boots synchronously before us; init now (DOM + #toolbar already exist)
  if (document.readyState !== 'loading') C.init(); else document.addEventListener('DOMContentLoaded', C.init);
})();
