// Dynamic level elements: moving platform carries, conveyor pushes, wind lifts,
// spikes toggle, crusher damages, collapsing floor drops.
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
    await wait(2200);

    const o = await game.evaluate(() => {
      const W = G.World, p = G.player, o = {}, hh = p.body.h / 2;
      const onTop = (c, hb) => { p.body.x = c.x; p.body.y = c.y + (hb / 2) + hh; p.body.vy = 0; };

      // platform carries the player
      const plat = W.mkProp.platform({ x: 200, y: 100, w: 4, h: 0.8, dx: 6, dy: 0, speed: 3, mode: 'pingpong' });
      onTop(plat, 0.8); const px0 = p.body.x;
      for (let i = 0; i < 25; i++) { plat.update(0.016); }
      o.platCarry = p.body.x > px0 + 0.3;

      // conveyor pushes the player
      const cv = W.mkProp.conveyor({ x: 400, y: 100, w: 5, h: 0.7, speed: 4 });
      onTop(cv, 0.7); const cx0 = p.body.x;
      for (let i = 0; i < 25; i++) { cv.update(0.016); p.body.y = cv.y + 0.35 + hh; p.body.vy = 0; }
      o.convPush = p.body.x > cx0 + 0.3;

      // wind lifts the player
      const wz = W.mkProp.windzone({ x: 600, y: 100, w: 6, h: 9, fx: 0, fy: 22 });
      p.body.x = wz.x; p.body.y = wz.y; p.body.vy = 0;
      for (let i = 0; i < 10; i++) wz.update(0.016);
      o.windUp = p.body.vy > 0;

      // timed spikes toggle the spike rect
      const before = G.Physics.spikes.length, savedT = G.time;
      const st = W.mkProp.spiketrap({ x: 900, y: 900, w: 2.4, period: 2, onTime: 1.5, phase: 0 });
      G.time = 0.2; st.update(0.016); o.spikeOut = G.Physics.spikes.length === before + 1;
      G.time = 1.8; st.update(0.016); o.spikeIn = G.Physics.spikes.length === before;
      G.time = savedT;

      // crusher damages a player caught underneath
      const cr = W.mkProp.crusher({ x: 1200, y: 1205, w: 2.6, h: 2, dist: 6, period: 2.6 });
      p.hp = p.maxHp; const hp0 = p.hp; let dmg = false;
      for (let i = 0; i < 220 && !dmg; i++) { p.body.x = cr.x; p.body.y = cr.y - 5; p.invulnT = 0; cr.update(0.016); if (p.hp < hp0) dmg = true; }
      o.crushDmg = dmg;

      // collapsing floor drops away after being stood on
      const ff = W.mkProp.fallfloor({ x: 1500, y: 1500, w: 3, h: 0.7, delay: 0.2, respawn: 1 });
      onTop(ff, 0.7);
      for (let i = 0; i < 70; i++) { ff.update(0.016); }
      o.fallDropped = ff.group.position.y < ff.y - 0.5 || !ff.group.visible;
      return o;
    });
    console.log('RESULT:', JSON.stringify(o));
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = o.platCarry && o.convPush && o.windUp && o.spikeOut && o.spikeIn && o.crushDmg && o.fallDropped && !errs.length;
    console.log(ok ? 'DYNAMIC ELEMENTS TEST: PASS' : 'DYNAMIC ELEMENTS TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
