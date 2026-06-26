// Reverb / space editor (Edit ▸ Audio): per-biome reverb externalised to data/reverb.js (overlay),
// authored in-editor [wet, tail, decay], hot-applied and auditioned. Offline (local server only).
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
      const T = G.Tools, W = G.World, MT = T.reverb, out = {};
      out.fromData = !!G.REVERB_DATA && !!G.REVERB_DATA.reverb;
      out.hasDefault = Array.isArray(W.REVERB._default) && W.REVERB._default.length === 3;
      out.registered = T._test.toolIds().includes('reverb');
      out.inPalette = T._test.paletteSearch('reverb space').some(l => /reverb/i.test(l));
      out.roadmap = T.roadmapStats().done >= 12;
      out.opened = T.openTool('reverb');
      out.listCount = document.querySelectorAll('#toolHost .tc-pal-item').length;
      // add an entry for a biome and hot-apply
      out.added = MT.addEntry('frost');
      MT.setVal('frost', 0, 0.7); MT.setVal('frost', 1, 3.1);
      MT.applyToEngine();
      out.applied = W.REVERB.frost && W.REVERB.frost[0] === 0.7 && W.REVERB.frost[1] === 3.1;
      // audition path doesn't throw (audio + setReverb)
      let audErr = null; try { G.Audio.init(); MT.test(); } catch (e) { audErr = String(e); }
      out.auditionOK = audErr === null;
      // _default protected
      out.defProtected = MT.removeEntry('_default') === false;
      out.removed = MT.removeEntry('frost');
      T.closeTool();
      return out;
    });

    console.log('REVERB-TOOL:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = o.fromData && o.hasDefault && o.registered && o.inPalette && o.roadmap
      && o.opened && o.listCount >= 5 && o.added && o.applied && o.auditionOK
      && o.defProtected && o.removed
      && netHits === 0 && !errs.length;
    console.log(ok ? 'REVERB-TOOL TEST: PASS' : 'REVERB-TOOL TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
