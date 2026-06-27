// MOSSVEIL — debug.js : in-play entity inspector + visual debug overlays. F4 toggles the
// inspector panel; click an entity to inspect its state. The overlay LAYERS (hitboxes /
// velocity / collision / probes / labels) draw independently of the panel and can be flipped
// from the editor's Debug-overlays remote (#60). All draw-only — off by default, so a fresh
// game behaves exactly as before. Works standalone and inside the editor's Play-here.
(function () {
  const D = G.Debug = { on: false, sel: null };

  // ---- visual overlay layers (#60). Each is purely a draw, off by default → fully inert. ----
  const LAYERS = [
    ['hitboxes', '▢ Hitboxes', 'AABB body of the player + every entity'],
    ['velocity', '➹ Velocity', 'velocity vector (0.1s look-ahead)'],
    ['collision', '▦ Collision', 'static solids / one-ways / spikes'],
    ['probes', '⌖ Probes', 'ground contact · wall · head flags'],
    ['ids', '🏷 Labels', 'type · hp tag over each entity']
  ];
  D.LAYERS = LAYERS;
  D.layers = { hitboxes: false, velocity: false, collision: false, probes: false, ids: false };
  D.anyLayer = () => LAYERS.some(l => D.layers[l[0]]);
  D.setLayer = (k, on) => { if (k in D.layers) { D.layers[k] = !!on; return true; } return false; };
  D.toggleLayer = k => { if (k in D.layers) { D.layers[k] = !D.layers[k]; return D.layers[k]; } return false; };
  D.allLayersOff = () => { for (const l of LAYERS) D.layers[l[0]] = false; };
  D.setInspector = on => { D.on = !!on; if (!D.on) D.sel = null; };
  D.toggle = () => { D.on = !D.on; if (!D.on) D.sel = null; };
  D.status = () => ({
    on: D.on,
    sel: D.sel ? (D.sel === G.player ? 'player' : (D.sel.type || 'entity')) : null,
    room: G.room ? G.room.id : null,
    entities: G.room ? G.room.entities.length : 0,
    layers: Object.assign({}, D.layers),
    anyLayer: D.anyLayer(),
    inGame: !!(G.player && G.room)
  });

  addEventListener('keydown', e => {
    if (e.code === 'F4') { e.preventDefault(); D.toggle(); return; }
    if (!D.on || !D.sel) return;
    if (e.code === 'KeyT' && D.sel.body && G.player) { D.sel.body.x = G.player.body.x; D.sel.body.y = G.player.body.y; D.sel.body.vx = D.sel.body.vy = 0; }   // teleport to player
    if (e.code === 'Backquote' && D.sel.isEnemy && D.sel.hurt) { D.sel.hurt(9999, 1); }                                                                       // kill selected
  });
  addEventListener('pointerdown', e => {
    if (!D.on || !G.U || !G.U.toScreen) return;
    const sx = e.clientX, sy = e.clientY; let best = null, bd = 80;
    const consider = ent => { if (!ent || !ent.body) return; const s = G.U.toScreen(ent.body.x, ent.body.y); const d = Math.hypot(s.x - sx, s.y - sy); if (d < bd) { bd = d; best = ent; } };
    if (G.room && G.room.entities) for (const ent of G.room.entities) consider(ent);
    consider(G.player);
    if (best) D.sel = best;
  });

  function fmt(v) { return typeof v === 'number' ? Math.round(v * 100) / 100 : (typeof v === 'string' ? '"' + v + '"' : v); }

  // world AABB {x,y,w,h} (centre origin, +y up) → screen rect (+y down)
  function rectScreen(b) {
    const tl = G.U.toScreen(b.x - b.w / 2, b.y + b.h / 2);
    const br = G.U.toScreen(b.x + b.w / 2, b.y - b.h / 2);
    return { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y };
  }

  function drawLayers(cx, w, h) {
    const p = G.player;
    const ents = (G.room && G.room.entities) ? G.room.entities : [];

    // static collision geometry
    if (D.layers.collision && G.Physics) {
      cx.lineWidth = 1;
      for (const s of G.Physics.solids || []) { const r = rectScreen(s); cx.fillStyle = 'rgba(90,150,255,0.10)'; cx.fillRect(r.x, r.y, r.w, r.h); cx.strokeStyle = 'rgba(120,170,255,0.55)'; cx.strokeRect(r.x, r.y, r.w, r.h); }
      cx.strokeStyle = 'rgba(255,190,90,0.85)'; cx.lineWidth = 2;
      for (const o of G.Physics.oneWays || []) { const r = rectScreen(o); cx.beginPath(); cx.moveTo(r.x, r.y); cx.lineTo(r.x + r.w, r.y); cx.stroke(); }
      cx.strokeStyle = 'rgba(255,90,90,0.9)'; cx.lineWidth = 1.5;
      for (const sp of G.Physics.spikes || []) { const r = rectScreen(sp); cx.strokeRect(r.x, r.y, r.w, r.h); }
    }

    // hitboxes (player + entities)
    if (D.layers.hitboxes) {
      cx.lineWidth = 1.5;
      if (p && p.body) { const r = rectScreen(p.body); cx.strokeStyle = '#7cffb0'; cx.strokeRect(r.x, r.y, r.w, r.h); }
      for (const e of ents) { if (!e.body) continue; const r = rectScreen(e.body); cx.strokeStyle = e.isEnemy ? '#ff8a8a' : '#ffd887'; cx.strokeRect(r.x, r.y, r.w, r.h); }
    }

    // velocity vectors (0.1s look-ahead)
    if (D.layers.velocity) {
      cx.lineWidth = 2;
      const arrow = (b, col) => {
        if (!b || (!b.vx && !b.vy)) return;
        const o = G.U.toScreen(b.x, b.y), e = G.U.toScreen(b.x + b.vx * 0.1, b.y + b.vy * 0.1);
        cx.strokeStyle = col; cx.beginPath(); cx.moveTo(o.x, o.y); cx.lineTo(e.x, e.y); cx.stroke();
        cx.fillStyle = col; cx.beginPath(); cx.arc(e.x, e.y, 3, 0, 7); cx.fill();
      };
      if (p) arrow(p.body, '#aaddff');
      for (const e of ents) if (e.body) arrow(e.body, '#ffddaa');
    }

    // probes — ground contact, wall flags, head flag at the body
    if (D.layers.probes) {
      const probe = b => {
        if (!b) return;
        const r = rectScreen(b);
        const feet = G.U.toScreen(b.x, b.y - b.h / 2);
        cx.fillStyle = b.onGround ? '#7cffb0' : 'rgba(150,160,170,0.55)';
        cx.beginPath(); cx.arc(feet.x, feet.y, 3.5, 0, 7); cx.fill();
        cx.fillStyle = '#ffd887';
        if (b.wallL) cx.fillRect(r.x - 3, r.y + r.h * 0.25, 3, r.h * 0.5);
        if (b.wallR) cx.fillRect(r.x + r.w, r.y + r.h * 0.25, 3, r.h * 0.5);
        if (b.hitHead) { const hd = G.U.toScreen(b.x, b.y + b.h / 2); cx.fillStyle = '#ff9a5a'; cx.beginPath(); cx.arc(hd.x, hd.y, 3, 0, 7); cx.fill(); }
      };
      if (p) probe(p.body);
      for (const e of ents) if (e.body) probe(e.body);
    }

    // labels — type · hp tag above each entity
    if (D.layers.ids) {
      cx.font = '10px monospace'; cx.textAlign = 'center'; cx.textBaseline = 'alphabetic';
      const tag = (b, txt, col) => {
        const top = G.U.toScreen(b.x, b.y + b.h / 2);
        const tw = cx.measureText(txt).width + 6;
        cx.fillStyle = 'rgba(4,10,14,0.72)'; cx.fillRect(top.x - tw / 2, top.y - 15, tw, 13);
        cx.fillStyle = col; cx.fillText(txt, top.x, top.y - 5);
      };
      if (p && p.body) tag(p.body, 'player ' + p.hp + '/' + p.maxHp, '#9fe8c0');
      for (const e of ents) {
        if (!e.body) continue;
        const nm = e.type || (e.npcName ? 'npc' : 'entity');
        const txt = nm + (e.hp != null ? ' ' + (e.hp | 0) : '');
        tag(e.body, txt, e.isEnemy ? '#ff9c9c' : '#ffd887');
      }
    }
  }

  function drawInspector(cx, w, h) {
    const p = G.player;
    cx.font = '12px monospace'; cx.textAlign = 'left'; cx.textBaseline = 'top';
    const lines = ['◇ DEBUG (F4)   room: ' + (G.room ? G.room.id : '?') + '   entities: ' + (G.room ? G.room.entities.length : 0)];
    if (p) lines.push('player  hp ' + p.hp + '/' + p.maxHp + '  soul ' + (p.soul | 0) + '  nail ' + p.nailDmg + '  pos ' + fmt(p.body.x) + ',' + fmt(p.body.y) + '  vel ' + fmt(p.body.vx) + ',' + fmt(p.body.vy) + (p.body.onGround ? '  [ground]' : '  [air]') + (p.overcharmed ? '  [overcharm]' : ''));
    const lc = LAYERS.filter(l => D.layers[l[0]]).map(l => l[0]);
    lines.push('glimmer ' + (G.Main && G.Main.glimmer ? G.Main.glimmer() : 0) + (lc.length ? '   ·   layers: ' + lc.join(' ') : '') + '   ·   click entity · [T] tp · [`] kill');
    const pw = 620, ph = lines.length * 16 + 10;
    cx.fillStyle = 'rgba(4,10,14,0.78)'; cx.fillRect(8, 8, pw, ph);
    cx.fillStyle = '#9fe8c0'; lines.forEach((l, i) => cx.fillText(l, 14, 13 + i * 16));
    if (D.sel) {
      const e = D.sel, b = e.body;
      if (b) { const s = G.U.toScreen(b.x, b.y); cx.strokeStyle = '#6fe6b0'; cx.lineWidth = 2; cx.strokeRect(s.x - 22, s.y - 22, 44, 44); }
      const props = [];
      for (const k of ['type', 'isEnemy', 'alive', 'hp', 'maxHp', 'dir', 'aggro', 'stagT', 'poise', 'fly', 'glimmer', 'switchName', 'npcName', 'oid', 'mode']) if (e[k] !== undefined) props.push(k + ': ' + fmt(e[k]));
      if (b) props.push('pos: ' + fmt(b.x) + ', ' + fmt(b.y), 'vel: ' + fmt(b.vx) + ', ' + fmt(b.vy));
      const bw = 270, bh = props.length * 15 + 26, bx = w - bw - 12, by = 12;
      cx.fillStyle = 'rgba(4,10,14,0.85)'; cx.fillRect(bx, by, bw, bh);
      cx.fillStyle = '#ffd887'; cx.fillText('▣ ' + (e === G.player ? 'PLAYER' : (e.type || 'entity')), bx + 8, by + 6);
      cx.fillStyle = '#cfe8d8'; props.forEach((l, i) => cx.fillText(l, bx + 8, by + 24 + i * 15));
    }
  }

  D.draw = (cx, w, h) => {
    const anyLayer = D.anyLayer();
    if (!D.on && !anyLayer) return;
    cx.save();
    if (anyLayer && G.U && G.U.toScreen) drawLayers(cx, w, h);
    if (D.on) drawInspector(cx, w, h);
    cx.restore();
  };
})();
