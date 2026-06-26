// Save slots — GAME-SIDE seam test (roadmap #86). The editor never loads main.js / ui.js, so this
// boots the real game and proves the seams: G.Saves carries the byte-identical defaults, Main.slotInfo()
// composes its detail line from the data-driven wording (default + retuned), and the slots screen draws
// SLOT_VIEW (= G.Saves.slotCount() = 5) slot buttons. Restores defaults at the end. No page errors.
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

    const o = await game.evaluate(async () => {
      const out = {}, M = G.Main, S = G.Saves;
      S.applyData(null);
      out.hasModule = !!S && S.slotCount() === 5;
      out.dataIdentical = S.label('wings') === 'Moth Wings' && S.label('bossPlural') === ' bosses felled' && S.label('emptyTitle') === '— empty vessel —' && S.label('restedPrefix') === 'rested ';
      // main.js slotInfo() composes the detail from the data-driven wording
      const mkSlot = () => ({ data: { wings: true, bosses: { a: true, b: true } }, updatedAt: Date.now() - 200000 });
      out.detailDefault = M.slotInfo(mkSlot()).detail === 'Moth Wings  ·  2 bosses felled';
      S.applyData({ labels: { wings: 'WingZ', bossPlural: ' foes down' } });
      out.detailTuned = M.slotInfo(mkSlot()).detail === 'WingZ  ·  2 foes down';
      S.applyData(null);
      // ui.js SLOT_VIEW seam: the slots screen draws slotCount buttons
      const prev = M.state;
      M.slots = []; M.state = 'slots';
      await new Promise(r => setTimeout(r, 300));
      out.slotsDrawn = G.UI.slotButtons && G.UI.slotButtons.length === 5;
      M.state = prev;
      out.restored = S.slotCount() === 5 && S.label('wings') === 'Moth Wings';
      return out;
    });

    console.log('RESULT:', JSON.stringify(o));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['hasModule', 'dataIdentical', 'detailDefault', 'detailTuned', 'slotsDrawn', 'restored'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'SAVES GAME TEST: PASS' : 'SAVES GAME TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
