// MOSSVEIL — poststack.js : post-FX & screen-feedback tuning (G.PostFX).
// The global post-processing knobs that aren't per-biome colour grade (that's data/biomes grade, #15)
// and aren't simple on/off toggles (Settings, #87): the grade cross-fade speed, the ambient-occlusion
// strength, and the chromatic-aberration + screen-flash IMPACT spikes (the screen-feel counterpart to
// the camera punch). These were magic numbers in post.js. They live here as a data overlay
// (data/poststack.js -> G.POSTFX_DATA) so the in-editor Post-FX editor can author them. Defaults are
// byte-identical to the old constants. No THREE/Audio at load (so gen-data can node-eval it). post.js
// reads these via G.PostFX.* with a literal fallback, so the game still runs without it.
(function () {
  const P = G.PostFX = {};
  const clone = o => JSON.parse(JSON.stringify(o));
  const DEFAULTS = {
    gradeRate: 3,         // grade cross-fade speed on room loads (per second; room loads may override)
    ssao: 0.6,            // ambient-occlusion strength (0 disables)
    aberrMax: 2.5,        // most chromatic-aberration an impact spike can stack to
    aberrDefault: 0.6,    // aberration spike amount when punch() is called with no argument
    aberrDecay: 6,        // how fast the aberration spike fades (per second)
    flashDefault: 0.4,    // screen-flash amount when flash() is called with no argument
    flashDecay: 5         // how fast the flash fades (per second)
  };
  let DATA = clone(DEFAULTS);
  const num = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : d;

  function applyData(data) {
    const d = data || G.POSTFX_DATA || null;
    DATA = clone(DEFAULTS);
    if (d) {
      DATA.gradeRate = Math.max(0.01, num(d.gradeRate, DEFAULTS.gradeRate));
      DATA.ssao = Math.max(0, num(d.ssao, DEFAULTS.ssao));
      DATA.aberrMax = Math.max(0, num(d.aberrMax, DEFAULTS.aberrMax));
      DATA.aberrDefault = Math.max(0, num(d.aberrDefault, DEFAULTS.aberrDefault));
      DATA.aberrDecay = Math.max(0, num(d.aberrDecay, DEFAULTS.aberrDecay));
      DATA.flashDefault = Math.max(0, Math.min(1, num(d.flashDefault, DEFAULTS.flashDefault)));
      DATA.flashDecay = Math.max(0, num(d.flashDecay, DEFAULTS.flashDecay));
    }
  }
  P.applyData = applyData;
  P.exportDefaults = () => clone(DEFAULTS);
  P.exportCurrent = () => clone(DATA);

  // ---- live reads (post.js calls these) ----
  P.gradeRate = () => DATA.gradeRate;
  P.ssao = () => DATA.ssao;
  P.aberrMax = () => DATA.aberrMax;
  P.aberrDefault = () => DATA.aberrDefault;
  P.aberrDecay = () => DATA.aberrDecay;
  P.flashDefault = () => DATA.flashDefault;
  P.flashDecay = () => DATA.flashDecay;

  applyData();
})();
