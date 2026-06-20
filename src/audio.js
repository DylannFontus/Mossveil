// MOSSVEIL — audio.js : fully procedural WebAudio ambience + sfx
(function () {
  let ctx = null, master = null, verb = null, verbGain = null, sfxBus = null, ambBus = null;
  let muted = false, started = false, volume = 0.8;
  const masterLevel = () => (muted ? 0 : 0.55 * volume);
  let droneNodes = [], windGain = null;
  let dripT = 2, pluckT = 3, bossPulseT = 0;
  let areaRoot = 220, bossOn = false;
  let bossPulseGain = null;

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
    ambBus = ctx.createGain(); ambBus.gain.value = 0.8;
    ambBus.connect(master); ambBus.connect(verb);
    startAmbience();
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
  }

  function retune() {
    if (!droneNodes.length) return;
    droneNodes.forEach(n => n.o.frequency.setTargetAtTime(areaRoot * n.mult, ctx.currentTime, 2.5));
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
    osc.connect(g); g.connect(o.dry ? master : sfxBus);
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
    src.connect(f); f.connect(g); g.connect(sfxBus);
    src.start(t0); src.stop(t0 + dur + 0.05);
  }

  const PENTA = [0, 3, 5, 7, 10, 12, 15];
  function bell(freq, vol, dur) {
    tone({ type: 'sine', f0: freq, vol: vol, t: dur, a: 0.01 });
    tone({ type: 'sine', f0: freq * 2.01, vol: vol * 0.35, t: dur * 0.6, a: 0.01 });
    tone({ type: 'sine', f0: freq * 2.99, vol: vol * 0.12, t: dur * 0.35, a: 0.01 });
  }

  const SFX = {
    jump() { tone({ type: 'sine', f0: 340, f1: 520, t: 0.13, vol: 0.10 }); noiseHit({ f0: 900, f1: 1600, t: 0.08, vol: 0.05 }); },
    wings() { tone({ type: 'sine', f0: 420, f1: 700, t: 0.18, vol: 0.12 }); noiseHit({ f0: 1800, f1: 3200, t: 0.16, vol: 0.07, q: 2 }); },
    dash() { noiseHit({ f0: 1400, f1: 240, t: 0.2, vol: 0.22, q: 0.8 }); },
    swing() { noiseHit({ f0: 2400, f1: 700, t: 0.09, vol: 0.18, q: 1.2 }); tone({ type: 'triangle', f0: 260, f1: 170, t: 0.07, vol: 0.05 }); },
    hit() { noiseHit({ f0: 800, f1: 300, t: 0.1, vol: 0.3, ftype: 'lowpass' }); tone({ type: 'square', f0: 150, f1: 85, t: 0.09, vol: 0.16 }); },
    clink() { tone({ type: 'triangle', f0: 1250, f1: 900, t: 0.06, vol: 0.1 }); },
    pogo() { tone({ type: 'sine', f0: 240, f1: 430, t: 0.12, vol: 0.14 }); },
    kill() { noiseHit({ f0: 600, f1: 120, t: 0.22, vol: 0.3, ftype: 'lowpass' }); bell(660, 0.07, 0.5); },
    soul() { tone({ type: 'sine', f0: 860, f1: 1120, t: 0.06, vol: 0.04 }); },
    hurt() {
      tone({ type: 'sawtooth', f0: 200, f1: 60, t: 0.3, vol: 0.3 });
      noiseHit({ f0: 500, f1: 100, t: 0.25, vol: 0.25, ftype: 'lowpass' });
      tone({ type: 'sine', f0: 55, t: 0.25, vol: 0.3 });
    },
    die() {
      tone({ type: 'sawtooth', f0: 180, f1: 40, t: 1.1, vol: 0.25 });
      noiseHit({ f0: 400, f1: 60, t: 1.0, vol: 0.2, ftype: 'lowpass' });
      bell(330, 0.1, 2.0);
    },
    focus() { tone({ type: 'sine', f0: 220, f1: 460, t: 0.9, vol: 0.07, a: 0.3 }); },
    heal() { bell(520, 0.12, 0.8); bell(780, 0.08, 1.0); noiseHit({ f0: 3000, f1: 6000, t: 0.3, vol: 0.05, q: 2 }); },
    spell() { noiseHit({ f0: 600, f1: 2400, t: 0.18, vol: 0.16, q: 1.5 }); tone({ type: 'sawtooth', f0: 520, f1: 240, t: 0.22, vol: 0.13 }); },
    spellHit() { noiseHit({ f0: 1200, f1: 300, t: 0.16, vol: 0.2 }); bell(440, 0.06, 0.4); },
    bench() { bell(196, 0.12, 2.2); bell(294, 0.09, 2.4); bell(392, 0.07, 2.8); },
    pickup() { [0, 4, 7, 12].forEach((s, i) => tone({ type: 'sine', f0: 523 * Math.pow(2, s / 12), t: 0.5, vol: 0.09, delay: i * 0.12 })); },
    roar() {
      tone({ type: 'sawtooth', f0: 110, f1: 38, t: 1.3, vol: 0.32 });
      tone({ type: 'sawtooth', f0: 165, f1: 55, t: 1.3, vol: 0.2 });
      noiseHit({ f0: 300, f1: 80, t: 1.2, vol: 0.25, ftype: 'lowpass' });
    },
    stomp() { tone({ type: 'sine', f0: 80, f1: 35, t: 0.3, vol: 0.4 }); noiseHit({ f0: 250, f1: 60, t: 0.25, vol: 0.3, ftype: 'lowpass' }); },
    bossHurt() { noiseHit({ f0: 700, f1: 200, t: 0.12, vol: 0.25, ftype: 'lowpass' }); tone({ type: 'square', f0: 120, f1: 70, t: 0.1, vol: 0.14 }); },
    spore() { noiseHit({ f0: 500, f1: 1500, t: 0.14, vol: 0.08, q: 2 }); },
    uiBell() { bell(660, 0.06, 1.2); },
    drop() { tone({ type: 'sine', f0: 1900 + Math.random() * 900, f1: 1200, t: 0.09, vol: 0.025 }); },
    // cinematic / cutscene
    rumble() {
      tone({ type: 'sawtooth', f0: 46, f1: 34, t: 1.6, vol: 0.32 });
      tone({ type: 'sine', f0: 30, t: 1.6, vol: 0.3 });
      noiseHit({ f0: 130, f1: 45, t: 1.5, vol: 0.18, ftype: 'lowpass' });
    },
    quake() {
      tone({ type: 'sine', f0: 64, f1: 28, t: 0.6, vol: 0.4 });
      noiseHit({ f0: 200, f1: 50, t: 0.5, vol: 0.24, ftype: 'lowpass' });
      bell(98, 0.08, 1.4);
    },
    chime() { bell(523, 0.09, 1.8); bell(784, 0.06, 2.0); bell(1046, 0.04, 1.6); },
    talk() { tone({ type: 'square', f0: 220 + Math.random() * 140, f1: 180, t: 0.06, vol: 0.04, a: 0.004 }); }
  };

  G.Audio = {
    init,
    get started() { return started; },
    sfx(name) { if (started && SFX[name]) SFX[name](); },
    setArea(root) { areaRoot = root; if (started) retune(); },
    setBoss(on) {
      bossOn = on;
      if (!started) return;
      droneNodes.forEach(n => n.g.gain.setTargetAtTime(on ? n.baseVol * 2.0 : n.baseVol, ctx.currentTime, 1.5));
      if (windGain) windGain.gain.setTargetAtTime(on ? 0.16 : 0.10, ctx.currentTime, 1.5);
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
    update(dt) {
      if (!started) return;
      dripT -= dt;
      if (dripT <= 0) { dripT = 2.5 + Math.random() * 7; SFX.drop(); }
      pluckT -= dt;
      if (pluckT <= 0) {
        pluckT = bossOn ? 999 : 5 + Math.random() * 9;
        const step = PENTA[(Math.random() * PENTA.length) | 0];
        bell(areaRoot * 2 * Math.pow(2, step / 12), 0.05, 2.5 + Math.random() * 1.5);
        if (Math.random() < 0.4) {
          const s2 = PENTA[(Math.random() * PENTA.length) | 0];
          setTimeout(() => { if (started) bell(areaRoot * 2 * Math.pow(2, s2 / 12), 0.04, 2.5); }, 700 + Math.random() * 600);
        }
      }
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
