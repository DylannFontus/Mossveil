// Water & reflections editor (roadmap #75): the reflective-water surface look externalised from
// post.js (the `water` object) and world.js (the `?? 0.55` fade fallback) into src/water.js ->
// data/water.js, authored by the Water editor (Edit ▸ Systems) with an animated reflection preview.
// This test asserts the overlay loaded, the live reads are byte-identical to the old constants (incl.
// the exact {r,g,b} colour), applyData (retune / clamp) behaves, and the tool registers / opens /
// edits a working copy + applies + draws its animated preview — WITHOUT the real save().
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
      const out = {}, T = G.Tools, WX = G.WaterFX, MT = T.water;
      const saved = WX.exportCurrent();
      const wait = ms => new Promise(r => setTimeout(r, ms));
      try {
        out.fromData = !!G.WATER_DATA && G.WATER_DATA.strength === 0.55 && !!G.WATER_DATA.color;
        out.hooks = !!(WX.strength && WX.ripple && WX.fade && WX.caustics && WX.colorRGB && WX.colorHex && WX.applyData && WX.exportDefaults && WX.exportCurrent);
        const DEF = { strength: 0.55, ripple: 1, fade: 1.6, caustics: 0.5, color: { r: 0.62, g: 0.78, b: 0.95 } };
        out.defaults = JSON.stringify(WX.exportDefaults()) === JSON.stringify(DEF);
        out.curEqDefault = JSON.stringify(WX.exportCurrent()) === JSON.stringify(WX.exportDefaults());
        out.reads = WX.strength() === 0.55 && WX.ripple() === 1 && WX.fade() === 1.6 && WX.caustics() === 0.5 && WX.colorRGB().r === 0.62 && WX.colorHex() === '#9ec7f2';
        // applyData: retune
        WX.applyData({ strength: 0.8, ripple: 2, color: { r: 1, g: 0, b: 0.5 } });
        out.applied = WX.strength() === 0.8 && WX.ripple() === 2 && WX.colorRGB().r === 1 && WX.fade() === 1.6;
        // clamp: negatives floor to 0, colour clamps to 0..1
        WX.applyData({ strength: -1, ripple: -2, color: { r: 2, g: -1, b: 0.5 } });
        out.clamp = WX.strength() === 0 && WX.ripple() === 0 && WX.colorRGB().r === 1 && WX.colorRGB().g === 0;
        WX.applyData(null);
        out.reapply = WX.strength() === 0.55 && WX.colorRGB().b === 0.95;
        // tool
        out.registered = T._test.toolIds().indexOf('water') >= 0;
        out.inPalette = T._test.paletteSearch('water reflections').some(l => /water|reflect/i.test(l));
        out.roadmap = T.ROADMAP.some(g => g.items.some(i => i[0] === 75 && i[2] === 'done'));
        out.opened = T.openTool('water');
        MT.load();
        MT.setField('strength', 0.9);
        MT.setColor('#102030');
        MT.applyToEngine();
        out.toolApplied = WX.strength() === 0.9 && Math.abs(WX.colorRGB().r - 16 / 255) < 1e-6;
        out.dirty = MT.state.dirty === true;
        await wait(250);   // let the animated preview run
        const cv = document.querySelector('canvas[width="460"][height="260"]');
        out.previewCanvas = !!cv;
        if (cv) { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let nz = 0; for (let i = 0; i < d.length; i += 4) if (d[i] || d[i + 1] || d[i + 2]) { nz = 1; break; } out.previewDrawn = !!nz; }
        T.closeTool();
      } finally { WX.applyData(saved); }
      out.restored = WX.strength() === 0.55 && WX.colorRGB().r === 0.62 && WX.fade() === 1.6;
      return out;
    });

    console.log('WATER:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['fromData', 'hooks', 'defaults', 'curEqDefault', 'reads', 'applied', 'clamp', 'reapply', 'registered', 'inPalette', 'roadmap', 'opened', 'toolApplied', 'dirty', 'previewCanvas', 'previewDrawn', 'restored'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'WATER TOOL TEST: PASS' : 'WATER TOOL TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
