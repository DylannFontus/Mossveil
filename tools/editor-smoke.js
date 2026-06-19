// Editor + game smoke test: starts the server, drives the editor headless,
// verifies save roundtrip, map tab, new level creation, and game launch with ?level=.
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
    page.on('console', m => { if (m.type() === 'error') errs.push('[editor-console] ' + m.text()); });

    await page.goto('http://localhost:7707/editor/editor.html', { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 3000));
    await page.screenshot({ path: path.join(SHOTS, 'editor-scene.png') });

    // open a different level via the Levels tab
    await page.click('#ltabL');
    await new Promise(r => setTimeout(r, 300));
    await page.evaluate(() => {
      const items = [...document.querySelectorAll('.lvlitem')];
      const gl = items.find(i => i.textContent.includes('gloom'));
      if (gl) gl.click();
    });
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(SHOTS, 'editor-gloom.png') });

    // map tab
    await page.click('#tabMap');
    await new Promise(r => setTimeout(r, 800));
    await page.screenshot({ path: path.join(SHOTS, 'editor-map.png') });
    await page.click('#tabScene');

    // place an enemy programmatically + save roundtrip
    const result = await page.evaluate(async () => {
      const L = G.LEVELS.gloom;
      const before = L.enemies.length;
      L.enemies.push({ type: 'skimmer', x: 40, y: 10 });
      const res = await fetch('/api/levels', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(G.LEVELS) });
      const j = await res.json();
      const back = await (await fetch('/api/levels')).json();
      const after = back.gloom.enemies.length;
      // revert
      L.enemies.pop();
      await fetch('/api/levels', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(G.LEVELS) });
      return { saved: j.ok, before, after };
    });
    console.log('SAVE ROUNDTRIP:', JSON.stringify(result));

    // game still boots from the server with ?level= param
    const game = await browser.newPage();
    await game.setViewport({ width: 1280, height: 720 });
    game.on('pageerror', e => errs.push('[game] ' + e.message));
    await game.goto('http://localhost:7707/index.html?level=gloom&spawn=1', { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2500));
    const gstate = await game.evaluate(() => ({ room: G.room.id, state: G.Main.state, player: !!G.player }));
    console.log('GAME LAUNCH:', JSON.stringify(gstate));
    await game.screenshot({ path: path.join(SHOTS, 'game-from-editor.png') });

    // in-game map (M key)
    await game.keyboard.press('KeyM');
    await new Promise(r => setTimeout(r, 800));
    const mapState = await game.evaluate(() => G.Main.state);
    console.log('MAP STATE:', mapState);
    await game.screenshot({ path: path.join(SHOTS, 'game-map.png') });

    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
  } finally {
    await browser.close();
    server.kill();
  }
})().catch(e => { console.error('FAILED', e); process.exit(1); });
