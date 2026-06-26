// Music transitions — GAME-SIDE seam test (roadmap #82). The editor never runs music.js, so this boots
// the real game and proves the seam: every transition duration in music.js routes through the MFX(key)
// resolver (exposed as G.Music._fade) which reads G.MusicFX. Audio scheduling can't be observed in
// headless (no AudioContext gesture), so the proof is that the resolver the call sites use reflects
// G.MusicFX — a retune changes what setTrack/startBoss/endBoss/resume/pause would schedule. The game
// also boots clean with the seamed music.js. Restores defaults at the end. No page errors.
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
      const out = {}, MX = G.MusicFX, Mu = G.Music;
      MX.applyData(null);
      out.hasModule = !!MX && MX.dur('trackSwapOut') === 0.32;
      const DEF = { trackSwapOut: 0.32, trackSwapIn: 0.28, bossStopFade: 0.16, bossSilence: 0.85, bossInFade: 0.18, bossOutFade: 0.3, biomeReturnFade: 0.9, resumeFade: 0.3, pauseFastFade: 0.18 };
      out.dataIdentical = JSON.stringify(MX.exportDefaults()) === JSON.stringify(DEF);
      out.hasHook = typeof Mu._fade === 'function';
      // the call sites use MFX(key) = Mu._fade; at defaults it returns the old literals
      out.fadeDefaults = Mu._fade('trackSwapOut') === 0.32 && Mu._fade('biomeReturnFade') === 0.9 && Mu._fade('pauseFastFade') === 0.18;
      // retune -> the resolver (and therefore every transition site) reads the new values
      MX.applyData({ trackSwapOut: 1.5, biomeReturnFade: 2.2, bossSilence: 0 });
      out.fadeRetuned = Mu._fade('trackSwapOut') === 1.5 && Mu._fade('biomeReturnFade') === 2.2 && Mu._fade('bossSilence') === 0;
      // every key resolves through the data module
      out.allKeysResolve = MX.keys().every(k => Mu._fade(k) === MX.dur(k));
      // calling a transition does not throw (audio is suspended in headless, so it early-returns cleanly)
      let threw = false; try { Mu.setTrack('verdant'); Mu.pause(true); } catch (e) { threw = true; }
      out.noThrow = !threw;
      MX.applyData(null);
      out.restored = Mu._fade('trackSwapOut') === 0.32;
      return out;
    });

    console.log('RESULT:', JSON.stringify(o));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['hasModule', 'dataIdentical', 'hasHook', 'fadeDefaults', 'fadeRetuned', 'allKeysResolve', 'noThrow', 'restored'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'MUSICFX GAME TEST: PASS' : 'MUSICFX GAME TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
