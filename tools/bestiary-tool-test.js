// Journal / bestiary editor (Edit ▸ Narrative): Hunter's Journal lore externalised to
// data/bestiary.js, authored in-editor, hot-applied. Offline. Does NOT save().
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
      const T = G.Tools, E = G.Enemies, MT = T.bestiary, out = {};
      out.fromData = !!G.BESTIARY_DATA && !!G.BESTIARY_DATA.lore;
      out.defaultLore = typeof E.BESTIARY.tumblebug === 'string' && E.BESTIARY.tumblebug.length > 10;
      out.registered = T._test.toolIds().includes('bestiary');
      out.inPalette = T._test.paletteSearch('journal bestiary').some(l => /bestiary|journal/i.test(l));
      out.roadmap = T.roadmapStats().done >= 18;
      out.opened = T.openTool('bestiary');
      out.listCount = document.querySelectorAll('#toolHost .tc-pal-item').length;   // 14 types
      MT.select('gnatling');
      MT.setLore('gnatling', 'A test gnat with rewritten lore.');
      MT.applyToEngine();
      out.applied = E.BESTIARY.gnatling === 'A test gnat with rewritten lore.';
      out.othersIntact = E.BESTIARY.tumblebug.includes('armoured roller');
      T.closeTool();
      return out;
    });

    console.log('BESTIARY-TOOL:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = o.fromData && o.defaultLore && o.registered && o.inPalette && o.roadmap
      && o.opened && o.listCount >= 14 && o.applied && o.othersIntact
      && netHits === 0 && !errs.length;
    console.log(ok ? 'BESTIARY-TOOL TEST: PASS' : 'BESTIARY-TOOL TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
