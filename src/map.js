// MOSSVEIL — map.js : world map renderer (in-game M map + editor map tab)
// Rooms are positioned by their mapPos {mx,my} (tile units, y-up) and drawn as
// dark outlined chambers tinted by biome, with connection threads and labels.
(function () {
  const U = G.U;
  const M = G.MapView = {};

  function roomScreenRect(lvl, view) {
    const mp = lvl.mapPos || { mx: 0, my: 0 };
    const x = (mp.mx - view.pan.x) * view.zoom + view.w / 2;
    const y = (-(mp.my + lvl.h) - view.pan.y) * view.zoom + view.h / 2;
    return { x, y, w: lvl.w * view.zoom, h: lvl.h * view.zoom };
  }
  M.roomScreenRect = roomScreenRect;

  // hit-test for the editor
  M.roomAt = (px, py, view) => {
    const ids = Object.keys(G.LEVELS);
    for (let i = ids.length - 1; i >= 0; i--) {
      const r = roomScreenRect(G.LEVELS[ids[i]], view);
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return ids[i];
    }
    return null;
  };

  function roundedPath(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function doorPoint(lvl, tz, view) {
    const mp = lvl.mapPos || { mx: 0, my: 0 };
    let tx, ty; // tile coords inside the room (y-up from room bottom)
    if (tz.rect) { tx = tz.rect.x; ty = tz.rect.y; }
    else if (tz.side === 'L') { tx = 0; ty = lvl.h / 2; }
    else if (tz.side === 'R') { tx = lvl.w; ty = lvl.h / 2; }
    else if (tz.side === 'T') { tx = ((tz.x0 + tz.x1) / 2) + 0.5; ty = lvl.h; }
    else { tx = ((tz.x0 + tz.x1) / 2) + 0.5; ty = 0; }
    return {
      x: (mp.mx + tx - view.pan.x) * view.zoom + view.w / 2,
      y: (-(mp.my + ty) - view.pan.y) * view.zoom + view.h / 2
    };
  }

  // view: {w, h, pan:{x,y}, zoom, visitedOnly, current, playerPos, selected, showLabels}
  M.draw = (ctx, view) => {
    const L = G.LEVELS || {};
    const visited = (view.visitedOnly && G.save && G.save.visited) || null;
    const shown = id => !view.visitedOnly || (visited && visited[id]);

    // background
    ctx.fillStyle = '#04070c';
    ctx.fillRect(0, 0, view.w, view.h);
    // faint grid
    ctx.strokeStyle = 'rgba(120,150,160,0.05)';
    ctx.lineWidth = 1;
    const step = 10 * view.zoom;
    if (step > 6) {
      const ox = ((-view.pan.x * view.zoom + view.w / 2) % step + step) % step;
      const oy = ((-view.pan.y * view.zoom + view.h / 2) % step + step) % step;
      ctx.beginPath();
      for (let x = ox; x < view.w; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, view.h); }
      for (let y = oy; y < view.h; y += step) { ctx.moveTo(0, y); ctx.lineTo(view.w, y); }
      ctx.stroke();
    }

    // connection threads (dotted, drawn beneath rooms)
    ctx.save();
    ctx.setLineDash([3, 5]);
    ctx.lineWidth = 1.5;
    for (const id in L) {
      if (!shown(id)) continue;
      for (const tz of (L[id].transitions || [])) {
        const dest = L[tz.to];
        if (!dest || !shown(tz.to)) continue;
        const a = doorPoint(L[id], tz, view);
        // destination door: find the matching return transition if present, else room centre
        let bPt = null;
        for (const tz2 of (dest.transitions || [])) {
          if (tz2.to === id) { bPt = doorPoint(dest, tz2, view); break; }
        }
        if (!bPt) {
          const r = roomScreenRect(dest, view);
          bPt = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
        }
        ctx.strokeStyle = 'rgba(190,210,205,0.35)';
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(bPt.x, bPt.y);
        ctx.stroke();
      }
    }
    ctx.restore();

    // rooms
    for (const id in L) {
      if (!shown(id)) continue;
      const lvl = L[id];
      const pal = (G.World.PAL[lvl.biome] || G.World.PAL.verdant);
      const r = roomScreenRect(lvl, view);
      const cr = Math.max(4, 0.12 * Math.min(r.w, r.h));
      // tinted interior
      const fogCss = U.css(pal.fog);
      roundedPath(ctx, r.x, r.y, r.w, r.h, cr);
      const grad = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
      grad.addColorStop(0, fogCss + '46');
      grad.addColorStop(1, fogCss + '1e');
      ctx.fillStyle = grad;
      ctx.fill();
      // inner glow stroke
      roundedPath(ctx, r.x + 2.5, r.y + 2.5, r.w - 5, r.h - 5, cr);
      ctx.strokeStyle = fogCss + '50';
      ctx.lineWidth = 3;
      ctx.stroke();
      // outline
      roundedPath(ctx, r.x, r.y, r.w, r.h, cr);
      const isCur = view.current === id, isSel = view.selected === id;
      ctx.strokeStyle = isSel ? '#ffd887' : (isCur ? 'rgba(240,250,245,0.95)' : 'rgba(195,215,208,0.65)');
      ctx.lineWidth = isSel || isCur ? 2.2 : 1.3;
      ctx.stroke();
      // door notches
      for (const tz of (lvl.transitions || [])) {
        const d = doorPoint(lvl, tz, view);
        ctx.fillStyle = 'rgba(230,240,235,0.8)';
        ctx.fillRect(d.x - 2, d.y - 2, 4, 4);
      }
      // bench pip
      for (const p of (lvl.props || [])) {
        if (p.type === 'bench') {
          const mp2 = lvl.mapPos || { mx: 0, my: 0 };
          const bx = (mp2.mx + p.x - view.pan.x) * view.zoom + view.w / 2;
          const by = (-(mp2.my + p.y) - view.pan.y) * view.zoom + view.h / 2;
          ctx.strokeStyle = 'rgba(255,220,150,0.9)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(bx - 4, by); ctx.lineTo(bx + 4, by);
          ctx.moveTo(bx - 3, by); ctx.lineTo(bx - 3, by + 3);
          ctx.moveTo(bx + 3, by); ctx.lineTo(bx + 3, by + 3);
          ctx.stroke();
        }
      }
      // label
      if (view.showLabels !== false && (r.w > 50 || isCur)) {
        ctx.font = `${Math.max(10, Math.min(14, view.zoom * 5))}px Georgia, serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = isCur ? 'rgba(240,250,245,0.95)' : 'rgba(190,205,198,0.75)';
        ctx.fillText((lvl.title || id).toUpperCase(), r.x + r.w / 2, r.y - 6);
      }
    }

    // player marker
    if (view.current && L[view.current] && view.playerPos) {
      const lvl = L[view.current];
      const mp = lvl.mapPos || { mx: 0, my: 0 };
      const px = (mp.mx + view.playerPos.x - view.pan.x) * view.zoom + view.w / 2;
      const py = (-(mp.my + view.playerPos.y) - view.pan.y) * view.zoom + view.h / 2;
      const pulse = 0.6 + Math.sin((G.time || 0) * 4) * 0.4;
      ctx.fillStyle = `rgba(255,255,255,${0.35 * pulse})`;
      ctx.beginPath(); ctx.arc(px, py, 8, 0, U.TAU); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(px, py, 3.2, 0, U.TAU); ctx.fill();
    }
  };

  // helper: centre the view on a room
  M.centerOn = (id, view) => {
    const lvl = G.LEVELS[id];
    if (!lvl) return;
    const mp = lvl.mapPos || { mx: 0, my: 0 };
    view.pan.x = mp.mx + lvl.w / 2;
    view.pan.y = -(mp.my + lvl.h / 2);
  };
})();
