// Parallax & backdrop (roadmap #73): the room backdrop — sky/wall plane depths + the receding
// silhouette LAYERS (depth/density/size each) + the per-depth silhouette shaping — externalised from
// world.js into src/parallax.js -> data/parallax.js (G.PARALLAX_DATA), authored by the Parallax editor
// (Edit ▸ World). This asserts the overlay loaded + byte-identical defaults, applyData clamps/validates
// (planes, per-layer, layer cap, shape), and the tool registers/opens/edits a working copy (fields +
// shape + add/remove/reorder layers) + applies + draws its preview — WITHOUT the real save(). Engine
// restored in finally. Offline, no errors.
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
      const out = {}, T = G.Tools, P = G.Parallax, MT = T.parallax;
      const saved = P.exportCurrent();
      try {
        out.fromData = !!G.PARALLAX_DATA && G.PARALLAX_DATA.sky === -80 && Array.isArray(G.PARALLAX_DATA.layers) && G.PARALLAX_DATA.layers.length === 3;
        out.hooks = !!(P.applyData && P.exportDefaults && P.exportCurrent && P.layers && P.shape && P.skyZ && P.wallZ);
        out.defaults = JSON.stringify(P.exportCurrent()) === JSON.stringify(P.exportDefaults());
        out.curEqData = JSON.stringify(P.exportCurrent()) === JSON.stringify(G.PARALLAX_DATA);
        // clamp + per-layer + shape validation
        P.applyData({ sky: 9, wall: -9999, layers: [{ z: 5, density: 99, scale: -1 }], shape: { hangGapMin: 50, hangGapMax: 1, marginPer: -3, hangChance: 5 } });
        const c = P.exportCurrent();
        out.clampPlanes = c.sky === -1 && c.wall === -400;
        out.clampLayer = c.layers[0].z === -0.5 && c.layers[0].density === 6 && c.layers[0].scale === 0.05;
        out.clampShape = c.shape.hangGapMax >= c.shape.hangGapMin && c.shape.marginPer >= 0 && c.shape.hangChance === 1;
        // layer count cap
        P.applyData({ layers: new Array(30).fill(0).map((_, i) => ({ z: -i - 1 })) });
        out.layerCap = P.exportCurrent().layers.length === 12;
        P.applyData(null);
        // ---- tool ----
        out.registered = T._test.toolIds().indexOf('parallax') >= 0;
        out.inPalette = T._test.paletteSearch('parallax').some(l => /parallax|backdrop|silhouette|layer/i.test(l));
        out.roadmap = T.ROADMAP.some(g => g.items.some(i => i[0] === 73 && i[2] === 'done'));
        out.opened = T.openTool('parallax');
        MT.load();
        MT.setField('sky', -120); MT.setShape('humpBase', 5);
        out.toolEdit = MT.getWorking().sky === -120 && MT.getWorking().shape.humpBase === 5 && MT.state.dirty === true;
        // layer ops: add / set / reorder / remove
        const n0 = MT.getWorking().layers.length;
        MT.addLayer(); out.added = MT.getWorking().layers.length === n0 + 1;
        MT.setLayer(0, 'z', -44); out.setLayer = MT.getWorking().layers[0].z === -44;
        const z0 = MT.getWorking().layers[0].z, z1 = MT.getWorking().layers[1].z;
        MT.moveLayer(0, 1); out.moved = MT.getWorking().layers[0].z === z1 && MT.getWorking().layers[1].z === z0;
        MT.removeLayer(0); out.removed = MT.getWorking().layers.length === n0;
        MT.applyToEngine();
        out.applied = P.exportCurrent().sky === -120;
        // preview canvas (parallax uses a unique 470x240)
        const cv = document.querySelector('canvas[width="470"][height="240"]');
        out.previewCanvas = !!cv;
        if (cv) { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let nz = 0; for (let i = 0; i < d.length; i += 4) if (d[i] || d[i + 1] || d[i + 2]) { nz = 1; break; } out.previewDrawn = !!nz; }
        T.closeTool();
      } finally { P.applyData(saved); }
      out.restored = JSON.stringify(P.exportCurrent()) === JSON.stringify(saved);
      return out;
    });

    console.log('PARALLAX:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['fromData', 'hooks', 'defaults', 'curEqData', 'clampPlanes', 'clampLayer', 'clampShape', 'layerCap', 'registered', 'inPalette', 'roadmap', 'opened', 'toolEdit', 'added', 'setLayer', 'moved', 'removed', 'applied', 'previewCanvas', 'previewDrawn', 'restored'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'PARALLAX TOOL TEST: PASS' : 'PARALLAX TOOL TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
