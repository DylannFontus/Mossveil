// Charm loadout / notches — GAME-SIDE seam test (roadmap #90). The editor never loads charms.js /
// player.js the way the game does, so this boots the real game and exercises all three seams:
// C.notches() follows the data-driven budget (base + per-boss, capped), C.canEquip() honours the
// overcharm permission, and the player hurt handler scales overcharm damage by the data-driven
// multiplier. Restores defaults at the end. Offline (localhost only), no page errors.
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
      const out = {}, C = G.Charms, L = G.Loadout, p = G.player;
      L.applyData(null);
      // ---- seam 1: C.notches() = data-driven budget ----
      G.save.bosses = {};
      out.notch0 = C.notches() === 3;
      G.save.bosses = { a: true, b: true };
      out.notch2 = C.notches() === 5;
      G.save.bosses = { a: 1, b: 1, c: 1, d: 1, e: 1, f: 1, g: 1 };   // 7 -> capped at 9
      out.notchCap = C.notches() === 9;
      // ---- seam 2: C.canEquip() overcharm permission ----
      G.save.bosses = {};                                   // notches will = baseNotches
      const list = C.LIST, X = list.find(c => c.cost >= 1) || list[0], cX = X.cost;
      const Y = list.find(c => c.id !== X.id && c.cost >= 1);
      L.applyData({ baseNotches: cX, notchesPerBoss: 1, notchCap: Math.max(cX, 9), allowOvercharm: true });
      G.save.charmsOwned = list.map(c => c.id);
      G.save.charmsEquipped = [X.id];                       // used == cX == notches -> next is an overcharm
      out.usedEqNotch = C.notches() === cX && C.usedNotches() === cX;
      out.overAllowed = C.canEquip(Y.id) === true;
      L.applyData({ baseNotches: cX, notchesPerBoss: 1, notchCap: Math.max(cX, 9), allowOvercharm: false });
      out.overBlocked = C.canEquip(Y.id) === false;
      // ---- seam 3: overcharm damage multiplier (player.js hurt) ----
      function hurt(overcharm) { p.invulnT = 0; p.dead = false; p.atkT = 0; p.hp = p.maxHp; p.overcharmed = overcharm; const h0 = p.hp; p.damage(1, p.body.x + 5); return h0 - p.hp; }
      L.applyData(null);                                    // mult 2
      out.dmgNormal = hurt(false) === 1;
      out.dmgOverDefault = hurt(true) === 2;
      L.applyData({ overcharmDamageMult: 3 });
      out.dmgOverTuned = hurt(true) === 3;
      L.applyData(null);                                    // restore
      out.restored = L.baseNotches() === 3 && L.overcharmDamageMult() === 2;
      return out;
    });

    console.log('RESULT:', JSON.stringify(o));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['notch0', 'notch2', 'notchCap', 'usedEqNotch', 'overAllowed', 'overBlocked', 'dmgNormal', 'dmgOverDefault', 'dmgOverTuned', 'restored'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'LOADOUT GAME TEST: PASS' : 'LOADOUT GAME TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
