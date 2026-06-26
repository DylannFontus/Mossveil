// Settings menu — GAME-SIDE seam test (roadmap #87). The editor never loads main.js, so this boots
// the real game and proves the menu schema + defaults now come from G.Settings byte-identically: the
// G.settings defaults object, the 15 rows Main.settingsRows() renders (exact labels, in order), and
// that applySettings ran cleanly on load (it consumed the data-driven defaults). Then it renders the
// Settings screen to confirm drawSettings works with the data-driven defs. No page errors.
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
  let netHits = 0;
  try {
    const game = await browser.newPage();
    await game.setViewport({ width: 1100, height: 680 });
    game.on('pageerror', e => errs.push('[game] ' + e.message));
    await game.setRequestInterception(true);
    game.on('request', r => { const u = r.url(); if (/^https?:\/\//.test(u) && !u.includes('localhost') && !u.includes('127.0.0.1')) { netHits++; r.abort(); } else r.continue(); });
    await game.goto('http://localhost:7707/index.html?level=gloom&spawn=1', { waitUntil: 'load' });
    await wait(2300);

    const o = await game.evaluate(() => {
      const out = {}, M = G.Main;
      const OLD_VALS = { volume: 0.8, soundtrack: 'Score', shake: true, rumble: true, quality: 'high', tonemap: 'ACES', lighting: true, bloom: true, dof: true, reflections: true, weather: true, aberration: true, motionblur: true, vignette: true };
      const OLD_LABELS = ['Controls / key bindings', 'Sound volume', 'Soundtrack', 'Screen shake', 'Controller rumble', 'Visual quality', 'Tone mapping', 'Dynamic lighting', 'Bloom glow', 'Depth of field', 'Water reflections', 'Weather effects', 'Chromatic aberration', 'Motion blur', 'Vignette'];
      out.hasModule = !!G.Settings && G.Settings.defs().length === 15;
      out.valsIdentical = JSON.stringify(G.settings) === JSON.stringify(OLD_VALS);
      out.rowsMatch = JSON.stringify(M.settingsRows().map(r => r.label)) === JSON.stringify(OLD_LABELS);
      out.count = M.settingsCount === 15;
      // applySettings ran during loadSettings -> it consumed the data-driven defaults
      out.applied = !G.Post || (G.Post.quality === G.settings.quality && G.Post.lighting === (G.settings.lighting !== false));
      return out;
    });
    // render the Settings screen to make sure drawSettings copes with the data-driven defs
    await game.evaluate(() => { G.Main._settingsReturn = 'play'; G.Main.settingsIndex = 0; G.Main.state = 'settings'; });
    await wait(400);
    const screen = await game.evaluate(() => { const ok = G.UI && Array.isArray(G.UI.settingsButtons) && G.UI.settingsButtons.length >= 1; G.Main.state = 'play'; return ok; });
    o.screenRenders = screen;

    console.log('RESULT:', JSON.stringify(o));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['hasModule', 'valsIdentical', 'rowsMatch', 'count', 'applied', 'screenRenders'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'SETTINGS GAME TEST: PASS' : 'SETTINGS GAME TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
