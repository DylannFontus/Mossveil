// Functional test: bench save, wings pickup, boss death, player death/respawn
const puppeteer = require('puppeteer-core');
const path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.resolve(__dirname, '..');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE, headless: 'new',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/'), { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 1200));
  await page.keyboard.press('KeyN');
  await new Promise(r => setTimeout(r, 1500));
  const log = [];

  // 1. bench rest + save
  await page.evaluate(() => {
    G.Main.warp('rest', '1');
    const bench = G.room.entities.find(e => e.type === 'bench');
    G.player.body.x = bench.x; G.player.body.y = bench.y + 1;
    G.player.hp = 2;
    G.Main.benchRest(bench);
  });
  log.push(await page.evaluate(() => `bench: hp=${G.player.hp} save=${JSON.stringify(G.save.bench)}`));

  // 2. wings pickup
  await page.evaluate(() => {
    G.Main.warp('dusk', '4');
    const w = G.room.entities.find(e => e.type === 'wings');
    G.player.body.x = w.x; G.player.body.y = w.y;
  });
  await new Promise(r => setTimeout(r, 600));
  log.push(await page.evaluate(() => `wings: has=${G.player.hasWings} saved=${G.save.wings}`));

  // 3. soul / focus / spell
  await page.evaluate(() => { G.player.gainSoul(99); G.Enemies.fireBolt(G.player.body.x, G.player.body.y, 1); });
  await new Promise(r => setTimeout(r, 400));
  log.push(await page.evaluate(() => `soul: ${G.player.soul}`));

  // 4. boss death sequence
  await page.evaluate(() => {
    G.Main.warp('arena', '1');
    G.player.body.x = 24;
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.evaluate(() => {
    const boss = G.room.entities.find(e => e.type === 'boss');
    if (boss) boss.hurt(99, 1, 'side');
  });
  await new Promise(r => setTimeout(r, 12000));
  log.push(await page.evaluate(() => {
    const gates = G.room.entities.filter(e => e.type === 'gate');
    return `boss: dead=${G.save.bossDead} gatesOpen=${gates.every(g => !g.closed)} ents=${G.room.entities.length}`;
  }));
  await page.screenshot({ path: path.join(ROOT, 'shots', 'boss-dead.png') });

  // 5. player death -> respawn at bench
  await page.evaluate(() => { G.player.damage(99, G.player.body.x + 1); });
  await new Promise(r => setTimeout(r, 14000));
  log.push(await page.evaluate(() => `respawn: room=${G.room.id} hp=${G.player.hp} state=${G.Main.state}`));

  // 6. crown shrine present after boss death
  await page.evaluate(() => { G.Main.warp('crown', '1'); });
  await new Promise(r => setTimeout(r, 800));
  log.push(await page.evaluate(() => {
    const types = G.room.entities.map(e => e.type).join(',');
    return `crown ents: ${types}`;
  }));
  await page.screenshot({ path: path.join(ROOT, 'shots', 'room-crown.png') });

  console.log(log.join('\n'));
  console.log(errs.length ? 'PAGE ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
