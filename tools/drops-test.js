// Drop tables — GAME-SIDE seam test (roadmap #91). The editor never loads enemies.js/bosses.js the
// way the game does, so this boots the real game and actually kills creatures to prove the death
// handlers route through G.Drops: a default enemy kill drops 2–4 Glimmer (byte-identical to the old
// `2+(rand*3|0)`), a per-type override is honoured, chance 0 drops nothing, a default boss kill drops
// 40–59 (old `40+(rand*20|0)`), and a per-boss override is honoured. Restores defaults at the end.
// Offline (localhost only), no page errors.
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
      const out = {}, M = G.Main, D = G.Drops;
      D.applyData(null);                                  // start from defaults
      // kill an enemy of `type` in a throwaway room (so makers that auto-add don't pollute the level),
      // return the Glimmer gained — the drop itself routes through M.dropGlimmer/G.save, room-independent.
      function killGain(type) {
        const g = M.glimmer(), real = G.room;
        G.room = { id: real.id, entities: [], group: new THREE.Group() };
        let e = null;
        try { e = G.Enemies.make(type, G.player.body.x + 3, G.player.body.y); if (e) e.hurt(999, 1); } finally { G.room = real; }
        return e ? (M.glimmer() - g) : -999;
      }
      G.save.glimmer = 0;
      // default enemy drops: every value lands in 2..4
      let dmin = 99, dmax = -1;
      for (let i = 0; i < 40; i++) { const v = killGain('tumblebug'); if (v < dmin) dmin = v; if (v > dmax) dmax = v; }
      out.defLo = dmin; out.defHi = dmax;
      out.defaultRange = dmin >= 2 && dmax <= 4 && dmax >= 2;
      // per-type override honoured; other types still use the baseline
      D.applyData({ enemy: { min: 2, max: 4, chance: 1 }, boss: { min: 40, max: 59, chance: 1 }, byType: { tumblebug: { min: 25, max: 25, chance: 1 } }, byBoss: {} });
      out.overrideExact = killGain('tumblebug') === 25;
      const gv = killGain('gnatling'); out.baselineOther = gv >= 2 && gv <= 4;
      // chance 0 -> nothing drops
      D.applyData({ enemy: { min: 9, max: 9, chance: 0 }, boss: { min: 40, max: 59, chance: 1 }, byType: {}, byBoss: {} });
      let z = 0; for (let i = 0; i < 12; i++) z += killGain('tumblebug'); out.chanceZero = z === 0;
      // default boss drop 40..59 (byte-identical to old formula)
      D.applyData(null);
      function bossGain(id) {
        const g = M.glimmer(), bs = G.Bosses.spawn(id, G.player.body.x + 6, G.player.body.y, [], 'test:' + id);
        bs.hurt(999, 1);                                  // hp huge -> startDeath -> dropGlimmer once
        return M.glimmer() - g;
      }
      const bd = bossGain('mossSovereign'); out.bossDefault = bd >= 40 && bd <= 59; out.bossVal = bd;
      // per-boss override
      D.applyData({ enemy: { min: 2, max: 4, chance: 1 }, boss: { min: 40, max: 59, chance: 1 }, byType: {}, byBoss: { thornbackAlpha: { min: 100, max: 100, chance: 1 } } });
      out.bossOverride = bossGain('thornbackAlpha') === 100;
      D.applyData(null);                                  // restore defaults
      out.restored = D.enemyBase().max === 4 && D.bossBase().max === 59;
      return out;
    });

    console.log('RESULT:', JSON.stringify(o));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['defaultRange', 'overrideExact', 'baselineOther', 'chanceZero', 'bossDefault', 'bossOverride', 'restored'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'DROPS GAME TEST: PASS' : 'DROPS GAME TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
