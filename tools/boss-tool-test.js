// Boss designer (Edit ▸ Content): the boss roster externalised to data/bosses.js (configs + epithets),
// authored in-editor, hot-applied; new bosses join B.LIST and build a rig via B.preview. Offline.
// Does NOT save().
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
      const T = G.Tools, B = G.Bosses, MT = T.bosses, out = {};
      out.fromData = !!G.BOSS_DATA && !!G.BOSS_DATA.configs;
      out.roster = B.LIST.length === 15 && !!B.CONFIGS.mossSovereign;
      out.colorsParsed = typeof B.CONFIGS.mossSovereign.colors.glow === 'number';
      out.registered = T._test.toolIds().includes('bosses');
      out.inPalette = T._test.paletteSearch('boss designer').some(l => /boss/i.test(l));
      out.roadmap = T.roadmapStats().done >= 21;
      out.opened = T.openTool('bosses');
      out.listCount = document.querySelectorAll('#toolHost .tc-pal-item').length;
      // author a new boss, hot-apply
      MT.addBoss();
      out.renamed = MT.renameId(MT.state.sel, 'zzboss');
      MT.setCfg('zzboss', 'name', 'ZZ BOSS'); MT.setCfg('zzboss', 'hp', 55); MT.setCfg('zzboss', 'rig', 'moth');
      MT.setColor('zzboss', 'glow', '#00ff00');
      MT.setEpithet('zzboss', 'The Test Tyrant');
      if (!MT.hasMove('zzboss', 'moves', 'rain')) MT.toggleMove('zzboss', 'moves', 'rain');
      MT.applyToEngine();
      const c = B.CONFIGS.zzboss;
      out.stored = c && c.hp === 55 && c.rig === 'moth' && c.colors.glow === 0x00ff00 && c.moves.includes('rain');
      out.inList = B.LIST.some(b => b.id === 'zzboss');
      out.epithet = B.EPITHETS.zzboss === 'The Test Tyrant';
      // it builds a rig (preview) without throwing
      let pErr = null; try { out.preview = !!B.preview('zzboss'); } catch (e) { pErr = String(e); }
      out.previewOK = pErr === null;
      out.builtinFlag = MT.isBuiltin('mossSovereign') === true && MT.isBuiltin('zzboss') === false;
      out.removed = MT.removeBoss('zzboss');
      T.closeTool();
      return out;
    });

    console.log('BOSS-TOOL:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = o.fromData && o.roster && o.colorsParsed && o.registered && o.inPalette && o.roadmap
      && o.opened && o.listCount === 15 && o.renamed && o.stored && o.inList && o.epithet && o.preview && o.previewOK
      && o.builtinFlag && o.removed
      && netHits === 0 && !errs.length;
    console.log(ok ? 'BOSS-TOOL TEST: PASS' : 'BOSS-TOOL TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
