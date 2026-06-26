// Enemy designer (Edit ▸ Content): a library of reusable custom enemy types externalised to
// data/enemies-lib.js, joining E.TYPES and spawning via mkBehaviorEnemy. Offline. Does NOT save().
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
  let netHits = 0;
  try {
    const ed = await browser.newPage();
    ed.on('pageerror', e => errs.push('[editor] ' + e.message));
    ed.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });
    await ed.setRequestInterception(true);
    ed.on('request', r => { const u = r.url(); if (/^https?:\/\//.test(u) && !u.includes('localhost') && !u.includes('127.0.0.1')) { netHits++; r.abort(); } else r.continue(); });
    await ed.goto('http://localhost:7707/editor/editor.html', { waitUntil: 'load' });
    await wait(2800);

    const o = await ed.evaluate(async () => {
      const T = G.Tools, E = G.Enemies, MT = T.enemies, out = {};
      out.fromData = !!G.ENEMY_LIB && !!G.ENEMY_LIB.enemies;
      out.baseTypes = E.TYPES.length === 14;            // 14 built-ins, no lib yet
      out.registered = T._test.toolIds().includes('enemies');
      out.inPalette = T._test.paletteSearch('enemy designer').some(l => /enemy/i.test(l));
      out.roadmap = T.roadmapStats().done >= 20;
      out.opened = T.openTool('enemies');
      // author a custom enemy, hot-apply
      MT.addEnemy();
      out.renamed = MT.renameId(MT.state.sel, 'mybeast');
      MT.setName('mybeast', 'My Beast');
      MT.setSpec('mybeast', 'hp', 7);
      MT.setSpec('mybeast', 'attack', 'shoot');
      MT.setSpec('mybeast', 'fly', true);
      MT.applyToEngine();
      out.inTypes = E.TYPES.some(t => t.id === 'mybeast' && t.lib);
      out.specStored = E.libSpec('mybeast') && E.libSpec('mybeast').hp === 7 && E.libSpec('mybeast').attack === 'shoot';
      // it spawns through mkBehaviorEnemy with the saved spec
      const ent = E.make('mybeast', 0, 0);
      out.spawns = !!ent && ent.isEnemy === true && ent.hp === 7 && ent.fly === true;
      out.removed = MT.removeEnemy('mybeast');
      out.typesReset = (MT.applyToEngine(), E.TYPES.length === 14);
      T.closeTool();
      return out;
    });

    console.log('ENEMY-TOOL:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = o.fromData && o.baseTypes && o.registered && o.inPalette && o.roadmap
      && o.opened && o.renamed && o.inTypes && o.specStored && o.spawns && o.removed && o.typesReset
      && netHits === 0 && !errs.length;
    console.log(ok ? 'ENEMY-TOOL TEST: PASS' : 'ENEMY-TOOL TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
