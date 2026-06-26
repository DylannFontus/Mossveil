// MOSSVEIL — sidechain.js : music ducking / sidechain compression (G.Sidechain).
// When a chosen sound effect plays (a hit landing, the player getting hurt, a boss stomp) the music
// momentarily dips to make room in the mix, then recovers — the "pumping" that makes impacts hit harder.
// Authored per-SFX in the Ducking editor (data/sidechain.js -> G.SIDECHAIN_DATA). INERT BY DEFAULT:
// depth 0 / no triggers => nothing ducks, and audio.js never even splices the duck node into the music
// path, so which tracks play per level, how they sound, and every transition stay byte-identical to
// before. No THREE/Audio at load (gen-data node-evals it). audio.js attaches the duck GainNode and calls
// trigger(name) on every named SFX; both are no-ops until a non-inert overlay is authored.
(function () {
  const S = G.Sidechain = {};
  const clone = o => JSON.parse(JSON.stringify(o));
  const num = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : d;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  // the shared duck envelope; per-sound strength (0..1) lives in `triggers`
  const RANGE = { depth: [0, 0.9], attack: [0.005, 0.5], hold: [0, 1], release: [0.02, 2] };
  const DEFAULTS = { depth: 0, attack: 0.06, hold: 0, release: 0.4, triggers: {} };
  let D = clone(DEFAULTS);

  function normTriggers(t) {
    const out = {};
    if (t) for (const n in t) { const s = clamp(num(t[n], 0), 0, 1); if (s > 0) out[n] = s; }   // prune 0s
    return out;
  }
  function applyData(data) {
    const d = data || G.SIDECHAIN_DATA || null;
    D = clone(DEFAULTS);
    if (d) {
      for (const k in RANGE) D[k] = clamp(num(d[k], DEFAULTS[k]), RANGE[k][0], RANGE[k][1]);
      D.triggers = normTriggers(d.triggers);
    }
  }
  S.applyData = applyData;
  S.exportDefaults = () => clone(DEFAULTS);
  S.exportCurrent = () => clone(D);
  S.keys = () => Object.keys(RANGE);
  S.range = k => RANGE[k].slice();
  S.triggerMap = () => clone(D.triggers);

  // inert => no audible effect anywhere; audio.js uses this to decide whether to splice the duck node
  S.isInert = () => D.depth <= 0 || Object.keys(D.triggers).length === 0;
  // how hard `name` ducks the music: 0 (never) .. depth (full). Only listed sounds duck.
  S.strengthFor = name => {
    if (S.isInert()) return 0;
    const s = D.triggers[name];
    return (s > 0) ? clamp(D.depth * s, 0, 0.95) : 0;
  };
  // the gain envelope one trigger of `name` would schedule on the music duck node (pure; for the editor
  // preview + tests). null when it wouldn't duck. `lo` is the dipped music gain (1 = no dip, 0 = silent).
  S.envelope = (name, t0) => {
    const s = S.strengthFor(name);
    if (s <= 0) return null;
    return { name, strength: s, lo: Math.max(0.02, 1 - s), attack: D.attack, hold: D.hold, release: D.release, t0: t0 || 0 };
  };

  // ---- live wiring (audio.js owns the AudioContext + the duck GainNode) ----
  let ctx = null, node = null;
  S.attach = (audioCtx, gainNode) => { ctx = audioCtx; node = gainNode; };
  S.detach = () => { ctx = null; node = null; };
  S.attached = () => !!(ctx && node);
  // duck the music for one play of `name`: dip to `lo` over attack, hold, recover to 1 over release.
  // No-op (returns null) when not attached or when `name` doesn't duck — so an inert overlay is silent.
  S.trigger = name => {
    if (!ctx || !node) return null;
    const env = S.envelope(name, ctx.currentTime);
    if (!env) return null;
    const p = node.gain, t0 = env.t0;
    p.cancelScheduledValues(t0);
    p.setValueAtTime(p.value, t0);                              // anchor (approx mid-ramp; fine for a duck)
    p.linearRampToValueAtTime(env.lo, t0 + env.attack);
    const downEnd = t0 + env.attack + env.hold;
    if (env.hold > 0) p.setValueAtTime(env.lo, downEnd);
    p.linearRampToValueAtTime(1, downEnd + env.release);
    return env;
  };

  applyData();
})();
