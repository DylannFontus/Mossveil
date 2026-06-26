// Version snapshots (Edit ▸ Project): named local project checkpoints using the editor's
// snapshot/loadWorld hooks, with restore + diff. Offline, editor-only, no network.
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
      const T = G.Tools, MT = T.versions, out = {};
      try { localStorage.removeItem('mossveil-versions'); } catch (_) { }
      out.registered = T._test.toolIds().includes('versions');
      out.inPalette = T._test.paletteSearch('version snapshots').some(l => /version|snapshot/i.test(l));
      out.roadmap = T.roadmapStats().done >= 19;
      out.opened = T.openTool('versions');
      // take a snapshot of the current project
      out.took = MT.takeSnapshot('test-v1');
      out.listed = MT.list().length === 1 && MT.list()[0].name === 'test-v1';
      // mutate the live project, then diff: the changed level shows up
      const id = Object.keys(G.LEVELS)[0];
      G.LEVELS[id].props = (G.LEVELS[id].props || []).concat([{ type: 'door', x: 1, y: 1 }]);
      const d = MT.diff(0);
      out.diff = d && d.changed.includes(id);
      // add a brand-new level -> shows as added
      G.LEVELS['zznew'] = { w: 10, h: 10, biome: 'gloom', tiles: [] };
      out.diffAdded = MT.diff(0).added.includes('zznew');
      // restore brings back the snapshot (zznew gone, props reverted)
      out.restored = MT.restore(0);
      out.afterRestore = !G.LEVELS['zznew'];
      MT.remove(0);
      out.cleared = MT.list().length === 0;
      try { localStorage.removeItem('mossveil-versions'); } catch (_) { }
      T.closeTool();
      return out;
    });

    console.log('VERSIONS-TOOL:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = o.registered && o.inPalette && o.roadmap && o.opened
      && o.took && o.listed && o.diff && o.diffAdded && o.restored && o.afterRestore && o.cleared
      && netHits === 0 && !errs.length;
    console.log(ok ? 'VERSIONS-TOOL TEST: PASS' : 'VERSIONS-TOOL TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
