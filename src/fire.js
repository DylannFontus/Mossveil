// MOSSVEIL — fire.js : dynamic world environment effects.
// Grass can be set alight (e.g. by an Ember Bolt). A cell burns ~10s with a layered,
// additive flame + ember + smoke look, then turns to scorched/ash grass for 2 hours of
// gameplay before recovering. Weather rewrites the rules: rain/snow/blizzard douse it on
// contact, embers make it burn longer, wind spreads it downwind. Reflective water freezes
// to mirror-ice with drifting frost during snow/blizzard. All procedural — no asset files.
(function () {
  const F = G.Fire = {};
  const BURN_BASE = 10, BURN_EMBERS = 20, BURN_PERSIST = 7200;   // seconds of gameplay a scorch mark lingers (2h)
  const FIRE_N = 900, SMOKE_N = 460;

  let room = null, cells = [], state = [], cellMap = null;
  let burnAttr = null;                                 // the foliage `aBurn` BufferAttribute (set per vertex range)
  let layer = null, firePts = null, smokePts = null, fireGeo = null, smokeGeo = null;
  let playtime = 0, iced = false;
  const burntByRoom = {};                              // roomId -> Map(cellIndex -> expiry playtime) : survives transitions
  const burningEnemies = [];                           // { e, t, tickT, dmg }

  // ---- particle pools (CPU sim -> GPU buffers) ----
  const fp = { x: f32(FIRE_N), y: f32(FIRE_N), z: f32(FIRE_N), vx: f32(FIRE_N), vy: f32(FIRE_N), l: f32(FIRE_N), m: f32(FIRE_N), s: f32(FIRE_N), k: new Uint8Array(FIRE_N) };
  const sp = { x: f32(SMOKE_N), y: f32(SMOKE_N), z: f32(SMOKE_N), vx: f32(SMOKE_N), vy: f32(SMOKE_N), l: f32(SMOKE_N), m: f32(SMOKE_N), s: f32(SMOKE_N), k: new Uint8Array(SMOKE_N) };
  let fi = 0, si = 0;
  function f32(n) { return new Float32Array(n); }

  function pointsMaterial(blending) {
    return new THREE.ShaderMaterial({
      uniforms: { uPx: { value: 600 } },
      transparent: true, depthWrite: false, blending,
      vertexShader: `attribute float aSize; attribute float aAlpha; attribute vec3 aCol;
        varying vec3 vCol; varying float vA; uniform float uPx;
        void main(){ vCol = aCol; vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = max(1.0, aSize * uPx / -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vCol; varying float vA;
        void main(){ float r = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.04, r);
          if (a * vA <= 0.001) discard; gl_FragColor = vec4(vCol, a * vA); }`
    });
  }
  function makePoints(n, blending, z) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), alpha = new Float32Array(n);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aCol', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const pts = new THREE.Points(geo, pointsMaterial(blending));
    pts.frustumCulled = false; pts.position.z = z;
    return { geo, pts, pos, col, size, alpha };
  }

  // ---- weather queries ----
  function wprops() { return (G.Weather && G.Weather.props) ? G.Weather.props() : {}; }
  function douses() { const p = wprops(); return (p.rain > 0) || (p.snow > 0); }   // rain / storm / snow / blizzard
  function emberWeather() { const p = wprops(); return (p.embers > 0) && !douses(); }
  function windy() { return (wprops().wind || 0) > 0.5; }
  function windWorld() { return (G.Weather && G.Weather.windVec) ? G.Weather.windVec() * 6.5 : 0; }
  function burnDuration() { return emberWeather() ? BURN_EMBERS : BURN_BASE; }

  // ---- spawning ----
  function spawnFlame(x, y) {
    const i = fi; fi = (fi + 1) % FIRE_N;
    fp.x[i] = x + rnd(-0.22, 0.22); fp.y[i] = y + rnd(-0.05, 0.05); fp.z[i] = rnd(-0.06, 0.06);
    fp.vx[i] = rnd(-0.45, 0.45); fp.vy[i] = rnd(3.0, 6.0);          // taller, faster -> flame tongues, not a blob
    fp.l[i] = fp.m[i] = rnd(0.34, 0.56); fp.s[i] = rnd(0.34, 0.62); fp.k[i] = 0;
  }
  function spawnEmber(x, y) {
    const i = fi; fi = (fi + 1) % FIRE_N;
    fp.x[i] = x + rnd(-0.2, 0.2); fp.y[i] = y + 0.2; fp.z[i] = rnd(-0.05, 0.08);
    fp.vx[i] = rnd(-0.7, 0.7) + windWorld() * 0.3; fp.vy[i] = rnd(2.6, 5.5);
    fp.l[i] = fp.m[i] = rnd(0.7, 1.5); fp.s[i] = rnd(0.07, 0.14); fp.k[i] = 1;
  }
  function spawnSmoke(x, y, vy0, warm) {
    const i = si; si = (si + 1) % SMOKE_N;
    sp.x[i] = x + rnd(-0.25, 0.25); sp.y[i] = y + rnd(0, 0.3); sp.z[i] = rnd(-0.12, 0.12);
    sp.vx[i] = rnd(-0.3, 0.3) + windWorld() * 0.5; sp.vy[i] = vy0 != null ? vy0 : rnd(0.8, 1.7);
    sp.l[i] = sp.m[i] = rnd(1.4, 2.6); sp.s[i] = rnd(0.7, 1.2); sp.k[i] = warm ? 2 : 0;
  }
  function spawnFrost(x, y) {                          // tiny drifting ice motes over frozen water
    const i = si; si = (si + 1) % SMOKE_N;
    sp.x[i] = x; sp.y[i] = y + rnd(-0.1, 0.6); sp.z[i] = rnd(-0.1, 0.1);
    sp.vx[i] = rnd(-0.4, 0.4) + windWorld() * 0.4; sp.vy[i] = rnd(-0.2, 0.25);
    sp.l[i] = sp.m[i] = rnd(1.2, 2.4); sp.s[i] = rnd(0.06, 0.13); sp.k[i] = 3;
  }
  function smokePuff(x, y, n) { for (let j = 0; j < (n || 8); j++) spawnSmoke(x, y + 0.2, rnd(1.0, 2.2), true); }

  // ---- scorch (drive the foliage aBurn attribute over a cell's vertex range) ----
  function setScorch(i, amt) {
    if (!burnAttr) return; const c = cells[i]; if (!c) return;
    const arr = burnAttr.array;
    for (let v = c.vs; v < c.ve; v++) arr[v] = amt;
    burnAttr.needsUpdate = true;
  }

  // ---- ignition ----
  function igniteCell(i, delay) {
    const s = state[i]; if (!s || s.st === 'burning') return false;
    if (s.st === 'burnt') return false;               // already ash; let it recover first
    if (douses()) { smokePuff(cells[i].x, cells[i].y, 4); return false; }   // rain/snow: it won't catch
    state[i] = { st: 'burning', t: 0, delay: delay || 0, dur: burnDuration(), spread: 0.6 + Math.random() * 0.5 };
    return true;
  }
  F.ignite = function (x, y, dir, opts) {
    if (!cells.length) return 0;
    dir = dir || 1; const range = (opts && opts.range) || 4.2;
    const x0 = dir > 0 ? x - 0.7 : x - range, x1 = dir > 0 ? x + range : x + 0.7;
    let n = 0;
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      if (c.x < x0 || c.x > x1 || Math.abs(c.y - y) > 1.8) continue;
      if (igniteCell(i, Math.abs(c.x - x) * 0.05)) n++;
    }
    return n;
  };
  F.igniteAt = function (x, y, dir) {                  // a passing projectile lights the grass beneath it
    if (!cells.length) return false;
    let best = -1, bd = 0.7;
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i]; const dy = y - c.y;
      if (dy < -1.0 || dy > 3.2) continue;             // cell at or below the bolt
      const dx = Math.abs(c.x - x); if (dx < bd && state[i].st === 'green') { bd = dx; best = i; }
    }
    if (best >= 0) return igniteCell(best, 0);
    return false;
  };
  F.burnEnemy = function (e, dur, dps) {
    if (!e || !e.isEnemy) return;
    const ex = burningEnemies.find(b => b.e === e);
    if (ex) { ex.t = Math.max(ex.t, dur); ex.dmg = Math.max(ex.dmg, dps); }
    else burningEnemies.push({ e, t: dur, tickT: 0, dmg: dps });
  };

  function extinguish(i, hard) {
    const s = state[i]; if (!s || s.st !== 'burning') return;
    const established = s.delay <= 0 && s.t > 1.6;
    smokePuff(cells[i].x, cells[i].y, established ? 10 : 5);
    if (established) {                                 // it really burned -> ash that lingers
      state[i] = { st: 'burnt' }; setScorch(i, 0.9);
      (burntByRoom[room.id] || (burntByRoom[room.id] = new Map())).set(i, playtime + BURN_PERSIST);
    } else {                                           // doused before it caught -> back to green
      state[i] = { st: 'green' }; setScorch(i, 0);
    }
  }

  // ---- room lifecycle ----
  F.setRoom = function (rm, grassCells, folMesh) {
    room = rm; cells = grassCells || []; iced = false;
    state = cells.map(() => ({ st: 'green' }));
    cellMap = new Map();
    for (let i = 0; i < cells.length; i++) cellMap.set(Math.round(cells[i].x) + ',' + Math.round(cells[i].y), i);
    burnAttr = (folMesh && folMesh.geometry && folMesh.geometry.getAttribute('aBurn')) || null;
    burningEnemies.length = 0;
    // fresh particle layers parented to this room (disposed with it on the next load)
    layer = new THREE.Group();
    firePts = makePoints(FIRE_N, THREE.AdditiveBlending, -0.04);
    smokePts = makePoints(SMOKE_N, THREE.NormalBlending, -0.12);
    fireGeo = firePts.geo; smokeGeo = smokePts.geo;
    layer.add(smokePts.pts, firePts.pts);
    rm.group.add(layer);
    for (let i = 0; i < FIRE_N; i++) fp.l[i] = 0;
    for (let i = 0; i < SMOKE_N; i++) sp.l[i] = 0;
    // re-apply scorch marks still within their 2-hour window
    const map = burntByRoom[rm.id];
    if (map) for (const [i, exp] of map) {
      if (exp > playtime && i < state.length) { state[i] = { st: 'burnt' }; setScorch(i, 0.9); }
      else map.delete(i);
    }
  };

  // ---- per-frame ----
  const FLAME_COL = [];
  function flameColor(frac, out) {                     // white-hot core -> orange -> dark red as it ages
    let r, g, b;
    if (frac > 0.5) { const t = (frac - 0.5) * 2; r = 1.0; g = 0.5 + 0.45 * t; b = 0.12 + 0.55 * t; }
    else { const t = frac * 2; r = 0.5 + 0.5 * t; g = 0.12 + 0.38 * t; b = 0.04 + 0.08 * t; }
    out[0] = r; out[1] = g; out[2] = b;
  }

  F.update = function (dt) {
    if (!G.EDITOR) playtime += dt;
    if (!layer) return;
    if (firePts) firePts.pts.material.uniforms.uPx.value = G.pxScale || 600;
    if (smokePts) smokePts.pts.material.uniforms.uPx.value = G.pxScale || 600;
    const rainNow = douses();
    const wWorld = windWorld();

    // burning enemies (fire DOT)
    for (let j = burningEnemies.length - 1; j >= 0; j--) {
      const b = burningEnemies[j];
      if (!b.e || !b.e.alive || b.e.dead) { burningEnemies.splice(j, 1); continue; }
      b.t -= dt; b.tickT -= dt;
      const body = b.e.body;
      if (body && Math.random() < dt * 22) spawnFlame(body.x + rnd(-0.3, 0.3), body.y - 0.2);
      if (b.tickT <= 0 && body) { b.tickT = 0.45; if (b.e.hurt) b.e.hurt(b.dmg, Math.sign(body.vx) || 1, 'fire'); }
      if (b.t <= 0) burningEnemies.splice(j, 1);
    }

    // grass cells
    for (let i = 0; i < state.length; i++) {
      const s = state[i], c = cells[i];
      if (s.st === 'burning') {
        if (rainNow) { extinguish(i); continue; }
        if (s.delay > 0) { s.delay -= dt; if (Math.random() < dt * 6) spawnSmoke(c.x, c.y, 0.7, true); continue; }
        s.t += dt;
        const scorch = Math.min(0.9, (s.t / Math.min(s.dur * 0.5, 3.0)) * 0.9);
        setScorch(i, scorch);
        // flames + embers + light smoke while alight
        let want = 12 * dt; while (want > 0) { if (want >= 1 || Math.random() < want) spawnFlame(c.x, c.y); want -= 1; }
        if (Math.random() < dt * 5) spawnEmber(c.x, c.y);
        if (Math.random() < dt * 3) spawnSmoke(c.x, c.y + 0.6, 1.4, true);
        // wind spreads established fire to the next cell downwind
        if (windy() && s.t > 0.7) {
          s.spread -= dt;
          if (s.spread <= 0) { s.spread = 0.7 + Math.random() * 0.5; const nb = cellMap.get(Math.round(c.x + Math.sign(wWorld || 1)) + ',' + Math.round(c.y)); if (nb != null && state[nb].st === 'green') igniteCell(nb, 0.15); }
        }
        if (s.t >= s.dur) extinguish(i);
      } else if (s.st === 'burnt') {
        const map = burntByRoom[room.id];
        const exp = map && map.get(i);
        if (exp == null || playtime > exp) { state[i] = { st: 'green' }; setScorch(i, 0); if (map) map.delete(i); }
      }
    }

    // reflective water freezes during snow / blizzard
    iceWater(dt);

    // integrate fire particles
    {
      const P = fireGeo.attributes.position.array, C = fireGeo.attributes.aCol.array, S = fireGeo.attributes.aSize.array, A = fireGeo.attributes.aAlpha.array;
      for (let i = 0; i < FIRE_N; i++) {
        if (fp.l[i] <= 0) { A[i] = 0; S[i] = 0; continue; }
        fp.l[i] -= dt; if (fp.l[i] <= 0) { A[i] = 0; S[i] = 0; continue; }
        const frac = fp.l[i] / fp.m[i];
        fp.vy[i] += (fp.k[i] === 1 ? 1.5 : 3.5) * dt;     // buoyancy
        fp.vx[i] += (wWorld * 0.5 - fp.vx[i]) * dt * 2.0;
        fp.x[i] += fp.vx[i] * dt; fp.y[i] += fp.vy[i] * dt;
        const o = i * 3; P[o] = fp.x[i]; P[o + 1] = fp.y[i]; P[o + 2] = fp.z[i];
        if (fp.k[i] === 1) { const fl = 0.7 + 0.3 * Math.sin(G.time * 40 + i); C[o] = 1.0; C[o + 1] = 0.62 * fl + 0.2; C[o + 2] = 0.18 * fl; S[i] = fp.s[i] * (0.6 + 0.4 * frac); A[i] = frac; }
        else { flameColor(frac, FLAME_COL); C[o] = FLAME_COL[0]; C[o + 1] = FLAME_COL[1]; C[o + 2] = FLAME_COL[2]; S[i] = fp.s[i] * (0.28 + 0.72 * frac); A[i] = Math.min(0.92, frac * 1.15); }
      }
      fireGeo.attributes.position.needsUpdate = fireGeo.attributes.aCol.needsUpdate = fireGeo.attributes.aSize.needsUpdate = fireGeo.attributes.aAlpha.needsUpdate = true;
    }
    // integrate smoke particles
    {
      const P = smokeGeo.attributes.position.array, C = smokeGeo.attributes.aCol.array, S = smokeGeo.attributes.aSize.array, A = smokeGeo.attributes.aAlpha.array;
      for (let i = 0; i < SMOKE_N; i++) {
        if (sp.l[i] <= 0) { A[i] = 0; S[i] = 0; continue; }
        sp.l[i] -= dt; if (sp.l[i] <= 0) { A[i] = 0; S[i] = 0; continue; }
        const frac = sp.l[i] / sp.m[i], age = 1 - frac;
        sp.vy[i] += (sp.k[i] === 3 ? -0.05 : 0.35) * dt;
        sp.vx[i] += (wWorld * 0.7 - sp.vx[i]) * dt * 1.4;
        sp.x[i] += sp.vx[i] * dt; sp.y[i] += sp.vy[i] * dt;
        const o = i * 3; P[o] = sp.x[i]; P[o + 1] = sp.y[i]; P[o + 2] = sp.z[i];
        if (sp.k[i] === 3) { C[o] = 0.85; C[o + 1] = 0.92; C[o + 2] = 1.0; S[i] = sp.s[i]; A[i] = Math.min(1, age * 4) * frac * 0.9; }
        else {
          const g = sp.k[i] === 2 ? (0.16 + age * 0.18) : (0.2 + age * 0.16);   // warm soot -> cool grey
          C[o] = g + (sp.k[i] === 2 ? 0.06 * frac : 0); C[o + 1] = g; C[o + 2] = g + 0.02;
          S[i] = sp.s[i] * (0.7 + age * 1.8); A[i] = Math.min(1, age * 5) * frac * 0.42;
        }
      }
      smokeGeo.attributes.position.needsUpdate = smokeGeo.attributes.aCol.needsUpdate = smokeGeo.attributes.aSize.needsUpdate = smokeGeo.attributes.aAlpha.needsUpdate = true;
    }
  };

  function iceWater(dt) {
    if (!G.Post || !G.Post.setWater || !room || !room.lookState) return;
    const base = room.lookState.water; if (!base || base.y == null) return;
    const w = G.Weather, snowy = w && (w.kind === 'snow' || w.kind === 'blizzard');
    if (snowy && !iced) {
      iced = true;
      G.Post.setWater({ y: base.y, strength: (base.strength != null ? base.strength : 0.55) + 0.12, ripple: 0.12, fade: base.fade, caustics: 0, color: 0xc6dcf2 });
    } else if (!snowy && iced) {
      iced = false; G.Post.setWater(base);
    }
    if (iced && G.camera && Math.random() < dt * 7) spawnFrost(G.camera.position.x + rnd(-13, 13), base.y);
  }

  function rnd(a, b) { return a + Math.random() * (b - a); }
  // exposed for tests / debug
  F.stats = function () {
    let burning = 0, burnt = 0;
    for (const s of state) { if (s.st === 'burning') burning++; else if (s.st === 'burnt') burnt++; }
    return { cells: cells.length, burning, burnt, iced, playtime: +playtime.toFixed(1), enemies: burningEnemies.length };
  };
  F._setPlaytime = function (v) { playtime = v; };     // tests only: fast-forward gameplay time
  F._sample = function () { return cells[0] ? { x: cells[0].x, y: cells[0].y } : null; };
  F._scorchAt = function () {                           // tests: max aBurn value currently set (0 = none, ~0.9 = scorched)
    if (!burnAttr) return 0; let m = 0; const a = burnAttr.array; for (let i = 0; i < a.length; i++) if (a[i] > m) m = a[i]; return +m.toFixed(2);
  };
})();
