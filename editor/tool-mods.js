// MOSSVEIL — tool-mods.js : Mods manager + API reference (Edit ▸ Tools).  Roadmap #98.
// A front-end for the mod API (src/mods.js -> G.Mods). Stores external mods (a bit of JS that calls
// G.Mods.register) in localStorage, shared same-origin with the game, so they load on the next playtest
// boot; you can add / enable / disable / remove them and drop in a starter template. It also generates a
// live REFERENCE of the moddable surface — the G.Mods api, the data overlays you can patch (every
// G.*_DATA global), and the content registries — so a modder knows what they can touch. Editor-only.
(function () {
  const T = G.Tools, M = G.Mods;
  if (!T || !M) return;

  const TEMPLATE = "// A MOSSVEIL mod. It runs on boot, before the first room loads.\n" +
    "G.Mods.register({\n" +
    "  id: 'my-mod',\n" +
    "  name: 'My Mod',\n" +
    "  version: '1.0.0',\n" +
    "  apply: function (api) {\n" +
    "    // add or override a level:\n" +
    "    // api.addLevel('my_room', { title: 'My Room', w: 30, h: 18, biome: 'gloom', tiles: [] });\n" +
    "    // patch a data overlay, then re-apply its module:\n" +
    "    // api.patch('TUTORIAL_DATA', { enabled: false }); api.reapply('Tutorial');\n" +
    "    // run something once the game is ready:\n" +
    "    api.on('ready', function () { api.log('my-mod ready'); });\n" +
    "    // full power: api.G is the game global.\n" +
    "  }\n" +
    "});\n";

  // ---- cookbook: worked, runnable example mods (the learning ramp for the API) ----
  const COOKBOOK = [
    {
      id: 'add-room', title: 'Add a secret room', cat: 'Levels',
      desc: 'Author a brand-new level from a mod with api.addLevel — walls, a spawn and a bench.',
      code: `// Adds a hidden room to the world (placeable target for a transition you wire in the editor).
G.Mods.register({
  id: 'secret-room', name: 'Secret Room',
  apply: function (api) {
    var tiles = [];
    for (var r = 0; r < 14; r++) { var s = '';
      for (var c = 0; c < 24; c++) s += (r < 1 || r >= 12 || c < 1 || c >= 23) ? '#' : ' ';
      tiles.push(s); }
    api.addLevel('mod_vault', {
      id: 'mod_vault', title: 'Hidden Vault', biome: 'gloom', w: 24, h: 14,
      mapPos: { mx: 990, my: 0 }, tiles: tiles,
      spawns: { P: { x: 4, y: 3.5 } },
      props: [{ type: 'bench', x: 12, y: 3 }, { type: 'lamp', x: 6, y: 3 }],
      enemies: [], transitions: []
    });
  }
});`
    },
    {
      id: 'add-charm', title: 'Add a new charm', cat: 'Content',
      desc: 'Append a charm to G.CHARMS.list and re-apply the Charms module so it shows up in the shop.',
      code: `// Adds a custom charm. Effects keys mirror the built-ins (hp, nail, soul…).
G.Mods.register({
  id: 'charm-swiftness', name: 'Swiftness Charm',
  apply: function (api) {
    api.G.CHARMS.list.push({
      id: 'swiftness', name: 'Swiftness', cost: 2,
      desc: 'A lighter step — move a touch faster.', effects: { speed: 1 }
    });
    api.reapply('Charms');   // re-read the overlay so the new charm registers
  }
});`
    },
    {
      id: 'skip-tutorial', title: 'Skip the tutorial', cat: 'Tuning',
      desc: 'Patch a data overlay (TUTORIAL_DATA) and re-apply its module — the pattern for any *_DATA global.',
      code: `// Turns the contextual tutorial hints off for this build.
G.Mods.register({
  id: 'no-tutorial', name: 'Skip Tutorial',
  apply: function (api) {
    api.patch('TUTORIAL_DATA', { enabled: false });
    api.reapply('Tutorial');
  }
});`
    },
    {
      id: 'ready-banner', title: 'Welcome banner on boot', cat: 'Lifecycle',
      desc: 'Hook the "ready" lifecycle event to run code once the game is up — here, a HUD banner.',
      code: `// Shows a one-off banner when the game finishes booting.
G.Mods.register({
  id: 'welcome', name: 'Welcome Banner',
  apply: function (api) {
    api.on('ready', function () {
      if (api.G.UI && api.G.UI.banner) api.G.UI.banner('Modded build loaded ✦');
      api.log('welcome mod ready');
    });
  }
});`
    },
    {
      id: 'remove-room', title: 'Remove a room', cat: 'Levels',
      desc: 'Strip a level out of the build with api.removeLevel (change the id to one of yours).',
      code: `// Removes a room by id. Check Edit ▸ Tools ▸ Search everything for the exact id.
G.Mods.register({
  id: 'trim-build', name: 'Trim Build',
  apply: function (api) {
    api.removeLevel('some_room_id');
  }
});`
    }
  ];

  // ---- sandbox: a safe DRY RUN. Compiles the code, captures the registered mod, runs apply() against a
  // mock api whose calls are recorded (never persisted) and whose api.G clones the mutable registries, so
  // a test can never alter the real project. Returns { ok, error, registered[], actions[], events[] }.
  const MUT = new Set(['LEVELS', 'CUTSCENES', 'CHARMS', 'ENEMY_LIB']);
  function dryRun(code) {
    const report = { ok: false, error: '', registered: [], actions: [], events: [] };
    let fn;
    try { fn = new Function('G', code || ''); } catch (e) { report.error = 'Syntax error: ' + e.message; return report; }
    const captured = [];
    const sandboxMods = Object.assign({}, G.Mods, { register(mod) { if (mod && mod.id != null && typeof mod.apply === 'function') { captured.push(mod); return true; } return false; } });
    const handler = {
      get(t, k) { if (k === 'Mods') return sandboxMods; if (MUT.has(k)) { try { return JSON.parse(JSON.stringify(t[k] || {})); } catch (_) { return {}; } } return t[k]; },
      set() { return true; }   // swallow direct top-level writes to G
    };
    const sandboxG = new Proxy(G, handler);
    try { fn(sandboxG); } catch (e) { report.error = 'Run error: ' + e.message; return report; }
    if (!captured.length) { report.error = 'No mod registered — did the code call G.Mods.register({ … })?'; return report; }
    const mockApi = {
      G: sandboxG,
      on(evt, f) { if (evt && typeof f === 'function') report.events.push(String(evt)); return this; },
      addLevel(id) { report.actions.push('addLevel("' + id + '")'); return true; },
      removeLevel(id) { report.actions.push('removeLevel("' + id + '")'); return true; },
      patch(global) { report.actions.push('patch(G.' + global + ')'); return true; },
      reapply(mod) { report.actions.push('reapply("' + mod + '")'); return true; },
      log() { }
    };
    for (const mod of captured) {
      report.registered.push({ id: String(mod.id), name: mod.name || String(mod.id) });
      try { mod.apply(mockApi); } catch (e) { report.error = 'apply("' + mod.id + '") threw: ' + e.message; return report; }
    }
    report.ok = true;
    return report;
  }

  // ---- moddable surface, generated live from the game globals ----
  function surface() {
    const data = Object.keys(G).filter(k => /_DATA$|^CHARMS$|^LEVELS$|^CUTSCENES$/.test(k)).sort();
    const registries = [];
    if (G.LEVELS) registries.push({ name: 'G.LEVELS', detail: Object.keys(G.LEVELS).length + ' levels' });
    if (G.Charms && G.Charms.LIST) registries.push({ name: 'G.Charms.LIST', detail: G.Charms.LIST.length + ' charms' });
    if (G.Enemies && G.Enemies.LIB) registries.push({ name: 'G.Enemies.LIB', detail: Object.keys(G.Enemies.LIB).length + ' enemy types' });
    if (G.Bosses && G.Bosses.exportBossCurrent) { try { registries.push({ name: 'G.Bosses', detail: Object.keys(G.Bosses.exportBossCurrent().configs || {}).length + ' bosses' }); } catch (e) { } }
    if (G.CUTSCENES) registries.push({ name: 'G.CUTSCENES', detail: Object.keys(G.CUTSCENES).length + ' cutscenes' });
    const api = [
      'api.addLevel(id, def) — add or override a level',
      'api.removeLevel(id) — remove a level',
      "api.patch(GLOBAL, obj) — deep-merge into a data overlay (e.g. 'CHARMS')",
      'api.reapply(Module) — re-run a module’s applyData (e.g. ‘Charms’)',
      "api.on(event, fn) — hook a lifecycle event ('ready')",
      'api.G — the game global, for anything else'
    ];
    return { data, registries, api };
  }

  const MT = T.mods = {
    stored: () => M.stored(),
    saveStored: list => M.saveStored(list),
    surface,
    template: () => TEMPLATE,
    uniqueId(base) { base = (base || 'mod').replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'mod'; const has = x => M.stored().some(m => m.id === x); let n = base, i = 1; while (has(n)) n = base + '-' + (++i); return n; },
    addMod(id, name, code) { const list = M.stored(); const mid = MT.uniqueId(id || 'mod'); list.push({ id: mid, name: name || mid, code: code || TEMPLATE, enabled: true }); M.saveStored(list); return mid; },
    setEnabled(id, on) { const list = M.stored(); const m = list.find(x => x.id === id); if (!m) return false; m.enabled = !!on; M.saveStored(list); return true; },
    setCode(id, code) { const list = M.stored(); const m = list.find(x => x.id === id); if (!m) return false; m.code = code; M.saveStored(list); return true; },
    removeMod(id) { const list = M.stored().filter(x => x.id !== id); M.saveStored(list); return true; },
    cookbook: () => COOKBOOK.slice(),
    dryRun,
    addExample(exId) { const ex = COOKBOOK.find(e => e.id === exId); if (!ex) return null; return MT.addMod(ex.id, ex.title, ex.code); },
    openInTool: () => T.openTool('mods')
  };

  let bodyEl = null, api = null, sel = null, view = 'mods';
  function el(t, a, p, x) { return api.el(t, a, p, x); }

  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column;height:100%';
    const tabs = el('div', { style: 'display:flex;gap:6px;padding:8px 12px;border-bottom:1px solid var(--line)' }, bodyEl);
    [['mods', '🔌 Mods'], ['cook', '📖 Cookbook'], ['ref', '📑 API reference']].forEach(([id, label]) => { const b = el('button', { class: 'tbtn' + (view === id ? ' on' : '') }, tabs, label); b.addEventListener('click', () => { view = id; render(); }); });
    if (view === 'ref') return renderRef();
    if (view === 'cook') return renderCookbook();
    renderMods();
  }

  function renderMods() {
    const mods = MT.stored();
    el('div', { class: 'tc-mut', style: 'padding:10px 14px 0;font-size:12px;line-height:1.45' }, bodyEl,
      'External mods (a little JS that calls G.Mods.register) load on the next playtest boot, before the first room. They are stored locally in this browser.');
    const grid = el('div', { style: 'flex:1;display:grid;grid-template-columns:200px 1fr;gap:0;min-height:0;margin-top:8px' }, bodyEl);
    const left = el('div', { style: 'display:flex;flex-direction:column;border-right:1px solid var(--line);min-height:0' }, grid);
    const list = el('div', { style: 'flex:1;overflow:auto;padding:8px' }, left);
    if (!mods.length) el('div', { class: 'tc-mut', style: 'padding:10px;font-size:12px' }, list, 'No mods yet.');
    mods.forEach(m => {
      const row = el('div', { class: 'tc-pal-item' + (sel === m.id ? ' sel' : ''), style: 'padding:5px 8px;align-items:center;gap:6px' }, list);
      el('span', { style: 'flex:1;font-size:12px;opacity:' + (m.enabled ? '1' : '0.5') }, row, '🧩 ' + m.name);
      el('span', { class: 'tc-pill ' + (m.enabled ? 'done' : 'skip'), style: 'font-size:9px' }, row, m.enabled ? 'on' : 'off');
      row.addEventListener('click', () => { sel = m.id; render(); });
    });
    const btns = el('div', { style: 'display:flex;gap:4px;padding:8px;border-top:1px solid var(--line)' }, left);
    el('button', { class: 'tbtn', onclick: () => { sel = MT.addMod('mod', 'New Mod', MT.template()); render(); } }, btns, '+ New');
    el('button', { class: 'tbtn', onclick: () => { if (sel) { MT.removeMod(sel); sel = null; render(); } } }, btns, '🗑');

    const right = el('div', { style: 'overflow:auto;padding:12px 14px;min-height:0' }, grid);
    const m = mods.find(x => x.id === sel);
    if (!m) { el('div', { class: 'tc-mut' }, right, 'Select a mod, or add one. See the API reference tab for what mods can do.'); return; }
    const rN = el('div', { class: 'tc-row' }, right); el('label', {}, rN, 'Name'); const nInp = el('input', { type: 'text' }, rN); nInp.value = m.name;
    nInp.addEventListener('change', () => { const list = MT.stored(); const x = list.find(y => y.id === m.id); if (x) { x.name = nInp.value; MT.saveStored(list); } render(); });
    const en = el('label', { style: 'display:flex;align-items:center;gap:6px;margin:6px 0;font-size:12px' }, right); const cb = el('input', { type: 'checkbox' }, en); cb.checked = m.enabled; cb.addEventListener('change', () => { MT.setEnabled(m.id, cb.checked); render(); }); en.appendChild(document.createTextNode('enabled (loads on next playtest)'));
    el('div', { class: 'tc-mut', style: 'font-size:11px;margin:6px 0 2px' }, right, 'CODE');
    const ta = el('textarea', { spellcheck: 'false', style: 'width:100%;height:300px;background:var(--bg3);color:var(--txt);border:1px solid #45454d;border-radius:5px;padding:8px;font-family:monospace;font-size:12px;white-space:pre' }, right); ta.value = m.code || '';
    ta.addEventListener('change', () => MT.setCode(m.id, ta.value));

    // --- sandbox: dry-run the code safely (no persistence, no effect on the real project) ---
    const sbRow = el('div', { style: 'display:flex;align-items:center;gap:8px;margin-top:8px' }, right);
    const runBtn = el('button', { class: 'tbtn on', style: 'padding:5px 12px' }, sbRow, '▷ Dry-run test');
    el('span', { class: 'tc-mut', style: 'font-size:11px' }, sbRow, 'safe — simulates apply(), nothing is saved or changed');
    const out = el('div', { style: 'margin-top:7px;border:1px solid var(--line);border-radius:6px;padding:9px 11px;font-family:monospace;font-size:11px;line-height:1.5;display:none' }, right);
    runBtn.addEventListener('click', () => {
      const rep = dryRun(ta.value);
      out.style.display = 'block'; out.innerHTML = '';
      if (rep.error) { out.style.borderColor = '#7a2e3e'; el('div', { style: 'color:#ff8f7a' }, out, '✕ ' + rep.error); return; }
      out.style.borderColor = '#1f4d2a';
      el('div', { style: 'color:#7fe0a0' }, out, '✓ ' + rep.registered.map(r => r.name + ' (' + r.id + ')').join(', '));
      if (rep.actions.length) { el('div', { style: 'color:var(--txt2);margin-top:4px' }, out, 'would call:'); rep.actions.forEach(a => el('div', { style: 'color:var(--txt)' }, out, '  · ' + a)); }
      if (rep.events.length) el('div', { style: 'color:var(--txt2);margin-top:4px' }, out, 'hooks: ' + rep.events.join(', '));
      if (!rep.actions.length && !rep.events.length) el('div', { class: 'tc-mut' }, out, 'registers cleanly (no api calls in apply).');
    });
    el('div', { class: 'tc-mut', style: 'font-size:11px;margin-top:8px' }, right, 'Changes save automatically and take effect on the next ▶ Play here.');
  }

  function renderCookbook() {
    const wrap = el('div', { style: 'flex:1;overflow:auto;padding:14px 16px;display:flex;flex-direction:column;gap:12px' }, bodyEl);
    el('div', { class: 'tc-mut', style: 'font-size:12px;line-height:1.5' }, wrap, 'Worked examples you can read, dry-run, and add as a mod with one click. Each is real, runnable code against the live API. After adding one, switch to the Mods tab to tweak and enable it.');
    MT.cookbook().forEach(ex => {
      const card = el('div', { style: 'border:1px solid var(--line);border-radius:8px;overflow:hidden' }, wrap);
      const hd = el('div', { style: 'display:flex;align-items:center;gap:8px;padding:9px 11px;background:var(--bg2)' }, card);
      el('span', { style: 'flex:1;color:var(--txt);font-size:13px' }, hd, ex.title);
      el('span', { class: 'tc-pill planned', style: 'font-size:9px' }, hd, ex.cat);
      const add = el('button', { class: 'tbtn on', style: 'padding:4px 10px;font-size:11px' }, hd, '+ Add as mod');
      add.addEventListener('click', () => { const id = MT.addExample(ex.id); sel = id; view = 'mods'; render(); api.toast('Added “' + ex.title + '” — edit & enable it in Mods'); });
      el('div', { class: 'tc-mut', style: 'padding:7px 11px 2px;font-size:11px' }, card, ex.desc);
      const pre = el('pre', { style: 'margin:6px 11px 11px;padding:9px;background:var(--bg3);border-radius:5px;overflow:auto;font-size:11px;line-height:1.45;color:var(--txt);max-height:220px' }, card);
      pre.textContent = ex.code;
    });
  }

  function renderRef() {
    const s = surface();
    const wrap = el('div', { style: 'flex:1;overflow:auto;padding:14px 16px;display:flex;flex-direction:column;gap:12px' }, bodyEl);
    el('div', { class: 'tc-mut', style: 'font-size:12px;line-height:1.45' }, wrap, 'What a mod’s apply(api) can do, and the live content it can reach.');
    el('div', { style: 'font-size:12px;font-weight:600' }, wrap, 'api');
    const al = el('div', { style: 'display:flex;flex-direction:column;gap:3px' }, wrap);
    s.api.forEach(line => el('div', { style: 'font-family:monospace;font-size:11px;color:var(--txt2)' }, al, line));
    el('div', { style: 'font-size:12px;font-weight:600;margin-top:6px' }, wrap, 'Data overlays you can patch (' + s.data.length + ')');
    const dl = el('div', { style: 'display:flex;flex-wrap:wrap;gap:4px' }, wrap);
    s.data.forEach(d => el('span', { class: 'tc-pill', style: 'font-size:10px' }, dl, 'G.' + d));
    el('div', { style: 'font-size:12px;font-weight:600;margin-top:6px' }, wrap, 'Content registries');
    const rl = el('div', { style: 'display:flex;flex-direction:column;gap:3px' }, wrap);
    s.registries.forEach(r => { const row = el('div', { style: 'font-size:12px;color:var(--txt2)' }, rl); el('b', { style: 'color:var(--txt);font-family:monospace' }, row, r.name); row.appendChild(document.createTextNode('  —  ' + r.detail)); });
  }

  T.registerTool({
    id: 'mods', label: 'Mods & API', icon: '🔌', group: 'Tools',
    sub: 'load external mods · moddable-surface reference',
    build(host, a) { api = a; bodyEl = host; render(); }
  });
  if (T.roadmapDone) T.roadmapDone(98);
})();
