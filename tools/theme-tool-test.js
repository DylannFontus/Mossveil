// Typography & Iconography (roadmap #30): the two UI font families and the currency/quest glyph
// vocabulary externalised from src/ui.js (and one world.js prompt) into src/theme.js -> data/theme.js,
// authored by the Typography & icons editor (Edit ▸ Systems) with a live preview. This test asserts
// the overlay loaded, defaults are byte-identical to the old constants (incl. the exact glyphs), the
// live font()/icon() reads + applyData behave, and the tool registers / opens / edits a working copy +
// applies to the engine + draws its preview — WITHOUT the real save() (which would clobber data/theme.js).
// Engine state is restored at the end. Offline, no errors.
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
      const out = {}, T = G.Tools, Th = G.Theme, MT = T.theme;
      const saved = Th.exportCurrent();
      try {
        out.fromData = !!G.THEME_DATA && !!G.THEME_DATA.fonts && G.THEME_DATA.icons.glimmer === '✦';
        out.hooks = !!(Th.font && Th.icon && Th.fonts && Th.icons && Th.applyData && Th.exportDefaults && Th.exportCurrent);
        const DEF = { fonts: { body: 'Georgia, "Times New Roman", serif', display: '"Arial Black", "Arial Bold", Impact, sans-serif' }, icons: { glimmer: '✦', diamond: '◆', diamondOutline: '◇', check: '✓' } };
        out.defaults = JSON.stringify(Th.exportDefaults()) === JSON.stringify(DEF);
        out.curEqDefault = JSON.stringify(Th.exportCurrent()) === JSON.stringify(Th.exportDefaults());
        // live reads reproduce the old ui.js constants exactly
        out.fontRead = Th.font('body') === DEF.fonts.body && Th.font('display') === DEF.fonts.display;
        out.iconRead = Th.icon('glimmer') === '✦' && Th.icon('diamond') === '◆' && Th.icon('diamondOutline') === '◇' && Th.icon('check') === '✓';
        // applyData round-trip
        Th.applyData({ fonts: { body: 'Comic Sans MS' }, icons: { glimmer: '★' } });
        out.applied = Th.font('body') === 'Comic Sans MS' && Th.icon('glimmer') === '★' && Th.font('display') === DEF.fonts.display && Th.icon('check') === '✓';
        Th.applyData(null);
        out.reapply = Th.font('body') === DEF.fonts.body && Th.icon('glimmer') === '✦';
        // tool
        out.registered = T._test.toolIds().indexOf('theme') >= 0;
        out.inPalette = T._test.paletteSearch('typography icons').some(l => /typography/i.test(l));
        out.roadmap = T.roadmapStats().done >= 48;
        out.opened = T.openTool('theme');
        MT.load();
        MT.setFont('display', 'Impact');
        MT.setIcon('glimmer', '◈');
        MT.applyToEngine();
        out.toolApplied = Th.font('display') === 'Impact' && Th.icon('glimmer') === '◈';
        out.dirty = MT.state.dirty === true;
        const cv = document.querySelector('canvas[width="420"][height="180"]');
        out.previewCanvas = !!cv;
        if (cv) { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let nz = 0; for (let i = 0; i < d.length; i += 4) if (d[i] || d[i + 1] || d[i + 2]) { nz = 1; break; } out.previewDrawn = !!nz; }
        T.closeTool();
      } finally { Th.applyData(saved); }
      out.restored = Th.font('body') === 'Georgia, "Times New Roman", serif' && Th.icon('glimmer') === '✦';
      return out;
    });

    console.log('THEME:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['fromData', 'hooks', 'defaults', 'curEqDefault', 'fontRead', 'iconRead', 'applied', 'reapply', 'registered', 'inPalette', 'roadmap', 'opened', 'toolApplied', 'dirty', 'previewCanvas', 'previewDrawn', 'restored'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'THEME TEST: PASS' : 'THEME TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
