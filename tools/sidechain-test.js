// Music ducking / sidechain — GAME-SIDE seam test (roadmap #84). Boots the real game and proves the
// guarantee the user cares about: at the DEFAULT (inert) overlay nothing about the music changes. Even
// with audio started and SFX firing, NO duck node is spliced into musicBus->master (A._duckNode() is
// null), so the soundtrack graph — which tracks play, how they sound, every transition — is byte-identical
// to before. Then it authors a real duck, splices the node, and proves the live player path threads each
// SFX name into Sidechain.trigger() and that a 'hit' would dip the music to the computed level; a sound
// that isn't a trigger leaves the music untouched. Restores defaults. No errors. (Audio can't truly play
// in headless — no AudioContext gesture — so the proof is the graph state + the spied trigger + the math.)
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
      const out = {}, S = G.Sidechain, A = G.Audio;
      S.applyData(null);
      out.hasModule = !!S && typeof S.trigger === 'function' && S.isInert() && S.strengthFor('hit') === 0;
      const DEF = { depth: 0, attack: 0.06, hold: 0, release: 0.4, triggers: {} };
      out.dataIdentical = JSON.stringify(S.exportDefaults()) === JSON.stringify(DEF);
      // INERT: start audio + fire SFX; no duck node is ever spliced => musicBus->master is exactly as
      // before, so the soundtrack is byte-identical. envelope() returns null for everything too.
      A.init();
      A.sfx('hit'); A.sfx('hurt'); A.sfxAt('stomp', 5, 0);
      out.inertNoNode = A._duckNode() === null && S.envelope('hit') === null;
      // author a real duck and splice the node (a shipped game with this saved would splice at boot)
      S.applyData({ depth: 0.5, attack: 0.05, hold: 0, release: 0.3, triggers: { hit: 1, clink: 0.4 } });
      const node = A._duckInsert();
      out.spliced = !!node && S.attached() && A._duckNode() === node;
      out.strength = S.strengthFor('hit') === 0.5 && S.strengthFor('clink') === 0.2 && S.strengthFor('jump') === 0;
      // WIRING: the live player path threads each SFX name into Sidechain.trigger(). Spy on real triggers.
      const orig = S.trigger; const calls = [];
      S.trigger = (n) => { calls.push(n); return orig(n); };
      let threw = false;
      try { A.sfx('hit'); A.sfxAt('clink', 3, 1); A.sfx('jump'); } catch (e) { threw = true; }
      S.trigger = orig;
      out.wired = calls.indexOf('hit') >= 0 && calls.indexOf('clink') >= 0;
      out.noThrow = !threw;
      // the real envelope a 'hit' would schedule: dip the music to 1-strength (0.5), recover over release
      const env = orig('hit');
      out.ducks = !!env && Math.abs(env.lo - 0.5) < 1e-9 && env.release === 0.3 && env.attack === 0.05;
      out.notTrigger = orig('jump') === null;   // 'jump' isn't listed => music untouched for it
      S.applyData(null);
      out.restored = S.isInert() && S.strengthFor('hit') === 0 && S.envelope('hit') === null;
      return out;
    });

    console.log('RESULT:', JSON.stringify(o));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['hasModule', 'dataIdentical', 'inertNoNode', 'spliced', 'strength', 'wired', 'noThrow', 'ducks', 'notTrigger', 'restored'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'SIDECHAIN GAME TEST: PASS' : 'SIDECHAIN GAME TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
