// Post-FX & screen feedback — GAME-SIDE seam test (roadmap #74). The editor never runs post.js, so
// this boots the real game and proves the seams: the grade-rate / AO defaults are seeded from G.PostFX,
// and the impact aberration/flash spikes read G.PostFX (via the read-only Post._aberr()/Post._flash()
// hooks). The aberration/flash checks are SYNC (no frame between set and read) so they're exact; the
// decay check forces frames via requestAnimationFrame. Restores defaults at the end. No page errors.
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
      const out = {}, P = G.PostFX, Post = G.Post;
      const frames = async n => { for (let i = 0; i < n; i++) await new Promise(r => requestAnimationFrame(r)); };
      P.applyData(null);
      out.hasModule = !!P && P.aberrMax() === 2.5;
      const DEF = { gradeRate: 3, ssao: 0.6, aberrMax: 2.5, aberrDefault: 0.6, aberrDecay: 6, flashDefault: 0.4, flashDecay: 5 };
      out.dataIdentical = JSON.stringify(P.exportDefaults()) === JSON.stringify(DEF);
      // init seams: gradeRate / ssao were seeded from G.PostFX at post.js load
      out.gradeRateInit = Post.gradeRate === 3;
      out.ssaoInit = Math.abs(Post.ssao - 0.6) < 1e-6;
      // aberration punch seams (sync: no frame runs between set and read -> exact)
      P.applyData({ aberrMax: 100 });
      let a0 = Post._aberr(); Post.punch(2);
      out.punchAdds = Math.abs((Post._aberr() - a0) - 2) < 1e-6;
      let a1 = Post._aberr(); Post.punch();                 // no-arg -> aberrDefault (0.6)
      out.punchDefault = Math.abs((Post._aberr() - a1) - 0.6) < 1e-6;
      P.applyData({ aberrMax: 1 }); Post.punch(100);
      out.aberrCap = Post._aberr() === 1;                   // clamped to aberrMax
      // flash default seam
      P.applyData({ flashDefault: 0.7 });
      const f0 = Post._flash(); Post.flash();
      out.flashDefault = Post._flash() === Math.max(f0, 0.7);
      // decay seam: high decay + forced frames -> aberration drops sharply
      P.applyData({ aberrMax: 100, aberrDecay: 50 });
      Post.punch(4);
      const aB = Post._aberr();
      await frames(8);
      const aA = Post._aberr();
      out.aberrDecays = aA < aB * 0.5;
      P.applyData(null);                                    // restore
      out.restored = P.aberrMax() === 2.5 && P.gradeRate() === 3;
      return out;
    });

    console.log('RESULT:', JSON.stringify(o));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['hasModule', 'dataIdentical', 'gradeRateInit', 'ssaoInit', 'punchAdds', 'punchDefault', 'aberrCap', 'flashDefault', 'aberrDecays', 'restored'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'POSTSTACK GAME TEST: PASS' : 'POSTSTACK GAME TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
