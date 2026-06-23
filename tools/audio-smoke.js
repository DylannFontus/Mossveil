// Smoke test for the audio overhaul: starts the audio graph via a real gesture, then
// exercises adaptive intensity, reverb swap, positional sfx and surface footsteps.
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');
const path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.resolve(__dirname, '..');

(async () => {
  const server = spawn(process.execPath, [path.join(ROOT, 'tools', 'editor-server.js')], { stdio: 'pipe' });
  await new Promise(r => setTimeout(r, 800));
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const errs = [];
  try {
    const game = await browser.newPage();
    await game.setViewport({ width: 1100, height: 680 });
    game.on('pageerror', e => errs.push('[game] ' + e.message));
    game.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });
    await game.goto('http://localhost:7707/index.html?level=gloom&spawn=1', { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2200));
    // a real key press counts as the gesture that boots the AudioContext
    await game.bringToFront();
    await game.keyboard.down('ArrowRight'); await new Promise(r => setTimeout(r, 500)); await game.keyboard.up('ArrowRight');
    await new Promise(r => setTimeout(r, 300));

    const out = await game.evaluate(() => {
      const A = G.Audio, o = { started: A.started };
      const call = (f) => { try { f(); return true; } catch (e) { return String(e); } };
      o.api = ['setIntensity', 'setMusicState', 'setReverb', 'sfxAt', 'footstep'].every(k => typeof A[k] === 'function');
      o.setIntensity = call(() => A.setIntensity(0.8));
      o.setMusicState = call(() => { A.setMusicState('combat'); A.setMusicState('boss'); A.setMusicState('calm'); });
      o.setReverb = call(() => A.setReverb(0.5, 3.2, 2.8));
      o.footsteps = call(() => ['wood', 'grass', 'stone', 'metal', 'water'].forEach(s => A.footstep(s, G.player.body.x + 2, G.player.body.y)));
      o.sfxAt = call(() => A.sfxAt('hit', G.player.body.x + 8, G.player.body.y));
      o.tick = call(() => { for (let i = 0; i < 30; i++) A.update(0.016); });
      o.surfaceAt = typeof G.World.surfaceAt === 'function' ? G.World.surfaceAt(G.player.body.x, G.player.body.y - 1) : 'MISSING';
      return o;
    });
    console.log('RESULT:', JSON.stringify(out, null, 2));
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = out.api && out.setIntensity === true && out.setMusicState === true && out.setReverb === true
      && out.footsteps === true && out.sfxAt === true && out.tick === true
      && typeof out.surfaceAt === 'string' && out.surfaceAt !== 'MISSING' && !errs.length;
    console.log(ok ? 'AUDIO SMOKE: PASS' : 'AUDIO SMOKE: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
