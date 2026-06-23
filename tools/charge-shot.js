const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');
const path = require('path'); const fs = require('fs');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.resolve(__dirname, '..'), SHOTS = path.join(ROOT, 'shots');
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const server = spawn(process.execPath, [path.join(ROOT, 'tools', 'editor-server.js')], { stdio: 'pipe' });
  await wait(800);
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  try {
    const game = await browser.newPage(); await game.setViewport({ width: 900, height: 560 });
    await game.goto('http://localhost:7707/index.html?level=gloom&spawn=1', { waitUntil: 'load' });
    await wait(2300); await game.bringToFront();
    // spawn a steady stream of gathering particles around the player for the shot
    await game.evaluate(() => {
      G.Main.state = 'play';
      const b = G.player.body, U = G.U;
      for (let k = 0; k < 60; k++) {
        const a = U.rand(0, Math.PI * 2), r = U.rand(0.5, 2.1), sp = r / U.rand(0.16, 0.26);
        G.FX.p(true, { x: b.x + Math.cos(a) * r, y: b.y + 0.3 + Math.sin(a) * r, vx: -Math.cos(a) * sp, vy: -Math.sin(a) * sp, life: r / sp, size: U.rand(0.13, 0.24), color: 0xffffff, alpha: 0.95 });
      }
      G.FX.ring(b.x, b.y + 0.3, { r0: 1.05, r1: 1.7, life: 0.6, color: 0xffffff, alpha: 0.85 });
    });
    await wait(60);
    await game.screenshot({ path: path.join(SHOTS, 'charge.png') });
    console.log('shot saved');
  } finally { await browser.close(); server.kill(); }
})();
