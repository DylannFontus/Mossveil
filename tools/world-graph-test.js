// World graph + expanded lint: reachability BFS, missing-exit detection, map overlay.
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, 'shots');

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
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
      const o = {}, E = G.__ed;
      const v = E.validateWorld();
      o.hasReachable = !!v.reachable; o.startId = v.startId;
      o.reachCount = Object.keys(v.reachable || {}).length;
      // inject a broken exit -> should flag a missing-level error
      const first = Object.keys(G.LEVELS)[0];
      G.LEVELS[first].transitions = G.LEVELS[first].transitions || [];
      G.LEVELS[first].transitions.push({ rect: { x: 1, y: 1, w: 1, h: 1 }, to: 'NOPE_MISSING', spawn: 'P' });
      const v2 = E.validateWorld();
      o.flaggedMissing = v2.warns.some(w => /missing level/.test(w.msg) && w.sev === 'error');
      G.LEVELS[first].transitions.pop();   // revert
      return o;
    });
    await page.evaluate(() => G.__ed.setTab('map'));
    await new Promise(r => setTimeout(r, 1200));
    await page.screenshot({ path: path.join(SHOTS, 'world-graph.png') });

    console.log('RESULT:', JSON.stringify(out));
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = out.hasReachable && out.startId && out.reachCount >= 1 && out.flaggedMissing && !errs.length;
    console.log(ok ? 'WORLD GRAPH TEST: PASS' : 'WORLD GRAPH TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
