// Particle / FX editor (Edit ▸ World): built-in bursts unchanged; authors NEW custom burst ids as
// emitter specs in data/fx.js. Hot-applied so FX.burst(newId) works. Offline (local server only).
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
      const T = G.Tools, FX = G.FX, MT = T.fx, out = {};
      out.fromData = !!G.FX_DATA && !!G.FX_DATA.bursts;
      out.builtins = FX.BURSTS.length >= 12 && FX.BURSTS.includes('spark');
      out.registered = T._test.toolIds().includes('fx');
      out.inPalette = T._test.paletteSearch('particle fx').some(l => /particle/i.test(l));
      out.roadmap = T.roadmapStats().done >= 13;
      out.opened = T.openTool('fx');
      // author a new effect, edit an emitter, hot-apply
      const id = MT.addBurst();
      out.renamed = MT.renameBurst(MT.state.sel, 'zzfx');
      MT.setEm(0, 'count', 30); MT.setEm(0, 'color', 0x33ff88);
      MT.applyToEngine();
      out.engineHas = FX.BURSTS.includes('zzfx');
      out.stored = FX.exportCurrent().bursts.zzfx && FX.exportCurrent().bursts.zzfx.emitters[0].count === 30;
      // FX.burst with the new id (and a built-in) must not throw
      let burstErr = null;
      try { FX.burst('zzfx', 0, 0); FX.burst('spark', 1, 1); FX.playSpec(FX.exportCurrent().bursts.zzfx, 0, 0); } catch (e) { burstErr = String(e); }
      out.burstOK = burstErr === null;
      // clone a built-in into an editable custom
      const cloned = MT.cloneBuiltin('soul');
      out.cloned = !!FX.exportCurrent === false ? false : !!MT.getWorking().bursts[cloned];
      out.removed = MT.removeBurst('zzfx');
      T.closeTool();
      return out;
    });

    console.log('FX-TOOL:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = o.fromData && o.builtins && o.registered && o.inPalette && o.roadmap
      && o.opened && o.renamed && o.engineHas && o.stored && o.burstOK && o.cloned && o.removed
      && netHits === 0 && !errs.length;
    console.log(ok ? 'FX-TOOL TEST: PASS' : 'FX-TOOL TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
