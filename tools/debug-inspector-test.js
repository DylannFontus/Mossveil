// In-play debug inspector: F4 toggles, clicking an entity selects it, the overlay draws.
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

    const o = await game.evaluate(() => {
      const o = {};
      o.hasModule = !!(G.Debug && typeof G.Debug.toggle === 'function');
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F4' }));
      o.on = G.Debug.on === true;
      const e = G.Enemies.make('tumblebug', G.player.body.x + 2, G.player.body.y);
      G.room.entities.push(e); if (e.group) G.room.group.add(e.group);
      const s = G.U.toScreen(e.body.x, e.body.y);
      window.dispatchEvent(new PointerEvent('pointerdown', { clientX: s.x, clientY: s.y, bubbles: true }));
      o.selected = G.Debug.sel === e;
      o.drawOk = (() => { try { G.UI.draw(0.016); return true; } catch (err) { return String(err); } })();
      // teleport action
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyT' }));
      o.teleported = Math.abs(e.body.x - G.player.body.x) < 0.01;
      return o;
    });
    await wait(150);
    await game.screenshot({ path: path.join(SHOTS, 'debug-inspector.png') });
    console.log('RESULT:', JSON.stringify(o));
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = o.hasModule && o.on && o.selected && o.drawOk === true && o.teleported && !errs.length;
    console.log(ok ? 'DEBUG INSPECTOR TEST: PASS' : 'DEBUG INSPECTOR TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
