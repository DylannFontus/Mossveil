// Inspector 2.0 (right-panel object inspector, roadmap #32): the per-object inspector gains a toolbar
// with (a) copy / paste SETTINGS between same-type objects — copy snapshots every editable field except
// spatial/identity keys (x/y/oid/rot/rect/side/active), paste merges them onto another object of the same
// kind+type (distinct from Ctrl+C/V which copy whole objects); and (b) a live field filter that toggles
// field rows by label substring in place. This test injects two synthetic same-type props into the current
// level in memory, copies one onto the other (asserting position is NOT carried), exercises the filter,
// then removes the scratch props. Zero outbound network, no page errors. Never save()s.
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
      out.roadmap = G.Tools.roadmapStats().done >= 41;
      out.hooks = !!(ED.insCopy && ED.insPaste && ED.insCanPaste && ED.insClip && ED.insSetFilter && ED.insFilterVal);

      ED.setTab('scene');
      const id = ED.currentId();
      const L = G.LEVELS[id];
      const props = L.props = L.props || [];
      const base = props.length;
      // two signs with different settings — copy A's settings onto B, B keeps its own position
      props.push({ type: 'sign', x: 5, y: 5, title: 'AAA', text: 'hello world', style: 'totem' });
      props.push({ type: 'sign', x: 9, y: 7, title: 'BBB', text: 'different', style: 'tablet' });
      const iA = base, iB = base + 1;

      // copy from A
      ED.selectProp(id, iA);
      out.copy = ED.insCopy();
      const clip = ED.insClip();
      out.clip = !!(clip && clip.kind === 'prop' && clip.type === 'sign');
      out.clipNoPos = clip && !('x' in clip.data) && !('y' in clip.data) && clip.data.text === 'hello world';

      // paste onto B (same kind+type)
      ED.selectProp(id, iB);
      out.canPaste = ED.insCanPaste();
      out.paste = ED.insPaste();
      out.pasted = props[iB].text === 'hello world' && props[iB].style === 'totem' && props[iB].title === 'AAA';
      out.posKept = props[iB].x === 9 && props[iB].y === 7;     // position must NOT be overwritten

      // toolbar rendered into the live inspector
      out.toolbarDom = !!document.querySelector('#insBody .insTools') && !!document.querySelector('#insBody .insFilter');

      // field filter: only the "Text" row should remain visible among labelled rows
      ED.selectProp(id, iA);
      ED.insSetFilter('text');
      const rows = [...document.querySelectorAll('#insBody .frow')].filter(r => r.querySelector('label'));
      const vis = rows.filter(r => r.style.display !== 'none').map(r => r.querySelector('label').textContent.toLowerCase());
      out.filtered = vis.length > 0 && vis.every(t => t.includes('text'));
      ED.insSetFilter('');
      const visAfter = rows.filter(r => r.style.display !== 'none');
      out.cleared = visAfter.length === rows.length;             // clearing restores every row

      // paste-incompatibility: a zone can't accept a sign's settings
      const zid = (L.transitions && L.transitions.length) ? 0 : -1;
      if (zid >= 0) { ED.setSel({ kind: 'zone', i: zid }); ED.refreshInspector(); out.crossBlocked = !ED.insCanPaste(); }
      else out.crossBlocked = true;

      // cleanup — drop the scratch props, deselect, restore the inspector
      ED.setSel(null); if (ED.setMulti) ED.setMulti([]);
      props.splice(base, 2);
      ED.refreshInspector();
      out.cleaned = props.length === base;
      return out;
    });

    console.log('INSPECTOR-TOOL:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['roadmap', 'hooks', 'copy', 'clip', 'clipNoPos', 'canPaste', 'paste', 'pasted', 'posKept', 'toolbarDom', 'filtered', 'cleared', 'crossBlocked', 'cleaned'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'INSPECTOR-TOOL TEST: PASS' : 'INSPECTOR-TOOL TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
