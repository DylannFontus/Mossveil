// Validates the new combat texture: parry/clash, enemy stagger gate, and the charged
// Great Slash (extra damage + guaranteed stagger). Logic-level (drives the real objects).
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
    await new Promise(r => setTimeout(r, 2500));

    const out = await game.evaluate(() => {
      const o = {}, p = G.player;
      const add = e => { if (G.room.entities.indexOf(e) < 0) { G.room.entities.push(e); if (e.group) G.room.group.add(e.group); } return e; };

      // --- parry: mid-swing into the threat negates the hit ---
      p.invulnT = 0; p.hurtT = 0; p.hp = p.maxHp; p.atkDir = 'side'; p.facing = 1; p.atkT = 0.05;
      const took = p.damage(1, p.body.x + 2);     // threat to the right, facing right
      o.parry_negated = (took === false);
      o.parry_hpKept = (p.hp === p.maxHp);
      o.parry_flag = p.parryT > 0;
      // and a hit from behind while swinging forward should NOT parry
      p.invulnT = 0; p.hp = p.maxHp; p.atkT = 0.05; p.facing = 1;
      const took2 = p.damage(1, p.body.x - 2);
      o.parry_backHits = (p.hp < p.maxHp);
      p.invulnT = 0; p.hp = p.maxHp; p.atkT = 0;

      // --- stagger gate freezes the enemy's AI ---
      const e = add(G.Enemies.make('bramblehog', p.body.x + 6, p.body.y));
      let ran = 0; const orig = e.update; e.update = dt => { ran++; orig.call(e, dt); };
      G.Enemies.stagger(e, 0.5);
      o.stag_set = e.stagT > 0;
      G.World.update(0.016);
      o.stag_skipped = (ran === 0);               // update not called while staggered
      e.stagT = 0; G.World.update(0.016);
      o.stag_resumed = (ran === 1);               // resumes after it expires
      e.update = orig; e.dead = true;

      // --- Great Slash: ~3 dmg + guaranteed stagger ---
      const e2 = add(G.Enemies.make('bramblehog', p.body.x + 1.6, p.body.y));
      e2.hp = 20; e2.poiseMax = 999;              // isolate the art's own stagger call
      const hp0 = e2.hp;
      p.isArt = true; p.atkDir = 'side'; p.facing = 1; p.atkT = 0.0001; p.atkHit = new Set();
      for (let i = 0; i < 4; i++) p.update(0.016); // resolveAttack runs inside player.update
      o.art_dmg = hp0 - e2.hp;
      o.art_staggered = e2.stagT > 0;
      e2.dead = true;
      return o;
    });
    console.log('RESULT:', JSON.stringify(out, null, 2));
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = out.parry_negated && out.parry_hpKept && out.parry_flag && out.parry_backHits
      && out.stag_set && out.stag_skipped && out.stag_resumed
      && out.art_dmg === 3 && out.art_staggered && !errs.length;
    console.log(ok ? 'COMBAT TEXTURE TEST: PASS' : 'COMBAT TEXTURE TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
