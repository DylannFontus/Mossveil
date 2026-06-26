// SFX randomization pools (roadmap #85): per-play pitch/gain wobble externalised into src/sfxvar.js ->
// data/sfxvar.js (G.SFXVAR_DATA), authored by the Randomization-pools editor (Edit ▸ Audio). This test
// asserts the overlay loaded, the variation maths are correct + INERT-by-default (varySpec returns the
// SAME spec untouched), applyData (retune / clamp) behaves, and the tool registers / opens / edits a
// working copy + applies + prunes zero pools + draws its preview — WITHOUT the real save(). Engine
// state restored at the end. Offline, no errors.
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
      const out = {}, T = G.Tools, V = G.SfxVar, MT = T.sfxvar;
      const saved = V.exportCurrent();
      try {
        out.fromData = !!G.SFXVAR_DATA && G.SFXVAR_DATA.default.pitch === 0 && JSON.stringify(G.SFXVAR_DATA.pools) === '{}';
        out.hooks = !!(V.applyData && V.exportDefaults && V.exportCurrent && V.varySpec && V.factors && V.entryFor && V.isInert && V.range && V.keys);
        const DEF = { default: { pitch: 0, gain: 0 }, pools: {} };
        out.defaults = JSON.stringify(V.exportDefaults()) === JSON.stringify(DEF);
        out.curEqDefault = JSON.stringify(V.exportCurrent()) === JSON.stringify(V.exportDefaults());
        // inert (default) -> varySpec returns the SAME array reference (byte-identical, no clone)
        V.applyData(null);
        const L = [{ f0: 100, f1: 200, vol: 0.2 }];
        out.inert = V.varySpec(L, 'hit') === L && V.isInert(V.entryFor('hit'));
        // a center draw (p=0) is always factor 1 regardless of range
        const fc = V.factors({ pitch: 8, gain: 0.5 }, () => 0.5);
        out.factorsCenter = fc.pitch === 1 && fc.gain === 1;
        // pitch wobble: +1 draw at ±12 st doubles f0/f1, leaves vol (gain range 0)
        V.applyData({ default: { pitch: 12, gain: 0 }, pools: {} });
        const rp = V.varySpec([{ f0: 100, f1: 200, vol: 0.2 }], 'x', () => 1);
        out.varyPitch = rp !== undefined && rp[0].f0 === 200 && rp[0].f1 === 400 && rp[0].vol === 0.2;
        // gain wobble: +1 draw at ±0.5 scales vol by 1.5, leaves pitch
        V.applyData({ default: { pitch: 0, gain: 0.5 }, pools: {} });
        const rg = V.varySpec([{ f0: 100, vol: 0.2 }], 'x', () => 1);
        out.varyGain = rg[0].vol === 0.2 * (1 + 1 * 0.5) && rg[0].f0 === 100;
        // clamp to safe ranges
        V.applyData({ default: { pitch: 99, gain: 5 }, pools: {} });
        out.clamp = V.exportCurrent().default.pitch === 12 && V.exportCurrent().default.gain === 0.9;
        // a per-sound pool overrides the global default
        V.applyData({ default: { pitch: 1, gain: 0 }, pools: { hit: { pitch: 5, gain: 0 } } });
        out.entryFor = V.entryFor('hit').pitch === 5 && V.entryFor('other').pitch === 1;
        V.applyData(null);
        out.reapply = V.entryFor('hit').pitch === 0 && V.isInert(V.entryFor('hit'));
        // ---- tool ----
        out.registered = T._test.toolIds().indexOf('sfxvar') >= 0;
        out.inPalette = T._test.paletteSearch('randomization').some(l => /random|pool|sfx/i.test(l));
        out.roadmap = T.ROADMAP.some(g => g.items.some(i => i[0] === 85 && i[2] === 'done'));
        out.opened = T.openTool('sfxvar');
        MT.load();
        const nm = Object.keys(G.Audio.sfxExportCurrent().sfx)[0];
        MT.select(nm);
        MT.setField('pitch', 5);
        MT.applyToEngine();
        out.toolSelect = V.entryFor(nm).pitch === 5;
        out.dirty = MT.state.dirty === true;
        // pruning: zeroing a pool drops it from the saved/applied overlay (stays honestly inert)
        MT.setField('pitch', 0); MT.setField('gain', 0);
        MT.applyToEngine();
        out.prune = V.exportCurrent().pools[nm] === undefined && V.isInert(V.entryFor(nm));
        const cv = document.querySelector('canvas[width="360"][height="170"]');
        out.previewCanvas = !!cv;
        if (cv) { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let nz = 0; for (let i = 0; i < d.length; i += 4) if (d[i] || d[i + 1] || d[i + 2]) { nz = 1; break; } out.previewDrawn = !!nz; }
        T.closeTool();
      } finally { V.applyData(saved); }
      out.restored = V.entryFor('hit').pitch === 0 && JSON.stringify(V.exportCurrent()) === JSON.stringify(saved);
      return out;
    });

    console.log('SFXVAR:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['fromData', 'hooks', 'defaults', 'curEqDefault', 'inert', 'factorsCenter', 'varyPitch', 'varyGain', 'clamp', 'entryFor', 'reapply', 'registered', 'inPalette', 'roadmap', 'opened', 'toolSelect', 'dirty', 'prune', 'previewCanvas', 'previewDrawn', 'restored'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'SFXVAR TOOL TEST: PASS' : 'SFXVAR TOOL TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
