// Biome / palette editor (Edit ▸ World): biome palettes externalised to data/biomes.js (overlay on
// the built-in defaults), authored in-editor with #rrggbb colours, hot-applied to the engine.
// Offline (local server only). Does NOT save() so it never overwrites the committed data files.
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
      const T = G.Tools, W = G.World, MT = T.biomes, out = {};
      out.fromData = !!G.BIOME_DATA && !!G.BIOME_DATA.palettes;
      out.count = W.BIOMES.length;                                // ~20 defaults
      out.colorsParsed = typeof W.PAL.verdant.bgTop === 'number'; // #rrggbb -> number on load
      out.registered = T._test.toolIds().includes('biomes');
      out.inPalette = T._test.paletteSearch('biome palette').some(l => /biome/i.test(l));
      out.roadmap = T.roadmapStats().done >= 11;                  // 10 + biomes
      out.opened = T.openTool('biomes');
      out.listCount = document.querySelectorAll('#toolHost .tc-pal-item').length;
      // author a biome, set a colour + a field, hot-apply
      MT.addBiome();
      out.renamed = MT.renameBiome(MT.state.sel, 'zzbiome');
      MT.setColor('zzbiome', 'bgTop', '#112233');
      MT.setField('zzbiome', 'root', 200);
      MT.setField('zzbiome', 'rays', true);
      MT.setDeco('zzbiome', ['tree', 'fern']);
      MT.applyToEngine();
      out.engineHas = W.BIOMES.includes('zzbiome');
      const pal = W.PAL.zzbiome;
      out.colorApplied = pal && pal.bgTop === 0x112233 && pal.root === 200 && pal.rays === true && pal.deco.length === 2;
      // editing a built-in works too
      MT.select('verdant'); MT.setColor('verdant', 'glow', '#ff00ff'); MT.applyToEngine();
      out.builtinEdited = W.PAL.verdant.glow === 0xff00ff;
      out.removed = MT.removeBiome('zzbiome');
      out.builtinFlag = MT.isBuiltin('verdant') === true && MT.isBuiltin('zzbiome') === false;
      T.closeTool();
      return out;
    });

    console.log('BIOME-TOOL:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = o.fromData && o.count >= 18 && o.colorsParsed && o.registered && o.inPalette && o.roadmap
      && o.opened && o.listCount >= 18 && o.renamed && o.engineHas && o.colorApplied
      && o.builtinEdited && o.removed && o.builtinFlag
      && netHits === 0 && !errs.length;
    console.log(ok ? 'BIOME-TOOL TEST: PASS' : 'BIOME-TOOL TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
