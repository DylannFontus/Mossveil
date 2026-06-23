// MOSSVEIL — world.js : biomes, data-driven rooms, terrain & backdrop builders, props
(function () {
  const U = G.U;
  const W = G.World = {};

  // ======================= ACTIVE / SET-ACTIVE SYSTEM =======================
  // Every prop / enemy / transition carries an optional `active` flag (default true).
  // An inactive object isn't built into the live game — it doesn't show or work, as if
  // it doesn't exist. A `setActiveTrigger` can flip objects active/inactive — including
  // objects in OTHER levels — and the change is remembered in the save under
  // G.save.actives[levelId][oid] = bool. Objects only get an `oid` once a trigger
  // references them (assigned in the editor), so overrides are matched by that id.
  function activeOverride(levelId, oid) {
    if (oid == null) return undefined;
    const lv = G.save && G.save.actives && G.save.actives[levelId];
    return lv ? lv[oid] : undefined;
  }
  // effective active state of a data object in a level (a save override beats the flag)
  W.isActive = function (levelId, ref) {
    const ov = activeOverride(levelId, ref.oid);
    return ov !== undefined ? ov : (ref.active !== false);
  };
  // toggle a built entity live: visibility + logic + any collision solid it registered
  W.setEntityActive = function (e, on) {
    if (!e) return;
    e._inactive = !on;
    if (e.group) e.group.visible = on;
    if (typeof e.onSetActive === 'function') e.onSetActive(on);
    else if (e._solid) {
      const arr = G.Physics.solids, i = arr.indexOf(e._solid);
      if (on && i < 0) arr.push(e._solid);
      else if (!on && i >= 0) arr.splice(i, 1);
    }
  };
  // apply a setActiveTrigger's target list: persist each to the save, and live-toggle
  // anything that's in the room we're standing in right now.
  W.applyActiveTargets = function (targets) {
    if (!targets || !targets.length) return;
    G.save.actives = G.save.actives || {};
    for (const t of targets) {
      if (!t || !t.level || t.oid == null) continue;
      const on = t.state !== 'off' && t.state !== false;
      (G.save.actives[t.level] = G.save.actives[t.level] || {})[t.oid] = on;
      if (G.room && G.room.id === t.level) {
        const ent = G.room.entities.find(e2 => e2.oid === t.oid);
        if (ent) W.setEntityActive(ent, on);
        const zone = (G.room.zones || []).find(z => z.oid === t.oid);
        if (zone) zone.active = on;
      }
    }
    if (G.Main && G.Main.persist) G.Main.persist();
  };

  // ======================= LOOK / BIOME TRANSITIONS (lookTrigger) =======================
  let biomeFade = null;   // active biome cross-fade { mask, t, phase, opts }
  // smoothly fade the colour grade / weather / water (no biome change) over `dur` seconds
  W.applyLook = function (opts, dur) {
    if (!G.room) return;
    const ls = G.room.lookState = G.room.lookState || {};
    if (opts.grade !== undefined && G.Post) {
      G.Post.setGradeRate(2.5 / Math.max(0.25, dur || 2));
      let g = gradeFor(G.room.pal); if (G.Weather) g = G.Weather.gradeFor(g);
      G.Post.setGrade(g); if (opts.grade) G.Post.setGrade(opts.grade);
      ls.grade = opts.grade || null;
    }
    if (opts.weather !== undefined && G.Weather) { G.Weather.set(opts.weather || 'none'); ls.weather = opts.weather || 'none'; }
    if (opts.water !== undefined && G.Post) { G.Post.setWater(opts.water || null); ls.water = opts.water || null; }
  };
  // change biome (+ any look options) behind a background-only fade to black (1.5s each way)
  W.changeBiome = function (opts) {
    if (biomeFade || !G.room) return;
    const mask = new THREE.Mesh(
      new THREE.PlaneGeometry(6000, 4000),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false, fog: false })
    );
    mask.position.set(0, 0, -6);   // behind the gameplay layer, in front of the backdrop
    G.scene.add(mask);
    biomeFade = { mask, t: 0, phase: 'in', opts };
  };
  W.updateLook = function (dt) {
    if (!biomeFade) return;
    const f = biomeFade, DUR = 1.5;
    if (G.camera) f.mask.position.set(G.camera.position.x, G.camera.position.y, -6);
    f.t += dt;
    if (f.phase === 'in') {
      f.mask.material.opacity = Math.min(1, f.t / DUR);
      if (f.t >= DUR) {
        const o = f.opts, id = G.room.id;
        G.lookOverride = { id, biome: o.biome, grade: o.grade || null, weather: o.weather, water: o.water || null };
        const b = G.player && G.player.body, st = b ? { x: b.x, y: b.y, vx: b.vx, vy: b.vy } : null;
        W.load(id, 'P');                         // re-theme in place; the mask lives on G.scene and survives
        if (b && st) { b.x = st.x; b.y = st.y; b.vx = st.vx; b.vy = st.vy; }
        f.phase = 'out'; f.t = 0; f.mask.material.opacity = 1;
      }
    } else {
      f.mask.material.opacity = Math.max(0, 1 - f.t / DUR);
      if (f.t >= DUR) { G.scene.remove(f.mask); f.mask.geometry.dispose(); f.mask.material.dispose(); biomeFade = null; }
    }
  };

  // ============================ 13 BIOME PALETTES ============================
  const PAL = W.PAL = {
    verdant: {
      label: 'Verdant (mossy green)', bgTop: 0x2a7a60, bgBottom: 0x0a2a22, fog: 0x256b50, fogNear: 31, fogFar: 72,
      sil: 0x0b2c23, terrain: 0x091410, moss: 0x55b070, mossDark: 0x336e48, glow: 0xa8f0c8,
      dust: 0xa8e8c8, light: 0xcfffe4, rays: true, root: 220,
      deco: ['mushroom', 'fern', 'tree', 'hump'], amb: 'leaf'
    },
    gloom: {
      label: 'Gloom (blue cavern)', bgTop: 0x1e4276, bgBottom: 0x0a1530, fog: 0x1a3a68, fogNear: 30, fogFar: 68,
      sil: 0x0b1c38, terrain: 0x0a111c, moss: 0x40689c, mossDark: 0x294670, glow: 0x7cc7ff,
      dust: 0x9fd4ff, light: 0xbfe2ff, rays: false, root: 174.6,
      deco: ['stalactite', 'column', 'hump'], amb: 'spore'
    },
    warm: {
      label: 'Hearth (warm amber)', bgTop: 0x6b4e24, bgBottom: 0x21150a, fog: 0x5c421d, fogNear: 30, fogFar: 68,
      sil: 0x2a1b0a, terrain: 0x170f09, moss: 0x9a7438, mossDark: 0x5e4424, glow: 0xffc878,
      dust: 0xffd9a0, light: 0xffe2b0, rays: false, root: 196,
      deco: ['column', 'lanterns', 'hump'], amb: 'mote'
    },
    pale: {
      label: 'Pale (grey woods)', bgTop: 0x4a6a66, bgBottom: 0x14201f, fog: 0x405e5a, fogNear: 31, fogFar: 72,
      sil: 0x16292a, terrain: 0x0f1617, moss: 0x569070, mossDark: 0x36584a, glow: 0xc8e8d8,
      dust: 0xbfe0d0, light: 0xd8f0e0, rays: true, root: 146.8,
      deco: ['column', 'deadtree', 'hump'], amb: 'mote'
    },
    dusk: {
      label: 'Dusk (violet grove)', bgTop: 0x533a88, bgBottom: 0x180e2e, fog: 0x47327a, fogNear: 30, fogFar: 68,
      sil: 0x201442, terrain: 0x130d1e, moss: 0x7657a8, mossDark: 0x4c3676, glow: 0xc9a0ff,
      dust: 0xd0b0ff, light: 0xe0ccff, rays: false, root: 233.1,
      deco: ['thintree', 'roots', 'hump'], amb: 'mote'
    },
    crown: {
      label: 'Crown (bright glade)', bgTop: 0x55966e, bgBottom: 0x1c3a28, fog: 0x4c8862, fogNear: 33, fogFar: 78,
      sil: 0x1f4230, terrain: 0x0d1811, moss: 0x63b478, mossDark: 0x408454, glow: 0xc0ffd8,
      dust: 0xd0ffd8, light: 0xe0ffe8, rays: true, root: 261.6,
      deco: ['tree', 'fern', 'mushroom', 'hump'], amb: 'leaf'
    },
    ember: {
      label: 'Ember (forge red)', bgTop: 0x7a3018, bgBottom: 0x1e0c06, fog: 0x68290f, fogNear: 30, fogFar: 66,
      sil: 0x2c0f06, terrain: 0x190b06, moss: 0xa05226, mossDark: 0x66351a, glow: 0xffa050,
      dust: 0xffb070, light: 0xffc890, rays: false, root: 164.8,
      deco: ['column', 'brokenPillar', 'stalactite', 'hump'], amb: 'ember'
    },
    frost: {
      label: 'Frost (ice blue)', bgTop: 0x5a7e9e, bgBottom: 0x16222e, fog: 0x4e7090, fogNear: 31, fogFar: 74,
      sil: 0x1b2c3c, terrain: 0x101820, moss: 0x9ec8e0, mossDark: 0x5e88a8, glow: 0xd0f0ff,
      dust: 0xe0f4ff, light: 0xeaf8ff, rays: true, root: 293.7,
      deco: ['icicle', 'crystalSpire', 'deadtree', 'hump'], amb: 'snow'
    },
    marsh: {
      label: 'Marsh (murky bog)', bgTop: 0x5e6e2a, bgBottom: 0x191e0c, fog: 0x515f22, fogNear: 29, fogFar: 62,
      sil: 0x232c0e, terrain: 0x14180a, moss: 0x8aa040, mossDark: 0x566428, glow: 0xd4e87a,
      dust: 0xd8e890, light: 0xe8f4a8, rays: false, root: 138.6,
      deco: ['reed', 'mushroom', 'roots', 'hump'], amb: 'pollen'
    },
    sunken: {
      label: 'Sunken (drowned teal)', bgTop: 0x14606a, bgBottom: 0x06181c, fog: 0x11525c, fogNear: 29, fogFar: 64,
      sil: 0x082428, terrain: 0x081416, moss: 0x3a9aa0, mossDark: 0x256468, glow: 0x8ae8e0,
      dust: 0x9ae8e0, light: 0xc0f8f0, rays: true, root: 207.7,
      deco: ['coral', 'kelp', 'column', 'hump'], amb: 'bubble'
    },
    bone: {
      label: 'Ossuary (bone grey)', bgTop: 0x6e6658, bgBottom: 0x1e1b16, fog: 0x5e5749, fogNear: 30, fogFar: 70,
      sil: 0x272218, terrain: 0x161310, moss: 0xa89878, mossDark: 0x6a604c, glow: 0xe8dcc0,
      dust: 0xe0d4b8, light: 0xf0e8d0, rays: true, root: 155.6,
      deco: ['ribs', 'brokenPillar', 'arch', 'hump'], amb: 'mote'
    },
    fungal: {
      label: 'Fungal (pink spores)', bgTop: 0x77386a, bgBottom: 0x1e0c1c, fog: 0x682f5c, fogNear: 30, fogFar: 66,
      sil: 0x2c1028, terrain: 0x180a16, moss: 0xb05a8e, mossDark: 0x703a5c, glow: 0xff9ad8,
      dust: 0xffaade, light: 0xffc8ec, rays: false, root: 185,
      deco: ['mushroom', 'mushroom', 'roots', 'hump'], amb: 'sporePink'
    },
    aurora: {
      label: 'Aurora (cyan crystal)', bgTop: 0x1e6a7e, bgBottom: 0x0a1a28, fog: 0x195e72, fogNear: 31, fogFar: 74,
      sil: 0x0c2836, terrain: 0x0a1418, moss: 0x4ec8c0, mossDark: 0x2e8480, glow: 0x90ffe8,
      dust: 0xa0ffe8, light: 0xc8fff4, rays: true, root: 246.9,
      deco: ['crystalSpire', 'icicle', 'column', 'hump'], amb: 'sparkle'
    },
    city: {
      label: 'City of Tears (rain blue)', bgTop: 0x305f92, bgBottom: 0x07101f, fog: 0x1d456f, fogNear: 36, fogFar: 92,
      sil: 0x0a1c30, terrain: 0x0d1c30, moss: 0x3c6a98, mossDark: 0x244568, glow: 0xa6d4ff,
      dust: 0xc4e2ff, light: 0xd2e8ff, rays: false, root: 205.0,
      deco: ['spire', 'cityArch', 'gothWindow', 'lamppost', 'column'], amb: 'mote'
    },
    forge: {
      label: 'Forge (molten iron)', bgTop: 0x5a2410, bgBottom: 0x160603, fog: 0x4a1d0c, fogNear: 28, fogFar: 60,
      sil: 0x24100a, terrain: 0x190b07, moss: 0xb85a26, mossDark: 0x70341a, glow: 0xff8a3c,
      dust: 0xffb070, light: 0xffcaa0, rays: false, root: 168.0,
      deco: ['anvil', 'gear', 'pipe', 'brokenPillar', 'column'], amb: 'ember'
    },
    mine: {
      label: 'Mine (deep slate)', bgTop: 0x39414e, bgBottom: 0x0c0f14, fog: 0x2c333e, fogNear: 28, fogFar: 62,
      sil: 0x16191f, terrain: 0x111419, moss: 0x6a7280, mossDark: 0x434a56, glow: 0x9fd0ff,
      dust: 0xc8d0dc, light: 0xdfe6ef, rays: false, root: 152.0,
      deco: ['cartRail', 'pipe', 'gear', 'stalactite', 'column'], amb: 'spore'
    },
    village: {
      label: 'Village (warm hearth)', bgTop: 0x6a5230, bgBottom: 0x1a1109, fog: 0x55421f, fogNear: 31, fogFar: 74,
      sil: 0x2a1d0f, terrain: 0x191107, moss: 0x9a7c44, mossDark: 0x60492a, glow: 0xffd28a,
      dust: 0xffe2b0, light: 0xffeccb, rays: true, root: 188.0,
      deco: ['hut', 'lamppost', 'gothWindow', 'plant', 'column'], amb: 'mote'
    },
    archive: {
      label: 'Archive (amber library)', bgTop: 0x6a4e2c, bgBottom: 0x191207, fog: 0x564018, fogNear: 30, fogFar: 70,
      sil: 0x281c0d, terrain: 0x18110a, moss: 0xa6863e, mossDark: 0x6a5226, glow: 0xffd98a,
      dust: 0xffe6b4, light: 0xffeec6, rays: true, root: 178.0,
      deco: ['bookshelf', 'scroll', 'candle', 'column', 'arch'], amb: 'mote'
    },
    garden: {
      label: 'Garden (royal bloom)', bgTop: 0x3f7e54, bgBottom: 0x10210f, fog: 0x336b46, fogNear: 32, fogFar: 78,
      sil: 0x14361f, terrain: 0x0e1c10, moss: 0x6cc07e, mossDark: 0x47864f, glow: 0xc8ffd0,
      dust: 0xffc8e6, light: 0xe6ffe0, rays: true, root: 132.0,
      deco: ['trellis', 'hedge', 'flower', 'fern', 'tree'], amb: 'pollen'
    },
    tombs: {
      label: 'Tombs (cold catacomb)', bgTop: 0x44544e, bgBottom: 0x0e1413, fog: 0x33403b, fogNear: 30, fogFar: 70,
      sil: 0x18211e, terrain: 0x121817, moss: 0x728079, mossDark: 0x47534d, glow: 0xbfe0d4,
      dust: 0xd0e4dc, light: 0xe2f0ea, rays: true, root: 158.0,
      deco: ['tombstone', 'sarcophagus', 'urn', 'statue', 'brokenPillar'], amb: 'mote'
    }
  };
  W.BIOMES = Object.keys(PAL);

  // ============================ SILHOUETTE GENERATORS ============================
  function shapeMesh(shape, mat, x, y, seg) {
    const m = new THREE.Mesh(new THREE.ShapeGeometry(shape, seg || 8), mat);
    m.position.set(x, y, 0);
    return m;
  }
  const SIL = W.SIL = {
    mushroom(grp, mat, x, y, s, rng) {
      const stemW = 0.3 * s;
      grp.add(shapeMesh(U.poly([[-stemW, 0], [stemW, 0], [stemW * 0.6, 2.2 * s], [-stemW * 0.6, 2.2 * s]]), mat, x, y, 4));
      grp.add(shapeMesh(U.splineShape([[-1.4 * s, 2.1 * s], [-0.9 * s, 3.1 * s], [0, 3.4 * s], [0.9 * s, 3.1 * s], [1.4 * s, 2.1 * s], [0, 1.9 * s]]), mat, x, y, 10));
    },
    tree(grp, mat, x, y, s, rng) {
      const lean = (rng() - 0.5) * 1.2 * s;
      grp.add(shapeMesh(U.poly([[-0.45 * s, 0], [0.45 * s, 0], [0.18 * s + lean, 5.4 * s], [-0.18 * s + lean, 5.4 * s]]), mat, x, y, 4));
      for (let i = 0; i < 3; i++) {
        const blob = shapeMesh(U.ellipse((2.6 - i * 0.5) * s, (1.3 - i * 0.18) * s), mat, x + lean + (rng() - 0.5) * s, y + (4.6 + i * 0.9) * s, 12);
        grp.add(blob);
      }
    },
    deadtree(grp, mat, x, y, s, rng) {
      const lean = (rng() - 0.5) * 1.6 * s;
      grp.add(shapeMesh(U.poly([[-0.4 * s, 0], [0.4 * s, 0], [0.1 * s + lean, 6 * s], [-0.1 * s + lean, 6 * s]]), mat, x, y, 4));
      for (let i = 0; i < 3; i++) {
        const a = U.lerp(0.5, 2.6, rng()), len = (1.5 + rng() * 1.6) * s, hy = (2.5 + rng() * 3) * s;
        grp.add(shapeMesh(U.poly([[0, 0], [Math.cos(a) * len, Math.sin(a) * len * 0.6 + 0.4 * len], [Math.cos(a) * len + 0.12 * s, Math.sin(a) * len * 0.6 + 0.4 * len + 0.12 * s], [0.18 * s, 0.22 * s]]), mat, x + lean * (hy / (6 * s)), y + hy, 3));
      }
    },
    thintree(grp, mat, x, y, s, rng) {
      const lean = (rng() - 0.5) * 2 * s;
      grp.add(shapeMesh(U.poly([[-0.18 * s, 0], [0.18 * s, 0], [0.05 * s + lean, 7 * s], [-0.05 * s + lean, 7 * s]]), mat, x, y, 4));
      grp.add(shapeMesh(U.ellipse(2.2 * s, 1 * s), mat, x + lean, y + 6.8 * s, 10));
    },
    fern(grp, mat, x, y, s, rng) {
      for (let i = 0; i < 4; i++) {
        const a = U.lerp(0.9, 2.2, rng()), len = (1 + rng() * 1.2) * s;
        grp.add(shapeMesh(U.poly([[-0.12 * s, 0], [0.12 * s, 0], [Math.cos(a) * len, Math.sin(a) * len]]), mat, x, y, 3));
      }
    },
    column(grp, mat, x, y, s, rng, h) {
      h = h || U.lerp(7, 15, rng()) * s;
      grp.add(shapeMesh(U.poly([[-0.55 * s, 0], [0.55 * s, 0], [0.42 * s, h], [-0.42 * s, h]]), mat, x, y, 4));
      grp.add(shapeMesh(U.poly([[-0.75 * s, 0], [0.75 * s, 0], [0.75 * s, 0.4 * s], [-0.75 * s, 0.4 * s]]), mat, x, y + h - 0.2 * s, 2));
    },
    brokenPillar(grp, mat, x, y, s, rng) {
      const h = U.lerp(2.5, 6, rng()) * s;
      const tilt = (rng() - 0.5) * 0.5;
      grp.add(shapeMesh(U.poly([[-0.6 * s, 0], [0.6 * s, 0], [0.5 * s + tilt, h], [0.2 * s + tilt, h + 0.6 * s], [-0.1 * s + tilt, h - 0.3 * s], [-0.5 * s + tilt, h]]), mat, x, y, 4));
    },
    arch(grp, mat, x, y, s, rng) {
      const h = U.lerp(5, 9, rng()) * s, w2 = U.lerp(2.5, 4, rng()) * s;
      grp.add(shapeMesh(U.poly([[-w2 - 0.5 * s, 0], [-w2 + 0.5 * s, 0], [-w2 + 0.4 * s, h], [-w2 - 0.4 * s, h]]), mat, x, y, 4));
      grp.add(shapeMesh(U.poly([[w2 - 0.5 * s, 0], [w2 + 0.5 * s, 0], [w2 + 0.4 * s, h], [w2 - 0.4 * s, h]]), mat, x, y, 4));
      grp.add(shapeMesh(U.splineShape([[-w2 - 0.5 * s, h * 0.92], [0, h + 1.1 * s], [w2 + 0.5 * s, h * 0.92], [0, h + 0.4 * s]]), mat, x, y, 10));
    },
    stalactite(grp, mat, x, topY, s, rng, len) {
      len = len || U.lerp(2, 7, rng()) * s;
      const w2 = U.lerp(0.8, 2.2, rng()) * s;
      grp.add(shapeMesh(U.poly([[-w2 / 2, 0], [w2 / 2, 0], [w2 * 0.06, -len], [-w2 * 0.06, -len]]), mat, x, topY, 3));
    },
    icicle(grp, mat, x, topY, s, rng) {
      for (let i = 0; i < 3; i++) {
        const dx = (i - 1) * 0.6 * s, len = U.lerp(1.5, 5, rng()) * s, w2 = U.lerp(0.25, 0.6, rng()) * s;
        grp.add(shapeMesh(U.poly([[dx - w2, 0], [dx + w2, 0], [dx, -len]]), mat, x, topY, 3));
      }
    },
    crystalSpire(grp, mat, x, y, s, rng) {
      for (let i = 0; i < 3; i++) {
        const dx = (i - 1) * 0.8 * s, h = U.lerp(2, 6, rng()) * s, lean = (rng() - 0.5) * s;
        grp.add(shapeMesh(U.poly([[dx - 0.5 * s, 0], [dx + 0.5 * s, 0], [dx + lean + 0.1 * s, h], [dx + lean - 0.1 * s, h * 0.92]]), mat, x, y, 4));
      }
    },
    coral(grp, mat, x, y, s, rng) {
      const branch = (bx, by, a, len, w2, depth) => {
        const ex = bx + Math.cos(a) * len, ey = by + Math.sin(a) * len;
        grp.add(shapeMesh(U.poly([[bx - w2, by], [bx + w2, by], [ex + w2 * 0.5, ey], [ex - w2 * 0.5, ey]]), mat, x, y, 3));
        if (depth > 0) {
          branch(ex, ey, a + U.lerp(0.3, 0.8, rng()), len * 0.65, w2 * 0.6, depth - 1);
          branch(ex, ey, a - U.lerp(0.3, 0.8, rng()), len * 0.65, w2 * 0.6, depth - 1);
        }
      };
      branch(0, 0, Math.PI / 2 + (rng() - 0.5) * 0.4, U.lerp(1.5, 3, rng()) * s, 0.3 * s, 2);
    },
    kelp(grp, mat, x, y, s, rng) {
      for (let i = 0; i < 3; i++) {
        const dx = (i - 1) * 0.5 * s, h = U.lerp(4, 9, rng()) * s, sway = (rng() - 0.5) * 2 * s;
        grp.add(shapeMesh(U.splineShape([[dx - 0.18 * s, 0], [dx + 0.18 * s, 0], [dx + sway + 0.06 * s, h], [dx + sway - 0.06 * s, h * 0.96]]), mat, x, y, 6));
      }
    },
    reed(grp, mat, x, y, s, rng) {
      for (let i = 0; i < 5; i++) {
        const dx = (i - 2) * 0.4 * s, h = U.lerp(2, 5, rng()) * s, lean = (rng() - 0.5) * 0.8 * s;
        grp.add(shapeMesh(U.poly([[dx - 0.08 * s, 0], [dx + 0.08 * s, 0], [dx + lean, h]]), mat, x, y, 3));
      }
    },
    ribs(grp, mat, x, y, s, rng) {
      const n = 3 + (rng() * 3 | 0);
      for (let i = 0; i < n; i++) {
        const rx = i * 1.6 * s, h = (5 - i * 0.55) * s;
        grp.add(shapeMesh(U.splineShape([
          [rx, 0], [rx + 0.45 * s, 0], [rx + 1.5 * s, h * 0.6], [rx + 1.1 * s, h], [rx + 0.9 * s, h * 0.94], [rx + 1.1 * s, h * 0.55]
        ]), mat, x, y, 8));
      }
    },
    roots(grp, mat, x, topY, s, rng) {
      for (let i = 0; i < 3; i++) {
        const dx = (rng() - 0.5) * 1.4, l = U.lerp(3, 6, rng()) * (0.6 + rng() * 0.5);
        grp.add(shapeMesh(U.poly([[-0.1, 0], [0.1, 0], [dx + 0.04, -l], [dx - 0.04, -l]]), mat, x + (rng() - 0.5), topY, 3));
      }
    },
    thorn(grp, mat, x, y, s, rng) {
      for (let i = 0; i < 5; i++) {
        const a = U.lerp(0.5, 2.6, rng()), len = U.lerp(0.8, 2.2, rng()) * s;
        grp.add(shapeMesh(U.poly([[-0.14 * s, 0], [0.14 * s, 0], [Math.cos(a) * len, Math.sin(a) * len]]), mat, x, y, 3));
      }
    },
    lanterns(grp, mat, x, topY, s, rng) {
      const len = U.lerp(2, 5, rng());
      grp.add(shapeMesh(U.poly([[-0.05, 0], [0.05, 0], [0.03, -len], [-0.03, -len]]), mat, x, topY, 2));
      grp.add(shapeMesh(U.splineShape([[-0.35 * s, -len], [0.35 * s, -len], [0.25 * s, -len - 0.8 * s], [-0.25 * s, -len - 0.8 * s]]), mat, x, topY, 6));
    },
    hump(grp, mat, x, y, s, rng) {
      grp.add(shapeMesh(U.splineShape([[-3 * s, 0], [-1.5 * s, 1.6 * s], [0, 2.1 * s], [1.5 * s, 1.6 * s], [3 * s, 0], [0, -1]]), mat, x, y, 10));
    },
    // ---- Victorian / interior furniture (single-colour silhouettes) ----
    rug(grp, mat, x, y, s) {
      grp.add(shapeMesh(U.poly([[-2.4 * s, 0], [2.4 * s, 0], [2.15 * s, 0.22 * s], [-2.15 * s, 0.22 * s]]), mat, x, y, 2));
    },
    sofa(grp, mat, x, y, s) {
      grp.add(shapeMesh(U.poly([[-1.5 * s, 0], [1.5 * s, 0], [1.5 * s, 0.6 * s], [-1.5 * s, 0.6 * s]]), mat, x, y, 2));        // seat base
      grp.add(shapeMesh(U.splineShape([[-1.5 * s, 0.5 * s], [1.5 * s, 0.5 * s], [1.35 * s, 1.35 * s], [-1.35 * s, 1.35 * s]]), mat, x, y, 6)); // back
      grp.add(shapeMesh(U.poly([[-1.65 * s, 0], [-1.2 * s, 0], [-1.2 * s, 0.95 * s], [-1.65 * s, 0.95 * s]]), mat, x, y, 2));  // arms
      grp.add(shapeMesh(U.poly([[1.2 * s, 0], [1.65 * s, 0], [1.65 * s, 0.95 * s], [1.2 * s, 0.95 * s]]), mat, x, y, 2));
    },
    fireplace(grp, mat, x, y, s) {
      grp.add(shapeMesh(U.poly([[-1.5 * s, 0], [-0.95 * s, 0], [-0.95 * s, 2.1 * s], [-1.5 * s, 2.1 * s]]), mat, x, y, 2));    // posts
      grp.add(shapeMesh(U.poly([[0.95 * s, 0], [1.5 * s, 0], [1.5 * s, 2.1 * s], [0.95 * s, 2.1 * s]]), mat, x, y, 2));
      grp.add(shapeMesh(U.poly([[-1.7 * s, 2.0 * s], [1.7 * s, 2.0 * s], [1.7 * s, 2.5 * s], [-1.7 * s, 2.5 * s]]), mat, x, y, 2)); // mantel
      grp.add(shapeMesh(U.poly([[-0.95 * s, 1.4 * s], [0.95 * s, 1.4 * s], [0.95 * s, 2.0 * s], [-0.95 * s, 2.0 * s]]), mat, x, y, 2)); // lintel above hearth
    },
    bookshelf(grp, mat, x, y, s) {
      grp.add(shapeMesh(U.poly([[-1 * s, 0], [1 * s, 0], [1 * s, 2.8 * s], [-1 * s, 2.8 * s]]), mat, x, y, 2));
      for (let i = 1; i <= 3; i++) grp.add(shapeMesh(U.poly([[-1 * s, i * 0.7 * s], [1 * s, i * 0.7 * s], [1 * s, i * 0.7 * s + 0.08 * s], [-1 * s, i * 0.7 * s + 0.08 * s]]), mat, x, y - 0.001, 2));
    },
    painting(grp, mat, x, y, s) {
      grp.add(shapeMesh(U.poly([[-0.75 * s, 0], [0.75 * s, 0], [0.75 * s, 1.05 * s], [-0.75 * s, 1.05 * s]]), mat, x, y, 2));
    },
    table(grp, mat, x, y, s) {
      grp.add(shapeMesh(U.poly([[-1.1 * s, 0.72 * s], [1.1 * s, 0.72 * s], [1.1 * s, 0.92 * s], [-1.1 * s, 0.92 * s]]), mat, x, y, 2)); // top
      grp.add(shapeMesh(U.poly([[-0.95 * s, 0], [-0.72 * s, 0], [-0.72 * s, 0.72 * s], [-0.95 * s, 0.72 * s]]), mat, x, y, 2));   // legs
      grp.add(shapeMesh(U.poly([[0.72 * s, 0], [0.95 * s, 0], [0.95 * s, 0.72 * s], [0.72 * s, 0.72 * s]]), mat, x, y, 2));
    },
    plant(grp, mat, x, y, s, rng) {
      grp.add(shapeMesh(U.poly([[-0.42 * s, 0], [0.42 * s, 0], [0.3 * s, 0.62 * s], [-0.3 * s, 0.62 * s]]), mat, x, y, 2)); // pot
      const r = rng || U.mulberry32(7);
      for (let i = 0; i < 5; i++) { const a = U.lerp(0.7, 2.45, r()), len = U.lerp(0.8, 1.7, r()) * s; grp.add(shapeMesh(U.poly([[-0.09 * s, 0.55 * s], [0.09 * s, 0.55 * s], [Math.cos(a) * len, 0.55 * s + Math.sin(a) * len]]), mat, x, y, 2)); }
    },
    chandelier(grp, mat, x, topY, s) {
      grp.add(shapeMesh(U.poly([[-0.05 * s, 0], [0.05 * s, 0], [0.05 * s, -1.2 * s], [-0.05 * s, -1.2 * s]]), mat, x, topY, 2)); // chain
      grp.add(shapeMesh(U.splineShape([[-1.3 * s, -1.2 * s], [0, -0.75 * s], [1.3 * s, -1.2 * s], [0.7 * s, -1.85 * s], [0, -1.5 * s], [-0.7 * s, -1.85 * s]]), mat, x, topY, 8));
    },
    // ---- city of tears / gothic ----
    spire(grp, mat, x, y, s, rng) {
      const r = rng || U.mulberry32(3), h = U.lerp(12, 22, r()) * s, w2 = U.lerp(1.2, 2.2, r()) * s;
      grp.add(shapeMesh(U.poly([[-w2, 0], [w2, 0], [w2 * 0.78, h], [-w2 * 0.78, h]]), mat, x, y, 2));
      grp.add(shapeMesh(U.poly([[-w2 * 1.1, h], [w2 * 1.1, h], [0, h + 3.2 * s]]), mat, x, y, 2)); // conical roof
      grp.add(shapeMesh(U.poly([[-0.06 * s, h + 3.2 * s], [0.06 * s, h + 3.2 * s], [0.06 * s, h + 4.4 * s], [-0.06 * s, h + 4.4 * s]]), mat, x, y, 2)); // finial
    },
    cityArch(grp, mat, x, y, s, rng) {
      const r = rng || U.mulberry32(5), h = U.lerp(7, 12, r()) * s, w2 = U.lerp(2, 3.5, r()) * s;
      grp.add(shapeMesh(U.poly([[-w2 - 0.6 * s, 0], [-w2 + 0.6 * s, 0], [-w2 + 0.5 * s, h], [-w2 - 0.5 * s, h]]), mat, x, y, 2));
      grp.add(shapeMesh(U.poly([[w2 - 0.6 * s, 0], [w2 + 0.6 * s, 0], [w2 + 0.5 * s, h], [w2 - 0.5 * s, h]]), mat, x, y, 2));
      grp.add(shapeMesh(U.poly([[-w2 - 0.6 * s, h * 0.9], [0, h + 2.2 * s], [w2 + 0.6 * s, h * 0.9], [w2 - 0.4 * s, h * 0.86], [0, h + 1.1 * s], [-w2 + 0.4 * s, h * 0.86]]), mat, x, y, 2)); // pointed top
    },
    gothWindow(grp, mat, x, y, s, rng) {
      const r = rng || U.mulberry32(9), h = U.lerp(3, 5, r()) * s, w2 = 0.95 * s;
      grp.add(shapeMesh(U.poly([[-w2, 0], [w2, 0], [w2, h], [0, h + 1.1 * s], [-w2, h]]), mat, x, y, 2));
    },
    lamppost(grp, mat, x, y, s) {
      grp.add(shapeMesh(U.poly([[-0.13 * s, 0], [0.13 * s, 0], [0.08 * s, 4 * s], [-0.08 * s, 4 * s]]), mat, x, y, 2));     // pole
      grp.add(shapeMesh(U.splineShape([[-0.4 * s, 4 * s], [0.4 * s, 4 * s], [0.28 * s, 4.75 * s], [-0.28 * s, 4.75 * s]]), mat, x, y, 6)); // lamp head
      grp.add(shapeMesh(U.poly([[-0.55 * s, 0], [0.55 * s, 0], [0.4 * s, 0.4 * s], [-0.4 * s, 0.4 * s]]), mat, x, y, 2));   // base
    },
    // ---- forge / mine / village ----
    anvil(grp, mat, x, y, s) {
      grp.add(shapeMesh(U.poly([[-0.5 * s, 0], [0.5 * s, 0], [0.35 * s, 0.5 * s], [-0.35 * s, 0.5 * s]]), mat, x, y, 2));
      grp.add(shapeMesh(U.poly([[-1.1 * s, 0.5 * s], [0.9 * s, 0.5 * s], [1.4 * s, 0.95 * s], [0.7 * s, 1.1 * s], [-0.9 * s, 1.1 * s], [-0.9 * s, 0.5 * s]]), mat, x, y, 2));
    },
    gear(grp, mat, x, y, s, rng) {
      const R = 1.1 * s, teeth = 9;
      const pts = [];
      for (let i = 0; i < teeth; i++) { const a = i / teeth * Math.PI * 2, a2 = (i + 0.5) / teeth * Math.PI * 2; pts.push([Math.cos(a) * R * 1.25, Math.sin(a) * R * 1.25]); pts.push([Math.cos(a2) * R, Math.sin(a2) * R]); }
      grp.add(shapeMesh(U.poly(pts), mat, x, y + R, 2));
    },
    pipe(grp, mat, x, y, s, rng) {
      const r = rng || U.mulberry32(4), h = U.lerp(3, 7, r()) * s;
      grp.add(shapeMesh(U.poly([[-0.35 * s, 0], [0.35 * s, 0], [0.35 * s, h], [-0.35 * s, h]]), mat, x, y, 2));
      grp.add(shapeMesh(U.poly([[-0.5 * s, h * 0.4], [0.5 * s, h * 0.4], [0.5 * s, h * 0.55], [-0.5 * s, h * 0.55]]), mat, x, y, 2)); // flange
    },
    cartRail(grp, mat, x, y, s) {
      grp.add(shapeMesh(U.poly([[-3 * s, 0.2 * s], [3 * s, 0.2 * s], [3 * s, 0.34 * s], [-3 * s, 0.34 * s]]), mat, x, y, 2));
      for (let i = -2; i <= 2; i++) grp.add(shapeMesh(U.poly([[i * 1.1 * s - 0.08 * s, 0], [i * 1.1 * s + 0.08 * s, 0], [i * 1.1 * s + 0.08 * s, 0.3 * s], [i * 1.1 * s - 0.08 * s, 0.3 * s]]), mat, x, y, 2)); // ties
    },
    hut(grp, mat, x, y, s, rng) {
      const r = rng || U.mulberry32(6), w2 = U.lerp(2.2, 3.4, r()) * s, h = U.lerp(2.4, 3.6, r()) * s;
      grp.add(shapeMesh(U.poly([[-w2, 0], [w2, 0], [w2, h], [-w2, h]]), mat, x, y, 2));
      grp.add(shapeMesh(U.poly([[-w2 - 0.6 * s, h], [w2 + 0.6 * s, h], [0, h + 2.2 * s]]), mat, x, y, 2)); // roof
    },
    // ---- archive / library ----
    scroll(grp, mat, x, y, s) {
      grp.add(shapeMesh(U.poly([[-0.3 * s, 0.2 * s], [0.3 * s, 0.2 * s], [0.3 * s, 1.8 * s], [-0.3 * s, 1.8 * s]]), mat, x, y, 2));    // sheet
      grp.add(shapeMesh(U.splineShape([[-0.42 * s, 0], [0.42 * s, 0], [0.34 * s, 0.34 * s], [-0.34 * s, 0.34 * s]]), mat, x, y, 5));    // bottom roll
      grp.add(shapeMesh(U.splineShape([[-0.42 * s, 1.7 * s], [0.42 * s, 1.7 * s], [0.34 * s, 2.04 * s], [-0.34 * s, 2.04 * s]]), mat, x, y, 5)); // top roll
    },
    candle(grp, mat, x, y, s) {
      grp.add(shapeMesh(U.poly([[-0.4 * s, 0], [0.4 * s, 0], [0.3 * s, 0.2 * s], [-0.3 * s, 0.2 * s]]), mat, x, y, 2));   // holder
      grp.add(shapeMesh(U.poly([[-0.1 * s, 0.2 * s], [0.1 * s, 0.2 * s], [0.1 * s, 1 * s], [-0.1 * s, 1 * s]]), mat, x, y, 2)); // candle
      grp.add(shapeMesh(U.poly([[-0.07 * s, 1 * s], [0.07 * s, 1 * s], [0, 1.35 * s]]), mat, x, y, 2)); // flame
    },
    // ---- garden ----
    trellis(grp, mat, x, y, s, rng) {
      const r = rng || U.mulberry32(2), h = U.lerp(4, 7, r()) * s;
      grp.add(shapeMesh(U.poly([[-1.2 * s, 0], [-1 * s, 0], [-1 * s, h], [-1.2 * s, h]]), mat, x, y, 2));
      grp.add(shapeMesh(U.poly([[1 * s, 0], [1.2 * s, 0], [1.2 * s, h], [1 * s, h]]), mat, x, y, 2));
      for (let i = 0; i < 4; i++) { const yy = (i + 0.5) / 4 * h; grp.add(shapeMesh(U.poly([[-1 * s, yy], [1 * s, yy], [1 * s, yy + 0.1 * s], [-1 * s, yy + 0.1 * s]]), mat, x, y, 2)); }
    },
    hedge(grp, mat, x, y, s, rng) {
      const r = rng || U.mulberry32(8);
      grp.add(shapeMesh(U.splineShape([[-2.6 * s, 0], [-2.2 * s, 1.4 * s], [-1 * s, 2 * s], [0, 2.3 * s], [1 * s, 2 * s], [2.2 * s, 1.4 * s], [2.6 * s, 0], [0, -0.6 * s]]), mat, x, y, 12));
    },
    flower(grp, mat, x, y, s, rng) {
      const r = rng || U.mulberry32(1), h = U.lerp(1, 2.2, r()) * s;
      grp.add(shapeMesh(U.poly([[-0.08 * s, 0], [0.08 * s, 0], [0.05 * s, h], [-0.05 * s, h]]), mat, x, y, 2)); // stem
      for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; grp.add(shapeMesh(U.ellipse(0.32 * s, 0.16 * s), mat, x + Math.cos(a) * 0.3 * s, y + h + Math.sin(a) * 0.3 * s, 8)); }
    },
    // ---- tombs / catacombs ----
    tombstone(grp, mat, x, y, s, rng) {
      const r = rng || U.mulberry32(3), h = U.lerp(1.4, 2.6, r()) * s, w2 = 0.7 * s, tilt = (r() - 0.5) * 0.25;
      grp.add(shapeMesh(U.splineShape([[-w2, 0], [w2, 0], [w2 + tilt, h], [tilt, h + 0.7 * s], [-w2 + tilt, h]]), mat, x, y, 8));
    },
    sarcophagus(grp, mat, x, y, s) {
      grp.add(shapeMesh(U.poly([[-1.6 * s, 0], [1.6 * s, 0], [1.4 * s, 1 * s], [-1.4 * s, 1 * s]]), mat, x, y, 2));         // base
      grp.add(shapeMesh(U.poly([[-1.5 * s, 0.9 * s], [1.5 * s, 0.9 * s], [1.1 * s, 1.5 * s], [-1.1 * s, 1.5 * s]]), mat, x, y, 2)); // lid
    },
    urn(grp, mat, x, y, s) {
      grp.add(shapeMesh(U.splineShape([[-0.4 * s, 0], [0.4 * s, 0], [0.7 * s, 0.9 * s], [0.4 * s, 1.5 * s], [0.55 * s, 1.7 * s], [-0.55 * s, 1.7 * s], [-0.4 * s, 1.5 * s], [-0.7 * s, 0.9 * s]]), mat, x, y, 12));
    },
    statue(grp, mat, x, y, s, rng) {
      const r = rng || U.mulberry32(4);
      grp.add(shapeMesh(U.poly([[-1 * s, 0], [1 * s, 0], [0.8 * s, 0.6 * s], [-0.8 * s, 0.6 * s]]), mat, x, y, 2));         // plinth
      grp.add(shapeMesh(U.splineShape([[-0.7 * s, 0.6 * s], [0.7 * s, 0.6 * s], [0.45 * s, 3.2 * s], [-0.45 * s, 3.2 * s]]), mat, x, y, 8)); // robed body
      grp.add(shapeMesh(U.ellipse(0.4 * s, 0.5 * s), mat, x, y + 3.5 * s, 10)); // head
    }
  };
  // decor kinds the editor can place (standing vs hanging anchors)
  W.DECOR_KINDS = {
    standing: ['mushroom', 'tree', 'deadtree', 'thintree', 'fern', 'column', 'brokenPillar', 'arch', 'crystalSpire', 'coral', 'kelp', 'reed', 'ribs', 'thorn', 'hump',
      'spire', 'cityArch', 'gothWindow', 'lamppost', 'hut', 'anvil', 'gear', 'pipe', 'cartRail',
      'sofa', 'fireplace', 'bookshelf', 'painting', 'table', 'plant', 'rug',
      'scroll', 'candle', 'trellis', 'hedge', 'flower', 'tombstone', 'sarcophagus', 'urn', 'statue'],
    hanging: ['stalactite', 'icicle', 'roots', 'lanterns', 'chandelier']
  };

  function silHumps(grp, mat, x0, x1, baseY, maxH, rng) {
    const pts = [[x0, baseY - 14]];
    let x = x0;
    while (x < x1) {
      pts.push([x, baseY + rng() * maxH]);
      x += U.lerp(4, 10, rng());
    }
    pts.push([x1, baseY - 14]);
    grp.add(new THREE.Mesh(new THREE.ShapeGeometry(U.splineShape(pts), 16), mat));
  }

  function buildLayer(group, def, pal, z, rng) {
    const margin = (-z) * 0.9 + 14;
    const x0 = -margin, x1 = def.w + margin;
    const lay = new THREE.Group();
    lay.position.z = z;
    const mat = new THREE.MeshBasicMaterial({ color: pal.sil, fog: true, side: THREE.DoubleSide });
    const baseY = 1.2 - (-z) * 0.1;
    const ss = 1 + (-z) * 0.05;
    silHumps(lay, mat, x0, x1, baseY, 3.2 + (-z) * 0.22, rng);
    const topY = def.h - 1 + (-z) * 0.12;
    const hang = pal.deco.filter(d => W.DECOR_KINDS.hanging.includes(d));
    let x = x0 + rng() * 6;
    while (x < x1) {
      const kind = hang.length && rng() < 0.55 ? U_pick(hang, rng) : (rng() < 0.35 ? 'stalactite' : null);
      if (kind && SIL[kind]) SIL[kind](lay, mat, x, topY, U.lerp(0.7, 1.6, rng()) * ss, rng);
      x += U.lerp(3, 9, rng());
    }
    const stand = pal.deco.filter(d => W.DECOR_KINDS.standing.includes(d) && d !== 'hump');
    x = x0 + rng() * 5;
    while (x < x1) {
      if (stand.length) {
        const d = stand[(rng() * stand.length) | 0];
        SIL[d](lay, mat, x, baseY + rng() * 2, U.lerp(0.8, 2, rng()) * ss, rng);
      }
      x += U.lerp(4, 11, rng());
    }
    group.add(lay);
  }
  function U_pick(arr, rng) { return arr[(rng() * arr.length) | 0]; }

  // ============================ TEXTURES ============================
  function gradientTex(top, bottom, lightCol) {
    const [c, x] = U.makeCanvas(256, 512);
    const gr = x.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0, U.css(top));
    gr.addColorStop(1, U.css(bottom));
    x.fillStyle = gr; x.fillRect(0, 0, 256, 512);
    const rg = x.createRadialGradient(128, 30, 10, 128, 30, 300);
    rg.addColorStop(0, U.css(lightCol) + '40');
    rg.addColorStop(0.5, U.css(lightCol) + '18');
    rg.addColorStop(1, U.css(lightCol) + '00');
    x.fillStyle = rg; x.fillRect(0, 0, 256, 512);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.userData = { ownMap: true };
    return tex;
  }
  function wallTex(pal, rng) {
    const [c, x] = U.makeCanvas(1024, 512);
    const mid = U.colLerp(pal.bgTop, pal.bgBottom, 0.45);
    const gr = x.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0, U.css(U.colLerp(pal.bgTop, 0xffffff, 0.04)));
    gr.addColorStop(1, U.css(pal.bgBottom));
    x.fillStyle = gr; x.fillRect(0, 0, 1024, 512);
    for (let i = 0; i < 90; i++) {
      const rx = rng() * 1024, ry = rng() * 512, rr = 20 + rng() * 90;
      const dark = rng() < 0.55;
      const col = dark ? U.colLerp(mid, 0x000000, 0.25 + rng() * 0.3) : U.colLerp(mid, pal.glow, 0.05 + rng() * 0.08);
      const rg = x.createRadialGradient(rx, ry, 0, rx, ry, rr);
      const cs = U.css(col);
      rg.addColorStop(0, cs + '55');
      rg.addColorStop(1, cs + '00');
      x.fillStyle = rg;
      x.fillRect(rx - rr, ry - rr, rr * 2, rr * 2);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.userData = { ownMap: true };
    return tex;
  }
  function rayTex() {
    const [c, x] = U.makeCanvas(128, 512);
    const gr = x.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0, 'rgba(255,255,255,0.85)');
    gr.addColorStop(0.7, 'rgba(255,255,255,0.15)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr;
    x.beginPath();
    x.moveTo(44, 0); x.lineTo(84, 0); x.lineTo(128, 512); x.lineTo(0, 512);
    x.closePath(); x.fill();
    const tex = new THREE.CanvasTexture(c);
    tex.userData = { ownMap: true };
    return tex;
  }

  // ============================ FOLIAGE BATCH (sway shader) ============================
  function FoliageBatch(z) {
    const pos = [], col = [], sway = [];
    const c = new THREE.Color();
    function vert(x, y, color, phase, amp) {
      pos.push(x, y, z); c.setHex(color); col.push(c.r, c.g, c.b); sway.push(phase, amp);
    }
    return {
      tri(p1, p2, p3, color, phase, amps) {
        vert(p1[0], p1[1], color, phase, amps[0]);
        vert(p2[0], p2[1], color, phase, amps[1]);
        vert(p3[0], p3[1], color, phase, amps[2]);
      },
      quad(x0, y0, x1, y1, color, phase = 0, ampTop = 0, ampBot = 0) {
        this.tri([x0, y0], [x1, y0], [x1, y1], color, phase, [ampBot, ampBot, ampTop]);
        this.tri([x0, y0], [x1, y1], [x0, y1], color, phase, [ampBot, ampTop, ampTop]);
      },
      blade(x, y, h, w, lean, color, phase, amp) {
        this.tri([x - w / 2, y], [x + w / 2, y], [x + lean, y + h], color, phase, [0, 0, amp]);
      },
      spike(x, y, h, w, color, tipColor) {
        this.tri([x - w / 2, y], [x + w / 2, y], [x, y + h], color, 0, [0, 0, 0]);
        this.tri([x - w * 0.13, y + h * 0.55], [x + w * 0.13, y + h * 0.55], [x, y + h], tipColor, 0, [0, 0, 0]);
      },
      build() {
        if (!pos.length) return null;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
        geo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(col), 3));
        geo.setAttribute('aSway', new THREE.BufferAttribute(new Float32Array(sway), 2));
        const mat = new THREE.ShaderMaterial({
          uniforms: { uT: { value: 0 } },
          vertexShader: `
            attribute vec3 aColor; attribute vec2 aSway; uniform float uT; varying vec3 vCol;
            void main(){ vCol = aColor; vec3 p = position;
              p.x += sin(uT * 1.7 + aSway.x) * aSway.y;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
          fragmentShader: `varying vec3 vCol; void main(){ gl_FragColor = vec4(vCol, 1.0); }`,
          side: THREE.DoubleSide
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.frustumCulled = false;
        return { mesh, mat };
      }
    };
  }

  // ============================ AMBIENT MOTES (gpu points) ============================
  function buildMotes(def, color, count, sizeRange, zRange, alpha) {
    const base = new Float32Array(count * 3);
    const vel = new Float32Array(count * 2);
    const phase = new Float32Array(count);
    const size = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      base[i * 3] = U.rand(0, def.w);
      base[i * 3 + 1] = U.rand(0, def.h);
      base[i * 3 + 2] = U.rand(zRange[0], zRange[1]);
      vel[i * 2] = U.rand(-0.4, 0.4);
      vel[i * 2 + 1] = U.rand(-0.25, 0.15);
      phase[i] = U.rand(0, U.TAU);
      size[i] = U.rand(sizeRange[0], sizeRange[1]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(base, 3));
    geo.setAttribute('aVel', new THREE.BufferAttribute(vel, 2));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(def.w / 2, def.h / 2, 0), Math.max(def.w, def.h));
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uT: { value: 0 }, uPx: { value: 600 },
        uMin: { value: new THREE.Vector2(-4, -2) },
        uRange: { value: new THREE.Vector2(def.w + 8, def.h + 4) },
        uColor: { value: new THREE.Color(color) },
        uAlpha: { value: alpha },
        uTex: { value: U.dotTex() }
      },
      vertexShader: `
        attribute vec2 aVel; attribute float aPhase; attribute float aSize;
        uniform float uT; uniform float uPx; uniform vec2 uMin; uniform vec2 uRange;
        varying float vA;
        void main(){
          vec2 p = uMin + mod(position.xy - uMin + aVel * uT, uRange);
          p.y += sin(uT * 0.5 + aPhase) * 0.5;
          vA = 0.45 + 0.55 * sin(uT * 0.7 + aPhase * 3.1);
          vec4 mv = modelViewMatrix * vec4(p, position.z, 1.0);
          gl_PointSize = aSize * uPx / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform vec3 uColor; uniform float uAlpha; uniform sampler2D uTex; varying float vA;
        void main(){ gl_FragColor = vec4(uColor, vA * uAlpha) * texture2D(uTex, gl_PointCoord); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 15;
    return { pts, mat };
  }

  // ============================ PROPS ============================
  const mkProp = W.mkProp = {};   // exposed so the editor can build single props (asset thumbnails)

  mkProp.bench = p => {
    const grp = new THREE.Group();
    grp.position.set(p.x, p.y, -0.1);
    const dark = 0x101417, rim = 0x6f7d84;
    grp.add(U.flat(U.poly([[-1.1, 0.5], [1.1, 0.5], [1.0, 0.68], [-1.0, 0.68]]), dark, {}));
    grp.add(U.flat(U.poly([[-1.05, 0.66], [1.05, 0.66], [1.05, 0.71], [-1.05, 0.71]]), rim, {}));
    grp.add(U.flat(U.poly([[-0.85, 0], [-0.6, 0], [-0.66, 0.52], [-0.8, 0.52]]), dark, {}));
    grp.add(U.flat(U.poly([[0.85, 0], [0.6, 0], [0.66, 0.52], [0.8, 0.52]]), dark, {}));
    grp.add(U.flat(U.splineShape([[-1.1, 0.62], [-1.32, 0.95], [-1.22, 1.25], [-1.05, 1.0], [-1.0, 0.66]]), dark, {}));
    grp.add(U.flat(U.splineShape([[1.1, 0.62], [1.32, 0.95], [1.22, 1.25], [1.05, 1.0], [1.0, 0.66]]), dark, {}));
    return {
      type: 'bench', x: p.x, y: p.y, group: grp, usedAt: -9,
      update(dt) {
        const pl = G.player;
        if (!pl || pl.dead) return;
        if (Math.abs(pl.body.x - p.x) < 1.7 && Math.abs(pl.body.y - p.y) < 1.6 && pl.body.onGround) {
          G.UI.prompt(p.x, p.y + 2.1, 'rest — E or ↑');
          if ((G.Input.pressed('interact') || G.Input.pressed('up')) && G.time - this.usedAt > 1.5) {
            this.usedAt = G.time;
            G.Main.benchRest(this);
          }
        }
      }
    };
  };

  function readableRig(style) {
    const grp = new THREE.Group();
    const dark = 0x12181a, etch = 0x5a6b6e;
    if (style === 'effigy') {
      grp.add(U.flat(U.splineShape([[-0.3, 0], [0.3, 0], [0.22, 1.1], [0, 1.45], [-0.22, 1.1]]), dark, {}));
      grp.add(U.flat(U.ellipse(0.26, 0.3), 0xcfc8b8, { y: 1.12, z: 0.02 }));
      grp.add(U.flat(U.ellipse(0.06, 0.1), 0x17110b, { x: -0.06, y: 1.12, z: 0.04 }));
      grp.add(U.flat(U.ellipse(0.06, 0.1), 0x17110b, { x: 0.06, y: 1.12, z: 0.04 }));
    } else if (style === 'totem') {
      grp.add(U.flat(U.poly([[-0.18, 0], [0.18, 0], [0.14, 1.9], [-0.14, 1.9]]), dark, {}));
      for (let i = 0; i < 3; i++)
        grp.add(U.flat(U.poly([[-0.3, 0.35 + i * 0.5], [0.3, 0.35 + i * 0.5], [0.24, 0.55 + i * 0.5], [-0.24, 0.55 + i * 0.5]]), etch, { z: 0.02 }));
    } else { // tablet
      grp.add(U.flat(U.splineShape([[-0.42, 0], [-0.5, 0.7], [-0.3, 1.15], [0.3, 1.15], [0.5, 0.7], [0.42, 0]]), dark, {}));
      grp.add(U.flat(U.poly([[-0.22, 0.55], [0.22, 0.55], [0.22, 0.62], [-0.22, 0.62]]), etch, { z: 0.02 }));
      grp.add(U.flat(U.poly([[-0.16, 0.74], [0.16, 0.74], [0.16, 0.8], [-0.16, 0.8]]), etch, { z: 0.02 }));
    }
    return grp;
  }
  mkProp.sign = p => {
    const grp = readableRig(p.style || 'tablet');
    grp.position.set(p.x, p.y, -0.15);
    return {
      type: 'sign', x: p.x, y: p.y, group: grp,
      update() {
        const pl = G.player;
        if (!pl || pl.dead) return;
        if (Math.abs(pl.body.x - p.x) < 2 && Math.abs(pl.body.y - p.y) < 2)
          G.UI.prompt(p.x, p.y + 2.0, (p.title ? p.title + '\n' : '') + (p.text || '...'), true);
      }
    };
  };
  mkProp.readable = mkProp.sign;

  mkProp.textTrigger = p => ({
    type: 'textTrigger', x: p.x, y: p.y, group: new THREE.Group(), fired: false,
    update() {
      const pl = G.player;
      if (!pl || pl.dead || (p.once && this.fired)) return;
      const zone = { x: p.x, y: p.y, w: p.w || 3, h: p.h || 3 };
      if (U.overlap(pl.body, zone)) {
        if (!this.inside) {
          this.inside = true; this.fired = true;
          G.UI.toast(p.text || '...');
        }
      } else this.inside = false;
    }
  });

  // walk into this zone to play a cutscene — like a level transition, but cinematic
  mkProp.cutsceneTrigger = p => ({
    type: 'cutsceneTrigger', x: p.x, y: p.y, group: new THREE.Group(), inside: false,
    update() {
      const pl = G.player;
      if (!pl || pl.dead || G.Main.state !== 'play') return;
      const zone = { x: p.x, y: p.y, w: p.w || 3, h: p.h || 3 };
      const over = U.overlap(pl.body, zone);
      if (over && !this.inside) {
        this.inside = true;
        const key = G.room.id + ':cs:' + (p.cutscene || '') + ':' + Math.round(p.x) + ',' + Math.round(p.y);
        const seen = p.once && G.save.cutscenesSeen && G.save.cutscenesSeen[key];
        if (!seen && p.cutscene && G.CUTSCENES && G.CUTSCENES[p.cutscene]) {
          if (p.once) { G.save.cutscenesSeen = G.save.cutscenesSeen || {}; G.save.cutscenesSeen[key] = true; G.Main.persist(); }
          G.Main.playCutsceneInPlace(p.cutscene);
        }
      } else if (!over) this.inside = false;
    }
  });

  // walk into this invisible zone to flip a chosen set of objects active/inactive — the
  // targets may live in OTHER levels. Each target's state is written to the save (and
  // applied live if it's in this room). See W.applyActiveTargets.
  mkProp.setActiveTrigger = p => ({
    type: 'setActiveTrigger', x: p.x, y: p.y, group: new THREE.Group(), inside: false,
    update() {
      const pl = G.player;
      if (!pl || pl.dead || G.Main.state !== 'play') return;
      const zone = { x: p.x, y: p.y, w: p.w || 4, h: p.h || 4 };
      const over = U.overlap(pl.body, zone);
      if (over && !this.inside) {
        this.inside = true;
        const key = G.room.id + ':sa:' + Math.round(p.x) + ',' + Math.round(p.y);
        if (p.once && G.save.triggersFired && G.save.triggersFired[key]) return;
        if (p.once) { G.save.triggersFired = G.save.triggersFired || {}; G.save.triggersFired[key] = true; }
        W.applyActiveTargets(p.targets);
      } else if (!over) this.inside = false;
    }
  });

  // walk into this zone to change the biome and/or the colour grade / weather / water of the
  // room. Grade/weather/water changes fade in over `fade`s; a biome change always fades the
  // background to black (1.5s), swaps, then fades back. No-op if nothing actually differs.
  mkProp.lookTrigger = p => ({
    type: 'lookTrigger', x: p.x, y: p.y, group: new THREE.Group(), inside: false,
    update() {
      const pl = G.player;
      if (!pl || pl.dead || G.Main.state !== 'play') return;
      const zone = { x: p.x, y: p.y, w: p.w || 4, h: p.h || 4 };
      const over = U.overlap(pl.body, zone);
      if (over && !this.inside) {
        this.inside = true;
        const cur = G.room.lookState || {};
        const biomeChanged = p.biome && p.biome !== cur.biome;
        const gradeChanged = p.grade && JSON.stringify(p.grade) !== JSON.stringify(cur.grade || null);
        const weatherChanged = p.weather !== undefined && (p.weather || 'none') !== (cur.weather || 'none');
        const waterChanged = p.water !== undefined && JSON.stringify(p.water || null) !== JSON.stringify(cur.water || null);
        if (!biomeChanged && !gradeChanged && !weatherChanged && !waterChanged) return;   // all the same → do nothing
        if (biomeChanged) {
          W.changeBiome({
            biome: p.biome,
            grade: gradeChanged ? p.grade : (cur.grade || null),
            weather: weatherChanged ? p.weather : cur.weather,
            water: waterChanged ? p.water : (cur.water || null)
          });
        } else {
          W.applyLook({
            grade: gradeChanged ? p.grade : undefined,
            weather: weatherChanged ? p.weather : undefined,
            water: waterChanged ? p.water : undefined
          }, p.fade || 2);
        }
      } else if (!over) this.inside = false;
    }
  });

  mkProp.lamp = (p, pal) => {
    const grp = new THREE.Group();
    grp.position.set(p.x, p.y, -0.12);
    const dark = 0x0e1214;
    grp.add(U.flat(U.poly([[-0.07, 0], [0.07, 0], [0.05, 1.7], [-0.05, 1.7]]), dark, {}));
    grp.add(U.flat(U.poly([[-0.3, 0], [0.3, 0], [0.2, 0.14], [-0.2, 0.14]]), dark, {}));
    grp.add(U.flat(U.splineShape([[-0.26, 1.55], [0.26, 1.55], [0.2, 1.95], [-0.2, 1.95]]), dark, {}));
    const flame = U.flat(U.ellipse(0.26, 0.34), pal.glow, { additive: true, opacity: 0.95, y: 1.74, z: 0.05 });
    grp.add(flame);
    const glow = U.glowSprite(pal.glow, 9, 0.38);
    glow.position.set(0, 1.74, 0.1);
    grp.add(glow);
    if (G.Lights) G.Lights.add({ x: p.x, y: p.y + 1.74, color: pal.glow, radius: 11, intensity: 1.1, flicker: 0.28 });
    let t = U.rand(0, 9), emberT = U.rand(0.5, 2);
    return {
      type: 'lamp', x: p.x, y: p.y, group: grp,
      update(dt) {
        t += dt;
        glow.material.opacity = 0.38 * (0.85 + Math.sin(t * 7.3) * 0.07 + Math.sin(t * 13.7) * 0.05);
        flame.scale.y = 0.9 + Math.sin(t * 9.1) * 0.12;
        emberT -= dt;
        if (emberT <= 0) { emberT = U.rand(0.6, 2.2); G.FX.burst('ember', p.x, p.y + 1.8, { color: pal.glow }); }
      }
    };
  };

  mkProp.crystal = (p, pal) => {
    const grp = new THREE.Group();
    grp.position.set(p.x, p.y, -0.12);
    const n = U.randi(2, 4);
    for (let i = 0; i < n; i++) {
      const w = U.rand(0.2, 0.45), h = U.rand(0.7, 1.7), dx = (i - (n - 1) / 2) * 0.36, lean = U.rand(-0.25, 0.25);
      grp.add(U.flat(U.poly([[-w / 2, 0], [w / 2, 0], [lean, h]]), U.colLerp(pal.glow, 0x000000, 0.45), { x: dx }));
      grp.add(U.flat(U.poly([[-w * 0.22, 0.1], [w * 0.22, 0.1], [lean * 0.8, h * 0.82]]), pal.glow, { x: dx, z: 0.03, additive: true, opacity: 0.85 }));
    }
    const glow = U.glowSprite(pal.glow, 6.5, 0.34);
    glow.position.set(0, 0.7, 0.1);
    grp.add(glow);
    if (G.Lights) G.Lights.add({ x: p.x, y: p.y + 0.7, color: pal.glow, radius: 8, intensity: 0.85, flicker: 0.12 });
    let t = U.rand(0, 9);
    return {
      type: 'crystal', x: p.x, y: p.y, group: grp,
      update(dt) {
        t += dt;
        glow.material.opacity = 0.34 + Math.sin(t * 1.8) * 0.08;
        if (U.chance(dt * 0.5)) G.FX.burst('mote', p.x + U.rand(-1, 1), p.y + U.rand(0, 1.5), { color: pal.glow });
      }
    };
  };

  mkProp.wings = p => {
    const grp = new THREE.Group();
    grp.position.set(p.x, p.y, 0.1);
    const wL = U.flat(U.splineShape([[0, 0], [-0.7, 0.45], [-1.0, 0.1], [-0.6, -0.35], [0, -0.15]]), 0xf2f6ff, { additive: true, opacity: 0.9 });
    const wR = U.flat(U.splineShape([[0, 0], [0.7, 0.45], [1.0, 0.1], [0.6, -0.35], [0, -0.15]]), 0xf2f6ff, { additive: true, opacity: 0.9 });
    grp.add(wL, wR);
    grp.add(U.glowSprite(0xdfe8ff, 6, 0.45));
    let t = 0;
    return {
      type: 'wings', x: p.x, y: p.y, group: grp, dead: false,
      update(dt) {
        t += dt;
        grp.position.y = p.y + Math.sin(t * 1.6) * 0.25;
        wL.rotation.z = Math.sin(t * 3.2) * 0.25;
        wR.rotation.z = -Math.sin(t * 3.2) * 0.25;
        const pl = G.player;
        if (pl && !pl.dead && Math.abs(pl.body.x - p.x) < 1 && Math.abs(pl.body.y - grp.position.y) < 1.2) {
          this.dead = true;
          pl.hasWings = true;
          G.save.wings = true; G.Main.persist();
          G.Audio.sfx('pickup');
          G.FX.burst('healPop', p.x, grp.position.y);
          G.FX.ring(p.x, grp.position.y, { r1: 5, life: 0.6, color: 0xffffff });
          G.FX.shake(0.15, 0.3);
          G.UI.toast('MOTH WINGS — press jump again in mid-air to flutter');
        }
      }
    };
  };

  mkProp.shrine = (p, pal) => {
    const grp = new THREE.Group();
    grp.position.set(p.x, p.y, -0.1);
    const dark = 0x101816;
    grp.add(U.flat(U.poly([[-0.8, 0], [0.8, 0], [0.55, 0.5], [-0.55, 0.5]]), dark, {}));
    grp.add(U.flat(U.poly([[-0.35, 0.5], [0.35, 0.5], [0.28, 1.5], [-0.28, 1.5]]), dark, {}));
    const orb = U.flat(U.ellipse(0.55, 0.55), pal.glow, { additive: true, opacity: 0.9, y: 1.9 });
    grp.add(orb);
    const glow = U.glowSprite(pal.glow, 9, 0.4);
    glow.position.y = 1.9;
    grp.add(glow);
    let t = 0;
    return {
      type: 'shrine', x: p.x, y: p.y, group: grp,
      update(dt) {
        t += dt;
        orb.position.y = 1.9 + Math.sin(t * 1.2) * 0.1;
        glow.material.opacity = 0.4 + Math.sin(t * 1.2) * 0.1;
        const pl = G.player;
        if (!pl || pl.dead) return;
        if (Math.abs(pl.body.x - p.x) < 1.7 && Math.abs(pl.body.y - p.y) < 2 && pl.body.onGround) {
          G.UI.prompt(p.x, p.y + 3.2, 'commune — E or ↑');
          if (G.Input.pressed('interact') || G.Input.pressed('up')) G.Main.startEnding();
        }
      }
    };
  };

  // a found-in-the-world charm pickup (editor: choose which charm)
  mkProp.charmPickup = p => {
    const grp = new THREE.Group();
    grp.position.set(p.x, p.y, 0.1);
    const col = 0xffe28a;
    grp.add(U.flat(U.poly([[0, 0.42], [0.36, 0], [0, -0.42], [-0.36, 0]]), 0x2a2418, {}));
    grp.add(U.flat(U.ellipse(0.2, 0.2), col, { additive: true, opacity: 0.9 }));
    grp.add(U.glowSprite(col, 4, 0.4));
    const cid = p.charm || (G.Charms && G.Charms.LIST[0] && G.Charms.LIST[0].id);
    let t = 0;
    return {
      type: 'charmPickup', x: p.x, y: p.y, group: grp, dead: false,
      update(dt) {
        if (this.dead) return;
        t += dt;
        grp.position.y = p.y + Math.sin(t * 1.6) * 0.2;
        grp.scale.x = 1 + Math.sin(t * 2) * 0.08;
        if (G.Charms && G.Charms.isOwned(cid)) { this.dead = true; grp.visible = false; return; }
        const pl = G.player;
        if (pl && !pl.dead && Math.abs(pl.body.x - p.x) < 1 && Math.abs(pl.body.y - grp.position.y) < 1.3) {
          this.dead = true; grp.visible = false;
          if (G.Charms) G.Charms.grant(cid);
          G.Audio.sfx('pickup');
          G.FX.burst('healPop', p.x, grp.position.y);
          G.FX.ring(p.x, grp.position.y, { r1: 4, life: 0.5, color: col });
          G.FX.shake(0.12, 0.25);
          const c = G.Charms && G.Charms.get(cid);
          G.UI.toast('Charm found: ' + (c ? c.name : cid));
        }
      }
    };
  };

  // a cloaked vendor — interact to open the charm shop (spend Glimmer)
  mkProp.vendor = p => {
    const grp = new THREE.Group();
    grp.position.set(p.x, p.y, 0);
    grp.add(U.flat(U.splineShape([[-0.5, 0], [-0.55, 1.2], [0, 1.95], [0.55, 1.2], [0.5, 0]]), 0x18141f, {}));
    grp.add(U.flat(U.ellipse(0.32, 0.4), 0x0e0c14, { y: 1.7 }));
    const eye = U.flat(U.ellipse(0.08, 0.08), 0xffd27a, { additive: true, opacity: 0.9, y: 1.72, z: 0.05 });
    grp.add(eye);
    const glow = U.glowSprite(0xffcf7a, 5, 0.25); glow.position.y = 1.5; grp.add(glow);
    let t = 0;
    return {
      type: 'vendor', x: p.x, y: p.y, group: grp,
      update(dt) {
        t += dt;
        eye.material.opacity = 0.55 + Math.sin(t * 2) * 0.3;
        const pl = G.player;
        if (!pl || pl.dead || G.Main.state !== 'play') return;
        if (Math.abs(pl.body.x - p.x) < 1.7 && Math.abs(pl.body.y - p.y) < 2 && pl.body.onGround) {
          G.UI.prompt(p.x, p.y + 2.7, 'trade — E or ↑');
          if (G.Input.pressed('interact') || G.Input.pressed('up')) G.Main.openShop(this);
        }
      }
    };
  };

  mkProp.gate = p => {
    const grp = new THREE.Group();
    grp.position.set(p.x, p.y, -0.2);
    const inner = new THREE.Group();
    grp.add(inner);
    inner.add(U.flat(U.poly([[-0.5, 0], [0.5, 0], [0.38, 5], [-0.38, 5]]), 0x0b0f10, {}));
    for (let i = 0; i < 4; i++) {
      const ty = 0.7 + i * 1.15;
      inner.add(U.flat(U.poly([[-0.65, ty], [0.65, ty + 0.18], [0.55, ty + 0.34], [-0.55, ty + 0.16]]), 0x1a2326, { z: 0.02 }));
    }
    inner.scale.y = 0.02;
    const collider = { x: p.x, y: p.y + 2.5, w: 1.0, h: 5 };
    return {
      type: 'gate', x: p.x, y: p.y, group: grp, closed: false, anim: 0, target: 0,
      close() {
        if (this.closed) return;
        this.closed = true; this.target = 1;
        G.Physics.solids.push(collider);
        G.Audio.sfx('stomp');
        G.FX.burst('dust', p.x, p.y, { n: 12 });
        G.FX.shake(0.18, 0.25);
      },
      open() {
        if (!this.closed) return;
        this.closed = false; this.target = 0;
        const i = G.Physics.solids.indexOf(collider);
        if (i >= 0) G.Physics.solids.splice(i, 1);
        G.FX.burst('dust', p.x, p.y, { n: 10 });
      },
      update(dt) {
        this.anim = U.damp(this.anim, this.target, 10, dt);
        inner.scale.y = Math.max(0.02, this.anim);
      }
    };
  };

  mkProp.bossTrigger = p => ({
    type: 'bossTrigger', x: p.x, y: p.y, boss: p.boss || 'mossSovereign', group: new THREE.Group(), done: false,
    update() {
      if (this.done) return;
      const key = G.room.id + ':' + this.boss;
      if (G.save.bosses && G.save.bosses[key]) { this.done = true; return; }
      const pl = G.player;
      if (!pl || pl.dead) return;
      if (Math.abs(pl.body.x - p.x) < (p.r || 6) && Math.abs(pl.body.y - p.y) < 6) {
        this.done = true;
        const gates = G.room.entities.filter(e => e.type === 'gate');
        gates.forEach(g2 => g2.close());
        G.Enemies.spawnBoss(this.boss, p.x, p.y, gates, key);
      }
    }
  });

  mkProp.decor = (p, pal) => {
    const grp = new THREE.Group();
    const z = p.z !== undefined ? p.z : -0.3;
    grp.position.set(p.x, p.y, z);
    const depth = Math.max(0, -z);
    const col = p.color ? parseInt(p.color.replace('#', ''), 16) : pal.sil;
    const mat = new THREE.MeshBasicMaterial({ color: col, fog: z < -2, side: THREE.DoubleSide });
    const rng = U.mulberry32((p.seed || 1) * 7919 + Math.round(p.x * 13));
    const kind = SIL[p.kind] ? p.kind : 'mushroom';
    SIL[kind](grp, mat, 0, 0, (p.scale || 1) * (1 + depth * 0.04), rng);
    if (p.flip) grp.scale.x = -1;
    const ent = { type: 'decor', x: p.x, y: p.y, group: grp, update() { } };
    if (p.solid && z > -2 && z < 2) {
      const cw = (p.cw || 2) * (p.scale || 1), ch = (p.chh || 2) * (p.scale || 1);
      const collider = { x: p.x, y: p.y + ch / 2, w: cw, h: ch };
      ent._solid = collider;                 // so W.setEntityActive can pull it when toggled off
      if (!G.EDITOR) G.Physics.solids.push(collider);
    }
    return ent;
  };

  // ---- detailed, full-colour Victorian furniture (NOT silhouettes) ----------------------
  const _fmat = {};
  function fmat(hex) { return _fmat[hex] || (_fmat[hex] = new THREE.MeshBasicMaterial({ color: hex, side: THREE.DoubleSide, fog: false })); }
  function fadd(grp, geo, hex, z) { const m = new THREE.Mesh(geo, fmat(hex)); m.position.z = z || 0; grp.add(m); return m; }
  function frect(grp, x0, y0, x1, y1, hex, z) { return fadd(grp, new THREE.ShapeGeometry(U.poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]])), hex, z); }
  function fspl(grp, pts, hex, z, seg) { return fadd(grp, new THREE.ShapeGeometry(U.splineShape(pts), seg || 10), hex, z); }
  function fpoly(grp, pts, hex, z) { return fadd(grp, new THREE.ShapeGeometry(U.poly(pts)), hex, z); }
  function fcirc(grp, r, hex, x, y, z) { const m = new THREE.Mesh(new THREE.CircleGeometry(r, 12), fmat(hex)); m.position.set(x, y, z || 0); grp.add(m); return m; }
  const FURN = W.FURN = {
    sofa(g, s, r) {
      frect(g, -1.7 * s, 0.18 * s, 1.7 * s, 0.98 * s, '#5a141a');
      frect(g, -1.62 * s, 0.82 * s, 1.62 * s, 1.55 * s, '#7a1f24', 0.01);
      fspl(g, [[-1.6 * s, 0.78 * s], [1.6 * s, 0.78 * s], [1.5 * s, 1.52 * s], [-1.5 * s, 1.52 * s]], '#8e2f35', 0.02, 8);
      for (let i = -1; i <= 1; i++) fspl(g, [[i * 1.08 * s - 0.5 * s, 0.6 * s], [i * 1.08 * s + 0.5 * s, 0.6 * s], [i * 1.08 * s + 0.44 * s, 1.04 * s], [i * 1.08 * s - 0.44 * s, 1.04 * s]], '#9c3b41', 0.03, 6);
      fspl(g, [[-1.92 * s, 0.18 * s], [-1.34 * s, 0.18 * s], [-1.3 * s, 1.36 * s], [-1.62 * s, 1.56 * s], [-1.96 * s, 1.3 * s]], '#681920', 0.04, 8);
      fspl(g, [[1.34 * s, 0.18 * s], [1.92 * s, 0.18 * s], [1.96 * s, 1.3 * s], [1.62 * s, 1.56 * s], [1.3 * s, 1.36 * s]], '#681920', 0.04, 8);
      frect(g, -1.5 * s, -0.16 * s, -1.2 * s, 0.22 * s, '#2e1d10'); frect(g, 1.2 * s, -0.16 * s, 1.5 * s, 0.22 * s, '#2e1d10');
      for (let i = -2; i <= 2; i++) fcirc(g, 0.045 * s, '#c8a64e', i * 0.56 * s, 1.12 * s, 0.05);
    },
    chair(g, s) {
      frect(g, -0.5 * s, 0.55 * s, 0.5 * s, 0.75 * s, '#7a1f24', 0.02);
      frect(g, -0.5 * s, 0.7 * s, 0.5 * s, 1.7 * s, '#3e2a18', 0.01);
      frect(g, -0.42 * s, 0.78 * s, 0.42 * s, 1.6 * s, '#7a1f24', 0.02);
      frect(g, -0.48 * s, 0, -0.32 * s, 0.6 * s, '#2e1d10'); frect(g, 0.32 * s, 0, 0.48 * s, 0.6 * s, '#2e1d10');
    },
    fireplace(g, s) {
      frect(g, -1.75 * s, 0, 1.75 * s, 2.35 * s, '#7c3e2c');
      for (let i = 0; i < 6; i++) frect(g, -1.75 * s, i * 0.42 * s, 1.75 * s, i * 0.42 * s + 0.05 * s, '#5a2a1c', 0.005);
      frect(g, -1.08 * s, 0, 1.08 * s, 1.6 * s, '#120c08', 0.01);
      frect(g, -1.0 * s, 1.45 * s, 1.0 * s, 1.6 * s, '#3a2414', 0.015);
      frect(g, -2.0 * s, 2.22 * s, 2.0 * s, 2.7 * s, '#4a3320', 0.03);
      frect(g, -1.9 * s, 2.62 * s, 1.9 * s, 2.7 * s, '#5c4026', 0.03);
      frect(g, -0.75 * s, 0.1 * s, 0.75 * s, 0.34 * s, '#3a2414', 0.02);
      const fire = fspl(g, [[-0.62 * s, 0.18 * s], [0.62 * s, 0.18 * s], [0.32 * s, 1.02 * s], [0, 1.34 * s], [-0.32 * s, 1.02 * s]], '#ff7a22', 0.03, 10);
      fspl(g, [[-0.36 * s, 0.22 * s], [0.36 * s, 0.22 * s], [0.16 * s, 0.84 * s], [0, 1.0 * s], [-0.16 * s, 0.84 * s]], '#ffd24a', 0.04, 10);
      return { fire, fy: fire.position.y };
    },
    painting(g, s, r) {
      frect(g, -0.88 * s, -0.06 * s, 0.88 * s, 1.18 * s, '#a07c30');
      frect(g, -0.78 * s, 0.04 * s, 0.78 * s, 1.08 * s, '#caa24a', 0.005);
      frect(g, -0.68 * s, 0.12 * s, 0.68 * s, 1.0 * s, '#23201a', 0.01);
      if (!r || r() < 0.5) {                       // landscape
        frect(g, -0.68 * s, 0.56 * s, 0.68 * s, 1.0 * s, '#566f93', 0.02);
        fspl(g, [[-0.68 * s, 0.56 * s], [-0.2 * s, 0.74 * s], [0.3 * s, 0.6 * s], [0.68 * s, 0.72 * s], [0.68 * s, 0.4 * s], [-0.68 * s, 0.4 * s]], '#39513a', 0.03, 8);
        fcirc(g, 0.09 * s, '#e8d088', 0.34 * s, 0.86 * s, 0.025);
      } else {                                      // portrait
        frect(g, -0.68 * s, 0.12 * s, 0.68 * s, 1.0 * s, '#2b2230', 0.02);
        fspl(g, [[-0.34 * s, 0.18 * s], [0.34 * s, 0.18 * s], [0.28 * s, 0.7 * s], [-0.28 * s, 0.7 * s]], '#3a2c40', 0.03, 6);
        fcirc(g, 0.22 * s, '#d8c0a0', 0, 0.78 * s, 0.04);
      }
    },
    bookshelf(g, s, r) {
      r = r || Math.random;
      frect(g, -1.05 * s, 0, 1.05 * s, 2.85 * s, '#3a2718');
      frect(g, -1.05 * s, 0, 1.05 * s, 0.12 * s, '#2a1c10', 0.005);
      const cols = ['#8a2a2a', '#2a5a3a', '#28386a', '#6a4a2a', '#5a2a5a', '#246a6a', '#7a5a26', '#3a3a4a'];
      for (let row = 0; row < 4; row++) {
        const by = row * 0.7 * s + 0.12 * s;
        frect(g, -0.98 * s, by + 0.58 * s, 0.98 * s, by + 0.66 * s, '#2a1c10', 0.01);
        let bx = -0.94 * s;
        while (bx < 0.86 * s) { const bw = (0.08 + r() * 0.07) * s, bh = (0.42 + r() * 0.13) * s; frect(g, bx, by, bx + bw, by + bh, cols[(r() * cols.length) | 0], 0.02); bx += bw + 0.02 * s; }
      }
    },
    table(g, s) {
      frect(g, -1.2 * s, 0.78 * s, 1.2 * s, 0.95 * s, '#5a3f24', 0.02);
      frect(g, -1.2 * s, 0.92 * s, 1.2 * s, 0.98 * s, '#6b4a28', 0.025);
      frect(g, -1.0 * s, 0, -0.78 * s, 0.78 * s, '#3e2a18'); frect(g, 0.78 * s, 0, 1.0 * s, 0.78 * s, '#3e2a18');
      frect(g, -0.6 * s, 0.95 * s, 0.6 * s, 1.02 * s, '#7a1f24', 0.03);            // red runner
      fspl(g, [[-0.2 * s, 1.0 * s], [0.2 * s, 1.0 * s], [0.13 * s, 1.5 * s], [-0.13 * s, 1.5 * s]], '#caa24a', 0.04, 6); // candlestick
      fcirc(g, 0.06 * s, '#ffd24a', 0, 1.56 * s, 0.05);
    },
    rug(g, s) {
      frect(g, -2.6 * s, 0, 2.6 * s, 0.18 * s, '#6e1818');
      frect(g, -2.6 * s, 0, -2.3 * s, 0.18 * s, '#b89a52', 0.005); frect(g, 2.3 * s, 0, 2.6 * s, 0.18 * s, '#b89a52', 0.005);
      frect(g, -2.6 * s, 0.14 * s, 2.6 * s, 0.18 * s, '#b89a52', 0.005);
      fpoly(g, [[-0.5 * s, 0.02 * s], [0, 0.16 * s], [0.5 * s, 0.02 * s], [0, -0.0 * s]], '#caa24a', 0.01);
    },
    chandelier(g, s) {
      frect(g, -0.05 * s, -1.3 * s, 0.05 * s, 0, '#5a4a20');
      fspl(g, [[-1.35 * s, -1.25 * s], [0, -0.78 * s], [1.35 * s, -1.25 * s], [0.7 * s, -1.92 * s], [0, -1.55 * s], [-0.7 * s, -1.92 * s]], '#c2a24a', 0.01, 10);
      for (let i = -2; i <= 2; i++) { fcirc(g, 0.05 * s, '#fff0c0', i * 0.5 * s, -1.18 * s, 0.03); }
    },
    plant(g, s, r) {
      r = r || Math.random;
      fspl(g, [[-0.42 * s, 0], [0.42 * s, 0], [0.32 * s, 0.66 * s], [-0.32 * s, 0.66 * s]], '#9a5230', 0.01, 6);
      frect(g, -0.34 * s, 0.5 * s, 0.34 * s, 0.62 * s, '#7a3e22', 0.012);
      for (let i = 0; i < 6; i++) { const a = U.lerp(0.7, 2.45, r()), len = U.lerp(0.9, 1.9, r()) * s; fspl(g, [[-0.1 * s, 0.55 * s], [0.1 * s, 0.55 * s], [Math.cos(a) * len * 0.5, 0.55 * s + Math.sin(a) * len], [Math.cos(a) * len, 0.55 * s + Math.sin(a) * len * 0.92]], i % 2 ? '#2f6e3a' : '#3a824a', 0.02, 6); }
    }
  };
  mkProp.furniture = (p, pal) => {
    const grp = new THREE.Group();
    const z = p.z !== undefined ? p.z : -0.2;
    grp.position.set(p.x, p.y, z);
    const s = p.scale || 1;
    const rng = U.mulberry32((p.seed || 1) * 131 + Math.round(p.x * 7) + Math.round(p.y * 13));
    const kind = FURN[p.kind] ? p.kind : 'sofa';
    const out = FURN[kind](grp, s, rng) || {};
    if (p.flip) grp.scale.x = -1;
    if (kind === 'fireplace' && G.Lights) G.Lights.add({ x: p.x, y: p.y + 0.7, color: 0xff7a30, radius: 7, intensity: 1.0, flicker: 0.4 });
    if (kind === 'chandelier' && G.Lights) G.Lights.add({ x: p.x, y: p.y - 0.9, color: 0xffcf86, radius: 7.5, intensity: 0.85, flicker: 0.16 });
    let t = rng() * 9;
    const fire = out.fire;
    return {
      type: 'furniture', x: p.x, y: p.y, group: grp,
      update(dt) { if (fire) { t += dt; fire.scale.set(1 + Math.sin(t * 13) * 0.05, 1 + Math.sin(t * 9) * 0.14 + Math.sin(t * 19) * 0.06, 1); } }
    };
  };

  // ---- interior wall backdrops (tileable Victorian textures) to hide the biome behind a building ----
  function brickCanvas() {
    const [c, x] = U.makeCanvas(256, 256);
    x.fillStyle = '#2c1810'; x.fillRect(0, 0, 256, 256);
    const pitchX = 64, pitchY = 32, bw = 60, bh = 26, cols = ['#6e3a28', '#794132', '#653425', '#824a36', '#5c3120', '#714030'];
    for (let row = 0, y = 0; y < 256; row++, y += pitchY) {
      const off = (row % 2) ? pitchX / 2 : 0;
      for (let bx = -pitchX; bx < 256 + pitchX; bx += pitchX) {
        x.fillStyle = cols[Math.abs((bx / pitchX + row * 3) % cols.length)];
        x.fillRect(bx + off + 2, y + 2, bw, bh);
        x.fillStyle = 'rgba(255,210,170,0.06)'; x.fillRect(bx + off + 2, y + 2, bw, 3);
        x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(bx + off + 2, y + bh - 1, bw, 3);
      }
    }
    return c;
  }
  function woodCanvas() {
    const [c, x] = U.makeCanvas(256, 256);
    x.fillStyle = '#4a3320'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 42; i++) { x.strokeStyle = 'rgba(0,0,0,' + (0.04 + (i % 3) * 0.02) + ')'; x.beginPath(); const gx = (i * 6.1) % 256; x.moveTo(gx, 0); x.lineTo(gx + 3, 256); x.stroke(); }
    const m = 18, pw = 256 - 2 * m;
    x.fillStyle = '#392717'; x.fillRect(m, m, pw, pw);
    x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(m, m, pw, 5); x.fillRect(m, m, 5, pw);
    x.fillStyle = 'rgba(255,215,165,0.12)'; x.fillRect(m, m + pw - 5, pw, 5); x.fillRect(m + pw - 5, m, 5, pw);
    x.fillStyle = '#473320'; x.fillRect(m + 12, m + 12, pw - 24, pw - 24);
    x.fillStyle = 'rgba(255,215,165,0.08)'; x.fillRect(m + 12, m + 12, pw - 24, 4);
    return c;
  }
  function paperCanvas() {
    const [c, x] = U.makeCanvas(256, 256);
    x.fillStyle = '#4a2226'; x.fillRect(0, 0, 256, 256);
    x.fillStyle = 'rgba(255,255,255,0.025)'; for (let sx = 0; sx < 256; sx += 32) x.fillRect(sx, 0, 16, 256);
    const motif = (cx, cy) => {
      x.save(); x.translate(cx, cy); x.fillStyle = '#7a4438';
      x.beginPath(); for (let a = 0; a < 8; a++) { const ang = a / 8 * 6.2832, r = (a % 2) ? 9 : 21; x[a ? 'lineTo' : 'moveTo'](Math.cos(ang) * r, Math.sin(ang) * r); } x.closePath(); x.fill();
      x.fillStyle = '#9a5a48'; x.beginPath(); x.arc(0, 0, 6, 0, 7); x.fill(); x.restore();
    };
    for (let gy = 0; gy <= 256; gy += 64) for (let gx = 0; gx <= 256; gx += 64) { motif(gx, gy); motif(gx + 32, gy + 32); }
    return c;
  }
  const _wallTex = {};
  function wallTex(style) {
    if (_wallTex[style]) return _wallTex[style];
    const c = style === 'brick' ? brickCanvas() : style === 'wallpaper' ? paperCanvas() : woodCanvas();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return _wallTex[style] = t;
  }
  W.WALL_STYLES = ['wood', 'brick', 'wallpaper'];
  mkProp.wall = (p) => {
    const w = Math.max(1, p.w || 16), h = Math.max(1, p.h || 18), z = p.z !== undefined ? p.z : -2;
    const geo = new THREE.PlaneGeometry(w, h);
    const rx = w / 4, ry = h / 4, uv = geo.attributes.uv;       // tile every ~4 world units, via UVs (shared texture)
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * rx, uv.getY(i) * ry);
    uv.needsUpdate = true;
    const mat = new THREE.MeshBasicMaterial({ map: wallTex(p.style || 'wood'), fog: z < -3, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(p.x, p.y, z);                              // (x,y) = centre
    const grp = new THREE.Group(); grp.add(mesh);
    return { type: 'wall', x: p.x, y: p.y, group: grp, update() { } };
  };

  mkProp.light = p => {
    const grp = new THREE.Group();
    grp.position.set(p.x, p.y, p.z !== undefined ? p.z : -0.5);
    const col = p.color ? parseInt(p.color.replace('#', ''), 16) : 0xffeecc;
    const glow = U.glowSprite(col, p.scale || 8, p.opacity !== undefined ? p.opacity : 0.3);
    grp.add(glow);
    if (G.Lights) G.Lights.add({ x: p.x, y: p.y, color: col, radius: (p.scale || 8) * 1.3, intensity: 0.5 + (p.opacity !== undefined ? p.opacity : 0.3) * 2, flicker: p.flicker ? 0.3 : 0 });
    let t = U.rand(0, 9);
    const base = glow.material.opacity;
    return {
      type: 'light', x: p.x, y: p.y, group: grp,
      update(dt) {
        if (!p.flicker) return;
        t += dt;
        glow.material.opacity = base * (0.82 + Math.sin(t * 6.7) * 0.1 + Math.sin(t * 11.3) * 0.08);
      }
    };
  };

  mkProp.ray = (p, pal) => {
    const grp = new THREE.Group();
    const rm = new THREE.Mesh(
      new THREE.PlaneGeometry(p.w || 5, p.h || 18),
      new THREE.MeshBasicMaterial({ map: rayTex(), transparent: true, opacity: p.opacity || 0.1, blending: THREE.AdditiveBlending, depthWrite: false, color: pal.light, fog: false })
    );
    grp.add(rm);
    grp.position.set(p.x, p.y, -5.5);
    grp.rotation.z = p.rot || -0.15;
    let t = U.rand(0, 9);
    const base = rm.material.opacity;
    return {
      type: 'ray', x: p.x, y: p.y, group: grp,
      update(dt) { t += dt; rm.material.opacity = base * (0.7 + 0.3 * (0.5 + 0.5 * Math.sin(t * 0.4))); }
    };
  };

  // ============================ TERRAIN MATERIALS ============================
  // Solid tile characters paint different ground materials. All collide identically;
  // only the look (colour + whether grass/moss grows on the top) differs. '#' is the
  // biome's default grassy ground.
  const TERRAIN_MATS = W.TERRAIN_MATS = {
    '#': { id: 'grass', label: 'Grassy', foliage: true, smooth: false, col: p => p.terrain },
    'd': { id: 'dirt', label: 'Rough dirt', foliage: false, smooth: false, col: () => 0x2a1d12 },
    'k': { id: 'rock', label: 'Rocky', foliage: false, smooth: false, col: () => 0x242832 },
    's': { id: 'sand', label: 'Sandy', foliage: false, smooth: false, col: () => 0x352b19 },
    'p': { id: 'pale', label: 'Pale stone', foliage: false, smooth: false, col: () => 0x30323a },
    'w': { id: 'wood', label: 'Wood floor', foliage: false, smooth: false, col: () => 0x4a3320 },
    'b': { id: 'brick', label: 'City stone', foliage: false, smooth: false, col: () => 0x1b2c44 },
    // curvy (smooth-rendered) variants of each material — combined freely in one level
    'G': { id: 'grass', label: 'Grassy', foliage: true, smooth: true, col: p => p.terrain },
    'D': { id: 'dirt', label: 'Rough dirt', foliage: false, smooth: true, col: () => 0x2a1d12 },
    'K': { id: 'rock', label: 'Rocky', foliage: false, smooth: true, col: () => 0x242832 },
    'S': { id: 'sand', label: 'Sandy', foliage: false, smooth: true, col: () => 0x352b19 },
    'P': { id: 'pale', label: 'Pale stone', foliage: false, smooth: true, col: () => 0x30323a }
  };
  const SOLID_SET = new Set(Object.keys(TERRAIN_MATS));
  W.SMOOTH_CHAR = { '#': 'G', 'd': 'D', 'k': 'K', 's': 'S', 'p': 'P' };   // hard → smooth
  W.HARD_CHAR = { 'G': '#', 'D': 'd', 'K': 'k', 'S': 's', 'P': 'p' };     // smooth → hard

  // ---- procedural building generator ----------------------------------------------------
  // Stamps a multi-storey building into a level def: a stone shell + wood-floor slabs (as
  // terrain tiles) and a randomised Victorian interior (rug, sofa, fireplace, bookshelf,
  // table, plants, paintings, hanging chandeliers + warm lights) as props. Reusable from
  // any level via def.buildings:[{x,y,w,h,seed}] or from the editor. Mutates def once.
  W.genBuilding = function (def, o) {
    o = o || {};
    const Wd = def.w, Hd = def.h;
    const bx = o.x | 0, by = o.y | 0, bw = Math.max(4, o.w | 0), bh = Math.max(6, o.h | 0);
    const wall = o.wallMat || 'b', floor = o.floorMat || 'w';
    const rng = U.mulberry32(((o.seed || 1) * 2654435761) >>> 0);
    for (let r = 0; r < Hd; r++) if (def.tiles[r] === undefined) def.tiles[r] = '';
    const set = (cx, cy, ch) => {
      if (cx < 0 || cx >= Wd || cy < 0 || cy >= Hd) return;
      const r = Hd - 1 - cy; const row = (def.tiles[r] || '').padEnd(Wd, ' ');
      def.tiles[r] = row.slice(0, cx) + ch + row.slice(cx + 1);
    };
    def.props = def.props || [];
    const prop = p => def.props.push(p);
    // shell: side walls + base + roof
    for (let cy = by; cy < by + bh; cy++) { set(bx, cy, wall); set(bx + bw - 1, cy, wall); }
    for (let cx = bx; cx < bx + bw; cx++) { set(cx, by, wall); set(cx, by + bh - 1, wall); }
    // storeys: wood floor slabs, each with an offset 2-wide stairwell gap to climb through
    const storeyH = o.storeyH || 9;
    const floors = [by + 1];
    for (let fy = by + storeyH; fy < by + bh - 3; fy += storeyH) {
      for (let cx = bx + 1; cx < bx + bw - 1; cx++) set(cx, fy, floor);
      const gap = bx + 2 + ((rng() * (bw - 6)) | 0);
      set(gap, fy, ' '); set(gap + 1, fy, ' ');
      floors.push(fy + 1);
    }
    // interior per storey — full-colour Victorian furniture
    const FK = ['sofa', 'fireplace', 'bookshelf', 'table', 'plant', 'painting', 'chair'];
    for (const fy of floors) {
      const ix0 = bx + 2, ix1 = bx + bw - 3, cxm = (ix0 + ix1) / 2 + 0.5;
      prop({ type: 'furniture', kind: 'rug', x: cxm, y: fy + 0.02, scale: Math.max(1, (ix1 - ix0) / 9), z: -0.24 });
      let cx = ix0 + 1.5;
      while (cx < ix1 - 1.5) {
        const k = FK[(rng() * FK.length) | 0];
        const yy = (k === 'painting') ? fy + 1.7 + rng() * 0.8 : fy + 0.04;
        prop({ type: 'furniture', kind: k, x: cx + 0.5, y: yy, scale: 0.85 + rng() * 0.25, seed: ((cx * 31 + fy * 17) | 0) + 1, z: -0.2, flip: rng() < 0.4 });
        cx += 3 + rng() * 3;
      }
      if (storeyH >= 6) prop({ type: 'furniture', kind: 'chandelier', x: cxm, y: fy + storeyH - 0.7, scale: 1, z: -0.32 });
    }
    // exterior wall lamps for the City-of-Tears glow
    for (let cy = by + 4; cy < by + bh - 2; cy += storeyH) {
      prop({ type: 'light', x: bx - 0.3, y: cy, color: '#a6d4ff', scale: 6, opacity: 0.22 });
      prop({ type: 'light', x: bx + bw - 0.7, y: cy, color: '#a6d4ff', scale: 6, opacity: 0.22 });
    }
  };

  // ============================ TILE PARSING ============================
  function parseLevel(lvl) {
    const Wd = lvl.w, Hd = lvl.h;
    const g = [];
    for (let r = 0; r < Hd; r++) {
      const row = (lvl.tiles[r] || '');
      g.push(row.padEnd(Wd, ' ').split(''));
    }
    const solid = (c, r) => r >= 0 && r < Hd && c >= 0 && c < Wd && SOLID_SET.has(g[r][c]);
    // horizontal runs of the SAME material char
    const runs = [];
    for (let r = 0; r < Hd; r++) {
      let c = 0;
      while (c < Wd) {
        if (SOLID_SET.has(g[r][c])) {
          const mat = g[r][c];
          let c2 = c;
          while (c2 + 1 < Wd && g[r][c2 + 1] === mat) c2++;
          runs.push({ r0: r, c0: c, c1: c2, mat });
          c = c2 + 1;
        } else c++;
      }
    }
    const solids = [];
    const used = new Array(runs.length).fill(false);
    for (let i = 0; i < runs.length; i++) {
      if (used[i]) continue;
      const a = runs[i];
      let r1 = a.r0, scan = true;
      while (scan) {
        scan = false;
        for (let j = i + 1; j < runs.length; j++) {
          if (!used[j] && runs[j].r0 === r1 + 1 && runs[j].c0 === a.c0 && runs[j].c1 === a.c1 && runs[j].mat === a.mat) {
            used[j] = true; r1++; scan = true; break;
          }
        }
      }
      solids.push({
        x: (a.c0 + a.c1 + 1) / 2, w: a.c1 - a.c0 + 1,
        y: Hd - (a.r0 + r1 + 1) / 2, h: r1 - a.r0 + 1, mat: a.mat
      });
    }
    const oneWays = [], spikes = [];
    for (let r = 0; r < Hd; r++) {
      let c = 0;
      while (c < Wd) {
        const ch = g[r][c];
        if (ch === '=' || ch === '^') {
          let c2 = c;
          while (c2 + 1 < Wd && g[r][c2 + 1] === ch) c2++;
          const len = c2 - c + 1, cx = (c + c2 + 1) / 2;
          if (ch === '=') oneWays.push({ x: cx, y: Hd - r - 0.15, w: len, h: 0.3 });
          else spikes.push({ x: cx, y: Hd - r - 1 + 0.3, w: len - 0.3, h: 0.6, tiles: [c, c2, r] });
          c = c2 + 1;
        } else c++;
      }
    }
    const tops = [], bottoms = [];
    for (let r = 0; r < Hd; r++) for (let c = 0; c < Wd; c++) {
      if (solid(c, r) && !solid(c, r - 1) && r > 1) tops.push({ c, r, x: c + 0.5, y: Hd - r, mat: g[r][c] });
      if (solid(c, r) && !solid(c, r + 1) && r < Hd - 2) bottoms.push({ c, r, x: c + 0.5, y: Hd - r - 1 });
    }
    return { solids, oneWays, spikes, tops, bottoms, grid: g, Wd, Hd };
  }

  // ---- smooth/curvy terrain: trace each material's outline, round it (Chaikin), fill it ----
  function chaikin(pts, iters) {
    for (let it = 0; it < iters; it++) {
      const out = [], n = pts.length;
      for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[(i + 1) % n];
        out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
        out.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
      }
      pts = out;
    }
    return pts;
  }
  function terrainLoops(g, Wd, Hd, mat) {
    const is = (c, r) => r >= 0 && r < Hd && c >= 0 && c < Wd && g[r][c] === mat;
    const edges = [];                                    // unit boundary segments in grid space
    for (let r = 0; r <= Hd; r++) for (let c = 0; c < Wd; c++) if (is(c, r - 1) !== is(c, r)) edges.push([[c, r], [c + 1, r]]);
    for (let c = 0; c <= Wd; c++) for (let r = 0; r < Hd; r++) if (is(c - 1, r) !== is(c, r)) edges.push([[c, r], [c, r + 1]]);
    const key = p => p[0] + ',' + p[1];
    const adj = new Map();
    edges.forEach((e, i) => e.forEach(p => { const k = key(p); (adj.get(k) || adj.set(k, []).get(k)).push(i); }));
    const usedE = new Array(edges.length).fill(false), loops = [];
    for (let i = 0; i < edges.length; i++) {
      if (usedE[i]) continue;
      const loop = []; let cur = edges[i][0], ei = i, guard = 0;
      while (ei >= 0 && !usedE[ei] && guard++ < edges.length * 2 + 10) {
        usedE[ei] = true;
        const e = edges[ei];
        loop.push({ x: cur[0], y: cur[1] });
        cur = (key(e[0]) === key(cur)) ? e[1] : e[0];
        const cand = (adj.get(key(cur)) || []).filter(j => !usedE[j]);
        ei = cand.length ? cand[0] : -1;
      }
      if (loop.length >= 4) loops.push(loop);
    }
    return loops;
  }
  function buildSmoothTerrain(parsed, pal, group, matFor) {
    const { grid, Wd, Hd } = parsed;
    for (const ch in TERRAIN_MATS) {
      const md = TERRAIN_MATS[ch];
      if (!md.smooth) continue;                // only the smooth-variant tiles get rounded silhouettes
      const loops = terrainLoops(grid, Wd, Hd, ch);
      if (!loops.length) continue;
      const shapes = loops.map(loop => {
        const sm = chaikin(loop, 3);
        const s = new THREE.Shape();
        sm.forEach((p, i) => { const wx = p.x, wy = Hd - p.y; i ? s.lineTo(wx, wy) : s.moveTo(wx, wy); });
        s.closePath();
        return s;
      });
      const geo = new THREE.ShapeGeometry(shapes);
      const mesh = new THREE.Mesh(geo, matFor(md.col(pal)));
      mesh.position.z = -1.2;
      group.add(mesh);
    }
  }

  // ============================ ROOM LOAD ============================
  // derive a cinematic colour-grade for the post pipeline from a biome's palette,
  // so each biome reads with its own mood (ember warm, frost cool, fungal pink, ...)
  function gradeFor(pal) {
    const c = new THREE.Color(pal.light || pal.glow || 0xffffff);
    const m = Math.max(c.r, c.g, c.b) || 1;
    c.multiplyScalar(1 / m);                                   // normalise to brightest channel
    const tint = new THREE.Color(1, 1, 1).lerp(c, 0.16);       // a gentle wash, not a heavy cast
    return {
      tint, exposure: 1.05, contrast: 1.05, saturation: 1.14,
      bloom: pal.rays ? 0.72 : 0.56, vignette: 0.46, grain: 0
    };
  }

  W.load = function (id, spawnId) {
    if (G.room) {
      G.scene.remove(G.room.group);
      U.disposeDeep(G.room.group);
      G.FX.clearAnims();
      // leaving a room drops any boss bar / boss music from it (e.g. you fled the arena)
      if (G.UI && G.UI.setBoss) G.UI.setBoss(null);
      if (G.Audio && G.Audio.setBoss) G.Audio.setBoss(false);
    }
    const def = G.LEVELS[id];
    if (!def) throw new Error('No level: ' + id);
    // stamp any procedural buildings into the def once (walls/floors as tiles + interior props)
    if (def.buildings && !def._built) { for (const b of def.buildings) W.genBuilding(def, b); def._built = true; }
    // a lookTrigger may have re-themed this room (biome/grade/weather/water); clear it when
    // we move to a different room
    if (G.lookOverride && G.lookOverride.id !== id) G.lookOverride = null;
    const lo = (G.lookOverride && G.lookOverride.id === id) ? G.lookOverride : null;
    const biome = (lo && lo.biome) ? lo.biome : def.biome;
    const pal = PAL[biome] || PAL.verdant;
    if (G.Post) G.Post.setGradeRate(3);   // snappy by default; lookTriggers slow it for fades
    const parsed = parseLevel(def);
    const rng = U.mulberry32(id.length * 7919 + def.w * 131 + def.h);
    const group = new THREE.Group();
    const room = G.room = {
      id, def, pal, group, entities: [], anims: [], shaderMats: [],
      w: def.w, h: def.h, ambT: 0
    };

    G.Physics.setRoom(parsed.solids.slice(), parsed.oneWays, parsed.spikes.map(s => ({ x: s.x, y: s.y, w: s.w, h: s.h })));

    // per-level weather (rain / wind / fog / snow / embers …) — affects the look & water
    const weather = (lo && lo.weather !== undefined) ? lo.weather : (def.weather || 'none');
    const gradeOv = (lo && lo.grade) ? lo.grade : def.grade;
    const waterOv = (lo && lo.water !== undefined) ? lo.water : (def.water || null);
    if (G.Weather) G.Weather.set(weather);
    const fogMul = (G.Weather && G.Weather.props().fog) ? (1 - 0.45 * G.Weather.props().fog) : 1;
    G.scene.fog = new THREE.Fog(pal.fog, pal.fogNear * fogMul, pal.fogFar * fogMul);
    G.renderer.setClearColor(pal.bgBottom);
    if (G.Post) {
      let g = gradeFor(pal);
      if (G.Weather) g = G.Weather.gradeFor(g);
      G.Post.setGrade(g);
      if (gradeOv) G.Post.setGrade(gradeOv);       // explicit grade override wins
      G.Post.setWater(waterOv);                     // reflective water / wet floor surface
    }
    room.biome = biome;
    room.lookState = { biome, grade: gradeOv || null, weather, water: waterOv || null };
    if (G.EventGraph) G.EventGraph.load(def.graph || null);   // per-room visual-scripting graph
    // dynamic lighting: a gentle, slightly biome-tinted ambient that keeps the (often very
    // dark) gameplay art clearly visible — lights then brighten pools on top.
    if (G.Lights) {
      G.Lights.clear();
      const a = new THREE.Color(pal.light); const mx = Math.max(a.r, a.g, a.b) || 1;
      a.multiplyScalar(1 / mx); a.lerp(new THREE.Color(1, 1, 1), 0.55).multiplyScalar(0.82);
      G.Lights.setAmbient(a);
      // per-room dynamic-lighting overrides (editable in the editor's Level settings)
      if (G.Post) {
        G.Post.lightStrength = def.lightStrength != null ? def.lightStrength : 1;
        G.Post.lightRim = def.lightRim != null ? def.lightRim : 0.55;
        G.Post.shadows = def.shadows !== false;
      }
      // build the terrain occluder field this room casts soft shadows from
      if (G.Lights.buildSDF) {
        const res = 3, tw = def.w * res, th = def.h * res, Hd = def.h, gr = parsed.grid;
        const occ = new Uint8Array(tw * th);
        for (let j = 0; j < th; j++) for (let i = 0; i < tw; i++) {
          const c = (i + 0.5) / res | 0, r = Hd - 1 - ((j + 0.5) / res | 0);
          const ch = (gr[r] && gr[r][c]) || ' ';
          if (SOLID_SET.has(ch)) occ[j * tw + i] = 1;
        }
        G.Lights.buildSDF(occ, tw, th, def.w, def.h);
      }
    }

    // ---- backdrop ----
    const bgPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(def.w + 260, def.h + 200),
      new THREE.MeshBasicMaterial({ map: gradientTex(pal.bgTop, pal.bgBottom, pal.light), fog: false })
    );
    bgPlane.position.set(def.w / 2, def.h / 2, -80);
    group.add(bgPlane);
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(def.w + 170, def.h + 120),
      new THREE.MeshBasicMaterial({ map: wallTex(pal, rng), fog: true })
    );
    wall.position.set(def.w / 2, def.h / 2, -48);
    group.add(wall);
    buildLayer(group, def, pal, -30, rng);
    buildLayer(group, def, pal, -18, rng);
    buildLayer(group, def, pal, -9, rng);

    // light pools
    {
      const nPools = Math.max(3, (def.w / 14) | 0);
      for (let i = 0; i < nPools; i++) {
        const gl = U.glowSprite(pal.light, U.lerp(16, 30, rng()), U.lerp(0.05, 0.1, rng()));
        const lx = U.lerp(4, def.w - 4, rng()), ly = U.lerp(def.h * 0.45, def.h * 1.05, rng());
        gl.position.set(lx, ly, -4);
        group.add(gl);
        if (G.Lights) G.Lights.add({ x: lx, y: ly, color: pal.light, radius: U.lerp(20, 34, rng()), intensity: 0.4, flicker: 0.08 });
        const ph = rng() * 9, base = gl.material.opacity;
        room.anims.push(t => { gl.material.opacity = base * (0.8 + 0.2 * Math.sin(t * 0.3 + ph)); });
      }
    }
    // god rays (biome default)
    if (pal.rays) {
      const rt = rayTex();
      for (let i = 0; i < 4; i++) {
        const rw = U.lerp(3, 7, rng()), rh = U.lerp(14, 24, rng());
        const rm = new THREE.Mesh(
          new THREE.PlaneGeometry(rw, rh),
          new THREE.MeshBasicMaterial({ map: rt, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, color: pal.light, fog: false })
        );
        rm.position.set(U.lerp(6, def.w - 6, rng()), def.h - rh * 0.42, -5.5);
        rm.rotation.z = U.lerp(-0.22, -0.08, rng());
        group.add(rm);
        const ph = rng() * 9;
        room.anims.push(t => { rm.material.opacity = 0.07 + 0.05 * (0.5 + 0.5 * Math.sin(t * 0.4 + ph)); });
      }
    }

    // ---- terrain (coloured per material) ----
    const terrMatCache = {};
    const terrMatFor = col => terrMatCache[col] || (terrMatCache[col] = new THREE.MeshBasicMaterial({ color: col, fog: false }));
    const terrMat = terrMatFor(pal.terrain);   // also reused by one-ways below
    // hard materials render as blocks; smooth materials get rounded contours (both can mix)
    for (const s of parsed.solids) {
      const md = TERRAIN_MATS[s.mat] || TERRAIN_MATS['#'];
      if (md.smooth) continue;
      const box = new THREE.Mesh(new THREE.BoxGeometry(s.w, s.h, 1.6), terrMatFor(md.col(pal)));
      box.position.set(s.x, s.y, -1.2);
      group.add(box);
    }
    buildSmoothTerrain(parsed, pal, group, terrMatFor);
    for (const o of parsed.oneWays) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(o.w, 0.26, 1.2), terrMat);
      slab.position.set(o.x, o.y, -1.0);
      group.add(slab);
    }

    // ---- gameplay-layer foliage ----
    const fol = FoliageBatch(-0.3);
    const tileRng = U.mulberry32(def.w * 977 + 13);
    for (const t of parsed.tops) {
      if (!(TERRAIN_MATS[t.mat] || TERRAIN_MATS['#']).foliage) continue;   // dirt/rock/etc. get no grass
      const jit = tileRng() * 0.07;
      const mossC = U.colLerp(pal.mossDark, pal.moss, 0.3 + tileRng() * 0.7);
      fol.quad(t.x - 0.5, t.y - 0.05, t.x + 0.5, t.y + 0.16 + jit, mossC, tileRng() * 9, 0.02, 0);
      const rimC = U.colLerp(pal.moss, pal.glow, 0.45 + tileRng() * 0.3);
      fol.quad(t.x - 0.5, t.y + 0.12 + jit, t.x + 0.5, t.y + 0.19 + jit, rimC, tileRng() * 9, 0.02, 0);
      const blades = 2 + (tileRng() * 3 | 0);
      for (let i = 0; i < blades; i++) {
        const bx = t.x - 0.42 + tileRng() * 0.84;
        const bh = 0.3 + tileRng() * 0.6;
        const bc = U.colLerp(pal.moss, pal.glow, tileRng() * 0.55);
        fol.blade(bx, t.y + 0.1, bh, 0.1 + tileRng() * 0.09, (tileRng() - 0.5) * 0.5, bc, tileRng() * 9, 0.05 + tileRng() * 0.1);
      }
    }
    for (const o of parsed.oneWays) {
      fol.quad(o.x - o.w / 2, o.y + 0.1, o.x + o.w / 2, o.y + 0.24, U.colLerp(pal.mossDark, pal.moss, 0.6), 0, 0.02, 0);
      fol.quad(o.x - o.w / 2, o.y + 0.18, o.x + o.w / 2, o.y + 0.24, U.colLerp(pal.moss, pal.glow, 0.4), 0, 0.02, 0);
    }
    for (const b of parsed.bottoms) {
      if (tileRng() < 0.18) {
        const len = 1 + tileRng() * 3;
        const segs = Math.ceil(len / 0.5);
        const ph = tileRng() * 9;
        const vc = U.colLerp(pal.mossDark, 0x000000, 0.25);
        let px = b.x + (tileRng() - 0.5) * 0.6;
        for (let i = 0; i < segs; i++) {
          const y1 = b.y - i * 0.5, y0 = y1 - 0.52;
          fol.quad(px - 0.06, y0, px + 0.06, y1, vc, ph, 0.05 + ((i + 1) / segs) * 0.3, 0.05 + (i / segs) * 0.3);
        }
        fol.tri([px - 0.18, b.y - len], [px + 0.18, b.y - len], [px, b.y - len - 0.4], vc, ph, [0.35, 0.35, 0.4]);
      }
    }
    const spikeDark = U.colLerp(pal.terrain, 0xffffff, 0.06);
    for (const sp of parsed.spikes) {
      const [c0, c1, r] = sp.tiles;
      for (let c = c0; c <= c1; c++) {
        const baseX = c + 0.5, baseY = def.h - r - 1;
        fol.spike(baseX - 0.22, baseY, 0.85, 0.42, spikeDark, 0x9aabb0);
        fol.spike(baseX + 0.2, baseY, 0.6, 0.34, spikeDark, 0x9aabb0);
      }
    }
    const folBuilt = fol.build();
    if (folBuilt) { group.add(folBuilt.mesh); room.shaderMats.push(folBuilt.mat); }

    // glow flowers
    let flowerCount = 0;
    for (const t of parsed.tops) {
      if (tileRng() < 0.05 && flowerCount < 14) {
        flowerCount++;
        const fg = new THREE.Group();
        fg.position.set(t.x, t.y, -0.25);
        fg.add(U.flat(U.poly([[-0.03, 0], [0.03, 0], [0.01, 0.5], [-0.01, 0.5]]), pal.mossDark, {}));
        fg.add(U.flat(U.ellipse(0.18, 0.24), pal.glow, { additive: true, opacity: 0.9, y: 0.58 }));
        const gl = U.glowSprite(pal.glow, 2.4, 0.3);
        gl.position.y = 0.58;
        fg.add(gl);
        group.add(fg);
        const ph = tileRng() * 9;
        room.anims.push(tt => { gl.material.opacity = 0.25 + 0.12 * Math.sin(tt * 1.3 + ph); });
      }
    }

    // ---- foreground ----
    {
      const fgMat = new THREE.MeshBasicMaterial({ color: 0x020405, fog: false, side: THREE.DoubleSide });
      const fg = new THREE.Group();
      fg.position.z = 5;
      const frng = U.mulberry32(def.w * 31 + 7);
      let x = -10;
      while (x < def.w + 10) {
        if (frng() < 0.6) {
          const len = U.lerp(2, 6, frng());
          const m = new THREE.Mesh(new THREE.ShapeGeometry(U.poly([[-0.22, 0], [0.22, 0], [(frng() - 0.5) * 1.5 + 0.06, -len], [(frng() - 0.5) * 1.5 - 0.06, -len]]), 3), fgMat);
          m.position.set(x, def.h + 2 + frng() * 2, 0);
          fg.add(m);
        }
        x += U.lerp(2, 6, frng());
      }
      for (let i = 0; i < 5; i++) {
        const nx = U.lerp(-6, def.w + 6, frng());
        const m = new THREE.Mesh(new THREE.ShapeGeometry(U.splineShape([[nx - 5, -6], [nx - 3, -1 + frng() * 1.6], [nx, 0.2 + frng()], [nx + 3, -1 + frng() * 1.6], [nx + 5, -6]]), 8), fgMat);
        m.position.set(0, -1.5, 0);
        fg.add(m);
      }
      group.add(fg);
      room.foreground = fg;
    }

    // ---- ambient motes ----
    const motes = buildMotes(def, pal.dust, Math.min(160, (def.w * def.h / 8) | 0), [0.05, 0.16], [-2, 2.5], 0.5);
    group.add(motes.pts);
    room.shaderMats.push(motes.mat);

    // ---- props & enemies from data (respecting the active / set-active system) ----
    for (const p of (def.props || [])) {
      if (p.type === 'wings' && G.save.wings) continue;
      const mk = mkProp[p.type];
      if (!mk) continue;
      const on = W.isActive(id, p);
      if (!on && !G.EDITOR && p.oid == null) continue;   // truly gone — no trigger can ever revive it
      const ent = mk(p, pal);
      ent.oid = p.oid;
      room.entities.push(ent);
      if (!on) {
        if (G.EDITOR) ent.editorInactive = true;          // editor keeps it visible (dimmed) so you can re-enable it
        else W.setEntityActive(ent, false);               // game: hidden + inert until a trigger flips it
      }
    }
    for (const e of (def.enemies || [])) {
      const on = W.isActive(id, e);
      if (!on && !G.EDITOR && e.oid == null) continue;
      const ent = G.Enemies.make(e.type, e.x, e.y);
      if (!ent) continue;
      ent.oid = e.oid;
      room.entities.push(ent);
      if (!on) {
        if (G.EDITOR) ent.editorInactive = true;
        else W.setEntityActive(ent, false);
      }
    }
    for (const e of room.entities) if (e.group) group.add(e.group);

    // ---- transitions ----
    room.zones = (def.transitions || []).map(tz => {
      let rect;
      if (tz.rect) rect = tz.rect;
      else if (tz.side === 'L') rect = { x: 0.4, y: def.h / 2, w: 0.9, h: def.h };
      else if (tz.side === 'R') rect = { x: def.w - 0.4, y: def.h / 2, w: 0.9, h: def.h };
      else if (tz.side === 'T') rect = { x: (tz.x0 + tz.x1 + 1) / 2, y: def.h - 0.4, w: tz.x1 - tz.x0 + 1, h: 1.6 };
      else rect = { x: (tz.x0 + tz.x1 + 1) / 2, y: 0.5, w: tz.x1 - tz.x0 + 1, h: 2 };
      return { rect, to: tz.to, spawn: tz.spawn, oid: tz.oid, active: W.isActive(id, tz) };
    });

    G.scene.add(group);
    G.Audio.setArea(pal.root);

    // visited tracking for the world map
    if (G.save) {
      G.save.visited = G.save.visited || {};
      if (!G.save.visited[id]) {
        G.save.visited[id] = true;
        if (G.Main && G.Main.persist) G.Main.persist();
      }
    }

    const sp = (def.spawns && (def.spawns[spawnId] || def.spawns.P)) || { x: 5, y: def.h / 2 };
    return { x: sp.x, y: sp.y + 0.25 };
  };

  // ============================ ROOM UPDATE ============================
  W.update = function (dt) {
    const room = G.room;
    if (!room) return;
    for (const m of room.shaderMats) {
      m.uniforms.uT.value = G.time;
      if (m.uniforms.uPx) m.uniforms.uPx.value = G.pxScale || 600;
    }
    for (const fn of room.anims) fn(G.time);
    if (!G.EDITOR) {
      for (let i = room.entities.length - 1; i >= 0; i--) {
        const e = room.entities[i];
        if (e._inactive) continue;       // inactive objects don't run, collide or animate
        e.update(dt);
        if (e.dead) {
          if (e.group) { room.group.remove(e.group); U.disposeDeep(e.group); }
          room.entities.splice(i, 1);
        }
      }
    }
    // ambient area particles
    room.ambT -= dt;
    if (room.ambT <= 0) {
      room.ambT = 0.5;
      const cx = G.camera.position.x, cy = G.camera.position.y;
      const a = room.pal.amb, pal = room.pal;
      if (a === 'leaf' && U.chance(0.8))
        G.FX.burst('leaf', cx + U.rand(-14, 14), cy + U.rand(4, 9), { color: U.colLerp(pal.moss, pal.glow, U.rand(0, 0.4)) });
      else if (a === 'spore' && U.chance(0.7))
        G.FX.burst('spore', cx + U.rand(-13, 13), cy + U.rand(-4, 8), { n: 2, color: 0x5f9fd4 });
      else if (a === 'sporePink' && U.chance(0.8))
        G.FX.burst('spore', cx + U.rand(-13, 13), cy + U.rand(-4, 8), { n: 2, color: 0xe87ac0 });
      else if (a === 'ember' && U.chance(0.8))
        G.FX.burst('ember', cx + U.rand(-13, 13), cy + U.rand(-6, 2), { color: 0xff9050 });
      else if (a === 'snow' && U.chance(0.95))
        for (let i = 0; i < 3; i++)
          G.FX.p(false, { x: cx + U.rand(-15, 15), y: cy + U.rand(5, 9), vx: U.rand(-0.8, 0.3), vy: U.rand(-2.2, -1), life: U.rand(4, 7), size: U.rand(0.08, 0.2), color: 0xeaf6ff, alpha: 0.85, swirl: U.rand(-0.8, 0.8) });
      else if (a === 'bubble' && U.chance(0.8))
        G.FX.p(true, { x: cx + U.rand(-13, 13), y: cy + U.rand(-7, 0), vx: U.rand(-0.2, 0.2), vy: U.rand(0.8, 1.8), life: U.rand(2.5, 5), size: U.rand(0.08, 0.22), color: 0x9ae8e0, alpha: 0.5, swirl: U.rand(-0.5, 0.5) });
      else if (a === 'pollen' && U.chance(0.8))
        G.FX.burst('mote', cx + U.rand(-12, 12), cy + U.rand(-5, 7), { color: pal.glow });
      else if (a === 'sparkle' && U.chance(0.8))
        G.FX.burst('mote', cx + U.rand(-12, 12), cy + U.rand(-3, 8), { color: pal.glow });
      else if (a === 'mote' && U.chance(0.6))
        G.FX.burst('mote', cx + U.rand(-12, 12), cy + U.rand(-2, 8), { color: pal.dust });

      // --- universal atmosphere: faint drifting haze on a soft wind (depth + bloom catch) ---
      const wind = Math.sin(G.time * 0.13) * 0.22 + Math.sin(G.time * 0.37) * 0.12;
      if (U.chance(0.6))
        G.FX.p(true, { x: cx + U.rand(-17, 17), y: cy + U.rand(-9, 10), vx: wind + U.rand(-0.12, 0.12), vy: U.rand(-0.04, 0.16), life: U.rand(4, 9), size: U.rand(0.04, 0.11), color: pal.light, alpha: U.rand(0.06, 0.2), swirl: U.rand(-0.25, 0.25) });
      // fireflies drift through the lush, ray-lit biomes
      if (pal.rays && U.chance(0.16))
        G.FX.p(true, { x: cx + U.rand(-13, 13), y: cy + U.rand(-3, 6), vx: U.rand(-0.3, 0.3) + wind, vy: U.rand(-0.1, 0.3), life: U.rand(3, 6), size: U.rand(0.12, 0.22), color: U.colLerp(pal.glow, 0xfff2c0, 0.5), alpha: U.rand(0.5, 0.9), swirl: U.rand(-1.2, 1.2) });
    }
    // transitions
    const p = G.player;
    if (!G.EDITOR && p && !p.dead && G.Main.state === 'play') {
      for (const z of room.zones) {
        if (z.active === false) continue;
        if (U.overlap(p.body, z.rect)) { G.Main.transition(z.to, z.spawn); break; }
      }
    }
  };
})();
