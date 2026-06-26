// Player feel / loadout editor (Edit ▸ Content): player movement/combat tuning externalised to
// data/player.js as a value overlay (movement code untouched). Offline. Does NOT save().
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
      const T = G.Tools, PL = G.Player, MT = T.player, out = {};
      out.fromData = !!G.PLAYER_DATA && !!G.PLAYER_DATA.tune;
      // empty overlay => defaults are byte-identical to the old literals
      out.defaults = PL.tune().run === 8.8 && PL.tune().jumpV === 18 && PL.tuneDefaults().dashV === 23;
      out.registered = T._test.toolIds().includes('player');
      out.inPalette = T._test.paletteSearch('player feel').some(l => /player/i.test(l));
      out.roadmap = T.roadmapStats().done >= 22;
      out.opened = T.openTool('player');
      // editing the working copy
      MT.setField('run', 11.5); MT.setField('jumpV', 20);
      out.edited = MT.getWorking().run === 11.5 && MT.getWorking().jumpV === 20;
      out.defaultsIntact = PL.tuneDefaults().run === 8.8;   // defaults unaffected by edits
      T.closeTool();
      return out;
    });

    console.log('PLAYER-TOOL:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = o.fromData && o.defaults && o.registered && o.inPalette && o.roadmap
      && o.opened && o.edited && o.defaultsIntact
      && netHits === 0 && !errs.length;
    console.log(ok ? 'PLAYER-TOOL TEST: PASS' : 'PLAYER-TOOL TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
