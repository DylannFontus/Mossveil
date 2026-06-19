// Headless smoke test: load the game in Edge, capture console errors + screenshots.
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, 'shots');

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: 'new',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--window-size=1280,720']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') errors.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', err => errors.push('[pageerror] ' + err.message));

  await page.goto('file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/'), { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 2500));
  await page.screenshot({ path: path.join(SHOTS, '1-title.png') });

  // start game
  await page.keyboard.press('KeyN');
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(SHOTS, '2-spawn.png') });

  // walk right + jump a bit
  await page.keyboard.down('KeyD');
  await new Promise(r => setTimeout(r, 1400));
  await page.keyboard.press('Space');
  await new Promise(r => setTimeout(r, 800));
  await page.keyboard.press('Space');
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(SHOTS, '3-running.png') });

  // attack + dash
  await page.keyboard.press('KeyX');
  await new Promise(r => setTimeout(r, 150));
  await page.screenshot({ path: path.join(SHOTS, '4-attack.png') });
  await page.keyboard.press('KeyC');
  await new Promise(r => setTimeout(r, 120));
  await page.screenshot({ path: path.join(SHOTS, '5-dash.png') });
  await new Promise(r => setTimeout(r, 2500));
  await page.keyboard.up('KeyD');
  await page.screenshot({ path: path.join(SHOTS, '6-later.png') });

  // teleport across rooms via console for visual checks
  const rooms = ['glade', 'rest', 'shaft', 'gloom', 'approach', 'crown', 'dusk'];
  for (const r of rooms) {
    await page.evaluate(id => { G.Main.warp(id, '1'); }, r);
    await new Promise(r2 => setTimeout(r2, 1500));
    await page.screenshot({ path: path.join(SHOTS, `room-${r}.png`) });
  }

  // boss fight: warp to arena and walk into the trigger
  await page.evaluate(() => { G.Main.warp('arena', '1'); });
  await page.keyboard.down('KeyD');
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 200));
    const x = await page.evaluate(() => G.player.body.x);
    if (x >= 23) break;
  }
  await page.keyboard.up('KeyD');
  await new Promise(r => setTimeout(r, 2200));
  await page.screenshot({ path: path.join(SHOTS, 'boss.png') });
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: path.join(SHOTS, 'boss2.png') });

  const state = await page.evaluate(() => ({
    room: G.room && G.room.id,
    player: G.player && { x: +G.player.body.x.toFixed(1), y: +G.player.body.y.toFixed(1), hp: G.player.hp },
    state: G.Main.state,
    ents: G.room ? G.room.entities.length : -1
  }));
  console.log('STATE:', JSON.stringify(state));
  console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 30).join('\n') : 'NO CONSOLE ERRORS');
  await browser.close();
})().catch(e => { console.error('SMOKE FAILED:', e); process.exit(1); });
