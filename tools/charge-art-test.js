// Charged nail art: can be aimed up / side; charge accumulates and the art fires aimed.
// (Headless throttles rAF, so we poll until artReady rather than assume a fixed wall-clock.)
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');
const path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.resolve(__dirname, '..');
const wait = ms => new Promise(r => setTimeout(r, ms));

async function chargeUntilReady(game) {
  await game.evaluate(() => { G.Main.state = 'play'; G.Input.virtualDown('attack'); });
  for (let i = 0; i < 50; i++) {                       // up to ~10s of throttled frames
    await wait(200);
    const r = await game.evaluate(() => { G.Input.virtualDown('attack'); return G.player.artReady; });
    if (r) return true;
  }
  return false;
}

(async () => {
  const server = spawn(process.execPath, [path.join(ROOT, 'tools', 'editor-server.js')], { stdio: 'pipe' });
  await wait(800);
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const errs = [];
  try {
    const game = await browser.newPage();
    await game.setViewport({ width: 1100, height: 680 });
    game.on('pageerror', e => errs.push('[game] ' + e.message));
    await game.goto('http://localhost:7707/index.html?level=gloom&spawn=1', { waitUntil: 'load' });
    await wait(2300);
    await game.bringToFront();

    // --- aim UP ---
    const readyUp = await chargeUntilReady(game);
    await game.evaluate(() => { G.Input.virtualDown('up'); G.Input.virtualUp('attack'); });
    await wait(200);
    const up = await game.evaluate(() => ({ isArt: G.player.isArt, dir: G.player.atkDir }));
    await game.evaluate(() => { G.Input.virtualUp('up'); });
    await wait(500);

    // --- aim SIDE (no direction) ---
    const readySide = await chargeUntilReady(game);
    await game.evaluate(() => { G.Input.virtualUp('attack'); });
    await wait(200);
    const side = await game.evaluate(() => ({ isArt: G.player.isArt, dir: G.player.atkDir }));

    console.log('READY up/side:', readyUp, readySide, ' UP:', JSON.stringify(up), ' SIDE:', JSON.stringify(side));
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = readyUp && readySide && up.isArt && up.dir === 'up' && side.isArt && side.dir === 'side' && !errs.length;
    console.log(ok ? 'CHARGE ART TEST: PASS' : 'CHARGE ART TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
