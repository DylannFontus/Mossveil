// Audio markers: editor places type:'audio' props; runtime emitter/reverbZone/musicTrigger fire.
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');
const path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.resolve(__dirname, '..');

(async () => {
  const server = spawn(process.execPath, [path.join(ROOT, 'tools', 'editor-server.js')], { stdio: 'pipe' });
  await new Promise(r => setTimeout(r, 800));
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const errs = [];
  try {
    const game = await browser.newPage();
    await game.setViewport({ width: 1100, height: 680 });
    game.on('pageerror', e => errs.push('[game] ' + e.message));
    await game.goto('http://localhost:7707/index.html?level=gloom&spawn=1', { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2200));

    const out = await game.evaluate(() => {
      const o = {}, p = G.player, W = G.World;
      // spy on the audio API
      const calls = { reverb: [], sfxAt: [], music: [] };
      const A = G.Audio;
      A.setReverb = (w, d, c) => calls.reverb.push([w, d, c]);
      A.sfxAt = (n) => calls.sfxAt.push(n);
      A.setMusicState = (s) => calls.music.push(s);

      // reverb zone: enter -> custom reverb, exit -> room reverb revert
      const rz = W.mkProp.audio({ mode: 'reverbZone', x: p.body.x, y: p.body.y, w: 6, h: 6, wet: 0.7, tail: 3.1 });
      p.body.x = rz.x; p.body.y = rz.y; rz.update(0.016);          // inside
      o.rz_enter = calls.reverb.length === 1 && calls.reverb[0][0] === 0.7;
      p.body.x = rz.x + 100; rz.update(0.016);                     // outside -> revert via applyRoomReverb
      o.rz_exit = calls.reverb.length === 2;

      // emitter: fires sfxAt on its timer
      calls.sfxAt.length = 0;
      const em = W.mkProp.audio({ mode: 'emitter', x: p.body.x, y: p.body.y, sound: 'spore', every: 0.2 });
      for (let i = 0; i < 120; i++) em.update(0.016);              // ~2s
      o.em_fired = calls.sfxAt.length > 0 && calls.sfxAt.includes('spore');

      // music trigger: enter -> tense, exit -> calm
      calls.music.length = 0;
      const mt = W.mkProp.audio({ mode: 'musicTrigger', x: p.body.x, y: p.body.y, w: 6, h: 6, music: 'tense' });
      p.body.x = mt.x; mt.update(0.016); o.mt_enter = calls.music.includes('tense');
      p.body.x = mt.x + 100; mt.update(0.016); o.mt_exit = calls.music.includes('calm');
      return o;
    });
    console.log('RESULT:', JSON.stringify(out));
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = out.rz_enter && out.rz_exit && out.em_fired && out.mt_enter && out.mt_exit && !errs.length;
    console.log(ok ? 'AUDIO MARKER TEST: PASS' : 'AUDIO MARKER TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
