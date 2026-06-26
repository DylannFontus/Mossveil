// Music transitions editor (roadmap #82): the soundtrack crossfade timings externalised from music.js
// into src/musicfx.js -> data/musicfx.js, authored by the Music-transition editor (Edit ▸ Systems) with
// a fade-envelope timeline preview. This test asserts the overlay loaded, the live reads are
// byte-identical to the old constants, applyData (retune / clamp) behaves, and the tool registers /
// opens / edits a working copy + applies + draws its preview — WITHOUT the real save() (which would
// clobber data/musicfx.js). Engine state restored at the end. Offline, no errors.
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
      const out = {}, T = G.Tools, MX = G.MusicFX, MT = T.musicfx;
      const saved = MX.exportCurrent();
      try {
        out.fromData = !!G.MUSICFX_DATA && G.MUSICFX_DATA.trackSwapOut === 0.32 && G.MUSICFX_DATA.bossSilence === 0.85;
        out.hooks = !!(MX.dur && MX.keys && MX.applyData && MX.exportDefaults && MX.exportCurrent);
        const DEF = { trackSwapOut: 0.32, trackSwapIn: 0.28, bossStopFade: 0.16, bossSilence: 0.85, bossInFade: 0.18, bossOutFade: 0.3, biomeReturnFade: 0.9, resumeFade: 0.3, pauseFastFade: 0.18 };
        out.defaults = JSON.stringify(MX.exportDefaults()) === JSON.stringify(DEF);
        out.curEqDefault = JSON.stringify(MX.exportCurrent()) === JSON.stringify(MX.exportDefaults());
        out.reads = MX.dur('trackSwapOut') === 0.32 && MX.dur('bossSilence') === 0.85 && MX.dur('biomeReturnFade') === 0.9 && MX.keys().length === 9;
        // applyData: retune
        MX.applyData({ trackSwapOut: 1.2, bossSilence: 2 });
        out.applied = MX.dur('trackSwapOut') === 1.2 && MX.dur('bossSilence') === 2 && MX.dur('trackSwapIn') === 0.28;
        // clamp: fade durations floor at 0.02, bossSilence may be 0
        MX.applyData({ trackSwapOut: 0, bossSilence: -1, resumeFade: -5 });
        out.clamp = MX.dur('trackSwapOut') === 0.02 && MX.dur('bossSilence') === 0 && MX.dur('resumeFade') === 0.02;
        MX.applyData(null);
        out.reapply = MX.dur('trackSwapOut') === 0.32 && MX.dur('bossSilence') === 0.85;
        // tool
        out.registered = T._test.toolIds().indexOf('musicfx') >= 0;
        out.inPalette = T._test.paletteSearch('music transitions').some(l => /music|transition/i.test(l));
        out.roadmap = T.ROADMAP.some(g => g.items.some(i => i[0] === 82 && i[2] === 'done'));
        out.opened = T.openTool('musicfx');
        MT.load();
        MT.setField('trackSwapOut', 0.5);
        MT.applyToEngine();
        out.toolApplied = MX.dur('trackSwapOut') === 0.5;
        out.dirty = MT.state.dirty === true;
        const cv = document.querySelector('canvas[width="460"][height="240"]');
        out.previewCanvas = !!cv;
        if (cv) { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let nz = 0; for (let i = 0; i < d.length; i += 4) if (d[i] || d[i + 1] || d[i + 2]) { nz = 1; break; } out.previewDrawn = !!nz; }
        T.closeTool();
      } finally { MX.applyData(saved); }
      out.restored = MX.dur('trackSwapOut') === 0.32 && MX.dur('biomeReturnFade') === 0.9;
      return out;
    });

    console.log('MUSICFX:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['fromData', 'hooks', 'defaults', 'curEqDefault', 'reads', 'applied', 'clamp', 'reapply', 'registered', 'inPalette', 'roadmap', 'opened', 'toolApplied', 'dirty', 'previewCanvas', 'previewDrawn', 'restored'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'MUSICFX TOOL TEST: PASS' : 'MUSICFX TOOL TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
