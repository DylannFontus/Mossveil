// Play/death heatmaps (src/heatmap.js, roadmap #66): the engine half. Boots the real game and proves
// G.Heatmap: capture is inert when disabled, records bin the player position into per-room cells and
// persist to localStorage, deaths are recorded (and only while enabled), roomStat/status report
// correctly, the overlay draws without throwing, and the ONE main.js seam fires in the LIVE LOOP (with
// the game in 'play' the sampler is called each frame). Also proves the ui.js guard: G.UI.draw calls
// G.Heatmap.draw when the overlay is shown and not otherwise. Zero outbound network.
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

    // ---- stage A: direct asserts on the live G.Heatmap + arm the live-loop seam ----
    const a = await game.evaluate(() => {
      const H = G.Heatmap, p = G.player, out = {};
      out.hasApi = !!(H && H.sample && H.record && H.onDeath && H.flush && H.roomStat && H.status && H.draw && H.setEnabled && H.clearAll && H.clearRoom);

      H.clearAll();            // start from a clean slate
      const id = H.room();
      out.room = id;

      // disabled → capture is inert
      H.setEnabled(false);
      H.sample(p, 1); H.record(id, p.body.x, p.body.y);   // record() is unconditional, sample() gated…
      // …so prove sample() specifically does nothing while disabled:
      H.clearAll(); H.setEnabled(false); H.sample(p, 1); H.sample(p, 1);
      out.disabledNoSample = !H.data[id];

      // enabled → record bins into integer cells
      H.clearAll(); H.setEnabled(true);
      H.record(id, 3.2, 4.9); H.record(id, 3.8, 4.1); H.record(id, 10.0, 2.0);
      const d = H.data[id];
      out.binned = !!d && d.cells['3,4'] === 2 && d.cells['10,2'] === 1 && d.samples === 3;
      out.dims = d.w > 0 && d.h > 0;   // pulled from G.room.w/h

      // persisted to localStorage
      H.flush();
      const ls = JSON.parse(localStorage.getItem('mossveil_heatmap') || '{}');
      out.persisted = !!ls[id] && ls[id].cells['3,4'] === 2;

      // death recorded only while enabled
      H.onDeath({ body: { x: 5, y: 6 } });
      out.deathOn = H.data[id].deaths.length === 1 && H.data[id].deaths[0].x === 5;
      H.setEnabled(false); H.onDeath({ body: { x: 9, y: 9 } });
      out.deathOffIgnored = H.data[id].deaths.length === 1;

      // roomStat + status
      const st = H.roomStat(id);
      out.stat = st.samples === 3 && st.deaths === 1 && st.cells === 2 && st.peak === 2;
      H.setEnabled(true);
      const s = H.status();
      out.status = s.enabled === true && s.room === id && s.samples === 3 && s.deaths === 1 && s.inGame === true;

      // overlay draws without throwing
      H.setShow(true);
      out.drawOk = (() => { try { G.UI.draw(0.016); return true; } catch (e) { return String(e); } })();

      // ui.js guard: shown → G.UI.draw calls H.draw; hidden → it does not
      H.setShow(true);
      let calledOn = false; const o1 = H.draw; H.draw = function () { calledOn = true; return o1.apply(this, arguments); };
      G.UI.draw(0.016); H.draw = o1; out.guardOn = calledOn === true;
      H.setShow(false);
      let calledOff = false; const o2 = H.draw; H.draw = function () { calledOff = true; return o2.apply(this, arguments); };
      G.UI.draw(0.016); H.draw = o2; out.guardOff = calledOff === false;

      // clearRoom / clearAll
      out.clearRoom = H.clearRoom(id) === true && !H.data[id];
      H.record(id, 1, 1); out.clearAll = H.clearAll() === true && Object.keys(H.data).length === 0;

      // arm the live-loop sample seam: clean room data, enable, force play, clear cinematic freezes
      // (a death queued hitStop → dt=0 at headless ~4fps would stall the if(dt>0) block).
      H.clearAll(); H.setEnabled(true); H._acc = 999;   // _acc high so the very next sample records
      if (G.Main) { G.Main.state = 'play'; G.Main.transLock = 0; }
      G.hitStop = 0; G.slowMo = 0;
      if (G.DebugTime && G.DebugTime.reset) G.DebugTime.reset();
      p.dead = false; p.hp = p.maxHp;
      // spy: count main-loop calls to H.sample over the wait
      window.__hmCalls = 0; const os = H.sample.bind(H); H.sample = function (pp, dt) { window.__hmCalls++; return os(pp, dt); };
      return out;
    });

    await wait(700);   // several RAFs; the main-loop seam must call H.sample each play frame

    const b = await game.evaluate(() => {
      const H = G.Heatmap, out = {};
      out.seamCalls = window.__hmCalls | 0;
      out.seamRecorded = !!(H.data[H.room()] && (H.data[H.room()].samples > 0));
      H.setEnabled(false); H.setShow(false); H.clearAll();   // leave the game clean
      return out;
    });
    const seamFires = b.seamCalls >= 1;      // main.js called the sampler in the live loop
    const seamRecorded = b.seamRecorded;     // and it actually binned at least one sample

    const all = Object.assign({}, a, { seamFires, seamRecorded });
    console.log('HEATMAPS-ENGINE:', JSON.stringify(all, null, 1));
    console.log('seam call count:', b.seamCalls);
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const need = ['hasApi', 'disabledNoSample', 'binned', 'dims', 'persisted', 'deathOn', 'deathOffIgnored', 'stat', 'status', 'guardOn', 'guardOff', 'clearRoom', 'clearAll', 'seamFires', 'seamRecorded'];
    const ok = need.every(k => all[k] === true) && all.drawOk === true && netHits === 0 && !errs.length;
    console.log(ok ? 'HEATMAPS-ENGINE TEST: PASS' : 'HEATMAPS-ENGINE TEST: FAIL  (' + need.filter(k => all[k] !== true).join(', ') + (all.drawOk !== true ? ' drawOk=' + all.drawOk : '') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
