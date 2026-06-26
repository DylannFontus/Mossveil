// Economy & costs (roadmap #27): the Glimmer economy tuning (vendor charm price multiplier, per-level
// nail forge costs, soul-kept-on-death) externalised from main.js into src/economy.js -> data/economy.js,
// authored by the Economy editor (Edit ▸ Systems). This test asserts the data overlay loaded, defaults
// are byte-identical to the old constants, the live reads + validation/clamping behave, and the tool
// registers / opens / edits a working copy + applies to the engine — WITHOUT calling the real save()
// (which would clobber data/economy.js). The engine state is restored at the end. Offline, no errors.
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
      const out = {}, T = G.Tools, E = G.Economy, MT = T.economy;
      const saved = E.exportCurrent();
      try {
        out.fromData = !!G.ECONOMY_DATA && G.ECONOMY_DATA.charmPriceMul === 60;
        out.hooks = !!(E.charmPrice && E.nailCost && E.nailMax && E.soulKeptOnDeath && E.applyData && E.exportDefaults);
        // defaults byte-identical to the old hardcoded constants
        out.defaults = JSON.stringify(E.exportDefaults()) === JSON.stringify({ charmPriceMul: 60, nailCosts: [60, 120, 180, 240], soulKeptOnDeath: 0.5 });
        out.curEqDefault = JSON.stringify(E.exportCurrent()) === JSON.stringify(E.exportDefaults());
        // live reads reproduce the old main.js formulas
        out.charmPrice = E.charmPrice(2) === 120 && E.charmPriceMul() === 60;     // c.cost*60
        out.nail = E.nailMax() === 4 && E.nailCost(0) === 60 && E.nailCost(3) === 240 && E.nailTotal() === 600;
        out.soul = E.soulKeptOnDeath() === 0.5;                                   // floor(soul/2)

        // applyData round-trip + clamping/validation
        E.applyData({ charmPriceMul: -10, nailCosts: [10, 20, 30], soulKeptOnDeath: 2 });
        out.applied = E.charmPriceMul() === 0 && E.nailMax() === 3 && E.nailCost(2) === 30 && E.soulKeptOnDeath() === 1;
        E.applyData(null);                                                        // null -> overlay/defaults
        out.reapplyDefault = E.charmPriceMul() === 60 && E.nailMax() === 4;

        // tool
        out.registered = T._test.toolIds().indexOf('economy') >= 0;
        out.inPalette = T._test.paletteSearch('economy costs').some(l => /economy/i.test(l));
        out.roadmap = T.roadmapStats().done >= 46;
        out.opened = T.openTool('economy');
        // edit the working copy (not the real dataset) and apply to the engine
        MT.load();
        MT.setField('charmPriceMul', 100);
        MT.setNail(0, 25);
        MT.addNail();
        MT.setField('soulKeptOnDeath', 0.25);
        MT.applyToEngine();
        out.toolApplied = E.charmPriceMul() === 100 && E.nailCost(0) === 25 && E.nailMax() === 5 && E.soulKeptOnDeath() === 0.25;
        out.dirty = MT.state.dirty === true;
        T.closeTool();
      } finally { E.applyData(saved); }   // restore engine state — never save()d
      out.restored = E.charmPriceMul() === 60 && E.nailMax() === 4 && E.soulKeptOnDeath() === 0.5;
      return out;
    });

    console.log('ECONOMY:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['fromData', 'hooks', 'defaults', 'curEqDefault', 'charmPrice', 'nail', 'soul', 'applied', 'reapplyDefault', 'registered', 'inPalette', 'roadmap', 'opened', 'toolApplied', 'dirty', 'restored'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'ECONOMY TEST: PASS' : 'ECONOMY TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
