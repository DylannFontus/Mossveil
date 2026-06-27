// Contextual hints (src/tutorial.js, roadmap #93): the engine half. Boots the real game and proves
// G.Tutorial: the default overlay round-trips byte-identical, triggers evaluate against the live game,
// the main-loop update shows AT MOST one new hint per frame via G.UI.banner and records it in
// G.save.tutorialSeen (so it never repeats), a disabled overlay shows nothing, a custom trigger fires,
// and reset() re-arms. Zero outbound network, no page errors.
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

    const o = await game.evaluate(() => {
      const T = G.Tutorial, out = {};
      out.hasApi = !!(T && T.applyData && T.exportDefaults && T.exportCurrent && T.update && T.reset && T.status && T.TRIGS && T.evalTrigger && T.seen);

      // default overlay round-trips byte-identical
      T.applyData(T.exportDefaults());
      out.identical = JSON.stringify(T.exportCurrent()) === JSON.stringify(T.exportDefaults());
      out.trigs = T.TRIGS.indexOf('roomEnter') >= 0 && T.TRIGS.indexOf('propNear') >= 0 && T.TRIGS.length === 5;

      // trigger eval against the live game
      out.roomEnter = T.evalTrigger({ type: 'roomEnter' }) === true;
      out.hpBelowTrue = T.evalTrigger({ type: 'hpBelow', n: 999 }) === true;
      out.hpBelowFalse = T.evalTrigger({ type: 'hpBelow', n: 0 }) === false;
      out.propNone = T.evalTrigger({ type: 'propNear', prop: '__nope__', dist: 99 }) === false;

      // arm the live loop: spy the banner, force play, reset seen
      const banners = []; const ob = G.UI.banner; G.UI.banner = function (txt, pl, s) { banners.push(txt); return ob.apply(this, arguments); };
      if (G.Main) G.Main.state = 'play';
      G.player.dead = false;
      T.reset();
      T.update(0.016);
      out.firedOne = banners.length === 1 && Object.keys(G.save.tutorialSeen || {}).length === 1;
      const first = Object.keys(G.save.tutorialSeen)[0];
      out.moveFirst = first === 'move';                 // roomEnter 'move' is first in the list
      const seenCount1 = Object.keys(G.save.tutorialSeen).length;
      T.update(0.016);                                  // 'move' already seen → must not refire it
      out.noRefire = G.save.tutorialSeen.move && Object.keys(G.save.tutorialSeen).length >= seenCount1;

      // disabled → nothing fires
      T.applyData({ enabled: false, hints: [{ id: 'z', trigger: { type: 'roomEnter' }, text: 'z' }] });
      T.reset(); banners.length = 0; T.update(0.016);
      out.disabled = banners.length === 0 && Object.keys(G.save.tutorialSeen || {}).length === 0;

      // a custom trigger fires + banners the right text
      T.applyData({ enabled: true, hints: [{ id: 'lowtest', trigger: { type: 'hpBelow', n: 999 }, text: 'low!' }] });
      T.reset(); banners.length = 0; T.update(0.016);
      out.customFired = banners.indexOf('low!') >= 0 && !!G.save.tutorialSeen.lowtest;

      // reset clears the seen set
      T.reset(); out.resetClears = Object.keys(G.save.tutorialSeen || {}).length === 0;

      G.UI.banner = ob; T.applyData(G.TUTORIAL_DATA);   // restore
      return out;
    });

    console.log('TUTORIAL-ENGINE:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['hasApi', 'identical', 'trigs', 'roomEnter', 'hpBelowTrue', 'hpBelowFalse', 'propNone', 'firedOne', 'moveFirst', 'noRefire', 'disabled', 'customFired', 'resetClears'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'TUTORIAL-ENGINE TEST: PASS' : 'TUTORIAL-ENGINE TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
