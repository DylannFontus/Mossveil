// Music stingers fire without error once the audio graph is live.
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');
const path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.resolve(__dirname, '..');
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const server = spawn(process.execPath, [path.join(ROOT, 'tools', 'editor-server.js')], { stdio: 'pipe' });
  await wait(800);
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const errs = [];
  try {
    const game = await browser.newPage();
    await game.setViewport({ width: 900, height: 560 });
    game.on('pageerror', e => errs.push('[game] ' + e.message));
    game.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });
    await game.goto('http://localhost:7707/index.html?level=gloom&spawn=1', { waitUntil: 'load' });
    await wait(2200);
    await game.bringToFront();
    await game.keyboard.down('ArrowRight'); await wait(400); await game.keyboard.up('ArrowRight');
    await wait(200);

    const o = await game.evaluate(() => {
      const A = G.Audio, o = { started: A.started, has: typeof A.stinger === 'function' };
      const call = f => { try { f(); return true; } catch (e) { return String(e); } };
      o.boss = call(() => A.stinger('boss'));
      o.item = call(() => A.stinger('item'));
      o.secret = call(() => A.stinger('secret'));
      o.tick = call(() => { for (let i = 0; i < 20; i++) A.update(0.05); });
      return o;
    });
    console.log('RESULT:', JSON.stringify(o));
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = o.has && o.boss === true && o.item === true && o.secret === true && o.tick === true && !errs.length;
    console.log(ok ? 'STINGER TEST: PASS' : 'STINGER TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
