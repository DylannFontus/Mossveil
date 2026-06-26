// Per-room performance budgets (Edit ▸ Tools, roadmap #67): an editor-only QA scanner over G.LEVELS
// that estimates each room's runtime/render "cost" from its content (enemies, lights, props, terrain,
// weather/water passes …) and flags rooms over a tunable budget. This verifies registration + the
// engine API, the cost model on the real world, then injects a deterministic LIGHT room and HEAVY room
// to assert exact cost maths, the prop/light/ray/boss split, breakdown-sums-to-cost, budget over/near
// flags (and that re-budgeting re-flags), stats aggregation, and that the tool renders a table.
// Restores the budget + removes the scratch rooms. Zero outbound network, no page errors. Never save()s.
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
      const T = G.Tools, MT = T.perf, out = {};
      const savedBudget = MT && MT.budget();
      try {
        out.registered = T._test.toolIds().includes('perf');
        out.inPalette = T._test.paletteSearch('perf').some(l => /perf|budget|room/i.test(l));
        out.roadmap = T.ROADMAP.some(g => g.items.some(i => i[0] === 67 && i[2] === 'done'));
        out.engineApi = !!(MT && MT.rooms && MT.stats && MT.roomCost && MT.budget && MT.setBudget && MT.costModel);

        // ---- cost model is the documented, expected one ----
        const cm = MT.costModel();
        out.costModel = cm.COST.enemy === 10 && cm.COST.light === 12 && cm.PROP_COST.npc === 8 && cm.PROP_COST.sign === 1;

        // ---- real-world shape ----
        const real = MT.rooms();
        out.realRooms = Array.isArray(real) && real.length > 0 && typeof real[0].cost === 'number' && !!real[0].breakdown && typeof real[0].status === 'string';

        // ---- deterministic scratch rooms ----
        G.LEVELS['PERF_TEST_LIGHT'] = { title: 'Light', w: 10, h: 6, biome: 'verdant', tiles: ['##########'], props: [{ type: 'sign', x: 1, y: 1 }], enemies: [] };
        G.LEVELS['PERF_TEST_HEAVY'] = {
          title: 'Heavy', w: 40, h: 20, biome: 'gloom', weather: 'rain', water: { y: 0 },
          tiles: ['########################################', '########################################', '########################################', '########################################', '########################################'],
          props: [{ type: 'light' }, { type: 'light' }, { type: 'light' }, { type: 'ray' }, { type: 'bossTrigger' }, { type: 'npc' }, { type: 'npc' }],
          enemies: [{ type: 'crawler' }, { type: 'crawler' }, { type: 'crawler' }, { type: 'crawler' }, { type: 'crawler' }]
        };

        // budget tuned so HEAVY is clearly over, LIGHT is fine
        MT.setBudget(50, 150);
        const rr = MT.rooms();
        const Lr = rr.find(r => r.id === 'PERF_TEST_LIGHT'), Hr = rr.find(r => r.id === 'PERF_TEST_HEAVY');

        // counts split light / ray / bossTrigger off the prop axis
        out.countsLight = Lr && Lr.props === 1 && Lr.enemies === 0 && Lr.lights === 0 && Lr.cost === 3;
        out.countsHeavy = Hr && Hr.props === 2 && Hr.enemies === 5 && Hr.lights === 3 && Hr.rays === 1 && Hr.bosses === 1 && Hr.weather === true && Hr.water === true;
        // exact cost maths: 30(terrain)+8(area)+16(props)+50(foes)+36(lights)+4(ray)+6(boss)+16(weather)+14(water) = 180
        out.costHeavy = Hr && Hr.cost === 180;
        out.ordering = Hr.cost > Lr.cost;
        out.draws = Hr.draws === 18;   // 6 base + 2 props + 3 lights + 1 ray + 5 foes + 1 boss
        // breakdown sums to the cost
        const sum = Math.round(Object.values(Hr.breakdown).reduce((a, v) => a + v, 0));
        out.breakdownSum = sum === Hr.cost;

        // ---- budget flags ----
        out.flagsOver = Hr.over === true && Hr.warn === false && Lr.status === 'ok';
        MT.setBudget(100, 200);                       // now HEAVY (180) is BETWEEN -> near, not over
        const rr2 = MT.rooms();
        const Hr2 = rr2.find(r => r.id === 'PERF_TEST_HEAVY');
        out.flagsWarn = Hr2.warn === true && Hr2.over === false && Hr2.status === 'warn';

        // ---- stats aggregate ----
        const st = MT.stats();
        out.statsOk = st.rooms === rr2.length && typeof st.totalCost === 'number' && st.maxCost >= 180 && st.enemies >= 5;

        // ---- render ----
        out.opened = T.openTool('perf');
        const rows = document.querySelectorAll('.tc-host table tbody tr');
        out.tableRows = rows.length > 0;
        T.closeTool();
      } finally {
        delete G.LEVELS['PERF_TEST_LIGHT'];
        delete G.LEVELS['PERF_TEST_HEAVY'];
        if (savedBudget) MT.setBudget(savedBudget.warn, savedBudget.over);
      }
      out.cleaned = !MT.rooms().some(r => /PERF_TEST/.test(r.id));
      out.budgetRestored = JSON.stringify(MT.budget()) === JSON.stringify(savedBudget);
      return out;
    });

    console.log('PERF-TOOL:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['registered', 'inPalette', 'roadmap', 'engineApi', 'costModel', 'realRooms', 'countsLight', 'countsHeavy', 'costHeavy', 'ordering', 'draws', 'breakdownSum', 'flagsOver', 'flagsWarn', 'statsOk', 'opened', 'tableRows', 'cleaned', 'budgetRestored'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'PERF-TOOL TEST: PASS' : 'PERF-TOOL TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
