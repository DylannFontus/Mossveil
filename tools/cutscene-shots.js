// Capture the intro cutscene at key timestamps using debugSeek.
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, 'shots', 'cutscene');

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: EDGE, headless: 'new',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--window-size=1280,720']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });

  await page.goto('file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/') + '?cutscene=intro', { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 1800));

  const times = [0.4, 2, 4.5, 7, 9.5, 10.9, 11.5, 13, 15, 16.9, 17.5, 18.5, 21.5, 24, 26.6, 27.2, 28, 28.7, 29.3];
  for (const t of times) {
    await page.evaluate(tt => { if (G.Cutscene.active) G.Cutscene.debugSeek(tt); }, t);
    // let a couple frames render so particles/letterbox draw
    await new Promise(r => setTimeout(r, 260));
    const tag = String(t).replace('.', '_');
    await page.screenshot({ path: path.join(SHOTS, `t${tag}.png`) });
  }
  const state = await page.evaluate(() => ({
    active: !!G.Cutscene.active,
    state: G.Main.state,
    pose: G.Cutscene.active ? { stand: +G.Cutscene.active.pose.stand.toFixed(2), facing: +G.Cutscene.active.pose.facing.toFixed(2), rootY: +G.Cutscene.active.pose.rootY.toFixed(2) } : null
  }));
  console.log('STATE:', JSON.stringify(state));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO ERRORS');
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
