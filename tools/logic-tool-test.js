// Logic graph 2.0 (Logic tab, roadmap #31): the visual-scripting canvas gains auto-layout (tidy by
// flow), zoom-to-fit (frame all), and duplicate-node, exposed as G.__ed.logicAutoLayout / logicFrameAll
// / logicDup and wired to palette buttons + keybinds (Ctrl+D, F). This test swaps the current room's
// graph for a 3-node chain in memory, asserts auto-layout lays it out left-to-right by depth, that
// frame-all sets a sane camera, and that duplicate clones the selected node — then restores the graph.
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
      out.roadmap = G.Tools.roadmapStats().done >= 39;
      out.hooks = !!(ED.logicAutoLayout && ED.logicFrameAll && ED.logicDup && ED.logicCam && ED.logicGraph && ED.logicSelect);

      ED.setTab('logic');               // size the logic canvas
      const L = G.LEVELS[ED.currentId()];
      const orig = L.graph;             // snapshot to restore later

      // a 3-node flow chain (all stacked at the same spot)
      L.graph = { nodes: [
        { id: 1, type: 'onRoomEnter', x: 0, y: 0, p: {} },
        { id: 2, type: 'toast', x: 0, y: 0, p: { text: 'hi' } },
        { id: 3, type: 'shake', x: 0, y: 0, p: { amount: 0.6 } }
      ], links: [ { from: 1, fp: 0, to: 2, tp: 0 }, { from: 2, fp: 0, to: 3, tp: 0 } ] };

      // --- auto-layout: lays the chain out left-to-right by depth ---
      ED.logicAutoLayout();
      const g = ED.logicGraph();
      const n = id => g.nodes.find(x => x.id === id);
      out.layout = n(2).x > n(1).x && n(3).x > n(2).x && n(1).x === 0;

      // --- frame-all: camera centres on the graph with an in-range zoom ---
      ED.logicFrameAll();
      const cam = ED.logicCam();
      out.frame = isFinite(cam.x) && isFinite(cam.y) && cam.zoom >= 0.4 && cam.zoom <= 2.2;

      // --- duplicate the selected node ---
      ED.logicSelect(2);
      const before = g.nodes.length;
      ED.logicDup();
      const g2 = ED.logicGraph();
      out.duplicated = g2.nodes.length === before + 1 && g2.nodes.some(x => x.id === 4 && x.type === 'toast');

      // restore the room's real graph
      L.graph = orig;
      out.restored = ED.logicGraph() === orig;
      return out;
    });

    console.log('LOGIC-TOOL:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['roadmap', 'hooks', 'layout', 'frame', 'duplicated', 'restored'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'LOGIC-TOOL TEST: PASS' : 'LOGIC-TOOL TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
