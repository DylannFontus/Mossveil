// Decor & Foliage browser (roadmap #18): the editor-only catalog of every decor silhouette kind
// (W.DECOR_KINDS / W.SIL), with a live preview (W.SIL + G.Thumb), the biomes that scatter each kind
// (pal.deco) and the level props that place it, plus a lint pass. This test reads the real engine
// registries for the catalog/biome side, then swaps G.LEVELS for a synthetic world of decor props
// (restored in finally — committed data never touched, never save()d) to drive scan/lint/setKind, and
// asserts the catalog, biome usage, prop resolution, lint, the inline kind write, preview (canvas or
// graceful null) and that the tool renders cards. Zero outbound network, no page errors.
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
    const ed = await browser.newPage();
    ed.on('pageerror', e => errs.push('[editor] ' + e.message));
    ed.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });
    await ed.setRequestInterception(true);
    ed.on('request', r => { const u = r.url(); if (/^https?:\/\//.test(u) && !u.includes('localhost') && !u.includes('127.0.0.1')) { netHits++; r.abort(); } else r.continue(); });
    await ed.goto('http://localhost:7707/editor/editor.html', { waitUntil: 'load' });
    await wait(2800);

    const o = await ed.evaluate(async () => {
      const out = {}, T = G.Tools, D = T.decor;
      out.roadmap = T.roadmapStats().done >= 45;
      out.hooks = !!(D && D.kinds && D.biomesFor && D.decorProps && D.propsFor && D.lint && D.setKind && D.preview);

      // catalog (real engine registries)
      const ks = D.kinds();
      const mush = ks.find(k => k.name === 'mushroom'), stal = ks.find(k => k.name === 'stalactite');
      out.catalog = ks.length > 5 && !!mush && mush.anchor === 'standing' && mush.valid && !!stal && stal.anchor === 'hanging' && stal.valid;
      out.biomeUse = D.biomesFor('mushroom').length >= 1;   // e.g. verdant scatters mushroom

      // preview: a canvas (swiftshader) or a graceful null — never a throw
      const cv = D.preview('mushroom');
      out.previewType = cv === null || (cv && cv.tagName === 'CANVAS');
      out.previewCanvas = !!(cv && cv.tagName === 'CANVAS');   // informational

      const orig = G.LEVELS;
      try {
        const firstBiome = orig[Object.keys(orig)[0]].biome;
        G.LEVELS = {
          __dctest: {
            title: 'DC Test', biome: firstBiome, w: 40, h: 20, props: [
              { type: 'decor', kind: 'tree', x: 1, y: 1 },          // 0  valid standing
              { type: 'decor', kind: 'bogus_decor', x: 2, y: 1 },   // 1  unknown -> mushroom
              { type: 'decor', kind: 'stalactite', x: 3, y: 5 }     // 2  hanging kind placed
            ]
          }
        };

        const dp = D.decorProps();
        out.scan3 = dp.length === 3;
        out.resolve = dp[1].kind === 'mushroom' && dp[1].raw === 'bogus_decor';
        out.propsForTree = D.propsFor('tree').length === 1 && D.propsFor('tree')[0].idx === 0;
        out.propsForMush = D.propsFor('mushroom').length === 1;   // the bogus one resolves here

        const li = D.lint();
        out.lintUnknown = li.some(i => i.kind === 'unknown-prop-kind' && i.idx === 1);

        out.setOk = D.setKind('__dctest', 1, 'fern') && G.LEVELS.__dctest.props[1].kind === 'fern';
        out.setReflected = D.propsFor('fern').length === 1;
        out.setBad = D.setKind('__dctest', 9, 'tree') === false;   // out-of-range idx

        D.openInTool();
        out.dom = Array.from(document.querySelectorAll('.tc-pal-item')).some(c => c.textContent.indexOf('mushroom') >= 0);
        T.closeTool();
      } finally { G.LEVELS = orig; }
      return out;
    });

    console.log('DECOR:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['roadmap', 'hooks', 'catalog', 'biomeUse', 'previewType', 'scan3', 'resolve', 'propsForTree', 'propsForMush', 'lintUnknown', 'setOk', 'setReflected', 'setBad', 'dom'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'DECOR TEST: PASS' : 'DECOR TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
