// Resizable attack hit area (hurtbox): an editor hurtBox { w, h, ox, oy } enlarges the area
// a player attack must overlap to land — for enemies (data) and bosses (via the boss trigger) —
// without touching the physics body. Verifies the geometry, threading, and a near-miss landing.
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
    await game.setViewport({ width: 900, height: 560 });
    game.on('pageerror', e => errs.push('[game] ' + e.message));
    game.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });
    await game.goto('http://localhost:7707/index.html?level=verdant&spawn=1', { waitUntil: 'load' });
    await wait(2200);

    const o = await game.evaluate(() => {
      const U = G.U, id = G.room.id, L = G.LEVELS[id];
      L.enemies = L.enemies || [];
      L.enemies.push({ type: 'tumblebug', x: 40, y: 8, hurtBox: { w: 5, h: 5, ox: 0, oy: 0 } });
      G.World.load(id, 'P');
      const ent = G.room.entities.filter(e => e.type === 'tumblebug').sort((a, b) => Math.abs(a.body.x - 40) - Math.abs(b.body.x - 40))[0];
      const hr = ent ? G.Player.hurtRect(ent) : null;
      // an attack box just outside the body but well inside the 5-wide hurtbox
      const bx = ent.body.x, by = ent.body.y;
      const atk = { x: bx + ent.body.w / 2 + 0.8, y: by, w: 0.8, h: 1 };
      const hitHurt = U.overlap(atk, G.Player.hurtRect(ent));
      const hitBody = U.overlap(atk, ent.body);
      const plain = { body: { x: 0, y: 0, w: 1, h: 1 } };
      const plainIsBody = G.Player.hurtRect(plain) === plain.body;
      // boss via the spawn path (boss trigger threads p.hurtBox -> spawnBoss -> Bosses.spawn)
      G.Enemies.spawnBoss('mossSovereign', 30, 8, [], 'hbtest', { w: 6, h: 6, ox: 0, oy: 0 });
      const boss = G.room.entities.find(e => e.type === 'boss');
      return {
        entHurt: ent && ent.hurtBox ? ent.hurtBox.w : null,
        hrW: hr ? hr.w : null,
        hitHurt, hitBody, plainIsBody,
        bossHurt: boss && boss.hurtBox ? boss.hurtBox.w : null
      };
    });

    console.log('HURTBOX:', JSON.stringify(o));
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = o.entHurt === 5 && o.hrW === 5 && o.hitHurt === true && o.hitBody === false
      && o.plainIsBody === true && o.bossHurt === 6 && !errs.length;
    console.log(ok ? 'HURTBOX TEST: PASS' : 'HURTBOX TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
