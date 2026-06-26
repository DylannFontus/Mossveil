// Dialogue graph editor (Edit ▸ Narrative, roadmap #22): visual node-graph over the inline
// prop.dialogue.lines[] that lives in level data. Verifies flow-edge computation, reachability,
// goto-remap on delete, choice authoring, and that the tool registers + is offline. Edits an
// in-memory NPC only (never save()s level data / never touches data files).
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
      const T = G.Tools, MT = T.dialogue, out = {};
      out.registered = T._test.toolIds().includes('dialogue');
      out.inPalette = T._test.paletteSearch('dialogue').some(l => /dialogue/i.test(l));
      out.roadmap = T.roadmapStats().done >= 28;

      // inject a synthetic NPC with a branching dialogue into the first level (in memory only)
      const lid = Object.keys(G.LEVELS)[0];
      const lvl = G.LEVELS[lid]; lvl.props = lvl.props || [];
      const idx = lvl.props.push({
        type: 'npc', name: 'Tester', x: 0, y: 0, dialogue: {
          lines: [
            { speaker: 'A', text: 'hi', choices: [{ label: 'yes', goto: 1 }, { label: 'no', goto: 2 }] },
            { speaker: 'A', text: 'good' },          // falls through to #2
            { speaker: 'A', text: 'bye', end: true },
            { speaker: 'A', text: 'orphan' }         // unreachable from #0
          ]
        }
      }) - 1;

      out.npcFound = MT.npcs().some(n => n.levelId === lid && n.idx === idx && n.name === 'Tester');
      out.opened = MT.editNPC(lid, idx);

      // edge model mirrors the runtime
      const E = MT.edges();
      const has = (f, t, k) => E.some(e => e.from === f && e.to === t && e.kind === k);
      out.edgeChoice = has(0, 1, 'choice') && has(0, 2, 'choice');
      out.edgeFlow = has(1, 2, 'flow');               // #1 has no choices/end/goto -> falls to #2
      out.edgeEnd = has(2, 'end', 'end');             // #2 end:true -> END sink
      out.edgeOrphanEnd = has(3, 'end', 'flow');      // #3 is last -> ends
      const reach = MT.reachable();
      out.reachable = reach.includes(0) && reach.includes(1) && reach.includes(2) && !reach.includes(3);

      // goto remap on delete: removing #1 must keep choice targets pointing at the same logical lines
      MT.removeLine(1);                                // lines become [old0, old2, old3]
      const ln0 = MT.lines()[0];
      out.remapEnd = ln0.choices[0].goto === -1;       // 'yes' pointed at #1 (now gone) -> end
      out.remap = ln0.choices[1].goto === 1;           // 'no' pointed at #2 -> now #1
      out.lenAfterDelete = MT.lines().length === 3;

      // authoring: add a line, add a choice to it, retarget, set end
      const ni = MT.addLine();                         // new line index
      MT.setText(ni, 'fresh');
      out.added = MT.lines()[ni].text === 'fresh';
      const ci = MT.addChoice(ni);
      MT.setChoice(ni, ci, 'goto', '0');
      out.choiceAdded = MT.lines()[ni].choices[ci].goto === 0;
      // a line with choices emits choice edges, not a fall-through
      const E2 = MT.edges();
      out.noFallWithChoice = !E2.some(e => e.from === ni && e.kind === 'flow') && E2.some(e => e.from === ni && e.to === 0 && e.kind === 'choice');
      // setEnd on a choice-less line emits an END edge; (a line WITH choices ignores end, by design)
      MT.setEnd(2, true);
      out.endSet = MT.lines()[2].end === true && MT.edges().some(e => e.from === 2 && e.to === 'end' && e.kind === 'end');
      out.endIgnoredWithChoices = (function () { MT.setEnd(0, true); const r = !MT.edges().some(e => e.from === 0 && e.kind === 'end'); MT.setEnd(0, false); return r; })();

      // setGoto on a plain line (#1 currently has end, no choices) -> drives a goto edge
      MT.setEnd(1, false); MT.setGoto(1, 'end');
      out.gotoEnd = MT.lines()[1].goto === -1;
      MT.setGoto(1, null);
      out.gotoAuto = MT.lines()[1].goto === undefined;

      T.closeTool();
      return out;
    });

    console.log('DIALOGUE-TOOL:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = o.registered && o.inPalette && o.roadmap && o.npcFound && o.opened
      && o.edgeChoice && o.edgeFlow && o.edgeEnd && o.edgeOrphanEnd && o.reachable
      && o.remapEnd && o.remap && o.lenAfterDelete && o.added && o.choiceAdded
      && o.noFallWithChoice && o.endSet && o.endIgnoredWithChoices && o.gotoEnd && o.gotoAuto
      && netHits === 0 && !errs.length;
    console.log(ok ? 'DIALOGUE-TOOL TEST: PASS' : 'DIALOGUE-TOOL TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
