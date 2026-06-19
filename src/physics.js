// MOSSVEIL — physics.js : AABB physics vs static level geometry
// All rects are {x, y, w, h} with x,y at CENTER. World units = tiles, +y is up.
(function () {
  const P = G.Physics = {
    solids: [],
    oneWays: [],
    spikes: [],

    setRoom(solids, oneWays, spikes) {
      P.solids = solids; P.oneWays = oneWays; P.spikes = spikes;
    },

    rectVsSolids(r) {
      for (const s of P.solids) if (G.U.overlap(r, s)) return s;
      return null;
    },

    pointSolid(x, y) {
      for (const s of P.solids)
        if (Math.abs(x - s.x) < s.w / 2 && Math.abs(y - s.y) < s.h / 2) return true;
      return false;
    },

    // horizontal line-of-sight between two points (samples for solid walls)
    los(x1, y1, x2, y2) {
      const d = Math.hypot(x2 - x1, y2 - y1);
      const n = Math.ceil(d / 0.5);
      for (let i = 1; i < n; i++) {
        const t = i / n;
        if (P.pointSolid(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)) return false;
      }
      return true;
    },

    spikeTouch(r) {
      for (const s of P.spikes) if (G.U.overlap(r, s)) return s;
      return null;
    },

    // is there ground (solid or one-way top) within `depth` below point?
    groundBelow(x, y, depth = 0.5) {
      const probe = { x, y: y - depth / 2, w: 0.1, h: depth };
      if (P.rectVsSolids(probe)) return true;
      for (const o of P.oneWays) {
        const top = o.y + o.h / 2;
        if (Math.abs(x - o.x) < o.w / 2 && y >= top - 0.05 && y - depth <= top) return true;
      }
      return false;
    },

    // Move body with collision. body: {x,y,w,h,vx,vy, dropTimer?}
    // Sets: body.onGround, body.hitHead, body.wallL, body.wallR, body.onOneWay
    move(body, dt) {
      body.onGround = false; body.hitHead = false;
      body.wallL = false; body.wallR = false; body.onOneWay = false;

      const maxStep = 0.35;
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(body.vx), Math.abs(body.vy)) * dt / maxStep));
      const sdt = dt / steps;

      const SKIN = 0.2; // ignore sliver overlaps that belong to the other axis
      for (let i = 0; i < steps; i++) {
        // --- X axis ---
        body.x += body.vx * sdt;
        for (const s of P.solids) {
          if (Math.abs(body.x - s.x) * 2 >= body.w + s.w) continue;
          if (Math.abs(body.y - s.y) * 2 >= body.h - SKIN + s.h) continue;
          if (body.x < s.x) { body.x = s.x - s.w / 2 - body.w / 2 - 0.001; body.wallR = true; }
          else { body.x = s.x + s.w / 2 + body.w / 2 + 0.001; body.wallL = true; }
          body.vx = 0;
        }
        // --- Y axis ---
        const prevBottom = body.y - body.h / 2;
        body.y += body.vy * sdt;
        for (const s of P.solids) {
          if (Math.abs(body.x - s.x) * 2 >= body.w - SKIN + s.w) continue;
          if (Math.abs(body.y - s.y) * 2 >= body.h + s.h) continue;
          if (body.y > s.y) { body.y = s.y + s.h / 2 + body.h / 2 + 0.001; body.onGround = true; if (body.vy < 0) body.vy = 0; }
          else { body.y = s.y - s.h / 2 - body.h / 2 - 0.001; body.hitHead = true; if (body.vy > 0) body.vy = 0; }
        }
        if (body.vy <= 0 && !(body.dropTimer > 0)) {
          for (const o of P.oneWays) {
            const top = o.y + o.h / 2;
            if (Math.abs(body.x - o.x) * 2 < body.w + o.w &&
                prevBottom >= top - 0.05 &&
                body.y - body.h / 2 <= top && body.y - body.h / 2 > top - 0.6) {
              body.y = top + body.h / 2 + 0.001;
              body.vy = 0;
              body.onGround = true; body.onOneWay = true;
            }
          }
        }
      }
      if (body.dropTimer > 0) body.dropTimer -= dt;
    }
  };
})();
