// Charm synergies grant bonus stats; overcharm lets you go one over for double damage taken.
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
    await game.setViewport({ width: 1100, height: 680 });
    game.on('pageerror', e => errs.push('[game] ' + e.message));
    await game.goto('http://localhost:7707/index.html?level=gloom&spawn=1', { waitUntil: 'load' });
    await wait(2200);

    const o = await game.evaluate(() => {
      const o = {}, C = G.Charms, p = G.player;
      G.save.nailLevel = 0; G.save.bosses = {};                 // notches = 3
      G.save.charmsOwned = C.LIST.map(c => c.id); G.save.charmsEquipped = [];
      C.toggle('keenedge'); C.toggle('glassheart');             // 2 + 1 = 3 notches
      o.synergyActive = C.synergies().some(s => s.name === 'Ruin Edge');
      C.apply(p);
      o.nailWithSyn = p.nailDmg;                                // 1 + keen1 + glass2 + syn1 = 5
      o.notOver = !C.isOvercharmed();

      o.canOvercharm = C.canEquip('stoneheart');                // used 3 <= notches 3 -> allowed (over)
      C.toggle('stoneheart');
      o.overcharmed = C.isOvercharmed();
      C.apply(p); o.playerOver = p.overcharmed === true;
      o.cantAddMore = !C.canEquip('windstep');                  // already over -> blocked

      const hit = () => { p.atkT = 0; p.invulnT = 0; p.hurtT = 0; p.dead = false; const h0 = p.hp = p.maxHp; p.damage(1, p.body.x + 2); return h0 - p.hp; };
      o.doubleDmg = hit() === 2;
      G.save.charmsEquipped = []; C.apply(p);
      o.normalDmg = hit() === 1;
      return o;
    });
    console.log('RESULT:', JSON.stringify(o));
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = o.synergyActive && o.nailWithSyn === 5 && o.notOver && o.canOvercharm && o.overcharmed
      && o.playerOver && o.cantAddMore && o.doubleDmg && o.normalDmg && !errs.length;
    console.log(ok ? 'CHARM SYNERGY TEST: PASS' : 'CHARM SYNERGY TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
