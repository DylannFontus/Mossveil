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
    R.last = { seed: R.seed, start: startState, frames: R.frames };
    save();
    status('saved ' + R.frames.length + ' frames  (F7 to replay)', 'rgba(20,90,55,.92)', 1800);
  };
  R.play = function (rec) {
    rec = rec || R.last;
    if (!rec || !rec.frames || !rec.frames.length) { status('no recording — F6 to record', 'rgba(130,40,40,.92)', 1400); return; }
    if (!G.World || !G.World.load || !G.player) { status('replay unavailable here', 'rgba(130,40,40,.92)', 1400); return; }
    R.stop();
    installSeed(rec.seed);
    try { G.World.load(rec.start.room, 'P'); G.player.reset(rec.start.x, rec.start.y); } catch (e) { status('replay load failed', 'rgba(130,40,40,.92)', 1400); restoreRandom(); return; }
    if (G.Main) G.Main.state = 'play';
    R._rec = rec; R.frameIdx = 0; R.playing = true; G.Input.playback(true);
    status('▶ REPLAY', 'rgba(40,95,150,.92)');
  };
  R.stop = function () {
    if (R.playing) { R.playing = false; if (G.Input) G.Input.playback(false); }
    R.recording = false;
    restoreRandom();
  };

  // once per frame, at the very start of the gameplay loop; returns the dt to use this frame
  R.frame = function (dt) {
    if (R.recording) { R.frames.push({ h: G.Input.snapshot(), dt: dt }); return dt; }
    if (R.playing) {
      const rec = R._rec;
      if (!rec || R.frameIdx >= rec.frames.length) { R.stop(); status('replay done', 'rgba(20,90,55,.92)', 1200); return dt; }
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
  });
})();
