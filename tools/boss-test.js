const puppeteer = require('puppeteer-core');
const path = require('path');
(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: 'new', args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('file:///' + path.resolve('index.html').replace(/\\/g,'/') + '?level=arena&spawn=1', { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 1500));
  for (const bossId of ['duskweaver','tidemaw','bonelordErevax','crownlessKing','sporefather']) {
    const ok = await page.evaluate(async (id) => {
      G.Main.warp('arena','1');
      G.player.body.x = 20;
      const bs = G.Bosses.spawn(id, 30, 8, [], 'test:'+id);
      bs.state = 'idle'; bs.t = 0.05;
      return new Promise(res => setTimeout(() => {
        const alive = bs.alive, st = bs.state, mv = bs.lastMove;
        bs.hurt(999, 1);
        res(`${id}: state=${st} move=${mv} alive=${alive}`);
      }, 6000));
    }, bossId);
    console.log(ok);
  }
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: 'shots/boss-framework.png' });
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO ERRORS');
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
