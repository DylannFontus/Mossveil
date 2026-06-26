// Spell designer (Edit ▸ Content): spell tree extracted to src/spells.js (G.Spells) + data/spells.js
// overlay, authored in-editor (name/cast/element/tiers/costs), hot-applied. Offline (local server).
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
      const T = G.Tools, S = G.Spells, MT = T.spells, out = {};
      out.fromData = !!G.SPELLS_DATA && Array.isArray(G.SPELLS_DATA.tree);
      out.count = S.TREE.length;                                  // 6 defaults
      out.elements = S.ELEMENTS.join(',') === 'ember,frost,gale';
      out.registered = T._test.toolIds().includes('spells');
      out.inPalette = T._test.paletteSearch('spell designer').some(l => /spell/i.test(l));
      out.roadmap = T.roadmapStats().done >= 14;
      out.opened = T.openTool('spells');
      out.listCount = document.querySelectorAll('#toolHost .tc-pal-item').length;
      // tune the built-in bolt, hot-apply
      const bi = MT.getWorking().tree.findIndex(s => s.id === 'bolt');
      MT.setField(bi, 'name', 'Soul Lance'); MT.setCost(bi, 2, 99);
      MT.applyToEngine();
      out.tuned = S.TREE.find(s => s.id === 'bolt').name === 'Soul Lance' && S.TREE.find(s => s.id === 'bolt').cost[2] === 99;
      // add a new element spell, hot-apply -> appears in ELEMENTS
      MT.addSpell();
      const si = MT.state.sel; MT.setId(si, 'zzspell'); MT.toggleElement(si, true);
      MT.applyToEngine();
      out.added = S.TREE.some(s => s.id === 'zzspell');
      out.elementAdded = S.ELEMENTS.includes('zzspell');
      out.builtinFlag = MT.isBuiltin('bolt') === true && MT.isBuiltin('zzspell') === false;
      out.removed = MT.removeSpell(si);
      T.closeTool();
      return out;
    });

    console.log('SPELL-TOOL:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = o.fromData && o.count === 6 && o.elements && o.registered && o.inPalette && o.roadmap
      && o.opened && o.listCount === 6 && o.tuned && o.added && o.elementAdded && o.builtinFlag && o.removed
      && netHits === 0 && !errs.length;
    console.log(ok ? 'SPELL-TOOL TEST: PASS' : 'SPELL-TOOL TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
