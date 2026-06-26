// Difficulty / accessibility (Edit ▸ Systems): difficulty modes externalised to data/difficulty.js;
// applied via charms.js C.apply (integer-safe masks/nail/soul). Offline. Does NOT save().
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
      const T = G.Tools, D = G.Difficulty, C = G.Charms, MT = T.difficulty, out = {};
      out.fromData = !!G.DIFFICULTY_DATA && !!G.DIFFICULTY_DATA.modes;
      out.modes = D.modeList().map(m => m.id).join(',').includes('assist');
      // normal mode is neutral (byte-identical baseline)
      G.save = { charmsEquipped: [], charmsOwned: [], nailLevel: 0 };
      out.normalNeutral = D.maskBonus() === 0 && D.dmgBonus() === 0 && D.soulMul() === 1;
      const p = { hp: 5 }; C.apply(p);
      out.baseStats = p.maxHp === 5 && p.nailDmg === 1;
      // switch to assist -> derived stats reflect the bonuses (via C.apply integration)
      D.setMode('assist'); C.apply(p);
      out.assist = p.maxHp === 7 && p.nailDmg === 2 && Math.abs(p.soulMul - 1.5) < 1e-9;
      D.setMode('steadfast'); C.apply(p);
      out.steadfast = p.maxHp === 4 && Math.abs(p.soulMul - 0.85) < 1e-9;
      D.setMode('normal'); C.apply(p);
      out.backToNormal = p.maxHp === 5 && p.nailDmg === 1;
      // tool
      out.registered = T._test.toolIds().includes('difficulty');
      out.inPalette = T._test.paletteSearch('difficulty accessibility').some(l => /difficulty/i.test(l));
      out.roadmap = T.roadmapStats().done >= 26;
      out.opened = T.openTool('difficulty');
      MT.addMode(); MT.renameId(MT.state.sel, 'brutal'); MT.setField('brutal', 'maskBonus', -3);
      MT.applyToEngine();
      out.added = D.modeList().some(m => m.id === 'brutal');
      T.closeTool();
      return out;
    });

    console.log('DIFFICULTY-TOOL:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = o.fromData && o.modes && o.normalNeutral && o.baseStats && o.assist && o.steadfast && o.backToNormal
      && o.registered && o.inPalette && o.roadmap && o.opened && o.added
      && netHits === 0 && !errs.length;
    console.log(ok ? 'DIFFICULTY-TOOL TEST: PASS' : 'DIFFICULTY-TOOL TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
