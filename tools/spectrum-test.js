// Waveform / Spectrum analyser — GAME-SIDE seam test (roadmap #79). The viz is editor-only, but it reads
// new read-only taps on the master AnalyserNode added to src/audio.js, which the GAME also loads. This
// proves those additive getters are wired in the real game and — crucially — that they did NOT disturb the
// existing audio graph: the analyser is still the same 256-pt FFT the level meter taps, meterLevel() still
// works, firing SFX doesn't throw, and the new hooks return correctly-sized data. Nothing here is a seam
// into game behaviour (no soundtrack/mix change), so this is purely a "additive hooks intact" check.
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');
const path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.resolve(__dirname, '..');
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const server = spawn(process.execPath, [path.join(ROOT, 'tools', 'editor-server.js')], { stdio: 'pipe' });
  await wait(800);
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const errs = [];
  let netHits = 0;
  try {
    const game = await browser.newPage();
    await game.setViewport({ width: 1100, height: 680 });
    game.on('pageerror', e => errs.push('[game] ' + e.message));
    await game.setRequestInterception(true);
    game.on('request', r => { const u = r.url(); if (/^https?:\/\//.test(u) && !u.includes('localhost') && !u.includes('127.0.0.1')) { netHits++; r.abort(); } else r.continue(); });
    await game.goto('http://localhost:7707/index.html?level=gloom&spawn=1', { waitUntil: 'load' });
    await wait(2300);

    const o = await game.evaluate(() => {
      const out = {}, A = G.Audio;
      out.hasHooks = typeof A.analyserInfo === 'function' && typeof A.spectrum === 'function' && typeof A.waveform === 'function' && typeof A.testTone === 'function';
      // before init: hooks are safe (no analyser yet) — return empty arrays, never throw
      const i0 = A.analyserInfo();
      out.preInit = i0.started === false && i0.fftSize === 0 && A.spectrum().length === 0 && A.waveform().length === 0;
      A.init();
      const info = A.analyserInfo();
      // the analyser is UNCHANGED from before this feature: still 256-pt FFT (the meter's config)
      out.analyserIntact = info.started === true && info.fftSize === 256 && info.bins === 128 && info.sampleRate > 0;
      out.specLen = A.spectrum().length === 128;
      out.waveLen = A.waveform().length === 256;
      // time-domain silence centres at 128; spectrum floor at 0 — sane values from a suspended ctx
      const w = A.waveform(); out.waveCentred = w[0] === 128 && w[200] === 128;
      // meterLevel still works (it shares the same analyser) and stays in range
      const m = A.meterLevel(); out.meter = typeof m === 'number' && m >= 0 && m <= 1;
      // firing SFX + a test tone through the real graph must not throw
      let threw = false;
      try { A.sfx('hit'); A.sfxAt('clink', 4, 0); A.testTone(330, 0.1); A.testTone(120, 0.4, 'sawtooth', 4000); } catch (e) { threw = true; }
      out.noThrow = !threw;
      // reused-buffer contract (the viz preallocates and reuses each frame)
      const fb = new Uint8Array(128); out.reuse = A.spectrum(fb) === fb && fb.length === 128;
      return out;
    });

    console.log('RESULT:', JSON.stringify(o));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['hasHooks', 'preInit', 'analyserIntact', 'specLen', 'waveLen', 'waveCentred', 'meter', 'noThrow', 'reuse'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'SPECTRUM GAME TEST: PASS' : 'SPECTRUM GAME TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
