// MOSSVEIL — loadout.js : charm loadout / notch economy (G.Loadout).
// Charms are the equipment system — each costs notches, and your notch budget grows as you fell
// bosses. The tuning behind that (the starting notches, how many you gain per boss, the cap, whether
// overcharming one charm over budget is allowed, and how much extra damage you take while overcharmed)
// was hardcoded across charms.js (C.notches / C.canEquip) and player.js (the hurt handler). It lives
// here as a data overlay (data/loadout.js -> G.LOADOUT_DATA) so the in-editor Charm loadout editor can
// author it. Defaults are byte-identical to the old constants. No THREE/Audio at load (so gen-data can
// node-eval it). charms.js / player.js read these via G.Loadout.* with a literal fallback, so the game
// still runs even if this module is ever absent.
(function () {
  const L = G.Loadout = {};
  const clone = o => JSON.parse(JSON.stringify(o));
  const DEFAULTS = {
    baseNotches: 3,          // notches you start with
    notchesPerBoss: 1,       // notches gained per boss felled
    notchCap: 9,             // most notches you can ever have
    allowOvercharm: true,    // may you equip one charm over budget? (HK-style)
    overcharmDamageMult: 2   // damage multiplier while overcharmed (fragile)
  };
  let DATA = clone(DEFAULTS);
  const num = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : d;
  const int0 = (v, d) => Math.max(0, Math.round(num(v, d)));

  function applyData(data) {
    const d = data || G.LOADOUT_DATA || null;
    DATA = clone(DEFAULTS);
    if (d) {
      DATA.baseNotches = int0(d.baseNotches, DEFAULTS.baseNotches);
      DATA.notchesPerBoss = int0(d.notchesPerBoss, DEFAULTS.notchesPerBoss);
      DATA.notchCap = Math.max(DATA.baseNotches, int0(d.notchCap, DEFAULTS.notchCap));
      DATA.allowOvercharm = (d.allowOvercharm == null) ? DEFAULTS.allowOvercharm : !!d.allowOvercharm;
      DATA.overcharmDamageMult = Math.max(1, num(d.overcharmDamageMult, DEFAULTS.overcharmDamageMult));
    }
  }
  L.applyData = applyData;
  L.exportDefaults = () => clone(DEFAULTS);
  L.exportCurrent = () => clone(DATA);

  // ---- live reads (charms.js / player.js call these) ----
  L.baseNotches = () => DATA.baseNotches;
  L.notchesPerBoss = () => DATA.notchesPerBoss;
  L.notchCap = () => DATA.notchCap;
  L.allowOvercharm = () => DATA.allowOvercharm;
  L.overcharmDamageMult = () => DATA.overcharmDamageMult;
  // notch budget after felling `bosses` bosses (clamped to the cap)
  L.notchesForBosses = bosses => Math.min(DATA.notchCap, DATA.baseNotches + (bosses | 0) * DATA.notchesPerBoss);

  applyData();
})();
