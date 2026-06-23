// Editor asset browser: live thumbnails render, search filters, favourites persist + filter.
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
    const page = await browser.newPage();
    await page.setViewport({ width: 1500, height: 860 });
    page.on('pageerror', e => errs.push('[editor] ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });
    await page.goto('http://localhost:7707/editor/editor.html', { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 3000));

    // select the Props category
    await page.evaluate(() => { const t = [...document.querySelectorAll('#assetTabs .ptab')].find(x => /prop/i.test(x.textContent)); if (t) t.click(); });
    await new Promise(r => setTimeout(r, 600));
    const counts = await page.evaluate(() => ({
      cards: document.querySelectorAll('#assetBody .asset').length,
      thumbs: document.querySelectorAll('#assetBody .asset img.ico').length,
      hasSearch: !!document.getElementById('assetSearch'),
      stars: document.querySelectorAll('#assetBody .asset .favstar').length
    }));
    await page.screenshot({ path: path.join(SHOTS, 'asset-browser.png') });

    // search filter
    await page.click('#assetSearch'); await page.type('#assetSearch', 'lamp');
    await new Promise(r => setTimeout(r, 400));
    const filtered = await page.evaluate(() => document.querySelectorAll('#assetBody .asset').length);

    // favourite the first result, then toggle favourites-only
    const fav = await page.evaluate(() => {
      const s = document.getElementById('assetSearch'); s.value = ''; s.dispatchEvent(new Event('input'));
      const star = document.querySelector('#assetBody .asset .favstar'); star.click();
      const saved = JSON.parse(localStorage.getItem('mossveil-ed-favs') || '{}');
      document.getElementById('assetFavToggle').click();
      const favCards = document.querySelectorAll('#assetBody .asset').length;
      return { savedCount: Object.keys(saved).length, favCards };
    });

    console.log('COUNTS:', JSON.stringify(counts));
    console.log('FILTERED(lamp):', filtered, ' FAV:', JSON.stringify(fav));
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = counts.cards > 3 && counts.thumbs > 0 && counts.hasSearch && counts.stars === counts.cards
      && filtered >= 1 && filtered < counts.cards && fav.savedCount === 1 && fav.favCards === 1 && !errs.length;
    console.log(ok ? 'ASSET BROWSER TEST: PASS' : 'ASSET BROWSER TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
