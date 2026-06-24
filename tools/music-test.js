// Composed soundtrack: many tracks, style switch, crossfade track-change, aggressive combat,
// state-silencing (prologue/cutscene), and the editor lists all tracks.
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
      const A = G.Audio, o = {};
      const call = f => { try { f(); return true; } catch (e) { return String(e); } };
      o.tracks = A.musicTracks ? A.musicTracks().length : 0;
      o.hasUpbeat = A.musicTracks().includes('radiant'); o.hasDark = A.musicTracks().includes('void');
      o.crossfade = call(() => { A.setMusicTrack('radiant'); A.setMusicTrack('void'); });
      o.aggressive = call(() => { A.setIntensity(0.95); for (let i = 0; i < 120; i++) A.update(0.04); });
      o.silenceProl = call(() => { A.musicForState('prologue'); for (let i = 0; i < 20; i++) A.update(0.04); });
      o.resumePlay = call(() => { A.musicForState('play'); for (let i = 0; i < 20; i++) A.update(0.04); });
      o.classicSwitch = call(() => { A.setMusicStyle('classic'); for (let i = 0; i < 20; i++) A.update(0.04); A.setMusicStyle('score'); });
      return o;
    });

    // boss fight (async — biome full-stops, the boss theme drives in, then the biome returns):
    await game.evaluate(() => { const A = G.Audio; A.setIntensity(0); A.setMusicStyle('score'); A.setMusicTrack('gloom'); A.musicForState('play'); });
    await wait(500);
    o.playingPreBoss = await game.evaluate(() => G.Music.playing() && G.Music.current() !== 'boss');
    await game.evaluate(() => G.Audio.setBoss(true));
    await wait(250);                                  // dramatic full-stop before the boss theme
    o.stoppedOnBoss = await game.evaluate(() => G.Music.playing() === false);
    await wait(900);                                  // boss theme drives in (~850ms)
    const bt = await game.evaluate(() => ({ p: G.Music.playing(), t: G.Music.current() }));
    o.bossTheme = bt.p === true && bt.t === 'boss';
    await game.evaluate(() => G.Audio.setBoss(false));
    await wait(800);                                  // boss fades out, biome fades back in
    const ab = await game.evaluate(() => ({ p: G.Music.playing(), t: G.Music.current() }));
    o.resumedAfterBoss = ab.p === true && ab.t !== 'boss';

    // editor lists the tracks in the per-level Music dropdown
    const ed = await browser.newPage();
    ed.on('pageerror', e => errs.push('[editor] ' + e.message));
    await ed.goto('http://localhost:7707/editor/editor.html', { waitUntil: 'load' });
    await wait(2800);
    const edTracks = await ed.evaluate(() => (G.Audio && G.Audio.musicTracks) ? G.Audio.musicTracks().length : -1);

    console.log('GAME:', JSON.stringify(o), ' EDITOR tracks:', edTracks);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = o.tracks >= 20 && o.hasUpbeat && o.hasDark && o.crossfade === true && o.aggressive === true
      && o.silenceProl === true && o.resumePlay === true && o.playingPreBoss && o.stoppedOnBoss && o.bossTheme && o.resumedAfterBoss
      && o.classicSwitch === true && edTracks >= 20 && !errs.length;
    console.log(ok ? 'MUSIC TEST: PASS' : 'MUSIC TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
