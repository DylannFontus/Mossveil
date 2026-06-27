// Tutorial / hints editor (roadmap #93): the editor half. Authors the hint list (src/tutorial.js ->
// data/tutorial.js) in the lint of the Achievements editor. Drives the working-copy API directly (it
// does NOT call save(), which would write the real dataset) + the UI, asserting register / palette /
// #93-done, load/add/duplicate/remove, field + trigger edits, the enable toggle, applyToEngine pushing
// into the live G.Tutorial, and revert. Restores G.Tutorial from its data overlay; zero outbound network.
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
      const T = G.Tools, MT = T.tutorial, TU = G.Tutorial, out = {};
      const savedOverlay = JSON.parse(JSON.stringify(G.TUTORIAL_DATA || TU.exportDefaults()));
      try {
        out.registered = T._test.toolIds().includes('tutorial');
        out.inPalette = T._test.paletteSearch('tutorial').some(l => /tutorial|hint/i.test(l));
        out.roadmap = T.ROADMAP.some(g => g.items.some(i => i[0] === 93 && i[2] === 'done'));
        out.api = !!(MT && MT.load && MT.getWorking && MT.addHint && MT.removeHint && MT.setField && MT.setTrigType && MT.setTrigParam && MT.setEnabled && MT.applyToEngine && MT.revert);

        // ---- working-copy authoring (no save) ----
        MT.load();
        const n0 = MT.getWorking().hints.length;
        out.loaded = n0 >= 1 && MT.getWorking().enabled === true;

        const id = MT.addHint();
        out.added = MT.getWorking().hints.length === n0 + 1 && MT.getWorking().hints.some(h => h.id === id);
        const dupId = MT.duplicateHint();
        out.duplicated = MT.getWorking().hints.length === n0 + 2 && dupId !== id;

        const idx = MT.getWorking().hints.length - 1;
        MT.setField(idx, 'text', 'hello world');
        out.field = MT.getWorking().hints[idx].text === 'hello world';
        MT.setTrigType(idx, 'hpBelow');
        out.trigType = MT.getWorking().hints[idx].trigger.type === 'hpBelow' && MT.getWorking().hints[idx].trigger.n === 2;
        MT.setTrigParam(idx, 'n', 4);
        out.trigParam = MT.getWorking().hints[idx].trigger.n === 4;
        MT.setTrigType(idx, 'propNear');
        out.trigPropDefaults = MT.getWorking().hints[idx].trigger.prop === 'lever' && MT.getWorking().hints[idx].trigger.dist === 2.5;

        out.removed = MT.removeHint(idx) === true && MT.getWorking().hints.length === n0 + 1;

        MT.setEnabled(false);
        out.enabledToggle = MT.getWorking().enabled === false;

        // ---- applyToEngine pushes the working copy into the live G.Tutorial ----
        MT.setEnabled(true);
        MT.addHint(); MT.setField(MT.getWorking().hints.length - 1, 'id', '__probe__');
        MT.getWorking().hints[MT.getWorking().hints.length - 1].id = '__probe__';
        MT.applyToEngine();
        out.applied = TU.exportCurrent().hints.some(h => h.id === '__probe__');

        // ---- revert restores the defaults ----
        MT.revert();
        out.reverted = JSON.stringify(MT.getWorking().hints.map(h => h.id)) === JSON.stringify(TU.exportDefaults().hints.map(h => h.id));

        // ---- UI ----
        out.opened = T.openTool('tutorial');
        const host = document.querySelector('.tc-host');
        out.listRenders = host.querySelectorAll('.tc-pal-item').length >= 1 && /Save tutorial/.test(host.textContent);
        const firstItem = host.querySelector('.tc-pal-item'); if (firstItem) firstItem.click();
        out.editFields = document.querySelector('.tc-host').querySelectorAll('select').length >= 2 && document.querySelector('.tc-host').querySelectorAll('textarea').length >= 1;
        out.enableBox = !!document.querySelector('.tc-host').querySelector('input[type=checkbox]');
        T.closeTool();
      } finally {
        TU.applyData(savedOverlay);   // restore the live engine
        MT.load();
      }
      return out;
    });

    console.log('TUTORIAL-TOOL:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['registered', 'inPalette', 'roadmap', 'api', 'loaded', 'added', 'duplicated', 'field', 'trigType', 'trigParam', 'trigPropDefaults', 'removed', 'enabledToggle', 'applied', 'reverted', 'opened', 'listRenders', 'editFields', 'enableBox'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'TUTORIAL-TOOL TEST: PASS' : 'TUTORIAL-TOOL TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
