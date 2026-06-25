// SFX designer (Edit ▸ Audio): sound effects externalised to data/sfx.js as editable synth-layer
// specs (tone/noise/bell), authored in-editor, hot-applied to the engine, and auditioned live.
// Offline (local server only). Deliberately does NOT save() so it never overwrites data/sfx files.
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');
const path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.resolve(__dirname, '..');
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const server = spawn(process.execPath, [path.join(ROOT, 'tools', 'editor-server.js')], { stdio: 'pipe' });
  await wait(800);
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
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
      const T = G.Tools, A = G.Audio, MT = T.sfx, out = {};
      out.fromData = !!G.SFX_DATA && !!G.SFX_DATA.sfx;
      out.count = A.sfxNames.length;                              // ~30 defaults
      out.layered = A.sfxSpec('jump').length === 2 && A.sfxSpec('jump')[0].kind === 'tone';
      out.registered = T._test.toolIds().includes('sfx');
      out.inPalette = T._test.paletteSearch('sfx designer').some(l => /sfx designer/i.test(l));
      out.roadmap = T.roadmapStats().done >= 9;                   // foundation4 + music3 + charms1 + sfx1
      out.opened = T.openTool('sfx');
      out.listCount = document.querySelectorAll('#toolHost .tc-pal-item').length;
      // author a new sound, add a layer, edit it, hot-apply
      MT.addSfx();
      out.renamed = MT.renameSfx(MT.state.sel, 'zzsound');
      MT.addLayer('zzsound', 'bell');
      const idx = MT.getWorking().sfx.zzsound.length - 1;
      MT.setLayer('zzsound', idx, 'f0', 880);
      MT.applyToEngine();
      out.engineHas = A.sfxNames.includes('zzsound');
      const spec = A.sfxSpec('zzsound');
      out.layerStored = spec[idx] && spec[idx].kind === 'bell' && spec[idx].f0 === 880;
      // editing a built-in changes its spec; preview both without throwing
      MT.select('jump'); MT.setLayer('jump', 0, 'f0', 300); MT.applyToEngine();
      out.builtinEdited = A.sfxSpec('jump')[0].f0 === 300;
      let playErr = null;
      try { A.init(); MT.play('zzsound'); A.sfx('jump'); } catch (e) { playErr = String(e); }
      out.playOK = playErr === null;
      // remove guard + cleanup
      out.removed = MT.removeSfx('zzsound');
      out.builtinFlag = MT.isBuiltin('jump') === true && MT.isBuiltin('zzsound') === false;
      T.closeTool();
      return out;
    });

    console.log('SFX-TOOL:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = o.fromData && o.count >= 27 && o.layered && o.registered && o.inPalette && o.roadmap
      && o.opened && o.listCount >= 25 && o.renamed && o.engineHas && o.layerStored
      && o.builtinEdited && o.playOK && o.removed && o.builtinFlag
      && netHits === 0 && !errs.length;
    console.log(ok ? 'SFX-TOOL TEST: PASS' : 'SFX-TOOL TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
