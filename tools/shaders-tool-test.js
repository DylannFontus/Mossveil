// Shader graph editor (roadmap #78): node-based fullscreen screen-effect overlays. Each GRAPH is a DAG
// of typed nodes that compiles to GLSL (game) and evaluates on the CPU (preview/this test). Authored in
// src/shaders.js -> data/shaders.js (G.SHADERS_DATA) by the Shader-graph editor (Edit ▸ World). This
// asserts the overlay loaded + byte-identical defaults, applyData clamps/validates (globals, nodes,
// drops unknown types), and the tool registers/opens/edits a working graph (add/connect/disconnect/
// prop/remove nodes, add/remove/select/apply graphs, cycle guard) + compiles GLSL + draws its preview —
// WITHOUT the real save(). Engine restored in finally. Offline, no errors.
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
      const out = {}, T = G.Tools, SH = G.Shaders, MT = T.shaders;
      const saved = SH.exportCurrent();
      try {
        out.fromData = !!G.SHADERS_DATA && !!G.SHADERS_DATA.graphs && G.SHADERS_DATA.active === '' && !!G.SHADERS_DATA.graphs['dream-fog'];
        out.hooks = !!(SH.applyData && SH.exportDefaults && SH.exportCurrent && SH.glsl && SH.evalCPU && SH.nodeMeta && SH.cleanGraph && SH.cleanNode && SH.renderOverlay && SH.invalidate && SH.NODE_TYPES);
        out.defaults = JSON.stringify(SH.exportCurrent()) === JSON.stringify(SH.exportDefaults());
        out.curEqData = JSON.stringify(SH.exportCurrent()) === JSON.stringify(G.SHADERS_DATA);
        // clamp + validation
        SH.applyData({ enabled: false, active: 123, graphs: { g: { name: 7, blend: 'weird', opacity: 9, out: 'zz', nodes: { bad: { type: 'nope' }, rad: { type: 'radial', x: 5, y: -4, props: { cx: 9, cy: -9, scale: 999 }, ins: { junk: 'x' } } } } } });
        const c = SH.exportCurrent();
        out.clampGlobals = c.enabled === false && c.active === '';
        const cg = c.graphs.g;
        out.clampGraph = cg.name === 'Graph' && cg.blend === 'normal' && cg.opacity === 1 && cg.out === null;
        out.dropUnknown = !cg.nodes.bad && !!cg.nodes.rad;
        out.clampNode = cg.nodes.rad.props.scale === 8 && cg.nodes.rad.props.cx === 1 && cg.nodes.rad.x === 5 && JSON.stringify(cg.nodes.rad.ins) === '{}';
        // glsl + cpu of a real graph
        SH.applyData(null);
        const dg = SH.graph('dream-fog');
        const frag = SH.glsl(dg);
        out.glslValid = /gl_FragColor/.test(frag) && /void main/.test(frag) && frag.indexOf('_fbm') >= 0;
        let nz = false; for (let i = 0; i < 50 && !nz; i++) { const r = SH.evalCPU(dg, (i % 9) / 9, (i % 7) / 7, i * 0.11); if (r.a > 0) nz = true; }
        out.cpuNonZero = nz;
        out.nodeMeta = SH.nodeMeta().length >= 20;
        // ---- tool ----
        out.registered = T._test.toolIds().indexOf('shaders') >= 0;
        out.inPalette = T._test.paletteSearch('shader').some(l => /shader|graph|glsl|overlay/i.test(l));
        out.roadmap = T.ROADMAP.some(g => g.items.some(i => i[0] === 78 && i[2] === 'done'));
        out.opened = T.openTool('shaders');
        MT.load();
        out.loadWorks = !!MT.getWorking() && !!MT.state.gid;
        const g0 = MT.getWorking();
        const n0 = Object.keys(g0.nodes).length;
        const w = MT.addNode('wave');
        out.addNode = !!w && Object.keys(MT.getWorking().nodes).length === n0 + 1;
        MT.setNodeProp(w, 'freq', 33);
        out.setProp = MT.getWorking().nodes[w].props.freq === 33;
        // a clean, known topology for wiring: scanlines = wave w1 -> oneminus om -> mul am -> output out
        MT.selectGraph('scanlines');
        const cN = MT.addNode('const');
        out.connect = MT.connect(cN, 'out', 'alpha');                 // const -> output.alpha (valid)
        out.wired = MT.getWorking().nodes.out.ins.alpha === cN;
        out.cycleGuard = MT.connect('am', 'om', 'a') === false;       // om feeds am already -> would cycle -> rejected
        out.badPort = MT.connect(cN, 'om', 'zzz') === false;          // unknown port rejected
        MT.disconnect('out', 'alpha');
        out.disconnect = MT.getWorking().nodes.out.ins.alpha === null;
        const nC = Object.keys(MT.getWorking().nodes).length;
        MT.removeNode(cN);
        out.removeNode = Object.keys(MT.getWorking().nodes).length === nC - 1 && MT.getWorking().nodes.out.ins.alpha === null;
        // graphs
        const ng = Object.keys(MT.state.data.graphs).length;
        const gAdd = MT.addGraph();
        out.addGraph = Object.keys(MT.state.data.graphs).length === ng + 1;
        MT.setActive(gAdd);
        out.setActive = MT.state.data.active === gAdd;
        MT.applyToEngine();
        out.applied = SH.active() === gAdd && SH.enabled() === true;
        MT.setActive('');
        MT.removeGraph(gAdd);
        out.removeGraph = Object.keys(MT.state.data.graphs).length === ng && !MT.state.data.graphs[gAdd];
        // dom: glsl pre + preview canvas
        out.glslPre = Array.from(document.querySelectorAll('pre')).some(p => /gl_FragColor/.test(p.textContent));
        const cv = document.querySelector('canvas[width="320"][height="200"]');
        out.previewCanvas = !!cv;
        if (cv) { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let drew = 0; for (let i = 0; i < d.length; i += 4) if (d[i] || d[i + 1] || d[i + 2]) { drew = 1; break; } out.previewDrawn = !!drew; }
        T.closeTool();
      } finally { SH.applyData(saved); SH.invalidate(); }
      out.restored = JSON.stringify(SH.exportCurrent()) === JSON.stringify(saved);
      return out;
    });

    console.log('SHADERS:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['fromData', 'hooks', 'defaults', 'curEqData', 'clampGlobals', 'clampGraph', 'dropUnknown', 'clampNode', 'glslValid', 'cpuNonZero', 'nodeMeta', 'registered', 'inPalette', 'roadmap', 'opened', 'loadWorks', 'addNode', 'setProp', 'connect', 'wired', 'cycleGuard', 'badPort', 'disconnect', 'removeNode', 'addGraph', 'setActive', 'applied', 'removeGraph', 'glslPre', 'previewCanvas', 'previewDrawn', 'restored'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'SHADERS TOOL TEST: PASS' : 'SHADERS TOOL TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
