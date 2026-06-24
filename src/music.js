// MOSSVEIL — music.js : composed, adaptive procedural soundtrack engine (the "Score" style).
// Per-biome themes with a chord progression driving a pad, bassline, arpeggio, a stepwise
// lead and drums, mixed by a step sequencer. Exploration is sparse; the lead + full drums
// fade in with combat intensity; a boss variant drives harder. All synthesised live — no files.
// audio.js owns the AudioContext and routes here; the old drones/plucks remain as "Classic".
(function () {
  const M = G.Music = {};
  let ctx = null, busDry = null, busWet = null, noiseBuf = null;
  let playing = false, intensity = 0, bossOn = false;
  let trackId = 'verdant', track = null, pendingTrack = null;
  let nextTime = 0, step = 0;
  const LOOK = 0.14;                                  // schedule this far ahead (s)

  const MAJ = [0, 2, 4, 5, 7, 9, 11], MIN = [0, 2, 3, 5, 7, 8, 10], DOR = [0, 2, 3, 5, 7, 9, 10], PHR = [0, 1, 3, 5, 7, 8, 10], PENT = [0, 3, 5, 7, 10];
  // root in Hz, a scale, a 4-bar chord progression (scale-degree roots), instrument character
  const TRACKS = {
    verdant: { bpm: 86, root: 220.0, scale: MAJ, prog: [0, 5, 3, 4], pad: 'sawtooth', padCut: 950, bass: 'triangle', leadCut: 2400, drums: 0.5 },
    gloom: { bpm: 70, root: 146.8, scale: MIN, prog: [0, 5, 3, 4], pad: 'sawtooth', padCut: 720, bass: 'sine', leadCut: 1900, drums: 0.45 },
    city: { bpm: 74, root: 196.0, scale: MIN, prog: [0, 3, 4, 3], pad: 'triangle', padCut: 1050, bass: 'triangle', leadCut: 2500, drums: 0.4 },
    forge: { bpm: 110, root: 130.8, scale: DOR, prog: [0, 0, 6, 4], pad: 'sawtooth', padCut: 820, bass: 'sawtooth', leadCut: 1700, drums: 0.8 },
    tomb: { bpm: 58, root: 130.8, scale: PHR, prog: [0, 1, 4, 1], pad: 'sine', padCut: 620, bass: 'sine', leadCut: 1500, drums: 0.3 },
    garden: { bpm: 92, root: 261.6, scale: PENT, prog: [0, 2, 3, 4], pad: 'triangle', padCut: 1150, bass: 'triangle', leadCut: 2700, drums: 0.4 }
  };
  const BIOME = {
    verdant: 'verdant', garden: 'garden', village: 'verdant', warm: 'verdant', crown: 'verdant',
    gloom: 'gloom', mine: 'gloom', pale: 'gloom', frost: 'gloom', marsh: 'gloom', fungal: 'garden',
    city: 'city', sunken: 'city', dusk: 'city', aurora: 'city',
    forge: 'forge', ember: 'forge',
    tombs: 'tomb', bone: 'tomb', archive: 'tomb'
  };
  M.TRACK_IDS = Object.keys(TRACKS);
  M.trackForBiome = b => BIOME[b] || 'gloom';

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
    g.connect(busDry); if (o.wet) g.connect(busWet);
    const a = o.a || 0.012, d = o.d || 0.12, sus = o.s != null ? o.s : 0.55, rel = o.r || 0.25, vol = o.vol || 0.18;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol * sus), t0 + a + d);
    g.gain.setTargetAtTime(0.0001, t0 + dur, rel * 0.4);
    if (o.fenv) { f.frequency.setValueAtTime(o.cut || 1400, t0); f.frequency.exponentialRampToValueAtTime(Math.max(90, (o.cut || 1400) * 0.45), t0 + dur); }
    oscs.forEach(osc => { osc.start(t0); osc.stop(t0 + dur + rel + 0.1); });
  }
  function kick(t0, vol) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(125, t0); o.frequency.exponentialRampToValueAtTime(45, t0 + 0.12); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2); o.connect(g); g.connect(busDry); o.start(t0); o.stop(t0 + 0.22); }
  function perc(t0, vol, hp, dur) { const s = ctx.createBufferSource(); s.buffer = noiseBuf; const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; const g = ctx.createGain(); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); s.connect(f); f.connect(g); g.connect(busDry); s.start(t0); s.stop(t0 + dur + 0.02); }

  let lead = 0;                                       // last lead scale-index (stepwise walk)
  function schedStep(s, t0) {
    const T = track, dur16 = 60 / T.bpm / 4, bar = (s >> 4) & 3, beat = s & 15;
    const ch = chord(T, T.prog[bar]);
    const root = T.root, boss = bossOn, inten = boss ? 1 : intensity;
    // pad — once per bar, sustained
    if (beat === 0) ch.forEach((semi, i) => voice(hz(root, semi - 12 + (i === 0 ? -12 : 0)), t0, dur16 * 15.5, { type: T.pad, cut: T.padCut, voices: 2, detune: 11, a: 0.4, d: 0.6, s: 0.7, r: 0.8, vol: 0.05, wet: true, fenv: false }));
    // bass — root on the downbeats (+ a passing fifth)
    if (beat === 0 || beat === 8) voice(hz(root, T.prog[bar] === 0 ? -24 : chord(T, T.prog[bar])[0] - 24), t0, dur16 * 3.5, { type: T.bass, cut: 520, voices: 1, sub: true, a: 0.01, d: 0.15, s: 0.5, r: 0.2, vol: 0.16 });
    if (beat === 14 && inten > 0.3) voice(hz(root, ch[1] - 24), t0, dur16 * 1.5, { type: T.bass, cut: 520, voices: 1, a: 0.01, d: 0.1, s: 0.4, r: 0.15, vol: 0.12 });
    // arpeggio — chord tones, denser/louder as it heats up
    if (beat % 2 === 0) { const note = ch[(s >> 1) % 3]; voice(hz(root, note + 12), t0, dur16 * 1.4, { type: 'triangle', cut: T.leadCut, voices: 1, a: 0.005, d: 0.1, s: 0.25, r: 0.18, vol: 0.04 + inten * 0.05, wet: true }); }
    // lead — stepwise melody on strong beats, fades in with intensity
    if ((beat === 0 || beat === 6 || beat === 10) && inten > 0.28) {
      const sc = T.scale;
      if (beat === 0) lead = T.prog[bar] + 4;          // settle to a chord tone at the bar
      else lead += (Math.random() < 0.5 ? 1 : -1) * (Math.random() < 0.7 ? 1 : 2);
      lead = Math.max(0, Math.min(sc.length * 2 - 1, lead));
      const semi = sc[lead % sc.length] + 12 * Math.floor(lead / sc.length);
      voice(hz(root, semi + 12), t0, dur16 * (beat === 0 ? 3 : 1.6), { type: boss ? 'sawtooth' : 'square', cut: T.leadCut, voices: 1, a: 0.008, d: 0.12, s: 0.35, r: 0.25, vol: 0.05 + inten * 0.06, wet: true, fenv: true });
    }
    // drums — kick on 1 & 3, hats on 8ths, snare on 2 & 4 once engaged
    const dv = T.drums;
    if (beat === 0 || beat === 8) kick(t0, 0.18 * dv * (0.5 + inten * 0.7));
    if (beat % 2 === 0) perc(t0, (0.02 + inten * 0.045) * dv, 6500, 0.04);
    if ((beat === 4 || beat === 12) && inten > 0.35) perc(t0, 0.06 * dv * inten, 1800, 0.12);
    if (boss && (beat === 6 || beat === 14)) kick(t0, 0.16 * dv);
  }

  M.start = (audioCtx, dry, wet) => {
    ctx = audioCtx; noiseBuf = makeNoise();
    busDry = ctx.createGain(); busDry.gain.value = 0; busDry.connect(dry);
    busWet = ctx.createGain(); busWet.gain.value = 0; if (wet) busWet.connect(wet);
    track = TRACKS[trackId] || TRACKS.gloom;
  };
  M.setTrack = id => { if (id && TRACKS[id] && id !== trackId) { if (playing) pendingTrack = id; else { trackId = id; track = TRACKS[id]; } } };
  M.setIntensity = v => { intensity = Math.max(0, Math.min(1, v || 0)); };
  M.setBoss = on => { bossOn = !!on; };
  M.resume = () => {                                  // ramp the music in (called when Score style is active)
    if (!ctx) return; playing = true; nextTime = ctx.currentTime + 0.06; step = 0;
    busDry.gain.setTargetAtTime(0.9, ctx.currentTime, 1.2); busWet.gain.setTargetAtTime(0.6, ctx.currentTime, 1.2);
  };
  M.pause = () => { if (!ctx) return; playing = false; busDry.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.6); busWet.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.6); };
  M.update = () => {
    if (!playing || !ctx || !track) return;
    const dur16 = 60 / track.bpm / 4;
    while (nextTime < ctx.currentTime + LOOK) {
      schedStep(step, nextTime);
      step = (step + 1) & 63;
      if (step === 0 && pendingTrack) { trackId = pendingTrack; track = TRACKS[trackId]; pendingTrack = null; }   // swap at the loop point
      nextTime += dur16;
    }
  };
})();
