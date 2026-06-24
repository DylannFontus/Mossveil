// Dynamic world environment: burnable grass + weather rules + scorch persistence + ice water.
// Drives G.Fire deterministically (game paused so only our manual updates advance it).
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
  try {
    const game = await browser.newPage();
    await game.setViewport({ width: 900, height: 560 });
    game.on('pageerror', e => errs.push('[game] ' + e.message));
    game.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });
    await game.goto('http://localhost:7707/index.html?level=verdant&spawn=1', { waitUntil: 'load' });
    await wait(2400);

    const o = await game.evaluate(() => {
      const F = G.Fire, out = {};
      const step = (n, dt) => { for (let i = 0; i < n; i++) F.update(dt || 0.1); };
      G.Main.state = 'pause';                          // freeze the game loop; we drive F.update ourselves
      out.has = !!F; out.cells = F.stats().cells;
      const s = F._sample();

      // 1) ignite under clear weather -> it catches
      G.Weather.set('none'); F._setPlaytime(100);
      out.lit = F.ignite(s.x, s.y, 1, { range: 6 });
      step(3); out.burningAfterLight = F.stats().burning;

      // 2) burns out (~10s) -> scorched/ash that lingers
      step(130); const st2 = F.stats();
      out.burntAfterBurnout = st2.burnt; out.scorch = F._scorchAt();

      // 3) scorch reverts after the 2-hour gameplay window
      F._setPlaytime(100 + 7300); step(2);
      out.burntAfterRevert = F.stats().burnt; out.scorchAfterRevert = F._scorchAt();

      // 4) rain douses on contact — grass won't catch
      G.Weather.set('rain'); out.litRain = F.ignite(s.x, s.y, 1, { range: 6 }); step(3);
      out.burningRain = F.stats().burning;

      // 5) embers make it burn longer than the 10s base (still alight at ~12s)
      G.Weather.set('embers'); F.ignite(s.x, s.y, 1, { range: 6 }); step(120);
      out.burningEmbers12s = F.stats().burning;
      step(110); out.burntEmbers = F.stats().burnt;     // ...and out by ~23s

      // 6) reflective water freezes to ice under blizzard, thaws when clear
      G.room.lookState = G.room.lookState || {}; G.room.lookState.water = { y: 6, strength: 0.5, ripple: 1 };
      G.Weather.set('blizzard'); step(2); out.icedBlizzard = F.stats().iced;
      G.Weather.set('none'); step(2); out.icedClear = F.stats().iced;

      out.emberSpell = !!G.Main.SPELL_TREE.find(t => t.id === 'ember');
      return out;
    });

    console.log('FIRE:', JSON.stringify(o, null, 0));
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = o.has && o.cells > 0 && o.lit > 0 && o.burningAfterLight > 0
      && o.burntAfterBurnout > 0 && o.scorch >= 0.8
      && o.burntAfterRevert === 0 && o.scorchAfterRevert === 0
      && o.litRain === 0 && o.burningRain === 0
      && o.burningEmbers12s > 0 && o.burntEmbers > 0
      && o.icedBlizzard === true && o.icedClear === false
      && o.emberSpell && !errs.length;
    console.log(ok ? 'FIRE TEST: PASS' : 'FIRE TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
