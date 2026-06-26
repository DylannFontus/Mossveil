// Terrain brushes 2.0 (Scene tile-paint, roadmap #36): the brush gains new shapes — Outline rect, Ellipse,
// Replace (swap every matching tile), an X Mirror toggle that doubles every paint across the level centre,
// and an Alt+click eyedropper that picks a tile's material/tool. This test drives the new commit functions
// directly on the current level's tiles in memory (via G.__ed.terrainOps), asserts each shape writes the
// expected pattern, that mirror reflects a stamp, replace swaps a char globally, and eyedropper picks the
// right tool/material — then restores the original tiles. Zero outbound network, no page errors. Never save()s.
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
      const out = {}, ED = G.__ed, T = ED.terrainOps;
      out.roadmap = G.Tools.roadmapStats().done >= 42;
      out.hooks = !!(T && T.rectOutline && T.ellipse && T.replace && T.eyedrop && T.setMirror);

      ED.setTab('scene');
      const L = G.LEVELS[ED.currentId()];
      const snap = L.tiles.slice();              // restore at the end
      const get = (c, r) => T.tileAt(c, r);
      T.setAuto(false); T.setMirror(false);      // deterministic: no autotile rewrites
      const C0 = 2, R0 = 2, C1 = 8, R1 = 8, midc = (C0 + C1) >> 1, midr = (R0 + R1) >> 1;

      // clear a sandbox region to blank
      T.setTool('erase'); T.rectFill({ c: C0, r: R0 }, { c: C1, r: R1 });
      out.cleared = get(midc, midr) === ' ' && get(C0, R0) === ' ';

      // Outline rect: border is solid, interior stays blank
      T.setTool('solid'); T.setMat('#');
      T.rectOutline({ c: C0, r: R0 }, { c: C1, r: R1 });
      out.outline = get(C0, R0) === '#' && get(C1, R1) === '#' && get(C1, R0) === '#' && get(midc, midr) === ' ';

      // Ellipse: centre filled, bbox corners outside the oval stay blank
      T.setTool('erase'); T.rectFill({ c: C0, r: R0 }, { c: C1, r: R1 });
      T.setTool('solid');
      T.ellipse({ c: C0, r: R0 }, { c: C1, r: R1 });
      out.ellipse = get(midc, midr) === '#' && get(C0, R0) === ' ' && get(C1, R1) === ' ';

      // Mirror X: a single stamp on the left also paints the reflected column
      T.setTool('erase'); T.rectFill({ c: 0, r: R0 }, { c: L.w - 1, r: R0 });
      T.setTool('solid'); T.setMirror(true);
      T.stamp(3, R0);
      out.mirror = get(3, R0) === '#' && get(L.w - 1 - 3, R0) === '#';
      T.setMirror(false);

      // Replace: fill region with '#', then swap every '#' in the level for one-way '='
      T.setTool('erase'); T.rectFill({ c: C0, r: R0 }, { c: C1, r: R1 });
      T.setTool('solid'); T.setMat('#'); T.rectFill({ c: C0, r: R0 }, { c: C1, r: R1 });
      const had = get(C0, R0) === '#';
      T.setTool('oneway');                       // paintCh() becomes '='
      T.replace(C0, R0);
      out.replace = had && get(C0, R0) === '=' && get(C1, R1) === '=';

      // Eyedropper: stamp a known tile, scramble the material, then pick it back
      T.setTool('erase'); T.rectFill({ c: 0, r: R0 }, { c: L.w - 1, r: R0 });
      T.setTool('solid'); T.setMat('#'); T.stamp(4, R0);
      T.setMat('?');                             // bogus material
      T.eyedrop(4, R0);
      out.eyedropSolid = T.curTool() === 'solid' && T.mat() === '#';
      T.eyedrop(12, R0);                         // a blank tile → erase tool
      out.eyedropErase = T.curTool() === 'erase';

      // restore the real level tiles
      L.tiles = snap;
      out.restored = L.tiles === snap && get(C0, R0) === snap[R0][C0];
      return out;
    });

    console.log('TERRAIN-BRUSH:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['roadmap', 'hooks', 'cleared', 'outline', 'ellipse', 'mirror', 'replace', 'eyedropSolid', 'eyedropErase', 'restored'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'TERRAIN-BRUSH TEST: PASS' : 'TERRAIN-BRUSH TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
