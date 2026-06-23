// Controls remapping: rebind keys, key-capture, new key works / old key dead, reset,
// and bindings persist across a page reload (saved in localStorage).
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');
const path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.resolve(__dirname, '..');
const URL = 'http://localhost:7707/index.html?level=gloom&spawn=1';
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
    await game.goto(URL, { waitUntil: 'load' });
    await wait(2200);

    const o = await game.evaluate(() => {
      const I = G.Input, o = {};
      o.hasBindable = Array.isArray(I.BINDABLE) && I.BINDABLE.length > 8;
      o.jumpLabel = I.bindingLabel('jump');
      I.rebind('jump', 'KeyB');
      o.jumpAfter = I.binding('jump').join(',');
      o.persisted = (JSON.parse(localStorage.getItem('mossveil-keybinds')).jump || []).includes('KeyB');
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB' }));
      o.newKeyWorks = I.down('jump');
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyB' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ' }));
      o.oldKeyDead = !I.down('jump');
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyZ' }));
      let captured = null; I.captureKey(c => captured = c);
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyO' }));
      o.captured = captured;
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyO' }));
      I.resetBindings();
      o.resetJump = I.binding('jump').join(',');
      return o;
    });

    // persistence across reload
    await game.evaluate(() => { G.Input.rebind('dash', 'KeyG'); });
    await game.goto(URL, { waitUntil: 'load' });
    await wait(2000);
    const persistAcrossReload = await game.evaluate(() => G.Input.binding('dash').join(','));
    await game.evaluate(() => { G.Input.resetBindings(); });   // cleanup

    console.log('RESULT:', JSON.stringify(o), ' reloadDash:', persistAcrossReload);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = o.hasBindable && /Z/.test(o.jumpLabel) && o.jumpAfter === 'KeyB' && o.persisted
      && o.newKeyWorks && o.oldKeyDead && o.captured === 'KeyO' && o.resetJump === 'KeyZ,Space,Pad0'
      && persistAcrossReload === 'KeyG' && !errs.length;
    console.log(ok ? 'KEYBIND TEST: PASS' : 'KEYBIND TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
