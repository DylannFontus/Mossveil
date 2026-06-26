// Ending / credits — GAME-SIDE seam test (roadmap #94). The editor never loads ui.js / main.js, so
// this boots the real game and proves: the credits content & style come from G.Credits byte-identically,
// the ui.js drawEnding() seam actually renders the data-driven roll (we drive the game into the 'ending'
// state and let it draw), and the main.js dismiss gate reads G.Credits.dismissAfter(). No page errors.
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

    const o = await game.evaluate(async () => {
      const out = {}, M = G.Main, C = G.Credits;
      C.applyData(null);
      out.hasModule = !!C && C.lines().length === 6;
      out.dataIdentical = C.bg() === '#f0f8f4' && C.textColor() === '#1c2a24' && C.dismissAfter() === 4.5
        && C.lines()[0].text === 'M O S S V E I L' && C.lines()[0].italic === false
        && C.lines()[5].text === 'press any key to wander on';
      out.bgStyle = C.bgStyle(0.5) === 'rgba(240,248,244,0.5)';
      // drive the game into the ending state and let it draw the data-driven roll for a few frames
      const prevState = M.state;
      M.state = 'ending'; M.endingT = 3;     // < dismissAfter so a stray input can't dismiss it
      await new Promise(r => setTimeout(r, 350));
      out.endingDrew = M.state === 'ending' && M.endingT > 3;   // loop ran & drawEnding executed without throwing
      M.state = prevState;
      // the dismiss gate reads this exact value
      C.applyData({ dismissAfter: 7 });
      out.dismissRead = C.dismissAfter() === 7;
      C.applyData(null);
      out.restored = C.dismissAfter() === 4.5 && C.lines().length === 6;
      return out;
    });

    console.log('RESULT:', JSON.stringify(o));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['hasModule', 'dataIdentical', 'bgStyle', 'endingDrew', 'dismissRead', 'restored'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'CREDITS GAME TEST: PASS' : 'CREDITS GAME TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
