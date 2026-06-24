// Editor-authored object rotation: a prop/enemy `rot` (radians) must drive its
// rendered group.rotation.z in the world, and an explicit 0 must override a prop's
// own default tilt (the god ray). Headless via the editor-server + game page.
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
      const rotBench = 0.5236;                       // 30°
      L.props.push({ type: 'bench', x: 8, y: 8, rot: rotBench });
      L.props.push({ type: 'ray', x: 12, y: 10, rot: 0 });   // explicit 0 must beat the -0.15 default
      L.props.push({ type: 'ray', x: 16, y: 10 });           // no rot -> keeps the -0.15 default tilt
      G.World.load(id, 'P');
      const ents = G.room.entities;
      const bench = ents.find(e => e.type === 'bench');
      const rays = ents.filter(e => e.group && e.group.children.length && e.type === undefined);
      // identify rays by position (no `type` field on the ray entity)
      const rayAt = x => ents.map(e => e.group).filter(Boolean).find(g => Math.abs(g.position.x - x) < 0.01 && Math.abs(g.position.z + 5.5) < 0.01);
      const r0 = rayAt(12), rDef = rayAt(16);
      return {
        benchRot: bench && bench.group ? +bench.group.rotation.z.toFixed(4) : null,
        rayZero: r0 ? +r0.rotation.z.toFixed(4) : null,
        rayDefault: rDef ? +rDef.rotation.z.toFixed(4) : null
      };
    });

    console.log('ROTATION:', JSON.stringify(o));
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = o.benchRot === 0.5236 && o.rayZero === 0 && o.rayDefault === -0.15 && !errs.length;
    console.log(ok ? 'ROTATION TEST: PASS' : 'ROTATION TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
