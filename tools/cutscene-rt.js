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
  const url = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/') + '?cutscene=intro';
  await page.goto(url, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 2000));
  console.log('after load:', JSON.stringify(await page.evaluate(() => ({ state: G.Main.state, active: !!G.Cutscene.active, cinematic: G.player.cinematic }))));
  await new Promise(r => setTimeout(r, 2500));
  console.log('after 2.5s:', JSON.stringify(await page.evaluate(() => ({ state: G.Main.state, t: G.Cutscene.active ? +G.Cutscene.active.time.toFixed(1) : null, rootY: +G.player.root.position.y.toFixed(2) }))));
  await page.keyboard.press('KeyZ');
  await new Promise(r => setTimeout(r, 500));
  console.log('after skip:', JSON.stringify(await page.evaluate(() => ({ state: G.Main.state, active: !!G.Cutscene.active, cinematic: G.player.cinematic, filter: G.renderer.domElement.style.filter || '(none)' }))));
  await page.keyboard.down('KeyD');
  await new Promise(r => setTimeout(r, 700));
  await page.keyboard.up('KeyD');
  console.log('after move:', JSON.stringify(await page.evaluate(() => ({ x: +G.player.body.x.toFixed(1), onG: G.player.body.onGround }))));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO ERRORS');
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
