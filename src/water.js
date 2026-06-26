// MOSSVEIL — water.js : reflective-water surface look (G.WaterFX).
// The look of the screen-space water reflection / refraction (how strong the mirror is, the ripple,
// how it fades with distance, the caustic shimmer, and the tint) had its DEFAULTS baked into post.js
// (the `water` object) and a `?? 0.55` fallback in world.js's water fade. They live here as a data
// overlay (data/water.js -> G.WATER_DATA) so the in-editor Water editor can author the global look;
// individual water zones still override per-room via Post.setWater. The colour is kept as a {r,g,b}
// float triple (THREE.Color space) so the default stays byte-identical (8-bit hex can't represent
// 0.62/0.78/0.95 exactly). No THREE/Audio at load (gen-data node-evals it). post.js / world.js read
// these via G.WaterFX.* with a literal fallback.
(function () {
  const W = G.WaterFX = {};
  const clone = o => JSON.parse(JSON.stringify(o));
  const DEFAULTS = {
    strength: 0.55,    // reflection strength (0 = off)
    ripple: 1,         // ripple amount on the reflection
    fade: 1.6,         // how fast the reflection fades with distance
    caustics: 0.5,     // caustic shimmer strength
    color: { r: 0.62, g: 0.78, b: 0.95 }   // reflection tint (THREE.Color 0..1)
  };
  let DATA = clone(DEFAULTS);
  const num = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : d;
  const ch = (v, d) => Math.max(0, Math.min(1, num(v, d)));

  function applyData(data) {
    const d = data || G.WATER_DATA || null;
    DATA = clone(DEFAULTS);
    if (d) {
      DATA.strength = Math.max(0, num(d.strength, DEFAULTS.strength));
      DATA.ripple = Math.max(0, num(d.ripple, DEFAULTS.ripple));
      DATA.fade = Math.max(0, num(d.fade, DEFAULTS.fade));
      DATA.caustics = Math.max(0, num(d.caustics, DEFAULTS.caustics));
      if (d.color && typeof d.color === 'object') DATA.color = { r: ch(d.color.r, DEFAULTS.color.r), g: ch(d.color.g, DEFAULTS.color.g), b: ch(d.color.b, DEFAULTS.color.b) };
    }
  }
  W.applyData = applyData;
  W.exportDefaults = () => clone(DEFAULTS);
  W.exportCurrent = () => clone(DATA);

  // ---- live reads (post.js / world.js call these) ----
  W.strength = () => DATA.strength;
  W.ripple = () => DATA.ripple;
  W.fade = () => DATA.fade;
  W.caustics = () => DATA.caustics;
  W.colorRGB = () => clone(DATA.color);
  // hex convenience for the editor's colour input
  W.colorHex = () => '#' + [DATA.color.r, DATA.color.g, DATA.color.b].map(v => ('0' + Math.round(v * 255).toString(16)).slice(-2)).join('');

  applyData();
})();
