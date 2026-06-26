// MOSSVEIL — achievements.js : achievements / trophies (G.Achievements).
// Declarative achievements whose conditions are evaluated against the save (G.save) — read-only, so
// no gameplay risk. check() is called at save time (Main.persist) and pops a toast for each newly
// earned one, recording it in G.save.achievements. Authored by the in-editor Achievements editor;
// overlay is data/achievements.js (G.ACHIEVEMENTS_DATA). Built-ins are the fallback.
(function () {
  const A = G.Achievements = {};
  const clone = o => JSON.parse(JSON.stringify(o));
  const DEFAULTS = {
    list: [
      { id: 'firstBoss', name: 'First Felled', desc: 'Defeat your first boss.', cond: { type: 'bossCount', n: 1 } },
      { id: 'charmHunter', name: 'Charm Hunter', desc: 'Own three charms.', cond: { type: 'charmCount', n: 3 } },
      { id: 'attuned', name: 'Attuned', desc: 'Learn a bolt element.', cond: { type: 'anySpell', ids: ['ember', 'frost', 'gale'] } },
      { id: 'glittering', name: 'Glittering', desc: 'Hold 500 Glimmer at once.', cond: { type: 'glimmer', n: 500 } },
      { id: 'allCharms', name: 'Charmed Life', desc: 'Collect every charm.', cond: { type: 'allCharms' } }
    ]
  };
  let LIST = [];
  function normAch(a) { return { id: String(a.id), name: a.name || a.id, desc: a.desc || '', cond: a.cond || { type: 'glimmer', n: 0 } }; }
  function applyData(data) {
    const d = data || G.ACHIEVEMENTS_DATA || null;
    LIST = ((d && d.list && d.list.length) ? d.list : DEFAULTS.list).map(normAch);
    A.LIST = LIST;
  }
  A.applyData = applyData;
  A.exportDefaults = () => clone(DEFAULTS);
  A.exportCurrent = () => ({ list: clone(LIST) });

  function bossKills(s) { let n = 0; if (s.bosses) for (const k in s.bosses) if (s.bosses[k]) n++; return n; }
  const CONDS = {
    bossCount: (c, s) => bossKills(s) >= (c.n || 1),
    boss: (c, s) => !!(s.bosses && Object.keys(s.bosses).some(k => s.bosses[k] && (k === c.id || k.endsWith(':' + c.id)))),
    charmCount: (c, s) => ((s.charmsOwned || []).length) >= (c.n || 1),
    charm: (c, s) => (s.charmsOwned || []).indexOf(c.id) >= 0,
    allCharms: (c, s) => !!(G.Charms && (s.charmsOwned || []).length >= G.Charms.LIST.length),
    spell: (c, s) => !!(s.spells && (s.spells[c.id] || 0) >= 1),
    anySpell: (c, s) => !!(s.spells && (c.ids || []).some(id => (s.spells[id] || 0) >= 1)),
    glimmer: (c, s) => (s.glimmer || 0) >= (c.n || 0),
    nail: (c, s) => (s.nailLevel || 0) >= (c.n || 0)
  };
  A.CONDS = Object.keys(CONDS);
  function evalCond(c, s) { const f = CONDS[c && c.type]; try { return f ? !!f(c, s) : false; } catch (_) { return false; } }
  A.evalCond = (c, s) => evalCond(c, s || G.save || {});
  A.isUnlocked = id => !!(G.save && G.save.achievements && G.save.achievements[id]);
  // evaluate every achievement; record + announce any newly earned
  A.check = () => {
    if (!G.save) return [];
    G.save.achievements = G.save.achievements || {};
    const newly = [];
    for (const a of LIST) if (!G.save.achievements[a.id] && evalCond(a.cond, G.save)) { G.save.achievements[a.id] = Date.now(); newly.push(a); }
    for (const a of newly) { if (G.UI && G.UI.toast) G.UI.toast('🏆 ' + a.name); if (G.Audio && G.Audio.stinger) G.Audio.stinger('item'); }
    return newly;
  };
  A.status = () => LIST.map(a => ({ id: a.id, name: a.name, desc: a.desc, unlocked: A.isUnlocked(a.id), met: evalCond(a.cond, G.save || {}) }));
  applyData();
})();
