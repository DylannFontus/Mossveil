// Save-slot editor (roadmap #86): the slot count + Load Save screen wording externalised from main.js
// (SLOT_COUNT, slotInfo) and ui.js (SLOT_VIEW, empty-slot text) into src/saves.js -> data/saves.js,
// authored by the Save slots editor (Edit ▸ Systems) with a mini slots-screen preview. This test
// asserts the overlay loaded, the live reads are byte-identical to the old constants, applyData
// (count clamp / wording) behaves, and the tool registers / opens / edits a working copy + applies +
// draws its preview — WITHOUT the real save() (which would clobber data/saves.js). Restored at the end.
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
      const out = {}, T = G.Tools, S = G.Saves, MT = T.saves;
      const saved = S.exportCurrent();
      try {
        out.fromData = !!G.SAVES_DATA && G.SAVES_DATA.slotCount === 5 && !!G.SAVES_DATA.labels;
        out.hooks = !!(S.slotCount && S.label && S.labels && S.applyData && S.exportDefaults && S.exportCurrent && S.MAX_SLOTS);
        const DEF = { slotCount: 5, labels: { newGamePlace: 'The Awakening', wings: 'Moth Wings', bossSingular: ' boss felled', bossPlural: ' bosses felled', emptyTitle: '— empty vessel —', emptySub: 'begin a new journey here', restedPrefix: 'rested ' } };
        out.defaults = JSON.stringify(S.exportDefaults()) === JSON.stringify(DEF);
        out.curEqDefault = JSON.stringify(S.exportCurrent()) === JSON.stringify(S.exportDefaults());
        out.reads = S.slotCount() === 5 && S.label('newGamePlace') === 'The Awakening' && S.label('wings') === 'Moth Wings' && S.label('bossSingular') === ' boss felled' && S.label('emptyTitle') === '— empty vessel —' && S.label('restedPrefix') === 'rested ';
        // applyData: retune count + a couple labels (others untouched)
        S.applyData({ slotCount: 3, labels: { wings: 'Wings!', emptyTitle: '(none)' } });
        out.applied = S.slotCount() === 3 && S.label('wings') === 'Wings!' && S.label('emptyTitle') === '(none)' && S.label('newGamePlace') === 'The Awakening';
        // clamp count to 1..MAX_SLOTS
        S.applyData({ slotCount: 99 });
        out.clampHi = S.slotCount() === S.MAX_SLOTS;
        S.applyData({ slotCount: 0 });
        out.clampLo = S.slotCount() === 1;
        S.applyData(null);
        out.reapply = S.slotCount() === 5 && S.label('wings') === 'Moth Wings';
        // tool
        out.registered = T._test.toolIds().indexOf('saves') >= 0;
        out.inPalette = T._test.paletteSearch('save slots').some(l => /save/i.test(l));
        out.roadmap = T.ROADMAP.some(g => g.items.some(i => i[0] === 86 && i[2] === 'done'));
        out.opened = T.openTool('saves');
        MT.load();
        MT.setCount(2);
        MT.setLabel('wings', 'X');
        MT.applyToEngine();
        out.toolApplied = S.slotCount() === 2 && S.label('wings') === 'X';
        out.dirty = MT.state.dirty === true;
        const cv = document.querySelector('canvas[width="340"][height="300"]');
        out.previewCanvas = !!cv;
        if (cv) { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let nz = 0; for (let i = 0; i < d.length; i += 4) if (d[i] || d[i + 1] || d[i + 2]) { nz = 1; break; } out.previewDrawn = !!nz; }
        T.closeTool();
      } finally { S.applyData(saved); }
      out.restored = S.slotCount() === 5 && S.label('wings') === 'Moth Wings' && S.label('emptyTitle') === '— empty vessel —';
      return out;
    });

    console.log('SAVES:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['fromData', 'hooks', 'defaults', 'curEqDefault', 'reads', 'applied', 'clampHi', 'clampLo', 'reapply', 'registered', 'inPalette', 'roadmap', 'opened', 'toolApplied', 'dirty', 'previewCanvas', 'previewDrawn', 'restored'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'SAVES TOOL TEST: PASS' : 'SAVES TOOL TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
