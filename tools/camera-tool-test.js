// Camera editor (roadmap #76): the gameplay camera feel (follow / look-ahead / vertical / impact punch)
// externalised from main.js updateCamera()/camPunch()/snapCamera() into src/camera.js -> data/camera.js,
// authored by the Camera editor (Edit ▸ Systems) with a live animated preview. This test asserts the
// overlay loaded, the live reads are byte-identical to the old constants, applyData (retune / clamp)
// behaves, and the tool registers / opens / edits a working copy + applies + draws its animated preview
// — WITHOUT the real save() (which would clobber data/camera.js). Engine state restored at the end.
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
      const out = {}, T = G.Tools, C = G.Cam, MT = T.camera;
      const saved = C.exportCurrent();
      const wait = ms => new Promise(r => setTimeout(r, ms));
      try {
        out.fromData = !!G.CAMERA_DATA && G.CAMERA_DATA.followX === 6.5 && G.CAMERA_DATA.punchMax === 3.2;
        out.hooks = !!(C.followX && C.lookAhead && C.lookVelMax && C.vBias && C.punchMax && C.punchEase && C.punchDefault && C.applyData && C.exportDefaults && C.exportCurrent);
        const DEF = { followX: 6.5, followY: 5.5, lookAhead: 2.1, lookVelFactor: 0.16, lookVelMax: 2.2, lookSpring: 3, vBias: 1.2, vVelFactor: 0.07, vClampDown: -1.4, vClampUp: 0.7, punchMax: 3.2, punchEase: 9, punchDefault: 0.8 };
        out.defaults = JSON.stringify(C.exportDefaults()) === JSON.stringify(DEF);
        out.curEqDefault = JSON.stringify(C.exportCurrent()) === JSON.stringify(C.exportDefaults());
        out.reads = C.followX() === 6.5 && C.lookAhead() === 2.1 && C.lookVelMax() === 2.2 && C.vBias() === 1.2 && C.punchMax() === 3.2 && C.punchEase() === 9 && C.punchDefault() === 0.8;
        // applyData: retune
        C.applyData({ followX: 10, lookAhead: 0, punchMax: 5 });
        out.applied = C.followX() === 10 && C.lookAhead() === 0 && C.punchMax() === 5 && C.followY() === 5.5;
        // clamp: stiffness floors, punchEase floor
        C.applyData({ followX: -5, followY: 0, lookSpring: 0, punchEase: 0 });
        out.clamp = C.followX() === 0.1 && C.followY() === 0.1 && C.lookSpring() === 0.1 && C.punchEase() === 0.001;
        C.applyData(null);
        out.reapply = C.followX() === 6.5 && C.punchMax() === 3.2;
        // tool
        out.registered = T._test.toolIds().indexOf('camera') >= 0;
        out.inPalette = T._test.paletteSearch('camera feel').some(l => /camera/i.test(l));
        out.roadmap = T.ROADMAP.some(g => g.items.some(i => i[0] === 76 && i[2] === 'done'));
        out.opened = T.openTool('camera');
        MT.load();
        MT.setField('followX', 9);
        MT.applyToEngine();
        out.toolApplied = C.followX() === 9;
        out.dirty = MT.state.dirty === true;
        await wait(250);   // let the animated preview run a few frames
        const cv = document.querySelector('canvas[width="460"][height="240"]');
        out.previewCanvas = !!cv;
        if (cv) { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let nz = 0; for (let i = 0; i < d.length; i += 4) if (d[i] || d[i + 1] || d[i + 2]) { nz = 1; break; } out.previewDrawn = !!nz; }
        T.closeTool();
      } finally { C.applyData(saved); }
      out.restored = C.followX() === 6.5 && C.punchMax() === 3.2 && C.vBias() === 1.2;
      return out;
    });

    console.log('CAMERA:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['fromData', 'hooks', 'defaults', 'curEqDefault', 'reads', 'applied', 'clamp', 'reapply', 'registered', 'inPalette', 'roadmap', 'opened', 'toolApplied', 'dirty', 'previewCanvas', 'previewDrawn', 'restored'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'CAMERA TOOL TEST: PASS' : 'CAMERA TOOL TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
