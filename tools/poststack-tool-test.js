// Post-FX & screen-feedback editor (roadmap #74): the global post knobs (grade cross-fade, ambient
// occlusion, impact chromatic-aberration + flash) externalised from post.js into src/poststack.js ->
// data/poststack.js, authored by the Post-FX editor (Edit ▸ Systems) with an animated impact preview.
// This test asserts the overlay loaded, the live reads are byte-identical to the old constants,
// applyData (retune / clamp) behaves, and the tool registers / opens / edits a working copy + applies +
// draws its animated preview — WITHOUT the real save() (which would clobber data/poststack.js).
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
      const out = {}, T = G.Tools, P = G.PostFX, MT = T.poststack;
      const saved = P.exportCurrent();
      const wait = ms => new Promise(r => setTimeout(r, ms));
      try {
        out.fromData = !!G.POSTFX_DATA && G.POSTFX_DATA.aberrMax === 2.5 && G.POSTFX_DATA.ssao === 0.6;
        out.hooks = !!(P.gradeRate && P.ssao && P.aberrMax && P.aberrDefault && P.aberrDecay && P.flashDefault && P.flashDecay && P.applyData && P.exportDefaults && P.exportCurrent);
        const DEF = { gradeRate: 3, ssao: 0.6, aberrMax: 2.5, aberrDefault: 0.6, aberrDecay: 6, flashDefault: 0.4, flashDecay: 5 };
        out.defaults = JSON.stringify(P.exportDefaults()) === JSON.stringify(DEF);
        out.curEqDefault = JSON.stringify(P.exportCurrent()) === JSON.stringify(P.exportDefaults());
        out.reads = P.gradeRate() === 3 && P.ssao() === 0.6 && P.aberrMax() === 2.5 && P.aberrDefault() === 0.6 && P.aberrDecay() === 6 && P.flashDefault() === 0.4 && P.flashDecay() === 5;
        // applyData: retune
        P.applyData({ aberrMax: 4, aberrDefault: 1, ssao: 0, gradeRate: 8 });
        out.applied = P.aberrMax() === 4 && P.aberrDefault() === 1 && P.ssao() === 0 && P.gradeRate() === 8 && P.flashDecay() === 5;
        // clamp: gradeRate floor, negatives floor to 0, flashDefault clamps to 0..1
        P.applyData({ gradeRate: 0, ssao: -2, aberrMax: -1, flashDefault: 3 });
        out.clamp = P.gradeRate() === 0.01 && P.ssao() === 0 && P.aberrMax() === 0 && P.flashDefault() === 1;
        P.applyData(null);
        out.reapply = P.aberrMax() === 2.5 && P.gradeRate() === 3;
        // tool
        out.registered = T._test.toolIds().indexOf('poststack') >= 0;
        out.inPalette = T._test.paletteSearch('screen feedback').some(l => /screen|feedback|post/i.test(l));
        out.roadmap = T.ROADMAP.some(g => g.items.some(i => i[0] === 74 && i[2] === 'done'));
        out.opened = T.openTool('poststack');
        MT.load();
        MT.setField('aberrMax', 5);
        MT.applyToEngine();
        out.toolApplied = P.aberrMax() === 5;
        out.dirty = MT.state.dirty === true;
        await wait(250);   // let the animated preview run + auto-punch
        const cv = document.querySelector('canvas[width="460"][height="240"]');
        out.previewCanvas = !!cv;
        if (cv) { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let nz = 0; for (let i = 0; i < d.length; i += 4) if (d[i] || d[i + 1] || d[i + 2]) { nz = 1; break; } out.previewDrawn = !!nz; }
        T.closeTool();
      } finally { P.applyData(saved); }
      out.restored = P.aberrMax() === 2.5 && P.ssao() === 0.6 && P.gradeRate() === 3;
      return out;
    });

    console.log('POSTSTACK:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['fromData', 'hooks', 'defaults', 'curEqDefault', 'reads', 'applied', 'clamp', 'reapply', 'registered', 'inPalette', 'roadmap', 'opened', 'toolApplied', 'dirty', 'previewCanvas', 'previewDrawn', 'restored'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'POSTSTACK TOOL TEST: PASS' : 'POSTSTACK TOOL TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
