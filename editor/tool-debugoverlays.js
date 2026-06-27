// MOSSVEIL — tool-debugoverlays.js : visual DEBUG OVERLAYS remote (Edit ▸ Tools). Roadmap #60.
// A live remote for the running game's G.Debug. Flip the on-screen inspector panel (the same one
// F4 toggles) and the draw-only overlay layers — hitboxes, velocity vectors, static collision
// geometry, ground/wall/head probes, and entity labels — while playtesting in the editor's Play-here
// iframe. Layers draw even with the inspector off, so you can study collision or hitboxes cleanly.
// Needs a game running; when nothing is playing it says so and offers ▶ Play here. Purely additive —
// no engine change from the editor side; all the drawing lives in src/debug.js.
(function () {
  const T = G.Tools;
  if (!T) return;
  // mirror of src/debug.js LAYERS (label + hint for the editor UI)
  const LAYERS = [
    ['hitboxes', '▢ Hitboxes', 'AABB body of the player + every entity'],
    ['velocity', '➹ Velocity', 'velocity vector (0.1s look-ahead)'],
    ['collision', '▦ Collision', 'static solids / one-ways / spikes'],
    ['probes', '⌖ Probes', 'ground contact · wall · head flags'],
    ['ids', '🏷 Labels', 'type · hp tag over each entity']
  ];

  // ---- reach the live game's Debug through the Play iframe (override-able by tests) -------------
  function liveTarget() {
    try {
      const f = document.getElementById('playIframe');
      const w = f && f.contentWindow;
      return (w && w.G && w.G.Debug) ? w.G.Debug : null;
    } catch (e) { return null; }   // cross-origin or not loaded yet
  }

  const EMPTY = { available: false, on: false, sel: null, room: null, entities: 0, layers: { hitboxes: false, velocity: false, collision: false, probes: false, ids: false }, anyLayer: false, inGame: false };

  const API = T.debugoverlays = {
    LAYERS: LAYERS.map(l => l[0]),
    _target: null,                                   // tests inject a stand-in here
    target() { return this._target ? this._target() : liveTarget(); },
    available() { return !!this.target(); },
    status() {
      const d = this.target();
      if (!d) return JSON.parse(JSON.stringify(EMPTY));
      const s = d.status(); s.available = true; return s;
    },
    setLayer(key, on) { const d = this.target(); if (d) { d.setLayer(key, on); return true; } return false; },
    toggleLayer(key) { const d = this.target(); if (d) { d.toggleLayer(key); return true; } return false; },
    allLayersOff() { const d = this.target(); if (d) { d.allLayersOff(); return true; } return false; },
    setInspector(on) { const d = this.target(); if (d) { d.setInspector(on); return true; } return false; },
    toggleInspector() { const d = this.target(); if (d) { d.toggle(); return true; } return false; },
    openInTool: () => T.openTool('debugoverlays')
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
      'Draw-only overlays for the running game. Layers show even with the inspector off; F4 in-game does the same.');

    if (!st.available) {
      const box = el('div', { style: 'padding:18px;border:1px dashed var(--line);border-radius:6px;text-align:center;color:var(--txt2)' }, bodyEl);
      el('div', { style: 'margin-bottom:12px' }, box, 'No game is running. Start a playtest to overlay it.');
      const pb = el('button', { class: 'tbtn on', style: 'padding:8px 16px' }, box, '▶ Play here');
      pb.addEventListener('click', () => startPlay());
      rootMarker = bodyEl.firstChild;
      return;
    }

    // live status banner
    el('div', { style: 'padding:8px 12px;border-radius:6px;text-align:center;font-size:13px;background:var(--bg2);color:' + (st.anyLayer || st.on ? '#9ad8ff' : 'var(--txt2)') }, bodyEl,
      st.inGame
        ? ('room ' + (st.room || '?') + '   ·   ' + st.entities + ' entities' + (st.sel ? '   ·   sel: ' + st.sel : '') + (st.on ? '   ·   INSPECTOR ON' : '') + (st.anyLayer ? '   ·   OVERLAYS ON' : ''))
        : 'Not in play (menu / cutscene) — overlays apply once you are in a room.');

    // inspector panel toggle (the F4 readout)
    const ins = el('button', { class: 'tbtn' + (st.on ? ' on' : ''), title: 'The F4 entity-inspector panel (text readout + click-to-select)', style: 'padding:9px 6px;font-size:12px;text-align:left' }, bodyEl, (st.on ? '● ' : '○ ') + '◇ Inspector panel (F4)');
    ins.addEventListener('click', () => { API.toggleInspector(); render(); });

    // overlay layers
    const tg = el('div', {}, bodyEl);
    el('div', { class: 'tc-mut', style: 'font-size:11px;margin-bottom:6px' }, tg, 'OVERLAY LAYERS');
    const grid = el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:8px' }, tg);
    LAYERS.forEach(([key, label, hint]) => {
      const on = !!(st.layers && st.layers[key]);
      const b = el('button', { class: 'tbtn' + (on ? ' on' : ''), title: hint, style: 'padding:9px 6px;font-size:12px;text-align:left' }, grid, (on ? '● ' : '○ ') + label);
      b.addEventListener('click', () => { API.toggleLayer(key); render(); });
    });

    // all-off
    const rb = el('button', { class: 'tbtn' + (st.anyLayer ? ' on' : ''), style: 'padding:8px 6px;font-size:12px' }, bodyEl, '↺ Turn all layers off');
    rb.addEventListener('click', () => { API.allLayersOff(); render(); });

    rootMarker = bodyEl.firstChild;
  }

  function build(host, a) {
    api = a; bodyEl = host;
    if (poll) { clearInterval(poll); poll = null; }
    render();
    lastSig = JSON.stringify(API.status());
    // light poll so the banner tracks the game (F4 pressed in-game, play just started, a different
    // entity selected, room changed…). Self-cleans: the root marker is removed when another tool
    // replaces the body, and the overlay loses the 'on' class when the tool is closed.
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
    id: 'debugoverlays', label: 'Debug overlays', icon: '🔬', group: 'Tools',
    sub: 'hitboxes · velocity · collision · probes · labels — over the live game',
    build
  });
  if (T.roadmapDone) T.roadmapDone(60);
})();
