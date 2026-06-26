// Achievements (Edit ▸ Systems): declarative achievements externalised to data/achievements.js,
// checked against the save (read-only), awarded at save time. Offline. Does NOT save().
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
      const T = G.Tools, A = G.Achievements, MT = T.achievements, out = {};
      out.fromData = !!G.ACHIEVEMENTS_DATA && !!G.ACHIEVEMENTS_DATA.list;
      out.count = A.LIST.length >= 5;
      // condition evaluation against a save
      out.evalGlimmer = A.evalCond({ type: 'glimmer', n: 500 }, { glimmer: 600 }) === true && A.evalCond({ type: 'glimmer', n: 500 }, { glimmer: 100 }) === false;
      out.evalBoss = A.evalCond({ type: 'bossCount', n: 1 }, { bosses: { 'room:mossSovereign': true } }) === true;
      // check() awards newly-earned and records them
      G.save = { glimmer: 600, bosses: { 'a:x': true }, achievements: {} };
      const newly = A.check();
      out.awarded = newly.some(a => a.id === 'glittering') && A.isUnlocked('glittering') && A.isUnlocked('firstBoss');
      out.noDouble = A.check().length === 0;   // already awarded -> nothing new
      // tool
      out.registered = T._test.toolIds().includes('achievements');
      out.inPalette = T._test.paletteSearch('achievements').some(l => /achievement/i.test(l));
      out.roadmap = T.roadmapStats().done >= 27;
      out.opened = T.openTool('achievements');
      MT.addAch(); MT.setId(MT.state.sel, 'zzach'); MT.setCondType(MT.state.sel, 'nail'); MT.setCondParam(MT.state.sel, 'n', 2);
      MT.applyToEngine();
      out.added = A.LIST.some(a => a.id === 'zzach');
      T.closeTool();
      return out;
    });

    console.log('ACHIEVEMENTS-TOOL:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = o.fromData && o.count && o.evalGlimmer && o.evalBoss && o.awarded && o.noDouble
      && o.registered && o.inPalette && o.roadmap && o.opened && o.added
      && netHits === 0 && !errs.length;
    console.log(ok ? 'ACHIEVEMENTS-TOOL TEST: PASS' : 'ACHIEVEMENTS-TOOL TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
