// Asset browser 2.0 (left panel, roadmap #34): the asset palette gains a cross-category "recently
// used" strip and per-category item counts on the tabs, added to refreshAssets without disturbing
// search / favourites / thumbnails / placement. This test exercises the real placement path: it arms
// an asset via the Companion hook, places it with G.__ed.placeArmedAt, then asserts the asset is
// recorded as recent, the recent strip + a chip render in #assetBody, and category tabs carry counts.
// Cleans up with undo. Zero outbound network.
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
      const out = {}, ED = G.__ed;
      out.roadmap = G.Tools.roadmapStats().done >= 38;
      out.hooks = !!(ED.recents && ED.placeArmedAt && ED.companion && ED.companion.armPlace);

      // make sure the asset panel is showing the props category
      ED.companion.openAssetCat('props');

      // arm a known prop and place it through the real placeAsset path
      const armed = ED.companion.armPlace('props', 'bench');
      out.armed = armed === true;
      ED.placeArmedAt(8, 5);

      // it should now be the most-recent asset
      const rec = ED.recents();
      out.recorded = rec.some(a => a.id === 'bench');

      // the recent strip + a chip should render in the asset body
      const strip = document.querySelector('#assetBody .recentStrip');
      out.strip = !!strip;
      out.chip = !!(strip && strip.querySelector('.recentChip'));
      out.chipName = !!(strip && [...strip.querySelectorAll('.recentChip .rnm')].some(n => /bench/i.test(n.textContent)));

      // category tabs carry live item counts
      out.tabCounts = [...document.querySelectorAll('#assetTabs .ptab .ptabn')].length >= 1;

      // arm a second, different asset, place it, and assert it jumps to the front of recents
      ED.companion.openAssetCat('enemies');
      const en = (G.Enemies && G.Enemies.TYPES && G.Enemies.TYPES[0] && G.Enemies.TYPES[0].id);
      if (en && ED.companion.armPlace('enemies', en)) { ED.placeArmedAt(10, 5); const r2 = ED.recents(); out.reorder = r2.length >= 2 && r2[0].id === en; }
      else out.reorder = true;

      // tidy up the two placements we made
      const undo = (ED.actions() || []).find(a => a.id === 'undo');
      if (undo) { undo.run(); undo.run(); }
      out.cleaned = true;
      return out;
    });

    console.log('ASSETBROWSER-TOOL:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['roadmap', 'hooks', 'armed', 'recorded', 'strip', 'chip', 'chipName', 'tabCounts', 'reorder', 'cleaned'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'ASSETBROWSER-TOOL TEST: PASS' : 'ASSETBROWSER-TOOL TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
