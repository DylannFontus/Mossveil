// MOSSVEIL — heatmap.js : play-session DEATH & PATH heatmaps (#66). While playtesting (capture ON) it
// bins the player's position into a per-room grid and records where the player dies, persisting to
// localStorage (shared same-origin with the editor's Heatmaps tool). Optionally draws an in-game
// overlay. Inert by default — capture AND overlay are both off until the editor remote (or a test)
// turns them on; either way there is ZERO gameplay effect (only canvas draws + a dev-data key).
(function () {
  const KEY = 'mossveil_heatmap', CELL = 1, INTERVAL = 0.1, FLUSH_MS = 1500, DEATH_CAP = 400;

  function loadData() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }
  // density ramp: blue → cyan → green → yellow → red (returns 0..1 floats)
  function heat(t) {
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const r = Math.min(1, Math.max(0, 1.5 - Math.abs(4 * t - 3)));
    const g = Math.min(1, Math.max(0, 1.5 - Math.abs(4 * t - 2)));
    const b = Math.min(1, Math.max(0, 1.5 - Math.abs(4 * t - 1)));
    return [r, g, b];
  }

  const H = G.Heatmap = {
    enabled: false, show: false, KEY: KEY, CELL: CELL,
    data: loadData(),
    _acc: 0, _dirty: false, _lastFlush: 0,

    setEnabled(on) { this.enabled = !!on; return this.enabled; },
    setShow(on) { this.show = !!on; return this.show; },
    toggleEnabled() { this.enabled = !this.enabled; return this.enabled; },
    toggleShow() { this.show = !this.show; return this.show; },
    room() { return (G.room && G.room.id) || null; },

    ensure(id) {
      let d = this.data[id];
      if (!d) d = this.data[id] = { w: 0, h: 0, cells: {}, deaths: [], samples: 0, updated: 0 };
      const lv = G.LEVELS && G.LEVELS[id];
      const w = (G.room && G.room.id === id && G.room.w) || (lv && lv.w) || d.w || 0;
      const h = (G.room && G.room.id === id && G.room.h) || (lv && lv.h) || d.h || 0;
      if (w) d.w = w; if (h) d.h = h;
      return d;
    },

    record(id, x, y) {
      if (!id) return;
      const d = this.ensure(id);
      const k = Math.floor(x / CELL) + ',' + Math.floor(y / CELL);
      d.cells[k] = (d.cells[k] || 0) + 1;
      d.samples++; d.updated = Date.now(); this._dirty = true;
    },

    sample(p, dt) {
      if (!this.enabled || !p || !p.body) return;
      this._acc += dt || 0;
      if (this._acc < INTERVAL) return;
      this._acc = 0;
      this.record(this.room(), p.body.x, p.body.y);
      if (this._dirty && Date.now() - this._lastFlush > FLUSH_MS) this.flush();
    },

    onDeath(p) {
      if (!this.enabled || !p || !p.body) return;
      const id = this.room(); if (!id) return;
      const d = this.ensure(id);
      d.deaths.push({ x: Math.round(p.body.x * 100) / 100, y: Math.round(p.body.y * 100) / 100, t: Date.now() });
      if (d.deaths.length > DEATH_CAP) d.deaths.splice(0, d.deaths.length - DEATH_CAP);
      d.updated = Date.now(); this._dirty = true; this.flush();
    },

    flush() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); this._dirty = false; this._lastFlush = Date.now(); return true; } catch (e) { return false; } },
    reload() { this.data = loadData(); return this.data; },
    clearRoom(id) { if (this.data[id]) { delete this.data[id]; this.flush(); return true; } return false; },
    clearAll() { this.data = {}; return this.flush(); },

    roomStat(id) {
      const d = this.data[id]; if (!d) return null;
      let peak = 0; const ks = Object.keys(d.cells || {});
      for (const k of ks) if (d.cells[k] > peak) peak = d.cells[k];
      return { samples: d.samples || 0, deaths: (d.deaths || []).length, cells: ks.length, peak: peak, w: d.w || 0, h: d.h || 0 };
    },
    rooms() { return Object.keys(this.data); },

    status() {
      const id = this.room(), st = id ? this.roomStat(id) : null;
      return {
        enabled: this.enabled, show: this.show, room: id, inGame: !!(G.player && G.room),
        samples: st ? st.samples : 0, deaths: st ? st.deaths : 0, cells: st ? st.cells : 0, peak: st ? st.peak : 0
      };
    },

    draw(cx, w, h) {
      if (!this.show || !G.U || !G.U.toScreen) return;
      const id = this.room(), d = id && this.data[id]; if (!d) return;
      const peak = Math.max(1, this.roomStat(id).peak);
      cx.save();
      for (const k of Object.keys(d.cells)) {
        const i = k.indexOf(','), gx = +k.slice(0, i), gy = +k.slice(i + 1);
        const a = G.U.toScreen(gx * CELL, (gy + 1) * CELL), b = G.U.toScreen((gx + 1) * CELL, gy * CELL);
        const t = d.cells[k] / peak, c = heat(t);
        cx.fillStyle = 'rgba(' + (c[0] * 255 | 0) + ',' + (c[1] * 255 | 0) + ',' + (c[2] * 255 | 0) + ',' + (0.12 + 0.5 * t).toFixed(3) + ')';
        cx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
      }
      cx.strokeStyle = '#ff4d4d'; cx.lineWidth = 2;
      for (const dp of d.deaths || []) {
        const s = G.U.toScreen(dp.x, dp.y);
        cx.beginPath(); cx.moveTo(s.x - 6, s.y - 6); cx.lineTo(s.x + 6, s.y + 6); cx.moveTo(s.x + 6, s.y - 6); cx.lineTo(s.x - 6, s.y + 6); cx.stroke();
      }
      cx.restore();
    }
  };
})();
