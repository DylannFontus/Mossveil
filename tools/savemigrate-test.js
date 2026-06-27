// Save migration (src/savemigrate.js, roadmap #99): the engine half. Boots the real game and proves
// G.SaveMigrate: versionOf / needs, migrate() upgrades an old save in place (additive, stamps _v) and
// is idempotent, a current save is untouched, inspect() reports correctly, and a null save is safe.
// Then proves the main.js readSlot() seam: a seeded pre-version save in the active slot is migrated on
// boot (after a reload, G.save carries _v and the backfilled containers). Restores localStorage.
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');
const path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.resolve(__dirname, '..');
const URL = 'http://localhost:7707/index.html?level=gloom&spawn=1';
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
    await game.goto(URL, { waitUntil: 'load' });
    await wait(2400);

    // ---- unit tests on G.SaveMigrate ----
    const a = await game.evaluate(() => {
      const M = G.SaveMigrate, out = {};
      out.hasApi = !!(M && M.VERSION >= 1 && M.MIGRATIONS && M.versionOf && M.needs && M.migrate && M.inspect && M.pending);
      out.versionOf = M.versionOf({}) === 0 && M.versionOf({ _v: M.VERSION }) === M.VERSION;
      out.needs = M.needs({}) === true && M.needs({ _v: M.VERSION }) === false;

      // migrate an old save: additive + stamps _v, preserving existing data
      const s = { glimmer: 50, bench: { room: 'gloom' } };
      const r = M.migrate(s);
      out.migrated = r.from === 0 && r.to === M.VERSION && r.applied.indexOf(1) >= 0
        && s._v === M.VERSION && s.glimmer === 50 && s.bench.room === 'gloom'
        && typeof s.flags === 'object' && typeof s.spells === 'object' && Array.isArray(s.charmsOwned) && Array.isArray(s.charmsEquipped);
      // idempotent: re-running does nothing
      const snap = JSON.stringify(s); const r2 = M.migrate(s);
      out.idempotent = r2.applied.length === 0 && JSON.stringify(s) === snap;

      // a current, complete save is untouched
      const cur = { _v: M.VERSION, glimmer: 10, flags: { a: 1 }, spells: { bolt: 2 }, charmsOwned: ['x'], charmsEquipped: [] };
      const curSnap = JSON.stringify(cur); M.migrate(cur);
      out.currentUntouched = JSON.stringify(cur) === curSnap;

      // inspect
      const i0 = M.inspect({}); out.inspectOld = i0.needs === true && i0.version === 0 && i0.pending.length >= 1 && i0.missing.indexOf('flags') >= 0;
      const i1 = M.inspect(cur); out.inspectCur = i1.needs === false && i1.missing.length === 0;

      // null-safe
      out.nullSafe = (() => { try { const z = M.migrate(null); return z && z.applied.length === 0; } catch (e) { return false; } })();
      return out;
    });

    // ---- seam: seed a pre-version save in slot 2 + make it active, reload, check it migrated on boot ----
    const before = await game.evaluate(() => ({ slot2: localStorage.getItem('mossveil-slot-2'), active: localStorage.getItem('mossveil-active-slot') }));
    await game.evaluate(() => {
      localStorage.setItem('mossveil-slot-2', JSON.stringify({ data: { glimmer: 77, bench: { room: 'gloom' } }, updatedAt: Date.now(), createdAt: Date.now() }));
      localStorage.setItem('mossveil-active-slot', '2');
    });
    await game.reload({ waitUntil: 'load' });
    await wait(2400);
    const seam = await game.evaluate(() => ({ v: G.save && G.save._v, glimmer: G.save && G.save.glimmer, flags: !!(G.save && G.save.flags && typeof G.save.flags === 'object') }));
    await game.evaluate(b => {
      if (b.slot2 === null) localStorage.removeItem('mossveil-slot-2'); else localStorage.setItem('mossveil-slot-2', b.slot2);
      if (b.active === null) localStorage.removeItem('mossveil-active-slot'); else localStorage.setItem('mossveil-active-slot', b.active);
    }, before);

    const all = Object.assign({}, a, { seam: seam.v === 1 && seam.glimmer === 77 && seam.flags === true });
    console.log('SAVEMIGRATE-ENGINE:', JSON.stringify(all, null, 1));
    console.log('boot-migrated G.save:', JSON.stringify(seam));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['hasApi', 'versionOf', 'needs', 'migrated', 'idempotent', 'currentUntouched', 'inspectOld', 'inspectCur', 'nullSafe', 'seam'];
    const ok = keys.every(k => all[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'SAVEMIGRATE-ENGINE TEST: PASS' : 'SAVEMIGRATE-ENGINE TEST: FAIL  (' + keys.filter(k => !all[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
