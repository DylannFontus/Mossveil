// A charge attack that one-shots a full-health enemy triggers a brief slow-mo;
// killing a pre-damaged enemy, or a normal (non-charge) kill, does not.
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

    const out = await game.evaluate(() => {
      const o = {}, p = G.player;
      const add = e => { if (G.room.entities.indexOf(e) < 0) { G.room.entities.push(e); if (e.group) G.room.group.add(e.group); } return e; };
      const artHit = (e) => { p.isArt = true; p.atkDir = 'side'; p.facing = 1; p.atkT = 0.0001; p.atkHit = new Set(); for (let i = 0; i < 5; i++) p.update(0.016); };
      const normalHit = (e) => { p.isArt = false; p.atkDir = 'side'; p.facing = 1; p.atkT = 0.0001; p.atkHit = new Set(); for (let i = 0; i < 5; i++) p.update(0.016); };

      // 1) charge one-shots a full-health foe -> slow-mo
      G.slowMo = 0;
      const e1 = add(G.Enemies.make('gnatling', p.body.x + 1.4, p.body.y)); e1.hp = 2;
      artHit(e1);
      o.killedFull = !e1.alive; o.slowmoOnOneShot = +(+G.slowMo).toFixed(2);
      e1.dead = true;

      // 2) charge kills a PRE-DAMAGED foe -> no slow-mo
      G.slowMo = 0;
      const e2 = add(G.Enemies.make('bramblehog', p.body.x + 1.4, p.body.y)); e2.hp = 2; e2._damaged = true;
      artHit(e2);
      o.killedDamaged = !e2.alive; o.slowmoOnDamaged = +(+G.slowMo).toFixed(2);
      e2.dead = true;

      // 3) a NORMAL strike one-shots a foe -> no slow-mo (only the charge does)
      G.slowMo = 0;
      const e3 = add(G.Enemies.make('gnatling', p.body.x + 1.4, p.body.y)); e3.hp = 1;
      normalHit(e3);
      o.killedNormal = !e3.alive; o.slowmoOnNormal = +(+G.slowMo).toFixed(2);
      e3.dead = true;

      p.isArt = false;
      return o;
    });
    console.log('RESULT:', JSON.stringify(out));
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = out.killedFull && out.slowmoOnOneShot > 0.5 && out.killedDamaged && out.slowmoOnDamaged === 0
      && out.killedNormal && out.slowmoOnNormal === 0 && !errs.length;
    console.log(ok ? 'ONE-SHOT SLOW-MO TEST: PASS' : 'ONE-SHOT SLOW-MO TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
