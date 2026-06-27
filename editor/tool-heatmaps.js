// MOSSVEIL — tool-heatmaps.js : play-session DEATH & PATH heatmaps (Edit ▸ Tools). Roadmap #66.
// Two jobs in one panel: (1) a live REMOTE that toggles capture + the in-game overlay on the running
// game's G.Heatmap across the Play-here iframe, and (2) a decoupled VIEWER that reads the captured data
// straight from localStorage (shared same-origin with the game, like the regression library) and draws
// a per-room schematic with the walk-density heatmap and death markers (✕). The viewer works with no
// game running, so you can review past sessions any time. Purely additive — drawing lives in src/heatmap.js.
(function () {
  const T = G.Tools;
  if (!T) return;
  const KEY = 'mossveil_heatmap';

  function loadData() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }
  function saveData(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); return true; } catch (e) { return false; } }
  function statOf(r) {
    let peak = 0; const ks = Object.keys((r && r.cells) || {});
    for (const k of ks) if (r.cells[k] > peak) peak = r.cells[k];
    return { samples: (r && r.samples) || 0, deaths: ((r && r.deaths) || []).length, cells: ks.length, peak: peak, w: (r && r.w) || 0, h: (r && r.h) || 0 };
  }
  function heat(t) {
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return [Math.min(1, Math.max(0, 1.5 - Math.abs(4 * t - 3))), Math.min(1, Math.max(0, 1.5 - Math.abs(4 * t - 2))), Math.min(1, Math.max(0, 1.5 - Math.abs(4 * t - 1)))];
  }

  // ---- reach the live game's Heatmap through the Play iframe (override-able by tests) -----------
  function liveTarget() {
    try {
      const f = document.getElementById('playIframe');
      const w = f && f.contentWindow;
      return (w && w.G && w.G.Heatmap) ? w.G.Heatmap : null;
    } catch (e) { return null; }   // cross-origin or not loaded yet
  }

  const API = T.heatmaps = {
    KEY: KEY,
    _target: null,                                   // tests inject a stand-in here
    target() { return this._target ? this._target() : liveTarget(); },
    available() { return !!this.target(); },
    data() {
      const d = this.target();
      if (d && d.flush) { try { d.flush(); } catch (e) { } }   // pull the freshest from the live game
      return loadData();
    },
    rooms() { return Object.keys(this.data()); },
    roomStat(id) { const r = this.data()[id]; return r ? statOf(r) : null; },
    liveStatus() { const d = this.target(); return d ? d.status() : null; },
    setCapture(on) { const d = this.target(); if (d) { d.setEnabled(on); return true; } return false; },
    setShow(on) { const d = this.target(); if (d) { d.setShow(on); return true; } return false; },
    clearRoom(id) {
      const d = this.target();
      if (d && d.clearRoom) { d.clearRoom(id); return true; }   // drive the live game (also persists)
      const all = loadData(); if (all[id]) { delete all[id]; saveData(all); return true; } return false;
    },
    clearAll() {
      const d = this.target();
      if (d && d.clearAll) { d.clearAll(); return true; }
      return saveData({});
    },
    openInTool: () => T.openTool('heatmaps')
  };

  // =================== rendering ===================
  function drawRoom(canvas, id, all) {
    const cx = canvas.getContext('2d'), CW = canvas.width, CH = canvas.height;
    cx.clearRect(0, 0, CW, CH); cx.fillStyle = '#0a1014'; cx.fillRect(0, 0, CW, CH);
    const r = all[id], lv = (G.LEVELS || {})[id];
    const w = (r && r.w) || (lv && lv.w) || 0, h = (r && r.h) || (lv && lv.h) || 0;
    if (!w || !h) { cx.fillStyle = '#5a6b72'; cx.font = '12px monospace'; cx.textAlign = 'center'; cx.fillText('no room dimensions', CW / 2, CH / 2); return; }
    const pad = 6, scale = Math.min((CW - 2 * pad) / w, (CH - 2 * pad) / h);
    const ox = (CW - w * scale) / 2, oy = (CH - h * scale) / 2;
    cx.strokeStyle = 'rgba(120,150,160,0.4)'; cx.lineWidth = 1; cx.strokeRect(ox, oy, w * scale, h * scale);
    // tile schematic (faint) — row 0 is the top row
    const tiles = lv && lv.tiles;
    if (tiles && tiles.length) {
      cx.fillStyle = 'rgba(90,120,130,0.22)';
      for (let rr = 0; rr < tiles.length; rr++) { const row = '' + (tiles[rr] || ''); for (let c = 0; c < row.length; c++) if (row[c] !== ' ' && row[c] !== '') cx.fillRect(ox + c * scale, oy + rr * scale, scale + 0.5, scale + 0.5); }
    }
    if (!r) return;
    let peak = 1; for (const k in (r.cells || {})) if (r.cells[k] > peak) peak = r.cells[k];
    for (const k in (r.cells || {})) {
      const i = k.indexOf(','), gx = +k.slice(0, i), gy = +k.slice(i + 1), t = r.cells[k] / peak, col = heat(t);
      cx.fillStyle = 'rgba(' + (col[0] * 255 | 0) + ',' + (col[1] * 255 | 0) + ',' + (col[2] * 255 | 0) + ',' + (0.25 + 0.6 * t).toFixed(3) + ')';
      cx.fillRect(ox + gx * scale, oy + (h - 1 - gy) * scale, scale + 0.5, scale + 0.5);
    }
    cx.strokeStyle = '#ff4d4d'; cx.lineWidth = 1.5;
    for (const dp of (r.deaths || [])) { const px = ox + dp.x * scale, py = oy + (h - dp.y) * scale; cx.beginPath(); cx.moveTo(px - 4, py - 4); cx.lineTo(px + 4, py + 4); cx.moveTo(px + 4, py - 4); cx.lineTo(px - 4, py + 4); cx.stroke(); }
  }

  // =================== UI ===================
  let bodyEl = null, api = null, poll = null, rootMarker = null, lastSig = '', selRoom = null;
  function el(t, a, p, x) { return api.el(t, a, p, x); }
  function startPlay() { const b = document.getElementById('btnPlayHere'); if (b) b.click(); }

  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:14px 16px;display:flex;flex-direction:column;gap:12px';
    const all = API.data(), rooms = Object.keys(all), live = API.liveStatus();

    el('div', { class: 'tc-mut', style: 'font-size:12px;line-height:1.5' }, bodyEl,
      'Where the player walks and dies, captured while playtesting. Capture is off by default and never affects the game.');

    // live capture controls
    const lc = el('div', { style: 'display:flex;flex-direction:column;gap:8px;padding:10px;border:1px solid var(--line);border-radius:6px' }, bodyEl);
    el('div', { class: 'tc-mut', style: 'font-size:11px' }, lc, 'LIVE CAPTURE');
    if (live) {
      el('div', { style: 'font-size:12px;color:var(--txt2)' }, lc, 'room ' + (live.room || '?') + '   ·   ' + live.samples + ' samples   ·   ' + live.deaths + ' deaths');
      const row = el('div', { style: 'display:flex;gap:8px' }, lc);
      const cap = el('button', { class: 'tbtn' + (live.enabled ? ' on' : ''), title: 'Record the player path + deaths', style: 'flex:1;padding:8px;font-size:12px' }, row, (live.enabled ? '● ' : '○ ') + 'Capture');
      cap.addEventListener('click', () => { API.setCapture(!live.enabled); render(); });
      const ov = el('button', { class: 'tbtn' + (live.show ? ' on' : ''), title: 'Draw the heatmap over the running game', style: 'flex:1;padding:8px;font-size:12px' }, row, (live.show ? '● ' : '○ ') + 'In-game overlay');
      ov.addEventListener('click', () => { API.setShow(!live.show); render(); });
    } else {
      el('div', { style: 'font-size:12px;color:var(--txt2)' }, lc, 'No game running — saved sessions still show below.');
      const pb = el('button', { class: 'tbtn', style: 'padding:6px 12px;align-self:flex-start' }, lc, '▶ Play here');
      pb.addEventListener('click', () => startPlay());
    }

    // viewer
    if (!rooms.length) {
      el('div', { style: 'padding:18px;border:1px dashed var(--line);border-radius:6px;text-align:center;color:var(--txt2)' }, bodyEl, 'No heatmap data yet. Enable capture and play a room.');
      rootMarker = bodyEl.firstChild; return;
    }
    if (!selRoom || rooms.indexOf(selRoom) < 0) selRoom = rooms[0];

    const rp = el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' }, bodyEl);
    rooms.forEach(id => {
      const st = statOf(all[id]);
      const b = el('button', { class: 'tbtn' + (id === selRoom ? ' on' : ''), style: 'padding:5px 10px;font-size:11px' }, rp, id + ' (' + st.samples + '·' + st.deaths + '✕)');
      b.addEventListener('click', () => { selRoom = id; render(); });
    });

    const cv = el('canvas', { width: 360, height: 210, style: 'width:100%;border:1px solid var(--line);border-radius:4px;background:#0a1014' }, bodyEl);
    drawRoom(cv, selRoom, all);

    const st = statOf(all[selRoom]);
    el('div', { style: 'font-size:12px;color:var(--txt2);text-align:center' }, bodyEl,
      selRoom + '  —  ' + st.samples + ' samples · ' + st.deaths + ' deaths · ' + st.cells + ' cells · peak ' + st.peak + ' · ' + st.w + '×' + st.h);
    el('div', { class: 'tc-mut', style: 'font-size:11px;text-align:center' }, bodyEl, 'cold → hot   ·   ✕ = death');

    const cr = el('div', { style: 'display:flex;gap:8px' }, bodyEl);
    const cb = el('button', { class: 'tbtn', style: 'flex:1;padding:7px;font-size:12px' }, cr, '🗑 Clear this room');
    cb.addEventListener('click', () => { API.clearRoom(selRoom); selRoom = null; render(); });
    const ca = el('button', { class: 'tbtn', style: 'flex:1;padding:7px;font-size:12px' }, cr, '🗑 Clear all');
    ca.addEventListener('click', () => { API.clearAll(); selRoom = null; render(); });

    rootMarker = bodyEl.firstChild;
  }

  function build(host, a) {
    api = a; bodyEl = host;
    if (poll) { clearInterval(poll); poll = null; }
    render();
    lastSig = JSON.stringify({ live: API.liveStatus(), rooms: API.rooms().map(id => API.roomStat(id)) });
    // light poll so the panel tracks the running game (capture growing, a death just happened, play
    // started/stopped). Self-cleans: the root marker is removed when another tool replaces the body,
    // and the overlay loses the 'on' class when the tool is closed.
    poll = setInterval(() => {
      const ov = document.getElementById('toolHost');
      const torn = !rootMarker || !bodyEl.contains(rootMarker);
      const closed = !ov || !ov.classList.contains('on');
      if (torn || closed) { clearInterval(poll); poll = null; return; }
      const s = JSON.stringify({ live: API.liveStatus(), rooms: API.rooms().map(id => API.roomStat(id)) });
      if (s !== lastSig) { lastSig = s; render(); }
    }, 500);
  }

  T.registerTool({
    id: 'heatmaps', label: 'Heatmaps', icon: '🔥', group: 'Tools',
    sub: 'death & path heatmaps captured from playtests',
    build
  });
  if (T.roadmapDone) T.roadmapDone(66);
})();
