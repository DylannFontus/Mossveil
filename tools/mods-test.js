// Mod API (src/mods.js, roadmap #98): the engine half. Boots the real game and proves G.Mods: register
// (+ dedupe + reject invalid), the api handed to apply() (addLevel / patch / on), applyAll runs each mod
// once, emit fires handlers, loadStored evals only ENABLED localStorage mods, status reports. Then proves
// the ONE main.js boot seam: a mod stored in localStorage is loaded + applied ON BOOT (after a reload its
// level appears in G.LEVELS). Restores localStorage + the scratch globals. Zero outbound network.
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

    const a = await game.evaluate(() => {
      const M = G.Mods, out = {};
      out.hasApi = !!(M && M.register && M.applyAll && M.boot && M.emit && M.stored && M.loadStored && M.api && M.status && M.reset);
      M.reset();

      // register (+ dedupe + reject invalid)
      out.register = M.register({ id: 't1', name: 'T1', apply(api) { api.addLevel('__modlvl__', { title: 'M', w: 10, h: 10, tiles: [] }); api.on('ready', () => { window.__modReady = true; }); window.__modApplied = true; } }) === true;
      out.dedupe = M.register({ id: 't1', apply() { } }) === false;
      out.rejectInvalid = M.register({}) === false && M.register({ id: 'x' }) === false;

      // applyAll runs each mod once; the api worked (level added)
      const n = M.applyAll();
      out.applied = n >= 1 && !!(G.LEVELS && G.LEVELS.__modlvl__) && window.__modApplied === true;
      out.appliedOnce = M.applyAll() === 0;

      // emit fires the ready handler
      out.emit = M.emit('ready') >= 1 && window.__modReady === true;

      // patch deep-merges into a data global
      M.register({ id: 't2', apply(api) { api.patch('__SCRATCH_DATA__', { a: 1, nested: { b: 2 } }); } });
      M.register({ id: 't3', apply(api) { api.patch('__SCRATCH_DATA__', { nested: { c: 3 } }); } });
      M.applyAll();
      out.patch = G.__SCRATCH_DATA__ && G.__SCRATCH_DATA__.a === 1 && G.__SCRATCH_DATA__.nested.b === 2 && G.__SCRATCH_DATA__.nested.c === 3;

      // loadStored evals ONLY enabled mods
      M.reset();
      localStorage.setItem('mossveil_mods', JSON.stringify([
        { id: 'sm', name: 'SM', enabled: true, code: "G.Mods.register({id:'sm',apply:function(api){api.addLevel('__sm__',{title:'x',w:8,h:8,tiles:[]});}})" },
        { id: 'off', name: 'OFF', enabled: false, code: "window.__shouldNotRun=true;" }
      ]));
      const loaded = M.loadStored();
      M.applyAll();
      out.loadStored = loaded === 1 && !!(G.LEVELS && G.LEVELS.__sm__) && window.__shouldNotRun === undefined;

      // status
      const st = M.status();
      out.status = st.registered >= 1 && st.applied >= 1 && st.stored === 2;

      // clean the live engine bits (localStorage handled below, around the reload)
      M.reset();
      delete G.LEVELS.__modlvl__; delete G.LEVELS.__sm__; delete G.__SCRATCH_DATA__;
      return out;
    });

    // ---- seam: a stored mod is loaded + applied ON BOOT ----
    const before = await game.evaluate(() => localStorage.getItem('mossveil_mods'));
    await game.evaluate(() => localStorage.setItem('mossveil_mods', JSON.stringify([
      { id: 'bootmod', name: 'Boot Mod', enabled: true, code: "G.Mods.register({id:'bootmod',apply:function(api){api.addLevel('__bootlvl__',{title:'b',w:8,h:8,tiles:[]});}})" }
    ])));
    await game.reload({ waitUntil: 'load' });
    await wait(2400);
    const seam = await game.evaluate(() => ({ lvl: !!(G.LEVELS && G.LEVELS.__bootlvl__), reg: !!(G.Mods.get && G.Mods.get('bootmod')) }));
    await game.evaluate(b => { if (b === null) localStorage.removeItem('mossveil_mods'); else localStorage.setItem('mossveil_mods', b); }, before);

    const all = Object.assign({}, a, { seam: seam.lvl === true && seam.reg === true });
    console.log('MODS-ENGINE:', JSON.stringify(all, null, 1));
    console.log('boot seam:', JSON.stringify(seam));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['hasApi', 'register', 'dedupe', 'rejectInvalid', 'applied', 'appliedOnce', 'emit', 'patch', 'loadStored', 'status', 'seam'];
    const ok = keys.every(k => all[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'MODS-ENGINE TEST: PASS' : 'MODS-ENGINE TEST: FAIL  (' + keys.filter(k => !all[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
