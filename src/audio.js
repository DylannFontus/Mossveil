// MOSSVEIL — audio.js : fully procedural WebAudio ambience + sfx
(function () {
  let ctx = null, master = null, verb = null, verbGain = null, sfxBus = null, ambBus = null;
  let muted = false, started = false, volume = 0.8;
  const masterLevel = () => (muted ? 0 : 0.55 * volume);
  let droneNodes = [], windGain = null;
  let dripT = 2, pluckT = 3, bossPulseT = 0, combatPulseT = 0;
  let areaRoot = 220, bossOn = false;
  let bossPulseGain = null;
  // adaptive music: a combat-tension layer that swells with on-screen danger
  let combatGain = null, combatPad = null, intensity = 0, targetIntensity = 0, combatStep = 0;
  // reverb that changes per zone (big hall vs tight tunnel); applied once audio starts
  let pendingReverb = null, reverbWet = 0.4;
  // tone()/noiseHit() connect here; sfxAt() temporarily redirects it through a panner for positional one-shots
  let sfxTarget = null;
  // 'score' = the composed G.Music engine; 'classic' = the original drones + generative plucks
  let musicStyle = 'score', musicTrack = 'gloom', musicSilenced = false, musicBiome = null;

  function impulse(dur, decay) {
    const rate = ctx.sampleRate, len = rate * dur;
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  function init() {
    if (started) return;
    started = true;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = masterLevel();
    master.connect(ctx.destination);
    verb = ctx.createConvolver(); verb.buffer = impulse(2.4, 2.6);
    verbGain = ctx.createGain(); verbGain.gain.value = 0.4;
    verb.connect(verbGain); verbGain.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9;
    sfxBus.connect(master); sfxBus.connect(verb);
    sfxTarget = sfxBus;
    ambBus = ctx.createGain(); ambBus.gain.value = 0.05;   // gentler ambient bed (less invasive)
    ambBus.connect(master); ambBus.connect(verb);
    startAmbience();
    if (G.Music && G.Music.start) { G.Music.start(ctx, master, verb); G.Music.setTrack(musicTrack); }
    applyMusicStyle();
    if (pendingReverb) { G.Audio.setReverb(pendingReverb.wet, pendingReverb.dur, pendingReverb.decay); pendingReverb = null; }
  }

  // switch between the composed score and the classic drones: fade the drones, start/stop G.Music
  // the composed score plays in Score style when not hushed (cutscene). A boss fight has its
  // own theme, managed by startBoss/endBoss — gateScore leaves that alone.
  function gateScore(fastStop) {
    if (!G.Music) return;
    if (musicStyle !== 'score' || musicSilenced) { G.Music.pause(fastStop); return; }
    if (bossOn) return;                                  // boss theme is managed separately
    G.Music.setIntensity(intensity); G.Music.resume();
  }
  function applyMusicStyle() {
    if (!started) return;
    const classic = musicStyle === 'classic';
    droneNodes.forEach(n => n.g.gain.setTargetAtTime(classic ? (bossOn ? n.baseVol * 2 : n.baseVol) : 0.0001, ctx.currentTime, 1.2));
    gateScore();
  }

  function startAmbience() {
    // two slow detuned drones (root + fifth)
    droneNodes = [];
    const mk = (mult, vol, type) => {
      const o = ctx.createOscillator(); o.type = type;
      const g = ctx.createGain(); g.gain.value = 0;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.06 + Math.random() * 0.05;
      const lfoG = ctx.createGain(); lfoG.gain.value = vol * 0.35;
      lfo.connect(lfoG); lfoG.connect(g.gain);
      g.gain.setTargetAtTime(vol, ctx.currentTime, 4);
      o.connect(g); g.connect(ambBus);
      o.start(); lfo.start();
      droneNodes.push({ o, g, mult, baseVol: vol });
      return o;
    };
    mk(0.5, 0.055, 'sine');
    mk(0.75, 0.035, 'sine');
    mk(1.0, 0.022, 'triangle');
    retune();
    // cave wind: filtered noise
    const len = ctx.sampleRate * 4;
    const nb = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = nb.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + (Math.random() * 2 - 1) * 0.02) * 0.998; d[i] = last * 6; }
    const src = ctx.createBufferSource(); src.buffer = nb; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260; lp.Q.value = 0.4;
    windGain = ctx.createGain(); windGain.gain.value = 0.10;
    const wLfo = ctx.createOscillator(); wLfo.frequency.value = 0.045;
    const wLfoG = ctx.createGain(); wLfoG.gain.value = 0.05;
    wLfo.connect(wLfoG); wLfoG.connect(windGain.gain);
    src.connect(lp); lp.connect(windGain); windGain.connect(ambBus);
    src.start(); wLfo.start();
    // boss pulse bus (silent until boss)
    bossPulseGain = ctx.createGain(); bossPulseGain.gain.value = 0;
    bossPulseGain.connect(master);
    // combat layer: a warm consonant root+fifth bed under a driving arpeggio (built in update) —
    // silent until danger swells it. Upbeat rather than tense.
    combatGain = ctx.createGain(); combatGain.gain.value = 0;
    combatGain.connect(master); combatGain.connect(verb);
    const padA = ctx.createOscillator(); padA.type = 'triangle';
    const padB = ctx.createOscillator(); padB.type = 'triangle';
    const padLp = ctx.createBiquadFilter(); padLp.type = 'lowpass'; padLp.frequency.value = 900; padLp.Q.value = 0.6;
    const padG = ctx.createGain(); padG.gain.value = 0.28;            // quieter bed; the arpeggio carries it
    padA.connect(padLp); padB.connect(padLp); padLp.connect(padG); padG.connect(combatGain);
    padA.start(); padB.start();
    combatPad = { a: padA, b: padB };
    retune();
  }

  function retune() {
    if (!droneNodes.length) return;
    droneNodes.forEach(n => n.o.frequency.setTargetAtTime(areaRoot * n.mult, ctx.currentTime, 2.5));
    if (combatPad) {                                   // root + a (consonant) fifth above it
      combatPad.a.frequency.setTargetAtTime(areaRoot * 0.5, ctx.currentTime, 2);
      combatPad.b.frequency.setTargetAtTime(areaRoot * 0.75, ctx.currentTime, 2);
    }
  }

  // distance/pan of a world point relative to the camera (the camera tracks the player)
  function spatial(x, y) {
    const c = G.camera && G.camera.position;
    const cx = c ? c.x : x, cy = c ? c.y : (y || 0);
    const dx = x - cx, dy = (y || 0) - cy;
    const dist = Math.abs(dx) + Math.abs(dy) * 0.5;
    return { gain: Math.max(0.04, Math.min(1, 1 / (1 + Math.pow(dist / 9, 2)))), pan: Math.max(-1, Math.min(1, dx / 14)) };
  }

  // one-shot helpers --------------------------------------------------
  function tone(o) {
    if (!ctx) return;
    const t0 = ctx.currentTime + (o.delay || 0);
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f0, t0);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t0 + (o.t || 0.2));
    const g = ctx.createGain();
    const a = o.a || 0.005;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.2, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (o.t || 0.2));
    osc.connect(g); g.connect(o.dry ? master : (sfxTarget || sfxBus));
    osc.start(t0); osc.stop(t0 + (o.t || 0.2) + 0.05);
  }

  function noiseHit(o) {
    if (!ctx) return;
    const t0 = ctx.currentTime + (o.delay || 0);
    const dur = o.t || 0.15;
    const len = Math.max(1, ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = o.ftype || 'bandpass';
    f.frequency.setValueAtTime(o.f0 || 1000, t0);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t0 + dur);
    f.Q.value = o.q || 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.25, t0 + (o.a || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(sfxTarget || sfxBus);
    src.start(t0); src.stop(t0 + dur + 0.05);
  }

  const PENTA = [0, 3, 5, 7, 10, 12, 15];
  function bell(freq, vol, dur, delay) {
    delay = delay || 0;
    tone({ type: 'sine', f0: freq, vol: vol, t: dur, a: 0.01, delay });
    tone({ type: 'sine', f0: freq * 2.01, vol: vol * 0.35, t: dur * 0.6, a: 0.01, delay });
    tone({ type: 'sine', f0: freq * 2.99, vol: vol * 0.12, t: dur * 0.35, a: 0.01, delay });
  }

  // -------- prologue cinematic audio: rain + melancholic double bass --------
  let proGain = null, proPlaying = false, proTimer = null, rainNode = null, rainGain = null;
  function proVoice(freq, t0, dur, vol) {
    if (!proGain) return;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq;
    const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = freq;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 430; lp.Q.value = 0.7;
    const g = ctx.createGain(); g.gain.value = 0;
    o.connect(lp); lp.connect(g); sub.connect(g); g.connect(proGain);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + Math.min(0.45, dur * 0.3));   // slow bowed swell
    g.gain.setTargetAtTime(0.0001, t0 + dur * 0.62, dur * 0.34);
    o.start(t0); sub.start(t0); o.stop(t0 + dur + 0.7); sub.stop(t0 + dur + 0.7);
  }
  function proSchedule() {
    if (!proPlaying || !ctx) return;
    const t0 = ctx.currentTime + 0.05;
    const phrase = [55.0, 49.0, 43.65, 41.2];   // descending A-minor double-bass lament
    const nlen = 1.95;
    phrase.forEach((f, i) => proVoice(f, t0 + i * nlen, nlen * 1.05, 0.17));
    proVoice(82.41, t0, nlen * 4, 0.05);        // soft sustained colour above
    proTimer = setTimeout(proSchedule, nlen * phrase.length * 1000 - 70);
  }
  function startRain() {
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    rainNode = ctx.createBufferSource(); rainNode.buffer = buf; rainNode.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 0.4;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1100;
    rainGain = ctx.createGain(); rainGain.gain.value = 0;
    rainNode.connect(bp); bp.connect(hp); hp.connect(rainGain); rainGain.connect(master);
    rainGain.gain.setTargetAtTime(0.085, ctx.currentTime, 1.2);
    rainNode.start();
  }
  function stopRain() {
    if (rainGain) rainGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05);
    if (rainNode) { const n = rainNode; setTimeout(() => { try { n.stop(); } catch (e) { } }, 250); }
    rainNode = null; rainGain = null;
  }

  // ---- SFX as DATA -------------------------------------------------------------------
  // Every sound effect is a list of synth layers: { kind:'tone'|'noise'|'bell', ...params }.
  // tone/noise: type,f0,f1,t,vol,a,q,ftype,delay,dry,f0Rand (f0Rand adds a random 0..f0Rand to f0).
  // bell: f0,vol,dur,delay. These built-ins are the FALLBACK; the engine reads data/sfx.js
  // (window.G.SFX_DATA) as the source of truth, authored by the in-editor SFX designer.
  const clone = o => JSON.parse(JSON.stringify(o));
  const DEFAULT_SFX = {
    jump: [{ kind: 'tone', type: 'sine', f0: 340, f1: 520, t: 0.13, vol: 0.10 }, { kind: 'noise', f0: 900, f1: 1600, t: 0.08, vol: 0.05 }],
    wings: [{ kind: 'tone', type: 'sine', f0: 420, f1: 700, t: 0.18, vol: 0.12 }, { kind: 'noise', f0: 1800, f1: 3200, t: 0.16, vol: 0.07, q: 2 }],
    dash: [{ kind: 'noise', f0: 500, f1: 2400, t: 0.24, vol: 0.07, ftype: 'bandpass', q: 0.5, a: 0.03 }, { kind: 'noise', f0: 3000, f1: 1100, t: 0.18, vol: 0.035, ftype: 'highpass', q: 0.4, a: 0.02, delay: 0.02 }],
    swing: [{ kind: 'noise', f0: 2400, f1: 700, t: 0.09, vol: 0.18, q: 1.2 }, { kind: 'tone', type: 'triangle', f0: 260, f1: 170, t: 0.07, vol: 0.05 }],
    hit: [{ kind: 'noise', f0: 800, f1: 300, t: 0.1, vol: 0.3, ftype: 'lowpass' }, { kind: 'tone', type: 'square', f0: 150, f1: 85, t: 0.09, vol: 0.16 }],
    clink: [{ kind: 'tone', type: 'triangle', f0: 1250, f1: 900, t: 0.06, vol: 0.1 }],
    pogo: [{ kind: 'tone', type: 'sine', f0: 240, f1: 430, t: 0.12, vol: 0.14 }],
    kill: [{ kind: 'noise', f0: 600, f1: 120, t: 0.22, vol: 0.3, ftype: 'lowpass' }, { kind: 'bell', f0: 660, vol: 0.07, dur: 0.5 }],
    soul: [{ kind: 'tone', type: 'sine', f0: 860, f1: 1120, t: 0.06, vol: 0.04 }],
    hurt: [{ kind: 'tone', type: 'sawtooth', f0: 200, f1: 60, t: 0.3, vol: 0.3 }, { kind: 'noise', f0: 500, f1: 100, t: 0.25, vol: 0.25, ftype: 'lowpass' }, { kind: 'tone', type: 'sine', f0: 55, t: 0.25, vol: 0.3 }],
    die: [{ kind: 'tone', type: 'sawtooth', f0: 180, f1: 40, t: 1.1, vol: 0.25 }, { kind: 'noise', f0: 400, f1: 60, t: 1.0, vol: 0.2, ftype: 'lowpass' }, { kind: 'bell', f0: 330, vol: 0.1, dur: 2.0 }],
    focus: [{ kind: 'tone', type: 'sine', f0: 220, f1: 460, t: 0.9, vol: 0.07, a: 0.3 }],
    heal: [{ kind: 'bell', f0: 520, vol: 0.12, dur: 0.8 }, { kind: 'bell', f0: 780, vol: 0.08, dur: 1.0 }, { kind: 'noise', f0: 3000, f1: 6000, t: 0.3, vol: 0.05, q: 2 }],
    spell: [{ kind: 'noise', f0: 600, f1: 2400, t: 0.18, vol: 0.16, q: 1.5 }, { kind: 'tone', type: 'sawtooth', f0: 520, f1: 240, t: 0.22, vol: 0.13 }],
    spellHit: [{ kind: 'noise', f0: 1200, f1: 300, t: 0.16, vol: 0.2 }, { kind: 'bell', f0: 440, vol: 0.06, dur: 0.4 }],
    bench: [{ kind: 'bell', f0: 196, vol: 0.12, dur: 2.2 }, { kind: 'bell', f0: 294, vol: 0.09, dur: 2.4 }, { kind: 'bell', f0: 392, vol: 0.07, dur: 2.8 }],
    pickup: [{ kind: 'tone', type: 'sine', f0: 523, t: 0.5, vol: 0.09, delay: 0 }, { kind: 'tone', type: 'sine', f0: 659.26, t: 0.5, vol: 0.09, delay: 0.12 }, { kind: 'tone', type: 'sine', f0: 783.99, t: 0.5, vol: 0.09, delay: 0.24 }, { kind: 'tone', type: 'sine', f0: 1046.5, t: 0.5, vol: 0.09, delay: 0.36 }],
    roar: [{ kind: 'tone', type: 'sawtooth', f0: 110, f1: 38, t: 1.3, vol: 0.32 }, { kind: 'tone', type: 'sawtooth', f0: 165, f1: 55, t: 1.3, vol: 0.2 }, { kind: 'noise', f0: 300, f1: 80, t: 1.2, vol: 0.25, ftype: 'lowpass' }],
    stomp: [{ kind: 'tone', type: 'sine', f0: 80, f1: 35, t: 0.3, vol: 0.4 }, { kind: 'noise', f0: 250, f1: 60, t: 0.25, vol: 0.3, ftype: 'lowpass' }],
    bossHurt: [{ kind: 'noise', f0: 700, f1: 200, t: 0.12, vol: 0.25, ftype: 'lowpass' }, { kind: 'tone', type: 'square', f0: 120, f1: 70, t: 0.1, vol: 0.14 }],
    spore: [{ kind: 'noise', f0: 500, f1: 1500, t: 0.14, vol: 0.08, q: 2 }],
    uiBell: [{ kind: 'bell', f0: 660, vol: 0.06, dur: 1.2 }],
    drop: [{ kind: 'tone', type: 'sine', f0: 1900, f0Rand: 900, f1: 1200, t: 0.09, vol: 0.025 }],
    rumble: [{ kind: 'tone', type: 'sawtooth', f0: 46, f1: 34, t: 1.6, vol: 0.32 }, { kind: 'tone', type: 'sine', f0: 30, t: 1.6, vol: 0.3 }, { kind: 'noise', f0: 130, f1: 45, t: 1.5, vol: 0.18, ftype: 'lowpass' }],
    quake: [{ kind: 'tone', type: 'sine', f0: 64, f1: 28, t: 0.6, vol: 0.4 }, { kind: 'noise', f0: 200, f1: 50, t: 0.5, vol: 0.24, ftype: 'lowpass' }, { kind: 'bell', f0: 98, vol: 0.08, dur: 1.4 }],
    chime: [{ kind: 'bell', f0: 523, vol: 0.09, dur: 1.8 }, { kind: 'bell', f0: 784, vol: 0.06, dur: 2.0 }, { kind: 'bell', f0: 1046, vol: 0.04, dur: 1.6 }],
    talk: [{ kind: 'tone', type: 'square', f0: 220, f0Rand: 140, f1: 180, t: 0.06, vol: 0.04, a: 0.004 }]
  };
  // play one synth layer
  function playLayer(L) {
    if (!ctx || !L) return;
    if (L.kind === 'bell') { bell(L.f0, L.vol != null ? L.vol : 0.1, L.dur || 0.5, L.delay || 0); return; }
    const o = Object.assign({}, L);
    if (L.f0Rand) o.f0 = (L.f0 || 0) + Math.random() * L.f0Rand;
    if (L.kind === 'noise') noiseHit(o); else tone(o);
  }
  function playSpec(layers) { (layers || []).forEach(playLayer); }
  const makePlayer = layers => () => playSpec(layers);

  // the live set: a player fn per name, plus the source specs (for the editor)
  let SFX = {}, SFX_SPECS = {};
  function applySfxData(data) {
    const d = data || G.SFX_DATA || null;
    SFX_SPECS = clone((d && d.sfx) ? d.sfx : DEFAULT_SFX);
    SFX = {};
    for (const name in SFX_SPECS) SFX[name] = makePlayer(SFX_SPECS[name]);
  }
  applySfxData();

  G.Audio = {
    init,
    get sfxNames() { return Object.keys(SFX); },
    get started() { return started; },
    sfx(name) { if (started && SFX[name]) SFX[name](); },
    // ---- SFX designer (Edit ▸ Audio) hooks ----
    sfxExportDefaults: () => clone({ sfx: DEFAULT_SFX }),
    sfxExportCurrent: () => clone({ sfx: SFX_SPECS }),
    sfxApplyData: d => applySfxData(d),
    sfxSpec: name => clone(SFX_SPECS[name] || []),
    sfxPlaySpec(layers) { if (started) playSpec(layers); },   // audition an unsaved spec live
    setArea(root) { areaRoot = root; if (started) retune(); },
    setBoss(on) {
      bossOn = on;
      if (started) {
        if (musicStyle === 'classic') droneNodes.forEach(n => n.g.gain.setTargetAtTime(on ? n.baseVol * 2.0 : n.baseVol, ctx.currentTime, 1.5));
        if (windGain) windGain.gain.setTargetAtTime(on ? 0.16 : 0.10, ctx.currentTime, 1.5);
      }
      // score: biome music full-stops, then the boss theme drives in; on death it fades back to the biome
      if (G.Music && musicStyle === 'score' && !musicSilenced) { if (on) G.Music.startBoss(); else G.Music.endBoss(musicTrack); }
    },
    // soundtrack style: 'score' (composed adaptive music) or 'classic' (the original drones)
    setMusicStyle(style) { musicStyle = (style === 'classic') ? 'classic' : 'score'; applyMusicStyle(); },
    musicStyle: () => musicStyle,
    musicTracks: () => (G.Music ? G.Music.TRACK_IDS : []),
    // choose the score track for the current room ('auto' => by biome). No effect in classic style.
    setMusicTrack(track, biome) {
      // entering a room of the SAME biome (auto track) — let the music play on, no fade/restart
      if ((!track || track === 'auto') && biome != null && biome === musicBiome) { musicBiome = biome; return; }
      musicBiome = biome;
      const id = (!track || track === 'auto') ? (G.Music ? G.Music.trackForBiome(biome) : 'gloom') : track;
      musicTrack = id; if (G.Music) G.Music.setTrack(id);
    },
    // hush the composed score during the new-game prologue / cutscenes (they have their own audio)
    musicForState(state) {
      const silence = (state === 'prologue' || state === 'cutscene');
      if (silence === musicSilenced) return;
      musicSilenced = silence;
      gateScore();
    },
    // adaptive music: 0 = calm exploration, 1 = full combat tension (driven by on-screen danger)
    setIntensity(v) { targetIntensity = Math.max(0, Math.min(1, v || 0)); },
    // short musical stingers layered over the score (boss reveal, item get, secret found)
    stinger(name) {
      if (!started) return;
      const r = areaRoot;
      if (name === 'boss') {
        tone({ type: 'sawtooth', f0: r * 0.5, t: 0.75, vol: 0.16, a: 0.06 });
        tone({ type: 'sawtooth', f0: r * 0.75, t: 0.75, vol: 0.1, a: 0.06 });
        noiseHit({ f0: 130, f1: 40, t: 0.7, vol: 0.2, ftype: 'lowpass' });
        bell(r, 0.12, 0.9);
        tone({ type: 'sine', f0: r * 0.5, t: 1.5, vol: 0.14, a: 0.12, delay: 0.4 });
      } else if (name === 'item') {                       // triumphant ascending major arpeggio
        [0, 4, 7, 12, 16].forEach((s, i) => tone({ type: 'triangle', f0: r * 2 * Math.pow(2, s / 12), t: 0.5, vol: 0.1, a: 0.005, delay: i * 0.09 }));
        bell(r * 4, 0.07, 1.0);
      } else if (name === 'secret') {                      // soft sparkle
        [0, 7, 12, 16, 19].forEach((s, i) => tone({ type: 'sine', f0: r * 3 * Math.pow(2, s / 12), t: 0.45, vol: 0.06, a: 0.005, delay: i * 0.08 }));
      }
    },
    setMusicState(state) {
      if (state === 'boss') { this.setBoss(true); targetIntensity = Math.max(targetIntensity, 0.6); }
      else if (state === 'combat' || state === 'tense') targetIntensity = 0.8;
      else { targetIntensity = 0; }   // calm / explore
    },
    // per-zone reverb: wet level + tail length (swaps the convolver impulse live)
    setReverb(wet, dur, decay) {
      if (typeof wet === 'number') reverbWet = wet;
      if (!started) { pendingReverb = { wet, dur, decay }; return; }
      verbGain.gain.setTargetAtTime(reverbWet, ctx.currentTime, 0.7);
      if (dur) verb.buffer = impulse(dur, decay || 2.6);
    },
    // positional one-shot: any named SFX, attenuated + panned by distance to the camera
    sfxAt(name, x, y) {
      if (!started || !SFX[name]) return;
      const sp = spatial(x, y);
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      const g = ctx.createGain(); g.gain.value = sp.gain;
      let head = g;
      if (pan) { pan.pan.value = sp.pan; pan.connect(g); head = pan; }
      g.connect(sfxBus);
      const prev = sfxTarget; sfxTarget = head;
      try { SFX[name](); } finally { sfxTarget = prev; }
      setTimeout(() => { try { g.disconnect(); if (pan) pan.disconnect(); } catch (e) { } }, 2500);
    },
    // surface-aware footstep: soft filtered tick whose timbre depends on the ground material
    footstep(surface, x, y) {
      if (!started) return;
      const s = surface || 'stone';
      const mk = (o) => { const prev = sfxTarget; const sp = (x !== undefined) ? spatial(x, y) : { gain: 1, pan: 0 };
        const g = ctx.createGain(); g.gain.value = sp.gain * 0.7; g.connect(sfxBus); sfxTarget = g;
        try { noiseHit(o); } finally { sfxTarget = prev; } setTimeout(() => { try { g.disconnect(); } catch (e) { } }, 600); };
      if (s === 'wood') mk({ f0: 320, f1: 160, t: 0.07, vol: 0.12, ftype: 'lowpass', q: 1.1 });
      else if (s === 'water') mk({ f0: 1400, f1: 600, t: 0.12, vol: 0.09, ftype: 'bandpass', q: 0.8 });
      else if (s === 'grass' || s === 'moss') mk({ f0: 2600, f1: 1200, t: 0.06, vol: 0.06, ftype: 'highpass', q: 0.7 });
      else if (s === 'metal') { mk({ f0: 2200, f1: 1400, t: 0.05, vol: 0.08, q: 2 }); }
      else mk({ f0: 600, f1: 300, t: 0.06, vol: 0.10, ftype: 'lowpass', q: 1 });   // stone (default)
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.setTargetAtTime(masterLevel(), ctx.currentTime, 0.1);
      return muted;
    },
    setVolume(v) {
      volume = Math.max(0, Math.min(1, v));
      if (master) master.gain.setTargetAtTime(masterLevel(), ctx.currentTime, 0.08);
    },
    // ---- prologue cinematic ----
    prologueStart() {
      if (!started || proPlaying) return;
      proPlaying = true;
      proGain = ctx.createGain(); proGain.gain.value = 0;
      proGain.connect(master); proGain.connect(verb);
      proGain.gain.setTargetAtTime(1, ctx.currentTime, 1.6);
      proSchedule();
      startRain();
    },
    prologueResolve() {   // final long resolving bass note (starts when the cane is raised)
      if (!proGain) return;
      proPlaying = false;
      if (proTimer) { clearTimeout(proTimer); proTimer = null; }
      const t0 = ctx.currentTime;
      proVoice(55.0, t0, 1.5, 0.22);    // root A1 resolves and decays to silence ~at the smash
      proVoice(82.41, t0, 1.5, 0.09);
    },
    prologueStop() {      // clean cut at the smash — silence everything
      proPlaying = false;
      if (proTimer) { clearTimeout(proTimer); proTimer = null; }
      stopRain();
      if (proGain) { try { proGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05); } catch (e) { } const g = proGain; setTimeout(() => { try { g.disconnect(); } catch (e) { } }, 400); proGain = null; }
    },
    thunder() {
      if (!started) return;
      noiseHit({ f0: 90, f1: 28, t: 1.5, vol: 0.3, ftype: 'lowpass', q: 0.7 });
      noiseHit({ f0: 420, f1: 60, t: 0.55, vol: 0.16, ftype: 'lowpass' });
      tone({ type: 'sine', f0: 46, f1: 27, t: 1.3, vol: 0.22 });
      noiseHit({ f0: 2600, f1: 320, t: 0.16, vol: 0.12, q: 1.6, delay: 0.02 });
    },
    caneSmash() {
      if (!started) return;
      noiseHit({ f0: 3200, f1: 800, t: 0.12, vol: 0.22, q: 1.4 });    // metallic slash
      bell(1400, 0.08, 0.5); bell(2100, 0.05, 0.4);                   // steel ring
      tone({ type: 'sine', f0: 72, f1: 34, t: 0.5, vol: 0.36 });      // ground impact
      noiseHit({ f0: 220, f1: 50, t: 0.42, vol: 0.26, ftype: 'lowpass' });
    },
    update(dt) {
      if (!started) return;
      // smooth the danger level toward its target
      intensity += (targetIntensity - intensity) * Math.min(1, dt * 2.2);
      if (musicStyle === 'score') {                    // the composed engine drives the music
        if (G.Music) { G.Music.setIntensity(intensity); G.Music.update(dt); }
        dripT -= dt; if (dripT <= 0) { dripT = 3 + Math.random() * 8; SFX.drop(); }   // keep sparse water drips
        return;
      }
      // ---- classic style: drones + generative plucks + a combat groove ----
      if (combatGain) combatGain.gain.value = intensity * 0.22;
      dripT -= dt;
      if (dripT <= 0) { dripT = 2.5 + Math.random() * 7; SFX.drop(); }
      pluckT -= dt;
      if (pluckT <= 0) {
        pluckT = bossOn ? 999 : (5 + Math.random() * 9) * (1 - intensity * 0.6);   // denser melody under tension
        const step = PENTA[(Math.random() * PENTA.length) | 0];
        bell(areaRoot * 2 * Math.pow(2, step / 12), 0.05 + intensity * 0.03, 2.5 + Math.random() * 1.5);
        if (Math.random() < 0.4 + intensity * 0.3) {
          const s2 = PENTA[(Math.random() * PENTA.length) | 0];
          setTimeout(() => { if (started) bell(areaRoot * 2 * Math.pow(2, s2 / 12), 0.04, 2.5); }, 700 + Math.random() * 600);
        }
      }
      // combat groove: an upbeat driving arpeggio (root–fifth–octave) + a kick on the downbeat,
      // quickening with intensity. Routed through the combat bus so it only sounds while engaged.
      if (intensity > 0.12 && !bossOn) {
        combatPulseT -= dt;
        if (combatPulseT <= 0) {
          combatPulseT = 0.2 - intensity * 0.07;       // ~8th→16th notes as it heats up
          const prev = sfxTarget; sfxTarget = combatGain;
          try {
            const ARP = [1, 1.5, 2, 3, 2, 1.5];          // root, fifth, octave, fifth-above… (major, energetic)
            const note = ARP[combatStep % ARP.length];
            tone({ type: 'triangle', f0: areaRoot * note, t: 0.13, vol: 0.05 + intensity * 0.11, a: 0.004 });
            if (combatStep % 4 === 0) tone({ type: 'sine', f0: 92, f1: 46, t: 0.13, vol: 0.10 + intensity * 0.12 });   // kick
            else if (combatStep % 2 === 1) noiseHit({ f0: 4200, f1: 6500, t: 0.04, vol: 0.02 + intensity * 0.04, ftype: 'highpass', q: 0.7 });  // hat
            combatStep++;
          } finally { sfxTarget = prev; }
        }
      } else combatStep = 0;
      if (bossOn) {
        bossPulseT -= dt;
        if (bossPulseT <= 0) {
          bossPulseT = 0.62;
          tone({ type: 'sine', f0: 62, f1: 40, t: 0.22, vol: 0.22 });
          noiseHit({ f0: 200, f1: 70, t: 0.1, vol: 0.1, ftype: 'lowpass' });
        }
      }
    }
  };
})();
