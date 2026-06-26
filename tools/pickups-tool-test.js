// Pickups & Items audit (roadmap #21): the editor-only tool that scans every level's props for the
// three "found item" pickups (charmPickup / powerup / wings), reports obtainability/coverage (which
// charms & abilities actually have a pickup somewhere) and lints unknown charms / invalid grants /
// duplicate placements. This test swaps G.LEVELS for a synthetic world (restored in finally — the
// committed data files are never touched, never save()d), then drives T.pickups.* and asserts scan
// counts, coverage of a covered charm vs an uncovered one, the lint findings, the inline grant write,
// and that the tool renders. Zero outbound network, no page errors.
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
      const out = {}, T = G.Tools, P = T.pickups;
      out.roadmap = T.roadmapStats().done >= 44;
      out.hooks = !!(P && P.scan && P.coverage && P.lint && P.setGrant && P.grantOptions);

      const charms = (G.Charms && G.Charms.LIST) || [];
      out.haveCharms = charms.length >= 3;
      const cA = charms[0].id, cB = charms[1].id, cC = charms[2].id;

      const orig = G.LEVELS;
      try {
        // synthetic world — NO vendor, so charms without a pickup are unobtainable
        G.LEVELS = {
          __pktest: {
            title: 'PK Test', biome: orig[Object.keys(orig)[0]].biome, w: 40, h: 20, props: [
              { type: 'charmPickup', charm: cA, x: 1, y: 1 },          // 0  valid charm
              { type: 'charmPickup', charm: 'no_such_charm', x: 2, y: 1 }, // 1  unknown charm
              { type: 'charmPickup', charm: cA, x: 3, y: 1 },          // 2  duplicate of cA
              { type: 'powerup', grant: 'wings', x: 4, y: 1 },         // 3  valid ability
              { type: 'powerup', grant: 'charm:' + cB, x: 5, y: 1 },   // 4  grants charm B
              { type: 'powerup', grant: 'bogus', x: 6, y: 1 },         // 5  invalid grant
              { type: 'wings', x: 7, y: 1 }                            // 6  the moth-wings prop
            ]
          }
        };

        const sc = P.scan();
        out.scan7 = sc.length === 7;
        out.types = sc.filter(s => s.type === 'charmPickup').length === 3 && sc.filter(s => s.type === 'powerup').length === 3 && sc.filter(s => s.type === 'wings').length === 1;

        const cov = P.coverage();
        const covA = cov.charms.find(c => c.id === cA), covB = cov.charms.find(c => c.id === cB), covC = cov.charms.find(c => c.id === cC);
        out.coverA = !!covA && covA.ok && covA.sources.length === 2;     // two charmPickups for cA
        out.coverB = !!covB && covB.ok && covB.sources.length === 1;     // powerup charm:cB
        out.coverC = !!covC && !covC.ok && covC.sources.length === 0;    // no source, no vendor
        const covWings = cov.abilities.find(a => a.id === 'wings');
        out.coverWings = !!covWings && covWings.ok && covWings.sources.length >= 2; // wings prop + powerup wings
        const covScream = cov.abilities.find(a => a.id === 'scream');
        out.coverScream = !!covScream && covScream.ok && covScream.sources.length === 0 && covScream.tree; // none, but via spell well → ok

        const li = P.lint();
        out.lintUnknown = li.some(i => i.kind === 'unknown-charm' && i.idx === 1);
        out.lintInvalid = li.some(i => i.kind === 'invalid-grant' && i.idx === 5);
        out.lintDup = li.some(i => i.kind === 'dup-charm');
        out.lintUnobtainable = li.some(i => i.kind === 'unobtainable-charm');

        // inline write: retarget the wings power-up (idx 3) to 'scream'
        out.setOk = P.setGrant('__pktest', 3, 'scream') && G.LEVELS.__pktest.props[3].grant === 'scream';
        out.setReflected = P.scan().find(s => s.idx === 3).g.value === 'scream';
        out.setBad = P.setGrant('__pktest', 6, 'x') === false; // wings prop has no editable grant

        // tool renders rows for the synthetic world
        P.openInTool();
        out.dom = !!Array.from(document.querySelectorAll('td')).find(td => /Power-up/.test(td.textContent));
        T.closeTool();
      } finally { G.LEVELS = orig; }
      return out;
    });

    console.log('PICKUPS:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['roadmap', 'hooks', 'haveCharms', 'scan7', 'types', 'coverA', 'coverB', 'coverC', 'coverWings', 'coverScream', 'lintUnknown', 'lintInvalid', 'lintDup', 'lintUnobtainable', 'setOk', 'setReflected', 'setBad', 'dom'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'PICKUPS TEST: PASS' : 'PICKUPS TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
