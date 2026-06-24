// MOSSVEIL — debug.js : in-play entity inspector. F4 toggles a live overlay; click an
// entity to inspect its state. Works standalone and inside the editor's Play-here.
(function () {
  const D = G.Debug = { on: false, sel: null };
  D.toggle = () => { D.on = !D.on; if (!D.on) D.sel = null; };

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

  D.draw = (cx, w, h) => {
    if (!D.on) return;
    const p = G.player;
    cx.save();
    cx.font = '12px monospace'; cx.textAlign = 'left'; cx.textBaseline = 'top';
    const lines = ['◇ DEBUG (F4)   room: ' + (G.room ? G.room.id : '?') + '   entities: ' + (G.room ? G.room.entities.length : 0)];
    if (p) lines.push('player  hp ' + p.hp + '/' + p.maxHp + '  soul ' + (p.soul | 0) + '  nail ' + p.nailDmg + '  pos ' + fmt(p.body.x) + ',' + fmt(p.body.y) + '  vel ' + fmt(p.body.vx) + ',' + fmt(p.body.vy) + (p.body.onGround ? '  [ground]' : '  [air]') + (p.overcharmed ? '  [overcharm]' : ''));
    lines.push('glimmer ' + (G.Main && G.Main.glimmer ? G.Main.glimmer() : 0) + '   ·   click an entity · [T] tp to player · [`] kill');
    const pw = 600, ph = lines.length * 16 + 10;
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
    cx.restore();
  };
})();
