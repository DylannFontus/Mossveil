// MOSSVEIL — economy.js : Glimmer economy & costs (G.Economy).
// The tuning numbers behind the Glimmer economy — what charms cost at the vendor, the Glimmer to
// forge each nail level, and how much Soul you keep when you die — were hardcoded in main.js. They
// live here as a data overlay (data/economy.js -> G.ECONOMY_DATA) so the in-editor Economy editor can
// author them. Defaults are byte-identical to the old constants. No THREE/Audio at load (so gen-data
// can node-eval it). main.js reads these via G.Economy.* with a literal fallback, so the game still
// runs even if this module is ever absent.
(function () {
  const E = G.Economy = {};
  const clone = o => JSON.parse(JSON.stringify(o));
  const DEFAULTS = {
    charmPriceMul: 60,               // vendor charm price = charm.cost * this (Glimmer)
    nailCosts: [60, 120, 180, 240],  // Glimmer to forge the nail to level 1, 2, 3, 4
    soulKeptOnDeath: 0.5             // fraction of Soul retained on death (floored)
  };
  let DATA = clone(DEFAULTS);
  const num = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : d;

  function applyData(data) {
    const d = data || G.ECONOMY_DATA || null;
    DATA = clone(DEFAULTS);
    if (d) {
      DATA.charmPriceMul = Math.max(0, num(d.charmPriceMul, DEFAULTS.charmPriceMul));
      if (Array.isArray(d.nailCosts) && d.nailCosts.length) DATA.nailCosts = d.nailCosts.map((c, i) => Math.max(0, Math.round(num(c, DEFAULTS.nailCosts[i] || 0))));
      DATA.soulKeptOnDeath = Math.max(0, Math.min(1, num(d.soulKeptOnDeath, DEFAULTS.soulKeptOnDeath)));
    }
  }
  E.applyData = applyData;
  E.exportDefaults = () => clone(DEFAULTS);
  E.exportCurrent = () => clone(DATA);

  // ---- live reads (main.js calls these) ----
  E.charmPriceMul = () => DATA.charmPriceMul;
  E.charmPrice = cost => Math.round((cost || 0) * DATA.charmPriceMul);
  E.nailCosts = () => clone(DATA.nailCosts);
  E.nailMax = () => DATA.nailCosts.length;
  E.nailCost = lvl => DATA.nailCosts[lvl] != null ? DATA.nailCosts[lvl] : 0;
  E.nailTotal = () => DATA.nailCosts.reduce((a, c) => a + c, 0);
  E.soulKeptOnDeath = () => DATA.soulKeptOnDeath;

  applyData();
})();
