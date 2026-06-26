// Attack / move editor (Edit ▸ Content, roadmap #10): externalises every boss move's tuning
// numbers to data/moves.js (G.MOVES_DATA), read by src/bosses.js. Verifies the engine API,
// byte-identical defaults (empty overlay), live re-tuning, "used by" lookup, revert, registration,
// zero outbound network and no page errors. Tunes in memory only (never save()s the dataset file).
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
      const T = G.Tools, B = G.Bosses, MT = T.moves, out = {};
      out.registered = T._test.toolIds().includes('moves');
      out.inPalette = T._test.paletteSearch('move').some(l => /move/i.test(l));
      out.roadmap = T.roadmapStats().done >= 32;
      out.engineApi = !!(B.MOVE_SCHEMA && B.exportMoveCurrent && B.exportMoveDefaults && B.applyMoveData && B.MOVE_PARAMS && B.movesUsedBy);

      // empty overlay => current params are byte-identical to the built-in defaults
      out.defaultsIdentical = JSON.stringify(B.exportMoveCurrent()) === JSON.stringify(B.exportMoveDefaults());
      out.tenMoves = Object.keys(B.MOVE_SCHEMA).length === 10;
      out.schemaCount = MT.schema('volley').some(f => f[0] === 'count');

      out.opened = T.openTool('moves');

      // live re-tune: volley fires `count` bolts; bump it and confirm the engine sees it
      const def = B.exportMoveDefaults().volley.count;
      MT.set('volley', 'count', def + 3);
      out.live = B.MOVE_PARAMS().volley.count === def + 3;
      MT.set('slash', 'dmg', 0);
      out.dmgZero = B.MOVE_PARAMS().slash.dmg === 0;

      // "used by" lookup: leap is in several rosters
      out.usedBy = MT.usedBy('leap').length > 0;

      // revert restores defaults across the board
      MT.revert();
      out.reverted = B.MOVE_PARAMS().volley.count === def && B.MOVE_PARAMS().slash.dmg === B.exportMoveDefaults().slash.dmg;

      T.closeTool();
      return out;
    });

    console.log('MOVES-TOOL:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['registered', 'inPalette', 'roadmap', 'engineApi', 'defaultsIdentical', 'tenMoves', 'schemaCount', 'opened', 'live', 'dmgZero', 'usedBy', 'reverted'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'MOVES-TOOL TEST: PASS' : 'MOVES-TOOL TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
