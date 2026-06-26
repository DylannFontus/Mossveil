// Charm loadout / notch economy (roadmap #90): the notch budget + overcharm rules externalised from
// charms.js / player.js into src/loadout.js -> data/loadout.js, authored by the Charm loadout editor
// (Edit ▸ Systems) with a live notch-progression curve. This test asserts the overlay loaded, defaults
// are byte-identical to the old constants, the live reads + applyData (curve / overcharm / clamp)
// behave, and the tool registers / opens / edits a working copy + applies + draws its preview — WITHOUT
// the real save() (which would clobber data/loadout.js). Engine state restored at the end. Offline.
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
      const out = {}, T = G.Tools, L = G.Loadout, MT = T.loadout;
      const saved = L.exportCurrent();
      try {
        out.fromData = !!G.LOADOUT_DATA && G.LOADOUT_DATA.baseNotches === 3 && G.LOADOUT_DATA.allowOvercharm === true;
        out.hooks = !!(L.baseNotches && L.notchesPerBoss && L.notchCap && L.allowOvercharm && L.overcharmDamageMult && L.notchesForBosses && L.applyData && L.exportDefaults && L.exportCurrent);
        const DEF = { baseNotches: 3, notchesPerBoss: 1, notchCap: 9, allowOvercharm: true, overcharmDamageMult: 2 };
        out.defaults = JSON.stringify(L.exportDefaults()) === JSON.stringify(DEF);
        out.curEqDefault = JSON.stringify(L.exportCurrent()) === JSON.stringify(L.exportDefaults());
        // live reads reproduce the old charms.js formula: min(9, 3 + bosses)
        out.curve = L.notchesForBosses(0) === 3 && L.notchesForBosses(2) === 5 && L.notchesForBosses(6) === 9 && L.notchesForBosses(7) === 9;
        out.reads = L.baseNotches() === 3 && L.notchCap() === 9 && L.allowOvercharm() === true && L.overcharmDamageMult() === 2;
        // applyData: retune
        L.applyData({ baseNotches: 2, notchesPerBoss: 2, notchCap: 6, allowOvercharm: false, overcharmDamageMult: 3 });
        out.applied = L.notchesForBosses(0) === 2 && L.notchesForBosses(1) === 4 && L.notchesForBosses(2) === 6 && L.notchesForBosses(3) === 6 && L.allowOvercharm() === false && L.overcharmDamageMult() === 3;
        // clamp: negatives floor to 0, cap >= base, mult >= 1
        L.applyData({ baseNotches: -1, notchesPerBoss: -2, notchCap: 0, overcharmDamageMult: 0.2 });
        out.clamp = L.baseNotches() === 0 && L.notchesPerBoss() === 0 && L.notchCap() === 0 && L.overcharmDamageMult() === 1;
        L.applyData(null);
        out.reapply = L.baseNotches() === 3 && L.notchCap() === 9;
        // tool
        out.registered = T._test.toolIds().indexOf('loadout') >= 0;
        out.inPalette = T._test.paletteSearch('charm loadout notches').some(l => /loadout|notch/i.test(l));
        out.roadmap = T.ROADMAP.some(g => g.items.some(i => i[0] === 90 && i[2] === 'done'));
        out.opened = T.openTool('loadout');
        MT.load();
        MT.setInt('baseNotches', 4);
        MT.setBool('allowOvercharm', false);
        MT.setNum('overcharmDamageMult', 3);
        MT.applyToEngine();
        out.toolApplied = L.baseNotches() === 4 && L.allowOvercharm() === false && L.overcharmDamageMult() === 3;
        out.dirty = MT.state.dirty === true;
        const cv = document.querySelector('canvas[width="460"][height="170"]');
        out.previewCanvas = !!cv;
        if (cv) { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let nz = 0; for (let i = 0; i < d.length; i += 4) if (d[i] || d[i + 1] || d[i + 2]) { nz = 1; break; } out.previewDrawn = !!nz; }
        T.closeTool();
      } finally { L.applyData(saved); }
      out.restored = L.baseNotches() === 3 && L.notchCap() === 9 && L.overcharmDamageMult() === 2;
      return out;
    });

    console.log('LOADOUT:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['fromData', 'hooks', 'defaults', 'curEqDefault', 'curve', 'reads', 'applied', 'clamp', 'reapply', 'registered', 'inPalette', 'roadmap', 'opened', 'toolApplied', 'dirty', 'previewCanvas', 'previewDrawn', 'restored'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'LOADOUT TOOL TEST: PASS' : 'LOADOUT TOOL TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
