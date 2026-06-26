// MOSSVEIL — positional.js : positional / 3D-audio spatialiser (G.Positional).
// Every positional one-shot (Audio.sfxAt) and footstep is attenuated + panned by its distance to the
// camera. The falloff curve and stereo width were magic numbers buried in audio.js's spatial(): the
// reference distance, the roll-off steepness, the far-distance floor gain, the world-units-to-hard-pan
// width, and how much vertical distance counts. They live here as a data overlay (data/positional.js ->
// G.POSITIONAL_DATA) so the in-editor Positional-audio editor can author the 3D feel. Defaults are
// byte-identical to the old constants. No THREE/Audio at load (so gen-data can node-eval it). audio.js's
// spatial() routes through gainFor/panFor/distOf with a literal fallback, so the game still runs even if
// this module is ever absent.
(function () {
  const P = G.Positional = {};
  const clone = o => JSON.parse(JSON.stringify(o));
  const DEFAULTS = {
    minGain: 0.04,   // floor gain for a far-away source (it never falls fully silent)
    refDist: 9,      // reference distance (world units): the roll-off knee
    falloffPow: 2,   // steepness of the distance roll-off
    panWidth: 14,    // world units of horizontal offset for a hard L/R pan
    yWeight: 0.5     // how much vertical distance counts toward attenuation vs horizontal
  };
  let D = clone(DEFAULTS);
  const num = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : d;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  // safe ranges — refDist/panWidth must stay > 0 (they're divisors)
  const RANGE = { minGain: [0, 1], refDist: [0.5, 40], falloffPow: [0.25, 6], panWidth: [1, 60], yWeight: [0, 2] };

  function applyData(data) {
    const d = data || G.POSITIONAL_DATA || null;
    D = clone(DEFAULTS);
    if (d) for (const k in DEFAULTS) { const r = RANGE[k]; D[k] = clamp(num(d[k], DEFAULTS[k]), r[0], r[1]); }
  }
  P.applyData = applyData;
  P.exportDefaults = () => clone(DEFAULTS);
  P.exportCurrent = () => clone(D);
  P.keys = () => Object.keys(DEFAULTS);
  P.get = k => (D[k] != null ? D[k] : DEFAULTS[k]);

  // ---- the spatialiser maths (audio.js spatial() routes through these) ----
  // distance metric: horizontal + weighted vertical offset from the camera
  P.distOf = (dx, dy) => Math.abs(dx) + Math.abs(dy) * D.yWeight;
  // gain: 1 near the camera, rolling off toward minGain with distance
  P.gainFor = dist => Math.max(D.minGain, Math.min(1, 1 / (1 + Math.pow(dist / D.refDist, D.falloffPow))));
  // pan: -1 (full left) .. +1 (full right) by horizontal offset
  P.panFor = dx => Math.max(-1, Math.min(1, dx / D.panWidth));

  applyData();
})();
