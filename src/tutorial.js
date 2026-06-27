// MOSSVEIL — tutorial.js : contextual first-time HINTS (G.Tutorial). A small declarative list of hints,
// each with a trigger evaluated against the live game during play; the FIRST time a trigger is met the
// hint is shown once (via the existing G.UI.banner) and remembered in the save (G.save.tutorialSeen), so
// it never repeats. Read-only over the game state — no gameplay effect beyond a banner. Authored by the
// in-editor Tutorial editor; overlay is data/tutorial.js (G.TUTORIAL_DATA). Built-ins are the fallback.
(function () {
  const Tu = G.Tutorial = {};
  const clone = o => JSON.parse(JSON.stringify(o));
  const num = (v, lo, hi, d) => { v = +v; if (!isFinite(v)) v = d; return Math.max(lo, Math.min(hi, v)); };
  const PLACES = ['top', 'center', 'bottom'];

  const DEFAULTS = {
    enabled: true,
    hints: [
      { id: 'move', trigger: { type: 'roomEnter' }, text: 'Arrows or WASD to move · Space to jump', place: 'bottom', secs: 4.5 },
      { id: 'attack', trigger: { type: 'enemyNear', dist: 9 }, text: 'Press Z or J to strike with your nail', place: 'bottom', secs: 4 },
      { id: 'lever', trigger: { type: 'propNear', prop: 'lever', dist: 2.5 }, text: 'Press E or ↑ to pull a lever', place: 'bottom', secs: 4 },
      { id: 'bench', trigger: { type: 'propNear', prop: 'bench', dist: 2.5 }, text: 'Rest at a bench to save and refill', place: 'bottom', secs: 4 },
      { id: 'spellwell', trigger: { type: 'propNear', prop: 'spellwell', dist: 2.5 }, text: 'Commune at a soul well to learn spells', place: 'bottom', secs: 4 },
      { id: 'lowHp', trigger: { type: 'hpBelow', n: 2 }, text: 'Hold the focus key to mend with soul', place: 'bottom', secs: 4 },
      { id: 'wings', trigger: { type: 'abilityGained', ability: 'wings' }, text: 'Wings gained — press jump again to flutter', place: 'center', secs: 4 }
    ]
  };

  // ---- trigger registry: each reads the live game (player / room / save), never mutates ----
  function nearProp(type, d) {
    const r = G.room, p = G.player; if (!r || !r.entities || !p) return false;
    for (const e of r.entities) if (e && e.type === type && e.x != null && Math.abs(e.x - p.body.x) < d && Math.abs(e.y - p.body.y) < d + 1.5) return true;
    return false;
  }
  function enemyWithin(d) {
    const r = G.room, p = G.player; if (!r || !r.entities || !p) return false;
    for (const e of r.entities) if (e && e.isEnemy && e.alive && e.body && Math.abs(e.body.x - p.body.x) < d && Math.abs(e.body.y - p.body.y) < d) return true;
    return false;
  }
  function hasAbility(a) { const s = G.save || {}; if (a === 'wings') return !!s.wings; return !!(s.spells && (s.spells[a] || 0) >= 1); }
  const TRIG = {
    roomEnter: () => true,
    propNear: t => nearProp(t.prop || 'lever', t.dist || 2.5),
    enemyNear: t => enemyWithin(t.dist || 9),
    hpBelow: t => !!(G.player && G.player.hp < (t.n || 2)),
    abilityGained: t => hasAbility(t.ability || 'wings')
  };
  Tu.TRIGS = Object.keys(TRIG);

  function normTrig(t) {
    t = t || {}; const type = TRIG[t.type] ? t.type : 'roomEnter'; const o = { type };
    if (type === 'propNear') { o.prop = String(t.prop || 'lever'); o.dist = num(t.dist, 0.5, 20, 2.5); }
    else if (type === 'enemyNear') { o.dist = num(t.dist, 1, 40, 9); }
    else if (type === 'hpBelow') { o.n = num(t.n, 1, 20, 2); }
    else if (type === 'abilityGained') { o.ability = String(t.ability || 'wings'); }
    return o;
  }
  function normHint(h) {
    h = h || {};
    return { id: String(h.id || 'hint'), trigger: normTrig(h.trigger), text: String(h.text || ''), place: PLACES.indexOf(h.place) >= 0 ? h.place : 'bottom', secs: num(h.secs, 0.5, 20, 4) };
  }

  let LIST = [], ENABLED = true;
  function applyData(data) {
    const d = data || G.TUTORIAL_DATA || null;
    ENABLED = d ? (d.enabled !== false) : true;
    LIST = ((d && d.hints && d.hints.length) ? d.hints : DEFAULTS.hints).map(normHint);
    Tu.LIST = LIST; Tu.enabled = ENABLED;
  }
  Tu.applyData = applyData;
  Tu.exportDefaults = () => ({ enabled: DEFAULTS.enabled, hints: DEFAULTS.hints.map(normHint) });
  Tu.exportCurrent = () => ({ enabled: ENABLED, hints: LIST.map(clone) });

  function evalTrig(t) { const f = TRIG[t && t.type]; try { return f ? !!f(t) : false; } catch (_) { return false; } }
  Tu.evalTrigger = t => evalTrig(t);
  Tu.seen = id => !!(G.save && G.save.tutorialSeen && G.save.tutorialSeen[id]);
  Tu.reset = () => { if (G.save) G.save.tutorialSeen = {}; };
  Tu.status = () => LIST.map(h => ({ id: h.id, text: h.text, trigger: h.trigger.type, seen: Tu.seen(h.id) }));

  function fire(h) {
    G.save.tutorialSeen[h.id] = Date.now();
    if (G.UI && G.UI.banner) G.UI.banner(h.text, h.place || 'bottom', h.secs || 4);
    if (G.Main && G.Main.persist) G.Main.persist();
  }
  // called each play frame from the main loop; shows at most one new hint per frame (no banner spam)
  Tu.update = function () {
    if (!ENABLED || !G.player || G.player.dead || !G.room) return;
    if (G.Main && G.Main.state !== 'play') return;
    if (!G.save) return;
    G.save.tutorialSeen = G.save.tutorialSeen || {};
    for (const h of LIST) {
      if (G.save.tutorialSeen[h.id]) continue;
      if (evalTrig(h.trigger)) { fire(h); break; }
    }
  };

  applyData();
})();
