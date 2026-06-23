// Visual check for the reworked slash crescent: fire slashes and grab frames mid-sweep.
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
    const game = await browser.newPage();
    await game.setViewport({ width: 1100, height: 680 });
    game.on('pageerror', e => errs.push('[game] ' + e.message));
    await game.goto('http://localhost:7707/index.html?level=gloom&spawn=1', { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2500));
    // freeze the player roughly centre-screen and fire a side slash; snap a couple of early frames
    for (const [name, ang, flip, delay] of [['slash-side', 0, false, 45], ['slash-up', Math.PI / 2, true, 55]]) {
      await game.evaluate((a, fl) => {
        const p = G.player; G.FX.slash(p.body.x + (a === 0 ? 1.1 : 0), p.body.y + (a === 0 ? 0.2 : 1.2), a, false, 0xeef6ff, fl);
      }, ang, flip);
      await new Promise(r => setTimeout(r, delay));
      await game.screenshot({ path: path.join(SHOTS, name + '.png') });
      await new Promise(r => setTimeout(r, 250));
    }
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
