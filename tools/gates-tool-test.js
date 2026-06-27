// Progression & gates analyser (roadmap #89): an editor-only read-only scanner of the lock graph
// (switches / signals / flags / gates) across all levels — lint/deps/perf/dps mould, no engine change.
// Injects a deterministic scratch level that exercises every lint case, then proves register / palette /
// #89-done / API, the per-level inventory (levelReport), the global flag table (flags), and that lint()
// catches each dead-end (door never opens, dead switch, free/oid-less gate, dead On-Signal/Emit, flag
// read-but-never-set / set-but-never-read) while NOT flagging the wired-up door / controlled gate /
// matched flag, plus the UI (stats bar, world issues, per-level detail, flag view). Restores; never saves.
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
      const T = G.Tools, MT = T.gates, out = {};
      const SID = '__gA__';
      try {
        out.registered = T._test.toolIds().includes('gates');
        out.inPalette = T._test.paletteSearch('gates').some(l => /gate|progression|switch|flag/i.test(l));
        out.roadmap = T.ROADMAP.some(g => g.items.some(i => i[0] === 89 && i[2] === 'done'));
        out.api = !!(MT && MT.levelReport && MT.world && MT.lint && MT.flags && MT.stats);

        // deterministic scratch level: one of every progression case
        G.LEVELS[SID] = {
          title: 'Gate Test A', w: 40, h: 24, biome: 'gloom',
          props: [
            { type: 'lever', oid: 1, signal: 'openA', x: 2, y: 2 },                 // drives door openA
            { type: 'door', oid: 2, signal: 'openA', x: 4, y: 2 },                  // OK (matched)
            { type: 'door', oid: 3, signal: 'orphanD', x: 6, y: 2 },                // door-stuck (no source)
            { type: 'lever', oid: 4, signal: 'deadL', x: 8, y: 2 },                 // key-dead
            { type: 'gate', oid: 5, x: 10, y: 2 },                                  // controlled by setActive 5
            { type: 'gate', oid: 9, x: 12, y: 2 },                                  // gate-free
            { type: 'gate', x: 14, y: 2 },                                          // gate-noid
            { type: 'lever', oid: 6, signal: 'hasSrc', x: 16, y: 2 },               // drives door hasSrc
            { type: 'door', oid: 7, signal: 'hasSrc', flag: 'needFlag', x: 18, y: 2 }, // signal OK; flag needFlag never set
            { type: 'lever', oid: 8, signal: 'setOnlySig', flag: 'setOnly', x: 20, y: 2 } // key-dead + flag-noread
          ],
          graph: {
            nodes: [
              { id: 'n1', type: 'setActive', p: { oid: 5 } },     // controls gate oid 5
              { id: 'n2', type: 'onSignal', p: { name: 'ghost' } }, // onsig-dead
              { id: 'n3', type: 'signal', p: { name: 'shout' } },   // emit-dead
              { id: 'n4', type: 'setFlag', p: { flag: 'fz' } },     // fz matched
              { id: 'n5', type: 'ifFlag', p: { flag: 'fz' } }
            ], links: []
          }
        };

        // ---- per-level inventory ----
        const r = MT.levelReport(SID);
        out.report = r.locks.length === 6 && r.gates.length === 3 && r.keys.length === 4 && r.sigSources.openA === 1 && r.sigSinks.openA === 1;

        // ---- global flag table ----
        const fl = MT.flags();
        out.flags = fl.needFlag && fl.needFlag.readers.length >= 1 && fl.needFlag.setters.length === 0
          && fl.setOnly && fl.setOnly.setters.length >= 1 && fl.setOnly.readers.length === 0
          && fl.fz && fl.fz.setters.length >= 1 && fl.fz.readers.length >= 1;

        // ---- lint ----
        const L = MT.lint(), inA = L.filter(i => i.level === SID);
        out.doorStuck = inA.some(i => i.kind === 'door-stuck' && /orphanD/.test(i.msg));
        out.doorOK = !inA.some(i => i.kind === 'door-stuck' && (/openA/.test(i.msg) || i.msg.indexOf('hasSrc') >= 0));
        out.gateFree = inA.some(i => i.kind === 'gate-free' && /oid 9/.test(i.msg));
        out.gate5OK = !inA.some(i => i.kind === 'gate-free' && /oid 5/.test(i.msg));
        out.gateNoid = inA.some(i => i.kind === 'gate-noid');
        out.keyDead = inA.some(i => i.kind === 'key-dead' && /deadL/.test(i.msg));
        out.onsigDead = inA.some(i => i.kind === 'onsig-dead' && /ghost/.test(i.msg));
        out.emitDead = inA.some(i => i.kind === 'emit-dead' && /shout/.test(i.msg));
        out.flagNoset = L.some(i => i.kind === 'flag-noset' && /needFlag/.test(i.msg));
        out.flagNoread = L.some(i => i.kind === 'flag-noread' && /setOnly/.test(i.msg));
        out.fzOK = !L.some(i => /"fz"/.test(i.msg));

        // ---- stats ----
        const s = MT.stats();
        out.stats = typeof s.levels === 'number' && s.doors >= 3 && s.gates >= 3 && s.flags >= 3 && typeof s.issues === 'number';

        // ---- UI ----
        out.opened = T.openTool('gates');
        const host = document.querySelector('.tc-host');
        out.statsBar = /levels/.test(host.textContent) && /issues/.test(host.textContent);
        out.worldIssues = /Issues ·/.test(host.textContent);
        const aRow = Array.prototype.slice.call(host.querySelectorAll('.tc-row')).find(x => /Gate Test A/.test(x.textContent)); if (aRow) aRow.click();
        out.detail = /LOCKS/.test(document.querySelector('.tc-host').textContent) && /SWITCHES/.test(document.querySelector('.tc-host').textContent);
        const fb = Array.prototype.slice.call(document.querySelector('.tc-host').querySelectorAll('button')).find(b => /Flags/.test(b.textContent)); if (fb) fb.click();
        out.flagsView = /needFlag/.test(document.querySelector('.tc-host').textContent);
        T.closeTool();
      } finally {
        delete G.LEVELS[SID];
      }
      return out;
    });

    console.log('GATES-TOOL:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['registered', 'inPalette', 'roadmap', 'api', 'report', 'flags', 'doorStuck', 'doorOK', 'gateFree', 'gate5OK', 'gateNoid', 'keyDead', 'onsigDead', 'emitDead', 'flagNoset', 'flagNoread', 'fzOK', 'stats', 'opened', 'statsBar', 'worldIssues', 'detail', 'flagsView'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'GATES-TOOL TEST: PASS' : 'GATES-TOOL TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
