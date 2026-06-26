// MOSSVEIL — tool-spectrum.js : Waveform / Spectrum analyser (Edit ▸ Audio).  Roadmap #79.
// A live oscilloscope + frequency spectrum + VU meter reading the master AnalyserNode the game already
// taps for its level meter (G.Audio.analyserInfo/waveform/spectrum/meterLevel). Pure visualisation — it
// reads the running audio graph and never writes anything, so there is NO dataset and NO change to how
// the game sounds. Auditions (a frequency sweep, any SFX, a music bed) give you signal to watch; in the
// real editor you'll see whatever is actually playing.
(function () {
  const T = G.Tools, A = G.Audio;
  if (!T || !A) return;
  const perf = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  // ---------------- controller (test API: G.Tools.spectrum) ----------------
  let api = null, bodyEl = null, raf = 0, running = false, frozen = false;
  let waveBuf = null, freqBuf = null, peaks = null;          // reused per frame; peaks = decaying spectrum hold
  let scopeCv = null, specCv = null, vuBar = null, vuTxt = null, peakTxt = null;
  let musicOn = false, musicLoop = false, sweepN = 0, sweepTimer = 0;

  function ensureBufs() {
    const info = A.analyserInfo();
    if (info.fftSize && (!waveBuf || waveBuf.length !== info.fftSize)) waveBuf = new Uint8Array(info.fftSize);
    if (info.bins && (!freqBuf || freqBuf.length !== info.bins)) { freqBuf = new Uint8Array(info.bins); peaks = new Float32Array(info.bins); }
    return info;
  }

  const MT = T.spectrum = {
    get state() { return { running, frozen, musicOn }; },
    isRunning() { return running; },
    // a single read of the analyser — used by the headless test and the readouts
    snapshot() {
      if (A.init) { try { A.init(); } catch (_) { } }
      const info = ensureBufs();
      const wave = info.fftSize ? Array.from(A.waveform(waveBuf)) : [];
      const freq = info.bins ? Array.from(A.spectrum(freqBuf)) : [];
      let peakBin = 0, peakV = -1;
      for (let i = 0; i < freq.length; i++) if (freq[i] > peakV) { peakV = freq[i]; peakBin = i; }
      const peakHz = (info.sampleRate && info.fftSize) ? Math.round(peakBin * info.sampleRate / info.fftSize) : 0;
      return { info, wave, freq, rms: A.meterLevel(), peakBin, peakV, peakHz };
    },
    start() { running = true; if (!raf) loop(); return running; },
    stop() { running = false; if (raf) { cancelAnimationFrame(raf); raf = 0; } },
    freeze(on) { frozen = on == null ? !frozen : !!on; return frozen; },
    // ---- auditions: give the analyser something to show ----
    sweep() { if (A.init) { try { A.init(); } catch (_) { } } MT.start(); if (A.testTone) A.testTone(90, 2.6, 'sawtooth', 8200); },
    // stepped sweep variant (used if a single glide isn't supported): hops a tone up the spectrum
    sweepSteps() {
      if (A.init) { try { A.init(); } catch (_) { } } MT.start();
      if (sweepTimer) { clearInterval(sweepTimer); sweepTimer = 0; }
      sweepN = 0; sweepTimer = setInterval(() => { if (sweepN >= 24 || !document.body.contains(bodyEl)) { clearInterval(sweepTimer); sweepTimer = 0; return; } if (A.testTone) A.testTone(110 * Math.pow(1.21, sweepN), 0.18, 'square'); sweepN++; }, 150);
    },
    playSfx(name) { if (A.init) { try { A.init(); } catch (_) { } } MT.start(); if (name && A.sfx) try { A.sfx(name); } catch (_) { } },
    musicBed(on) {
      musicOn = on == null ? !musicOn : !!on;
      if (A.init) { try { A.init(); } catch (_) { } }
      MT.start();
      if (musicOn) {
        const tracks = (G.Music && G.Music.exportCurrent && G.Music.exportCurrent().tracks) || {};
        const def = tracks.gloom || tracks[Object.keys(tracks)[0]];
        if (G.Music && G.Music.previewDef && def) { G.Music.previewDef(def, 0.4); startMusicLoop(); }
      } else if (G.Music && G.Music.stopPreview) { G.Music.stopPreview(); }
      return musicOn;
    },
    openInTool() { return T.openTool('spectrum'); }
  };

  function startMusicLoop() {
    if (musicLoop) return; musicLoop = true;
    const tick = () => {
      if (!musicOn || !bodyEl || !document.body.contains(bodyEl)) { if (G.Music && G.Music.stopPreview) G.Music.stopPreview(); musicLoop = false; musicOn = false; return; }
      if (G.Music && G.Music.update) G.Music.update();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // ---------------- draw loop ----------------
  function loop() {
    raf = requestAnimationFrame(loop);
    if (!bodyEl || !document.body.contains(scopeCv)) { running = false; cancelAnimationFrame(raf); raf = 0; return; }
    const info = ensureBufs();
    if (!frozen) { if (info.fftSize) A.waveform(waveBuf); if (info.bins) A.spectrum(freqBuf); }
    drawScope(info); drawSpectrum(info); drawVU(info);
  }

  function drawScope(info) {
    const g = scopeCv.getContext('2d'), W = scopeCv.width, H = scopeCv.height, mid = H / 2;
    g.clearRect(0, 0, W, H);
    // grid
    g.strokeStyle = 'rgba(255,255,255,0.06)'; g.lineWidth = 1; g.beginPath();
    for (let x = 0; x <= W; x += W / 8) { g.moveTo(x, 0); g.lineTo(x, H); }
    g.moveTo(0, mid); g.lineTo(W, mid); g.stroke();
    g.fillStyle = 'rgba(180,190,210,0.5)'; g.font = '10px system-ui'; g.fillText('oscilloscope', 6, 13);
    if (!waveBuf || !info.fftSize) { idleNote(g, W, H, 'start a sound below to see the waveform'); return; }
    g.strokeStyle = '#5fd0c8'; g.lineWidth = 1.5; g.beginPath();
    const n = waveBuf.length;
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * W, y = mid - ((waveBuf[i] - 128) / 128) * (mid - 6); i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
  }

  function drawSpectrum(info) {
    const g = specCv.getContext('2d'), W = specCv.width, H = specCv.height, padB = 14;
    g.clearRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,0.06)'; g.lineWidth = 1; g.beginPath();
    for (let yy = 0; yy <= H - padB; yy += (H - padB) / 4) { g.moveTo(0, yy); g.lineTo(W, yy); } g.stroke();
    g.fillStyle = 'rgba(180,190,210,0.5)'; g.font = '10px system-ui'; g.fillText('spectrum', 6, 13);
    if (!freqBuf || !info.bins) { idleNote(g, W, H, 'start a sound below to see the spectrum'); return; }
    const n = freqBuf.length, bw = W / n, base = H - padB;
    for (let i = 0; i < n; i++) {
      const v = freqBuf[i] / 255, h = v * (base - 4);
      // peak-hold decays slowly
      if (frozen) { } else if (v > (peaks[i] || 0)) peaks[i] = v; else peaks[i] = Math.max(v, (peaks[i] || 0) - 0.012);
      const hue = 200 - v * 160;                         // teal→amber as it gets louder
      g.fillStyle = 'hsl(' + hue + ',70%,' + (28 + v * 34) + '%)';
      g.fillRect(i * bw, base - h, Math.max(1, bw - 0.5), h);
      const ph = peaks[i] * (base - 4);
      g.fillStyle = 'rgba(232,93,154,0.85)'; g.fillRect(i * bw, base - ph - 1, Math.max(1, bw - 0.5), 1.5);
    }
    // frequency axis labels
    g.fillStyle = 'rgba(180,190,210,0.45)'; g.font = '9px system-ui';
    if (info.sampleRate && info.fftSize) {
      const nyq = info.sampleRate / 2;
      [0, 0.25, 0.5, 0.75, 1].forEach(f => { const hz = Math.round(nyq * f); const lbl = hz >= 1000 ? (hz / 1000).toFixed(hz >= 10000 ? 0 : 1) + 'k' : hz + ''; g.fillText(lbl, Math.min(W - 16, f * W + 2), H - 3); });
    }
  }

  function drawVU(info) {
    const lvl = A.meterLevel ? A.meterLevel() : 0;
    if (vuBar) { vuBar.style.width = Math.round(lvl * 100) + '%'; vuBar.style.background = lvl > 0.8 ? '#e8636b' : (lvl > 0.5 ? '#e8c45d' : '#5fd0c8'); }
    if (vuTxt) { const db = lvl > 0.0005 ? (20 * Math.log10(lvl)).toFixed(1) + ' dB' : '−∞ dB'; vuTxt.textContent = db; }
    if (peakTxt) {
      let pk = 0, pv = -1; if (freqBuf) for (let i = 0; i < freqBuf.length; i++) if (freqBuf[i] > pv) { pv = freqBuf[i]; pk = i; }
      const hz = (info.sampleRate && info.fftSize && pv > 8) ? Math.round(pk * info.sampleRate / info.fftSize) : 0;
      peakTxt.textContent = hz ? ('peak ' + (hz >= 1000 ? (hz / 1000).toFixed(1) + ' kHz' : hz + ' Hz')) : 'peak —';
    }
  }

  function idleNote(g, W, H, msg) { g.fillStyle = 'rgba(180,190,210,0.55)'; g.font = '11px system-ui'; g.fillText(msg, W / 2 - g.measureText(msg).width / 2, H / 2 + 4); }

  // ---------------- UI ----------------
  function el(t, a, p, x) { return api.el(t, a, p, x); }
  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column';
    const head = el('div', { style: 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line)' }, bodyEl);
    el('div', { style: 'font-weight:600;font-size:15px' }, head, '📊 Spectrum & waveform');
    el('div', { style: 'flex:1' }, head);
    const info = A.analyserInfo();
    el('span', { class: 'tc-mut', style: 'font-size:11px' }, head, info.started ? (info.fftSize + '-pt FFT · ' + Math.round((info.sampleRate || 0) / 1000) + ' kHz') : 'audio idle');

    const wrap = el('div', { style: 'flex:1;overflow:auto;padding:14px 16px;min-height:0' }, bodyEl);
    el('div', { class: 'tc-mut', style: 'margin-bottom:10px;font-size:12px;max-width:560px' }, wrap,
      'A live view of the master output — the same signal the HUD level-meter reads. It only watches the audio; nothing here changes how the game sounds. Play something below to give it a signal.');

    // ---- VU meter ----
    const vurow = el('div', { class: 'tc-row', style: 'margin:4px 0 12px;align-items:center;gap:10px' }, wrap);
    el('label', { style: 'width:48px' }, vurow, 'Level');
    const track = el('div', { style: 'flex:1;max-width:360px;height:14px;background:#0d0f14;border:1px solid var(--line);border-radius:7px;overflow:hidden' }, vurow);
    vuBar = el('div', { style: 'height:100%;width:0%;background:#5fd0c8;transition:width .05s linear' }, track);
    vuTxt = el('span', { class: 'tc-mut', style: 'width:70px;text-align:right;font-variant-numeric:tabular-nums' }, vurow, '−∞ dB');
    peakTxt = el('span', { class: 'tc-mut', style: 'min-width:96px' }, vurow, 'peak —');

    // ---- canvases ----
    scopeCv = el('canvas', { width: 460, height: 120, style: 'display:block;border:1px solid var(--line);border-radius:6px 6px 0 0;background:#0d0f14' }, wrap);
    specCv = el('canvas', { width: 460, height: 150, style: 'display:block;border:1px solid var(--line);border-top:none;border-radius:0 0 6px 6px;background:#0d0f14' }, wrap);

    // ---- audition controls ----
    const c = el('div', { style: 'display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:14px 0 6px' }, wrap);
    el('button', { class: 'tbtn play', onclick: () => MT.sweep() }, c, '▶ Sweep');
    const sel = el('select', { style: 'min-width:120px' }, c);
    (A.sfxNames || []).forEach(n => el('option', { value: n }, sel, n));
    el('button', { class: 'tbtn', onclick: () => MT.playSfx(sel.value) }, c, '🔊 Play SFX');
    const mb = el('button', { class: 'tbtn', onclick: () => { MT.musicBed(); mb.classList.toggle('play', musicOn); mb.textContent = (musicOn ? '⏹ Stop bed' : '🎵 Music bed'); } }, c, '🎵 Music bed');
    const fz = el('button', { class: 'tbtn', onclick: () => { const f = MT.freeze(); fz.classList.toggle('play', f); fz.textContent = f ? '▶ Resume' : '❄ Freeze'; } }, c, '❄ Freeze');
    el('span', { class: 'tc-mut', style: 'flex-basis:100%;font-size:11px' }, wrap, 'Pink line on the spectrum is the recent peak-hold. In the editor you can also just play the game in another tab — this watches whatever the master bus is actually outputting.');

    MT.start();
  }

  T.registerTool({
    id: 'spectrum', label: 'Spectrum & waveform', icon: '📊', group: 'Audio',
    sub: 'live oscilloscope + frequency spectrum + level meter',
    build(host, a) { api = a; bodyEl = host; render(); }
  });
  if (T.roadmapDone) T.roadmapDone(79);
})();
