// Authoring-tools framework (tools-core.js): Edit menu, Editor Settings panel, command
// palette, theme, autosave, roadmap, and the generic /api/data dataset layer round-trip.
// Editor-only, fully offline apart from the local save server.
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.resolve(__dirname, '..');
const wait = ms => new Promise(r => setTimeout(r, ms));
const TEST_NAME = 'zztoolstest';

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

    const o = await ed.evaluate(async (TEST_NAME) => {
      const T = G.Tools, out = {};
      out.exists = !!T;
      // UI injection
      out.editBtn = !!document.getElementById('btnEdit');
      out.fileSettingsRow = !!document.getElementById('btnEditorSettings');
      // settings sections registered
      out.settingIds = T._test.settingIds();
      // open the settings panel + a couple of sections
      T._test.openSettings('roadmap');
      out.settingsOpen = document.getElementById('settingsHost').classList.contains('on');
      out.roadmapRendered = /shipped|planned/.test(document.querySelector('.tc-set-body').textContent);
      T._test.openSettings('keybinds');
      out.keybindRendered = /command palette/i.test(document.querySelector('.tc-set-body').textContent);
      // roadmap accounting: 100 total, 2 cut (70 & 77), the 4 foundation features shipped
      out.roadmap = T._test.roadmapStats();
      // command palette indexes actions + settings (and tools as they register)
      const palAll = T._test.paletteSearch('');
      out.palAll = palAll.length;
      out.palSave = T._test.paletteSearch('save all').some(l => /save all/i.test(l));
      out.palRoadmap = T._test.paletteSearch('roadmap').some(l => /roadmap/i.test(l));
      // register a throwaway authoring tool and open it through the framework
      T.registerTool({ id: 'zz-demo', label: 'Demo Tool', icon: '★', group: 'Tools', build: (host, api) => { api.el('div', { id: 'zzDemoMarker' }, host, 'hi'); } });
      out.toolInPalette = T._test.paletteSearch('demo tool').some(l => /demo tool/i.test(l));
      out.toolOpened = T._test.openTool('zz-demo') && !!document.getElementById('zzDemoMarker');
      T.closeTool();
      // data layer round-trip: save a dataset, read it back from the server
      const payload = { tracks: { intro: { bpm: 90 } }, v: 1 };
      out.saved = await T._test.saveData(TEST_NAME, 'ZZTEST', payload);
      const back = await T._test.loadData(TEST_NAME, null);
      out.loaded = back && back.v === 1 && back.tracks && back.tracks.intro.bpm === 90;
      // shared editor hooks the autosave/recovery engine relies on
      out.hooks = !!(G.__ed && G.__ed.snapshot && G.__ed.loadWorld && G.__ed.isDirty && G.__ed.actions);
      const snap = G.__ed.snapshot();
      out.snapOK = snap && snap.levels && typeof snap.id !== 'undefined';
      return out;
    }, TEST_NAME);

    console.log('TOOLS-CORE:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const ok = o.exists && o.editBtn && o.fileSettingsRow
      && ['appearance', 'editor', 'keybinds', 'roadmap'].every(id => o.settingIds.includes(id))
      && o.settingsOpen && o.roadmapRendered && o.keybindRendered
      && o.roadmap.total === 100 && o.roadmap.skip === 2 && o.roadmap.done >= 4
      && o.palAll > 5 && o.palSave && o.palRoadmap
      && o.toolInPalette && o.toolOpened
      && o.saved === true && o.loaded === true
      && o.hooks && o.snapOK
      && netHits === 0 && !errs.length;
    console.log(ok ? 'TOOLS-CORE TEST: PASS' : 'TOOLS-CORE TEST: FAIL');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally {
    await browser.close(); server.kill();
    // clean up the throwaway dataset files the round-trip wrote
    for (const ext of ['.json', '.js']) { const f = path.join(ROOT, 'data', TEST_NAME + ext); try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (_) { } }
  }
})();
