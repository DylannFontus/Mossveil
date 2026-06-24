// MOSSVEIL — quests.js : lightweight quest log + objective tracking.
// A quest is { id, title, objective, doneFlag?, target?:{room,x,y} }. State lives in
// G.save.quests[id] = {...def, state:'active'|'done'}. Dialogue choices start/complete them;
// a quest with a doneFlag auto-completes when that flag is set.
(function () {
  const Q = G.Quests = {};
  function store() { G.save.quests = G.save.quests || {}; return G.save.quests; }

  Q.start = (q) => {
    if (!q) return;
    const def = (typeof q === 'string') ? { id: q, title: q } : q;
    if (!def.id) return;
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
