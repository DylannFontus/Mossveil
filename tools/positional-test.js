// Positional / 3D audio — GAME-SIDE seam test (roadmap #83). The editor never runs audio.js, so this
// boots the real game and proves the seam: audio.js's spatial() (used by Audio.sfxAt + footstep) routes
// through G.Positional.gainFor/distOf/panFor, exposed read-only as G.Audio._spatial. At defaults the
// spatialiser is BYTE-IDENTICAL to the old hardcoded formula; a retune changes what every positional
// one-shot would compute. Audio can't actually play in headless (no AudioContext gesture), so the proof
// is the resolver the call sites use reflecting G.Positional + a clean boot. Restores defaults. No errors.
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
      const out = {}, P = G.Positional, A = G.Audio;
      P.applyData(null);
      out.hasModule = !!P && P.gainFor && P.panFor && P.distOf && P.get('refDist') === 9;
      const DEF = { minGain: 0.04, refDist: 9, falloffPow: 2, panWidth: 14, yWeight: 0.5 };
      out.dataIdentical = JSON.stringify(P.exportDefaults()) === JSON.stringify(DEF);
      out.hasHook = typeof A._spatial === 'function';
      // the camera the spatialiser measures against
      const cam = G.camera, camX = cam.position.x, camY = cam.position.y;
      // old hardcoded spatial() formula (what we must stay byte-identical to at defaults)
      const oldSpatial = (dx, dy) => ({
        gain: Math.max(0.04, Math.min(1, 1 / (1 + Math.pow((Math.abs(dx) + Math.abs(dy) * 0.5) / 9, 2)))),
        pan: Math.max(-1, Math.min(1, dx / 14))
      });
      // byte-identical across several world points — comparing the live seam to the old literal maths,
      // using the EXACT dx/dy the engine computes (avoids float-rounding mismatches)
      let allId = true, sawVariation = false;
      [[7, 0], [9, 4], [20, 10], [-12, 3], [0, 0], [40, 0]].forEach(([ox, oy]) => {
        const x = camX + ox, y = camY + oy, dx = x - camX, dy = (y || 0) - camY;
        const sp = A._spatial(x, y), ref = oldSpatial(dx, dy);
        if (sp.gain !== ref.gain || sp.pan !== ref.pan) allId = false;
        if (ref.gain < 1 || ref.pan !== 0) sawVariation = true;   // ensure the cases actually exercise the curve
      });
      out.byteIdentical = allId && sawVariation;
      // a single clean probe point used for the retune assertions
      const x = camX + 7, y = camY, dx = x - camX;
      out.fadeDefaults = A._spatial(x, y).pan === Math.max(-1, Math.min(1, dx / 14));
      // retune -> the seam (and therefore every positional one-shot) reads the new pan width + floor
      P.applyData({ panWidth: 28, minGain: 0.2 });
      out.fadeRetuned = A._spatial(x, y).pan === Math.max(-1, Math.min(1, dx / 28)) && P.gainFor(9999) === 0.2;
      // calling the positional emitters does not throw (audio suspended in headless -> early return)
      let threw = false; try { A.sfxAt('hit', camX + 5, camY + 2); A.footstep('stone', camX - 4, camY); } catch (e) { threw = true; }
      out.noThrow = !threw;
      P.applyData(null);
      out.restored = A._spatial(x, y).pan === Math.max(-1, Math.min(1, dx / 14)) && P.get('minGain') === 0.04;
      return out;
    });

    console.log('RESULT:', JSON.stringify(o));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['hasModule', 'dataIdentical', 'hasHook', 'byteIdentical', 'fadeDefaults', 'fadeRetuned', 'noThrow', 'restored'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'POSITIONAL GAME TEST: PASS' : 'POSITIONAL GAME TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
