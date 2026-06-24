// Custom collision box: obj.col = { w, h, ox, oy } registers a solid on any object,
// follows rotation, and toggles with the active/inactive system. Editor renders it without error.
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
      L.props.push({ type: 'bench', x: 40, y: 5, col: { w: 3, h: 2, ox: 0, oy: 1 } });               // -> solid (40,6) 3x2
      L.props.push({ type: 'bench', x: 50, y: 5, rot: Math.PI / 2, col: { w: 3, h: 2, ox: 0, oy: 0 } }); // -> 2x3 at (50,5)
      L.props.push({ type: 'bench', x: 60, y: 5, oid: 9911, active: false, col: { w: 2, h: 2, ox: 0, oy: 0 } });
      G.World.load(id, 'P');
      const S = () => G.Physics.solids;
      const at = (x, y, w, h) => S().find(c => Math.abs(c.x - x) < 0.1 && Math.abs(c.y - y) < 0.1 && Math.abs(c.w - w) < 0.1 && Math.abs(c.h - h) < 0.1);
      const plain = !!at(40, 6, 3, 2);
      const rotated = !!at(50, 5, 2, 3);
      const inactiveBefore = !S().find(c => Math.abs(c.x - 60) < 0.1 && Math.abs(c.y - 5) < 0.1);
      const ent = G.room.entities.find(e => e.oid === 9911);
      if (ent) G.World.setEntityActive(ent, true);
      const inactiveAfter = !!at(60, 5, 2, 2);
      if (ent) G.World.setEntityActive(ent, false);
      const togglesOff = !S().find(c => Math.abs(c.x - 60) < 0.1 && Math.abs(c.y - 5) < 0.1);
      return { plain, rotated, inactiveBefore, inactiveAfter, togglesOff };
    });

    // editor: a prop with a collision box selects + draws its red box without throwing
    const ed = await browser.newPage();
    ed.on('pageerror', e => errs.push('[editor] ' + e.message));
    ed.on('console', m => { if (m.type() === 'error') errs.push('[editor-console] ' + m.text()); });
    await ed.goto('http://localhost:7707/editor/editor.html', { waitUntil: 'load' });
    await wait(2800);
    const eo = await ed.evaluate(() => {
      const L = G.LEVELS[G.__ed.currentId()];
      L.props = L.props || [];
      L.props.push({ type: 'bench', x: 10, y: 8, col: { w: 3, h: 2, ox: 0, oy: 1 } });
      G.__ed.setSel({ kind: 'prop', i: L.props.length - 1 });   // triggers inspector + overlay
      return { ok: true };
    });
    await wait(400);

    console.log('COLBOX:', JSON.stringify(o), 'EDITOR:', JSON.stringify(eo));
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = o.plain && o.rotated && o.inactiveBefore && o.inactiveAfter && o.togglesOff && eo.ok && !errs.length;
    console.log(ok ? 'COLLISION BOX TEST: PASS' : 'COLLISION BOX TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
