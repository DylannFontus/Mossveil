// Verifies the editor's touch input: single-finger placement, two-finger pan,
// and pinch-zoom, by dispatching synthetic touch PointerEvents into the viewport.
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');
const path = require('path');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.resolve(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const server = spawn(process.execPath, [path.join(ROOT, 'tools', 'editor-server.js')], { stdio: 'pipe' });
  await sleep(900);
  const browser = await puppeteer.launch({
    executablePath: EDGE, headless: 'new',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox']
  });
  const log = (...a) => console.log(a.join(' '));
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1194, height: 834, hasTouch: true, deviceScaleFactor: 2 });
    const errs = [];
    page.on('pageerror', e => errs.push('[err] ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push('[con] ' + m.text()); });
    await page.goto('http://localhost:7707/editor/editor.html', { waitUntil: 'load' });
    await sleep(2500);

    // matchMedia coarse should be true under hasTouch (drives the iPad CSS)
    const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
    log('POINTER COARSE (iPad CSS active):', coarse);

    // helper: dispatch a PointerEvent (pointerdown to the viewport, move/up to window)
    const ptr = (type, id, x, y) => page.evaluate((type, id, x, y) => {
      const el = document.getElementById('viewportWrap');
      const ev = new PointerEvent(type, {
        pointerId: id, pointerType: 'touch', clientX: x, clientY: y,
        button: 0, buttons: type === 'pointerup' ? 0 : 1, isPrimary: id === 1,
        bubbles: true, cancelable: true
      });
      (type === 'pointerdown' ? el : window).dispatchEvent(ev);
    }, type, id, x, y);

    const center = await page.evaluate(() => {
      const b = document.getElementById('viewportWrap').getBoundingClientRect();
      return { cx: b.left + b.width / 2, cy: b.top + b.height / 2 };
    });
    const countAll = () => page.evaluate(() => Object.values(G.LEVELS).reduce((a, l) =>
      a + (l.props || []).length + (l.enemies || []).length + (l.transitions || []).length + Object.keys(l.spawns || {}).length, 0));

    // ---- 1. single-finger placement ----
    await page.evaluate(() => { const t = [...document.querySelectorAll('.asset')]; (t.find(x => /bench/i.test(x.textContent)) || t[0]).click(); });
    await sleep(150);
    const before = await countAll();
    await ptr('pointerdown', 1, center.cx, center.cy);
    await ptr('pointerup', 1, center.cx, center.cy);
    await sleep(150);
    const after = await countAll();
    log('PLACE (one finger):', before, '->', after, after === before + 1 ? 'OK' : 'FAIL');

    // ---- 2. two-finger pan ----
    const camX0 = await page.evaluate(() => +G.camera.position.x.toFixed(3));
    await ptr('pointerdown', 1, center.cx - 40, center.cy);
    await ptr('pointerdown', 2, center.cx + 40, center.cy);
    for (let i = 1; i <= 6; i++) { await ptr('pointermove', 1, center.cx - 40 + i * 18, center.cy); await ptr('pointermove', 2, center.cx + 40 + i * 18, center.cy); }
    await ptr('pointerup', 1, center.cx - 40 + 108, center.cy);
    await ptr('pointerup', 2, center.cx + 40 + 108, center.cy);
    await sleep(150);
    const camX1 = await page.evaluate(() => +G.camera.position.x.toFixed(3));
    log('PAN camX:', camX0, '->', camX1, Math.abs(camX1 - camX0) > 0.2 ? 'OK' : 'FAIL');

    // ---- 3. pinch-zoom ----
    const camZ0 = await page.evaluate(() => +G.camera.position.z.toFixed(3));
    await ptr('pointerdown', 1, center.cx - 30, center.cy);
    await ptr('pointerdown', 2, center.cx + 30, center.cy);
    for (let i = 1; i <= 6; i++) { await ptr('pointermove', 1, center.cx - 30 - i * 22, center.cy); await ptr('pointermove', 2, center.cx + 30 + i * 22, center.cy); }
    await ptr('pointerup', 1, center.cx - 30 - 132, center.cy);
    await ptr('pointerup', 2, center.cx + 30 + 132, center.cy);
    await sleep(150);
    const camZ1 = await page.evaluate(() => +G.camera.position.z.toFixed(3));
    log('PINCH camZ:', camZ0, '->', camZ1, camZ1 < camZ0 - 0.2 ? 'OK (zoomed in)' : 'FAIL');

    await page.screenshot({ path: path.join(ROOT, 'shots', 'editor-touch.png') });
    log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
  } finally {
    await browser.close();
    server.kill();
  }
})().catch(e => { console.error('TOUCH TEST FAILED', e); process.exit(1); });
