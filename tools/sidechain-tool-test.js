// Music ducking / sidechain (roadmap #84): per-sound music ducking externalised into src/sidechain.js ->
// data/sidechain.js (G.SIDECHAIN_DATA), authored by the Ducking editor (Edit ▸ Audio). This test asserts
// the overlay loaded, the duck maths are correct + INERT-by-default (no sound ducks, envelope() is null),
// applyData clamps + prunes 0-strength sounds, and the tool registers / opens / edits a working copy +
// applies + prunes + draws its preview — WITHOUT the real save(). It also splices the live duck node and
// confirms a real trigger schedules the dip. Engine state restored at the end. Offline, no errors.
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
      const out = {}, T = G.Tools, S = G.Sidechain, MT = T.sidechain, A = G.Audio;
      const saved = S.exportCurrent();
      try {
        out.fromData = !!G.SIDECHAIN_DATA && G.SIDECHAIN_DATA.depth === 0 && JSON.stringify(G.SIDECHAIN_DATA.triggers) === '{}';
        out.hooks = !!(S.applyData && S.exportDefaults && S.exportCurrent && S.isInert && S.strengthFor && S.envelope && S.trigger && S.attach && S.range && S.keys);
        const DEF = { depth: 0, attack: 0.06, hold: 0, release: 0.4, triggers: {} };
        out.defaults = JSON.stringify(S.exportDefaults()) === JSON.stringify(DEF);
        out.curEqDefault = JSON.stringify(S.exportCurrent()) === JSON.stringify(S.exportDefaults());
        // inert default -> nothing ducks; envelope is null
        S.applyData(null);
        out.inert = S.isInert() && S.strengthFor('hit') === 0 && S.envelope('hit') === null;
        // strength = depth × per-sound; only listed sounds duck
        S.applyData({ depth: 0.5, attack: 0.05, hold: 0.1, release: 0.3, triggers: { hit: 1, clink: 0.5 } });
        out.strength = S.strengthFor('hit') === 0.5 && S.strengthFor('clink') === 0.25 && S.strengthFor('other') === 0;
        // envelope maths: lo = 1 - strength; envelope carries the shared timings
        const e = S.envelope('hit', 0);
        out.envelope = e && e.lo === 0.5 && e.attack === 0.05 && e.hold === 0.1 && e.release === 0.3 && e.strength === 0.5;
        // clamp to safe ranges + per-sound strength clamps to 0..1
        S.applyData({ depth: 9, attack: 99, hold: -5, release: 0.0001, triggers: { hit: 5 } });
        const c = S.exportCurrent();
        out.clamp = c.depth === 0.9 && c.attack === 0.5 && c.hold === 0 && c.release === 0.02 && c.triggers.hit === 1;
        // prune: a 0-strength sound never enters the overlay
        S.applyData({ depth: 0.5, triggers: { hit: 0, clink: 0.3 } });
        out.prune = S.exportCurrent().triggers.hit === undefined && S.exportCurrent().triggers.clink === 0.3;
        // inert when depth 0 OR no triggers
        S.applyData({ depth: 0, triggers: { hit: 1 } }); out.inertZeroDepth = S.isInert();
        S.applyData({ depth: 0.5, triggers: {} }); out.inertNoTriggers = S.isInert();
        S.applyData(null); out.reapply = S.isInert() && S.strengthFor('hit') === 0;
        // ---- tool ----
        out.registered = T._test.toolIds().indexOf('sidechain') >= 0;
        out.inPalette = T._test.paletteSearch('duck').some(l => /duck|sidechain|music/i.test(l));
        out.roadmap = T.ROADMAP.some(g => g.items.some(i => i[0] === 84 && i[2] === 'done'));
        out.opened = T.openTool('sidechain');
        MT.load();
        const nm = Object.keys(A.sfxExportCurrent().sfx)[0];
        MT.setEnv('depth', 0.5);
        MT.setTrigger(nm, 1);
        MT.applyToEngine();
        out.toolEdit = S.strengthFor(nm) === 0.5 && MT.state.dirty === true;
        // pruning through the tool: zeroing a sound drops it from the applied overlay
        MT.setTrigger(nm, 0); MT.applyToEngine();
        out.toolPrune = S.exportCurrent().triggers[nm] === undefined && S.isInert();
        // live splice: with a real duck authored, the duck node attaches and a trigger returns its envelope
        MT.setEnv('depth', 0.5); MT.setTrigger(nm, 1); MT.applyToEngine();
        if (A.init) { try { A.init(); } catch (_) { } }
        const node = A._duckInsert();
        out.spliced = !!node && S.attached() && A._duckNode() === node;
        const env = S.trigger(nm);
        out.triggerApplies = !!env && Math.abs(env.lo - 0.5) < 1e-9;
        const cv = document.querySelector('canvas[width="360"][height="150"]');
        out.previewCanvas = !!cv;
        if (cv) { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let nz = 0; for (let i = 0; i < d.length; i += 4) if (d[i] || d[i + 1] || d[i + 2]) { nz = 1; break; } out.previewDrawn = !!nz; }
        T.closeTool();
      } finally { S.applyData(saved); }
      out.restored = S.isInert() && JSON.stringify(S.exportCurrent()) === JSON.stringify(saved);
      return out;
    });

    console.log('SIDECHAIN:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['fromData', 'hooks', 'defaults', 'curEqDefault', 'inert', 'strength', 'envelope', 'clamp', 'prune', 'inertZeroDepth', 'inertNoTriggers', 'reapply', 'registered', 'inPalette', 'roadmap', 'opened', 'toolEdit', 'toolPrune', 'spliced', 'triggerApplies', 'previewCanvas', 'previewDrawn', 'restored'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'SIDECHAIN TOOL TEST: PASS' : 'SIDECHAIN TOOL TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
