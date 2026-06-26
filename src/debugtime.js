// MOSSVEIL — debugtime.js : playtest TIME CONTROLS (roadmap #62). Pause / slow / fast / single-step
// the live game through ONE dt seam in the main loop, with no other engine change. In-play hotkeys:
//   \  pause / resume      [  slower      ]  faster      .  step one frame (pauses)      0  reset
// Only ever touches the gameplay dt while Main.state === 'play', so menus, cutscenes and dialogue
// are never affected. Works standalone and inside the editor's Play-here — the editor's Time-controls
// tool (Edit ▸ Tools) drives this very object across the same-origin iframe.
(function () {
  const SCALES = [0.1, 0.25, 0.5, 1, 2, 4];   // the preset multiplier ladder [ / ] walk through
  const DT = G.DebugTime = {
    scale: 1,        // current time multiplier (1 = real time)
    paused: false,   // hard pause — gameplay dt is forced to 0
    _step: 0,        // queued single-step frames (each advances exactly one frame while paused)
    _onChange: null, // optional subscriber (the editor tool repaints its UI from this)
    SCALES: SCALES.slice()
  };

  function changed() { if (typeof DT._onChange === 'function') { try { DT._onChange(DT.status()); } catch (e) { } } }

  DT.status = () => ({ scale: DT.scale, paused: DT.paused, stepping: DT._step > 0, modified: DT.paused || DT.scale !== 1 });

  DT.setScale = s => { DT.scale = Math.max(0.01, Math.min(16, +s || 1)); changed(); return DT.scale; };
  DT.slower = () => { const i = SCALES.indexOf(DT.scale); return DT.setScale(i > 0 ? SCALES[i - 1] : Math.max(SCALES[0], DT.scale / 2)); };
  DT.faster = () => { const i = SCALES.indexOf(DT.scale); return DT.setScale(i >= 0 && i < SCALES.length - 1 ? SCALES[i + 1] : Math.min(16, DT.scale * 2)); };
  DT.pause = () => { DT.paused = true; changed(); };
  DT.resume = () => { DT.paused = false; DT._step = 0; changed(); };
  DT.toggle = () => { DT.paused ? DT.resume() : DT.pause(); };
  DT.step = n => { DT._step += Math.max(1, n | 0 || 1); DT.paused = true; changed(); };   // single-step implies pause
  DT.reset = () => { DT.scale = 1; DT.paused = false; DT._step = 0; changed(); };

  // THE ENGINE SEAM — main.js calls this for the gameplay dt. Returns the (possibly) scaled / zeroed dt.
  DT.apply = (dt, rdt, state) => {
    if (state !== 'play') return dt;                 // never touch menus / cutscenes / dialogue
    if (DT.paused) {
      if (DT._step > 0) { DT._step--; if (DT._step === 0) changed(); return (rdt || dt) * DT.scale; }  // advance one frame
      return 0;
    }
    return dt * DT.scale;
  };

  // ignore the hotkeys while typing into a field (matters inside the editor, where inputs exist)
  function typing(t) { return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); }
  addEventListener('keydown', e => {
    if (typing(e.target)) return;
    if (!G.Main || G.Main.state !== 'play') return;
    switch (e.code) {
      case 'Backslash': e.preventDefault(); DT.toggle(); break;     // \  pause / resume
      case 'BracketLeft': e.preventDefault(); DT.slower(); break;   // [  slower
      case 'BracketRight': e.preventDefault(); DT.faster(); break;  // ]  faster
      case 'Period': e.preventDefault(); DT.step(1); break;         // .  step one frame
      case 'Digit0': e.preventDefault(); DT.reset(); break;         // 0  back to real time
      default: return;
    }
  });

  // a small top-centre readout whenever time is altered, so it is obvious you are not at real time
  DT.draw = (cx, w) => {
    if (!DT.paused && DT.scale === 1) return;
    const label = DT.paused ? (DT._step ? '▸ STEP' : '⏸ PAUSED') : ('⏩ ' + DT.scale + '×');
    cx.save();
    cx.font = '12px monospace'; cx.textAlign = 'center'; cx.textBaseline = 'top';
    const tw = cx.measureText(label).width + 22;
    cx.fillStyle = 'rgba(4,10,14,0.78)'; cx.fillRect(w / 2 - tw / 2, 8, tw, 20);
    cx.fillStyle = DT.paused ? '#ffd887' : '#8fd6ff';
    cx.fillText(label, w / 2, 12);
    cx.restore();
  };
})();
