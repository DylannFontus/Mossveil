// Level regression net (roadmap #64): the editor half. The Regression manager tool (Edit ▸ Tools) is
// the library + results dashboard over the localStorage store the game's replay net writes. This seeds
// synthetic cases + results, opens the tool, and asserts it registers, lists the cases with their
// baselines, shows pass / fail badges, and that its library ops (save-from-last, rename, import/export,
// delete, clear-results, stats) all work. Restores the localStorage keys. Zero outbound network.
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
      const T = G.Tools, MT = T.regression, out = {};
      const K = ['mossveil_replay', 'mossveil_regression', 'mossveil_regression_results'];
      const orig = {}; K.forEach(k => orig[k] = localStorage.getItem(k));
      const mkRec = (room, frames, exp) => ({ seed: 123, start: { room, x: 1, y: 2 }, frames: Array.from({ length: frames }, () => ({ h: {}, dt: 0.016 })), expect: exp, savedAt: Date.now() });
      try {
        out.registered = T._test.toolIds().includes('regression');
        out.inPalette = T._test.paletteSearch('regression').some(l => /regression|assert|record/i.test(l));
        out.roadmap = T.ROADMAP.some(g => g.items.some(i => i[0] === 64 && i[2] === 'done'));
        out.engineApi = !!(MT && MT.cases && MT.results && MT.saveCase && MT.saveCaseFromLast && MT.deleteCase && MT.renameCase && MT.exportJSON && MT.importJSON && MT.stats);

        // ---- seed a 2-case library + results (one pass, one fail) ----
        const lib = {
          caseA: mkRec('gloom', 12, { room: 'gloom', x: 1, y: 2, hp: 5, maxHp: 5, soul: 0, frames: 12 }),
          caseB: mkRec('gloom', 20, { room: 'gloom', x: 3, y: 4, hp: 4, maxHp: 5, soul: 10, frames: 20 })
        };
        localStorage.setItem('mossveil_regression', JSON.stringify(lib));
        localStorage.setItem('mossveil_regression_results', JSON.stringify({
          caseA: { name: 'caseA', pass: true, expected: lib.caseA.expect, actual: lib.caseA.expect, diffs: [], at: Date.now() },
          caseB: { name: 'caseB', pass: false, expected: lib.caseB.expect, actual: { room: 'gloom', x: 9, y: 4, hp: 2, maxHp: 5, soul: 10 }, diffs: [{ k: 'x', exp: 3, act: 9 }, { k: 'hp', exp: 4, act: 2 }], at: Date.now() }
        }));

        // ---- read-side API ----
        const cs = MT.cases();
        out.listsCases = cs.length === 2 && cs.some(c => c.name === 'caseA') && cs.some(c => c.name === 'caseB');
        const st = MT.stats();
        out.stats = st.cases === 2 && st.pass === 1 && st.fail === 1 && st.frames === 32;

        // ---- render: rows + pass/fail badges ----
        out.opened = T.openTool('regression');
        const rows = document.querySelectorAll('.tc-host table tbody tr');
        out.rows = rows.length >= 2;
        const txt = document.querySelector('.tc-host').textContent;
        out.badges = /pass/.test(txt) && /fail/.test(txt);
        out.baselineShown = /5\/5/.test(txt);   // caseA baseline hp/maxHp
        T.closeTool();

        // ---- save-from-last-recording ----
        localStorage.setItem('mossveil_replay', JSON.stringify(mkRec('verdant', 8, { room: 'verdant', x: 0, y: 0, hp: 5, maxHp: 5, soul: 0, frames: 8 })));
        out.fromLast = MT.saveCaseFromLast('fromrec') === true && MT.cases().some(c => c.name === 'fromrec');

        // ---- rename + delete (delete also drops the result) ----
        out.renamed = MT.renameCase('caseA', 'caseA2') === true && MT.cases().some(c => c.name === 'caseA2') && !MT.cases().some(c => c.name === 'caseA');
        out.deleted = MT.deleteCase('caseB') === true && !MT.cases().some(c => c.name === 'caseB') && !MT.results().caseB;

        // ---- export round-trips through import ----
        const dump = MT.exportJSON();
        out.exported = typeof dump === 'string' && dump.includes('caseA2') && dump.includes('fromrec');
        out.importOk = MT.importJSON('{"imp1":' + JSON.stringify(mkRec('gloom', 5, null)) + '}', 'merge') === true && MT.cases().some(c => c.name === 'imp1');
        out.importBad = MT.importJSON('not json', 'merge') === false;

        // ---- clear results ----
        MT.clearResults();
        out.cleared = Object.keys(MT.results()).length === 0;
      } finally {
        K.forEach(k => { if (orig[k] == null) localStorage.removeItem(k); else localStorage.setItem(k, orig[k]); });
      }
      out.restored = JSON.stringify(['mossveil_regression', 'mossveil_regression_results', 'mossveil_replay'].map(k => localStorage.getItem(k))) === JSON.stringify([orig.mossveil_regression, orig.mossveil_regression_results, orig.mossveil_replay]);
      return out;
    });

    console.log('REGRESSION-TOOL:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['registered', 'inPalette', 'roadmap', 'engineApi', 'listsCases', 'stats', 'opened', 'rows', 'badges', 'baselineShown', 'fromLast', 'renamed', 'deleted', 'exported', 'importOk', 'importBad', 'cleared', 'restored'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'REGRESSION-TOOL TEST: PASS' : 'REGRESSION-TOOL TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
