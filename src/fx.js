// MOSSVEIL — fx.js : particles, slashes, rings, ghosts, shake, hit-stop
(function () {
  const U = G.U;
  const FX = G.FX = {};

  // ---------------- particle pool ----------------
  class Pool {
    constructor(max, additive) {
      this.max = max;
      this.free = [];
      for (let i = max - 1; i >= 0; i--) this.free.push(i);
      this.active = new Set();
      this.x = new Float32Array(max); this.y = new Float32Array(max);
      this.vx = new Float32Array(max); this.vy = new Float32Array(max);
      this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
      this.s0 = new Float32Array(max); this.s1 = new Float32Array(max);
      this.grav = new Float32Array(max); this.drag = new Float32Array(max);
      this.alpha0 = new Float32Array(max); this.home = new Uint8Array(max);
      this.swirl = new Float32Array(max);

      const geo = this.geo = new THREE.BufferGeometry();
      this.pos = new Float32Array(max * 3);
      this.col = new Float32Array(max * 3);
      this.sizeA = new Float32Array(max);
      this.alphaA = new Float32Array(max);
      geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
      geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
      geo.setAttribute('aSize', new THREE.BufferAttribute(this.sizeA, 1));
      geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphaA, 1));
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

      this.mat = new THREE.ShaderMaterial({
        uniforms: { uPx: { value: 600 }, uTex: { value: U.dotTex() } },
        vertexShader: `
          attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
          uniform float uPx; varying vec4 vCol;
          void main(){
            vCol = vec4(aColor, aAlpha);
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = aSize * uPx / -mv.z;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `
          uniform sampler2D uTex; varying vec4 vCol;
          void main(){
            vec4 t = texture2D(uTex, gl_PointCoord);
            gl_FragColor = vec4(vCol.rgb, vCol.a) * t;
          }`,
        transparent: true, depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
      });
      this.points = new THREE.Points(geo, this.mat);
      this.points.frustumCulled = false;
      this.points.renderOrder = additive ? 20 : 19;
    }
    spawn(o) {
      if (!this.free.length) return;
      const i = this.free.pop();
      this.active.add(i);
      this.x[i] = o.x; this.y[i] = o.y;
      this.vx[i] = o.vx || 0; this.vy[i] = o.vy || 0;
      this.life[i] = this.maxLife[i] = o.life || 0.6;
      this.s0[i] = o.size || 0.2; this.s1[i] = o.sizeEnd !== undefined ? o.sizeEnd : (o.size || 0.2) * 0.3;
      this.grav[i] = o.grav || 0; this.drag[i] = o.drag || 0;
      this.alpha0[i] = o.alpha !== undefined ? o.alpha : 1;
      this.home[i] = o.home ? 1 : 0;
      this.swirl[i] = o.swirl || 0;
      const c = new THREE.Color(o.color === undefined ? 0xffffff : o.color);
      this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
    }
    update(dt) {
      const px = G.player ? G.player.body.x : 0, py = G.player ? G.player.body.y + 0.5 : 0;
      for (const i of this.active) {
        this.life[i] -= dt;
        if (this.life[i] <= 0) {
          this.active.delete(i); this.free.push(i);
          this.alphaA[i] = 0; this.sizeA[i] = 0;
          continue;
        }
        let vx = this.vx[i], vy = this.vy[i];
        vy -= this.grav[i] * dt;
        if (this.drag[i]) { const d = Math.max(0, 1 - this.drag[i] * dt); vx *= d; vy *= d; }
        if (this.home[i] && G.player) {
          const dx = px - this.x[i], dy = py - this.y[i];
          const d = Math.hypot(dx, dy) + 0.001;
          vx += (dx / d) * 60 * dt; vy += (dy / d) * 60 * dt;
          if (d < 0.6) this.life[i] = Math.min(this.life[i], 0.05);
        }
        if (this.swirl[i]) {
          const a = this.swirl[i] * dt;
          const nvx = vx * Math.cos(a) - vy * Math.sin(a);
          vy = vx * Math.sin(a) + vy * Math.cos(a); vx = nvx;
        }
        this.vx[i] = vx; this.vy[i] = vy;
        this.x[i] += vx * dt; this.y[i] += vy * dt;
        const t = 1 - this.life[i] / this.maxLife[i];
        this.pos[i * 3] = this.x[i]; this.pos[i * 3 + 1] = this.y[i]; this.pos[i * 3 + 2] = 0.6;
        this.sizeA[i] = U.lerp(this.s0[i], this.s1[i], t);
        this.alphaA[i] = this.alpha0[i] * (t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85);
      }
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.aSize.needsUpdate = true;
      this.geo.attributes.aAlpha.needsUpdate = true;
      this.geo.attributes.aColor.needsUpdate = true;
    }
  }

  let addPool, mixPool;
  const anims = []; // transient mesh animations {update(dt)->bool}
  let shakeAmp = 0, shakeDur = 0, shakeT = 0;

  FX.init = scene => {
    addPool = new Pool(1400, true);
    mixPool = new Pool(500, false);
    scene.add(addPool.points);
    scene.add(mixPool.points);
  };

  FX.resize = (h, fov) => {
    const px = (h / 2) / Math.tan(THREE.MathUtils.degToRad(fov / 2));
    if (addPool) { addPool.mat.uniforms.uPx.value = px; mixPool.mat.uniforms.uPx.value = px; }
  };

  FX.p = (additive, o) => { (additive ? addPool : mixPool).spawn(o); };

  // ---------------- burst presets ----------------
  FX.BURSTS = ['dust', 'land', 'spark', 'soul', 'spore', 'heal', 'healPop', 'death', 'gib', 'ember', 'leaf', 'mote'];
  FX.burst = (name, x, y, o = {}) => {
    const n = o.n, dir = o.dir || 0, col = o.color;
    switch (name) {
      case 'dust':
        for (let i = 0; i < (n || 6); i++)
          FX.p(false, { x: x + U.rand(-.3, .3), y: y + U.rand(0, .2), vx: U.rand(-1.5, 1.5) + dir * 2, vy: U.rand(.5, 2), life: U.rand(.3, .7), size: U.rand(.25, .5), sizeEnd: .9, color: col || 0x5a6a60, alpha: .28, drag: 2 });
        break;
      case 'land':
        for (let i = 0; i < 10; i++) {
          const s = i < 5 ? -1 : 1;
          FX.p(false, { x: x + s * .2, y: y, vx: s * U.rand(1, 4), vy: U.rand(.2, 1.4), life: U.rand(.25, .5), size: U.rand(.3, .55), sizeEnd: 1, color: col || 0x5a6a60, alpha: .3, drag: 3 });
        }
        break;
      case 'spark':
        for (let i = 0; i < (n || 10); i++) {
          const a = U.rand(0, U.TAU), sp = U.rand(4, 11);
          FX.p(true, { x, y, vx: Math.cos(a) * sp + dir * 4, vy: Math.sin(a) * sp, life: U.rand(.12, .3), size: U.rand(.12, .3), color: col || 0xfff4c8, grav: 12, drag: 2 });
        }
        break;
      case 'soul':
        for (let i = 0; i < (n || 7); i++) {
          const a = U.rand(0, U.TAU), sp = U.rand(2, 6);
          FX.p(true, { x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + 2, life: U.rand(.5, .9), size: U.rand(.18, .4), color: col || 0xcfeaff, drag: 3.5, home: true, alpha: .9 });
        }
        break;
      case 'spore':
        for (let i = 0; i < (n || 8); i++)
          FX.p(true, { x: x + U.rand(-.5, .5), y: y + U.rand(-.3, .3), vx: U.rand(-1.5, 1.5), vy: U.rand(-.5, 1.5), life: U.rand(.7, 1.6), size: U.rand(.1, .26), color: col || 0x9be37e, grav: .8, drag: 1.2, alpha: .8 });
        break;
      case 'heal':
        for (let i = 0; i < 3; i++) {
          const a = U.rand(0, U.TAU), r = U.rand(1.2, 2.2);
          FX.p(true, { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, vx: -Math.cos(a) * 2.4, vy: -Math.sin(a) * 2.4, life: .8, size: .22, color: 0xffffff, alpha: .85, swirl: 2 });
        }
        break;
      case 'healPop':
        for (let i = 0; i < 26; i++) {
          const a = (i / 26) * U.TAU, sp = U.rand(3, 7);
          FX.p(true, { x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: U.rand(.3, .6), size: U.rand(.2, .45), color: 0xffffff, drag: 4 });
        }
        break;
      case 'death':
        for (let i = 0; i < 36; i++) {
          const a = U.rand(0, U.TAU), sp = U.rand(2, 12);
          FX.p(true, { x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: U.rand(.4, 1.2), size: U.rand(.2, .55), color: i % 3 ? 0xcfeaff : 0xffffff, drag: 2.5 });
        }
        for (let i = 0; i < 10; i++)
          FX.p(false, { x, y, vx: U.rand(-3, 3), vy: U.rand(1, 5), life: U.rand(.5, 1), size: U.rand(.4, .8), sizeEnd: 1.4, color: 0x2a3038, alpha: .5, grav: 2 });
        break;
      case 'gib':
        for (let i = 0; i < (n || 9); i++)
          FX.p(false, { x, y, vx: U.rand(-5, 5) + dir * 3, vy: U.rand(2, 8), life: U.rand(.4, .9), size: U.rand(.16, .34), color: col || 0x3a4438, alpha: .95, grav: 22, drag: .5 });
        break;
      case 'ember':
        FX.p(true, { x: x + U.rand(-.4, .4), y, vx: U.rand(-.3, .3), vy: U.rand(.6, 1.4), life: U.rand(1, 2.2), size: U.rand(.08, .18), color: col || 0xffba66, alpha: .8, drag: .4, swirl: U.rand(-1, 1) });
        break;
      case 'leaf':
        FX.p(false, { x, y, vx: U.rand(-.8, .4), vy: U.rand(-1.4, -.6), life: U.rand(3, 6), size: U.rand(.14, .26), sizeEnd: .14, color: col || 0x4f8a5e, alpha: .85, swirl: U.rand(-1.6, 1.6), drag: .15 });
        break;
      case 'mote':
        FX.p(true, { x, y, vx: U.rand(-.25, .25), vy: U.rand(-.15, .25), life: U.rand(2.5, 5), size: U.rand(.06, .16), color: col || 0xaef0d0, alpha: U.rand(.25, .6), swirl: U.rand(-.6, .6) });
        break;
    }
  };

  // ---------------- slash arc (crescent blade) ----------------
  // A real curved blade: sharp tips, a fat belly and a concave back edge, that sweeps
  // (tip -> tip) and follows through. `flip` reverses the sweep so alternating swings read
  // as up-stroke / down-stroke. `angle` is the direction the blade bulges toward.
  FX.slash = (x, y, angle, big = false, color = 0xeef6ff, flip = false) => {
    const R = big ? 2.35 : 1.7;                       // arc radius (distance of the belly)
    const span = big ? Math.PI * 1.0 : Math.PI * 0.86; // how far the blade curves
    const halfW = big ? 0.52 : 0.36;                  // thickness at the belly
    // crescent over the arc window [a,b] (f in 0..1); the local profile keeps BOTH ends of
    // the revealed window sharp, so a partial window looks like the blade mid-stroke
    function crescentGeo(a, b) {
      const N = 30, lo = Math.max(0, a), hi = Math.min(1, b), len = Math.max(0.001, hi - lo);
      const pts = [];
      for (let i = 0; i <= N; i++) {                  // outer (leading) edge
        const th = -span / 2 + (lo + (i / N) * len) * span;
        const prof = Math.pow(Math.sin(Math.PI * (i / N)), 0.8);
        pts.push([Math.cos(th) * (R + halfW * prof), Math.sin(th) * (R + halfW * prof)]);
      }
      for (let i = N; i >= 0; i--) {                  // inner (back) edge — cuts in, makes it a crescent
        const th = -span / 2 + (lo + (i / N) * len) * span;
        const prof = Math.pow(Math.sin(Math.PI * (i / N)), 0.8);
        pts.push([Math.cos(th) * (R - halfW * prof * 1.5), Math.sin(th) * (R - halfW * prof * 1.5)]);
      }
      const sh = new THREE.Shape();
      sh.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
      sh.closePath();
      return new THREE.ShapeGeometry(sh);
    }
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.96, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(crescentGeo(flip ? 0.82 : 0, flip ? 1 : 0.18), mat);
    m.position.set(x, y, 0.5); m.rotation.z = angle;
    G.scene.add(m);
    // bright thin glint that races along the leading tip
    const cmat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const cm = new THREE.Mesh(crescentGeo(0, 0.16), cmat);
    cm.position.set(x, y, 0.52); cm.rotation.z = angle;
    G.scene.add(cm);
    const DUR = 0.16, REV = 0.5, dir = flip ? -1 : 1;
    let t = 0;
    anims.push({
      update(dt) {
        t += dt / DUR;
        if (t >= 1) { G.scene.remove(m); G.scene.remove(cm); m.geometry.dispose(); cm.geometry.dispose(); mat.dispose(); cmat.dispose(); return false; }
        const rev = U.clamp(t / REV, 0, 1), e = U.ease.outCubic(rev);
        let a, b;
        if (flip) { b = 1; a = U.lerp(0.82, 0, e); } else { a = 0; b = U.lerp(0.18, 1, e); }
        m.geometry.dispose(); m.geometry = crescentGeo(a, b);
        const tip = flip ? a : b, gw = 0.16;          // leading glint window
        cm.geometry.dispose(); cm.geometry = crescentGeo(flip ? tip : Math.max(0, tip - gw), flip ? Math.min(1, tip + gw) : tip);
        const fade = t < REV ? 1 : 1 - (t - REV) / (1 - REV);
        mat.opacity = 0.96 * fade; cmat.opacity = 0.9 * (1 - t);
        m.scale.setScalar(0.9 + 0.18 * e);
        m.rotation.z = angle + dir * 0.22 * e;        // follow-through twist
        cm.scale.copy(m.scale); cm.rotation.z = m.rotation.z;
        return true;
      }
    });
    // tangential motion streaks flung off the belly
    const tang = angle + Math.PI / 2 * dir, bx = Math.cos(angle) * R * 0.9, by = Math.sin(angle) * R * 0.9;
    for (let i = 0; i < (big ? 5 : 3); i++) {
      FX.p(true, { x: x + bx, y: y + by, vx: Math.cos(tang) * U.rand(4, 9) + Math.cos(angle) * 2, vy: Math.sin(tang) * U.rand(4, 9) + Math.sin(angle) * 2, life: U.rand(0.12, 0.22), size: U.rand(0.12, 0.26), color });
    }
  };

  // ---------------- expanding ring ----------------
  FX.ring = (x, y, o = {}) => {
    const geo = new THREE.RingGeometry(0.82, 1, 40);
    const mat = new THREE.MeshBasicMaterial({ color: o.color || 0xffffff, transparent: true, opacity: o.alpha || 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, 0.55);
    G.scene.add(m);
    let t = 0;
    const life = o.life || 0.4, r0 = o.r0 || 0.3, r1 = o.r1 || 3;
    anims.push({
      update(dt) {
        t += dt / life;
        if (t >= 1) { G.scene.remove(m); geo.dispose(); mat.dispose(); return false; }
        m.scale.setScalar(U.lerp(r0, r1, U.ease.outCubic(t)));
        mat.opacity = (o.alpha || 0.8) * (1 - t);
        return true;
      }
    });
  };

  // ---------------- afterimage ghost ----------------
  FX.ghost = (geoOrGroup, x, y, sx, color = 0x9fd8e8, life = 0.3) => {
    let m;
    if (geoOrGroup.isBufferGeometry) {
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      m = new THREE.Mesh(geoOrGroup, mat);
    } else return;
    m.position.set(x, y, 0.35);
    m.scale.x = sx;
    G.scene.add(m);
    let t = 0;
    anims.push({
      update(dt) {
        t += dt / life;
        if (t >= 1) { G.scene.remove(m); m.material.dispose(); return false; }
        m.material.opacity = 0.4 * (1 - t);
        return true;
      }
    });
  };

  // ---------------- camera shake & hit-stop ----------------
  FX.shake = (amp, dur) => {
    if (G.settings && G.settings.shake === false) return;   // respect the shake setting
    shakeAmp = Math.max(shakeAmp, amp); shakeDur = shakeT = Math.max(shakeDur, dur);
  };
  FX.camOffset = () => {
    if (shakeT <= 0) return { x: 0, y: 0 };
    const k = (shakeT / shakeDur) * shakeAmp;
    return { x: U.rand(-k, k), y: U.rand(-k, k) };
  };
  FX.hitStop = t => { G.hitStop = Math.max(G.hitStop || 0, t); };

  FX.update = dt => {
    if (shakeT > 0) shakeT -= dt;
    addPool.update(dt);
    mixPool.update(dt);
    for (let i = anims.length - 1; i >= 0; i--)
      if (!anims[i].update(dt)) anims.splice(i, 1);
  };

  FX.clearAnims = () => {
    // force-finish transient anims on room change
    for (let i = anims.length - 1; i >= 0; i--) anims[i].update(99);
    anims.length = 0;
  };
})();
