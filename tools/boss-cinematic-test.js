// Boss cinematics: name card (+epithet), phase-2 transition + pips, final-blow slow-motion.
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
    await game.goto('http://localhost:7707/index.html?level=gloom&spawn=1', { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2300));

    await game.evaluate(() => {
      G.Main.state = 'play';
      window.__bs = G.Bosses.spawn('mossSovereign', G.player.body.x + 7, G.player.body.y, [], 'test:moss');
    });
    await new Promise(r => setTimeout(r, 650));         // during the name-card HOLD
    await game.screenshot({ path: path.join(SHOTS, 'boss-namecard.png') });

    const out = await game.evaluate(() => {
      const o = {}, bs = window.__bs;
      o.hasEpithet = !!(G.Bosses.EPITHETS && G.Bosses.EPITHETS.mossSovereign);
      bs.hp = bs.maxHp;
      bs.hurt(bs.maxHp / 2, 1);            // cross the 50% threshold -> phase 2
      o.phase = bs.phase;
      bs.hurt(bs.maxHp, 1);                // killing blow -> startDeath -> slow-mo
      o.slowMo = +(+G.slowMo).toFixed(2);
      o.slowScale = G.slowScale;
      return o;
    });
    console.log('RESULT:', JSON.stringify(out));
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = out.hasEpithet && out.phase === 2 && out.slowMo > 1 && out.slowScale < 1 && !errs.length;
    console.log(ok ? 'BOSS CINEMATIC TEST: PASS' : 'BOSS CINEMATIC TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
