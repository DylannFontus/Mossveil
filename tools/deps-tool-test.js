// Dependency view + safe-delete (Edit ▸ Project): scans G.LEVELS for references to a dataset item
// (enemy/boss/charm/biome/music). Read-only, editor-only, offline.
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
      const T = G.Tools, MT = T.deps, out = {};
      out.registered = T._test.toolIds().includes('deps');
      out.inPalette = T._test.paletteSearch('dependency view').some(l => /dependency/i.test(l));
      out.roadmap = T.roadmapStats().done >= 24;
      out.opened = T.openTool('deps');
      // inject known references into a level, then scan finds them
      const lid = Object.keys(G.LEVELS)[0]; const L = G.LEVELS[lid];
      L.props = (L.props || []).concat([{ type: 'charmPickup', x: 1, y: 1, charm: 'glassheart' }, { type: 'bossTrigger', x: 2, y: 2, boss: 'mossSovereign' }]);
      L.enemies = (L.enemies || []).concat([{ type: 'tumblebug', x: 3, y: 3 }]);
      out.charmRef = MT.refs('Charms', 'glassheart').includes(lid);
      out.bossRef = MT.refs('Bosses', 'mossSovereign').includes(lid);
      out.enemyRef = MT.refs('Enemies', 'tumblebug').includes(lid);
      out.biomeRef = MT.refs('Biomes', L.biome).includes(lid);   // level's own biome
      // an item nobody references reads as unused
      out.unused = MT.refs('Charms', 'zznotacharm').length === 0;
      out.items = MT.items('Charms').length >= 6;
      T.closeTool();
      return out;
    });

    console.log('DEPS-TOOL:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = o.registered && o.inPalette && o.roadmap && o.opened
      && o.charmRef && o.bossRef && o.enemyRef && o.biomeRef && o.unused && o.items
      && netHits === 0 && !errs.length;
    console.log(ok ? 'DEPS-TOOL TEST: PASS' : 'DEPS-TOOL TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
