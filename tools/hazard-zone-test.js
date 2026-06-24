// Placeable hazard blocks: mire (mud/quicksand/ash) slows/sinks the player; pool (lava/acid)
// sears on contact. Drives the entity update directly (G.World.update runs the zone entities).
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
      const id = G.room.id, L = G.LEVELS[id];
      L.props = L.props || [];
      L.props.push({ type: 'mire', kind: 'mud', x: 40, y: 8, w: 6, h: 2 });
      L.props.push({ type: 'mire', kind: 'quicksand', x: 50, y: 8, w: 6, h: 2 });
      L.props.push({ type: 'pool', kind: 'lava', x: 60, y: 8, w: 6, h: 2, dmg: 1 });
      L.props.push({ type: 'gas', x: 70, y: 8, w: 6, h: 4, dmg: 1 });
      L.props.push({ type: 'bioflora', kind: 'flower', x: 80, y: 8, mortal: true });
      L.props.push({ type: 'bioflora', kind: 'mushroom', x: 84, y: 8 });
      G.Weather.set('none');                            // no wind, so gas is harmful
      G.World.load(id, 'P');
      const p = G.player, out = {};
      const put = (x, y) => { p.body.x = x; p.body.y = y; p.body.vx = 0; p.body.vy = 0; };
      const tick = () => G.World.update(0.05);

      // mud slows
      put(40, 8); tick(); out.mudSlow = +p.envSlow.toFixed(2);
      // quicksand slows AND drags down (envSink)
      put(50, 8); tick(); out.quickSlow = +p.envSlow.toFixed(2); out.quickSink = p.envSink > 0;
      // off any zone -> normal again
      put(5, 8); tick(); out.clearSlow = p.envSlow;
      // lava sears on contact (hp drops, bounced up)
      put(60, 8.6); p.invulnT = 0; p.dead = false; const hp0 = p.hp; tick();
      out.lavaHurt = p.hp < hp0; out.lavaBounce = p.body.vy > 5;

      // gas DOTs in still air, and ignites/clears
      put(70, 8); p.invulnT = 0; p.dead = false; const hpg = p.hp; tick();
      out.gasHurt = p.hp < hpg;
      const gas = G.room.entities.find(e => e.type === 'gas');
      gas.ignite(); tick(); out.gasClears = gas.group.visible === false;

      // flora: destructible toggle -> breakable; nailing a destructible one kills it
      const fl = G.room.entities.find(e => e.type === 'bioflora' && Math.abs(e.x - 80) < 0.1);
      const mush = G.room.entities.find(e => e.type === 'bioflora' && Math.abs(e.x - 84) < 0.1);
      out.floraMortal = fl.breakable === true; out.floraPermanent = mush.breakable === false;
      fl.hurt(1); out.floraDied = fl.dead === true;

      out.hasMire = !!G.room.entities.find(e => e.type === 'mire');
      out.hasPool = !!G.room.entities.find(e => e.type === 'pool');
      return out;
    });

    console.log('HAZARD:', JSON.stringify(o));
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = o.mudSlow < 0.6 && o.quickSlow < 0.4 && o.quickSink === true && o.clearSlow === 1
      && o.lavaHurt === true && o.lavaBounce === true
      && o.gasHurt === true && o.gasClears === true
      && o.floraMortal === true && o.floraPermanent === true && o.floraDied === true
      && o.hasMire && o.hasPool && !errs.length;
    console.log(ok ? 'HAZARD ZONE TEST: PASS' : 'HAZARD ZONE TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
