// Nested prefabs (recursive expansion, cycle-guarded) + hot-reload button presence.
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');
const path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.resolve(__dirname, '..');

(async () => {
  const server = spawn(process.execPath, [path.join(ROOT, 'tools', 'editor-server.js')], { stdio: 'pipe' });
  await new Promise(r => setTimeout(r, 800));
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const errs = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1500, height: 860 });
    page.on('pageerror', e => errs.push('[editor] ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });
    await page.goto('http://localhost:7707/editor/editor.html', { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 3000));

    const out = await page.evaluate(() => {
      const o = {}, E = G.__ed, L = G.LEVELS[E.currentId()];
      L.props = L.props || [];
      // prefab A (one prop)
      L.props.push({ type: 'light', x: 10, y: 10 });
      E.setMulti([]); E.setSel({ kind: 'prop', i: L.props.length - 1 }); E.savePrefabAs('A');
      // prefab B (one prop)
      L.props.push({ type: 'light', x: 20, y: 20 });
      E.setMulti([]); E.setSel({ kind: 'prop', i: L.props.length - 1 }); E.savePrefabAs('B');

      o.nested = E.nestPrefab('A', 'B', 2, 0);     // embed B inside A
      o.selfNestBlocked = (E.nestPrefab('A', 'A') === false);

      // stamping A should place A's prop AND the nested B's prop = 2
      const before = L.props.length;
      E.stampPrefab('A', 40, 40);
      o.stampedTwo = (L.props.length - before) === 2;

      // make a cycle (A↔B) and confirm stamping still terminates (no hang)
      E.nestPrefab('B', 'A', 2, 0);
      const b2 = L.props.length;
      E.stampPrefab('A', 60, 60);
      o.cycleTerminates = (L.props.length - b2) >= 2 && (L.props.length - b2) < 50;

      // hot-reload affordance
      o.reloadBtn = !!document.getElementById('playReload');
      o.playUrl = /level=/.test(E.playUrl());
      return o;
    });
    console.log('RESULT:', JSON.stringify(out));
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = out.nested && out.selfNestBlocked && out.stampedTwo && out.cycleTerminates && out.reloadBtn && out.playUrl && !errs.length;
    console.log(ok ? 'PREFAB NEST / HOT-RELOAD TEST: PASS' : 'PREFAB NEST / HOT-RELOAD TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
