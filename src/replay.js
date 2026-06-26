// MOSSVEIL — replay.js : record & deterministic playback. F6 toggles recording,
// F7 plays the last recording, F8 stops. A recording captures, per gameplay frame, the
// held-input snapshot + the frame dt, plus the start room/position and an RNG seed. On
// playback the room is rebuilt (deterministic), the player is reset to the start, Math.random
// is seeded to the same value, and the recorded input + dt are fed back frame-for-frame —
// so movement and seeded systems reproduce. Great for demo loops and debugging a bad run.
(function () {
  const R = G.Replay = { recording: false, playing: false, frames: [], frameIdx: 0, last: null, seed: 0, _rec: null };
  let el, origRandom = null, startState = null, clearTimer = 0;

  function ensure() {
    if (el) return;
    el = document.createElement('div');
    el.style.cssText = 'position:fixed;right:10px;top:10px;z-index:99999;font:12px ui-monospace,Consolas,monospace;' +
      'padding:5px 10px;border-radius:6px;pointer-events:none;display:none;color:#fff;border:1px solid rgba(255,255,255,.22);text-shadow:0 1px 2px #000';
    document.body.appendChild(el);
  }
  function status(txt, col, hold) {
    ensure(); clearTimeout(clearTimer);
    el.style.display = txt ? 'block' : 'none'; el.textContent = txt || '';
    el.style.background = col || 'rgba(8,12,12,.85)';
    if (hold) clearTimer = setTimeout(() => { if (!R.recording && !R.playing) status(''); }, hold);
  }

  function installSeed(seed) { if (origRandom || !(G.U && G.U.mulberry32)) return; origRandom = Math.random; Math.random = G.U.mulberry32(seed >>> 0); }
  function restoreRandom() { if (origRandom) { Math.random = origRandom; origRandom = null; } }

  // ---- regression layer: named cases + baseline capture + assert (roadmap #64) -------------------
  // A recorded run becomes a reusable regression CASE: its deterministic seed + input frames PLUS a
  // baseline fingerprint of the end state (room, player position, hp, soul). Replaying a case and
  // comparing the end state to its baseline catches gameplay regressions when tuning / levels change.
  // The case library + last results live in localStorage, shared same-origin with the editor's
  // Regression manager tool. Recording (F6/stop) now also stores the baseline; F9 runs every case.
  const LIBKEY = 'mossveil_regression', RESKEY = 'mossveil_regression_results';
  function loadCases() { try { return JSON.parse(localStorage.getItem(LIBKEY) || '{}') || {}; } catch (e) { return {}; } }
  function saveCases(o) { try { localStorage.setItem(LIBKEY, JSON.stringify(o)); } catch (e) { } }
  function loadResults() { try { return JSON.parse(localStorage.getItem(RESKEY) || '{}') || {}; } catch (e) { return {}; } }
  function saveResults(o) { try { localStorage.setItem(RESKEY, JSON.stringify(o)); } catch (e) { } }

  // a deterministic, robust fingerprint of the run's end state
  function snapshotState() {
    const p = G.player, r = G.room, rnd = v => Math.round(v * 100) / 100;
    return {
      room: r ? r.id : null,
      x: p ? rnd(p.body.x) : 0, y: p ? rnd(p.body.y) : 0,
      hp: p ? p.hp : 0, maxHp: p ? p.maxHp : 0, soul: p ? Math.round(p.soul || 0) : 0,
      frames: (R._rec && R._rec.frames.length) || R.frames.length || 0
    };
  }
  R.snapshotState = snapshotState;

  // compare an expected baseline to an actual end state: positions allow a small epsilon (float
  // drift); room / hp / maxHp / soul are exact. Returns the list of differing fields (empty = pass).
  function compareState(exp, act) {
    const d = [], near = (a, b) => Math.abs((a || 0) - (b || 0)) <= 0.15;
    if (exp.room !== act.room) d.push({ k: 'room', exp: exp.room, act: act.room });
    if (!near(exp.x, act.x)) d.push({ k: 'x', exp: exp.x, act: act.x });
    if (!near(exp.y, act.y)) d.push({ k: 'y', exp: exp.y, act: act.y });
    if (exp.hp !== act.hp) d.push({ k: 'hp', exp: exp.hp, act: act.hp });
    if (exp.maxHp !== act.maxHp) d.push({ k: 'maxHp', exp: exp.maxHp, act: act.maxHp });
    if (exp.soul !== act.soul) d.push({ k: 'soul', exp: exp.soul, act: act.soul });
    return d;
  }
  R.compareState = compareState;

  // case-library accessors (used by the in-game F9 hotkey + the editor's Regression manager tool)
  R.listCases = function () { const o = loadCases(); return Object.keys(o).map(n => Object.assign({ name: n }, o[n])); };
  R.getCase = function (n) { const c = loadCases()[n]; return c ? Object.assign({ name: n }, c) : null; };
  R.saveCase = function (name, rec) {
    rec = rec || R.last;
    if (!name || !rec || !rec.frames || !rec.frames.length) return false;
    const o = loadCases();
    o[name] = { seed: rec.seed, start: rec.start, frames: rec.frames, expect: rec.expect || null, savedAt: Date.now() };
    saveCases(o); return true;
  };
  R.deleteCase = function (n) { const o = loadCases(); if (!(n in o)) return false; delete o[n]; saveCases(o); const r = loadResults(); if (n in r) { delete r[n]; saveResults(r); } return true; };
  R.renameCase = function (a, b) { const o = loadCases(); if (!(a in o) || !b || (b in o)) return false; o[b] = o[a]; delete o[a]; saveCases(o); const r = loadResults(); if (a in r) { r[b] = r[a]; delete r[a]; saveResults(r); } return true; };
  R.loadResults = loadResults;

  // replay a recording / named case to completion, then compare its end state to the baseline → result
  R.assert = function (recOrName, cb) {
    const named = typeof recOrName === 'string';
    const rec = named ? R.getCase(recOrName) : recOrName;
    const name = named ? recOrName : (rec && rec.name) || null;
    if (!rec || !rec.frames || !rec.frames.length) { if (cb) cb({ name: name, pass: null, error: 'no recording' }); return; }
    R.play(rec, {
      label: '✓ ASSERT' + (name ? ' ' + name : ''), color: 'rgba(60,80,150,.92)',
      onDone: function (ok) {
        const actual = snapshotState();
        const exp = rec.expect || null;
        const diffs = (ok && exp) ? compareState(exp, actual) : [];
        const pass = !ok ? null : (exp ? diffs.length === 0 : null);
        const result = { name: name, pass: pass, expected: exp, actual: ok ? actual : null, diffs: diffs, at: Date.now(), error: ok ? null : 'replay failed' };
        if (name) { const all = loadResults(); all[name] = result; saveResults(all); }
        if (cb) cb(result);
      }
    });
  };

  // run every saved case in turn, aggregating pass / fail (the in-game F9 hotkey + editor "Run all")
  R.assertAll = function (cb) {
    const cases = R.listCases(), results = []; let i = 0;
    if (!cases.length) { if (cb) cb({ total: 0, passed: 0, results: [] }); return; }
    (function next() {
      if (i >= cases.length) { if (cb) cb({ total: cases.length, passed: results.filter(r => r.pass).length, results: results }); return; }
      R.assert(cases[i++].name, function (r) { results.push(r); next(); });
    })();
  };

  R.startRec = function () {
    if (!G.player || !G.room || !G.Main || G.Main.state !== 'play') { status('can’t record now', 'rgba(130,40,40,.92)', 1200); return; }
    R.stop();
    R.seed = ((Date.now() ^ (Math.random() * 1e9)) >>> 0);
    installSeed(R.seed);
    startState = { room: G.room.id, x: G.player.body.x, y: G.player.body.y };
    R.frames = []; R.recording = true;
    status('● REC', 'rgba(155,30,30,.92)');
  };
  R.stopRec = function () {
    if (!R.recording) return;
    R.recording = false; restoreRandom();
    R.last = { seed: R.seed, start: startState, frames: R.frames, expect: snapshotState() };
    save();
    status('saved ' + R.frames.length + ' frames + baseline  (F7 replay · save as a case in the editor)', 'rgba(20,90,55,.92)', 2200);
  };
  R.play = function (rec, opts) {
    opts = opts || {};
    rec = rec || R.last;
    if (!rec || !rec.frames || !rec.frames.length) { status('no recording — F6 to record', 'rgba(130,40,40,.92)', 1400); if (opts.onDone) opts.onDone(false); return; }
    if (!G.World || !G.World.load || !G.player) { status('replay unavailable here', 'rgba(130,40,40,.92)', 1400); if (opts.onDone) opts.onDone(false); return; }
    R.stop();
    installSeed(rec.seed);
    try { G.World.load(rec.start.room, 'P'); G.player.reset(rec.start.x, rec.start.y); } catch (e) { status('replay load failed', 'rgba(130,40,40,.92)', 1400); restoreRandom(); if (opts.onDone) opts.onDone(false); return; }
    if (G.Main) G.Main.state = 'play';
    R._rec = rec; R.frameIdx = 0; R.playing = true; R._onDone = opts.onDone || null; G.Input.playback(true);
    status(opts.label || '▶ REPLAY', opts.color || 'rgba(40,95,150,.92)');
  };
  R.stop = function () {
    if (R.playing) { R.playing = false; if (G.Input) G.Input.playback(false); }
    R.recording = false; R._onDone = null;
    restoreRandom();
  };

  // once per frame, at the very start of the gameplay loop; returns the dt to use this frame
  R.frame = function (dt) {
    if (R.recording) { R.frames.push({ h: G.Input.snapshot(), dt: dt }); return dt; }
    if (R.playing) {
      const rec = R._rec;
      if (!rec || R.frameIdx >= rec.frames.length) { const d = R._onDone; R.stop(); status('replay done', 'rgba(20,90,55,.92)', 1200); if (d) d(true); return dt; }
      const f = rec.frames[R.frameIdx++]; G.Input.inject(f.h); return f.dt;
    }
    return dt;
  };

  function save() { try { localStorage.setItem('mossveil_replay', JSON.stringify(R.last)); } catch (e) { } }
  function load() { try { const s = JSON.parse(localStorage.getItem('mossveil_replay')); if (s && s.frames) R.last = s; } catch (e) { } }
  load();

  window.addEventListener('keydown', function (e) {
    if (e.key === 'F6') { e.preventDefault(); R.recording ? R.stopRec() : R.startRec(); }
    else if (e.key === 'F7') { e.preventDefault(); R.play(); }
    else if (e.key === 'F8') { e.preventDefault(); R.stop(); status('stopped', 'rgba(8,12,12,.85)', 900); }
    else if (e.key === 'F9') { e.preventDefault(); R.assertAll(function (s) { status('regressions: ' + s.passed + '/' + s.total + ' passed', s.total && s.passed === s.total ? 'rgba(20,90,55,.92)' : 'rgba(150,60,30,.92)', 3200); }); }
  });
})();
