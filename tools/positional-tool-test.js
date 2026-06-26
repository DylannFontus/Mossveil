// Positional / 3D audio editor (roadmap #83): the spatialiser falloff/pan constants externalised from
// audio.js's spatial() into src/positional.js -> data/positional.js, authored by the Positional-audio
// editor (Edit ▸ Audio) with a falloff-curve + stereo-field preview. This test asserts the overlay
// loaded, the live maths are byte-identical to the old constants, applyData (retune / clamp) behaves,
// and the tool registers / opens / edits a working copy + applies + draws its preview — WITHOUT the real
// save() (which would clobber data/positional.js). Engine state restored at the end. Offline, no errors.
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
      const out = {}, T = G.Tools, P = G.Positional, MT = T.positional;
      const saved = P.exportCurrent();
      try {
        out.fromData = !!G.POSITIONAL_DATA && G.POSITIONAL_DATA.refDist === 9 && G.POSITIONAL_DATA.panWidth === 14;
        out.hooks = !!(P.gainFor && P.panFor && P.distOf && P.applyData && P.exportDefaults && P.exportCurrent);
        const DEF = { minGain: 0.04, refDist: 9, falloffPow: 2, panWidth: 14, yWeight: 0.5 };
        out.defaults = JSON.stringify(P.exportDefaults()) === JSON.stringify(DEF);
        out.curEqDefault = JSON.stringify(P.exportCurrent()) === JSON.stringify(P.exportDefaults());
        // byte-identical to the old spatial() formula across sample points
        const oldGain = (dx, dy) => Math.max(0.04, Math.min(1, 1 / (1 + Math.pow((Math.abs(dx) + Math.abs(dy) * 0.5) / 9, 2))));
        const oldPan = dx => Math.max(-1, Math.min(1, dx / 14));
        out.byteIdentical = [[3, 0], [9, 4], [20, 10], [-7, 2], [0, 0], [40, 0]].every(([dx, dy]) =>
          P.gainFor(P.distOf(dx, dy)) === oldGain(dx, dy) && P.panFor(dx) === oldPan(dx));
        out.reads = P.distOf(10, 4) === 12 && P.panFor(7) === 0.5 && P.get('refDist') === 9 && P.keys().length === 5;
        // applyData: retune
        P.applyData({ refDist: 18, panWidth: 28 });
        out.applied = P.get('refDist') === 18 && P.panFor(7) === 0.25 && P.get('yWeight') === 0.5;
        // clamp: divisors stay > 0, minGain in 0..1
        P.applyData({ refDist: 0, panWidth: 0, minGain: 5, falloffPow: 99 });
        out.clamp = P.get('refDist') === 0.5 && P.get('panWidth') === 1 && P.get('minGain') === 1 && P.get('falloffPow') === 6;
        P.applyData(null);
        out.reapply = P.get('refDist') === 9 && P.panFor(7) === 0.5;
        // tool
        out.registered = T._test.toolIds().indexOf('positional') >= 0;
        out.inPalette = T._test.paletteSearch('positional audio').some(l => /positional|audio/i.test(l));
        out.roadmap = T.ROADMAP.some(g => g.items.some(i => i[0] === 83 && i[2] === 'done'));
        out.opened = T.openTool('positional');
        MT.load();
        MT.setField('refDist', 20);
        MT.applyToEngine();
        out.toolApplied = P.get('refDist') === 20;
        out.dirty = MT.state.dirty === true;
        const cv = document.querySelector('canvas[width="460"][height="260"]');
        out.previewCanvas = !!cv;
        if (cv) { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let nz = 0; for (let i = 0; i < d.length; i += 4) if (d[i] || d[i + 1] || d[i + 2]) { nz = 1; break; } out.previewDrawn = !!nz; }
        T.closeTool();
      } finally { P.applyData(saved); }
      out.restored = P.get('refDist') === 9 && P.panFor(7) === 0.5;
      return out;
    });

    console.log('POSITIONAL:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['fromData', 'hooks', 'defaults', 'curEqDefault', 'byteIdentical', 'reads', 'applied', 'clamp', 'reapply', 'registered', 'inPalette', 'roadmap', 'opened', 'toolApplied', 'dirty', 'previewCanvas', 'previewDrawn', 'restored'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'POSITIONAL TOOL TEST: PASS' : 'POSITIONAL TOOL TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
