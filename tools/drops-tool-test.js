// Drop tables (roadmap #91): enemy & boss Glimmer drops externalised from the death handlers in
// enemies.js / bosses.js into src/drops.js -> data/drops.js, authored by the Drop tables editor
// (Edit ▸ Systems) with a live roll-simulation histogram. This test asserts the overlay loaded,
// defaults are byte-identical to the old formulas, the live roll()/bossRoll()/spec() reads + applyData
// (override + chance + clamp) behave, and the tool registers / opens / edits a working copy + applies
// to the engine + draws its preview — WITHOUT the real save() (which would clobber data/drops.js).
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
      const out = {}, T = G.Tools, D = G.Drops, MT = T.drops;
      const saved = D.exportCurrent();
      const inRange = (fn, lo, hi, n) => { for (let i = 0; i < n; i++) { const v = fn(); if (v < lo || v > hi) return false; } return true; };
      try {
        out.fromData = !!G.DROPS_DATA && !!G.DROPS_DATA.enemy && !!G.DROPS_DATA.boss && !!G.DROPS_DATA.byType && !!G.DROPS_DATA.byBoss;
        out.hooks = !!(D.roll && D.bossRoll && D.spec && D.bossSpec && D.applyData && D.exportDefaults && D.exportCurrent && D.expected);
        const DEF = { enemy: { min: 2, max: 4, chance: 1 }, boss: { min: 40, max: 59, chance: 1 }, byType: {}, byBoss: {} };
        out.defaults = JSON.stringify(D.exportDefaults()) === JSON.stringify(DEF);
        out.curEqDefault = JSON.stringify(D.exportCurrent()) === JSON.stringify(D.exportDefaults());
        // live rolls reproduce the old enemies.js / bosses.js ranges exactly
        out.enemyRange = inRange(() => D.roll('tumblebug'), 2, 4, 400);
        out.bossRange = inRange(() => D.bossRoll('mossSovereign'), 40, 59, 400);
        out.expected = D.expected({ min: 2, max: 4, chance: 1 }) === 3 && D.expected({ min: 10, max: 10, chance: 0.5 }) === 5;
        // override applies and is isolated to the keyed type
        D.applyData({ enemy: { min: 2, max: 4, chance: 1 }, boss: { min: 40, max: 59, chance: 1 }, byType: { tumblebug: { min: 10, max: 10, chance: 1 } }, byBoss: {} });
        out.override = inRange(() => D.roll('tumblebug'), 10, 10, 50) && inRange(() => D.roll('gnatling'), 2, 4, 100) && D.spec('tumblebug').min === 10 && D.hasOverride('tumblebug') && !D.hasOverride('gnatling');
        // chance 0 -> never drops
        D.applyData({ enemy: { min: 5, max: 5, chance: 0 }, boss: { min: 40, max: 59, chance: 1 }, byType: {}, byBoss: {} });
        out.chanceZero = inRange(() => D.roll('tumblebug'), 0, 0, 100);
        // clamp: max<min coerces up, negatives floor to 0, chance clamps to 0..1
        D.applyData({ enemy: { min: 9, max: 4, chance: 2 }, boss: { min: -3, max: 50, chance: -1 }, byType: {}, byBoss: {} });
        const ce = D.exportCurrent();
        out.clamp = ce.enemy.min === 9 && ce.enemy.max === 9 && ce.enemy.chance === 1 && ce.boss.min === 0 && ce.boss.chance === 0;
        D.applyData(null);
        out.reapply = D.enemyBase().max === 4 && D.bossBase().min === 40;
        // tool
        out.registered = T._test.toolIds().indexOf('drops') >= 0;
        out.inPalette = T._test.paletteSearch('drop tables').some(l => /drop/i.test(l));
        out.roadmap = T.roadmapStats().done >= 49;
        out.opened = T.openTool('drops');
        MT.load();
        MT.setBase('enemy', 'max', 9);
        MT.setOverride('byType', 'gnatling', true);
        MT.setEntry('byType', 'gnatling', 'min', 7);
        MT.applyToEngine();
        out.toolApplied = D.enemyBase().max === 9 && D.spec('gnatling').min === 7 && D.hasOverride('gnatling');
        out.dirty = MT.state.dirty === true;
        const cv = document.querySelector('canvas[width="460"][height="170"]');
        out.previewCanvas = !!cv;
        if (cv) { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let nz = 0; for (let i = 0; i < d.length; i += 4) if (d[i] || d[i + 1] || d[i + 2]) { nz = 1; break; } out.previewDrawn = !!nz; }
        T.closeTool();
      } finally { D.applyData(saved); }
      out.restored = D.enemyBase().max === 4 && D.bossBase().max === 59 && JSON.stringify(D.exportCurrent().byType) === '{}';
      return out;
    });

    console.log('DROPS:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['fromData', 'hooks', 'defaults', 'curEqDefault', 'enemyRange', 'bossRange', 'expected', 'override', 'chanceZero', 'clamp', 'reapply', 'registered', 'inPalette', 'roadmap', 'opened', 'toolApplied', 'dirty', 'previewCanvas', 'previewDrawn', 'restored'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'DROPS TOOL TEST: PASS' : 'DROPS TOOL TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
