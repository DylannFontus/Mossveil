// Playtest time controls (src/debugtime.js, roadmap #62): the engine half. Boots the real game and
// proves the ONE dt seam works both as pure math (scale / pause / step / non-play passthrough / the
// preset ladder) AND in the live loop: while paused the game clock G.time freezes; a single-step
// advances it by exactly one frame and re-freezes; resuming lets it flow again. Also dispatches the
// in-play hotkeys (\ pause, ] faster, 0 reset) and confirms typing into a field is ignored.
// Zero outbound network, no page errors.
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
    await game.setViewport({ width: 1000, height: 620 });
    game.on('pageerror', e => errs.push('[game] ' + e.message));
    game.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });
    await game.setRequestInterception(true);
    game.on('request', r => { const u = r.url(); if (/^https?:\/\//.test(u) && !u.includes('localhost') && !u.includes('127.0.0.1')) { netHits++; r.abort(); } else r.continue(); });
    await game.goto('http://localhost:7707/index.html?level=gloom&spawn=1', { waitUntil: 'load' });
    await wait(2400);

    // ---- stage A: pure-math asserts + arm the live-loop freeze test ----
    const a = await game.evaluate(() => {
      const DT = G.DebugTime, out = {};
      const near = (x, y) => Math.abs(x - y) < 1e-6;
      out.hasApi = !!(DT && DT.apply && DT.pause && DT.resume && DT.toggle && DT.step && DT.setScale && DT.slower && DT.faster && DT.reset && DT.status && DT.draw);

      DT.reset();
      out.applyNormal = near(DT.apply(0.016, 0.016, 'play'), 0.016);                 // scale 1 → unchanged
      DT.setScale(0.25); out.applySlow = near(DT.apply(0.02, 0.02, 'play'), 0.005);  // 0.25× → quarter dt
      out.passthroughScaled = near(DT.apply(0.02, 0.02, 'title'), 0.02);             // non-play never scaled
      DT.pause(); out.pausedZero = DT.apply(0.02, 0.02, 'play') === 0;               // paused → 0 in play
      out.pausedPassthrough = near(DT.apply(0.02, 0.02, 'menu'), 0.02);              // paused but non-play → untouched

      DT.reset(); DT.step(1);
      const f1 = DT.apply(0.02, 0.02, 'play'), f2 = DT.apply(0.02, 0.02, 'play');
      out.stepFrame = near(f1, 0.02) && f2 === 0 && DT.paused === true;              // one frame, then frozen, still paused

      DT.reset(); DT.faster(); const u2 = DT.scale; DT.faster(); const u4 = DT.scale;
      out.ladderUp = u2 === 2 && u4 === 4;
      DT.reset(); DT.slower(); const d05 = DT.scale; DT.slower(); const d025 = DT.scale;
      out.ladderDown = d05 === 0.5 && d025 === 0.25;
      DT.reset();
      out.resetClears = DT.scale === 1 && DT.paused === false && DT.status().modified === false;

      // arm the live-loop test: force play, zero the controls, freeze, remember the clock
      if (G.Main) G.Main.state = 'play';
      DT.reset();
      out.t0 = G.time;
      DT.pause();
      return out;
    });

    await wait(500);   // many RAFs fire, but a paused clock must not move

    const b = await game.evaluate(() => {
      const DT = G.DebugTime, out = {};
      out.tB = G.time;
      DT.step(1);                                                 // advance exactly one frame
      return out;
    });
    const pausedFroze = Math.abs(b.tB - a.t0) < 1e-9;   // a paused clock did not move across 500ms of RAFs

    await wait(500);

    const c = await game.evaluate(() => {
      const DT = G.DebugTime, out = {};
      out.tC = G.time;
      out.stillPaused = DT.paused === true;   // step does not un-pause
      DT.resume();
      out.tResume = G.time;
      return out;
    });
    const stepAdvancedOne = (c.tC - b.tB) > 0 && (c.tC - b.tB) < 0.08 && c.stillPaused;

    await wait(500);

    const d = await game.evaluate(() => {
      const DT = G.DebugTime, out = {};
      out.tD = G.time;

      // hotkeys (game is in 'play')
      DT.reset(); G.Main.state = 'play';
      dispatchEvent(new KeyboardEvent('keydown', { code: 'Backslash' })); out.hotkeyPause = DT.paused === true;
      dispatchEvent(new KeyboardEvent('keydown', { code: 'Backslash' })); out.hotkeyResume = DT.paused === false;
      dispatchEvent(new KeyboardEvent('keydown', { code: 'BracketRight' })); out.hotkeyFaster = DT.scale === 2;
      dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit0' })); out.hotkeyReset = DT.scale === 1;
      // typing into a field is ignored
      const inp = document.createElement('input'); document.body.appendChild(inp);
      inp.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backslash', bubbles: true })); out.typingIgnored = DT.paused === false;
      document.body.removeChild(inp);
      DT.reset();
      return out;
    });
    const resumeRuns = (d.tD - c.tResume) > 0.01;   // clock flows again after resume

    const all = Object.assign({}, a, { pausedFroze, stepAdvancedOne, resumeRuns }, d);
    console.log('TIMECTL-ENGINE:', JSON.stringify(all, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const need = ['hasApi', 'applyNormal', 'applySlow', 'passthroughScaled', 'pausedZero', 'pausedPassthrough', 'stepFrame', 'ladderUp', 'ladderDown', 'resetClears', 'pausedFroze', 'stepAdvancedOne', 'resumeRuns', 'hotkeyPause', 'hotkeyResume', 'hotkeyFaster', 'hotkeyReset', 'typingIgnored'];
    const ok = need.every(k => all[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'TIMECTL-ENGINE TEST: PASS' : 'TIMECTL-ENGINE TEST: FAIL  (' + need.filter(k => !all[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
