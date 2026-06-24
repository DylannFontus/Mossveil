// Data-driven custom enemy: spawns from a spec, idles, engages on sight, shoots; flee works.
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
    await game.setViewport({ width: 1000, height: 620 });
    game.on('pageerror', e => errs.push('[game] ' + e.message));
    await game.goto('http://localhost:7707/index.html?level=gloom&spawn=1', { waitUntil: 'load' });
    await wait(2200);

    const o = await game.evaluate(() => {
      const o = {}, p = G.player;
      const add = e => { G.room.entities.push(e); if (e.group) G.room.group.add(e.group); return e; };
      const projCount = () => G.room.entities.filter(x => x.type === 'projectile').length;

      // chasing shooter (flying so engage needs only range)
      const e = G.Enemies.make('custom', 200, 100, { spec: { hp: 3, speed: 2, sight: 12, fly: true, idle: 'wander', onSight: 'chase', attack: 'shoot', shootCd: 0.4, color: '#a0608a' } });
      add(e);
      o.spawned = e && e.type === 'custom' && e.hp === 3 && e.isEnemy;
      p.body.x = e.body.x + 100; p.body.y = e.body.y;         // far -> idle
      for (let i = 0; i < 20; i++) e.update(0.016);
      o.idle = e.state === 'idle';
      p.body.x = e.body.x + 3; p.body.y = e.body.y;           // close -> engage
      const pb = projCount();
      for (let i = 0; i < 60; i++) e.update(0.016);
      o.engaged = e.state === 'engaged';
      o.shot = projCount() > pb;
      e.hurt(3, 1); o.killable = !e.alive;

      // flee creature moves away
      const f = add(G.Enemies.make('custom', 260, 100, { spec: { fly: true, speed: 3, sight: 12, idle: 'still', onSight: 'flee', attack: 'contact' } }));
      p.body.x = f.body.x + 2; p.body.y = f.body.y;           // player on the right
      const fx0 = f.body.x; for (let i = 0; i < 30; i++) f.update(0.016);
      o.fled = f.body.x < fx0 - 0.2;
      return o;
    });
    console.log('RESULT:', JSON.stringify(o));
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = o.spawned && o.idle && o.engaged && o.shot && o.killable && o.fled && !errs.length;
    console.log(ok ? 'BEHAVIOR ENEMY TEST: PASS' : 'BEHAVIOR ENEMY TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
