// Prefab system 2.0 (Edit ▸ Content, roadmap #35): the prefab library manager over the editor's
// localStorage prefab store (mossveil-ed-prefabs). Verifies registration + the engine API, then
// imports two prefabs (a parent nesting a child), and exercises summary, usedBy, cycle-guard, nest,
// rename (with nested-ref rewrite), duplicate, delete (with nested-ref stripping) and export round-
// trip. All in the editor's own (fresh) localStorage; cleans up after. Zero outbound network.
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
      const T = G.Tools, MT = T.prefabs, out = {};
      out.registered = T._test.toolIds().includes('prefabs');
      out.inPalette = T._test.paletteSearch('prefab').some(l => /prefab/i.test(l));
      out.roadmap = T.roadmapStats().done >= 36;
      out.engineApi = !!(MT && MT.list && MT.summary && MT.usedBy && MT.rename && MT.duplicate && MT.remove && MT.nest && MT.importJSON && MT.exportJSON);
      out.storeHook = !!(G.__ed && G.__ed.prefabsAPI && G.__ed.prefabsAPI.get && G.__ed.prefabsAPI.persist);

      // ---- import a parent (with a prop + an enemy) and a child (a zone) ----
      const lib = {
        ZZ_child: { items: [{ kind: 'zone', data: { rect: { x: 0, y: 0 }, to: '' }, x: 0, y: 0 }], ox: 0, oy: 0 },
        ZZ_parent: { items: [
          { kind: 'prop', data: { type: 'lever', x: 0, y: 0 }, x: 0, y: 0 },
          { kind: 'enemy', data: { type: 'tumblebug', x: 2, y: 0 }, x: 2, y: 0 },
          { kind: 'prefab', data: { prefab: 'ZZ_child' }, x: 1, y: 1 }
        ], ox: 1, oy: 0 }
      };
      const imp = MT.importJSON(JSON.stringify(lib), false);
      out.imported = imp.ok && imp.count === 2 && MT.list().includes('ZZ_parent') && MT.list().includes('ZZ_child');

      const sm = MT.summary('ZZ_parent');
      out.summary = sm.counts.prop === 1 && sm.counts.enemy === 1 && sm.counts.prefab === 1 && sm.nested.includes('ZZ_child') && sm.items === 3;
      out.usedBy = MT.usedBy('ZZ_child').includes('ZZ_parent');
      out.cycleGuard = MT.wouldCycle('ZZ_child', 'ZZ_parent') === true && MT.wouldCycle('ZZ_parent', 'ZZ_child') === false;

      // nest the parent... into a fresh third prefab, then check it took
      MT.importJSON(JSON.stringify({ ZZ_outer: { items: [], ox: 0, oy: 0 } }), false);
      out.nested = MT.nest('ZZ_outer', 'ZZ_parent', 1, 0) && MT.usedBy('ZZ_parent').includes('ZZ_outer');

      // rename the child — the parent's nested reference must follow
      out.renamed = MT.rename('ZZ_child', 'ZZ_kid') && MT.list().includes('ZZ_kid') && !MT.list().includes('ZZ_child') && MT.summary('ZZ_parent').nested.includes('ZZ_kid');

      // duplicate
      const dup = MT.duplicate('ZZ_parent');
      out.duplicated = !!dup && MT.list().includes(dup) && dup !== 'ZZ_parent';

      // export round-trips
      let exp = null; try { exp = JSON.parse(MT.exportJSON()); } catch (_) { }
      out.exportRT = exp && exp.ZZ_parent && Array.isArray(exp.ZZ_parent.items);

      // delete the kid — should strip the nested ref out of ZZ_parent
      const rm = MT.remove('ZZ_kid');
      out.deleted = rm.removed && rm.strippedFrom.includes('ZZ_parent') && !MT.summary('ZZ_parent').nested.includes('ZZ_kid');

      out.opened = T.openTool('prefabs'); T.closeTool();

      // ---- clean up everything we added ----
      MT.list().filter(n => /^ZZ_/.test(n)).forEach(n => MT.remove(n));
      out.cleaned = !MT.list().some(n => /^ZZ_/.test(n));
      return out;
    });

    console.log('PREFABS-TOOL:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['registered', 'inPalette', 'roadmap', 'engineApi', 'storeHook', 'imported', 'summary', 'usedBy', 'cycleGuard', 'nested', 'renamed', 'duplicated', 'exportRT', 'deleted', 'opened', 'cleaned'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'PREFABS-TOOL TEST: PASS' : 'PREFABS-TOOL TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
