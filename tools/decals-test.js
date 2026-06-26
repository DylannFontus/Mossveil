// Decals & marks — GAME-SIDE seam test (roadmap #72). Persistent ground marks are a NET-NEW render
// feature: src/decals.js spawns flat textured quads into a scene-level 'decals' group, fades them in
// D.update(dt), recycles past the cap, and wipes them on room load. The game seams call
// G.Decals.emit(event, x, y) on enemy death, boss death, hard landing and a bolt hitting a wall.
// This boots the REAL game and proves, directly in the live THREE scene: (1) the module is wired,
// (2) spawn/emit actually add a mesh to the in-scene decals group, (3) an unbound or disabled event
// makes no mark, (4) update() fades opacity then expires the mark, (5) the cap recycles the oldest,
// and (6) W.load wipes the room's marks. Restored in finally.
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
      const out = {}, D = G.Decals, W = G.World;
      out.hasModule = !!(D && D.spawn && D.emit && D.update && D.clear && D.count && W && W.load);
      const saved = D.exportCurrent();
      // count meshes living under the in-scene 'decals' group (the real render proof)
      const groupCount = () => { let n = 0; G.scene.traverse(o2 => { if (o2.name === 'decals') n = o2.children.length; }); return n; };
      let threw = false;
      try {
        D.applyData(null); D.clear();
        out.startEmpty = D.count() === 0;
        // (1) spawn places a real mesh in the scene
        const rec = D.spawn('scorch', 5, 3);
        out.spawnRec = !!(rec && rec.mesh && rec.mat);
        out.spawnCount = D.count() === 1;
        out.inScene = groupCount() === 1;
        // (2) emit honours the event binding (enemyDeath -> scorch by default)
        D.emit('enemyDeath', 6, 3);
        out.emitBound = D.count() === 2;
        // (3) an unbound event makes no mark
        D.applyData({ events: { playerLand: '' }, kinds: saved.kinds });
        out.emitNone = D.emit('playerLand', 7, 3) === null;
        // (4) update fades opacity, then expires the mark
        D.applyData({ kinds: { tk: { tex: 'stain', color: 0x888888, size: 1, sizeVar: 0, alpha: 0.8, life: 1, fadeIn: 0.2, fadeOut: 0.2, rot: 'random', blend: 'normal', yOff: 0 } }, events: saved.events });
        D.clear(); const r2 = D.spawn('tk', 0, 0);
        D.update(0.1);   // inside fade-in: opacity climbing from 0, below full alpha
        out.fadeIn = r2.mat.opacity > 0 && r2.mat.opacity < 0.8;
        D.update(0.5);   // hold: near full
        out.hold = r2.mat.opacity > 0.7;
        D.update(0.6);   // past life: expired & removed
        out.expired = D.count() === 0 && groupCount() === 0;
        // (5) the cap recycles the oldest
        D.applyData({ cap: 3, kinds: { tk: { tex: 'stain', color: 0x888888, size: 1, sizeVar: 0, alpha: 0.8, life: 30, fadeIn: 0, fadeOut: 0, rot: 'random', blend: 'normal', yOff: 0 }, scorch: saved.kinds.scorch }, events: saved.events });
        D.clear(); for (let i = 0; i < 6; i++) D.spawn('tk', i, 0);
        out.capRecycle = D.count() === 3 && groupCount() === 3;
        // (6) disabled => no spawn
        D.applyData({ enabled: false, kinds: saved.kinds, events: saved.events });
        D.clear();
        out.disabledNoSpawn = D.spawn('scorch', 0, 0) === null && D.count() === 0;
        // (7) room load wipes the room's marks
        D.applyData(null); D.clear(); D.spawn('scorch', 2, 2); D.spawn('scorch', 3, 2);
        const before = D.count();
        W.load('gloom');
        out.clearOnLoad = before === 2 && D.count() === 0 && groupCount() === 0;
      } catch (e) { threw = true; out._err = e.message; }
      out.noThrow = !threw;
      // restore
      D.applyData(saved); D.clear();
      out.restored = JSON.stringify(D.exportCurrent()) === JSON.stringify(saved);
      return out;
    });

    console.log('RESULT:', JSON.stringify(o));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['hasModule', 'startEmpty', 'spawnRec', 'spawnCount', 'inScene', 'emitBound', 'emitNone', 'fadeIn', 'hold', 'expired', 'capRecycle', 'disabledNoSpawn', 'clearOnLoad', 'noThrow', 'restored'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'DECALS GAME TEST: PASS' : 'DECALS GAME TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
