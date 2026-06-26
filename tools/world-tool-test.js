// World / Map editor 2.0 (Edit ▸ World, roadmap #37): a tabular world-management view over G.LEVELS.
// Verifies registration, the engine API (rooms / stats / connections / bulk setBiome/setMusic),
// computed columns on the real world, then injects two linked rooms in-memory to exercise
// reachability + connections + bulk retheme, asserts the field writes, and restores the world.
// Zero outbound network, no page errors. Never save()s anything.
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
      const T = G.Tools, MT = T.world, out = {};
      out.registered = T._test.toolIds().includes('world');
      out.inPalette = T._test.paletteSearch('world').some(l => /world|map 2/i.test(l));
      out.roadmap = T.roadmapStats().done >= 35;
      out.engineApi = !!(MT && MT.rooms && MT.stats && MT.connections && MT.setBiome && MT.setMusic);

      // real-world shape
      const real = MT.rooms();
      out.realRooms = Array.isArray(real) && real.length > 0 && real[0].id != null && typeof real[0].reachable === 'boolean';
      const st = MT.stats();
      out.statsOk = st && st.rooms === real.length && typeof st.reachable === 'number' && st.reachable >= 1;
      out.startReachable = real.some(r => r.start && r.reachable);

      // ---- inject two linked rooms (A -> B one-way) ----
      G.LEVELS['WORLD_TEST_A'] = { title: 'World A', w: 10, h: 6, biome: 'x', music: 'x', tiles: ['##########'], spawns: { e: { x: 1, y: 1 } }, transitions: [{ to: 'WORLD_TEST_B', spawn: 'e', x: 1, y: 1, w: 2, h: 2 }], props: [], enemies: [] };
      G.LEVELS['WORLD_TEST_B'] = { title: '', w: 10, h: 6, tiles: ['          '], spawns: { e: { x: 1, y: 1 } }, transitions: [], props: [], enemies: [] };

      const rr = MT.rooms();
      const A = rr.find(r => r.id === 'WORLD_TEST_A'), B = rr.find(r => r.id === 'WORLD_TEST_B');
      out.unreachable = A && !A.reachable && B && !B.reachable;     // not linked from the real start
      out.deadendB = B && B.deadend && B.untitled && B.empty;
      out.onewayA = A && A.noReturn && A.incoming === 0;
      out.incomingB = B && B.incoming === 1;

      const cx = MT.connections('WORLD_TEST_A');
      out.connOut = cx.out.length === 1 && cx.out[0].to === 'WORLD_TEST_B' && cx.out[0].exists;
      const cxB = MT.connections('WORLD_TEST_B');
      out.connIn = cxB.in.length === 1 && cxB.in[0].from === 'WORLD_TEST_A';

      // ---- bulk retheme on the injected rooms only ----
      const biome = (G.World && G.World.BIOMES && G.World.BIOMES[0]) || 'verdant';
      const track = (G.Music && G.Music.TRACK_IDS && G.Music.TRACK_IDS[0]) || 'calm';
      const nB = MT.setBiome(['WORLD_TEST_A', 'WORLD_TEST_B'], biome);
      const nM = MT.setMusic(['WORLD_TEST_B'], track);
      out.bulkBiome = nB === 2 && G.LEVELS['WORLD_TEST_A'].biome === biome && G.LEVELS['WORLD_TEST_B'].biome === biome;
      out.bulkMusic = nM === 1 && G.LEVELS['WORLD_TEST_B'].music === track;

      out.opened = T.openTool('world');
      T.closeTool();

      // ---- restore ----
      delete G.LEVELS['WORLD_TEST_A'];
      delete G.LEVELS['WORLD_TEST_B'];
      out.cleaned = !MT.rooms().some(r => /WORLD_TEST/.test(r.id));
      return out;
    });

    console.log('WORLD-TOOL:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['registered', 'inPalette', 'roadmap', 'engineApi', 'realRooms', 'statsOk', 'startReachable', 'unreachable', 'deadendB', 'onewayA', 'incomingB', 'connOut', 'connIn', 'bulkBiome', 'bulkMusic', 'opened', 'cleaned'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'WORLD-TOOL TEST: PASS' : 'WORLD-TOOL TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
