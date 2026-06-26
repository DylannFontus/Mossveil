// MOSSVEIL — drops.js : enemy & boss Glimmer drop tables (G.Drops).
// Every slain enemy and boss spills Glimmer. The amounts were baked into the death handlers as
// `2 + (Math.random()*3|0)` (enemies, in enemies.js) and `40 + (Math.random()*20|0)` (bosses, in
// bosses.js). They live here as a data overlay (data/drops.js -> G.DROPS_DATA) so the in-editor Drop
// tables editor can author them: a baseline for any enemy / any boss, plus per-type overrides, each
// with a min/max Glimmer range and a drop chance. Defaults are byte-identical to the old formulas
// (chance 1 => no extra rng is consumed, so the default roll is the exact same expression). No
// THREE/Audio at load (so gen-data can node-eval it). The death handlers call G.Drops.roll/bossRoll
// with a literal fallback, so the game still runs even if this module is ever absent.
(function () {
  const D = G.Drops = {};
  const clone = o => JSON.parse(JSON.stringify(o));
  const DEFAULTS = {
    enemy: { min: 2, max: 4, chance: 1 },    // baseline drop for any enemy without an override
    boss: { min: 40, max: 59, chance: 1 },   // baseline drop for any boss without an override
    byType: {},                              // per enemy-type:  { tumblebug: { min, max, chance }, ... }
    byBoss: {}                               // per boss-typeId: { mossSovereign: { min, max, chance }, ... }
  };
  let DATA = clone(DEFAULTS);
  const num = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : d;

  // normalise one { min, max, chance } entry: ints >= 0, max >= min, chance clamped 0..1
  function normEntry(e, base) {
    base = base || { min: 0, max: 0, chance: 1 };
    const min = Math.max(0, Math.round(num(e && e.min, base.min)));
    let max = Math.max(0, Math.round(num(e && e.max, base.max)));
    if (max < min) max = min;
    const chance = Math.max(0, Math.min(1, num(e && e.chance, base.chance)));
    return { min, max, chance };
  }
  function normMap(m, base) {
    const out = {};
    if (m && typeof m === 'object') for (const k in m) out[k] = normEntry(m[k], base);
    return out;
  }

  function applyData(data) {
    const d = data || G.DROPS_DATA || null;
    DATA = clone(DEFAULTS);
    if (d) {
      DATA.enemy = normEntry(d.enemy, DEFAULTS.enemy);
      DATA.boss = normEntry(d.boss, DEFAULTS.boss);
      DATA.byType = normMap(d.byType, DATA.enemy);
      DATA.byBoss = normMap(d.byBoss, DATA.boss);
    }
  }
  D.applyData = applyData;
  D.exportDefaults = () => clone(DEFAULTS);
  D.exportCurrent = () => clone(DATA);

  // ---- effective specs (the editor + game read these) ----
  D.enemyBase = () => clone(DATA.enemy);
  D.bossBase = () => clone(DATA.boss);
  // effective spec for an enemy type (override if present, else the enemy baseline)
  D.spec = type => DATA.byType[type] ? clone(DATA.byType[type]) : clone(DATA.enemy);
  D.bossSpec = id => DATA.byBoss[id] ? clone(DATA.byBoss[id]) : clone(DATA.boss);
  D.hasOverride = type => !!DATA.byType[type];
  D.hasBossOverride = id => !!DATA.byBoss[id];
  // average Glimmer per kill for a spec (for editor readouts)
  D.expected = s => s ? s.chance * (s.min + s.max) / 2 : 0;

  // roll a single drop from a spec. chance < 1 gates the whole drop (an extra rng call). At the
  // default chance of 1 that branch is skipped, so `min + floor(rand*(max-min+1))` reproduces the
  // original hardcoded expression exactly.
  function rollSpec(s) {
    if (s.chance < 1 && Math.random() >= s.chance) return 0;
    return s.min + Math.floor(Math.random() * (s.max - s.min + 1));
  }
  D.roll = type => rollSpec(DATA.byType[type] || DATA.enemy);
  D.bossRoll = id => rollSpec(DATA.byBoss[id] || DATA.boss);

  applyData();
})();
