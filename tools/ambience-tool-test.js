// Ambience / soundscape editor (Edit ▸ Audio, roadmap #5): externalises the procedural ambient bed
// (cave wind + drone voices) to data/ambience.js (G.AMBIENCE_DATA), read + live-tuned by audio.js.
// Verifies engine API, byte-identical defaults, live re-tune of every param, revert, registration,
// zero outbound network and no page errors. Tunes in memory only (never save()s the dataset file).
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
      const T = G.Tools, A = G.Audio, MT = T.ambience, out = {};
      out.registered = T._test.toolIds().includes('ambience');
      out.inPalette = T._test.paletteSearch('ambience').some(l => /ambience|soundscape/i.test(l));
      out.roadmap = T.roadmapStats().done >= 33;
      out.engineApi = !!(A.ambExportCurrent && A.ambExportDefaults && A.ambApplyData && A.ambParams && A.ambSchema);

      // empty/full-default overlay => current soundscape is byte-identical to the built-in defaults
      out.defaultsIdentical = JSON.stringify(A.ambExportCurrent()) === JSON.stringify(A.ambExportDefaults());
      const sch = A.ambSchema();
      out.schemaOk = sch.wind.some(f => f[0] === 'gain') && sch.drone.some(f => f[0] === 'vol') && sch.bed.length === 1;
      out.threeDrones = A.ambExportDefaults().drones.length === 3;

      out.opened = T.openTool('ambience');

      // live re-tune every group; the engine's param view must reflect it (no audio start needed)
      MT.setWind('gain', 0.2);
      out.wind = A.ambParams().wind.gain === 0.2;
      MT.setWind('freq', 400);
      out.windFreq = A.ambParams().wind.freq === 400;
      MT.setBed(0.08);
      out.bed = A.ambParams().bed === 0.08;
      MT.setDrone(0, 'vol', 0.09);
      out.drone = A.ambParams().drones[0].vol === 0.09;
      MT.setDroneType(1, 'sawtooth');
      out.droneType = A.ambParams().drones[1].type === 'sawtooth';

      // revert restores the built-in soundscape
      MT.revert();
      const d = A.ambExportDefaults();
      out.reverted = A.ambParams().wind.gain === d.wind.gain && A.ambParams().drones[0].vol === d.drones[0].vol && A.ambParams().bed === d.bed;

      T.closeTool();
      return out;
    });

    console.log('AMBIENCE-TOOL:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['registered', 'inPalette', 'roadmap', 'engineApi', 'defaultsIdentical', 'schemaOk', 'threeDrones', 'opened', 'wind', 'windFreq', 'bed', 'drone', 'droneType', 'reverted'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'AMBIENCE-TOOL TEST: PASS' : 'AMBIENCE-TOOL TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
