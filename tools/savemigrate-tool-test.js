// Save migration inspector (roadmap #99): the editor half. The Save-migration tool reads the real save
// slots from localStorage and upgrades them via G.SaveMigrate. This snapshots every slot + the active
// key, seeds two scratch slots (one pre-version, one current), and asserts register / palette / #99-done
// / API, the engine passthrough (version / migrations / inspect), slots() reporting, migrateSlot writing
// a versioned save back, migrateAll, and the UI (slot rows + a per-slot Upgrade button + the migration
// chain). Restores all slots in finally; zero outbound network.
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
      const T = G.Tools, MT = T.savemigrate, M = G.SaveMigrate, out = {};
      const N = (G.Saves && G.Saves.MAX_SLOTS) || 5;
      const KEYS = []; for (let i = 0; i < N; i++) KEYS.push('mossveil-slot-' + i);
      KEYS.push('mossveil-active-slot');
      const backup = {}; KEYS.forEach(k => backup[k] = localStorage.getItem(k));
      try {
        out.registered = T._test.toolIds().includes('savemigrate');
        out.inPalette = T._test.paletteSearch('save migration').some(l => /save|migrat|upgrade/i.test(l));
        out.roadmap = T.ROADMAP.some(g => g.items.some(i => i[0] === 99 && i[2] === 'done'));
        out.api = !!(MT && MT.version && MT.migrations && MT.inspect && MT.slots && MT.migrateSlot && MT.migrateAll);

        // engine passthrough
        out.version = MT.version() === M.VERSION && M.VERSION >= 1;
        out.migrations = MT.migrations().length >= 1 && MT.migrations()[0].to === 1;
        out.inspectThru = MT.inspect({}).needs === true && MT.inspect({ _v: M.VERSION, glimmer: 0, flags: {}, spells: {}, charmsOwned: [], charmsEquipped: [] }).needs === false;

        // wipe the slots, then seed: slot 0 pre-version (needs), slot 1 current (ok)
        KEYS.forEach(k => localStorage.removeItem(k));
        localStorage.setItem('mossveil-slot-0', JSON.stringify({ data: { glimmer: 33, bench: { room: 'gloom' } }, updatedAt: 100, createdAt: 50 }));
        localStorage.setItem('mossveil-slot-1', JSON.stringify({ data: { _v: M.VERSION, glimmer: 9, flags: {}, spells: {}, charmsOwned: [], charmsEquipped: [] }, updatedAt: 200, createdAt: 60 }));

        const slots = MT.slots();
        out.slots = slots.length === N && slots[0].present === true && slots[0].needs === true && slots[1].present === true && slots[1].needs === false && slots[2].present === false;
        out.missing = slots[0].missing.indexOf('flags') >= 0;

        // migrate slot 0 → version stamped, containers added, written back to localStorage
        const res = MT.migrateSlot(0);
        out.migrated = res && res.applied.indexOf(1) >= 0;
        const after0 = JSON.parse(localStorage.getItem('mossveil-slot-0')).data;
        out.persisted = after0._v === M.VERSION && after0.glimmer === 33 && typeof after0.flags === 'object' && Array.isArray(after0.charmsOwned);
        out.nowOk = MT.slots()[0].needs === false;

        // migrateAll is a no-op now (all current)
        const allRes = MT.migrateAll();
        out.migrateAll = allRes.every(r => r.applied.length === 0);

        // UI
        out.opened = T.openTool('savemigrate');
        const host = document.querySelector('.tc-host');
        out.slotRows = /Slot 0/.test(host.textContent) && /Slot 1/.test(host.textContent);
        out.chain = /MIGRATION CHAIN/.test(host.textContent) && /baseline containers/.test(host.textContent);
        // seed a stale slot again and confirm an Upgrade button appears + works from the UI
        localStorage.setItem('mossveil-slot-3', JSON.stringify({ data: { glimmer: 5 }, updatedAt: 300, createdAt: 70 }));
        T.closeTool(); T.openTool('savemigrate');
        const host2 = document.querySelector('.tc-host');
        const upBtn = Array.prototype.slice.call(host2.querySelectorAll('button')).find(b => /Upgrade/.test(b.textContent));
        out.upgradeBtn = !!upBtn; if (upBtn) upBtn.click();
        out.upgradeClick = JSON.parse(localStorage.getItem('mossveil-slot-3')).data._v === M.VERSION;
        T.closeTool();
      } finally {
        KEYS.forEach(k => localStorage.removeItem(k));
        Object.keys(backup).forEach(k => { if (backup[k] !== null) localStorage.setItem(k, backup[k]); });
      }
      return out;
    });

    console.log('SAVEMIGRATE-TOOL:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['registered', 'inPalette', 'roadmap', 'api', 'version', 'migrations', 'inspectThru', 'slots', 'missing', 'migrated', 'persisted', 'nowOk', 'migrateAll', 'opened', 'slotRows', 'chain', 'upgradeBtn', 'upgradeClick'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'SAVEMIGRATE-TOOL TEST: PASS' : 'SAVEMIGRATE-TOOL TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
