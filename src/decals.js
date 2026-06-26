// MOSSVEIL — decals.js : persistent ground marks / splats (G.Decals).  Roadmap #72.
// NET-NEW render feature: the game had no lasting marks — every impact effect was a particle burst
// that faded in a fraction of a second. This adds flat textured quads that LINGER on the surface
// where things happen (a scorch where a foe dies, a scuff where you land hard, a crater under a
// slain boss) and then slowly fade. Each mark is a "kind" (procedural texture + colour + size +
// lifetime + fade) authored in data/decals.js (G.DECALS_DATA); a small EVENTS map binds game events
// (enemyDeath / bossDeath / playerLand / fireballHit) to a kind, so WHAT leaves a mark and HOW it
// looks is fully data-driven. The game seams are one guarded G.Decals.emit(...) line each. No THREE /
// document at load (gen-data node-evals this for the default overlay); all GL/canvas work is deferred
// to spawn time. Decals live in a scene-level group, fade in D.update(dt), and are wiped on room load.
(function () {
  const D = G.Decals = {};
  const clone = o => JSON.parse(JSON.stringify(o));
  const num = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : d;
  const clamp = (v, lo, hi, d) => Math.max(lo, Math.min(hi, num(v, d)));
  const TAU = Math.PI * 2;
  const TEXES = ['scorch', 'stain', 'splat', 'ring', 'scuff', 'crack'];
  const ROTS = ['random', 'flat'];

  // ---- defaults (authored in a fixed key order so a default overlay round-trips byte-identical) ----
  const DEFAULTS = {
    enabled: true,
    cap: 60,        // max simultaneous decals; spawning past this recycles the oldest
    scale: 1,       // global size multiplier over every kind
    kinds: {
      scorch: { tex: 'scorch', color: 0x1a1410, size: 1.6, sizeVar: 0.4, alpha: 0.62, life: 13, fadeIn: 0.18, fadeOut: 3.5, rot: 'random', blend: 'normal', yOff: -0.1 },
      ash:    { tex: 'stain',  color: 0x2a2a30, size: 1.25, sizeVar: 0.5, alpha: 0.42, life: 9, fadeIn: 0.18, fadeOut: 2.6, rot: 'random', blend: 'normal', yOff: 0 },
      scuff:  { tex: 'scuff',  color: 0x6a6358, size: 1.5, sizeVar: 0.35, alpha: 0.34, life: 3.6, fadeIn: 0.04, fadeOut: 1.3, rot: 'flat', blend: 'normal', yOff: -0.12 },
      crater: { tex: 'crack',  color: 0x120e15, size: 3.4, sizeVar: 0.25, alpha: 0.7, life: 22, fadeIn: 0.2, fadeOut: 4.5, rot: 'random', blend: 'normal', yOff: -0.1 },
      splat:  { tex: 'splat',  color: 0x6fa83a, size: 1.15, sizeVar: 0.45, alpha: 0.55, life: 11, fadeIn: 0.04, fadeOut: 3, rot: 'random', blend: 'normal', yOff: 0 }
    },
    // game event -> kind id ('' = no mark). Bound to the guarded emit() seams in the game code.
    events: {
      enemyDeath: 'scorch',
      bossDeath: 'crater',
      playerLand: 'scuff',
      fireballHit: 'ash'
    }
  };

  // ---- data layer ----
  let cfg = null;
  function cleanKind(k, base) {
    k = k || {}; base = base || {};
    return {                                         // keys in DEFAULT order -> byte-identical round-trip
      tex: TEXES.indexOf(k.tex) >= 0 ? k.tex : (base.tex || 'stain'),
      color: (typeof k.color === 'number' && isFinite(k.color)) ? (k.color & 0xffffff) : (base.color != null ? base.color : 0xffffff),
      size: clamp(k.size, 0.1, 12, num(base.size, 1)),
      sizeVar: clamp(k.sizeVar, 0, 6, num(base.sizeVar, 0)),
      alpha: clamp(k.alpha, 0, 1, num(base.alpha, 0.7)),
      life: clamp(k.life, 0.2, 180, num(base.life, 10)),
      fadeIn: clamp(k.fadeIn, 0, 30, num(base.fadeIn, 0.1)),
      fadeOut: clamp(k.fadeOut, 0, 60, num(base.fadeOut, 1)),
      rot: ROTS.indexOf(k.rot) >= 0 ? k.rot : (base.rot || 'random'),
      blend: k.blend === 'additive' ? 'additive' : 'normal',
      yOff: clamp(k.yOff, -4, 4, num(base.yOff, 0))
    };
  }
  function applyData(data) {
    const d = data || (typeof G !== 'undefined' && G.DECALS_DATA) || null;
    cfg = clone(DEFAULTS);
    if (!d) return;
    cfg.enabled = d.enabled !== false;
    cfg.cap = clamp(d.cap, 1, 400, DEFAULTS.cap) | 0;
    cfg.scale = clamp(d.scale, 0.1, 6, DEFAULTS.scale);
    if (d.kinds && typeof d.kinds === 'object') {
      cfg.kinds = {};
      for (const id in d.kinds) cfg.kinds[id] = cleanKind(d.kinds[id], DEFAULTS.kinds[id]);
    }
    if (d.events && typeof d.events === 'object') {
      cfg.events = {};
      for (const e in d.events) cfg.events[e] = (typeof d.events[e] === 'string') ? d.events[e] : '';
    }
  }
  D.applyData = applyData;
  D.exportDefaults = () => clone(DEFAULTS);
  D.exportCurrent = () => clone(cfg);
  D.cleanKind = (k, baseId) => cleanKind(k, DEFAULTS.kinds[baseId]);
  D.TEXES = () => TEXES.slice();
  D.ROTS = () => ROTS.slice();
  D.kinds = () => clone(cfg.kinds);
  D.events = () => clone(cfg.events);
  D.kind = id => cfg.kinds[id] ? clone(cfg.kinds[id]) : null;

  // ---- procedural mark textures (browser only; white alpha shapes, tinted by the material) ----
  const texCache = {};
  function rnd() { return Math.random(); }
  function paint(type, g, S) {
    const cx = S / 2, cy = S / 2;
    g.clearRect(0, 0, S, S);
    if (type === 'scorch') {
      for (let k = 0; k < 3; k++) {
        g.beginPath();
        const lobes = 9;
        for (let i = 0; i <= lobes; i++) { const a = i / lobes * TAU, r = S * 0.4 * (0.7 + 0.3 * rnd()) * (1 - k * 0.13), x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; i ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.closePath();
        const grd = g.createRadialGradient(cx, cy, 2, cx, cy, S * 0.46);
        grd.addColorStop(0, 'rgba(255,255,255,' + (0.5 - k * 0.12) + ')'); grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd; g.fill();
      }
      for (let i = 0; i < 44; i++) { const a = rnd() * TAU, r = rnd() * S * 0.42; g.fillStyle = 'rgba(255,255,255,' + (0.2 + rnd() * 0.5) + ')'; g.beginPath(); g.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, rnd() * 2.4, 0, TAU); g.fill(); }
    } else if (type === 'stain') {
      const grd = g.createRadialGradient(cx, cy, 2, cx, cy, S * 0.47);
      grd.addColorStop(0, 'rgba(255,255,255,0.85)'); grd.addColorStop(0.6, 'rgba(255,255,255,0.4)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.fillRect(0, 0, S, S);
    } else if (type === 'splat') {
      const grd = g.createRadialGradient(cx, cy, 2, cx, cy, S * 0.3);
      grd.addColorStop(0, 'rgba(255,255,255,0.95)'); grd.addColorStop(1, 'rgba(255,255,255,0.1)');
      g.fillStyle = grd; g.beginPath();
      const lobes = 8;
      for (let i = 0; i <= lobes; i++) { const a = i / lobes * TAU, r = S * 0.26 * (0.7 + 0.5 * rnd()), x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; i ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.closePath(); g.fill();
      for (let i = 0; i < 11; i++) { const a = rnd() * TAU, r = S * (0.28 + rnd() * 0.18), rad = S * (0.02 + rnd() * 0.05); g.fillStyle = 'rgba(255,255,255,' + (0.5 + rnd() * 0.4) + ')'; g.beginPath(); g.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, rad, 0, TAU); g.fill(); }
    } else if (type === 'ring') {
      for (let k = 0; k < 2; k++) { g.strokeStyle = 'rgba(255,255,255,' + (0.75 - k * 0.32) + ')'; g.lineWidth = S * (0.045 - k * 0.018); g.beginPath(); g.arc(cx, cy, S * (0.3 + k * 0.1), 0, TAU); g.stroke(); }
    } else if (type === 'scuff') {
      const grd = g.createRadialGradient(cx, cy, 2, cx, cy, S * 0.45);
      grd.addColorStop(0, 'rgba(255,255,255,0.6)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.save(); g.translate(cx, cy); g.scale(1.7, 0.5); g.translate(-cx, -cy); g.fillStyle = grd; g.fillRect(0, 0, S, S); g.restore();
      for (let i = 0; i < 16; i++) { const x = cx + (rnd() - 0.5) * S * 0.75, y = cy + (rnd() - 0.5) * S * 0.18; g.fillStyle = 'rgba(255,255,255,' + (0.2 + rnd() * 0.4) + ')'; g.fillRect(x, y, rnd() * S * 0.1, 1.5); }
    } else if (type === 'crack') {
      g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineCap = 'round';
      const arms = 11;
      for (let i = 0; i < arms; i++) {
        let x = cx, y = cy; const a0 = i / arms * TAU + rnd() * 0.35, len = S * (0.3 + rnd() * 0.18); g.lineWidth = 2.4; g.beginPath(); g.moveTo(x, y);
        const steps = 4; for (let s = 0; s < steps; s++) { const aa = a0 + (rnd() - 0.5) * 0.5; x += Math.cos(aa) * len / steps; y += Math.sin(aa) * len / steps; g.lineTo(x, y); }
        g.stroke();
      }
      const grd = g.createRadialGradient(cx, cy, 2, cx, cy, S * 0.22); grd.addColorStop(0, 'rgba(255,255,255,0.7)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = grd; g.fillRect(0, 0, S, S);
    } else {
      const grd = g.createRadialGradient(cx, cy, 2, cx, cy, S * 0.47); grd.addColorStop(0, 'rgba(255,255,255,0.8)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = grd; g.fillRect(0, 0, S, S);
    }
  }
  function getTex(type) {
    if (texCache[type]) return texCache[type];
    const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S;
    paint(type, cv.getContext('2d'), S);
    const t = new THREE.CanvasTexture(cv);
    t.needsUpdate = true;
    return (texCache[type] = t);
  }

  // ---- live decals in the scene ----
  let group = null, geo = null, live = [], seq = 0;
  function ensureGroup() {
    if (typeof THREE === 'undefined' || !G.scene) return null;
    if (group && group.parent === G.scene) return group;
    if (!geo) geo = new THREE.PlaneGeometry(1, 1);
    group = new THREE.Group(); group.name = 'decals'; group.renderOrder = -2;
    G.scene.add(group);
    return group;
  }
  function disposeRec(d) { if (group) group.remove(d.mesh); if (d.mat) d.mat.dispose(); }

  // spawn a specific kind at world (x,y). opts: { dx, scale, color, rot }
  D.spawn = function (kindId, x, y, opts) {
    if (!cfg || !cfg.enabled) return null;
    const k = cfg.kinds[kindId];
    if (!k) return null;
    if (typeof THREE === 'undefined' || !G.scene) return null;   // not in a running game (gen-data/headless data)
    if (!ensureGroup()) return null;
    opts = opts || {};
    while (live.length >= cfg.cap) disposeRec(live.shift());
    const mat = new THREE.MeshBasicMaterial({
      map: getTex(k.tex), color: (opts.color != null ? opts.color : k.color),
      transparent: true, opacity: 0, depthWrite: false, depthTest: true,
      blending: k.blend === 'additive' ? THREE.AdditiveBlending : THREE.NormalBlending
    });
    const m = new THREE.Mesh(geo, mat);
    const sv = k.sizeVar ? (Math.random() * 2 - 1) * k.sizeVar : 0;
    const sz = Math.max(0.05, (k.size + sv) * cfg.scale * (opts.scale || 1));
    m.scale.set(sz, sz, 1);
    const rot = opts.rot != null ? opts.rot : (k.rot === 'random' ? Math.random() * TAU : 0);
    m.rotation.z = rot;
    // sit just behind the z=0 character plane (so foes/player draw over it) but ahead of the backdrop;
    // a tiny per-decal z-stagger avoids z-fighting where marks overlap.
    m.position.set(x + (opts.dx || 0), y + k.yOff, -0.05 - (seq++ % 64) * 0.0015);
    m.renderOrder = -2;
    group.add(m);
    const rec = { mesh: m, mat, t: 0, life: k.life, fadeIn: k.fadeIn, fadeOut: k.fadeOut, alpha: k.alpha };
    live.push(rec);
    return rec;
  };

  // bind a game event to its kind and place a mark (the seam the game code calls)
  D.emit = function (event, x, y, opts) {
    if (!cfg || !cfg.enabled) return null;
    const id = cfg.events[event];
    if (!id) return null;
    return D.spawn(id, x, y, opts);
  };

  D.update = function (dt) {
    if (!live.length) return;
    for (let i = live.length - 1; i >= 0; i--) {
      const d = live[i];
      d.t += dt;
      if (d.t >= d.life) { disposeRec(d); live.splice(i, 1); continue; }
      let a = d.alpha;
      if (d.fadeIn > 0 && d.t < d.fadeIn) a *= d.t / d.fadeIn;
      else if (d.fadeOut > 0 && d.t > d.life - d.fadeOut) a *= (d.life - d.t) / d.fadeOut;
      d.mat.opacity = a;
    }
  };

  D.clear = function () {
    for (const d of live) disposeRec(d);
    live.length = 0; seq = 0;
  };
  D.count = () => live.length;
  D._live = () => live;       // test hook

  applyData();
})();
