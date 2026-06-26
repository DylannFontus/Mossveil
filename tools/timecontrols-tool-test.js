// Playtest time controls (roadmap #62): the editor half. The Time-controls tool (Edit ▸ Tools) is a
// remote for the running game's G.DebugTime, reached across the Play-here iframe. This injects a
// stand-in target (so the test needs no live game), opens the tool, and asserts it registers / is in
// the palette / marks #62 done, that every control (pause / resume / toggle / step / setScale / slower
// / faster / reset) calls through and the reported status follows, that the UI renders the transport +
// scale ladder, and that with no game it shows the "no game running" state. Zero outbound network.
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
      const T = G.Tools, MT = T.timectl, out = {};

      // ---- registration / palette / roadmap / API surface ----
      out.registered = T._test.toolIds().includes('timectl');
      out.inPalette = T._test.paletteSearch('time').some(l => /time|pause|step/i.test(l));
      out.roadmap = T.ROADMAP.some(g => g.items.some(i => i[0] === 62 && i[2] === 'done'));
      out.engineApi = !!(MT && MT.pause && MT.resume && MT.toggle && MT.step && MT.setScale && MT.slower && MT.faster && MT.reset && MT.status && MT.available);

      // ---- with NO game, controls fail gracefully and status reports unavailable ----
      MT._target = () => null;
      out.unavailable = MT.available() === false && MT.status().available === false && MT.pause() === false && MT.step() === false;
      out.openedEmpty = T.openTool('timectl');
      const emptyTxt = document.querySelector('.tc-host').textContent;
      out.emptyState = /No game is running/i.test(emptyTxt) && /Play here/i.test(emptyTxt);
      T.closeTool();

      // ---- inject a stand-in target that mimics G.DebugTime; assert the remote drives it ----
      const SCALES = [0.1, 0.25, 0.5, 1, 2, 4];
      const fake = {
        scale: 1, paused: false, _step: 0,
        status() { return { scale: this.scale, paused: this.paused, stepping: this._step > 0, modified: this.paused || this.scale !== 1 }; },
        setScale(s) { this.scale = s; }, pause() { this.paused = true; }, resume() { this.paused = false; this._step = 0; },
        toggle() { this.paused = !this.paused; }, step(n) { this._step += (n || 1); this.paused = true; },
        slower() { const i = SCALES.indexOf(this.scale); this.scale = i > 0 ? SCALES[i - 1] : this.scale; },
        faster() { const i = SCALES.indexOf(this.scale); this.scale = (i >= 0 && i < SCALES.length - 1) ? SCALES[i + 1] : this.scale; },
        reset() { this.scale = 1; this.paused = false; this._step = 0; }
      };
      MT._target = () => fake;

      out.available = MT.available() === true && MT.status().available === true;
      out.pauseThru = MT.pause() === true && fake.paused === true && MT.status().paused === true;
      out.resumeThru = MT.resume() === true && fake.paused === false;
      out.toggleThru = MT.toggle() === true && fake.paused === true; MT.resume();
      out.stepThru = MT.step(1) === true && fake._step === 1 && fake.paused === true; fake.resume();
      out.scaleThru = MT.setScale(0.5) === true && fake.scale === 0.5 && MT.status().scale === 0.5;
      out.slowerThru = (MT.slower(), fake.scale === 0.25);
      out.fasterThru = (MT.faster(), MT.faster(), fake.scale === 1);
      out.resetThru = MT.reset() === true && fake.scale === 1 && fake.paused === false && MT.status().modified === false;

      // ---- UI: transport + ladder render, and clicking the scale buttons drives the target ----
      out.opened = T.openTool('timectl');
      const host = document.querySelector('.tc-host');
      const btns = Array.prototype.slice.call(host.querySelectorAll('button'));
      out.hasTransport = btns.some(b => /Pause/.test(b.textContent)) && btns.some(b => /Step/.test(b.textContent)) && btns.some(b => /Reset/.test(b.textContent));
      out.hasLadder = btns.some(b => b.textContent === '2×') && btns.some(b => b.textContent === '0.25×');
      const fourx = btns.find(b => b.textContent === '4×'); if (fourx) fourx.click();
      out.ladderClick = fake.scale === 4;
      // banner reflects the scaled state after the click-driven re-render
      out.banner = /4×/.test(document.querySelector('.tc-host').textContent);
      const pauseBtn = Array.prototype.slice.call(document.querySelectorAll('.tc-host button')).find(b => /Pause/.test(b.textContent));
      if (pauseBtn) pauseBtn.click();
      out.pauseClick = fake.paused === true && /PAUSED/i.test(document.querySelector('.tc-host').textContent);
      T.closeTool();
      MT._target = null;   // restore
      return out;
    });

    console.log('TIMECTL-TOOL:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['registered', 'inPalette', 'roadmap', 'engineApi', 'unavailable', 'openedEmpty', 'emptyState', 'available', 'pauseThru', 'resumeThru', 'toggleThru', 'stepThru', 'scaleThru', 'slowerThru', 'fasterThru', 'resetThru', 'opened', 'hasTransport', 'hasLadder', 'ladderClick', 'banner', 'pauseClick'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'TIMECTL-TOOL TEST: PASS' : 'TIMECTL-TOOL TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
