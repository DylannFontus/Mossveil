// Camera feel — GAME-SIDE seam test (roadmap #76). The editor never runs main.js's updateCamera()/
// camPunch(), so this boots the real game and proves the seams via the THREE camera's z position
// (z = CAM_Z - zoomPunch; no z-shake). All checks are RELATIVE deltas with the punch ease frozen
// (~0) and frames forced via requestAnimationFrame, so they don't depend on headless rAF timing,
// on CAM_Z, or on residual punch: an explicit camPunch(2) drops z by ~2, a no-arg camPunch() drops by
// the default ~0.8, and raising punchMax from 1 to 3 (both maxed out) drops z ~2 further. Restores
// defaults at the end. No page errors.
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
      const out = {}, M = G.Main, C = G.Cam;
      const frames = async n => { for (let i = 0; i < n; i++) await new Promise(r => requestAnimationFrame(r)); };
      C.applyData(null);
      out.hasModule = !!C && C.followX() === 6.5;
      const DEF = { followX: 6.5, followY: 5.5, lookAhead: 2.1, lookVelFactor: 0.16, lookVelMax: 2.2, lookSpring: 3, vBias: 1.2, vVelFactor: 0.07, vClampDown: -1.4, vClampUp: 0.7, punchMax: 3.2, punchEase: 9, punchDefault: 0.8 };
      out.dataIdentical = JSON.stringify(C.exportDefaults()) === JSON.stringify(DEF);
      const p = G.player; p.body.vx = 0; p.body.vy = 0;     // keep still: no landing/dash punches
      const z = () => G.camera.position.z;

      // freeze the ease (kick persists) + a high cap (nothing clamped); residual cancels in the delta
      C.applyData({ punchEase: 0.001, punchMax: 20 });
      await frames(6);
      let zb = z(); M.camPunch(2); await frames(8);
      out.dDrop = +(zb - z()).toFixed(3);
      out.punchDrops = out.dDrop > 1.6 && out.dDrop < 2.4;   // ≈ 2 (camPunch + updateCamera read G.Cam)
      // no-arg camPunch() uses punchDefault (≈0.8)
      zb = z(); M.camPunch(); await frames(8);
      out.dDef = +(zb - z()).toFixed(3);
      out.punchDefault = out.dDef > 0.5 && out.dDef < 1.1;   // ≈ 0.8

      // punchMax cap: max out at cap 1 vs cap 3 -> z sits ~2 lower at the higher cap
      C.applyData({ punchEase: 0.001, punchMax: 1 }); await frames(6); M.camPunch(100); await frames(8);
      const zc1 = z();
      C.applyData({ punchEase: 0.001, punchMax: 3 }); await frames(6); M.camPunch(100); await frames(8);
      const zc3 = z();
      out.dCap = +(zc1 - zc3).toFixed(3);
      out.punchCaps = out.dCap > 1.6 && out.dCap < 2.4;      // ≈ 2

      C.applyData(null); await frames(20);                  // restore + let the kick ease out
      out.restored = C.followX() === 6.5 && C.punchMax() === 3.2;
      return out;
    });

    console.log('RESULT:', JSON.stringify(o));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['hasModule', 'dataIdentical', 'punchDrops', 'punchDefault', 'punchCaps', 'restored'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'CAMERA GAME TEST: PASS' : 'CAMERA GAME TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
