// Fancy room transition: an iris closes on the player, loads, and opens on arrival.
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, 'shots');
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const server = spawn(process.execPath, [path.join(ROOT, 'tools', 'editor-server.js')], { stdio: 'pipe' });
  await wait(800);
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const errs = [];
  try {
    const game = await browser.newPage();
    await game.setViewport({ width: 1000, height: 620 });
    game.on('pageerror', e => errs.push('[game] ' + e.message));
    await game.goto('http://localhost:7707/index.html?level=gloom&spawn=1', { waitUntil: 'load' });
    await wait(2300);
    await game.bringToFront();

    const before = await game.evaluate(() => { G.Main.transition(G.room.id, '1'); return { state: G.Main.state, iris: !!(G.UI.draw && true) }; });
    await wait(700);
    await game.screenshot({ path: path.join(SHOTS, 'iris.png') });   // mid-iris (black with a hole)
    let after = { state: '?' };
    for (let i = 0; i < 40; i++) { after = await game.evaluate(() => ({ state: G.Main.state })); if (after.state === 'play') break; await wait(200); }

    console.log('BEFORE:', JSON.stringify(before), ' AFTER:', JSON.stringify(after));
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = before.state === 'transition' && after.state === 'play' && !errs.length;
    console.log(ok ? 'IRIS TEST: PASS' : 'IRIS TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
