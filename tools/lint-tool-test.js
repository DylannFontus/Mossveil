// Lint 2.0 (Edit ▸ Tools, roadmap #40): a rule-based world validator over G.LEVELS + the live
// datasets. Verifies registration, the engine API, a clean run on the real world, then injects a
// synthetic broken world in-memory and asserts each rule fires (missing exit, unknown enemy/charm,
// dangling logic link, orphan signals, empty/untitled room, NPC with no dialogue), then restores
// the world. Zero outbound network, no page errors. Never save()s anything.
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
      const T = G.Tools, MT = T.lint, out = {};
      out.registered = T._test.toolIds().includes('lint');
      out.inPalette = T._test.paletteSearch('lint').some(l => /lint|world check/i.test(l));
      out.roadmap = T.roadmapStats().done >= 34;
      out.engineApi = !!(MT && MT.run && MT.rules && MT.categories);
      out.ruleCount = MT.rules().length >= 20;
      out.cats = MT.categories().length >= 5;

      // clean run on the real world: must not throw and must return a count shape
      const real = MT.run();
      out.realRunOk = real && typeof real.counts.total === 'number' && Array.isArray(real.issues);

      // ---- inject a synthetic broken world (in memory only) ----
      const biome = (G.World && G.World.BIOMES && G.World.BIOMES[0]) || undefined;
      G.LEVELS['LINT_TEST_A'] = {
        title: 'Lint Test A', w: 20, h: 6, biome,
        tiles: ['####################', '#                  #', '#                  #', '#                  #', '#                  #', '####################'],
        spawns: { start: { x: 2, y: 2 } },
        transitions: [{ to: 'LINT_TEST_NOWHERE', x: 1, y: 1, w: 2, h: 2 }],
        enemies: [{ type: 'zzz_no_such_enemy', x: 5, y: 5 }],
        props: [
          { type: 'charmPickup', charm: 'zzz_no_such_charm', x: 3, y: 3 },
          { type: 'npc', x: 6, y: 6, dialogue: { lines: [] } }
        ],
        graph: {
          nodes: [{ id: 1, type: 'onSignal', x: 0, y: 0, p: { name: 'zzz_ghost_sig' } },
                  { id: 2, type: 'signal', x: 0, y: 0, p: { name: 'zzz_lonely_sig' } }],
          links: [{ from: 99, fp: 0, to: 1, tp: 0 }]
        }
      };
      G.LEVELS['LINT_TEST_EMPTY'] = { title: '', w: 8, h: 4, tiles: ['        ', '        ', '        ', '        '], spawns: {}, transitions: [], props: [], enemies: [] };

      const res = MT.run();
      const has = (rule, lvl) => res.issues.some(it => it.ruleId === rule && (lvl === undefined || it.id === lvl));
      out.exitMissing = has('exit-missing', 'LINT_TEST_A');
      out.refEnemy = has('ref-enemy', 'LINT_TEST_A');
      out.refCharm = has('ref-charm', 'LINT_TEST_A');
      out.danglingLink = has('logic-link-dangling', 'LINT_TEST_A');
      out.npcNoDialogue = has('npc-no-dialogue', 'LINT_TEST_A');
      out.signalUnsent = res.issues.some(it => it.ruleId === 'signal-unsent' && /zzz_ghost_sig/.test(it.msg));
      out.signalUnheard = res.issues.some(it => it.ruleId === 'signal-unheard' && /zzz_lonely_sig/.test(it.msg));
      out.roomEmpty = has('room-empty', 'LINT_TEST_EMPTY');
      out.roomUntitled = has('room-untitled', 'LINT_TEST_EMPTY');
      out.severitiesPresent = res.counts.error > 0 && res.counts.warn > 0 && res.counts.info > 0;

      out.opened = T.openTool('lint');
      T.closeTool();

      // ---- restore the world ----
      delete G.LEVELS['LINT_TEST_A'];
      delete G.LEVELS['LINT_TEST_EMPTY'];
      const after = MT.run();
      out.cleaned = !after.issues.some(it => /LINT_TEST/.test(it.id || '') || /zzz_/.test(it.msg));
      return out;
    });

    console.log('LINT-TOOL:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['registered', 'inPalette', 'roadmap', 'engineApi', 'ruleCount', 'cats', 'realRunOk', 'exitMissing', 'refEnemy', 'refCharm', 'danglingLink', 'npcNoDialogue', 'signalUnsent', 'signalUnheard', 'roomEmpty', 'roomUntitled', 'severitiesPresent', 'opened', 'cleaned'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'LINT-TOOL TEST: PASS' : 'LINT-TOOL TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
