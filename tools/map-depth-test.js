// Map depth: completion %, drop/clear pins, and the off-screen bench compass.
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, 'shots');

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const server = spawn(process.execPath, [path.join(ROOT, 'tools', 'editor-server.js')], { stdio: 'pipe' });
  await new Promise(r => setTimeout(r, 800));
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const errs = [];
  try {
    const game = await browser.newPage();
    await game.setViewport({ width: 1200, height: 720 });
    game.on('pageerror', e => errs.push('[game] ' + e.message));
    await game.goto('http://localhost:7707/index.html?level=gloom&spawn=1', { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2300));
    await game.bringToFront();

    // mark some rooms visited so completion > 0, then open the map
    await game.evaluate(() => {
      G.save.visited = G.save.visited || {}; G.save.visited[G.room.id] = true;
      const ids = Object.keys(G.LEVELS).slice(0, 3); ids.forEach(i => G.save.visited[i] = true);
      G.save.pins = [];
      G.Main.mapView = G.Main.mapView || { pan: { x: 0, y: 0 }, zoom: 3 };
      G.MapView.centerOn(G.room.id, G.Main.mapView);
      G.Main.state = 'map';
    });
    await new Promise(r => setTimeout(r, 200));
    await game.keyboard.press('KeyZ'); await new Promise(r => setTimeout(r, 120));   // drop pin
    const afterDrop = await game.evaluate(() => (G.save.pins || []).length);
    await game.keyboard.press('KeyX'); await new Promise(r => setTimeout(r, 120));   // clear pin
    const afterClear = await game.evaluate(() => (G.save.pins || []).length);
    await game.keyboard.press('KeyZ'); await new Promise(r => setTimeout(r, 150));   // re-drop for the shot
    await game.screenshot({ path: path.join(SHOTS, 'map-depth.png') });

    // compass: put a bench far off-screen, go back to play, confirm drawCompass runs clean
    const compass = await game.evaluate(() => {
      G.Main.state = 'play';
      const b = G.World.mkProp.bench ? G.World.mkProp.bench({ x: G.player.body.x + 40, y: G.player.body.y }) : null;
      if (b) { b.type = 'bench'; G.room.entities.push(b); if (b.group) G.room.group.add(b.group); }
      return { benchAdded: !!b };
    });
    await new Promise(r => setTimeout(r, 250));
    await game.screenshot({ path: path.join(SHOTS, 'map-compass.png') });

    console.log('RESULT:', JSON.stringify({ afterDrop, afterClear, compass }));
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = afterDrop === 1 && afterClear === 0 && compass.benchAdded && !errs.length;
    console.log(ok ? 'MAP DEPTH TEST: PASS' : 'MAP DEPTH TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
