// Ending / credits roll (roadmap #94): the credits screen content & style externalised from ui.js
// drawEnding() and main.js into src/credits.js -> data/credits.js, authored by the Credits editor
// (Edit ▸ Systems) with a scrubbable preview. This test asserts the overlay loaded, the live reads are
// byte-identical to the old hardcoded roll, applyData (edit lines / colour / timing / clamp) behaves,
// and the tool registers / opens / edits a working copy + applies + draws its preview — WITHOUT the
// real save() (which would clobber data/credits.js). Engine state restored at the end. Offline.
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
      const out = {}, T = G.Tools, C = G.Credits, MT = T.credits;
      const saved = C.exportCurrent();
      try {
        out.fromData = !!G.CREDITS_DATA && Array.isArray(G.CREDITS_DATA.lines) && G.CREDITS_DATA.bg === '#f0f8f4';
        out.hooks = !!(C.bg && C.bgStyle && C.textColor && C.startY && C.lineGap && C.dismissAfter && C.lines && C.applyData && C.exportDefaults && C.exportCurrent);
        const DEF = {
          bg: '#f0f8f4', textColor: '#1c2a24', startY: 0.36, lineGap: 18, dismissAfter: 4.5,
          lines: [
            { text: 'M O S S V E I L', size: 46, delay: 0.5, italic: false },
            { text: 'the glade remembers you', size: 22, delay: 1.6, italic: true },
            { text: '', size: 10, delay: 0, italic: true },
            { text: 'woven from code alone — every shape, sound and shadow', size: 16, delay: 2.8, italic: true },
            { text: '', size: 10, delay: 0, italic: true },
            { text: 'press any key to wander on', size: 17, delay: 4.0, italic: true }
          ]
        };
        out.defaults = JSON.stringify(C.exportDefaults()) === JSON.stringify(DEF);
        out.curEqDefault = JSON.stringify(C.exportCurrent()) === JSON.stringify(C.exportDefaults());
        // live reads reproduce the old drawEnding constants exactly
        out.reads = C.bg() === '#f0f8f4' && C.bgStyle(0.5) === 'rgba(240,248,244,0.5)' && C.textColor() === '#1c2a24' && C.startY() === 0.36 && C.lineGap() === 18 && C.dismissAfter() === 4.5;
        out.lineReads = C.lines().length === 6 && C.lines()[0].text === 'M O S S V E I L' && C.lines()[0].italic === false && C.lines()[1].italic === true;
        // applyData: retune content + colour + timing
        C.applyData({ bg: '#000000', textColor: '#ffffff', startY: 0.5, lineGap: 24, dismissAfter: 2, lines: [{ text: 'X', size: 20, delay: 1, italic: true }] });
        out.applied = C.bg() === '#000000' && C.bgStyle(0.5) === 'rgba(0,0,0,0.5)' && C.dismissAfter() === 2 && C.lines().length === 1 && C.lines()[0].text === 'X';
        // clamp / normalise: startY -> [0,1], lineGap >= 0, size >= 1, missing text -> ''
        C.applyData({ startY: 2, lineGap: -5, dismissAfter: -3, lines: [{ size: -3 }] });
        const ce = C.exportCurrent();
        out.clamp = ce.startY === 1 && ce.lineGap === 0 && ce.dismissAfter === 0 && ce.lines[0].size === 1 && ce.lines[0].text === '' && ce.lines[0].italic === true;
        C.applyData(null);
        out.reapply = C.lines().length === 6 && C.dismissAfter() === 4.5;
        // tool
        out.registered = T._test.toolIds().indexOf('credits') >= 0;
        out.inPalette = T._test.paletteSearch('ending credits').some(l => /credit|ending/i.test(l));
        out.roadmap = T.ROADMAP.some(g => g.items.some(i => i[0] === 94 && i[2] === 'done'));
        out.opened = T.openTool('credits');
        MT.load();
        MT.addLine();
        MT.setStyle('dismissAfter', 3);
        MT.setLine(0, 'text', 'Z');
        MT.applyToEngine();
        out.toolApplied = C.lines().length === 7 && C.dismissAfter() === 3 && C.lines()[0].text === 'Z';
        out.dirty = MT.state.dirty === true;
        const cv = document.querySelector('canvas[width="420"][height="300"]');
        out.previewCanvas = !!cv;
        if (cv) { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let nz = 0; for (let i = 0; i < d.length; i += 4) if (d[i] || d[i + 1] || d[i + 2]) { nz = 1; break; } out.previewDrawn = !!nz; }
        T.closeTool();
      } finally { C.applyData(saved); }
      out.restored = C.lines().length === 6 && C.dismissAfter() === 4.5 && C.bg() === '#f0f8f4';
      return out;
    });

    console.log('CREDITS:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['fromData', 'hooks', 'defaults', 'curEqDefault', 'reads', 'lineReads', 'applied', 'clamp', 'reapply', 'registered', 'inPalette', 'roadmap', 'opened', 'toolApplied', 'dirty', 'previewCanvas', 'previewDrawn', 'restored'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'CREDITS TOOL TEST: PASS' : 'CREDITS TOOL TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
