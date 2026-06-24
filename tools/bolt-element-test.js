// Frost / Gale bolt attunement + effects. Frost snuffs fire and freezes foes;
// Gale fans fire, hurls foes back, and blows away gas. Ember still ignites.
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
    await wait(2200);

    const o = await game.evaluate(() => {
      const U = G.U, F = G.Fire, out = {};
      out.frostNode = !!G.Main.SPELL_TREE.find(t => t.id === 'frost');
      out.galeNode = !!G.Main.SPELL_TREE.find(t => t.id === 'gale');

      // learn ember+frost+gale; attune to frost, then switch to gale
      G.save.spells = Object.assign(G.save.spells || { bolt: 1 }, { ember: 1, frost: 1, gale: 1 });
      G.save.boltElement = 'frost'; out.active = G.Main.activeElement();
      G.save.boltElement = 'gale'; out.switched = G.Main.activeElement();

      // frost douses fire
      const s = F._sample();
      F.ignite(s.x, s.y, 1, { range: 4 }); for (let i = 0; i < 3; i++) F.update(0.1);
      const b0 = F.stats().burning; F.douseAt(s.x, s.y, 3); out.frostDoused = F.stats().burning < b0;

      // gale fans fire to a neighbour (returns count, no throw)
      F.ignite(s.x, s.y, 1, { range: 1 }); for (let i = 0; i < 3; i++) F.update(0.1);
      out.galeFan = typeof F.fanAt(s.x, s.y, 1, 3) === 'number';

      // a foe to shoot
      const en = G.room.entities.find(e => e.isEnemy && e.alive);
      en.body.x = 20; en.body.y = 14; en.body.vx = 0; en.body.vy = 0;

      // frost bolt -> staggers (freezes) it
      const fr = G.Enemies.spawnProjectile({ x: 20, y: 14, vx: 2, vy: 0, r: 0.3, color: 0x8fd8ff, friendly: true, life: 1, dmg: 1, element: 'frost', elementLvl: 1 });
      fr.update(0.02); out.frostFroze = (en.stagT > 0) || en.dead;

      // gale bolt -> hurls it back
      const en2 = G.room.entities.find(e => e.isEnemy && e.alive);
      if (en2) { en2.body.x = 30; en2.body.y = 14; en2.body.vx = 0; en2.body.vy = 0; en2.stagT = 0;
        const ga = G.Enemies.spawnProjectile({ x: 30, y: 14, vx: 2, vy: 0, r: 0.3, color: 0xeaf4ff, friendly: true, life: 1, dmg: 1, element: 'gale', elementLvl: 1 });
        ga.update(0.02); out.galeKnockback = Math.abs(en2.body.vx) > 5;
      }

      // gale blows gas away
      G.LEVELS[G.room.id].props.push({ type: 'gas', x: 40, y: 14, w: 4, h: 3 });
      G.World.load(G.room.id, 'P');
      const gas = G.room.entities.find(e => e.type === 'gas');
      const ga2 = G.Enemies.spawnProjectile({ x: 40, y: 14, vx: 2, vy: 0, r: 0.3, color: 0xeaf4ff, friendly: true, life: 1, dmg: 1, element: 'gale', elementLvl: 1 });
      ga2.update(0.02); G.World.update(0.05); out.galeGust = gas.group.visible === false;

      return out;
    });

    console.log('BOLT:', JSON.stringify(o));
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = o.frostNode && o.galeNode && o.active === 'frost' && o.switched === 'gale'
      && o.frostDoused === true && o.galeFan === true && o.frostFroze === true
      && o.galeKnockback === true && o.galeGust === true && !errs.length;
    console.log(ok ? 'BOLT ELEMENT TEST: PASS' : 'BOLT ELEMENT TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
