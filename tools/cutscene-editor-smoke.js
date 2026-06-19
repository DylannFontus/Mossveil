// Editor cutscene-tab smoke: open editor, switch to Scenes, edit + save a cutscene,
// confirm roundtrip, screenshot the panel.
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
  const browser = await puppeteer.launch({
    executablePath: EDGE, headless: 'new',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox']
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1500, height: 860 });
    const errs = [];
    page.on('pageerror', e => errs.push('[editor] ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });
    await page.goto('http://localhost:7707/editor/editor.html', { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2500));

    // switch to Scenes tab
    await page.click('#ltabS');
    await new Promise(r => setTimeout(r, 600));
    const seen = await page.evaluate(() => ({
      cutscenes: Object.keys(G.CUTSCENES || {}),
      current: document.querySelector('.lvlitem.cur') ? document.querySelector('.lvlitem.cur').textContent : null,
      events: (G.CUTSCENES.intro ? G.CUTSCENES.intro.events.length : -1)
    }));
    console.log('SCENES TAB:', JSON.stringify(seen));
    await page.screenshot({ path: path.join(SHOTS, 'editor-scenes.png') });

    // programmatically edit the intro (add a shakePulse) and save both data sets
    const round = await page.evaluate(async () => {
      const before = G.CUTSCENES.intro.events.length;
      G.CUTSCENES.intro.events.push({ t: 5, dur: 0.3, type: 'shakePulse', amp: 0.2 });
      const r1 = await fetch('/api/cutscenes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(G.CUTSCENES) });
      const j1 = await r1.json();
      const back = await (await fetch('/api/cutscenes')).json();
      const after = back.intro.events.length;
      // revert
      G.CUTSCENES.intro.events.pop();
      await fetch('/api/cutscenes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(G.CUTSCENES) });
      return { saved: j1.ok, before, after };
    });
    console.log('CUTSCENE ROUNDTRIP:', JSON.stringify(round));

    // verify the data/cutscenes.js mirror is still valid + restored
    const mirrorOk = fs.readFileSync(path.join(ROOT, 'data', 'cutscenes.js'), 'utf8').includes('G.CUTSCENES');
    console.log('MIRROR OK:', mirrorOk);

    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO ERRORS');
  } finally {
    await browser.close();
    server.kill();
  }
})().catch(e => { console.error('FAILED', e); process.exit(1); });
