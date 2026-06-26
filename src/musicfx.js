// MOSSVEIL — musicfx.js : music transition timings (G.MusicFX).
// How the soundtrack crosses between themes — the fade-out/in on a track swap, the dramatic stop +
// beat of silence + drive-in when a boss begins, the fade back to the biome theme when it's beaten,
// the fade-in on resume, and the hard full-stop — were magic numbers scattered through music.js. They
// live here as a data overlay (data/musicfx.js -> G.MUSICFX_DATA) so the in-editor Music-transition
// editor can author the pacing. Defaults are byte-identical to the old constants. No THREE/Audio at
// load (so gen-data can node-eval it). music.js routes every transition duration through G.MusicFX.dur()
// with a literal fallback, so the game still runs even if this module is ever absent.
(function () {
  const M = G.MusicFX = {};
  const clone = o => JSON.parse(JSON.stringify(o));
  const DEFAULTS = {
    trackSwapOut: 0.32,    // old theme fade-out on a track swap (s)
    trackSwapIn: 0.28,     // new theme fade-in on a track swap
    bossStopFade: 0.16,    // biome theme hard-stop when a boss begins
    bossSilence: 0.85,     // beat of dread before the boss theme enters
    bossInFade: 0.18,      // boss theme fade-in
    bossOutFade: 0.3,      // boss theme fade-out when beaten
    biomeReturnFade: 0.9,  // biome theme fade back in after a boss
    resumeFade: 0.3,       // music fade-in on resume (cutscene end, etc.)
    pauseFastFade: 0.18    // hard full-stop fade (a boss fight begins)
  };
  let DATA = clone(DEFAULTS);
  const num = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : d;

  function applyData(data) {
    const d = data || G.MUSICFX_DATA || null;
    DATA = clone(DEFAULTS);
    if (d) for (const k in DEFAULTS) {
      // every value is a fade duration; bossSilence may be 0, the rest need a tiny floor for the ramps
      const floor = (k === 'bossSilence') ? 0 : 0.02;
      DATA[k] = Math.max(floor, num(d[k], DEFAULTS[k]));
    }
  }
  M.applyData = applyData;
  M.exportDefaults = () => clone(DEFAULTS);
  M.exportCurrent = () => clone(DATA);

  // ---- live reads (music.js calls dur(); per-key getters for the editor) ----
  M.dur = k => (DATA[k] != null ? DATA[k] : (DEFAULTS[k] || 0));
  M.keys = () => Object.keys(DEFAULTS);

  applyData();
})();
