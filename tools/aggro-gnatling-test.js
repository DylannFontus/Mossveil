// Verifies: (1) gnatling phases through terrain + renders on top (z), (2) combat-music
// intensity is driven by line-of-sight aggro and stops when no enemy can see the player.
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
  try {
    const game = await browser.newPage();
    await game.setViewport({ width: 1100, height: 680 });
    game.on('pageerror', e => errs.push('[game] ' + e.message));
    await game.goto('http://localhost:7707/index.html?level=gloom&spawn=1', { waitUntil: 'load' });
    await wait(2300);

    // --- gnatling: phases through a solid (stays inside it) and renders at z=0.5 ---
    const phase = await game.evaluate(() => {
      const g = G.Enemies.make('gnatling', G.player.body.x + 2, G.player.body.y);
      const s = G.Physics.solids.find(s => s.mat) || G.Physics.solids[0];
      g.body.x = s.x; g.body.y = s.y; g.body.vx = 0; g.body.vy = 0;
      g.aggro = false; g.homeX = s.x; g.homeY = s.y;
      g.update(0.016); g.update(0.016);
      return { insideSolid: Math.abs(g.body.x - s.x) < 0.7 && Math.abs(g.body.y - s.y) < 0.7, z: +g.group.position.z.toFixed(2) };
    });

    // --- music: spy on the intensity target the game loop sets each frame ---
    await game.evaluate(() => {
      window.__I = -1;
      const orig = G.Audio.setIntensity.bind(G.Audio);
      G.Audio.setIntensity = v => { window.__I = v; orig(v); };
      G.room.entities = G.room.entities.filter(e => !e.isEnemy);    // clear the field
    });
    await wait(350);
    const iNone = await game.evaluate(() => window.__I);             // no enemies -> 0
    await game.evaluate(() => {
      const g = G.Enemies.make('gnatling', G.player.body.x + 3, G.player.body.y + 1);
      G.room.entities.push(g); G.room.group.add(g.group); window.__g = g;
    });
    await wait(450);
    const iSeen = await game.evaluate(() => window.__I);             // visible enemy nearby -> > 0
    await game.evaluate(() => { window.__g.alive = false; window.__g.dead = true; });
    await wait(500);
    const iKilled = await game.evaluate(() => window.__I);           // killed -> back to 0

    console.log('PHASE:', JSON.stringify(phase));
    console.log('INTENSITY none/seen/killed:', iNone, iSeen, iKilled);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = phase.insideSolid && phase.z === 0.5 && iNone === 0 && iSeen > 0 && iKilled === 0 && !errs.length;
    console.log(ok ? 'AGGRO/GNATLING TEST: PASS' : 'AGGRO/GNATLING TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
