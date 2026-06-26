// Level regression net (src/replay.js, roadmap #64): the engine half. Boots the real game, records a
// short run (which now also captures an end-state baseline), then asserts that REPLAYING it reproduces
// the baseline exactly (pass), that a corrupted baseline is caught (fail + diff), and that the named
// case library + result persistence + assertAll all work. Deterministic; the seeded replay reproduces
// the same end state. Restores the localStorage keys it touches. Zero outbound network, no page errors.
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

    // ---- stage A: clear the store + start recording ----
    const a = await game.evaluate(() => {
      const R = G.Replay, K = ['mossveil_replay', 'mossveil_regression', 'mossveil_regression_results'];
      const orig = {}; K.forEach(k => orig[k] = localStorage.getItem(k));
      window.__orig = orig;
      localStorage.removeItem('mossveil_regression'); localStorage.removeItem('mossveil_regression_results');
      const out = {};
      out.hasApi = !!(R && R.assert && R.assertAll && R.saveCase && R.listCases && R.snapshotState && R.compareState);
      if (G.Main) G.Main.state = 'play';
      R.startRec();
      out.recording = R.recording === true;
      return out;
    });

    await wait(500);   // let the loop record idle frames

    // ---- stage B: stop, then run the full assert + library suite ----
    const o = await game.evaluate(async () => {
      const R = G.Replay, out = {};
      const runAssert = (rec) => new Promise(res => {
        let done = false; const to = setTimeout(() => { if (!done) { done = true; res({ timeout: true }); } }, 7000);
        R.assert(rec, r => { if (!done) { done = true; clearTimeout(to); res(r); } });
      });

      R.stopRec();
      out.stopped = R.recording === false;
      out.recFrames = (R.last && R.last.frames || []).length;          // info: real F6 recording length
      out.recBaseline = !!(R.last && R.last.expect && R.last.expect.room);   // stopRec captured a baseline

      // Build a CONTROLLED synthetic recording (move right a few frames, then idle) so the run has real
      // movement and a deterministic length — independent of headless RAF speed.
      const room = G.room.id, px = G.player.body.x, py = G.player.body.y;
      const frames = [];
      for (let i = 0; i < 10; i++) frames.push({ h: i < 6 ? { right: 1 } : {}, dt: 1 / 60 });
      const syn = { seed: 4242, start: { room: room, x: px, y: py }, frames: frames };

      // calibrate: replay once with NO baseline to learn the deterministic end state, then adopt it
      const cal = await runAssert(syn);
      out.calibrated = cal.pass === null && !!cal.actual && cal.actual.room === room;
      syn.expect = cal.actual;

      // 1) replaying the recording reproduces its baseline exactly → PASS, no diffs
      const r1 = await runAssert(syn);
      out.assertPass = r1.pass === true && Array.isArray(r1.diffs) && r1.diffs.length === 0;

      // 2) a corrupted hp baseline is caught → FAIL with an hp diff
      const bad = JSON.parse(JSON.stringify(syn)); bad.expect.hp = (bad.expect.hp || 5) - 1;
      const r2 = await runAssert(bad);
      out.assertFail = r2.pass === false && r2.diffs.some(d => d.k === 'hp');

      // 3) a moved-position baseline is caught too
      const bad2 = JSON.parse(JSON.stringify(syn)); bad2.expect.x = (bad2.expect.x || 0) + 6;
      const r3 = await runAssert(bad2);
      out.assertPosFail = r3.pass === false && r3.diffs.some(d => d.k === 'x');

      // 4) named case library: save (both the real recording and the synthetic) / list / get
      out.savedReal = R.saveCase('rgr_real', R.last) === true && R.listCases().some(c => c.name === 'rgr_real');
      out.saved = R.saveCase('rgr_test', syn) === true;
      out.listed = R.listCases().some(c => c.name === 'rgr_test');
      const got = R.getCase('rgr_test');
      out.gotCase = !!got && got.expect && got.expect.room === syn.expect.room && got.frames.length === syn.frames.length;

      // 5) rename, then assert the NAMED case → result is persisted to localStorage
      out.renamed = R.renameCase('rgr_test', 'rgr_test2') === true;
      const r4 = await runAssert('rgr_test2');
      out.namedPass = r4.pass === true && r4.name === 'rgr_test2';
      out.resultPersisted = (() => { try { const all = JSON.parse(localStorage.getItem('mossveil_regression_results')); return all && all.rgr_test2 && all.rgr_test2.pass === true; } catch (e) { return false; } })();

      // 6) assertAll aggregates every saved case (rgr_real + rgr_test2)
      const agg = await new Promise(res => R.assertAll(s => res(s)));
      out.assertAll = agg.total === 2 && agg.passed === 2;

      // 7) delete removes the case AND its result
      out.deleted = R.deleteCase('rgr_test2') === true && !R.listCases().some(c => c.name === 'rgr_test2');

      // restore the original keys
      const orig = window.__orig || {};
      ['mossveil_replay', 'mossveil_regression', 'mossveil_regression_results'].forEach(k => { if (orig[k] == null) localStorage.removeItem(k); else localStorage.setItem(k, orig[k]); });
      out.cleaned = true;
      return out;
    });

    console.log('REGRESSION-ENGINE:', JSON.stringify(Object.assign({}, a, o), null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = { ...a, ...o };
    const need = ['hasApi', 'recording', 'stopped', 'recBaseline', 'calibrated', 'assertPass', 'assertFail', 'assertPosFail', 'savedReal', 'saved', 'listed', 'gotCase', 'renamed', 'namedPass', 'resultPersisted', 'assertAll', 'deleted', 'cleaned'];
    const ok = need.every(k => keys[k]) && keys.recFrames >= 1 && netHits === 0 && !errs.length;
    console.log(ok ? 'REGRESSION-ENGINE TEST: PASS' : 'REGRESSION-ENGINE TEST: FAIL  (' + need.filter(k => !keys[k]).join(', ') + (keys.recFrames >= 1 ? '' : ' recFrames') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
