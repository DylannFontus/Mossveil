// Shade death-retrieval: dropping Glimmer spawns a shade in that room; destroying it reclaims them.
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');
const path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.resolve(__dirname, '..');

(async () => {
  const server = spawn(process.execPath, [path.join(ROOT, 'tools', 'editor-server.js')], { stdio: 'pipe' });
  await new Promise(r => setTimeout(r, 800));
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const errs = [];
  try {
    const game = await browser.newPage();
    await game.setViewport({ width: 1100, height: 680 });
    game.on('pageerror', e => errs.push('[game] ' + e.message));
    await game.goto('http://localhost:7707/index.html?level=gloom&spawn=1', { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2300));

    const out = await game.evaluate(() => {
      const o = {}, room0 = G.room.id, p = G.player;
      // simulate the death drop
      G.save.shade = { room: room0, x: p.body.x, y: p.body.y, glimmer: 50 };
      G.save.glimmer = 0;
      // re-enter the room -> the shade should spawn holding the Glimmer
      G.World.load(room0, 'P');
      const shade = G.room.entities.find(e => e.type === 'shade');
      o.spawned = !!shade;
      o.holds = shade ? shade.glimmer : -1;
      o.passesThrough = shade ? (shade.fly === true) : false;
      // advance a few frames so it ticks without error
      for (let i = 0; i < 10 && shade; i++) shade.update(0.016);
      // destroy it -> recoverShade
      if (shade) { shade.hp = 1; shade.hurt(5, 1); }
      o.glimmerBack = G.save.glimmer;
      o.shadeCleared = !G.save.shade;
      // a second shade does not appear once cleared
      G.World.load(room0, 'P');
      o.noRespawn = !G.room.entities.find(e => e.type === 'shade');
      return o;
    });
    console.log('RESULT:', JSON.stringify(out));
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = out.spawned && out.holds === 50 && out.glimmerBack === 50 && out.shadeCleared && out.noRespawn && !errs.length;
    console.log(ok ? 'SHADE TEST: PASS' : 'SHADE TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
