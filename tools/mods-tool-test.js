// Mods manager + API reference (roadmap #98): the editor half. The Mods tool stores external mods in
// localStorage and generates a live reference of the moddable surface. This snapshots the mod store,
// asserts register / palette / #98-done / API, the stored-mod CRUD (add / enable / setCode / remove),
// the surface() reference (data overlays + content registries + the api lines), the template, and the
// UI (mods tab with an editor + the API-reference tab). Restores the mod store; zero outbound network.
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
      const T = G.Tools, MT = T.mods, out = {};
      const KEY = 'mossveil_mods';
      const backup = localStorage.getItem(KEY);
      try {
        out.registered = T._test.toolIds().includes('mods');
        out.inPalette = T._test.paletteSearch('mods').some(l => /mod|api/i.test(l));
        out.roadmap = T.ROADMAP.some(g => g.items.some(i => i[0] === 98 && i[2] === 'done'));
        out.api = !!(MT && MT.stored && MT.saveStored && MT.surface && MT.template && MT.addMod && MT.setEnabled && MT.setCode && MT.removeMod);

        // start clean
        MT.saveStored([]);
        const id = MT.addMod('mymod', 'My Mod', '/* x */');
        out.add = MT.stored().length === 1 && MT.stored()[0].id === id && MT.stored()[0].enabled === true;
        out.enable = MT.setEnabled(id, false) === true && MT.stored()[0].enabled === false;
        out.setCode = MT.setCode(id, 'G.Mods.register({id:"z",apply:function(){}})') === true && /register/.test(MT.stored()[0].code);
        const id2 = MT.addMod('mymod', 'Dup', '/* y */');   // unique-id
        out.uniqueId = id2 !== id && MT.stored().length === 2;
        out.remove = MT.removeMod(id) === true && MT.stored().length === 1;

        // surface reference
        const s = MT.surface();
        out.surfaceData = Array.isArray(s.data) && s.data.length > 5 && s.data.indexOf('TUTORIAL_DATA') >= 0 && s.data.indexOf('LEVELS') >= 0;
        out.surfaceReg = s.registries.some(r => r.name === 'G.LEVELS') && s.api.length >= 4;
        out.template = /G\.Mods\.register/.test(MT.template());

        // UI: mods tab + editor
        MT.saveStored([]);
        out.opened = T.openTool('mods');
        let host = document.querySelector('.tc-host');
        const newBtn = Array.prototype.slice.call(host.querySelectorAll('button')).find(b => /\+ New/.test(b.textContent)); if (newBtn) newBtn.click();
        host = document.querySelector('.tc-host');
        const modRow = Array.prototype.slice.call(host.querySelectorAll('.tc-pal-item')).find(x => /Mod/.test(x.textContent)); if (modRow) modRow.click();
        out.editor = !!document.querySelector('.tc-host').querySelector('textarea');

        // UI: API reference tab
        const refTab = Array.prototype.slice.call(document.querySelector('.tc-host').querySelectorAll('button')).find(b => /API reference/.test(b.textContent)); if (refTab) refTab.click();
        const reftxt = document.querySelector('.tc-host').textContent;
        out.refTab = /Data overlays you can patch/.test(reftxt) && /addLevel/.test(reftxt) && /G\.LEVELS/.test(reftxt);
        T.closeTool();
      } finally {
        if (backup === null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, backup);
      }
      return out;
    });

    console.log('MODS-TOOL:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['registered', 'inPalette', 'roadmap', 'api', 'add', 'enable', 'setCode', 'uniqueId', 'remove', 'surfaceData', 'surfaceReg', 'template', 'opened', 'editor', 'refTab'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'MODS-TOOL TEST: PASS' : 'MODS-TOOL TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
