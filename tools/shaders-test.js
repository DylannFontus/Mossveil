// Shader graph — GAME-SIDE seam test (roadmap #78). The authored node graphs (src/shaders.js) compile
// to a GLSL fragment shader and draw as a transparent FULLSCREEN overlay composited after the post pass
// (one guarded G.Shaders.renderOverlay(dt) line in main.js). This boots the REAL game and proves in the
// live renderer: (1) the module is wired and inactive by default (active '' => nothing built, frame
// unchanged), (2) renderOverlay is a safe no-op while inactive, (3) EVERY default graph actually
// COMPILES & renders in real WebGL — a shader compile failure logs a console error, which fails this
// test — and builds a material, (4) a disabled overlay does nothing. Restored in finally.
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
    const game = await browser.newPage();
    await game.setViewport({ width: 1100, height: 680 });
    game.on('pageerror', e => errs.push('[game] ' + e.message));
    game.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });
    await game.setRequestInterception(true);
    game.on('request', r => { const u = r.url(); if (/^https?:\/\//.test(u) && !u.includes('localhost') && !u.includes('127.0.0.1')) { netHits++; r.abort(); } else r.continue(); });
    await game.goto('http://localhost:7707/index.html?level=gloom&spawn=1', { waitUntil: 'load' });
    await wait(2300);

    const o = await game.evaluate(() => {
      const out = {}, S = G.Shaders;
      out.hasModule = !!(S && S.renderOverlay && S.glsl && S.evalCPU && S.applyData && S._built);
      const saved = S.exportCurrent();
      let threw = false;
      try {
        // (1) inactive by default
        out.startInactive = S.active() === '' && S._built() === null;
        // (2) renderOverlay is a safe no-op while inactive
        S.renderOverlay(0.1); S.renderOverlay(0.1);
        out.noneNoOp = S._built() === null;
        // (3) every default graph compiles & renders in real WebGL (compile error => console error => fail)
        const ids = Object.keys(saved.graphs);
        out.haveGraphs = ids.length >= 3;
        let allBuilt = true;
        for (const id of ids) {
          const cur = S.exportCurrent(); cur.enabled = true; cur.active = id; S.applyData(cur);
          S.renderOverlay(0.016); S.renderOverlay(0.05);
          const b = S._built();
          if (!b || b.id !== id || !b.mat || b.failed) { allBuilt = false; out._failGraph = id; }
        }
        out.compileEach = allBuilt;
        // (4) a disabled overlay does nothing
        const cur = S.exportCurrent(); cur.enabled = false; cur.active = ids[0]; S.applyData(cur);
        S.renderOverlay(0.05);
        out.disabledNoOp = S._built() === null;
      } catch (e) { threw = true; out._err = e.message; }
      out.noThrow = !threw;
      S.applyData(saved); S.invalidate();
      out.restored = JSON.stringify(S.exportCurrent()) === JSON.stringify(saved) && S.active() === '' && S._built() === null;
      return out;
    });

    console.log('RESULT:', JSON.stringify(o));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['hasModule', 'startInactive', 'noneNoOp', 'haveGraphs', 'compileEach', 'disabledNoOp', 'noThrow', 'restored'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'SHADERS GAME TEST: PASS' : 'SHADERS GAME TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
