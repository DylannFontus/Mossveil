// Breakable walls + levers/plates -> doors, wired by switch name (and signal/flag).
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
      const W = G.World, p = G.player, o = {}; G.room.switches = {};

      // breakable broken by a nail strike -> flag + signal + collider gone
      let signaled = false; const orig = G.EventGraph.signal; G.EventGraph.signal = n => { if (n === 'brk') signaled = true; orig.call(G.EventGraph, n); };
      const br = W.mkProp.breakable({ x: p.body.x + 1.3, y: p.body.y, w: 1.6, h: 2, hp: 1, flag: 'sec1', signal: 'brk' });
      G.room.entities.push(br);
      const solids0 = G.Physics.solids.length;
      p.isArt = false; p.atkDir = 'side'; p.facing = 1; p.atkT = 0.0001; p.atkHit = new Set();
      for (let i = 0; i < 5; i++) p.update(0.016);
      o.brBroke = !br.alive && br.dead;
      o.brFlag = !!(G.save.flags && G.save.flags.sec1);
      o.brSignal = signaled;
      o.brColliderGone = G.Physics.solids.length <= solids0;
      G.EventGraph.signal = orig;

      // lever -> door (same switch name)
      const door = W.mkProp.door({ x: 350, y: 60, w: 1.2, h: 5, signal: 'gate1' });
      const lever = W.mkProp.lever({ x: 352, y: 60, signal: 'gate1' });
      door.update(0.016);
      const doorClosed = () => G.Physics.solids.some(s => Math.abs(s.x - 350) < 0.01 && Math.abs(s.y - 62.5) < 0.01);
      o.doorClosed = doorClosed();
      p.body.x = lever.x; p.body.y = lever.y;
      G.Input.virtualDown('interact'); lever.update(0.016); G.Input.virtualUp('interact');
      o.switchOn = !!G.room.switches.gate1;
      door.update(0.016);
      o.doorOpened = !doorClosed();

      // plate -> door (held while stood on)
      const door2 = W.mkProp.door({ x: 380, y: 60, w: 1.2, h: 5, signal: 'gate2' });
      const plate = W.mkProp.plate({ x: 382, y: 60, w: 1.8, signal: 'gate2' });
      door2.update(0.016);
      const door2Closed = () => G.Physics.solids.some(s => Math.abs(s.x - 380) < 0.01);
      p.body.x = plate.x; p.body.y = plate.y + p.body.h / 2 + 0.1; p.body.vy = 0;
      plate.update(0.016);
      o.plateOn = !!G.room.switches.gate2;
      door2.update(0.016);
      o.door2Opened = !door2Closed();
      p.isArt = false;
      return o;
    });
    console.log('RESULT:', JSON.stringify(o));
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = o.brBroke && o.brFlag && o.brSignal && o.brColliderGone && o.doorClosed && o.switchOn && o.doorOpened
      && o.plateOn && o.door2Opened && !errs.length;
    console.log(ok ? 'SWITCHES TEST: PASS' : 'SWITCHES TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
