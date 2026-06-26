// MOSSVEIL — quests.js : lightweight quest log + objective tracking.
// A quest is { id, title, objective, doneFlag?, target?:{room,x,y} }. State lives in
// G.save.quests[id] = {...def, state:'active'|'done'}. Dialogue choices start/complete them;
// a quest with a doneFlag auto-completes when that flag is set.
//
// Quests can also be authored centrally in a registry (data/quests.js -> G.QUESTS_DATA, edited by
// the Quest editor). When a quest is started, its registry entry fills in / overrides the canonical
// title, objective, doneFlag and target — so you can define a quest once and just reference its id
// from dialogue. With an empty registry the behaviour is identical to before.
(function () {
  const Q = G.Quests = {};
  function store() { G.save.quests = G.save.quests || {}; return G.save.quests; }

  // ---- central registry (overlay) ----
  const DEF_LIST = [];          // no quests are defined in code; the registry is authored in the editor
  let DEFS = {};                // id -> def
  Q.applyData = (d) => { DEFS = {}; ((d && d.list) || DEF_LIST).forEach(q => { if (q && q.id) DEFS[q.id] = q; }); };
  Q.applyData(G.QUESTS_DATA);
  Q.def = (id) => DEFS[id] || null;
  Q.list = () => Object.keys(DEFS).map(k => DEFS[k]);
  Q.exportDefaults = () => ({ list: DEF_LIST.map(q => JSON.parse(JSON.stringify(q))) });
  Q.exportCurrent = () => ({ list: Q.list().map(q => JSON.parse(JSON.stringify(q))) });

  Q.start = (q) => {
    if (!q) return;
    const base = (typeof q === 'string') ? { id: q } : q;
    if (!base.id) return;
    const def = Object.assign({}, base, DEFS[base.id] || {});   // registry is canonical; fills gaps & overrides
    if (!def.title) def.title = def.id;
    const s = store();
    if (s[def.id] && s[def.id].state === 'done') return;        // don't re-open a finished quest
    if (s[def.id] && s[def.id].state === 'active') return;
    s[def.id] = Object.assign({}, def, { state: 'active' });
    if (G.Main && G.Main.persist) G.Main.persist();
    if (G.UI && G.UI.toast) G.UI.toast('New quest — ' + (def.title || def.id));
    if (G.Audio && G.Audio.sfx) G.Audio.sfx('uiBell');
  };
  Q.complete = (id) => {
    const s = store(); if (!s[id] || s[id].state === 'done') return;
    s[id].state = 'done';
    if (G.Main && G.Main.persist) G.Main.persist();
    if (G.UI && G.UI.toast) G.UI.toast('Quest complete — ' + (s[id].title || id));
    if (G.Audio && G.Audio.sfx) G.Audio.sfx('heal');
    if (G.Audio && G.Audio.stinger) G.Audio.stinger('item');
  };
  Q.active = () => Object.keys(store()).map(k => store()[k]).filter(q => q.state === 'active');
  Q.all = () => Object.keys(store()).map(k => store()[k]);
  Q.tracked = () => { const a = Q.active(); return a.length ? a[a.length - 1] : null; };
  Q.update = () => {
    const s = store(), f = G.save.flags || {};
    for (const id in s) if (s[id].state === 'active' && s[id].doneFlag && f[s[id].doneFlag]) Q.complete(id);
  };
})();
