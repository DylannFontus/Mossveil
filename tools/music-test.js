// Composed soundtrack: the Score engine starts + schedules, Score/Classic switch, per-track
// selection, and intensity/boss all run without error.
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
    await wait(300);

    const o = await game.evaluate(() => {
      const A = G.Audio, o = { started: A.started, hasMusic: !!(G.Music && G.Music.start) };
      const call = f => { try { f(); return true; } catch (e) { return String(e); } };
      o.tracks = (A.musicTracks ? A.musicTracks().length : 0);
      o.style0 = A.musicStyle ? A.musicStyle() : '?';
      o.setTrack = call(() => A.setMusicTrack('forge'));
      o.runScore = call(() => { A.setIntensity(0.7); for (let i = 0; i < 60; i++) A.update(0.05); });
      o.toClassic = call(() => A.setMusicStyle('classic'));
      o.runClassic = call(() => { for (let i = 0; i < 40; i++) A.update(0.05); });
      o.toScore = call(() => A.setMusicStyle('score'));
      o.autoTrack = call(() => A.setMusicTrack('auto', 'city'));
      o.boss = call(() => { A.setBoss(true); for (let i = 0; i < 30; i++) A.update(0.05); A.setBoss(false); });
      o.styleNow = A.musicStyle();
      return o;
    });
    console.log('RESULT:', JSON.stringify(o));
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = o.hasMusic && o.tracks >= 5 && o.style0 === 'score' && o.setTrack === true && o.runScore === true
      && o.toClassic === true && o.runClassic === true && o.toScore === true && o.autoTrack === true
      && o.boss === true && o.styleNow === 'score' && !errs.length;
    console.log(ok ? 'MUSIC TEST: PASS' : 'MUSIC TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
