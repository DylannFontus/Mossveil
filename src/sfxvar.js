// MOSSVEIL — sfxvar.js : per-play SFX randomization pools (G.SfxVar).
// Repeated sound effects (a sword swing, a coin pickup, a footstep-tick) sound robotic when they
// replay byte-for-byte every time. This adds tiny PER-PLAY variation — a pitch wobble and a gain
// wobble drawn fresh on each trigger — so the tenth swing doesn't sound identical to the first.
// The variation is authored per-SFX (a "pool"), with a global default for sounds without their own
// entry, in data/sfxvar.js (G.SFXVAR_DATA), via the in-editor Randomization-pools tool. The ranges
// are SYMMETRIC (±) and drawn ONCE per play so every layer of a sound shifts together (stays
// coherent). When every range is zero the variation is INERT — varySpec returns the SAME spec
// untouched, so the game is byte-identical to before. audio.js's playSpec() routes through varySpec
// with a literal pass-through fallback, so the game still runs even if this module is ever absent.
// No THREE/Audio at load, so gen-data can node-eval it.
(function () {
  const V = G.SfxVar = {};
  const clone = o => JSON.parse(JSON.stringify(o));
  // an "entry" is one pool: how much a sound may wander on each play.
  //   pitch — ± semitones (a ±cents-style wobble; 0 = always identical pitch)
  //   gain  — ± fraction of its volume (0 = always identical loudness)
  const DEFAULTS = {
    default: { pitch: 0, gain: 0 },   // applied to any SFX without its own pool
    pools: {}                          // name -> { pitch, gain }
  };
  let D = clone(DEFAULTS);
  const num = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : d;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  // safe authoring ranges per axis
  const RANGE = { pitch: [0, 12], gain: [0, 0.9] };

  function normEntry(e) {
    const o = {};
    for (const k in RANGE) o[k] = clamp(num(e && e[k], 0), RANGE[k][0], RANGE[k][1]);
    return o;
  }
  function applyData(data) {
    const d = data || G.SFXVAR_DATA || null;
    D = clone(DEFAULTS);
    if (d) {
      D.default = normEntry(d.default);
      D.pools = {};
      if (d.pools) for (const n in d.pools) D.pools[n] = normEntry(d.pools[n]);
    }
  }
  V.applyData = applyData;
  V.exportDefaults = () => clone(DEFAULTS);
  V.exportCurrent = () => clone(D);
  V.keys = () => Object.keys(RANGE);                 // ['pitch','gain']
  V.range = k => RANGE[k].slice();
  // the pool that governs a given SFX name (its own, else the global default)
  V.entryFor = name => (D.pools && D.pools[name]) || D.default;
  V.isInert = e => !e || (!e.pitch && !e.gain);

  // factors for ONE play of a sound, given an rng (injectable for tests). Each axis draws p in [-1,1].
  V.factors = (entry, rng) => {
    rng = rng || Math.random;
    const e = entry || D.default;
    const draw = () => rng() * 2 - 1;
    return {
      pitch: Math.pow(2, (draw() * e.pitch) / 12),   // multiplies f0 / f1
      gain: 1 + draw() * e.gain                       // multiplies vol
    };
  };

  // vary a whole spec (array of synth layers) for ONE play. An inert pool returns the SAME array
  // reference (byte-identical, no clone); otherwise returns fresh clones with f0/f1 pitch-scaled and
  // vol gain-scaled by a single per-play draw (coherent across layers). Never mutates the source.
  V.varySpec = (layers, name, rng) => {
    if (!layers || !layers.length) return layers;
    const e = V.entryFor(name);
    if (V.isInert(e)) return layers;
    const f = V.factors(e, rng);
    return layers.map(L => {
      const o = Object.assign({}, L);
      if (o.f0 != null) o.f0 = o.f0 * f.pitch;
      if (o.f1 != null) o.f1 = o.f1 * f.pitch;
      if (o.vol != null) o.vol = Math.max(0, o.vol * f.gain);
      return o;
    });
  };

  applyData();
})();
