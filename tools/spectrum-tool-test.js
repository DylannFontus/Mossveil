// Waveform / Spectrum analyser (roadmap #79): a live editor visualisation of the master AnalyserNode the
// game already taps (G.Audio.analyserInfo/waveform/spectrum/meterLevel). Pure read-only viz — NO dataset,
// nothing it writes. This test asserts the analyser hooks return correctly-sized data after init, the tool
// registers / opens / draws its oscilloscope + spectrum canvases (non-blank), snapshot() reports a peak,
// the auditions (sweep / SFX / music bed / freeze) don't throw, and #79 is marked done. Offline, no errors.
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
    const ed = await browser.newPage();
    ed.on('pageerror', e => errs.push('[editor] ' + e.message));
    ed.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });
    await ed.setRequestInterception(true);
    ed.on('request', r => { const u = r.url(); if (/^https?:\/\//.test(u) && !u.includes('localhost') && !u.includes('127.0.0.1')) { netHits++; r.abort(); } else r.continue(); });
    await ed.goto('http://localhost:7707/editor/editor.html', { waitUntil: 'load' });
    await wait(2800);

    const o = await ed.evaluate(async () => {
      const out = {}, T = G.Tools, A = G.Audio, MT = T.spectrum;
      // analyser hooks: after init the master analyser exists (fftSize 256 => 128 bins, 256-sample wave)
      if (A.init) { try { A.init(); } catch (_) { } }
      const info = A.analyserInfo();
      out.hooks = !!(A.analyserInfo && A.spectrum && A.waveform && A.testTone && MT && MT.snapshot && MT.start);
      out.infoShape = info.started === true && info.fftSize === 256 && info.bins === 128 && info.sampleRate > 0;
      const spec = A.spectrum(), wav = A.waveform();
      out.specLen = spec.length === 128;
      out.waveLen = wav.length === 256;
      // a passed-in buffer of the right length is reused in place (no allocation churn)
      const buf = new Uint8Array(128); out.reuseBuf = A.spectrum(buf) === buf;
      // a wrong-length buffer is replaced with a correctly sized one
      out.sizeGuard = A.spectrum(new Uint8Array(7)).length === 128;
      // ---- tool ----
      out.registered = T._test.toolIds().indexOf('spectrum') >= 0;
      out.inPalette = T._test.paletteSearch('spectrum').some(l => /spectrum|waveform|oscillo/i.test(l));
      out.roadmap = T.ROADMAP.some(g => g.items.some(i => i[0] === 79 && i[2] === 'done'));
      out.opened = T.openTool('spectrum');
      out.running = MT.isRunning() === true;            // draw loop starts on build
      // canvases present (oscilloscope 460x120 + spectrum 460x150) and drawn (grid/labels => non-blank)
      const scope = document.querySelector('canvas[width="460"][height="120"]');
      const spc = document.querySelector('canvas[width="460"][height="150"]');
      out.canvases = !!scope && !!spc;
      const nonBlank = cv => { if (!cv) return false; const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; for (let i = 0; i < d.length; i += 4) if (d[i] || d[i + 1] || d[i + 2]) return true; return false; };
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      out.scopeDrawn = nonBlank(scope);
      out.specDrawn = nonBlank(spc);
      // snapshot returns the analyser state with correctly-sized arrays + a peak bin
      const snap = MT.snapshot();
      out.snapshot = snap.wave.length === 256 && snap.freq.length === 128 && typeof snap.rms === 'number' && snap.peakBin >= 0 && snap.peakBin < 128;
      // auditions must not throw (headless ctx is suspended, so no real sound — just exercise the paths)
      let threw = false;
      try { MT.sweep(); MT.playSfx((A.sfxNames || [])[0]); MT.musicBed(true); MT.musicBed(false); const f = MT.freeze(true); out.freezes = f === true && MT.freeze(false) === false; } catch (e) { threw = true; }
      out.noThrow = !threw;
      out.testTone = (() => { try { A.testTone(440, 0.1); return true; } catch (_) { return false; } })();
      MT.stop(); out.stopped = MT.isRunning() === false;
      T.closeTool();
      return out;
    });

    console.log('SPECTRUM:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['hooks', 'infoShape', 'specLen', 'waveLen', 'reuseBuf', 'sizeGuard', 'registered', 'inPalette', 'roadmap', 'opened', 'running', 'canvases', 'scopeDrawn', 'specDrawn', 'snapshot', 'freezes', 'noThrow', 'testTone', 'stopped'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'SPECTRUM TOOL TEST: PASS' : 'SPECTRUM TOOL TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
