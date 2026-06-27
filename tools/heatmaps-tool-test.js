// Play/death heatmaps (roadmap #66): the editor half. The Heatmaps tool (Edit ▸ Tools) is BOTH a
// decoupled viewer (reads the captured data from localStorage and draws a per-room schematic + heatmap)
// AND a live remote for the game's G.Heatmap across the Play-here iframe. This seeds a deterministic
// dataset in localStorage, opens the tool, and asserts it registers / is in the palette / marks #66
// done, that the viewer lists rooms + reports stats + actually PAINTS the canvas, that clear works, and
// that with an injected stand-in target the capture/overlay toggles drive it; plus the empty state.
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
      const T = G.Tools, MT = T.heatmaps, out = {};
      const KEY = 'mossveil_heatmap';
      const saved = localStorage.getItem(KEY);   // restore at the end
      const canvasPainted = host => {
        const cv = host.querySelector('canvas'); if (!cv) return false;
        const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
        for (let i = 0; i < d.length; i += 4 * 89) if (Math.abs(d[i] - 10) > 10 || Math.abs(d[i + 1] - 16) > 10 || Math.abs(d[i + 2] - 20) > 10) return true;
        return false;
      };
      try {
        // ---- registration / palette / roadmap / API surface ----
        out.registered = T._test.toolIds().includes('heatmaps');
        out.inPalette = T._test.paletteSearch('heatmap').some(l => /heatmap|death|path/i.test(l));
        out.roadmap = T.ROADMAP.some(g => g.items.some(i => i[0] === 66 && i[2] === 'done'));
        out.engineApi = !!(MT && MT.data && MT.rooms && MT.roomStat && MT.clearRoom && MT.clearAll && MT.setCapture && MT.setShow && MT.liveStatus && MT.available);

        // ---- empty state (no data, no game) ----
        MT._target = () => null;
        localStorage.removeItem(KEY);
        out.openedEmpty = T.openTool('heatmaps');
        out.emptyState = /No heatmap data yet/i.test(document.querySelector('.tc-host').textContent);
        T.closeTool();

        // ---- seed a deterministic dataset; the VIEWER reads it from localStorage ----
        const seed = {
          gloom: { w: 40, h: 24, cells: { '5,3': 4, '6,3': 2, '20,10': 1 }, deaths: [{ x: 5, y: 4 }, { x: 21, y: 11 }], samples: 7, updated: 1 },
          arena: { w: 30, h: 18, cells: { '2,2': 1 }, deaths: [], samples: 1, updated: 1 }
        };
        localStorage.setItem(KEY, JSON.stringify(seed));

        out.dataRead = Object.keys(MT.data()).length === 2;
        out.rooms = MT.rooms().indexOf('gloom') >= 0 && MT.rooms().indexOf('arena') >= 0;
        const gs = MT.roomStat('gloom');
        out.roomStat = gs.samples === 7 && gs.deaths === 2 && gs.cells === 3 && gs.peak === 4 && gs.w === 40 && gs.h === 24;

        // ---- open the viewer: room picker + stats + the canvas actually paints ----
        out.opened = T.openTool('heatmaps');
        const host = document.querySelector('.tc-host');
        const btns = () => Array.prototype.slice.call(host.querySelectorAll('button'));
        out.roomButtons = btns().some(b => /gloom/.test(b.textContent)) && btns().some(b => /arena/.test(b.textContent));
        out.statsShown = /7 samples/.test(host.textContent) && /2 deaths/.test(host.textContent);
        out.painted = canvasPainted(host);

        // select the other room → stats follow
        const arenaBtn = btns().find(b => /arena/.test(b.textContent)); if (arenaBtn) arenaBtn.click();
        out.selectRoom = /1 samples/.test(document.querySelector('.tc-host').textContent);

        // clear the selected room via the button (no live target → edits localStorage)
        const clrBtn = () => Array.prototype.slice.call(document.querySelector('.tc-host').querySelectorAll('button')).find(b => /Clear this room/.test(b.textContent));
        const cb = clrBtn(); if (cb) cb.click();
        out.clearedRoom = MT.rooms().indexOf('arena') < 0 && MT.rooms().indexOf('gloom') >= 0;

        // clear all → back to empty state
        const caBtn = Array.prototype.slice.call(document.querySelector('.tc-host').querySelectorAll('button')).find(b => /Clear all/.test(b.textContent)); if (caBtn) caBtn.click();
        out.clearedAll = MT.rooms().length === 0 && /No heatmap data yet/i.test(document.querySelector('.tc-host').textContent);
        T.closeTool();

        // ---- inject a stand-in target; assert the live remote drives it ----
        const fake = {
          enabled: false, show: false, _room: 'gloom', _samples: 12, _deaths: 3,
          setEnabled(v) { this.enabled = !!v; return this.enabled; },
          setShow(v) { this.show = !!v; return this.show; },
          status() { return { enabled: this.enabled, show: this.show, room: this._room, inGame: true, samples: this._samples, deaths: this._deaths, cells: 5, peak: 4 }; },
          flush() { return true; }, reload() { return {}; },
          clearRoom() { this._cleared = (this._cleared || 0) + 1; return true; },
          clearAll() { this._clearedAll = (this._clearedAll || 0) + 1; return true; }
        };
        MT._target = () => fake;
        out.available = MT.available() === true && MT.liveStatus().samples === 12;
        out.setCaptureThru = MT.setCapture(true) === true && fake.enabled === true;
        out.setShowThru = MT.setShow(true) === true && fake.show === true;
        fake.setEnabled(false); fake.setShow(false);

        // open with a live target → capture + overlay toggles render and drive the fake
        out.openedLive = T.openTool('heatmaps');
        const host2 = document.querySelector('.tc-host');
        const btns2 = () => Array.prototype.slice.call(host2.querySelectorAll('button'));
        out.liveControls = btns2().some(b => /Capture/.test(b.textContent)) && btns2().some(b => /In-game overlay/.test(b.textContent));
        const capBtn = btns2().find(b => /Capture/.test(b.textContent)); if (capBtn) capBtn.click();
        out.captureClick = fake.enabled === true;
        const ovBtn = Array.prototype.slice.call(document.querySelector('.tc-host').querySelectorAll('button')).find(b => /In-game overlay/.test(b.textContent)); if (ovBtn) ovBtn.click();
        out.overlayClick = fake.show === true;
        T.closeTool();
      } finally {
        MT._target = null;
        if (saved === null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, saved);
      }
      return out;
    });

    console.log('HEATMAPS-TOOL:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['registered', 'inPalette', 'roadmap', 'engineApi', 'openedEmpty', 'emptyState', 'dataRead', 'rooms', 'roomStat', 'opened', 'roomButtons', 'statsShown', 'painted', 'selectRoom', 'clearedRoom', 'clearedAll', 'available', 'setCaptureThru', 'setShowThru', 'openedLive', 'liveControls', 'captureClick', 'overlayClick'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'HEATMAPS-TOOL TEST: PASS' : 'HEATMAPS-TOOL TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
