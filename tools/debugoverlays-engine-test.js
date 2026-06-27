// Visual debug overlays (src/debug.js, roadmap #60): the engine half. Boots the real game and proves
// the overlay-layer system on the live G.Debug — every layer flips, status reflects it, and the draw
// runs without throwing with all layers + the inspector + a selected entity. Also proves the ONE ui.js
// guard change: with a layer on but the inspector OFF, G.UI.draw still calls G.Debug.draw (overlays
// show without F4); with everything off it does NOT (fully inert by default). Zero outbound network.
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
    await game.setViewport({ width: 1000, height: 620 });
    game.on('pageerror', e => errs.push('[game] ' + e.message));
    game.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });
    await game.setRequestInterception(true);
    game.on('request', r => { const u = r.url(); if (/^https?:\/\//.test(u) && !u.includes('localhost') && !u.includes('127.0.0.1')) { netHits++; r.abort(); } else r.continue(); });
    await game.goto('http://localhost:7707/index.html?level=gloom&spawn=1', { waitUntil: 'load' });
    await wait(2400);

    const o = await game.evaluate(() => {
      const D = G.Debug, out = {};
      out.hasApi = !!(D && D.LAYERS && D.layers && D.setLayer && D.toggleLayer && D.allLayersOff && D.setInspector && D.anyLayer && D.status && D.draw);

      // inert by default
      D.setInspector(false); D.allLayersOff();
      out.inertDefault = D.on === false && D.anyLayer() === false && D.status().anyLayer === false;

      // every layer flips on, status mirrors, anyLayer follows
      const keys = D.LAYERS.map(l => l[0]);
      out.layerKeys = keys.length === 5 && keys.join(',') === 'hitboxes,velocity,collision,probes,ids';
      let allFlip = true;
      for (const k of keys) { D.setLayer(k, true); if (!D.layers[k] || !D.status().layers[k]) allFlip = false; }
      out.everyLayerOn = allFlip && D.anyLayer() === true && D.status().anyLayer === true;
      out.toggleLayer = D.toggleLayer('hitboxes') === false && D.layers.hitboxes === false && D.toggleLayer('hitboxes') === true && D.layers.hitboxes === true;
      out.badKey = D.setLayer('nope', true) === false && D.toggleLayer('nope') === false;

      // draw runs clean with ALL layers + inspector + a selected entity
      D.setInspector(true);
      const sel = { isEnemy: true, alive: true, type: 'gnatling', hp: 3, maxHp: 3, dir: 1, body: { x: G.player.body.x + 2, y: G.player.body.y, w: 0.8, h: 0.8, vx: -2, vy: 1, onGround: true, wallL: true, hitHead: true } };
      G.room.entities.push(sel); D.sel = sel;
      out.drawAll = (() => { try { G.UI.draw(0.016); return true; } catch (e) { return String(e); } })();
      const si = G.room.entities.indexOf(sel); if (si >= 0) G.room.entities.splice(si, 1);
      D.sel = null;

      // ---- the ui.js guard: overlays draw without F4, and nothing draws when fully off ----
      // (A) layer on, inspector OFF → G.UI.draw must call Debug.draw
      D.setInspector(false); D.allLayersOff(); D.setLayer('collision', true);
      let calledA = false; const origA = D.draw; D.draw = function () { calledA = true; return origA.apply(this, arguments); };
      G.UI.draw(0.016); D.draw = origA;
      out.guardFiresOnLayer = calledA === true;

      // (B) everything off → G.UI.draw must NOT call Debug.draw (inert)
      D.allLayersOff(); D.setInspector(false);
      let calledB = false; const origB = D.draw; D.draw = function () { calledB = true; return origB.apply(this, arguments); };
      G.UI.draw(0.016); D.draw = origB;
      out.inertNoDraw = calledB === false;

      // (C) inspector on alone still draws (F4 path unchanged)
      D.setInspector(true);
      let calledC = false; const origC = D.draw; D.draw = function () { calledC = true; return origC.apply(this, arguments); };
      G.UI.draw(0.016); D.draw = origC;
      out.guardFiresOnInspector = calledC === true;

      // allLayersOff clears, status shape complete
      D.setInspector(false); D.setLayer('velocity', true); D.setLayer('probes', true);
      D.allLayersOff();
      out.allOff = D.anyLayer() === false && Object.values(D.layers).every(v => v === false);
      const s = D.status();
      out.statusShape = s.room === G.room.id && typeof s.entities === 'number' && s.inGame === true && 'layers' in s && 'anyLayer' in s && 'on' in s;

      D.setInspector(false); D.allLayersOff();   // leave the game clean
      return out;
    });

    console.log('DEBUGOVERLAYS-ENGINE:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const need = ['hasApi', 'inertDefault', 'layerKeys', 'everyLayerOn', 'toggleLayer', 'badKey', 'guardFiresOnLayer', 'inertNoDraw', 'guardFiresOnInspector', 'allOff', 'statusShape'];
    const ok = need.every(k => o[k] === true) && o.drawAll === true && netHits === 0 && !errs.length;
    console.log(ok ? 'DEBUGOVERLAYS-ENGINE TEST: PASS' : 'DEBUGOVERLAYS-ENGINE TEST: FAIL  (' + need.filter(k => o[k] !== true).join(', ') + (o.drawAll !== true ? ' drawAll=' + o.drawAll : '') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
