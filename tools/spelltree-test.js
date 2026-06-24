// Spell tree: learn/empower spells with Glimmer; dive shockwave damages enemies on landing.
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, 'shots');
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const server = spawn(process.execPath, [path.join(ROOT, 'tools', 'editor-server.js')], { stdio: 'pipe' });
  await wait(800);
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const errs = [];
  try {
    const game = await browser.newPage();
    await game.setViewport({ width: 1100, height: 680 });
    game.on('pageerror', e => errs.push('[game] ' + e.message));
    await game.goto('http://localhost:7707/index.html?level=gloom&spawn=1', { waitUntil: 'load' });
    await wait(2200);

    const o = await game.evaluate(() => {
      const o = {}, M = G.Main, p = G.player;
      G.save.spells = { bolt: 1 }; G.save.glimmer = 1000;
      o.boltOwned = M.spellLevel('bolt') === 1 && M.spellLevel('scream') === 0;
      M.upgradeSpell('scream'); o.screamLearned = M.spellLevel('scream') === 1; o.spent80 = (1000 - M.glimmer()) === 80;
      M.upgradeSpell('scream'); o.screamMastered = M.spellLevel('scream') === 2;
      M.upgradeSpell('dive'); o.diveLearned = M.spellLevel('dive') === 1;
      G.save.glimmer = 0; const lvl = M.spellLevel('bolt'); M.upgradeSpell('bolt'); o.noBuyBroke = M.spellLevel('bolt') === lvl;

      // dive shockwave damages an enemy where the player lands
      const s = G.Physics.solids.find(x => x.mat) || G.Physics.solids[0];
      const top = s.y + s.h / 2;
      const e = G.Enemies.make('tumblebug', s.x, top + 0.6); e.hp = 30; G.room.entities.push(e); if (e.group) G.room.group.add(e.group);
      const hp0 = e.hp;
      p.dead = false; p.cinematic = false; p.body.x = s.x; p.body.y = top + p.body.h / 2 + 1.6; p.body.vy = -4;
      p.diveActive = { dmg: 7, r: 5, dark: true };
      for (let i = 0; i < 30; i++) p.update(0.016);     // fall, land on the solid -> shockwave
      o.diveDamaged = e.hp < hp0;

      M.openSpellTree();
      return o;
    });
    await wait(300);
    await game.screenshot({ path: path.join(SHOTS, 'spelltree.png') });
    console.log('RESULT:', JSON.stringify(o));
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = o.boltOwned && o.screamLearned && o.spent80 && o.screamMastered && o.diveLearned
      && o.noBuyBroke && o.diveDamaged && !errs.length;
    console.log(ok ? 'SPELL TREE TEST: PASS' : 'SPELL TREE TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
