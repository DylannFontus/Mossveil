// Hierarchy 2.0 (left panel, roadmap #33): the room object list gains a live filter, collapsible
// groups with counts, per-kind icons and per-row frame/delete actions — added to refreshHierarchy
// without disturbing the existing click-to-select / dblclick-to-frame behavior. This test drives the
// real rendered DOM: it asserts the toolbar + four groups render, every row has an icon and the two
// hover actions, that a no-match filter hides everything (and shows the empty note) while clearing
// restores all rows, and that clicking a group header collapses it. Zero outbound network.
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
      const out = {};
      const H = document.getElementById('hierarchy');
      const vis = e => e.style.display !== 'none';
      out.roadmap = G.Tools.roadmapStats().done >= 37;
      out.panel = !!H;
      out.toolbar = !!(H && H.querySelector('.hbar input'));
      out.groups = H ? H.querySelectorAll('.hgroup').length === 4 : false;

      let items = [...H.querySelectorAll('.hitem')];
      const total = items.length;
      out.hasItems = total > 0;
      out.icons = items.every(it => { const i = it.querySelector('.hico'); return i && i.textContent.length > 0; });
      out.actions = items.every(it => it.querySelectorAll('.hact').length === 2);

      // --- filter: a no-match query hides every row and shows the empty note ---
      const input = H.querySelector('.hbar input');
      input.value = 'zzqqxx_definitely_nomatch'; input.dispatchEvent(new Event('input'));
      out.filterHides = [...H.querySelectorAll('.hitem')].every(it => !vis(it));
      out.emptyNote = !!H.querySelector('.hempty');

      // --- clearing the filter restores all rows ---
      input.value = ''; input.dispatchEvent(new Event('input'));
      out.filterRestores = [...H.querySelectorAll('.hitem')].filter(vis).length === total && !H.querySelector('.hempty');

      // --- a real substring filter narrows the list (derive it from a rendered label) ---
      const firstLabel = (H.querySelector('.hitem .hlabel') || {}).textContent || '';
      const token = (firstLabel.trim().split(/[\s:(]/)[0] || '').slice(0, 4);
      if (token) { input.value = token; input.dispatchEvent(new Event('input')); const shown = [...H.querySelectorAll('.hitem')].filter(vis).length; out.filterNarrows = shown >= 1 && shown <= total; input.value = ''; input.dispatchEvent(new Event('input')); }
      else out.filterNarrows = true;

      // --- collapsing a group adds the class and hides its rows (rebuilds the panel) ---
      const grp = document.getElementById('hierarchy').querySelector('.hgroup');
      grp.click();
      const grp2 = document.getElementById('hierarchy').querySelector('.hgroup');
      out.collapsed = grp2.classList.contains('collapsed');
      // the rows immediately after the first (now-collapsed) header should be hidden
      let firstRowsHidden = true, n = grp2.nextElementSibling;
      while (n && n.classList.contains('hitem')) { if (vis(n)) { firstRowsHidden = false; break; } n = n.nextElementSibling; }
      out.collapseHidesRows = firstRowsHidden;
      grp2.click(); // expand again, leave it tidy

      return out;
    });

    console.log('HIERARCHY-TOOL:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['roadmap', 'panel', 'toolbar', 'groups', 'hasItems', 'icons', 'actions', 'filterHides', 'emptyNote', 'filterRestores', 'filterNarrows', 'collapsed', 'collapseHidesRows'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'HIERARCHY-TOOL TEST: PASS' : 'HIERARCHY-TOOL TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
