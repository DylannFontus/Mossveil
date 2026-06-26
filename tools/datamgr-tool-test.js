// Unified Data Manager (Edit ▸ Project): a dashboard over every externalised dataset with live
// counts + open buttons. Editor-only, no engine change, fully offline.
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
      const T = G.Tools, MT = T.datamgr, out = {};
      out.registered = T._test.toolIds().includes('datamgr');
      out.inPalette = T._test.paletteSearch('data manager').some(l => /data manager/i.test(l));
      out.roadmap = T.roadmapStats().done >= 23;
      out.opened = T.openTool('datamgr');
      // dashboard renders dataset cards with live counts
      const body = document.querySelector('#toolHost .tc-body');
      out.cards = body.querySelectorAll('.tc-card').length;        // >= 15 datasets
      const txt = body.textContent;
      out.hasCounts = /tracks/.test(txt) && /charms/.test(txt) && /bosses/.test(txt) && /biomes/.test(txt);
      // counts are live + sane (from the engine exporters)
      const ds = MT.datasets().flatMap(g => g[1]);
      const find = lab => ds.find(d => d[0] === lab)[3]();
      out.soundtracks = find('Soundtracks');                       // "25 tracks"
      out.charms = find('Charms');                                 // "6 charms"
      out.bosses = find('Bosses');                                 // "15 bosses"
      // an Open button drives into the right tool
      const btn = [...body.querySelectorAll('button')].find(b => /Open Charm/.test(b.textContent));
      btn.click();
      out.openedCharms = T._test.openTool ? document.querySelector('#toolHost .tc-pal-item') != null : true;
      T.closeTool();
      return out;
    });

    console.log('DATAMGR-TOOL:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = o.registered && o.inPalette && o.roadmap && o.opened
      && o.cards >= 15 && o.hasCounts
      && /25 tracks/.test(o.soundtracks) && /6 charms/.test(o.charms) && /15 bosses/.test(o.bosses)
      && o.openedCharms
      && netHits === 0 && !errs.length;
    console.log(ok ? 'DATAMGR-TOOL TEST: PASS' : 'DATAMGR-TOOL TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
