// SFX randomization pools — GAME-SIDE seam test (roadmap #85). The editor never runs the audio engine,
// so this boots the real game and proves the seam: audio.js's playSpec() (used by every SFX player from
// makePlayer, and by sfxAt) routes the spec through G.SfxVar.varySpec(name), exposed read-only as
// G.Audio._varied. At defaults the variation is INERT — _varied returns the sound's exact stored spec
// untouched (byte-identical), AND the live player path actually threads the SFX name into varySpec
// (proven by a spy on a real A.sfx() call). A retune changes what a play would synthesise. Restores
// defaults. No errors. (Audio can't truly play in headless — no AudioContext gesture — so the proof is
// the resolver the call sites use + a spied trigger + a clean boot.)
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
      const out = {}, V = G.SfxVar, A = G.Audio;
      V.applyData(null);
      out.hasModule = !!V && typeof V.varySpec === 'function' && V.entryFor('hit').pitch === 0;
      const DEF = { default: { pitch: 0, gain: 0 }, pools: {} };
      out.dataIdentical = JSON.stringify(V.exportDefaults()) === JSON.stringify(DEF);
      out.hasHook = typeof A._varied === 'function';
      // INERT default: _varied returns the sound's exact stored spec — same reference every call (no
      // clone) and deep-equal to the published spec => the game synthesises byte-identical audio to before
      const names = ['hit', 'jump', 'pickup', 'swing'].filter(n => A.sfxNames.indexOf(n) >= 0);
      out.byteIdentical = names.length >= 3 && names.every(n =>
        A._varied(n) === A._varied(n) && JSON.stringify(A._varied(n)) === JSON.stringify(A.sfxSpec(n)));
      // retune: a +1 draw at ±12 st doubles f0 of every layer; result is a fresh clone (source untouched)
      V.applyData({ default: { pitch: 12, gain: 0 }, pools: {} });
      const base = A.sfxSpec('hit'), r = A._varied('hit', () => 1);
      out.retuned = r !== A.sfxSpec('hit') && r[0].f0 === base[0].f0 * 2 && JSON.stringify(A.sfxSpec('hit')) === JSON.stringify(base);
      V.applyData(null);
      // WIRING: the live player path threads the SFX name into varySpec. Spy on a real A.sfx() trigger.
      const orig = V.varySpec; const calls = [];
      V.varySpec = (layers, name, rng) => { calls.push(name); return orig(layers, name, rng); };
      let threw = false;
      try { A.init(); A.sfx('hit'); A.sfxAt('hit', 5, 2); } catch (e) { threw = true; }
      V.varySpec = orig;
      out.wired = calls.indexOf('hit') >= 0;
      out.noThrow = !threw;
      V.applyData(null);
      out.restored = A._varied('hit') === A._varied('hit') && V.entryFor('hit').pitch === 0;
      return out;
    });

    console.log('RESULT:', JSON.stringify(o));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['hasModule', 'dataIdentical', 'hasHook', 'byteIdentical', 'retuned', 'wired', 'noThrow', 'restored'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'SFXVAR GAME TEST: PASS' : 'SFXVAR GAME TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
