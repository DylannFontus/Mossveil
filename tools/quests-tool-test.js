// Quest editor (Edit ▸ Narrative, roadmap #23): central quest registry (data/quests.js ->
// G.QUESTS_DATA) merged into quests at start, plus a dialogue-usage scan + lint. Verifies the
// runtime merge (registry is canonical, empty registry is byte-identical), done-flag auto-complete,
// the scanner/lint, and the editor ops. Edits an in-memory NPC + the in-memory registry only
// (never save()s the registry file / level data).
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
      const T = G.Tools, MT = T.quests, out = {};
      out.registered = T._test.toolIds().includes('quests');
      out.inPalette = T._test.paletteSearch('quest').some(l => /quest/i.test(l));
      out.roadmap = T.roadmapStats().done >= 30;
      out.engine = !!(G.Quests && G.Quests.applyData && G.Quests.exportCurrent);

      // ---- inject an NPC whose dialogue starts + completes a quest, and sets a flag ----
      const lid = Object.keys(G.LEVELS)[0];
      const lvl = G.LEVELS[lid]; lvl.props = lvl.props || [];
      const idx = lvl.props.push({
        type: 'npc', name: 'Hermit', x: 0, y: 0, dialogue: {
          lines: [{
            speaker: 'Hermit', text: '?', choices: [
              { label: 'accept', goto: -1, quest: { id: 'find-relic', title: 'Find the Relic', objective: 'Seek the shard' } },
              { label: 'deliver', goto: -1, completeQuest: 'find-relic' },
              { label: 'pull', goto: -1, flag: 'relicFlag' }
            ]
          }]
        }
      }) - 1;

      MT.load();   // re-scan + reload registry (currently empty)
      const all = MT.quests();
      const fr = all.find(q => q.id === 'find-relic');
      out.scanFound = !!fr && fr.started && fr.completed;
      out.inlineFlag = !!fr && !fr.registered;      // defined inline, not yet in the registry
      out.lintClean = !!fr && fr.lint.length === 0; // has both a start and a completion

      // a registry-only quest with no dialogue start should lint as unobtainable
      const lone = MT.addQuest('lonely');
      out.lintBad = MT.lint(lone).some(w => w.kind === 'bad');

      // editing an inline quest registers it; the registry then has it
      MT.setField('find-relic', 'objective', 'Recover the moss-shard');
      out.registeredNow = MT.list().some(q => q.id === 'find-relic' && q.objective === 'Recover the moss-shard');
      out.rename = MT.rename('lonely', 'lonely2') && MT.list().some(q => q.id === 'lonely2');
      out.removed = MT.removeQuest('lonely2') && !MT.list().some(q => q.id === 'lonely2');

      // applyToEngine pushes the registry into the runtime
      MT.applyToEngine();
      out.appliedToEngine = (G.Quests.exportCurrent().list || []).some(q => q.id === 'find-relic');

      // ---- runtime: registry is canonical; merges into a started quest ----
      G.save = { quests: {}, flags: {} };
      G.Quests.applyData({ list: [{ id: 'q1', title: 'Reg Title', objective: 'Reg Obj', doneFlag: 'flagX' }] });
      G.Quests.start({ id: 'q1', title: 'Inline Title' });       // registry overrides the inline title
      const s1 = G.save.quests.q1;
      out.mergeTitle = s1.title === 'Reg Title' && s1.objective === 'Reg Obj' && s1.doneFlag === 'flagX';
      delete G.save.quests.q1; G.Quests.start('q1');             // string id pulls the registry def too
      out.mergeString = G.save.quests.q1.title === 'Reg Title';

      // ---- empty registry: behaviour identical to before ----
      G.Quests.applyData({ list: [] });
      G.save.quests = {}; G.Quests.start({ id: 'q2', title: 'Plain' });
      out.plainObj = G.save.quests.q2.title === 'Plain';
      G.save.quests = {}; G.Quests.start('q3');
      out.plainString = G.save.quests.q3.title === 'q3';         // string fallback title = id

      // ---- done-flag auto-completes via update() ----
      G.Quests.applyData({ list: [{ id: 'q4', title: 'Q4', doneFlag: 'f4' }] });
      G.save.quests = {}; G.save.flags = {}; G.Quests.start('q4');
      out.activeBefore = G.save.quests.q4.state === 'active' && G.save.quests.q4.doneFlag === 'f4';
      G.save.flags.f4 = true; G.Quests.update();
      out.autoComplete = G.save.quests.q4.state === 'done';

      T.closeTool();
      return out;
    });

    console.log('QUESTS-TOOL:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['registered', 'inPalette', 'roadmap', 'engine', 'scanFound', 'inlineFlag', 'lintClean', 'lintBad',
      'registeredNow', 'rename', 'removed', 'appliedToEngine', 'mergeTitle', 'mergeString', 'plainObj', 'plainString', 'activeBefore', 'autoComplete'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'QUESTS-TOOL TEST: PASS' : 'QUESTS-TOOL TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
