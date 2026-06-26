// MOSSVEIL — saves.js : save-slot configuration (G.Saves).
// The number of save slots (SLOT_COUNT in main.js / SLOT_VIEW in ui.js) and the wording on the Load
// Save screen (the place a fresh run shows, the "Moth Wings" tag, the "N bosses felled" detail, the
// empty-vessel lines, the "rested …" prefix) were hardcoded across main.js and ui.js. They live here
// as a data overlay (data/saves.js -> G.SAVES_DATA) so the in-editor Save-slots editor can author them.
// slotCount is clamped to 1..5 — the slots screen has five roman numerals and a fixed column height, so
// staying in range keeps the layout safe. Defaults are byte-identical to the old constants. No
// THREE/Audio at load (so gen-data can node-eval it). main.js / ui.js read these via G.Saves.* with a
// literal fallback, so the game still runs even if this module is ever absent.
(function () {
  const S = G.Saves = {};
  const clone = o => JSON.parse(JSON.stringify(o));
  const MAX_SLOTS = 5;   // the slots screen draws five roman numerals (I..V) in a fixed-height column
  const DEFAULTS = {
    slotCount: 5,
    labels: {
      newGamePlace: 'The Awakening',     // place shown for a save with no bench yet
      wings: 'Moth Wings',               // tag when the run has the wings
      bossSingular: ' boss felled',
      bossPlural: ' bosses felled',
      emptyTitle: '— empty vessel —',
      emptySub: 'begin a new journey here',
      restedPrefix: 'rested '            // prefixes the relative time on each slot
    }
  };
  let DATA = clone(DEFAULTS);
  const num = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : d;
  const str = (v, d) => (typeof v === 'string') ? v : d;

  function applyData(data) {
    const d = data || G.SAVES_DATA || null;
    DATA = clone(DEFAULTS);
    if (d) {
      DATA.slotCount = Math.max(1, Math.min(MAX_SLOTS, Math.round(num(d.slotCount, DEFAULTS.slotCount))));
      if (d.labels && typeof d.labels === 'object') {
        for (const k in DEFAULTS.labels) DATA.labels[k] = str(d.labels[k], DEFAULTS.labels[k]);
      }
    }
  }
  S.applyData = applyData;
  S.exportDefaults = () => clone(DEFAULTS);
  S.exportCurrent = () => clone(DATA);
  S.MAX_SLOTS = MAX_SLOTS;

  // ---- live reads (main.js / ui.js call these) ----
  S.slotCount = () => DATA.slotCount;
  S.label = k => DATA.labels[k] != null ? DATA.labels[k] : '';
  S.labels = () => clone(DATA.labels);

  applyData();
})();
