// Verifies the on-screen game controls on a touch device: the overlay appears in
// gameplay, the D-pad moves the player, Jump jumps, and Pause pauses.
const puppeteer = require('puppeteer-core');
const path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.resolve(__dirname, '..');
const log = (...a) => console.log(a.join(' '));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE, headless: 'new',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox']
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1180, height: 820, hasTouch: true, deviceScaleFactor: 2 });
    const errs = [];
    page.on('pageerror', e => errs.push('[err] ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push('[con] ' + m.text()); });

    // boot straight into a level (skips menu/intro)
    const url = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/') + '?level=steps&spawn=P';
    await page.goto(url, { waitUntil: 'load' });
    await sleep(2500);

    const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
    const overlay = await page.evaluate(() => !!document.getElementById('touch'));
    const shown = await page.evaluate(() => [...document.querySelectorAll('#touch .b.show')].length);
    log('TOUCH active:', coarse, '· overlay:', overlay, '· visible buttons:', shown, (overlay && shown >= 8) ? 'OK' : 'FAIL');

    // helper: dispatch a pointer event on the button whose text contains `label`
    const ptr = (label, type) => page.evaluate((label, type) => {
      const b = [...document.querySelectorAll('#touch .b')].find(el => el.textContent.includes(label));
      if (!b) return false;
      const r = b.getBoundingClientRect();
      const ev = new PointerEvent(type, { pointerId: 7, pointerType: 'touch', clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0, buttons: type === 'pointerup' ? 0 : 1, isPrimary: true, bubbles: true, cancelable: true });
      b.dispatchEvent(ev);
      return true;
    }, label, type);

    // ---- jump (player is freshly grounded at spawn) ----
    const groundY = await page.evaluate(() => +G.player.body.y.toFixed(2));
    await ptr('JUMP', 'pointerdown');
    let peak = groundY;
    for (let i = 0; i < 10; i++) { await sleep(60); peak = Math.max(peak, await page.evaluate(() => G.player.body.y)); }
    await ptr('JUMP', 'pointerup');
    log('JUMP: y', groundY, '-> peak', peak.toFixed(2), peak > groundY + 0.4 ? 'OK' : 'FAIL');
    await sleep(900);   // let the player land before moving

    // ---- move right with the D-pad (slow under headless, so hold longer) ----
    const x0 = await page.evaluate(() => +G.player.body.x.toFixed(2));
    await ptr('▶', 'pointerdown');
    await sleep(1600);
    const xMid = await page.evaluate(() => +G.player.body.x.toFixed(2));
    await ptr('▶', 'pointerup');
    log('MOVE RIGHT: x', x0, '->', xMid, xMid > x0 + 0.2 ? 'OK' : 'FAIL');

    // releasing should stop horizontal drive (axis back to 0)
    await sleep(200);
    const axis = await page.evaluate(() => G.Input.axisX());
    log('RELEASE stops input: axisX =', axis, axis === 0 ? 'OK' : 'FAIL');

    // ---- pause ----
    await ptr('⏸', 'pointerdown'); await ptr('⏸', 'pointerup');
    await sleep(500);
    const paused = await page.evaluate(() => G.Main.state);
    log('PAUSE: state =', paused, paused === 'pause' ? 'OK' : 'FAIL');
    // unpause
    await ptr('⏸', 'pointerdown'); await ptr('⏸', 'pointerup');
    await sleep(500);
    const resumed = await page.evaluate(() => G.Main.state);
    log('UNPAUSE: state =', resumed, resumed === 'play' ? 'OK' : 'FAIL');

    await page.screenshot({ path: path.join(ROOT, 'shots', 'touch-controls.png') });
    log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error('TOUCH CONTROLS TEST FAILED', e); process.exit(1); });
