// MOSSVEIL — synth.js : a library of reusable synth "voice" presets for the SFX designer.  Roadmap #80.
// Each preset is ONE playable synth layer in exactly the shape audio.js playLayer() consumes
// ({kind:'tone'|'noise'|'bell', ...}). This is an EDITOR-SIDE authoring palette: you browse, audition,
// tweak and STAMP presets into sounds (which writes the existing data/sfx.js), and you can CAPTURE an
// existing SFX layer back into the library. The GAME never reads G.Synth — sounds still play from their
// own fully-expanded specs in data/sfx.js — so nothing about how the game sounds changes. Overlaid by
// data/synth.js (G.SYNTH_DATA); no THREE/Audio at load, so tools/gen-data.js can node-eval it.
(function () {
  const S = G.Synth = {};
  const clone = o => JSON.parse(JSON.stringify(o));
  const num = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : d;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const WAVES = ['sine', 'square', 'triangle', 'sawtooth'];
  const FTYPES = ['lowpass', 'highpass', 'bandpass'];
  const KINDS = ['tone', 'noise', 'bell'];

  // starter library — a spread of useful timbres drawn from the palette the built-in sounds already use
  const DEFAULTS = {
    'sub-boom': { kind: 'tone', type: 'sine', f0: 80, f1: 35, t: 0.30, vol: 0.40 },
    'square-stab': { kind: 'tone', type: 'square', f0: 150, f1: 85, t: 0.09, vol: 0.16 },
    'saw-growl': { kind: 'tone', type: 'sawtooth', f0: 110, f1: 38, t: 0.60, vol: 0.30 },
    'tri-ping': { kind: 'tone', type: 'triangle', f0: 1250, f1: 900, t: 0.06, vol: 0.10 },
    'sine-rise': { kind: 'tone', type: 'sine', f0: 340, f1: 520, t: 0.13, vol: 0.10 },
    'soft-bell': { kind: 'bell', f0: 520, vol: 0.12, dur: 0.8 },
    'deep-bell': { kind: 'bell', f0: 196, vol: 0.12, dur: 2.2 },
    'airy-noise': { kind: 'noise', f0: 1800, f1: 3200, t: 0.16, vol: 0.07, q: 2 },
    'thud-noise': { kind: 'noise', f0: 800, f1: 300, t: 0.10, vol: 0.30, ftype: 'lowpass' },
    'sweep-up': { kind: 'noise', f0: 500, f1: 2400, t: 0.24, vol: 0.07, ftype: 'bandpass', q: 0.5, a: 0.03 }
  };

  // validate a layer WITHOUT reordering/adding fields it already has, so a clean preset round-trips
  // byte-identically; only coerce the core numerics so a corrupt save can never crash playLayer().
  function cleanLayer(L) {
    if (!L || typeof L !== 'object') return null;
    const kind = KINDS.indexOf(L.kind) >= 0 ? L.kind : 'tone';
    const out = clone(L); out.kind = kind;
    out.f0 = clamp(num(L.f0, 440), 1, 20000);
    out.vol = clamp(num(L.vol, 0.1), 0, 1);
    if (kind === 'bell') { out.dur = clamp(num(L.dur, 0.5), 0.02, 8); }
    else {
      out.t = clamp(num(L.t, 0.2), 0.01, 8);
      if (L.f1 != null) out.f1 = clamp(num(L.f1, out.f0), 1, 20000);
      if (L.a != null) out.a = clamp(num(L.a, 0), 0, 4);
      if (L.delay != null) out.delay = clamp(num(L.delay, 0), 0, 4);
      if (kind === 'tone') out.type = WAVES.indexOf(L.type) >= 0 ? L.type : 'sine';
      if (kind === 'noise') { if (L.ftype != null) out.ftype = FTYPES.indexOf(L.ftype) >= 0 ? L.ftype : 'lowpass'; if (L.q != null) out.q = clamp(num(L.q, 1), 0.1, 20); }
    }
    return out;
  }

  let P = clone(DEFAULTS);
  function applyData(data) {
    const d = data || G.SYNTH_DATA || null;
    if (d && d.presets && typeof d.presets === 'object') {
      P = {};
      for (const name in d.presets) { const L = cleanLayer(d.presets[name]); if (L) P[name] = L; }
      if (!Object.keys(P).length) P = clone(DEFAULTS);     // never leave the library empty
    } else P = clone(DEFAULTS);
  }

  S.applyData = applyData;
  S.exportDefaults = () => ({ presets: clone(DEFAULTS) });
  S.exportCurrent = () => ({ presets: clone(P) });
  S.list = () => clone(P);
  S.names = () => Object.keys(P);
  S.get = name => P[name] ? clone(P[name]) : null;
  S.cleanLayer = cleanLayer;
  S.kinds = () => KINDS.slice();
  S.waveTypes = () => WAVES.slice();
  S.ftypes = () => FTYPES.slice();

  applyData();
})();
