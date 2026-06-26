// Design notes / TODO (Edit ▸ Project): a persistent build checklist in localStorage, with optional
// level tagging. Editor-only, offline.
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
      const T = G.Tools, MT = T.notes, out = {};
      try { localStorage.removeItem('mossveil-notes'); } catch (_) { }
      out.registered = T._test.toolIds().includes('notes');
      out.inPalette = T._test.paletteSearch('design notes todo').some(l => /notes|todo/i.test(l));
      out.roadmap = T.roadmapStats().done >= 25;
      out.opened = T.openTool('notes');
      MT.add('build a boss arena', 'gloom');
      MT.add('tune dash feel');
      out.added = MT.list().length === 2;
      const ts = MT.list().find(n => n.text === 'tune dash feel').ts;
      MT.toggle(ts);
      out.toggled = MT.list().find(n => n.ts === ts).done === true;
      out.tagged = MT.list().some(n => n.level === 'gloom');
      MT.clearDone();
      out.cleared = MT.list().length === 1 && !MT.list()[0].done;
      MT.remove(MT.list()[0].ts);
      out.removed = MT.list().length === 0;
      try { localStorage.removeItem('mossveil-notes'); } catch (_) { }
      T.closeTool();
      return out;
    });

    console.log('NOTES-TOOL:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = o.registered && o.inPalette && o.roadmap && o.opened
      && o.added && o.toggled && o.tagged && o.cleared && o.removed
      && netHits === 0 && !errs.length;
    console.log(ok ? 'NOTES-TOOL TEST: PASS' : 'NOTES-TOOL TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
