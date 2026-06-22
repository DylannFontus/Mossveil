// MOSSVEIL — lights.js : real-time 2D light accumulation. Lights are registered per room
// (lamps, glow-crystals, the player's lantern, spells, fire…) and composited by post.js:
// flat surfaces darken toward a moody per-biome ambient and pool coloured light, while
// bright/emissive pixels (sky, glows, the lights themselves) stay lit. Toggle in Settings.
(function () {
  const Lt = G.Lights = { list: [], enabled: true, strength: 1, MAX: 24 };
  const amb = new THREE.Color(0.32, 0.34, 0.4);
  const _v = new THREE.Vector3();

  // room reloads clear room lights but KEEP persistent ones (e.g. the player's lantern)
  Lt.clear = function () { Lt.list = Lt.list.filter(l => l.persistent); };
  Lt.setAmbient = function (c) { amb.set(c); };
  Lt.ambient = () => amb;

  // opts: { x, y, color, radius, intensity, flicker(0..1), follow(()->{x,y}), persistent }
  Lt.add = function (o) {
    const lt = {
      x: o.x || 0, y: o.y || 0,
      color: new THREE.Color(o.color != null ? o.color : 0xffffff),
      radius: o.radius || 8, intensity: o.intensity != null ? o.intensity : 1,
      flicker: o.flicker || 0, follow: o.follow || null, persistent: !!o.persistent,
      _ph: Math.random() * 9, _f: 1
    };
    Lt.list.push(lt);
    return lt;
  };
  Lt.remove = function (lt) { const i = Lt.list.indexOf(lt); if (i >= 0) Lt.list.splice(i, 1); };

  Lt.update = function (dt, t) {
    for (const lt of Lt.list) {
      if (lt.follow) { const p = lt.follow(); if (p) { lt.x = p.x; lt.y = p.y; } }
      lt._f = lt.flicker ? (1 - lt.flicker * 0.5 + lt.flicker * (0.5 * Math.sin(t * 11 + lt._ph) + 0.25 * Math.sin(t * 27 + lt._ph * 2)) * 0.5 + lt.flicker * 0.5) : 1;
    }
  };

  // the N nearest lights to the camera (world-space — the composite reconstructs pixel
  // world position from depth, so lighting + shadows all work in world units)
  Lt.gather = function (camera, max) {
    let src = Lt.list;
    if (src.length > max) {
      const cx = camera.position.x, cy = camera.position.y;
      src = src.slice().sort((a, b) =>
        ((a.x - cx) * (a.x - cx) + (a.y - cy) * (a.y - cy)) -
        ((b.x - cx) * (b.x - cx) + (b.y - cy) * (b.y - cy))).slice(0, max);
    }
    const out = [];
    for (const lt of src) {
      if (lt.intensity * lt._f <= 0.001) continue;
      out.push({ x: lt.x, y: lt.y, rad: lt.radius, r: lt.color.r, g: lt.color.g, b: lt.color.b, i: lt.intensity * lt._f * Lt.strength });
    }
    return out;
  };

  // ---- per-room signed-distance field of the terrain occluders (for soft shadows) ----
  // 8SSEDT distance transform: for each texel, the distance (world units) to the nearest
  // solid tile; 0 inside solids. Marched in the shader to cast soft shadows.
  Lt.sdfTex = null; Lt.sdfMaxD = 28; Lt.roomW = 1; Lt.roomH = 1;
  function edt(occ, W, H) {
    const INF = 1e9, n = W * H;
    const gx = new Float32Array(n), gy = new Float32Array(n);
    for (let k = 0; k < n; k++) { if (occ[k]) { gx[k] = 0; gy[k] = 0; } else { gx[k] = INF; gy[k] = INF; } }
    const d2 = k => gx[k] * gx[k] + gy[k] * gy[k];
    function cmp(x, y, ox, oy) {
      const nx = x + ox, ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) return;
      const k = y * W + x, nk = ny * W + nx, cdx = gx[nk] + ox, cdy = gy[nk] + oy;
      if (cdx * cdx + cdy * cdy < d2(k)) { gx[k] = cdx; gy[k] = cdy; }
    }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) { cmp(x, y, -1, 0); cmp(x, y, 0, -1); cmp(x, y, -1, -1); cmp(x, y, 1, -1); }
      for (let x = W - 1; x >= 0; x--) cmp(x, y, 1, 0);
    }
    for (let y = H - 1; y >= 0; y--) {
      for (let x = W - 1; x >= 0; x--) { cmp(x, y, 1, 0); cmp(x, y, 0, 1); cmp(x, y, 1, 1); cmp(x, y, -1, 1); }
      for (let x = 0; x < W; x++) cmp(x, y, -1, 0);
    }
    const dist = new Float32Array(n);
    for (let k = 0; k < n; k++) { const dd = Math.sqrt(d2(k)); dist[k] = dd > 1e8 ? 1e8 : dd; }
    return dist;
  }
  Lt.buildSDF = function (occ, W, H, roomW, roomH) {
    const n = W * H;
    const distOut = edt(occ, W, H);                 // 0 inside terrain, >0 in air (dist to terrain)
    const inv = new Uint8Array(n);
    for (let k = 0; k < n; k++) inv[k] = occ[k] ? 0 : 1;
    const distIn = edt(inv, W, H);                  // 0 in air, >0 inside terrain (dist to nearest edge)
    const res = W / roomW, maxD = 28;
    const data = new Uint8Array(n * 4);
    for (let k = 0; k < n; k++) {
      // signed world distance: + in air (dist to terrain), − inside terrain (dist to edge)
      const d = (occ[k] ? -distIn[k] : distOut[k]) / res;
      const v = Math.min(255, Math.max(0, ((d / maxD) * 0.5 + 0.5) * 255)) | 0;
      data[k * 4] = v; data[k * 4 + 1] = v; data[k * 4 + 2] = v; data[k * 4 + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.minFilter = tex.magFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    if (Lt.sdfTex) Lt.sdfTex.dispose();
    Lt.sdfTex = tex; Lt.sdfMaxD = maxD; Lt.roomW = roomW; Lt.roomH = roomH;
  };
})();
