// HUD layout & colours (roadmap #29): the soul-orb / masks / Glimmer-counter positions and colours
// externalised from src/ui.js drawHud() into src/hud.js -> data/hud.js, authored by the HUD editor
// (Edit ▸ Systems) with a live 1:1 preview. This test asserts the overlay loaded, defaults are
// byte-identical to the old constants, the live reads + validation behave, and the tool registers /
// opens / edits a working copy + applies to the engine and draws its preview canvas — WITHOUT calling
// the real save() (which would clobber data/hud.js). Engine state is restored at the end. Offline.
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
      const out = {}, T = G.Tools, H = G.HUD, MT = T.hud;
      const saved = H.exportCurrent();
      try {
        out.fromData = !!G.HUD_DATA && !!G.HUD_DATA.soul && G.HUD_DATA.soul.x === 64;
        out.hooks = !!(H.soul && H.masks && H.glimmer && H.applyData && H.exportDefaults && H.exportCurrent);
        const DEF = { soul: { x: 64, y: 64, r: 30, fillTop: '#eef8ff', fillBot: '#9fcfe0' }, masks: { x: 122, y: 52, spacing: 38, size: 13, color: '#e9e4d4' }, glimmer: { x: 38, y: 110, dotR: 6, textX: 52, textY: 111, dotColor: '#ffe28a', textColor: 'rgba(240,230,200,0.92)', fontSize: 16 } };
        out.defaults = JSON.stringify(H.exportDefaults()) === JSON.stringify(DEF);
        out.curEqDefault = JSON.stringify(H.exportCurrent()) === JSON.stringify(H.exportDefaults());
        // live reads reproduce the old ui.js constants
        out.soulRead = H.soul().x === 64 && H.soul().y === 64 && H.soul().r === 30 && H.soul().fillTop === '#eef8ff';
        out.maskRead = H.masks().x === 122 && H.masks().spacing === 38 && H.masks().size === 13 && H.masks().color === '#e9e4d4';
        out.glimRead = H.glimmer().x === 38 && H.glimmer().textY === 111 && H.glimmer().fontSize === 16;
        // validation / clamping
        H.applyData({ soul: { r: 1 }, masks: { size: 0 }, glimmer: { fontSize: 2 } });
        out.clamped = H.soul().r === 4 && H.masks().size === 2 && H.glimmer().fontSize === 6;
        H.applyData(null);
        out.reapply = H.soul().x === 64 && H.masks().size === 13;
        // tool
        out.registered = T._test.toolIds().indexOf('hud') >= 0;
        out.inPalette = T._test.paletteSearch('hud layout').some(l => /hud/i.test(l));
        out.roadmap = T.roadmapStats().done >= 47;
        out.opened = T.openTool('hud');
        MT.load();
        MT.set('soul', 'x', 90);
        MT.set('masks', 'spacing', 44);
        MT.set('glimmer', 'fontSize', 20);
        MT.applyToEngine();
        out.toolApplied = H.soul().x === 90 && H.masks().spacing === 44 && H.glimmer().fontSize === 20;
        out.dirty = MT.state.dirty === true;
        // the live preview canvas rendered something (non-blank)
        const cv = document.querySelector('canvas[width="400"][height="180"]');
        out.previewCanvas = !!cv;
        if (cv) { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let nonzero = 0; for (let i = 0; i < d.length; i += 4) if (d[i] || d[i + 1] || d[i + 2]) { nonzero = 1; break; } out.previewDrawn = !!nonzero; }
        T.closeTool();
      } finally { H.applyData(saved); }
      out.restored = H.soul().x === 64 && H.masks().spacing === 38 && H.glimmer().fontSize === 16;
      return out;
    });

    console.log('HUD:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['fromData', 'hooks', 'defaults', 'curEqDefault', 'soulRead', 'maskRead', 'glimRead', 'clamped', 'reapply', 'registered', 'inPalette', 'roadmap', 'opened', 'toolApplied', 'dirty', 'previewCanvas', 'previewDrawn', 'restored'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'HUD TEST: PASS' : 'HUD TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
