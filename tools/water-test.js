// Water & reflections — GAME-SIDE seam test (roadmap #75). The editor never runs post.js / world.js,
// so this boots the real game and proves the seams via the read-only Post._water() hook: the post.js
// `water` object's look defaults are seeded from G.WaterFX at load, and world.js's water FADE uses
// G.WaterFX.strength() (not the old hardcoded 0.55) as the fallback target — driven deterministically
// by W.applyLook({water:{y}}) + stepping W.updateLook(). Restores defaults at the end. No page errors.
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
      const out = {}, WX = G.WaterFX, Post = G.Post, Wd = G.World;
      WX.applyData(null);
      out.hasModule = !!WX && WX.strength() === 0.55;
      const DEF = { strength: 0.55, ripple: 1, fade: 1.6, caustics: 0.5, color: { r: 0.62, g: 0.78, b: 0.95 } };
      out.dataIdentical = JSON.stringify(WX.exportDefaults()) === JSON.stringify(DEF);
      out.hasHook = typeof Post._water === 'function';
      // init seam: if no water zone is active in this room, the post.js water defaults came from G.WaterFX
      const w0 = Post._water();
      out.initSeam = (w0.y === null) ? (Math.abs(w0.strength - 0.55) < 1e-6 && Math.abs(w0.color.r - 0.62) < 1e-6) : true;
      // world.js fade seam: a water target with NO strength must ramp toward G.WaterFX.strength()
      WX.applyData({ strength: 0.9 });
      Wd.applyLook({ water: { y: 0 } }, 1);          // to = {y:0} -> strength fallback = WX.strength()
      for (let i = 0; i < 90; i++) Wd.updateLook(0.02);   // run the tween to completion (1.8s > 1s dur)
      out.fadeSeam = Math.abs(Post._water().strength - 0.9) < 0.02;   // ramped to WX strength, not 0.55
      // cleanup
      Post.setWater(null); WX.applyData(null);
      out.restored = WX.strength() === 0.55 && WX.colorRGB().r === 0.62;
      return out;
    });

    console.log('RESULT:', JSON.stringify(o));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['hasModule', 'dataIdentical', 'hasHook', 'initSeam', 'fadeSeam', 'restored'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'WATER GAME TEST: PASS' : 'WATER GAME TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
