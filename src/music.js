// MOSSVEIL — music.js : composed, adaptive procedural soundtrack engine (the "Score" style).
// Per-biome themes with a chord progression driving a pad, bassline, arpeggio, a stepwise
// lead and drums, mixed by a step sequencer. Exploration is sparse; the lead + full drums
// fade in with combat intensity; a boss variant drives harder. All synthesised live — no files.
// audio.js owns the AudioContext and routes here; the old drones/plucks remain as "Classic".
(function () {
  const M = G.Music = {};
  let ctx = null, busDry = null, busWet = null, noiseBuf = null;
  let playing = false, intensity = 0, bossOn = false;
  let trackId = 'verdant', track = null, bossReturn = 'gloom';
  let nextTime = 0, step = 0;
  let gen = null;                                     // current track's voice bus — per-track crossfades live here, NOT on the master
  const LOOK = 0.14;                                  // schedule this far ahead (s)
  // transition timings (track swaps, boss enter/exit, resume, hard stop) live in data/musicfx.js
  // (G.MusicFX); MFX(key) reads them with a byte-identical literal fallback.
  const _MFXDEF = { trackSwapOut: 0.32, trackSwapIn: 0.28, bossStopFade: 0.16, bossSilence: 0.85, bossInFade: 0.18, bossOutFade: 0.3, biomeReturnFade: 0.9, resumeFade: 0.3, pauseFastFade: 0.18 };
  const MFX = k => (G.MusicFX && G.MusicFX.dur) ? G.MusicFX.dur(k) : _MFXDEF[k];
  M._fade = MFX;   // test hook

  const MAJ = [0, 2, 4, 5, 7, 9, 11], MIN = [0, 2, 3, 5, 7, 8, 10], DOR = [0, 2, 3, 5, 7, 9, 10], PHR = [0, 1, 3, 5, 7, 8, 10],
    PENT = [0, 3, 5, 7, 10], LYD = [0, 2, 4, 6, 7, 9, 11], HARM = [0, 2, 3, 5, 7, 8, 11], WHOLE = [0, 2, 4, 6, 8, 10], LOC = [0, 1, 3, 5, 6, 8, 10];
  const SCALES = { MAJ, MIN, DOR, PHR, PENT, LYD, HARM, WHOLE, LOC };
  const WAVES = ['sine', 'triangle', 'sawtooth', 'square'];
  // exposed for the Music editor (Edit ▸ Audio)
  M.SCALES = SCALES; M.SCALE_NAMES = Object.keys(SCALES); M.WAVES = WAVES.slice();

  // Built-in default soundtracks. Each: root in Hz, a scale (by NAME so it serialises cleanly),
  // a 4-bar chord progression (scale-degree roots), pad/bass waveform, filter cutoffs, drum weight.
  // These are only the FALLBACK — the engine reads data/music.js (window.G.MUSIC) as the source of
  // truth, which the in-editor Music tool writes. So tracks can be added/edited/removed forever.
  const DEFAULT_TRACKS = {
    // ---- the six biome themes (used by Auto-by-biome) ----
    verdant: { bpm: 86, root: 220.0, scale: 'MAJ', prog: [0, 5, 3, 4], pad: 'sawtooth', padCut: 950, bass: 'triangle', leadCut: 2400, drums: 0.5 },
    gloom: { bpm: 70, root: 146.8, scale: 'MIN', prog: [0, 5, 3, 4], pad: 'sawtooth', padCut: 720, bass: 'sine', leadCut: 1900, drums: 0.45 },
    city: { bpm: 74, root: 196.0, scale: 'MIN', prog: [0, 3, 4, 3], pad: 'triangle', padCut: 1050, bass: 'triangle', leadCut: 2500, drums: 0.4 },
    forge: { bpm: 110, root: 130.8, scale: 'DOR', prog: [0, 0, 6, 4], pad: 'sawtooth', padCut: 820, bass: 'sawtooth', leadCut: 1700, drums: 0.8 },
    tomb: { bpm: 58, root: 130.8, scale: 'PHR', prog: [0, 1, 4, 1], pad: 'sine', padCut: 620, bass: 'sine', leadCut: 1500, drums: 0.3 },
    garden: { bpm: 92, root: 261.6, scale: 'PENT', prog: [0, 2, 3, 4], pad: 'triangle', padCut: 1150, bass: 'triangle', leadCut: 2700, drums: 0.4 },
    // ---- standalone moods (pick per-level): upbeat → dark, plus some off-vibe ----
    radiant: { bpm: 128, root: 293.7, scale: 'MAJ', prog: [0, 4, 5, 4], pad: 'sawtooth', padCut: 1300, bass: 'triangle', leadCut: 3000, drums: 0.85 },
    triumph: { bpm: 112, root: 261.6, scale: 'MAJ', prog: [0, 3, 4, 5], pad: 'sawtooth', padCut: 1200, bass: 'sawtooth', leadCut: 2800, drums: 0.8 },
    hopeful: { bpm: 100, root: 246.9, scale: 'MAJ', prog: [0, 5, 3, 4], pad: 'triangle', padCut: 1100, bass: 'triangle', leadCut: 2600, drums: 0.55 },
    skyward: { bpm: 104, root: 261.6, scale: 'LYD', prog: [0, 1, 4, 0], pad: 'triangle', padCut: 1250, bass: 'triangle', leadCut: 2900, drums: 0.6 },
    serene: { bpm: 76, root: 220.0, scale: 'LYD', prog: [0, 4, 1, 0], pad: 'sine', padCut: 900, bass: 'sine', leadCut: 2200, drums: 0.2 },
    nocturne: { bpm: 68, root: 174.6, scale: 'MIN', prog: [0, 5, 3, 4], pad: 'sine', padCut: 760, bass: 'sine', leadCut: 1700, drums: 0.3 },
    wistful: { bpm: 80, root: 196.0, scale: 'DOR', prog: [0, 4, 5, 3], pad: 'triangle', padCut: 980, bass: 'triangle', leadCut: 2300, drums: 0.35 },
    mystic: { bpm: 84, root: 174.6, scale: 'DOR', prog: [0, 2, 5, 4], pad: 'sawtooth', padCut: 860, bass: 'sine', leadCut: 2000, drums: 0.4 },
    arcane: { bpm: 88, root: 185.0, scale: 'WHOLE', prog: [0, 2, 4, 2], pad: 'sine', padCut: 880, bass: 'sine', leadCut: 2100, drums: 0.35 },
    glacial: { bpm: 62, root: 207.7, scale: 'MIN', prog: [0, 3, 5, 3], pad: 'sine', padCut: 1000, bass: 'sine', leadCut: 2400, drums: 0.2 },
    lament: { bpm: 60, root: 164.8, scale: 'HARM', prog: [0, 4, 1, 4], pad: 'sine', padCut: 700, bass: 'sine', leadCut: 1600, drums: 0.25 },
    somber: { bpm: 64, root: 146.8, scale: 'MIN', prog: [0, 5, 6, 4], pad: 'sawtooth', padCut: 680, bass: 'sine', leadCut: 1500, drums: 0.3 },
    tense: { bpm: 96, root: 130.8, scale: 'HARM', prog: [0, 6, 4, 0], pad: 'sawtooth', padCut: 760, bass: 'sawtooth', leadCut: 1700, drums: 0.6 },
    march: { bpm: 100, root: 146.8, scale: 'MIN', prog: [0, 6, 5, 4], pad: 'sawtooth', padCut: 820, bass: 'sawtooth', leadCut: 1800, drums: 0.85 },
    chase: { bpm: 138, root: 146.8, scale: 'PHR', prog: [0, 1, 0, 6], pad: 'sawtooth', padCut: 900, bass: 'sawtooth', leadCut: 1900, drums: 0.95 },
    frantic: { bpm: 132, root: 130.8, scale: 'LOC', prog: [0, 4, 1, 5], pad: 'sawtooth', padCut: 840, bass: 'sawtooth', leadCut: 1800, drums: 0.95 },
    abyss: { bpm: 56, root: 110.0, scale: 'PHR', prog: [0, 1, 0, 6], pad: 'sawtooth', padCut: 560, bass: 'sine', leadCut: 1300, drums: 0.3 },
    void: { bpm: 52, root: 98.0, scale: 'LOC', prog: [0, 6, 1, 0], pad: 'sine', padCut: 500, bass: 'sine', leadCut: 1200, drums: 0.25 },
    // the boss theme — driving, dramatic harmonic-minor; always plays at full intensity
    boss: { bpm: 118, root: 130.8, scale: 'HARM', prog: [0, 6, 1, 4], pad: 'sawtooth', padCut: 820, bass: 'sawtooth', leadCut: 1750, drums: 0.95 }
  };
  const DEFAULT_BIOME = {
    verdant: 'verdant', garden: 'garden', village: 'verdant', warm: 'verdant', crown: 'verdant',
    gloom: 'gloom', mine: 'gloom', pale: 'gloom', frost: 'gloom', marsh: 'gloom', fungal: 'garden',
    city: 'city', sunken: 'city', dusk: 'city', aurora: 'city',
    forge: 'forge', ember: 'forge',
    tombs: 'tomb', bone: 'tomb', archive: 'tomb'
  };

  // the live, normalised set the engine plays from (scale resolved to an interval array)
  let TRACKS = {}, BIOME = {};
  const clone = o => JSON.parse(JSON.stringify(o));
  function normalizeTrack(t) {
    t = t || {};
    const name = typeof t.scale === 'string' ? t.scale : (t.scaleName || 'MIN');
    return {
      bpm: +t.bpm || 90, root: +t.root || 146.8,
      scaleName: SCALES[name] ? name : 'MIN', scale: SCALES[name] || (Array.isArray(t.scale) ? t.scale : SCALES.MIN),
      prog: (Array.isArray(t.prog) && t.prog.length === 4) ? t.prog.map(n => n | 0) : [0, 5, 3, 4],
      pad: WAVES.includes(t.pad) ? t.pad : 'sawtooth', padCut: +t.padCut || 800,
      bass: WAVES.includes(t.bass) ? t.bass : 'sine', leadCut: +t.leadCut || 2000,
      drums: t.drums != null ? Math.max(0, Math.min(1, +t.drums)) : 0.4
    };
  }
  // (re)build TRACKS/BIOME from the defaults, overlaid by the editor's data (window.G.MUSIC or arg)
  function applyData(data) {
    const d = data || G.MUSIC || null;
    TRACKS = {}; for (const id in DEFAULT_TRACKS) TRACKS[id] = normalizeTrack(DEFAULT_TRACKS[id]);
    BIOME = clone(DEFAULT_BIOME);
    if (d) {
      if (d.tracks && typeof d.tracks === 'object') for (const id in d.tracks) TRACKS[id] = normalizeTrack(d.tracks[id]);
      if (d.biome && typeof d.biome === 'object') BIOME = clone(d.biome);
    }
    if (!TRACKS.boss) TRACKS.boss = normalizeTrack(DEFAULT_TRACKS.boss);  // boss theme must always exist
    M.TRACK_IDS = Object.keys(TRACKS).filter(id => id !== 'boss');        // 'boss' is internal, not a per-level choice
    if (trackId && TRACKS[trackId]) track = TRACKS[trackId];             // keep the running track in sync after a hot edit
  }
  M.applyData = applyData;
  // serialisable snapshots for the editor: scale stored by NAME
  const serializeTrack = t => ({ bpm: t.bpm, root: t.root, scale: t.scaleName, prog: t.prog.slice(), pad: t.pad, padCut: t.padCut, bass: t.bass, leadCut: t.leadCut, drums: t.drums });
  M.exportDefaults = () => ({ tracks: clone(DEFAULT_TRACKS), biome: clone(DEFAULT_BIOME) });
  M.exportCurrent = () => { const tr = {}; for (const id in TRACKS) tr[id] = serializeTrack(TRACKS[id]); return { tracks: tr, biome: clone(BIOME) }; };
  M.trackForBiome = b => BIOME[b] || 'gloom';
  applyData();

  function chord(t, d) {                              // triad semitone offsets for scale-degree d
    const sc = t.scale, n = sc.length, at = i => sc[((i % n) + n) % n] + 12 * Math.floor(i / n);
    return [at(d), at(d + 2), at(d + 4)];
  }
  const hz = (root, semi) => root * Math.pow(2, semi / 12);

  function makeNoise() { const len = ctx.sampleRate * 0.5, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; return b; }

  // a filtered, enveloped synth voice (1–3 detuned oscillators + optional sub) -> dry/wet bus
  function voice(freq, t0, dur, o) {
    o = o || {};
    const g = ctx.createGain(), f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = o.cut || 1400; f.Q.value = o.q || 0.7;
    const nv = o.voices || 2, oscs = [];
    for (let i = 0; i < nv; i++) { const osc = ctx.createOscillator(); osc.type = o.type || 'sawtooth'; osc.frequency.value = freq; osc.detune.value = (i - (nv - 1) / 2) * (o.detune || 9); osc.connect(f); oscs.push(osc); }
    if (o.sub) { const s = ctx.createOscillator(); s.type = 'sine'; s.frequency.value = freq / 2; s.connect(f); oscs.push(s); }
    f.connect(g);
    g.connect(gen ? gen.d : busDry); if (o.wet) g.connect(gen ? gen.w : busWet);
    const a = o.a || 0.012, d = o.d || 0.12, sus = o.s != null ? o.s : 0.55, rel = o.r || 0.25, vol = o.vol || 0.18;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol * sus), t0 + a + d);
    g.gain.setTargetAtTime(0.0001, t0 + dur, rel * 0.4);
    if (o.fenv) { f.frequency.setValueAtTime(o.cut || 1400, t0); f.frequency.exponentialRampToValueAtTime(Math.max(90, (o.cut || 1400) * 0.45), t0 + dur); }
    oscs.forEach(osc => { osc.start(t0); osc.stop(t0 + dur + rel + 0.1); });
  }
  function kick(t0, vol) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(125, t0); o.frequency.exponentialRampToValueAtTime(45, t0 + 0.12); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2); o.connect(g); g.connect(gen ? gen.d : busDry); o.start(t0); o.stop(t0 + 0.22); }
  function perc(t0, vol, hp, dur) { const s = ctx.createBufferSource(); s.buffer = noiseBuf; const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; const g = ctx.createGain(); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); s.connect(f); f.connect(g); g.connect(gen ? gen.d : busDry); s.start(t0); s.stop(t0 + dur + 0.02); }

  // a "generation" is one track's voice bus: voices connect here, never straight to the master.
  // Swapping tracks fades the OLD generation out and frees it, so its long pads can't bleed back
  // through when the master returns — the cause of the ~2s clash heard when changing rooms.
  function makeGen() { const d = ctx.createGain(), w = ctx.createGain(); d.gain.value = 1; w.gain.value = 1; d.connect(busDry); w.connect(busWet); return { d, w }; }
  function retireGen(fade) {
    const o = gen; if (!o) return; const now = ctx.currentTime;
    o.d.gain.cancelScheduledValues(now); o.w.gain.cancelScheduledValues(now);
    o.d.gain.setValueAtTime(Math.max(0.0001, o.d.gain.value), now); o.d.gain.linearRampToValueAtTime(0.0001, now + fade);
    o.w.gain.setValueAtTime(Math.max(0.0001, o.w.gain.value), now); o.w.gain.linearRampToValueAtTime(0.0001, now + fade);
    setTimeout(() => { try { o.d.disconnect(); o.w.disconnect(); } catch (_) { } }, (fade + 5) * 1000);
  }
  function swapGen(fadeOut, fadeIn) {                 // old voices out & freed, a fresh bus fades in — master untouched
    retireGen(fadeOut); gen = makeGen(); const now = ctx.currentTime;
    gen.d.gain.setValueAtTime(0.0001, now); gen.d.gain.linearRampToValueAtTime(1, now + fadeIn);
    gen.w.gain.setValueAtTime(0.0001, now); gen.w.gain.linearRampToValueAtTime(1, now + fadeIn);
  }

  let lead = 0;                                       // last lead scale-index (stepwise walk)
  function schedStep(s, t0) {
    const T = track, dur16 = 60 / T.bpm / 4, bar = (s >> 4) & 3, beat = s & 15;
    const ch = chord(T, T.prog[bar]);
    const root = T.root, boss = bossOn, inten = boss ? 1 : intensity;
    const combat = inten > 0.12;                        // the moment an enemy engages -> the battle bed takes over
    const aggr = combat ? Math.min(1, (inten - 0.12) / 0.55) : 0;   // scales the menace's loudness/density

    if (!combat) {
      // ---------------- EXPLORATION : spacious, melodic, pretty ----------------
      if (beat === 0) ch.forEach((semi, i) => voice(hz(root, semi - 12 + (i === 0 ? -12 : 0)), t0, dur16 * 15.5, { type: T.pad, cut: T.padCut, voices: 2, detune: 11, a: 0.4, d: 0.6, s: 0.7, r: 0.8, vol: 0.05, wet: true }));
      if (beat === 0 || beat === 8) voice(hz(root, T.prog[bar] === 0 ? -24 : ch[0] - 24), t0, dur16 * 3.5, { type: T.bass, cut: 520, voices: 1, sub: true, a: 0.01, d: 0.15, s: 0.5, r: 0.2, vol: 0.16 });
      if (beat % 2 === 0) { const note = ch[(s >> 1) % 3]; voice(hz(root, note + 12), t0, dur16 * 1.4, { type: 'triangle', cut: T.leadCut, voices: 1, a: 0.005, d: 0.1, s: 0.25, r: 0.18, vol: 0.045 + inten * 0.03, wet: true }); }
      if ((beat === 0 || beat === 6 || beat === 10) && inten > 0.28) {
        const sc = T.scale;
        if (beat === 0) lead = T.prog[bar] + 4; else lead += (Math.random() < 0.5 ? 1 : -1) * (Math.random() < 0.7 ? 1 : 2);
        lead = Math.max(0, Math.min(sc.length * 2 - 1, lead));
        const semi = sc[lead % sc.length] + 12 * Math.floor(lead / sc.length);
        voice(hz(root, semi + 12), t0, dur16 * (beat === 0 ? 3 : 1.6), { type: 'square', cut: T.leadCut, voices: 1, a: 0.006, d: 0.1, s: 0.35, r: 0.2, vol: 0.05 + inten * 0.05, wet: true, fenv: true });
      }
      const dv = T.drums;
      if (beat === 0 || beat === 8) kick(t0, 0.18 * dv * (0.5 + inten * 0.5));
      if (beat % 2 === 0) perc(t0, (0.02 + inten * 0.03) * dv, 6500, 0.04);
      return;
    }

    // ---------------- COMBAT : a relentless dread battle-engine (a wholly different vibe) ----------------
    // No "pretty" pad or melody — instead a low pedal + tritone dread, a pounding ostinato, dissonant
    // brass-ish stabs, an air-raid tremolo at high aggression, and industrial war drums.
    const A = 0.55 + aggr;                              // overall menace multiplier
    // dread pedal: sustained root + tritone, very low, refreshed each bar
    if (beat === 0) {
      voice(hz(root, -24), t0, dur16 * 16.5, { type: 'sawtooth', cut: 320 + aggr * 260, voices: 2, detune: 7, a: 0.15, d: 0.5, s: 0.92, r: 0.7, vol: 0.075 + aggr * 0.05 });
      voice(hz(root, -12 + 6), t0, dur16 * 16.5, { type: 'sawtooth', cut: 460, voices: 2, detune: 15, a: 0.25, d: 0.5, s: 0.82, r: 0.6, vol: 0.032 + aggr * 0.04, wet: true });   // tritone
    }
    // pounding 8th-note ostinato on the root — the propulsion that drives the fight
    if (beat % 2 === 0) {
      const oct = (beat % 8 === 0) ? -24 : -12;
      voice(hz(root, oct), t0, dur16 * 1.5, { type: 'sawtooth', cut: 640 + aggr * 540, voices: 1, sub: true, a: 0.004, d: 0.07, s: 0.42, r: 0.1, vol: 0.1 + aggr * 0.06, fenv: true });
    }
    // off-beat 16th ghost pulses as aggression climbs — relentlessness
    if (aggr > 0.3 && beat % 2 === 1 && Math.random() < 0.4 + aggr * 0.4)
      voice(hz(root, -12), t0, dur16 * 0.7, { type: 'sawtooth', cut: 900, voices: 1, a: 0.003, d: 0.04, s: 0.3, r: 0.06, vol: 0.05 * A });
    // dissonant minor-2nd brass stab on accents — the threat striking
    if ((beat === 4 || beat === 10 || beat === 14) && Math.random() < 0.55 + aggr * 0.35)
      [ch[0], ch[0] + 1, ch[1]].forEach(semi => voice(hz(root, semi - 12), t0, dur16 * 1.1, { type: 'sawtooth', cut: 1100 + aggr * 700, voices: 2, detune: 12, a: 0.004, d: 0.08, s: 0.25, r: 0.12, vol: 0.028 * A, wet: true }));
    // air-raid high tremolo at high aggression — dread screaming overhead
    if (aggr > 0.45 && Math.random() < 0.35)
      voice(hz(root, 12 + T.scale[(Math.random() * T.scale.length) | 0]), t0, dur16 * 0.5, { type: 'sawtooth', cut: 2800, voices: 1, a: 0.002, d: 0.03, s: 0.12, r: 0.05, vol: 0.02 * aggr, wet: true });
    // ---- industrial war drums ----
    const dv = Math.max(0.7, T.drums);
    if (beat % 4 === 0) kick(t0, 0.2 * dv * (0.7 + aggr * 0.5));                              // pounding 4-on-the-floor
    if (beat === 8 || (aggr > 0.4 && beat === 14)) perc(t0, (0.06 + aggr * 0.06) * dv, 1500, 0.16);   // hard taiko/snare
    perc(t0, (0.024 + aggr * 0.04) * dv, 7600, 0.03);                                          // driving 16th hats
    if (aggr > 0.5 && (beat === 13 || beat === 15)) kick(t0, 0.13 * dv);                       // tom fill into the bar
    if (boss && (beat === 2 || beat === 6 || beat === 10 || beat === 14)) kick(t0, 0.13 * dv); // boss double-kick
  }

  M.start = (audioCtx, dry, wet) => {
    ctx = audioCtx; noiseBuf = makeNoise();
    busDry = ctx.createGain(); busDry.gain.value = 0; busDry.connect(dry);
    busWet = ctx.createGain(); busWet.gain.value = 0; if (wet) busWet.connect(wet);
    gen = makeGen();
    track = TRACKS[trackId] || TRACKS.gloom;
  };
  M.setTrack = id => {                                 // swap themes cleanly: old voices fade out & are freed, new fade in
    if (!id || !TRACKS[id] || id === trackId) return;
    if (!playing || !ctx) { trackId = id; track = TRACKS[id]; return; }
    swapGen(MFX('trackSwapOut'), MFX('trackSwapIn'));  // old theme out < 0.35s; master untouched so it can't bleed back
    trackId = id; track = TRACKS[id]; step = 0; lead = 0; nextTime = ctx.currentTime + 0.04;
  };
  M.setIntensity = v => { intensity = Math.max(0, Math.min(1, v || 0)); };
  M.setBoss = on => { bossOn = !!on; };
  // boss fight: the biome track does a dramatic full stop, then the boss theme drives in
  M.startBoss = () => {
    if (!ctx) return;
    bossOn = true; bossReturn = trackId; playing = false;
    retireGen(MFX('bossStopFade'));                    // the biome theme hard-stops -> a beat of dread (master stays put)
    setTimeout(() => {                                 // ~0.85s of silence (the boss roar/stinger swells), then the theme
      if (!bossOn || !ctx) return;
      trackId = 'boss'; track = TRACKS.boss; step = 0; lead = 0; nextTime = ctx.currentTime + 0.05; playing = true;
      gen = makeGen(); const now = ctx.currentTime; const bin = MFX('bossInFade');
      gen.d.gain.setValueAtTime(0.0001, now); gen.d.gain.linearRampToValueAtTime(1, now + bin);
      gen.w.gain.setValueAtTime(0.0001, now); gen.w.gain.linearRampToValueAtTime(1, now + bin);
      busDry.gain.cancelScheduledValues(now); busDry.gain.setTargetAtTime(0.95, now, 0.1); busWet.gain.setTargetAtTime(0.6, now, 0.1);
    }, MFX('bossSilence') * 1000);
  };
  // boss beaten: fade the boss theme out, bring the biome theme back in
  M.endBoss = (biomeId) => {
    bossOn = false; const id = biomeId || bossReturn || 'gloom';
    if (!ctx) { trackId = id; track = TRACKS[id] || track; return; }
    const now = ctx.currentTime;
    busDry.gain.cancelScheduledValues(now); busDry.gain.setTargetAtTime(0.9, now, 0.4); busWet.gain.setTargetAtTime(0.6, now, 0.4);
    if (!playing) {                                    // boss died during the dread silence
      trackId = id; track = TRACKS[id] || track; step = 0; lead = 0; nextTime = now + 0.05; playing = true;
      gen = makeGen(); const bret = MFX('biomeReturnFade');
      gen.d.gain.setValueAtTime(0.0001, now); gen.d.gain.linearRampToValueAtTime(1, now + bret);
      gen.w.gain.setValueAtTime(0.0001, now); gen.w.gain.linearRampToValueAtTime(1, now + bret);
      return;
    }
    swapGen(MFX('bossOutFade'), MFX('biomeReturnFade'));  // boss theme out, biome fades back in
    trackId = id; track = TRACKS[id] || track; step = 0; lead = 0; nextTime = now + 0.05;
  };
  M.resume = () => {                                  // fade the music in (e.g. on boss death / after a cutscene)
    if (!ctx || playing) return; playing = true; nextTime = ctx.currentTime + 0.06; step = 0;
    if (!gen) gen = makeGen();
    const now = ctx.currentTime;
    const rf = MFX('resumeFade');
    gen.d.gain.cancelScheduledValues(now); gen.d.gain.setValueAtTime(Math.max(0.0001, gen.d.gain.value), now); gen.d.gain.linearRampToValueAtTime(1, now + rf);
    gen.w.gain.cancelScheduledValues(now); gen.w.gain.setValueAtTime(Math.max(0.0001, gen.w.gain.value), now); gen.w.gain.linearRampToValueAtTime(1, now + rf);
    busDry.gain.cancelScheduledValues(now);
    busDry.gain.setTargetAtTime(0.9, now, 0.9); busWet.gain.setTargetAtTime(0.6, now, 0.9);
  };
  M.playing = () => playing;
  M.current = () => trackId;
  M.pause = (fast) => {                                // fast = a hard full-stop (e.g. a boss fight begins)
    if (!ctx || !playing) return; playing = false; const now = ctx.currentTime;
    busDry.gain.cancelScheduledValues(now); busWet.gain.cancelScheduledValues(now);
    if (fast) {
      const pf = MFX('pauseFastFade');
      busDry.gain.setValueAtTime(Math.max(0.0001, busDry.gain.value), now); busDry.gain.linearRampToValueAtTime(0.0001, now + pf);
      busWet.gain.setValueAtTime(Math.max(0.0001, busWet.gain.value), now); busWet.gain.linearRampToValueAtTime(0.0001, now + pf);
    } else { busDry.gain.setTargetAtTime(0.0001, now, 0.6); busWet.gain.setTargetAtTime(0.0001, now, 0.6); }
  };
  // ---- live preview for the Music editor: audition an unsaved track definition ----
  // pass a serialisable track def (scale by name is fine); the tool drives M.update each frame.
  M.previewDef = (def, inten) => {
    if (!ctx) return false;
    track = normalizeTrack(def); trackId = '__preview';
    intensity = Math.max(0, Math.min(1, inten || 0)); bossOn = false;
    step = 0; lead = 0; nextTime = ctx.currentTime + 0.05; playing = true;
    if (!gen) gen = makeGen();
    const now = ctx.currentTime;
    gen.d.gain.cancelScheduledValues(now); gen.d.gain.setValueAtTime(1, now);
    gen.w.gain.cancelScheduledValues(now); gen.w.gain.setValueAtTime(1, now);
    busDry.gain.cancelScheduledValues(now); busDry.gain.setTargetAtTime(0.9, now, 0.08);
    busWet.gain.cancelScheduledValues(now); busWet.gain.setTargetAtTime(0.6, now, 0.08);
    return true;
  };
  M.previewIntensity = v => { intensity = Math.max(0, Math.min(1, v || 0)); };
  M.stopPreview = () => { if (ctx) M.pause(true); };
  M.update = () => {
    if (!playing || !ctx || !track) return;
    const dur16 = 60 / track.bpm / 4;
    while (nextTime < ctx.currentTime + LOOK) {
      schedStep(step, nextTime);
      step = (step + 1) & 63;
      nextTime += dur16;
    }
  };
})();
