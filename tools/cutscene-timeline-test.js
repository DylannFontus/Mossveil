// Cutscene timeline 2.0 (Scenes/Cutscene tab, roadmap #39): the central timeline gains a workflow
// toolbar (duplicate / delete the selected event, zoom px-per-second, snap grid, total-duration readout),
// a right-edge resize grip on each block (drag to change duration), and keyboard ops on the cutscene tab
// (Ctrl+D duplicate, Del delete, ←/→ nudge by the snap step). This test injects a synthetic cutscene in
// memory, exercises the new ops via the G.__ed.cs* hooks, asserts each behaves, then removes the scene.
// Zero outbound network, no page errors. Never save()s.
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
      out.roadmap = G.Tools.roadmapStats().done >= 40;
      out.hooks = !!(ED.csDup && ED.csDel && ED.csNudge && ED.csZoom && ED.csSnap && ED.csTotal && ED.csGetSel && ED.csSetSel && ED.csCur);

      ED.setTab('cutscene');                 // size + render the cutscene timeline
      G.CUTSCENES = G.CUTSCENES || {};
      out.fresh = !G.CUTSCENES.__test;       // sanity: our scratch id is unused
      G.CUTSCENES.__test = {
        id: '__test', name: 'T', level: ED.currentId(), skippable: true, events: [
          { t: 0, dur: 1, type: 'fade', from: 1, to: 0 },
          { t: 2, dur: 3, type: 'text', text: 'hi' },
          { t: 6, dur: 0.5, type: 'sfx', name: 'chime' }
        ]
      };
      ED.csSelect('__test', 1);              // select the middle 'text' event
      const c = ED.csCur();

      // total duration = max(t + dur) = 6 + 0.5
      out.total = Math.abs(ED.csTotal() - 6.5) < 1e-6;

      // snap grid getter/setter
      ED.csSnap(0.5);
      out.snapSet = ED.csSnap() === 0.5;

      // nudge the selected event right by one snap step: t 2 -> 2.5
      ED.csNudge(1);
      out.nudged = Math.abs(c.events[1].t - 2.5) < 1e-6;

      // duplicate: count grows, selection follows the copy, copy is offset later in time
      const before = c.events.length;
      ED.csDup();
      out.dupCount = c.events.length === before + 1;
      out.dupSel = ED.csGetSel() === 2 && c.events[2].type === 'text' && c.events[2].t > c.events[1].t;

      // delete the (selected) copy: count returns to baseline
      ED.csDel();
      out.delCount = c.events.length === before;

      // zoom clamps to [24, 160] px/s
      ED.csZoom(9999); out.zoomMax = ED.csZoom() === 160;
      ED.csZoom(1);    out.zoomMin = ED.csZoom() === 24;

      // toolbar actually rendered into the live tab
      out.toolbarDom = !!document.querySelector('#csView .cstools') && !!document.querySelector('#csView .cstlgrip');

      // cleanup — leave no scratch data behind
      delete G.CUTSCENES.__test;
      ED.csSetSel(-1);
      out.cleaned = !G.CUTSCENES.__test;
      return out;
    });

    console.log('CUTSCENE-TIMELINE:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['roadmap', 'hooks', 'fresh', 'total', 'snapSet', 'nudged', 'dupCount', 'dupSel', 'delCount', 'zoomMax', 'zoomMin', 'toolbarDom', 'cleaned'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'CUTSCENE-TIMELINE TEST: PASS' : 'CUTSCENE-TIMELINE TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
