// Playtest cheats (src/cheats.js, roadmap #63): the engine half. Boots the real game and proves every
// cheat works on the live G.Cheats — god mode blocks player.damage(), the persistent toggles pin their
// values each frame, and the one-shot favours heal / fill soul / gift Glimmer / unlock every charm /
// clear the loadout / unlock all abilities / wipe the room's foes. Also proves the ONE main.js seam in
// the LIVE LOOP: with the game in 'play', infinite-soul + god pin soul and hp every frame on their own.
// Zero outbound network, no page errors.
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
    await game.setViewport({ width: 1000, height: 620 });
    game.on('pageerror', e => errs.push('[game] ' + e.message));
    game.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });
    await game.setRequestInterception(true);
    game.on('request', r => { const u = r.url(); if (/^https?:\/\//.test(u) && !u.includes('localhost') && !u.includes('127.0.0.1')) { netHits++; r.abort(); } else r.continue(); });
    await game.goto('http://localhost:7707/index.html?level=gloom&spawn=1', { waitUntil: 'load' });
    await wait(2400);

    // ---- stage A: direct asserts on the live G.Cheats + arm the live-loop seam test ----
    const a = await game.evaluate(() => {
      const C = G.Cheats, p = G.player, out = {};
      const SM = (G.Player && G.Player.SOUL_MAX) || 99;
      out.hasApi = !!(C && C.update && C.set && C.toggle && C.reset && C.status && C.heal && C.fillSoul && C.giveGlimmer && C.unlockCharms && C.clearCharms && C.unlockAbilities && C.killEnemies && C.draw);

      // god mode rides the player.damage() guard
      C.reset();
      const mhp = p.maxHp;
      p.invulnT = 0; p.atkT = 0; p.dead = false; p.hp = mhp;
      const r1 = p.damage(1, p.body.x + 5);
      out.godOff = r1 === true && p.hp === mhp - 1;                       // damage lands normally
      p.hp = mhp; C.set('god', true); p.invulnT = 0;
      const r2 = p.damage(1, p.body.x + 5);
      out.godOn = r2 === false && p.hp === mhp;                          // god → no damage
      C.set('god', false);

      // persistent toggles pinned by C.update()
      p.soul = 0; C.set('infiniteSoul', true); C.update(); out.soulPinned = p.soul === SM;
      C.set('infiniteSoul', false); p.soul = 0; C.update(); out.soulOffNoPin = p.soul === 0;
      p.dashCdT = 5; C.set('infiniteDash', true); C.update(); out.dashPinned = p.dashCdT === 0;
      p.wingUsed = true; C.set('infiniteAir', true); C.update(); out.airPinned = p.wingUsed === false;
      C.reset();

      // one-shot favours
      p.hp = 1; out.heal = C.heal() === true && p.hp === p.maxHp;
      p.soul = 0; out.fillSoul = C.fillSoul() === true && p.soul === SM;
      const g0 = G.Main.glimmer(); C.giveGlimmer(100); out.glimmer = G.Main.glimmer() === g0 + 100;

      G.save.charmsOwned = [];
      const granted = C.unlockCharms();
      out.unlockCharms = granted === G.Charms.LIST.length && G.Charms.owned().length === G.Charms.LIST.length;

      G.save.charmsEquipped = G.Charms.LIST.slice(0, 1).map(c => c.id);
      out.clearCharms = C.clearCharms() === true && (G.save.charmsEquipped || []).length === 0;

      G.save.wings = false; G.save.spells = {};
      C.unlockAbilities();
      out.unlockAbilities = G.save.wings === true && G.save.spells.bolt === 2 && G.save.spells.gale === 2 && G.player.hasWings === true;

      // kill room foes (use a deterministic fake so the assertion never depends on what gloom spawned)
      const fake = { isEnemy: true, alive: true, type: 'gnatling', body: { x: 2, y: 2 }, hurt(d) { this._hit = d; this.alive = false; } };
      G.room.entities.push(fake);
      const killed = C.killEnemies();
      out.killEnemies = killed >= 1 && fake._hit === 9999 && fake.alive === false;
      const fi = G.room.entities.indexOf(fake); if (fi >= 0) G.room.entities.splice(fi, 1);

      // status / toggle / reset
      C.reset(); out.resetClears = C.status().any === false;
      out.toggleStatus = C.toggle('god') === true && C.status().god === true && C.status().any === true;
      C.reset();

      // arm the live-loop seam test: force play, turn on god + infinite soul, drain them, let the loop pin.
      // Clear the cinematic freezes first (the damage() + kill calls above queued hitStop, which forces
      // dt=0 and would stall the update block — at headless ~4fps it never drains in the wait window).
      if (G.Main) { G.Main.state = 'play'; G.Main.transLock = 0; }
      G.hitStop = 0; G.slowMo = 0;
      C.set('god', true); C.set('infiniteSoul', true);
      p.dead = false; p.hp = 2; p.soul = 0;
      out.armMaxHp = p.maxHp; out.SM = SM;
      return out;
    });

    await wait(450);   // several RAFs fire; the main-loop seam must pin hp + soul each frame

    const b = await game.evaluate(() => {
      const p = G.player, out = {};
      out.tSoul = Math.round(p.soul);
      out.tHp = p.hp;
      G.Cheats.reset();   // leave the game clean
      return out;
    });
    const seamSoul = b.tSoul === a.SM;        // infinite-soul pinned the orb via the main.js seam
    const seamGod = b.tHp === a.armMaxHp;     // god pinned hp via the same seam

    const all = Object.assign({}, a, { seamSoul, seamGod });
    delete all.armMaxHp; delete all.SM;
    console.log('CHEATS-ENGINE:', JSON.stringify(all, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const need = ['hasApi', 'godOff', 'godOn', 'soulPinned', 'soulOffNoPin', 'dashPinned', 'airPinned', 'heal', 'fillSoul', 'glimmer', 'unlockCharms', 'clearCharms', 'unlockAbilities', 'killEnemies', 'resetClears', 'toggleStatus', 'seamSoul', 'seamGod'];
    const ok = need.every(k => all[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'CHEATS-ENGINE TEST: PASS' : 'CHEATS-ENGINE TEST: FAIL  (' + need.filter(k => !all[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
