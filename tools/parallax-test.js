// Parallax & backdrop — GAME-SIDE seam test (roadmap #73). The room backdrop (sky/wall plane depths +
// the receding silhouette LAYERS + per-depth silhouette shaping) had its tuning hardcoded in world.js's
// buildLayer/backdrop section; it's now overlaid from data/parallax.js (G.PARALLAX_DATA). This boots the
// REAL game and proves: (1) the defaults are byte-identical to the OLD hardcoded values (a literal
// snapshot), (2) a freshly built room actually places the silhouette layers at the overlay's depths
// (default -30/-18/-9 + sky/wall planes), (3) retuning the overlay and rebuilding the room moves the
// layers to the new depths/count (old depths gone), and (4) restoring + rebuilding is clean. Unlike the
// audio seams, this is real THREE geometry, so it's verified directly in the live scene graph.
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

    const o = await game.evaluate(() => {
      const out = {}, P = G.Parallax, W = G.World;
      out.hasModule = !!(P && P.exportDefaults && P.layers && P.skyZ && W && W.load);
      // the OLD hardcoded backdrop tuning, captured verbatim — the defaults must match this exactly
      const OLD = {
        sky: -80, wall: -48,
        layers: [{ z: -30, density: 1, scale: 1 }, { z: -18, density: 1, scale: 1 }, { z: -9, density: 1, scale: 1 }],
        shape: {
          marginBase: 14, marginPer: 0.9, baseYBase: 1.2, baseYPer: 0.1, scaleBase: 1, scalePer: 0.05,
          humpBase: 3.2, humpPer: 0.22, topYPer: 0.12, hangChance: 0.55, stalactiteChance: 0.35,
          hangGapMin: 3, hangGapMax: 9, hangScaleMin: 0.7, hangScaleMax: 1.6,
          standGapMin: 4, standGapMax: 11, standScaleMin: 0.8, standScaleMax: 2
        }
      };
      out.defaultsOld = JSON.stringify(P.exportDefaults()) === JSON.stringify(OLD);
      out.overlayIdentical = JSON.stringify(G.PARALLAX_DATA) === JSON.stringify(OLD);
      out.dataIdentical = JSON.stringify(P.exportCurrent()) === JSON.stringify(P.exportDefaults());
      // the sorted depths of the parallax silhouette layers in the live room (tagged userData.pxLayer)
      const layerZs = () => { const zs = []; G.room.group.children.forEach(c => { if (c.userData && c.userData.pxLayer != null) zs.push(Math.round(c.userData.pxLayer)); }); return zs.sort((a, b) => a - b); };
      // is there ANY object near depth z anywhere in the room group (the sky/wall planes)
      const hasZ = (z, eps) => { let f = false; G.room.group.traverse(n => { if (Math.abs(n.position.z - z) < (eps || 0.4)) f = true; }); return f; };

      let threw = false;
      try {
        // default room: layers at -30,-18,-9 + sky(-80)/wall(-48) planes
        P.applyData(null);
        W.load('gloom');
        out.defLayers = JSON.stringify(layerZs()) === JSON.stringify([-30, -18, -9]);
        out.defSky = hasZ(-80); out.defWall = hasZ(-48);
        // retune: two layers at new depths + new backdrop plane depths
        P.applyData({ sky: -100, wall: -60, layers: [{ z: -50, density: 1, scale: 1 }, { z: -25, density: 1, scale: 1 }] });
        W.load('gloom');
        const reZs = layerZs();
        out.reLayers = JSON.stringify(reZs) === JSON.stringify([-50, -25]);
        out.reNoOld = reZs.indexOf(-30) < 0 && reZs.indexOf(-18) < 0 && reZs.indexOf(-9) < 0;
        out.reSky = hasZ(-100); out.reWall = hasZ(-60);
        // restore defaults + rebuild clean
        P.applyData(null); W.load('gloom');
        out.restored = JSON.stringify(layerZs()) === JSON.stringify([-30, -18, -9]);
      } catch (e) { threw = true; out._err = e.message; }
      out.noThrow = !threw;
      return out;
    });

    console.log('RESULT:', JSON.stringify(o));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['hasModule', 'defaultsOld', 'overlayIdentical', 'dataIdentical', 'defLayers', 'defSky', 'defWall', 'reLayers', 'reNoOld', 'reSky', 'reWall', 'restored', 'noThrow'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'PARALLAX GAME TEST: PASS' : 'PARALLAX GAME TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
