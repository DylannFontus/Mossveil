const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');
const path = require('path'); const fs = require('fs');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.resolve(__dirname, '..'), SHOTS = path.join(ROOT, 'shots');
(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const server = spawn(process.execPath, [path.join(ROOT, 'tools', 'editor-server.js')], { stdio: 'pipe' });
  await new Promise(r => setTimeout(r, 800));
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  try {
    const page = await browser.newPage(); await page.setViewport({ width: 1500, height: 860 });
    await page.goto('http://localhost:7707/editor/editor.html', { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 3000));
    await page.evaluate(() => {
      const E = G.__ed; E.setTab('models'); const doc = E.modelDoc(); doc.name = 'humanoid'; doc.clips = {};
      doc.parts = [
        { id: 1, shape: 'box', parent: null, x: 0, y: 2, z: 0, sx: 1, sy: 1.4, sz: 0.6, color: '#9aa' },
        { id: 2, shape: 'sphere', parent: null, x: 0, y: 3.2, z: 0, sx: 0.7, sy: 0.7, sz: 0.7, color: '#d8c0a0' },
        { id: 3, shape: 'capsule', parent: null, x: -0.85, y: 2.1, z: 0, sx: 0.5, sy: 1, sz: 0.5, color: '#88a' },
        { id: 4, shape: 'capsule', parent: null, x: 0.85, y: 2.1, z: 0, sx: 0.5, sy: 1, sz: 0.5, color: '#88a' },
        { id: 5, shape: 'capsule', parent: null, x: -0.3, y: 0.6, z: 0, sx: 0.55, sy: 1.1, sz: 0.55, color: '#586' },
        { id: 6, shape: 'capsule', parent: null, x: 0.3, y: 0.6, z: 0, sx: 0.55, sy: 1.1, sz: 0.55, color: '#586' }
      ].map(p => Object.assign({ rx: 0, ry: 0, rz: 0, ox: 0, oy: 0, oz: 0, name: p.shape }, p));
      E.modelRebuild(); E.modelAutoRig(); E.modelSetClip('walk'); E.modelSyncPose(0.2);
    });
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: path.join(SHOTS, 'autorig.png') });
    console.log('shot saved');
  } finally { await browser.close(); server.kill(); }
})();
