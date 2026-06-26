// Colour-grade editor (Edit ▸ World): per-biome grade override stored on the biome data
// (pal.grade in data/biomes.js), merged by gradeFor. Authored in-editor, hot-applied. Offline.
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
      const T = G.Tools, W = G.World, MT = T.grade, out = {};
      out.registered = T._test.toolIds().includes('grade');
      out.inPalette = T._test.paletteSearch('grade').some(l => /grade/i.test(l));
      out.roadmap = T.roadmapStats().done >= 15;
      out.opened = T.openTool('grade');
      out.listCount = document.querySelectorAll('#toolHost .tc-pal-item').length;
      // derived default before override
      out.derived = Math.abs(MT.val('verdant', 'exposure') - 1.05) < 1e-6;
      // set an override and hot-apply -> stored on the biome palette
      MT.select('verdant');
      MT.setGrade('verdant', 'exposure', 1.3);
      MT.setGrade('verdant', 'saturation', 1.4);
      MT.applyToEngine();
      out.stored = W.PAL.verdant.grade && W.PAL.verdant.grade.exposure === 1.3 && W.PAL.verdant.grade.saturation === 1.4;
      out.hasOverride = MT.hasOverride('verdant') === true;
      // clear override removes it
      MT.clearGrade('verdant'); MT.applyToEngine();
      out.cleared = !W.PAL.verdant.grade;
      T.closeTool();
      return out;
    });

    console.log('GRADE-TOOL:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = o.registered && o.inPalette && o.roadmap && o.opened && o.listCount >= 18
      && o.derived && o.stored && o.hasOverride && o.cleared
      && netHits === 0 && !errs.length;
    console.log(ok ? 'GRADE-TOOL TEST: PASS' : 'GRADE-TOOL TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
