// MOSSVEIL — util.js : math, rng, shape & texture helpers
window.G = window.G || {};
(function () {
  const U = G.U = {};
  U.TAU = Math.PI * 2;
  U.clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.damp = (a, b, l, dt) => U.lerp(a, b, 1 - Math.exp(-l * dt));
  U.sign = v => v < 0 ? -1 : 1;
  U.rand = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
  U.randi = (a, b) => Math.floor(U.rand(a, b + 1));
  U.pick = arr => arr[(Math.random() * arr.length) | 0];
  U.chance = p => Math.random() < p;
  U.now = () => performance.now() / 1000;
  U.dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
  U.overlap = (a, b) => Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h;

  U.mulberry32 = seed => {
    let t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  };

  U.ease = {
    linear: t => t,
    outQuad: t => 1 - (1 - t) * (1 - t),
    outCubic: t => 1 - Math.pow(1 - t, 3),
    inCubic: t => t * t * t,
    inQuad: t => t * t,
    inOutQuad: t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
    inOutCubic: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
    inBack: t => { const c = 1.70158; return t * t * ((c + 1) * t - c); },
    outBack: t => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    outElastic: t => t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - .75) * (U.TAU / 3)) + 1
  };
  // CSS-style cubic-bezier easing (P0=0,0  P3=1,1) -> returns a t->y function (Newton solve)
  U.cubicBezier = function (x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const bezX = t => ((ax * t + bx) * t + cx) * t;
    const bezY = t => ((ay * t + by) * t + cy) * t;
    const dX = t => (3 * ax * t + 2 * bx) * t + cx;
    return function (t) {
      if (t <= 0) return 0; if (t >= 1) return 1;
      let u = t;
      for (let i = 0; i < 6; i++) { const x = bezX(u) - t, d = dX(u); if (Math.abs(x) < 1e-4 || Math.abs(d) < 1e-6) break; u -= x / d; }
      return bezY(Math.max(0, Math.min(1, u)));
    };
  };

  U.makeCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };

  let _glowTex = null;
  U.glowTex = () => {
    if (_glowTex) return _glowTex;
    const [c, x] = U.makeCanvas(128, 128);
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(.22, 'rgba(255,255,255,.5)');
    g.addColorStop(.55, 'rgba(255,255,255,.12)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    _glowTex = new THREE.CanvasTexture(c);
    return _glowTex;
  };

  let _dotTex = null;
  U.dotTex = () => {
    if (_dotTex) return _dotTex;
    const [c, x] = U.makeCanvas(64, 64);
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(.4, 'rgba(255,255,255,.85)');
    g.addColorStop(.75, 'rgba(255,255,255,.18)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    _dotTex = new THREE.CanvasTexture(c);
    return _dotTex;
  };

  U.css = h => '#' + h.toString(16).padStart(6, '0');
  U.colLerp = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();

  // ---- shapes ----
  U.poly = pts => {
    const s = new THREE.Shape();
    s.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
    s.closePath();
    return s;
  };
  U.splineShape = pts => {
    const s = new THREE.Shape();
    s.moveTo(pts[0][0], pts[0][1]);
    s.splineThru(pts.slice(1).map(p => new THREE.Vector2(p[0], p[1])));
    s.closePath();
    return s;
  };
  U.ellipse = (w, h) => {
    const s = new THREE.Shape();
    s.absellipse(0, 0, w / 2, h / 2, 0, U.TAU, false, 0);
    return s;
  };

  // flat vector-style mesh; owns its material so tinting/flashing is safe
  U.flat = (shape, color, o = {}) => {
    const geo = (shape && shape.isBufferGeometry) ? shape : new THREE.ShapeGeometry(shape, o.seg || 12);
    const transparent = (o.opacity !== undefined && o.opacity < 1) || !!o.additive;
    const mat = new THREE.MeshBasicMaterial({
      color,
      fog: !!o.fog,
      transparent,
      opacity: o.opacity === undefined ? 1 : o.opacity,
      blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: o.depthWrite === undefined ? !transparent : o.depthWrite,
      side: THREE.DoubleSide
    });
    const m = new THREE.Mesh(geo, mat);
    if (o.x) m.position.x = o.x;
    if (o.y) m.position.y = o.y;
    if (o.z !== undefined) m.position.z = o.z;
    if (o.sx !== undefined) m.scale.x = o.sx;
    if (o.sy !== undefined) m.scale.y = o.sy;
    if (o.rot) m.rotation.z = o.rot;
    return m;
  };

  U.glowSprite = (color, scale, opacity) => {
    const mat = new THREE.SpriteMaterial({
      map: U.glowTex(), color, transparent: true, opacity,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const s = new THREE.Sprite(mat);
    s.scale.set(scale, scale, 1);
    return s;
  };

  U.disposeDeep = obj => {
    obj.traverse(c => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) {
        const mats = Array.isArray(c.material) ? c.material : [c.material];
        mats.forEach(m => {
          if (m.map && m.userData && m.userData.ownMap) m.map.dispose();
          m.dispose();
        });
      }
    });
  };

  const _v3 = new THREE.Vector3();
  U.toScreen = (x, y) => {
    _v3.set(x, y, 0).project(G.camera);
    const vw = G.viewW || innerWidth, vh = G.viewH || innerHeight;
    return { x: (_v3.x * .5 + .5) * vw, y: (-_v3.y * .5 + .5) * vh };
  };

  // tint all mesh materials in a group (white hurt-flash by default; pass a hex for e.g. stagger)
  U.flashGroup = (group, dur = 0.07, hex = 0xffffff) => {
    const saved = [];
    group.traverse(c => {
      if (c.material && c.material.color) {
        saved.push([c.material, c.material.color.getHex()]);
        c.material.color.setHex(hex);
      }
    });
    setTimeout(() => { saved.forEach(([m, h]) => { m.color.setHex(h); }); }, dur * 1000);
  };
})();
