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
    openInTool: () => T.openTool('mods')
  };

  let bodyEl = null, api = null, sel = null, view = 'mods';
  function el(t, a, p, x) { return api.el(t, a, p, x); }

  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column;height:100%';
    const tabs = el('div', { style: 'display:flex;gap:6px;padding:8px 12px;border-bottom:1px solid var(--line)' }, bodyEl);
    [['mods', '🧩 Mods'], ['ref', '📖 API reference']].forEach(([id, label]) => { const b = el('button', { class: 'tbtn' + (view === id ? ' on' : '') }, tabs, label); b.addEventListener('click', () => { view = id; render(); }); });
    if (view === 'ref') return renderRef();
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
    el('div', { class: 'tc-mut', style: 'font-size:11px;margin-top:6px' }, right, 'Changes save automatically and take effect on the next ▶ Play here.');
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
