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
    const game = await browser.newPage(); await game.setViewport({ width: 1100, height: 680 });
    await game.goto('http://localhost:7707/index.html?level=gloom&spawn=1', { waitUntil: 'load' });
    await wait(2300);
    await game.evaluate(() => { G.Main.state = 'controls'; G.Main.ctrlIndex = 5; G.Main.ctrlListening = false; });
    await wait(250);
    await game.screenshot({ path: path.join(SHOTS, 'controls.png') });
    // and the "press a key" listening state
    await game.evaluate(() => { G.Main.ctrlIndex = 5; G.Main.ctrlListening = true; });
    await wait(250);
    await game.screenshot({ path: path.join(SHOTS, 'controls-listening.png') });
    console.log('shots saved');
  } finally { await browser.close(); server.kill(); }
})();
