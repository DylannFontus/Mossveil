// MOSSVEIL — difficulty.js : difficulty / accessibility modes (G.Difficulty).
// Each mode tweaks the player's derived stats: maskBonus (extra/fewer masks), dmgBonus (nail damage),
// and soulMul (how fast soul gathers, easing healing). Applied in one place — charms.js C.apply — so
// it's consistent for every foe AND boss, and integer-safe (no fractional masks). The active mode is
// stored per save (G.save.difficulty). Modes are a data overlay (data/difficulty.js -> G.DIFFICULTY_DATA)
// authored by the in-editor Difficulty editor. 'normal' (all neutral) is byte-identical to before.
(function () {
  const D = G.Difficulty = {};
  const clone = o => JSON.parse(JSON.stringify(o));
  const DEFAULTS = {
    default: 'normal',
    modes: {
      normal: { name: 'Normal', desc: 'The intended challenge.', maskBonus: 0, dmgBonus: 0, soulMul: 1 },
      assist: { name: 'Assist', desc: 'Gentler: more masks, soul gathers faster, strikes hit harder.', maskBonus: 2, dmgBonus: 1, soulMul: 1.5 },
      steadfast: { name: 'Steadfast', desc: 'Harder: fewer masks, soul comes slower.', maskBonus: -1, dmgBonus: 0, soulMul: 0.85 }
    }
  };
  let DATA = {};
  function normMode(m) { return { name: m.name || 'Mode', desc: m.desc || '', maskBonus: m.maskBonus | 0, dmgBonus: m.dmgBonus | 0, soulMul: +m.soulMul || 1 }; }
  function applyData(data) {
    const d = data || G.DIFFICULTY_DATA || null;
    DATA = { default: 'normal', modes: {} };
    for (const id in DEFAULTS.modes) DATA.modes[id] = normMode(DEFAULTS.modes[id]);
    DATA.default = DEFAULTS.default;
    if (d) {
      if (d.modes) for (const id in d.modes) DATA.modes[id] = normMode(d.modes[id]);
      if (d.default && DATA.modes[d.default]) DATA.default = d.default;
    }
    if (!DATA.modes.normal) DATA.modes.normal = normMode(DEFAULTS.modes.normal);
    if (G.player && G.Charms) G.Charms.apply(G.player);   // hot-apply after an edit
  }
  D.applyData = applyData;
  D.exportDefaults = () => clone(DEFAULTS);
  D.exportCurrent = () => clone(DATA);
  D.modeId = () => { const id = G.save && G.save.difficulty; return (id && DATA.modes[id]) ? id : DATA.default; };
  D.cur = () => DATA.modes[D.modeId()] || DATA.modes.normal;
  D.maskBonus = () => D.cur().maskBonus || 0;
  D.dmgBonus = () => D.cur().dmgBonus || 0;
  D.soulMul = () => (D.cur().soulMul != null ? D.cur().soulMul : 1);
  D.modeList = () => Object.keys(DATA.modes).map(id => ({ id, name: DATA.modes[id].name, desc: DATA.modes[id].desc }));
  D.setMode = id => { if (!DATA.modes[id]) return false; if (!G.save) G.save = {}; G.save.difficulty = id; if (G.player && G.Charms) G.Charms.apply(G.player); if (G.Main && G.Main.persist) G.Main.persist(); return true; };
  applyData();
})();
