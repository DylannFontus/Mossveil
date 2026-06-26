// Synth preset library (roadmap #80): a reusable palette of synth "voice" presets (each one playable
// audio.js layer) externalised into src/synth.js -> data/synth.js (G.SYNTH_DATA), authored by the Synth
// editor (Edit ▸ Audio). EDITOR-SIDE only — the game never reads G.Synth, so nothing about how the game
// sounds changes; "Send to SFX" feeds the existing data/sfx.js pipeline. This test asserts the library
// loaded + byte-identical defaults, cleanLayer validation, and that the tool registers / opens / edits a
// working copy (field/kind/type) + new/dup/rename/delete + audition + COMPOSE-send-to-sfx + capture +
// draws its envelope — WITHOUT the real save() (never clobbers data/synth.js OR data/sfx.js). Restores
// engine in finally. Offline, no errors.
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
      const out = {}, T = G.Tools, A = G.Audio, S = G.Synth, MT = T.synth;
      const saved = S.exportCurrent();
      try {
        out.fromData = !!G.SYNTH_DATA && !!G.SYNTH_DATA.presets && Object.keys(G.SYNTH_DATA.presets).length >= 8;
        out.hooks = !!(S.applyData && S.exportDefaults && S.exportCurrent && S.list && S.names && S.get && S.cleanLayer && S.kinds && S.waveTypes && S.ftypes);
        // defaults byte-identical: data overlay == built-in starter library
        out.defaults = JSON.stringify(S.exportCurrent()) === JSON.stringify(S.exportDefaults());
        out.curEqData = JSON.stringify(S.exportCurrent().presets) === JSON.stringify(G.SYNTH_DATA.presets);
        // a known preset has the expected layer shape
        const sub = S.get('sub-boom');
        out.presetShape = sub && sub.kind === 'tone' && sub.type === 'sine' && sub.f0 === 80 && sub.f1 === 35;
        // cleanLayer coerces a corrupt layer but keeps a clean one identical
        const cl = S.cleanLayer({ kind: 'bogus', f0: 'x', vol: 9, dur: 999, junk: 1 });
        out.clean = cl.kind === 'tone' && cl.f0 === 440 && cl.vol === 1 && cl.junk === 1;
        out.cleanIdentity = JSON.stringify(S.cleanLayer(sub)) === JSON.stringify(sub);
        // applyData replaces (a deleted preset stays gone) but never empties
        S.applyData({ presets: { only: { kind: 'bell', f0: 300, vol: 0.1, dur: 0.5 } } });
        out.replace = S.names().length === 1 && S.names()[0] === 'only';
        S.applyData({ presets: {} }); out.neverEmpty = S.names().length >= 8;     // falls back to defaults
        S.applyData(null);
        // ---- tool ----
        out.registered = T._test.toolIds().indexOf('synth') >= 0;
        out.inPalette = T._test.paletteSearch('synth').some(l => /synth|voice|preset/i.test(l));
        out.roadmap = T.ROADMAP.some(g => g.items.some(i => i[0] === 80 && i[2] === 'done'));
        out.opened = T.openTool('synth');
        MT.load();
        const n0 = MT.names().length;
        // edit a field + waveform + kind on the working copy
        MT.select('sub-boom'); MT.setField('vol', 0.5); MT.setType('square');
        out.toolEdit = MT.getWorking().presets['sub-boom'].vol === 0.5 && MT.getWorking().presets['sub-boom'].type === 'square' && MT.state.dirty === true;
        MT.setKind('bell');
        out.toolKind = MT.getWorking().presets['sub-boom'].kind === 'bell' && MT.getWorking().presets['sub-boom'].dur != null;
        // new / duplicate / rename / delete
        const nn = MT.newPreset('test-voice'); out.toolNew = MT.names().indexOf('test-voice') >= 0 && MT.state.sel === 'test-voice';
        const dn = MT.duplicate('test-voice'); out.toolDup = dn === 'test-voice-copy' && !!MT.getWorking().presets[dn];
        out.toolRename = MT.rename(dn, 'renamed-voice') && !!MT.getWorking().presets['renamed-voice'] && !MT.getWorking().presets[dn];
        out.toolDelete = MT.remove('renamed-voice') && !MT.getWorking().presets['renamed-voice'];
        // collision rename rejected
        out.renameGuard = MT.rename('test-voice', 'sub-boom') === false;
        // audition must not throw
        let threw = false; try { if (A.init) A.init(); MT.audition('test-voice'); MT.audition(); } catch (e) { threw = true; } out.noThrow = !threw;
        // COMPOSE send-to-sfx (pure — does NOT save data/sfx.js): the chosen sound gains one extra layer
        const sfx0 = A.sfxExportCurrent(); const target = Object.keys(sfx0.sfx)[0];
        const before = sfx0.sfx[target].length;
        const composed = MT.composeSfx(target, 'test-voice');
        out.compose = !!composed && composed.sfx[target].length === before + 1 && composed.sfx[target][before].kind != null
          && A.sfxExportCurrent().sfx[target].length === before;       // engine untouched (not saved)
        // capture a real SFX layer into the library as a new preset
        const cap = MT.captureFromSfx(target, 0); out.capture = !!cap && !!MT.getWorking().presets[cap] && MT.getWorking().presets[cap].kind != null;
        // envelope sketch drawn
        const cv = document.querySelector('canvas[width="360"][height="110"]');
        out.previewCanvas = !!cv;
        if (cv) { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let nz = 0; for (let i = 0; i < d.length; i += 4) if (d[i] || d[i + 1] || d[i + 2]) { nz = 1; break; } out.previewDrawn = !!nz; }
        T.closeTool();
      } finally { S.applyData(saved); }
      out.restored = JSON.stringify(S.exportCurrent()) === JSON.stringify(saved);
      return out;
    });

    console.log('SYNTH:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['fromData', 'hooks', 'defaults', 'curEqData', 'presetShape', 'clean', 'cleanIdentity', 'replace', 'neverEmpty', 'registered', 'inPalette', 'roadmap', 'opened', 'toolEdit', 'toolKind', 'toolNew', 'toolDup', 'toolRename', 'toolDelete', 'renameGuard', 'noThrow', 'compose', 'capture', 'previewCanvas', 'previewDrawn', 'restored'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'SYNTH TOOL TEST: PASS' : 'SYNTH TOOL TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
