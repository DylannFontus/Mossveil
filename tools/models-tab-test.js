// Models tab 2.0 (Models tab animation, roadmap #38): the rig editor's animation workflow gains keyframe
// navigation (jump to prev/next key via buttons / , . keys / clickable key chips), delete-keyframe-at-time,
// and clip duplicate + rename. This test builds a 1-part model + a clip in the in-memory working doc, lays
// down keys at 0 / 0.5 / 1s, then exercises the new ops via the G.__ed.model* hooks and asserts the key
// list, scrub navigation (incl. wrap-around), delete, duplicate, and rename. It only touches the working
// model doc (never G.Models.save → no library pollution). Zero outbound network, no page errors.
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
      const out = {}, E = G.__ed;
      out.roadmap = G.Tools.roadmapStats().done >= 43;
      out.hooks = !!(E.modelGotoKey && E.modelDeleteKey && E.modelDupClip && E.modelRenameClip && E.modelKeyTimes && E.modelGotoTime && E.modelAddKey);

      E.setTab('models');
      const doc = E.modelDoc();
      doc.name = 'kftest'; doc.parts.length = 0; doc.clips = {};
      E.modelAdd('box');                       // one part to key
      doc.clips.test = { dur: 1, loop: true, tracks: {} };
      E.modelSetClip('test');

      // lay down three keyframes at 0 / 0.5 / 1
      E.modelGotoTime(0); E.modelAddKey();
      E.modelGotoTime(0.5); E.modelAddKey();
      E.modelGotoTime(1); E.modelAddKey();
      out.keys3 = JSON.stringify(E.modelKeyTimes()) === JSON.stringify([0, 0.5, 1]);

      // navigation: from t=1 → prev=0.5 → next=1 → next wraps to first (0)
      E.modelGotoKey(-1); out.prev = Math.abs(E.modelTime() - 0.5) < 1e-3;
      E.modelGotoKey(1);  out.next = Math.abs(E.modelTime() - 1) < 1e-3;
      E.modelGotoKey(1);  out.wrap = Math.abs(E.modelTime() - 0) < 1e-3;

      // delete the key at 0.5 → [0, 1]
      E.modelGotoTime(0.5);
      out.delKey = E.modelDeleteKey();
      out.keys2 = JSON.stringify(E.modelKeyTimes()) === JSON.stringify([0, 1]);

      // duplicate the clip: new unique name, tracks copied, becomes current
      const dupName = E.modelDupClip();
      out.dup = !!dupName && !!doc.clips[dupName] && E.modelClip() === dupName && JSON.stringify(E.modelKeyTimes()) === JSON.stringify([0, 1]);

      // rename the (duplicated) current clip
      out.rename = E.modelRenameClip('renamedClip') && !!doc.clips.renamedClip && E.modelClip() === 'renamedClip' && !doc.clips[dupName];

      // key chips render into the panel
      out.chipsDom = !!document.querySelector('#modelPanel .mkey');
      return out;
    });

    console.log('MODELS-TAB:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['roadmap', 'hooks', 'keys3', 'prev', 'next', 'wrap', 'delKey', 'keys2', 'dup', 'rename', 'chipsDom'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'MODELS-TAB TEST: PASS' : 'MODELS-TAB TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
