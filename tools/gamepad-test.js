// Gamepad support: button edges feed actions, the stick drives movement, rebind captures
// a pad button, glyphs auto-switch Xbox/PS. Drives a mocked Gamepad API.
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');
const path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.resolve(__dirname, '..');
const wait = ms => new Promise(r => setTimeout(r, ms));

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
    await wait(2200);

    const o = await game.evaluate(() => {
      const I = G.Input, o = {};
      const fake = { index: 0, connected: true, id: 'Xbox Wireless Controller', buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] };
      navigator.getGamepads = () => [fake];
      const poll = () => I.pollGamepad();
      I.update();

      fake.buttons[0].pressed = true; poll();          // A -> jump
      o.jumpPressed = I.pressed('jump') && I.down('jump'); I.update();
      poll(); o.jumpHeld = I.down('jump') && !I.pressed('jump'); I.update();
      fake.buttons[0].pressed = false; poll();
      o.jumpReleased = I.released('jump') && !I.down('jump'); I.update();

      fake.axes[0] = -0.9; poll();
      o.stickLeft = I.down('left') && I.axisX() === -1; I.update();
      fake.axes[0] = 0; poll();
      o.stickCenter = !I.down('left') && I.axisX() === 0; I.update();

      let captured = null; I.captureKey(c => captured = c);
      fake.buttons[2].pressed = true; poll();          // X captured for rebind
      o.captured = captured;
      fake.buttons[2].pressed = false; poll(); I.update();

      o.padConnected = I.padConnected();
      o.xboxLabel = I.keyLabel('Pad0');                 // 🎮A
      o.bindHasPad = /🎮/.test(I.bindingLabel('jump'));

      fake.id = 'DualSense Wireless Controller'; fake.index = 1; poll();   // re-detect -> PS
      o.psLabel = I.keyLabel('Pad0');                   // 🎮✕
      return o;
    });
    console.log('RESULT:', JSON.stringify(o));
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = o.jumpPressed && o.jumpHeld && o.jumpReleased && o.stickLeft && o.stickCenter
      && o.captured === 'Pad2' && o.padConnected && o.xboxLabel === '🎮A' && o.bindHasPad && o.psLabel === '🎮✕' && !errs.length;
    console.log(ok ? 'GAMEPAD TEST: PASS' : 'GAMEPAD TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
