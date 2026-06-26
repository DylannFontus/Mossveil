// Decals & marks (roadmap #72): persistent ground marks — a KIND LIBRARY (procedural texture +
// colour + size/jitter + opacity + lifetime + fade + rotation + blend) plus EVENT BINDINGS (which
// game event leaves which mark) — a NET-NEW render feature in src/decals.js -> data/decals.js
// (G.DECALS_DATA), authored by the Decals editor (Edit ▸ World). This asserts the overlay loaded +
// byte-identical defaults, applyData clamps/validates (globals, kinds, events), and the tool
// registers/opens/edits a working copy (globals + kinds + events + add/remove/select) + applies +
// draws its preview — WITHOUT the real save(). Engine restored in finally. Offline, no errors.
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
      const out = {}, T = G.Tools, D = G.Decals, MT = T.decals;
      const saved = D.exportCurrent();
      try {
        out.fromData = !!G.DECALS_DATA && G.DECALS_DATA.cap === 60 && !!G.DECALS_DATA.kinds.scorch && G.DECALS_DATA.events.enemyDeath === 'scorch';
        out.hooks = !!(D.applyData && D.exportDefaults && D.exportCurrent && D.spawn && D.emit && D.update && D.clear && D.kinds && D.events && D.TEXES && D.ROTS && D.cleanKind);
        out.defaults = JSON.stringify(D.exportCurrent()) === JSON.stringify(D.exportDefaults());
        out.curEqData = JSON.stringify(D.exportCurrent()) === JSON.stringify(G.DECALS_DATA);
        // clamp + validation
        D.applyData({ enabled: false, cap: 9999, scale: -5, kinds: { z: { tex: 'nope', color: 'x', size: 999, sizeVar: -3, alpha: 5, life: 0.001, fadeIn: -1, fadeOut: 99, rot: 'spin', blend: 'weird', yOff: 50 } }, events: { enemyDeath: 'z', bossDeath: 123 } });
        const c = D.exportCurrent();
        out.clampGlobals = c.enabled === false && c.cap === 400 && c.scale === 0.1;
        const k = c.kinds.z;
        out.clampKind = k.tex === 'stain' && k.size === 12 && k.sizeVar === 0 && k.alpha === 1 && k.life === 0.2 && k.fadeIn === 0 && k.fadeOut === 60 && k.rot === 'random' && k.blend === 'normal' && k.yOff === 4;
        out.eventClean = c.events.bossDeath === '';
        D.applyData(null);
        // ---- tool ----
        out.registered = T._test.toolIds().indexOf('decals') >= 0;
        out.inPalette = T._test.paletteSearch('decal').some(l => /decal|mark|scorch|splat/i.test(l));
        out.roadmap = T.ROADMAP.some(g => g.items.some(i => i[0] === 72 && i[2] === 'done'));
        out.opened = T.openTool('decals');
        MT.load();
        MT.setGlobal('cap', 120); MT.setKind('scorch', 'size', 2.5);
        out.toolEdit = MT.getWorking().cap === 120 && MT.getWorking().kinds.scorch.size === 2.5 && MT.state.dirty === true;
        const nk0 = Object.keys(MT.getWorking().kinds).length;
        MT.addKind(); out.addedKind = Object.keys(MT.getWorking().kinds).length === nk0 + 1;
        const newId = Object.keys(MT.getWorking().kinds).find(id => !D.exportDefaults().kinds[id]);
        MT.setEvent('playerLand', 'splat'); out.setEvent = MT.getWorking().events.playerLand === 'splat';
        MT.select('ash'); out.selected = true;   // drives the preview; just must not throw
        MT.removeKind(newId); out.removedKind = Object.keys(MT.getWorking().kinds).length === nk0;
        // removing a kind clears events that referenced it
        MT.setEvent('bossDeath', 'scorch'); MT.removeKind('scorch'); out.removeUnbinds = MT.getWorking().events.bossDeath === '';
        MT.load();   // reload a clean working copy after the destructive checks
        MT.setGlobal('cap', 99); MT.applyToEngine();
        out.applied = D.exportCurrent().cap === 99;
        const cv = document.querySelector('canvas[width="380"][height="220"]');
        out.previewCanvas = !!cv;
        if (cv) { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let nz = 0; for (let i = 0; i < d.length; i += 4) if (d[i] || d[i + 1] || d[i + 2]) { nz = 1; break; } out.previewDrawn = !!nz; }
        T.closeTool();
      } finally { D.applyData(saved); }
      out.restored = JSON.stringify(D.exportCurrent()) === JSON.stringify(saved);
      return out;
    });

    console.log('DECALS:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['fromData', 'hooks', 'defaults', 'curEqData', 'clampGlobals', 'clampKind', 'eventClean', 'registered', 'inPalette', 'roadmap', 'opened', 'toolEdit', 'addedKind', 'setEvent', 'selected', 'removedKind', 'removeUnbinds', 'applied', 'previewCanvas', 'previewDrawn', 'restored'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'DECALS TOOL TEST: PASS' : 'DECALS TOOL TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
