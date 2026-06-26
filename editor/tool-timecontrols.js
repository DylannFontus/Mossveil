// MOSSVEIL — tool-timecontrols.js : playtest TIME CONTROLS (Edit ▸ Tools). Roadmap #62.
// A live remote for the running game's clock: pause / resume, single-step a frame, and a slow↔fast
// multiplier ladder — for studying a boss tell, nailing a tricky jump, or freezing a frame to inspect
// with the F4 debugger. It drives G.DebugTime inside the editor's same-origin Play-here iframe (the
// very object the in-game hotkeys \ [ ] . 0 drive), so it needs a game to be running; when nothing is
// playing it says so and offers ▶ Play here. No engine change — purely an additive remote.
(function () {
  const T = G.Tools;
  if (!T) return;
  const SCALES = [0.1, 0.25, 0.5, 1, 2, 4];

  // ---- reach the live game's DebugTime through the Play iframe (override-able by tests) -----------
  function liveTarget() {
    try {
      const f = document.getElementById('playIframe');
      const w = f && f.contentWindow;
      return (w && w.G && w.G.DebugTime) ? w.G.DebugTime : null;
    } catch (e) { return null; }   // cross-origin or not loaded yet
  }

  const API = T.timectl = {
    SCALES: SCALES.slice(),
    _target: null,                                   // tests inject a stand-in here
    target() { return this._target ? this._target() : liveTarget(); },
    available() { return !!this.target(); },
    status() {
      const d = this.target();
      if (!d) return { scale: 1, paused: false, stepping: false, modified: false, available: false };
      const s = d.status(); s.available = true; return s;
    },
    pause() { const d = this.target(); if (d) { d.pause(); return true; } return false; },
    resume() { const d = this.target(); if (d) { d.resume(); return true; } return false; },
    toggle() { const d = this.target(); if (d) { d.toggle(); return true; } return false; },
    step(n) { const d = this.target(); if (d) { d.step(n || 1); return true; } return false; },
    setScale(s) { const d = this.target(); if (d) { d.setScale(s); return true; } return false; },
    slower() { const d = this.target(); if (d) { d.slower(); return true; } return false; },
    faster() { const d = this.target(); if (d) { d.faster(); return true; } return false; },
    reset() { const d = this.target(); if (d) { d.reset(); return true; } return false; },
    openInTool: () => T.openTool('timectl')
  };

  // =================== UI ===================
  let bodyEl = null, api = null, poll = null, rootMarker = null, lastSig = '';
  function el(t, a, p, x) { return api.el(t, a, p, x); }
  function startPlay() { const b = document.getElementById('btnPlayHere'); if (b) b.click(); }

  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:14px 16px;display:flex;flex-direction:column;gap:14px';
    const st = API.status();

    el('div', { class: 'tc-mut', style: 'font-size:12px;line-height:1.5' }, bodyEl,
      'Pause, slow, fast-forward or single-step the running game. In-play hotkeys:  \\ pause · [ slower · ] faster · . step · 0 reset.');

    if (!st.available) {
      const box = el('div', { style: 'padding:18px;border:1px dashed var(--line);border-radius:6px;text-align:center;color:var(--txt2)' }, bodyEl);
      el('div', { style: 'margin-bottom:12px' }, box, 'No game is running. Start a playtest to control its time.');
      const pb = el('button', { class: 'tbtn on', style: 'padding:8px 16px' }, box, '▶ Play here');
      pb.addEventListener('click', () => startPlay());
      rootMarker = bodyEl.firstChild;
      return;
    }

    // status banner
    el('div', { style: 'padding:10px 12px;border-radius:6px;text-align:center;font-size:15px;font-weight:600;background:var(--bg2);color:' + (st.paused ? '#ffd887' : st.scale !== 1 ? '#8fd6ff' : 'var(--txt)') }, bodyEl,
      st.paused ? (st.stepping ? '▸ STEPPING' : '⏸ PAUSED') : (st.scale === 1 ? '▶ Real time (1×)' : '⏩ ' + st.scale + '×'));

    // transport row
    const row = el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, bodyEl);
    const big = (label, title, on, fn) => { const b = el('button', { class: 'tbtn' + (on ? ' on' : ''), title, style: 'flex:1;min-width:84px;padding:9px 6px;font-size:13px' }, row, label); b.addEventListener('click', () => { fn(); render(); }); };
    big(st.paused ? '▶ Resume' : '⏸ Pause', 'Pause / resume (\\)', st.paused, () => API.toggle());
    big('⏭ Step', 'Advance one frame (.)', false, () => API.step(1));
    big('↺ Reset', 'Back to real time (0)', false, () => API.reset());

    // scale ladder
    const sc = el('div', {}, bodyEl);
    el('div', { class: 'tc-mut', style: 'font-size:11px;margin-bottom:6px' }, sc, 'TIME SCALE');
    const ladder = el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' }, sc);
    SCALES.forEach(s => { const b = el('button', { class: 'tbtn' + (!st.paused && st.scale === s ? ' on' : '') }, ladder, s + '×'); b.addEventListener('click', () => { API.setScale(s); render(); }); });
    const sr = el('div', { style: 'display:flex;gap:6px;margin-top:8px' }, sc);
    const sl = el('button', { class: 'tbtn' }, sr, '[ slower'); sl.addEventListener('click', () => { API.slower(); render(); });
    const sf = el('button', { class: 'tbtn' }, sr, '] faster'); sf.addEventListener('click', () => { API.faster(); render(); });

    rootMarker = bodyEl.firstChild;
  }

  function build(host, a) {
    api = a; bodyEl = host;
    if (poll) { clearInterval(poll); poll = null; }
    render();
    lastSig = JSON.stringify(API.status());
    // light poll so the banner tracks the game (hotkey pressed in the iframe, play just started, …).
    // Self-cleans: our root marker is removed when another tool replaces the body, and the overlay
    // loses the 'on' class when the tool is closed.
    poll = setInterval(() => {
      const ov = document.getElementById('toolHost');
      const torn = !rootMarker || !bodyEl.contains(rootMarker);   // another tool took over the body
      const closed = !ov || !ov.classList.contains('on');         // overlay hidden (tool closed)
      if (torn || closed) { clearInterval(poll); poll = null; return; }
      const s = JSON.stringify(API.status());
      if (s !== lastSig) { lastSig = s; render(); }
    }, 400);
  }

  T.registerTool({
    id: 'timectl', label: 'Time controls', icon: '⏱️', group: 'Tools',
    sub: 'pause · slow · fast · single-step the live game',
    build
  });
  if (T.roadmapDone) T.roadmapDone(62);
})();
