// Nailsmith: forging spends Glimmer, raises base nail damage, caps at max, and the
// smith prop forges on interact.
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
      const o = {}, M = G.Main;
      G.save.glimmer = 1000; G.save.nailLevel = 0; G.Charms.apply(G.player);
      o.baseNail = G.player.nailDmg;
      M.forgeNail();
      o.afterForge = G.player.nailDmg; o.spent60 = (1000 - M.glimmer()) === 60; o.level1 = G.save.nailLevel === 1;
      M.forgeNail(); M.forgeNail(); M.forgeNail();         // -> 4 (max)
      o.maxLevel = G.save.nailLevel === 4; o.nailAtMax = G.player.nailDmg === 5;
      M.forgeNail();                                       // capped
      o.capped = G.save.nailLevel === 4;
      // broke: no purchase
      G.save.glimmer = 0; G.save.nailLevel = 0; G.Charms.apply(G.player);
      M.forgeNail(); o.noBuyBroke = G.save.nailLevel === 0;
      // smith prop forges on interact
      G.save.glimmer = 500; G.save.nailLevel = 0; G.Charms.apply(G.player); G.Main.state = 'play';
      const sm = G.World.mkProp.smith({ x: G.player.body.x, y: G.player.body.y });
      G.player.body.x = sm.x; G.player.body.y = sm.y;
      G.Input.virtualDown('interact'); sm.update(0.016); G.Input.virtualUp('interact');
      o.smithForged = G.save.nailLevel === 1;
      return o;
    });
    console.log('RESULT:', JSON.stringify(o));
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = o.baseNail === 1 && o.afterForge === 2 && o.spent60 && o.level1 && o.maxLevel
      && o.nailAtMax && o.capped && o.noBuyBroke && o.smithForged && !errs.length;
    console.log(ok ? 'NAILSMITH TEST: PASS' : 'NAILSMITH TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
