// Terrain-material editor (Edit ▸ World): materials externalised to data/materials.js (overlay),
// col refactored to token/hex but rebuilt as functions, authored in-editor, hot-applied. Offline.
// Does NOT save() so it never overwrites committed data.
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
      const T = G.Tools, W = G.World, MT = T.materials, out = {};
      out.fromData = !!G.MATERIAL_DATA && !!G.MATERIAL_DATA.materials;
      // col refactor preserved: functions still produce the same colours
      out.colDirt = W.TERRAIN_MATS['d'].col() === 0x2a1d12;
      out.colGrass = W.TERRAIN_MATS['#'].col({ terrain: 0x123456 }) === 0x123456;
      out.solidSet = typeof W.surfaceAt === 'function';
      out.registered = T._test.toolIds().includes('materials');
      out.inPalette = T._test.paletteSearch('terrain materials').some(l => /material/i.test(l));
      out.roadmap = T.roadmapStats().done >= 16;
      out.opened = T.openTool('materials');
      out.listCount = document.querySelectorAll('#toolHost .tc-pal-item').length;   // 7 unique ids
      // edit dirt colour -> applies to BOTH hard 'd' and curvy 'D'
      MT.select('dirt'); MT.setGroup('dirt', 'col', '#445566');
      MT.setGroup('grass', 'sound', 'wood');
      MT.applyToEngine();
      out.bothUpdated = W.TERRAIN_MATS['d'].col() === 0x445566 && W.TERRAIN_MATS['D'].col() === 0x445566;
      out.soundSet = W.TERRAIN_MATS['#'].sound === 'wood';
      // add a new material on a free char, hot-apply -> becomes solid
      const id = MT.addMaterial(false);
      MT.applyToEngine();
      const chars = Object.keys(W.TERRAIN_MATS).filter(c => W.TERRAIN_MATS[c].id === id);
      out.added = chars.length === 1 && !!W.TERRAIN_MATS[chars[0]];
      // built-in can't be deleted; custom can
      out.builtinGuard = MT.removeMaterial('grass') === false;
      out.customDeleted = MT.removeMaterial(id) === true;
      T.closeTool();
      return out;
    });

    console.log('MATERIAL-TOOL:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = o.fromData && o.colDirt && o.colGrass && o.solidSet && o.registered && o.inPalette && o.roadmap
      && o.opened && o.listCount >= 7 && o.bothUpdated && o.soundSet && o.added && o.builtinGuard && o.customDeleted
      && netHits === 0 && !errs.length;
    console.log(ok ? 'MATERIAL-TOOL TEST: PASS' : 'MATERIAL-TOOL TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
