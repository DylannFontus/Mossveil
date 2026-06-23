// Hunter's Journal: kills tally, sandboxed enemy previews, portrait snapshots, and the page draws.
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, 'shots');

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const server = spawn(process.execPath, [path.join(ROOT, 'tools', 'editor-server.js')], { stdio: 'pipe' });
  await new Promise(r => setTimeout(r, 800));
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const errs = [];
  try {
    const game = await browser.newPage();
    await game.setViewport({ width: 1200, height: 720 });
    game.on('pageerror', e => errs.push('[game] ' + e.message));
    game.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });
    await game.goto('http://localhost:7707/index.html?level=gloom&spawn=1', { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2300));

    const out = await game.evaluate(() => {
      const o = {};
      // sandboxed preview must NOT pollute the live room
      const before = G.room.entities.length;
      const grp = G.Enemies.preview('hookworm');     // hookworm's maker auto-adds — preview must sandbox it
      o.previewGroup = !!grp;
      o.roomUntouched = (G.room.entities.length === before);
      o.snapshot = !!(G.Thumb && G.Thumb.snapshot(G.Enemies.preview('tumblebug'), { size: 120 }));
      // record kills + open the journal
      G.Main.recordKill('tumblebug'); G.Main.recordKill('tumblebug'); G.Main.recordKill('gnatling');
      o.kills = G.save.kills.tumblebug;
      G.Main.journalIndex = 0; G.Main.state = 'journal';
      return o;
    });
    await new Promise(r => setTimeout(r, 500));   // let the HUD draw the page + portrait
    await game.screenshot({ path: path.join(SHOTS, 'journal.png') });
    console.log('RESULT:', JSON.stringify(out));
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = out.previewGroup && out.roomUntouched && out.snapshot && out.kills === 2 && !errs.length;
    console.log(ok ? 'JOURNAL TEST: PASS' : 'JOURNAL TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
