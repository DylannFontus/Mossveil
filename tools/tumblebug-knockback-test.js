// Verifies the tumblebug recovers from knockback: after a hit it should slide back
// briefly, then turn around and head back toward the player (not slide away forever).
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');
const path = require('path');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.resolve(__dirname, '..');

(async () => {
  const server = spawn(process.execPath, [path.join(ROOT, 'tools', 'editor-server.js')], { stdio: 'pipe' });
  await new Promise(r => setTimeout(r, 800));
  const browser = await puppeteer.launch({
    executablePath: EDGE, headless: 'new',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox']
  });
  const errs = [];
  try {
    const game = await browser.newPage();
    await game.setViewport({ width: 1280, height: 720 });
    game.on('pageerror', e => errs.push('[game] ' + e.message));
    await game.goto('http://localhost:7707/index.html?level=gloom&spawn=1', { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2500));

    const res = await game.evaluate(() => {
      const b = G.Enemies.make('tumblebug', G.player.body.x + 4, G.player.body.y);
      // ground the bug on a solid so onGround tracking + walking are realistic
      G.room.entities.push(b); G.room.group.add(b.group);
      // place the player to the LEFT of the bug; knockback dir = +1 (pushed right, away)
      G.player.body.x = b.body.x - 4;
      // let it settle on the ground a few frames
      for (let i = 0; i < 20; i++) b.update(0.016);
      const x0 = b.body.x, dir0 = b.dir;
      b.hurt(1, +1);                       // hit: knock right (away from the player)
      const dirAfterHit = b.dir;           // should face the player (-1)
      let maxX = b.body.x, slidVx = 0;
      for (let i = 0; i < 15; i++) { b.update(0.016); maxX = Math.max(maxX, b.body.x); if (i === 4) slidVx = b.body.vx; }
      const xPeak = maxX;                  // furthest it slid away
      for (let i = 0; i < 90; i++) b.update(0.016);   // ~1.5s later
      const xEnd = b.body.x, vxEnd = b.body.vx;
      return {
        x0: +x0.toFixed(2), dir0, dirAfterHit,
        slidAway: +(xPeak - x0).toFixed(2),     // >0 means it was pushed back
        slidVxAt80ms: +slidVx.toFixed(2),
        xEnd: +xEnd.toFixed(2), vxEnd: +vxEnd.toFixed(2),
        cameBack: xEnd < xPeak - 0.3,           // moved back from the peak
        headingToPlayer: vxEnd < 0              // now moving left, toward the player
      };
    });
    console.log('RESULT:', JSON.stringify(res, null, 2));
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = res.dirAfterHit === -1 && res.slidAway > 0.3 && res.cameBack && res.headingToPlayer && !errs.length;
    console.log(ok ? 'KNOCKBACK TEST: PASS' : 'KNOCKBACK TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) {
    console.error('FAILED', e); process.exitCode = 1;
  } finally {
    await browser.close();
    server.kill();
  }
})();
