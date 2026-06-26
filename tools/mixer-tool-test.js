// Audio mixer (Edit ▸ Audio): music/sfx/ambient bus levels externalised to data/mixer.js, applied
// at startup + live, with a master VU meter. Offline (local server only). Does NOT save().
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
      const T = G.Tools, A = G.Audio, MT = T.mixer, out = {};
      out.fromData = !!G.MIXER_DATA && G.MIXER_DATA.music != null;
      const cur = A.mixExportCurrent();
      out.hasBuses = cur.music != null && cur.sfx != null && cur.ambient != null;
      out.registered = T._test.toolIds().includes('mixer');
      out.inPalette = T._test.paletteSearch('audio mixer').some(l => /mixer/i.test(l));
      out.roadmap = T.roadmapStats().done >= 17;
      out.opened = T.openTool('mixer');
      A.init();
      MT.setLevel('sfx', 0.5); MT.setLevel('music', 1.4);
      const c2 = A.mixExportCurrent();
      out.applied = c2.sfx === 0.5 && c2.music === 1.4;
      // meter callable
      let mErr = null; try { A.sfx('bench'); const lv = A.meterLevel(); out.meter = typeof lv === 'number' && lv >= 0; } catch (e) { mErr = String(e); }
      out.meterOK = mErr === null;
      T.closeTool();
      return out;
    });

    console.log('MIXER-TOOL:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = o.fromData && o.hasBuses && o.registered && o.inPalette && o.roadmap
      && o.opened && o.applied && o.meterOK && o.meter
      && netHits === 0 && !errs.length;
    console.log(ok ? 'MIXER-TOOL TEST: PASS' : 'MIXER-TOOL TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
