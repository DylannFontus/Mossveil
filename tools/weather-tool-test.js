// Weather preset editor (Edit ▸ World): atmosphere presets externalised to data/weather.js,
// authored in-editor (rain/snow/leaves/embers/wind/fog/wet/lightning), hot-applied and previewed.
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
      const T = G.Tools, W = G.Weather, MT = T.weather, out = {};
      out.fromData = !!G.WEATHER_DATA && !!G.WEATHER_DATA.presets;
      out.count = W.KINDS.length;                                 // 8 defaults
      out.registered = T._test.toolIds().includes('weather');
      out.inPalette = T._test.paletteSearch('weather preset').some(l => /weather/i.test(l));
      out.roadmap = T.roadmapStats().done >= 10;                  // foundation4+music3+charms1+sfx1+weather1
      out.opened = T.openTool('weather');
      out.listCount = document.querySelectorAll('#toolHost .tc-pal-item').length;
      // author a preset and hot-apply
      MT.addPreset();
      out.renamed = MT.renamePreset(MT.state.sel, 'zzfog');
      MT.setProp('zzfog', 'fog', 0.9);
      MT.setProp('zzfog', 'wind', 0.5);
      MT.setLightning('zzfog', true);
      MT.applyToEngine();
      out.engineHas = W.KINDS.includes('zzfog');
      W.set('zzfog');
      out.propApplied = W.props().fog === 0.9 && W.props().wind === 0.5 && W.props().lightning === 1;
      // 'none' is protected
      out.noneProtected = MT.removePreset('none') === false && MT.renamePreset('none', 'x') === false;
      // live preview onto a canvas without throwing
      let drawErr = null;
      try {
        const cv = document.createElement('canvas'); cv.width = 120; cv.height = 70; const cx = cv.getContext('2d');
        W.previewProps({ snow: 0.8, wind: 0.6, fog: 0.3 });
        for (let i = 0; i < 12; i++) W.update(0.05);
        W.draw(cx, 120, 70); W.previewEnd();
      } catch (e) { drawErr = String(e); }
      out.previewOK = drawErr === null;
      out.removed = MT.removePreset('zzfog');
      T.closeTool();
      return out;
    });

    console.log('WEATHER-TOOL:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = o.fromData && o.count >= 8 && o.registered && o.inPalette && o.roadmap
      && o.opened && o.listCount >= 8 && o.renamed && o.engineHas && o.propApplied
      && o.noneProtected && o.previewOK && o.removed
      && netHits === 0 && !errs.length;
    console.log(ok ? 'WEATHER-TOOL TEST: PASS' : 'WEATHER-TOOL TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
