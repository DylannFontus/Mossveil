// MOSSVEIL — world.js : biomes, data-driven rooms, terrain & backdrop builders, props
(function () {
  const U = G.U;
  const W = G.World = {};

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
    }
  };
  // decor kinds the editor can place (standing vs hanging anchors)
  W.DECOR_KINDS = {
    standing: ['mushroom', 'tree', 'deadtree', 'thintree', 'fern', 'column', 'brokenPillar', 'arch', 'crystalSpire', 'coral', 'kelp', 'reed', 'ribs', 'thorn', 'hump'],
    hanging: ['stalactite', 'icicle', 'roots', 'lanterns']
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
  const mkProp = {};

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
      G.Physics.solids.push({ x: p.x, y: p.y + ch / 2, w: cw, h: ch });
    }
    return ent;
  };

  mkProp.light = p => {
    const grp = new THREE.Group();
    grp.position.set(p.x, p.y, p.z !== undefined ? p.z : -0.5);
    const col = p.color ? parseInt(p.color.replace('#', ''), 16) : 0xffeecc;
    const glow = U.glowSprite(col, p.scale || 8, p.opacity !== undefined ? p.opacity : 0.3);
    grp.add(glow);
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

  // ============================ TILE PARSING ============================
  function parseLevel(lvl) {
    const Wd = lvl.w, Hd = lvl.h;
    const g = [];
    for (let r = 0; r < Hd; r++) {
      const row = (lvl.tiles[r] || '');
      g.push(row.padEnd(Wd, ' ').split(''));
    }
    const solid = (c, r) => r >= 0 && r < Hd && c >= 0 && c < Wd && g[r][c] === '#';
    const runs = [];
    for (let r = 0; r < Hd; r++) {
      let c = 0;
      while (c < Wd) {
        if (g[r][c] === '#') {
          let c2 = c;
          while (c2 + 1 < Wd && g[r][c2 + 1] === '#') c2++;
          runs.push({ r0: r, c0: c, c1: c2 });
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
          if (!used[j] && runs[j].r0 === r1 + 1 && runs[j].c0 === a.c0 && runs[j].c1 === a.c1) {
            used[j] = true; r1++; scan = true; break;
          }
        }
      }
      solids.push({
        x: (a.c0 + a.c1 + 1) / 2, w: a.c1 - a.c0 + 1,
        y: Hd - (a.r0 + r1 + 1) / 2, h: r1 - a.r0 + 1
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
      if (solid(c, r) && !solid(c, r - 1) && r > 1) tops.push({ c, r, x: c + 0.5, y: Hd - r });
      if (solid(c, r) && !solid(c, r + 1) && r < Hd - 2) bottoms.push({ c, r, x: c + 0.5, y: Hd - r - 1 });
    }
    return { solids, oneWays, spikes, tops, bottoms };
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
    const pal = PAL[def.biome] || PAL.verdant;
    const parsed = parseLevel(def);
    const rng = U.mulberry32(id.length * 7919 + def.w * 131 + def.h);
    const group = new THREE.Group();
    const room = G.room = {
      id, def, pal, group, entities: [], anims: [], shaderMats: [],
      w: def.w, h: def.h, ambT: 0
    };

    G.Physics.setRoom(parsed.solids.slice(), parsed.oneWays, parsed.spikes.map(s => ({ x: s.x, y: s.y, w: s.w, h: s.h })));

    G.scene.fog = new THREE.Fog(pal.fog, pal.fogNear, pal.fogFar);
    G.renderer.setClearColor(pal.bgBottom);
    if (G.Post) { G.Post.setGrade(gradeFor(pal)); if (def.grade) G.Post.setGrade(def.grade); }   // per-level look override

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
        gl.position.set(U.lerp(4, def.w - 4, rng()), U.lerp(def.h * 0.45, def.h * 1.05, rng()), -4);
        group.add(gl);
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

    // ---- terrain ----
    const terrMat = new THREE.MeshBasicMaterial({ color: pal.terrain, fog: false });
    for (const s of parsed.solids) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(s.w, s.h, 1.6), terrMat);
      box.position.set(s.x, s.y, -1.2);
      group.add(box);
    }
    for (const o of parsed.oneWays) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(o.w, 0.26, 1.2), terrMat);
      slab.position.set(o.x, o.y, -1.0);
      group.add(slab);
    }

    // ---- gameplay-layer foliage ----
    const fol = FoliageBatch(-0.3);
    const tileRng = U.mulberry32(def.w * 977 + 13);
    for (const t of parsed.tops) {
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

    // ---- props & enemies from data ----
    for (const p of (def.props || [])) {
      if (p.type === 'wings' && G.save.wings) continue;
      const mk = mkProp[p.type];
      if (mk) room.entities.push(mk(p, pal));
    }
    for (const e of (def.enemies || [])) {
      const ent = G.Enemies.make(e.type, e.x, e.y);
      if (ent) room.entities.push(ent);
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
      return { rect, to: tz.to, spawn: tz.spawn };
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
        if (U.overlap(p.body, z.rect)) { G.Main.transition(z.to, z.spawn); break; }
      }
    }
  };
})();
