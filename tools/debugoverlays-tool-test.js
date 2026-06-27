// Visual debug overlays (roadmap #60): the editor half. The Debug-overlays tool (Edit ▸ Tools) is a
// remote for the running game's G.Debug, reached across the Play-here iframe. This injects a stand-in
// target (so the test needs no live game), opens the tool, and asserts it registers / is in the palette
// / marks #60 done, that every control (the inspector toggle + the five overlay layers + all-off) calls
// through and the reported status follows, that the UI renders them, that clicking a layer / the
// inspector drives the target and updates the banner, and that with no game it shows the empty state.
// Zero outbound network.
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
      const T = G.Tools, MT = T.debugoverlays, out = {};

      // ---- registration / palette / roadmap / API surface ----
      out.registered = T._test.toolIds().includes('debugoverlays');
      out.inPalette = T._test.paletteSearch('hitbox').some(l => /debug|overlay|hitbox/i.test(l)) || T._test.paletteSearch('debug overlay').length > 0;
      out.roadmap = T.ROADMAP.some(g => g.items.some(i => i[0] === 60 && i[2] === 'done'));
      out.engineApi = !!(MT && MT.setLayer && MT.toggleLayer && MT.allLayersOff && MT.setInspector && MT.toggleInspector && MT.status && MT.available && MT.LAYERS && MT.LAYERS.length === 5);

      // ---- with NO game, controls fail gracefully and status reports unavailable ----
      MT._target = () => null;
      out.unavailable = MT.available() === false && MT.status().available === false && MT.toggleLayer('hitboxes') === false && MT.setInspector(true) === false && MT.allLayersOff() === false;
      out.openedEmpty = T.openTool('debugoverlays');
      const emptyTxt = document.querySelector('.tc-host').textContent;
      out.emptyState = /No game is running/i.test(emptyTxt) && /Play here/i.test(emptyTxt);
      T.closeTool();

      // ---- inject a stand-in target that mimics G.Debug; assert the remote drives it ----
      const KEYS = ['hitboxes', 'velocity', 'collision', 'probes', 'ids'];
      const fake = {
        on: false, sel: null, _layers: { hitboxes: false, velocity: false, collision: false, probes: false, ids: false },
        setLayer(k, v) { if (k in this._layers) { this._layers[k] = !!v; return true; } return false; },
        toggleLayer(k) { if (k in this._layers) { this._layers[k] = !this._layers[k]; return this._layers[k]; } return false; },
        allLayersOff() { for (const k in this._layers) this._layers[k] = false; },
        setInspector(v) { this.on = !!v; if (!this.on) this.sel = null; },
        toggle() { this.on = !this.on; },
        anyLayer() { return Object.values(this._layers).some(Boolean); },
        status() { return { on: this.on, sel: this.sel, room: 'gloom', entities: 7, layers: Object.assign({}, this._layers), anyLayer: this.anyLayer(), inGame: true }; }
      };
      MT._target = () => fake;

      out.available = MT.available() === true && MT.status().available === true;
      out.setLayerThru = MT.setLayer('hitboxes', true) === true && fake._layers.hitboxes === true && MT.status().layers.hitboxes === true;
      out.toggleLayerThru = MT.toggleLayer('velocity') === true && fake._layers.velocity === true; MT.toggleLayer('velocity');
      out.toggleLayerOff = fake._layers.velocity === false;
      out.inspectorThru = MT.setInspector(true) === true && fake.on === true && MT.status().on === true;
      out.toggleInspectorThru = MT.toggleInspector() === true && fake.on === false;
      out.allOffThru = (MT.setLayer('collision', true), MT.allLayersOff()) === true && MT.status().anyLayer === false;

      // ---- UI: inspector toggle + layer grid render, and clicking them drives the target ----
      fake.allLayersOff(); fake.setInspector(false);
      out.opened = T.openTool('debugoverlays');
      const host = document.querySelector('.tc-host');
      const btns = () => Array.prototype.slice.call(host.querySelectorAll('button'));
      out.hasInspector = btns().some(b => /Inspector panel/.test(b.textContent));
      out.hasLayers = btns().some(b => /Hitboxes/.test(b.textContent)) && btns().some(b => /Collision/.test(b.textContent)) && btns().some(b => /Labels/.test(b.textContent));

      const hitBtn = btns().find(b => /Hitboxes/.test(b.textContent)); if (hitBtn) hitBtn.click();
      out.layerClick = fake._layers.hitboxes === true && /OVERLAYS ON/i.test(document.querySelector('.tc-host').textContent);

      const insBtn = btns().find(b => /Inspector panel/.test(b.textContent)); if (insBtn) insBtn.click();
      out.inspectorClick = fake.on === true && /INSPECTOR ON/i.test(document.querySelector('.tc-host').textContent);

      const offBtn = btns().find(b => /Turn all layers off/.test(b.textContent)); if (offBtn) offBtn.click();
      out.allOffClick = fake.anyLayer() === false;

      T.closeTool();
      MT._target = null;   // restore
      return out;
    });

    console.log('DEBUGOVERLAYS-TOOL:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['registered', 'inPalette', 'roadmap', 'engineApi', 'unavailable', 'openedEmpty', 'emptyState', 'available', 'setLayerThru', 'toggleLayerThru', 'toggleLayerOff', 'inspectorThru', 'toggleInspectorThru', 'allOffThru', 'opened', 'hasInspector', 'hasLayers', 'layerClick', 'inspectorClick', 'allOffClick'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'DEBUGOVERLAYS-TOOL TEST: PASS' : 'DEBUGOVERLAYS-TOOL TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
