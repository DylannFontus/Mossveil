// MOSSVEIL — bosses.js : boss framework (5 rig archetypes, move library, 15 bosses)
(function () {
  const U = G.U;
  const B = G.Bosses = {};

  // ============================ RIGS ============================
  // Every rig returns { group, vis, head, eyes[], arms[], legs[], wings[], segs[], hands[], glow }
  function rigBeetle(c, s) {
    const grp = new THREE.Group(), vis = new THREE.Group();
    grp.add(vis);
    vis.scale.setScalar(s);
    vis.add(U.flat(U.splineShape([
      [-1.5, 0.2], [-1.35, 1.2], [-0.5, 1.85], [0.6, 1.8], [1.35, 1.1], [1.5, 0.15], [0.9, -0.4], [-0.9, -0.4]
    ]), c.body, {}));
    vis.add(U.flat(U.splineShape([
      [-1.45, 0.9], [-0.9, 1.75], [0.2, 2.0], [1.1, 1.6], [1.45, 0.9], [0.9, 1.15], [0, 1.35], [-0.9, 1.1]
    ]), c.accent, { z: 0.04 }));
    for (let i = 0; i < 7; i++) {
      const fx = -1.3 + i * 0.42;
      vis.add(U.flat(U.poly([[fx - 0.12, 0.95 + Math.sin(i) * 0.3], [fx + 0.12, 0.95 + Math.sin(i) * 0.3], [fx + U.rand(-0.15, 0.15), 1.6 + U.rand(0, 0.5)]]), c.accent2, { z: 0.05 }));
    }
    const legs = [];
    for (let i = 0; i < 4; i++) {
      const leg = U.flat(U.poly([[-0.09, 0], [0.09, 0], [0.07, -0.75], [-0.07, -0.75]]), U.colLerp(c.body, 0x000000, 0.4), { z: -0.02 });
      leg.position.set(-0.9 + i * 0.6, -0.25, -0.02);
      vis.add(leg);
      legs.push(leg);
    }
    const head = new THREE.Group();
    head.position.set(1.15, 1.05, 0.1);
    head.add(U.flat(U.splineShape([[-0.45, -0.1], [-0.5, 0.35], [-0.2, 0.62], [0.3, 0.6], [0.55, 0.25], [0.45, -0.25], [0, -0.4]]), c.bone, {}));
    head.add(U.flat(U.poly([[-0.35, 0.5], [-0.2, 0.55], [-0.42, 1.15]]), c.bone, { z: -0.01 }));
    head.add(U.flat(U.poly([[-0.05, 0.58], [0.12, 0.58], [0.04, 1.3]]), c.bone, { z: -0.01 }));
    head.add(U.flat(U.poly([[0.25, 0.52], [0.4, 0.46], [0.5, 1.05]]), c.bone, { z: -0.01 }));
    const eyeA = U.flat(U.ellipse(0.13, 0.18), c.glow, { z: 0.03, x: 0.06, y: 0.1, additive: true });
    const eyeB = U.flat(U.ellipse(0.11, 0.16), c.glow, { z: 0.03, x: 0.32, y: 0.06, additive: true });
    head.add(eyeA, eyeB);
    vis.add(head);
    const arms = [];
    [[0.15, U.colLerp(c.body, 0xffffff, 0.06)], [-0.04, U.colLerp(c.body, 0x000000, 0.3)]].forEach(([z, shade]) => {
      const arm = new THREE.Group();
      arm.position.set(0.85, 0.9, z);
      arm.add(U.flat(U.poly([[-0.1, 0.1], [0.12, 0.12], [0.5, -0.55], [0.3, -0.62]]), shade, {}));
      const fore = new THREE.Group();
      fore.position.set(0.42, -0.58, 0.01);
      fore.add(U.flat(U.splineShape([[0, 0.1], [0.5, 0.05], [1.15, 0.5], [1.5, 1.15], [1.28, 0.45], [0.6, -0.12], [0, -0.1]]), c.bone, {}));
      arm.add(fore);
      vis.add(arm);
      arms.push(arm);
    });
    const glow = U.glowSprite(c.glow, 12 * s, 0.16);
    glow.position.set(0, 1 * s, -0.1);
    grp.add(glow);
    return { group: grp, vis, head, eyes: [eyeA, eyeB], arms, legs, wings: [], segs: [], hands: [], glow };
  }

  function rigMantis(c, s) {
    const grp = new THREE.Group(), vis = new THREE.Group();
    grp.add(vis);
    vis.scale.setScalar(s);
    // tall slim thorax
    vis.add(U.flat(U.splineShape([[-0.55, -0.3], [-0.7, 0.8], [-0.35, 2.1], [0.35, 2.1], [0.7, 0.8], [0.55, -0.3], [0, -0.6]]), c.body, {}));
    vis.add(U.flat(U.splineShape([[-0.4, 1.2], [0, 2.0], [0.4, 1.2], [0, 1.5]]), c.accent, { z: 0.03 }));
    // cloak-ish drape
    vis.add(U.flat(U.splineShape([[-0.7, 0.9], [-1.15, -0.3], [-0.8, -0.55], [-0.5, 0.2]]), c.accent2, { z: -0.02 }));
    const legs = [];
    for (let i = 0; i < 2; i++) {
      const leg = U.flat(U.poly([[-0.1, 0], [0.1, 0], [0.26, -1.3], [0.06, -1.32]]), U.colLerp(c.body, 0x000000, 0.35), { z: -0.02 });
      leg.position.set(-0.3 + i * 0.55, -0.4, -0.02);
      vis.add(leg);
      legs.push(leg);
    }
    const head = new THREE.Group();
    head.position.set(0.15, 2.25, 0.08);
    head.add(U.flat(U.splineShape([[-0.42, -0.15], [-0.5, 0.3], [0, 0.55], [0.5, 0.3], [0.42, -0.15], [0, -0.32]]), c.bone, {}));
    head.add(U.flat(U.poly([[-0.3, 0.4], [-0.12, 0.46], [-0.55, 1.2]]), c.bone, { z: -0.01 }));
    head.add(U.flat(U.poly([[0.3, 0.4], [0.12, 0.46], [0.55, 1.2]]), c.bone, { z: -0.01 }));
    const eyeA = U.flat(U.ellipse(0.12, 0.17), c.glow, { z: 0.03, x: -0.16, y: 0.05, additive: true });
    const eyeB = U.flat(U.ellipse(0.12, 0.17), c.glow, { z: 0.03, x: 0.16, y: 0.05, additive: true });
    head.add(eyeA, eyeB);
    vis.add(head);
    const arms = [];
    [[0.12, c.accent], [-0.05, U.colLerp(c.accent, 0x000000, 0.35)]].forEach(([z, shade]) => {
      const arm = new THREE.Group();
      arm.position.set(0.35, 1.5, z);
      arm.add(U.flat(U.poly([[-0.08, 0.08], [0.1, 0.1], [0.6, -0.5], [0.42, -0.58]]), shade, {}));
      const fore = new THREE.Group();
      fore.position.set(0.52, -0.52, 0.01);
      fore.add(U.flat(U.splineShape([[0, 0.12], [0.7, 0.1], [1.6, 0.75], [2.0, 1.7], [1.75, 0.7], [0.8, -0.12], [0, -0.12]]), c.bone, {}));
      arm.add(fore);
      vis.add(arm);
      arms.push(arm);
    });
    const glow = U.glowSprite(c.glow, 11 * s, 0.15);
    glow.position.set(0, 1.4 * s, -0.1);
    grp.add(glow);
    return { group: grp, vis, head, eyes: [eyeA, eyeB], arms, legs, wings: [], segs: [], hands: [], glow };
  }

  function rigMoth(c, s) {
    const grp = new THREE.Group(), vis = new THREE.Group();
    grp.add(vis);
    vis.scale.setScalar(s);
    const wings = [];
    [[-1, -0.03], [1, -0.04]].forEach(([sd, z]) => {
      const w = new THREE.Group();
      w.position.set(sd * 0.25, 0.7, z);
      w.add(U.flat(U.splineShape([[0, 0], [sd * 1.6, 1.0], [sd * 2.4, 0.45], [sd * 1.9, -0.5], [sd * 0.6, -0.6]]), c.accent, {}));
      w.add(U.flat(U.ellipse(0.5, 0.35), c.glow, { x: sd * 1.5, y: 0.2, z: 0.02, additive: true, opacity: 0.5 }));
      vis.add(w);
      wings.push(w);
    });
    vis.add(U.flat(U.splineShape([[-0.55, 1.1], [-0.7, 0.1], [-0.4, -1.1], [0, -1.35], [0.4, -1.1], [0.7, 0.1], [0.55, 1.1], [0, 1.3]]), c.body, {}));
    for (let i = 0; i < 4; i++)
      vis.add(U.flat(U.poly([[-0.5 + i * 0.02, 0.6 - i * 0.45], [0.5 - i * 0.02, 0.6 - i * 0.45], [0.45 - i * 0.02, 0.42 - i * 0.45], [-0.45 + i * 0.02, 0.42 - i * 0.45]]), c.accent2, { z: 0.02 }));
    const head = new THREE.Group();
    head.position.set(0, 1.35, 0.08);
    head.add(U.flat(U.splineShape([[-0.38, -0.1], [-0.42, 0.25], [0, 0.5], [0.42, 0.25], [0.38, -0.1], [0, -0.28]]), c.bone, {}));
    head.add(U.flat(U.splineShape([[-0.15, 0.4], [-0.55, 1.0], [-0.8, 0.9], [-0.4, 0.45]]), c.bone, { z: -0.01 }));
    head.add(U.flat(U.splineShape([[0.15, 0.4], [0.55, 1.0], [0.8, 0.9], [0.4, 0.45]]), c.bone, { z: -0.01 }));
    const eyeA = U.flat(U.ellipse(0.12, 0.16), c.glow, { z: 0.03, x: -0.14, y: 0.08, additive: true });
    const eyeB = U.flat(U.ellipse(0.12, 0.16), c.glow, { z: 0.03, x: 0.14, y: 0.08, additive: true });
    head.add(eyeA, eyeB);
    vis.add(head);
    const glow = U.glowSprite(c.glow, 13 * s, 0.18);
    grp.add(glow);
    return { group: grp, vis, head, eyes: [eyeA, eyeB], arms: [], legs: [], wings, segs: [], hands: [], glow };
  }

  function rigSerpent(c, s) {
    const grp = new THREE.Group(), vis = new THREE.Group();
    grp.add(vis);
    const segs = [];
    for (let i = 7; i >= 1; i--) {
      const r = (0.85 - i * 0.09) * s;
      const seg = new THREE.Group();
      seg.add(U.flat(U.ellipse(r * 2, r * 1.7), U.colLerp(c.body, 0x000000, i * 0.04), {}));
      seg.add(U.flat(U.poly([[-r * 0.5, r * 0.6], [r * 0.5, r * 0.6], [0, r * 1.5]]), c.accent, { z: 0.01 }));
      seg.position.set(-i * 0.8 * s, 0, -0.01 * i);
      grp.add(seg);
      segs.unshift(seg);
    }
    vis.scale.setScalar(s);
    const head = new THREE.Group();
    head.add(U.flat(U.splineShape([[-0.8, -0.4], [-0.9, 0.4], [-0.2, 0.75], [0.75, 0.4], [1.0, 0], [0.7, -0.5], [-0.2, -0.7]]), c.body, {}));
    head.add(U.flat(U.splineShape([[0.2, 0.5], [0.9, 0.25], [1.05, -0.02], [0.6, -0.35], [0.95, 0.05]]), c.bone, { z: 0.02 }));
    head.add(U.flat(U.poly([[-0.35, 0.55], [-0.1, 0.62], [-0.55, 1.3]]), c.bone, { z: -0.01 }));
    head.add(U.flat(U.poly([[0.1, 0.6], [0.32, 0.58], [0.3, 1.4]]), c.bone, { z: -0.01 }));
    const eyeA = U.flat(U.ellipse(0.15, 0.2), c.glow, { z: 0.03, x: 0.25, y: 0.12, additive: true });
    head.add(eyeA);
    vis.add(head);
    const glow = U.glowSprite(c.glow, 12 * s, 0.16);
    grp.add(glow);
    return { group: grp, vis, head, eyes: [eyeA], arms: [], legs: [], wings: [], segs, hands: [], glow };
  }

  function rigGolem(c, s) {
    const grp = new THREE.Group(), vis = new THREE.Group();
    grp.add(vis);
    vis.scale.setScalar(s);
    // great floating mask
    vis.add(U.flat(U.splineShape([[-1.0, -0.7], [-1.15, 0.5], [-0.6, 1.25], [0.6, 1.25], [1.15, 0.5], [1.0, -0.7], [0, -1.15]]), c.bone, {}));
    vis.add(U.flat(U.poly([[-0.7, 1.0], [-0.4, 1.1], [-0.85, 2.0]]), c.bone, { z: -0.01 }));
    vis.add(U.flat(U.poly([[-0.12, 1.15], [0.12, 1.15], [0, 2.2]]), c.bone, { z: -0.01 }));
    vis.add(U.flat(U.poly([[0.7, 1.0], [0.4, 1.1], [0.85, 2.0]]), c.bone, { z: -0.01 }));
    // cracked rune lines
    vis.add(U.flat(U.poly([[-0.45, 0.3], [-0.35, 0.32], [-0.55, -0.5], [-0.62, -0.45]]), c.accent2, { z: 0.02 }));
    const eyeA = U.flat(U.ellipse(0.2, 0.3), c.glow, { z: 0.03, x: -0.4, y: 0.15, additive: true });
    const eyeB = U.flat(U.ellipse(0.2, 0.3), c.glow, { z: 0.03, x: 0.4, y: 0.15, additive: true });
    vis.add(eyeA, eyeB);
    // drape below mask
    vis.add(U.flat(U.splineShape([[-0.85, -0.8], [-0.6, -1.8], [0, -2.1], [0.6, -1.8], [0.85, -0.8], [0, -1.0]]), c.body, { z: -0.02 }));
    const hands = [];
    [-1, 1].forEach(sd => {
      const hand = new THREE.Group();
      hand.position.set(sd * 2.1 * s, -0.3 * s, 0.05);
      const h = new THREE.Group();
      h.scale.setScalar(s);
      h.add(U.flat(U.splineShape([[-0.5, -0.5], [-0.55, 0.3], [0, 0.65], [0.55, 0.3], [0.5, -0.5], [0, -0.7]]), c.accent, {}));
      for (let i = 0; i < 3; i++)
        h.add(U.flat(U.poly([[-0.3 + i * 0.3 - 0.08, -0.55], [-0.3 + i * 0.3 + 0.08, -0.55], [-0.3 + i * 0.3, -1.05]]), c.accent, { z: 0.01 }));
      hand.add(h);
      grp.add(hand);
      hands.push(hand);
    });
    const head = vis;
    const glow = U.glowSprite(c.glow, 14 * s, 0.18);
    grp.add(glow);
    return { group: grp, vis, head: new THREE.Group(), eyes: [eyeA, eyeB], arms: [], legs: [], wings: [], segs: [], hands, glow };
  }

  const RIGS = { beetle: rigBeetle, mantis: rigMantis, moth: rigMoth, serpent: rigSerpent, golem: rigGolem };

  // ============================ MOVE PARAMETERS (#10 — Attack/move editor) ============================
  // Every tunable number a move's start()/run() reads lives here so the FEEL of each attack
  // (telegraph, damage, projectile counts / speeds / spread, leap power, …) is authorable in the
  // editor without code. Overlay: data/moves.js -> G.MOVES_DATA; an empty overlay is byte-identical.
  // (Authoring NEW move TYPES still needs code — the start/run behaviours are bespoke.)
  const DEFAULT_MOVE_P = {
    leap: { tele: 0.5, power: 17, track: 1.05 },
    slash: { tele: 0.45, dmg: 1, reach: 1.9, w: 2.4, h: 2.6, speed: 10.5, dur: 0.5 },
    rain: { tele: 0.7, drops: 6, spacing: 2.2, grav: 12, speed: 2 },
    volley: { tele: 0.5, count: 3, spread: 0.22, speed: 10 },
    ring: { tele: 0.6, count: 10, speed: 7 },
    summon: { tele: 0.8, count: 2, cap: 4 },
    spikes: { tele: 0.55, columns: 3, spacing: 2.5, dmg: 1 },
    swoop: { tele: 0.4, speed: 15, dur: 1.0 },
    orbs: { tele: 0.6, count: 3, speed: 3, homing: 9, maxSpeed: 5.5 },
    burrow: { tele: 0.45, rise: 14, dmg: 1 }
  };
  // editor schema: per move, the fields to expose with label + sane slider range
  const MOVE_SCHEMA = {
    leap: [['tele', 'Telegraph (s)', 0.1, 1.5, 0.05], ['power', 'Jump power', 8, 26, 0.5], ['track', 'Aim tracking', 0, 2, 0.05]],
    slash: [['tele', 'Telegraph (s)', 0.1, 1.5, 0.05], ['dmg', 'Damage', 0, 4, 1], ['reach', 'Reach', 0.8, 4, 0.1], ['w', 'Hit width', 0.8, 5, 0.1], ['h', 'Hit height', 0.8, 5, 0.1], ['speed', 'Lunge speed', 0, 18, 0.5], ['dur', 'Duration (s)', 0.2, 1.2, 0.05]],
    rain: [['tele', 'Telegraph (s)', 0.1, 1.5, 0.05], ['drops', 'Drops', 1, 16, 1], ['spacing', 'Spacing', 0.8, 4, 0.1], ['grav', 'Fall gravity', 4, 24, 1]],
    volley: [['tele', 'Telegraph (s)', 0.1, 1.5, 0.05], ['count', 'Bolts', 1, 11, 1], ['spread', 'Spread (rad)', 0, 0.8, 0.02], ['speed', 'Bolt speed', 4, 18, 0.5]],
    ring: [['tele', 'Telegraph (s)', 0.1, 1.5, 0.05], ['count', 'Bolts', 4, 24, 1], ['speed', 'Bolt speed', 3, 14, 0.5]],
    summon: [['tele', 'Telegraph (s)', 0.1, 1.5, 0.05], ['count', 'Minions / cast', 1, 5, 1], ['cap', 'Room cap', 1, 8, 1]],
    spikes: [['tele', 'Telegraph (s)', 0.1, 1.5, 0.05], ['columns', 'Columns', 1, 7, 1], ['spacing', 'Spacing', 1, 5, 0.1], ['dmg', 'Damage', 0, 4, 1]],
    swoop: [['tele', 'Telegraph (s)', 0.1, 1.5, 0.05], ['speed', 'Dive speed', 6, 26, 0.5], ['dur', 'Duration (s)', 0.4, 2, 0.05]],
    orbs: [['tele', 'Telegraph (s)', 0.1, 1.5, 0.05], ['count', 'Orbs', 1, 7, 1], ['speed', 'Launch speed', 1, 8, 0.5], ['homing', 'Homing', 0, 18, 0.5], ['maxSpeed', 'Max speed', 2, 10, 0.5]],
    burrow: [['tele', 'Telegraph (s)', 0.1, 1.5, 0.05], ['rise', 'Erupt power', 8, 22, 0.5], ['dmg', 'Damage', 0, 4, 1]]
  };
  const MOVE_P = JSON.parse(JSON.stringify(DEFAULT_MOVE_P));
  function applyMoveData(d) {
    for (const id in DEFAULT_MOVE_P) MOVE_P[id] = Object.assign({}, DEFAULT_MOVE_P[id], (d && d[id]) || {});
  }

  // ============================ MOVE LIBRARY ============================
  // each move: { tele: seconds, start(bs), run(bs,dt) -> true when finished }
  const MOVES = {
    leap: {
      tele: 0.5,
      start(bs) {
        const p = G.player, b = bs.body, mp = MOVE_P.leap;
        const vy = mp.power, t = (2 * vy) / 50;
        b.vy = vy;
        b.vx = U.clamp((((p ? p.body.x : b.x) - b.x) / t) * mp.track, -15, 15);
        bs.noGravity = false;
        G.Audio.sfx('dash');
      },
      run(bs, dt) {
        const b = bs.body;
        if (b.onGround && b.vy <= 0) {
          b.vx = 0;
          G.Audio.sfx('stomp');
          G.FX.shake(0.45, 0.5);
          G.FX.hitStop(0.05);
          G.FX.burst('land', b.x, b.y - bs.halfH);
          G.FX.burst('spore', b.x, b.y, { n: 10, color: bs.cfg.colors.glow });
          G.FX.ring(b.x, b.y - bs.halfH * 0.6, { r1: 4, life: 0.4, color: bs.cfg.colors.glow, alpha: 0.5 });
          G.Enemies.spawnShockwave(b.x - 1.5, b.y - bs.halfH, -1, bs.cfg.colors.glow);
          G.Enemies.spawnShockwave(b.x + 1.5, b.y - bs.halfH, 1, bs.cfg.colors.glow);
          return true;
        }
        return false;
      }
    },
    slash: {
      tele: 0.45,
      start(bs) { bs.mv.t = MOVE_P.slash.dur; bs.mv.s1 = bs.mv.s2 = false; G.Audio.sfx('swing'); },
      run(bs, dt) {
        const b = bs.body, p = G.player, mp = MOVE_P.slash;
        b.vx = bs.dir * mp.speed * (bs.fly ? 0.9 : 1);
        bs.mv.t -= dt;
        const el = mp.dur - bs.mv.t;
        if (el > 0.12 && !bs.mv.s1) {
          bs.mv.s1 = true;
          G.FX.slash(b.x + bs.dir * 1.8, b.y + 0.4, bs.dir > 0 ? -0.4 : Math.PI + 0.4, true, bs.cfg.colors.glow);
        }
        if (el > 0.3 && !bs.mv.s2) {
          bs.mv.s2 = true;
          G.FX.slash(b.x + bs.dir * 1.9, b.y + 0.7, bs.dir > 0 ? 0.4 : Math.PI - 0.4, true, bs.cfg.colors.glow);
        }
        if (U.chance(dt * 28)) G.FX.ghost(bs.silGeo, b.x, b.y + 0.6, bs.dir, bs.cfg.colors.glow, 0.25);
        if (p && !p.dead && p.invulnT <= 0 && mp.dmg > 0) {
          const hz = { x: b.x + bs.dir * mp.reach, y: b.y + 0.3, w: mp.w, h: mp.h };
          if (U.overlap(hz, p.body)) p.damage(mp.dmg, b.x);
        }
        if (bs.mv.t <= 0 || (bs.dir > 0 && b.wallR) || (bs.dir < 0 && b.wallL)) { b.vx = 0; return true; }
        return false;
      }
    },
    rain: {
      tele: 0.7,
      start(bs) {
        G.Audio.sfx('roar');
        const px = G.player && !G.player.dead ? G.player.body.x : bs.body.x;
        const mp = MOVE_P.rain, n = mp.drops, c = (n - 1) / 2;
        for (let i = 0; i < n; i++) {
          const sx = U.clamp(px + (i - c) * mp.spacing + U.rand(-0.8, 0.8), 4, G.room.w - 4);
          G.Enemies.spawnProjectile({
            x: sx, y: G.room.h - 4 - U.rand(0, 2), vx: U.rand(-0.5, 0.5), vy: -mp.speed,
            grav: mp.grav, r: 0.3, color: bs.cfg.colors.glow, friendly: false, life: 5
          });
        }
        G.FX.burst('spore', bs.body.x, bs.body.y + 2, { n: 16, color: bs.cfg.colors.glow });
        bs.mv.t = 0.5;
      },
      run(bs, dt) { bs.mv.t -= dt; return bs.mv.t <= 0; }
    },
    volley: {
      tele: 0.5,
      start(bs) {
        const p = G.player, b = bs.body;
        const tx = p && !p.dead ? p.body.x : b.x + bs.dir * 5;
        const ty = p && !p.dead ? p.body.y + 0.4 : b.y;
        const base = Math.atan2(ty - b.y - 0.8, tx - b.x);
        const mp = MOVE_P.volley, n = mp.count, c = (n - 1) / 2;
        for (let i = 0; i < n; i++) {
          const a = base + (i - c) * mp.spread;
          G.Enemies.spawnProjectile({ x: b.x + Math.cos(a), y: b.y + 0.8 + Math.sin(a), vx: Math.cos(a) * mp.speed, vy: Math.sin(a) * mp.speed, r: 0.27, color: bs.cfg.colors.glow, friendly: false, life: 3 });
        }
        G.Audio.sfx('spell');
        bs.mv.t = 0.35;
      },
      run(bs, dt) { bs.mv.t -= dt; return bs.mv.t <= 0; }
    },
    ring: {
      tele: 0.6,
      start(bs) {
        const b = bs.body, mp = MOVE_P.ring, n = mp.count;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * U.TAU;
          G.Enemies.spawnProjectile({ x: b.x + Math.cos(a) * 0.8, y: b.y + 0.8 + Math.sin(a) * 0.8, vx: Math.cos(a) * mp.speed, vy: Math.sin(a) * mp.speed, r: 0.24, color: bs.cfg.colors.glow, friendly: false, life: 2.5 });
        }
        G.Audio.sfx('roar');
        G.FX.ring(b.x, b.y + 0.8, { r1: 3, life: 0.4, color: bs.cfg.colors.glow, alpha: 0.7 });
        bs.mv.t = 0.4;
      },
      run(bs, dt) { bs.mv.t -= dt; return bs.mv.t <= 0; }
    },
    summon: {
      tele: 0.8,
      start(bs) {
        const alive = G.room.entities.filter(e => e.isEnemy && e.alive && e !== bs).length;
        const mp = MOVE_P.summon, n = mp.count, c = (n - 1) / 2;
        if (alive < mp.cap) {
          for (let i = 0; i < n; i++) {
            const ent = G.Enemies.make(bs.cfg.minion || 'sporeling', bs.body.x + (i - c) * 4, bs.body.y + 1.5);
            if (ent) {
              G.Enemies._addToRoom(ent);
              G.FX.burst('spore', ent.body.x, ent.body.y, { n: 8, color: bs.cfg.colors.glow });
            }
          }
        }
        G.Audio.sfx('roar');
        bs.mv.t = 0.5;
      },
      run(bs, dt) { bs.mv.t -= dt; return bs.mv.t <= 0; }
    },
    spikes: {
      tele: 0.55,
      start(bs) {
        const p = G.player;
        const px = p && !p.dead ? p.body.x : bs.body.x;
        const mp = MOVE_P.spikes, n = mp.columns, c = (n - 1) / 2;
        bs.mv.cols = [];
        for (let j = 0; j < n; j++) bs.mv.cols.push(U.clamp(px + (j - c) * mp.spacing, 3, G.room.w - 3));
        bs.mv.t = 0.55;
        bs.mv.fired = false;
        bs.mv.cols.forEach(x => {
          // find ground below player height
          let gy = p && !p.dead ? p.body.y : bs.body.y;
          while (gy > 1 && !G.Physics.groundBelow(x, gy, 0.6)) gy -= 0.5;
          G.FX.burst('dust', x, gy, { n: 5 });
        });
        bs.mv.gy = p && !p.dead ? p.body.y : bs.body.y;
      },
      run(bs, dt) {
        bs.mv.t -= dt;
        if (bs.mv.t <= 0 && !bs.mv.fired) {
          bs.mv.fired = true;
          bs.mv.t = 0.45;
          G.Audio.sfx('stomp');
          G.FX.shake(0.2, 0.3);
          for (const x of bs.mv.cols) {
            let gy = bs.mv.gy;
            while (gy > 1 && !G.Physics.groundBelow(x, gy, 0.6)) gy -= 0.5;
            for (let i = 0; i < 8; i++)
              G.FX.p(true, { x: x + U.rand(-0.4, 0.4), y: gy + U.rand(0, 0.5), vx: U.rand(-1, 1), vy: U.rand(6, 13), life: U.rand(0.3, 0.5), size: U.rand(0.25, 0.5), color: bs.cfg.colors.glow });
            G.FX.ring(x, gy + 1, { r1: 1.6, life: 0.3, color: bs.cfg.colors.glow, alpha: 0.6 });
            const p = G.player;
            if (p && !p.dead && p.invulnT <= 0 && MOVE_P.spikes.dmg > 0 && Math.abs(p.body.x - x) < 0.9 && p.body.y - gy < 3 && p.body.y > gy - 1)
              p.damage(MOVE_P.spikes.dmg, x + 0.01);
          }
        }
        return bs.mv.fired && bs.mv.t <= 0;
      }
    },
    swoop: {
      tele: 0.4,
      start(bs) {
        const p = G.player, b = bs.body;
        const tx = p && !p.dead ? p.body.x : b.x, ty = p && !p.dead ? p.body.y + 0.3 : b.y - 4;
        const dx = tx - b.x, dy = ty - b.y;
        const d = Math.hypot(dx, dy) || 1;
        const mp = MOVE_P.swoop;
        b.vx = (dx / d) * mp.speed; b.vy = (dy / d) * mp.speed;
        bs.mv.t = mp.dur;
        bs.noGravity = true;
        G.Audio.sfx('dash');
      },
      run(bs, dt) {
        const b = bs.body;
        bs.mv.t -= dt;
        if (U.chance(dt * 30)) G.FX.ghost(bs.silGeo, b.x, b.y, bs.dir, bs.cfg.colors.glow, 0.22);
        if (bs.mv.t < 0.35) { b.vy = U.damp(b.vy, 6, 4, dt); b.vx *= 1 - dt * 2; }
        if (bs.mv.t <= 0 || b.onGround) { return true; }
        return false;
      }
    },
    orbs: {
      tele: 0.6,
      start(bs) {
        const b = bs.body, mp = MOVE_P.orbs;
        for (let i = 0; i < mp.count; i++) {
          const a = U.rand(0, U.TAU);
          G.Enemies.spawnProjectile({
            x: b.x + Math.cos(a) * 1.2, y: b.y + 0.8 + Math.sin(a) * 1.2,
            vx: Math.cos(a) * mp.speed, vy: Math.sin(a) * mp.speed, r: 0.3,
            color: bs.cfg.colors.glow, friendly: false, life: 4.5, homing: mp.homing, maxSpeed: mp.maxSpeed
          });
        }
        G.Audio.sfx('spell');
        bs.mv.t = 0.4;
      },
      run(bs, dt) { bs.mv.t -= dt; return bs.mv.t <= 0; }
    },
    burrow: {
      tele: 0.45,
      start(bs) {
        bs.mv.phase = 'sink';
        bs.mv.t = 0.5;
        G.FX.burst('dust', bs.body.x, bs.body.y - bs.halfH, { n: 12 });
        G.Audio.sfx('stomp');
      },
      run(bs, dt) {
        const b = bs.body, p = G.player;
        bs.mv.t -= dt;
        if (bs.mv.phase === 'sink') {
          bs.rig.group.position.y -= dt * 6;
          bs.rig.group.visible = bs.mv.t > 0.1;
          if (bs.mv.t <= 0) {
            bs.mv.phase = 'wait'; bs.mv.t = 0.6;
            b.x = p && !p.dead ? p.body.x : b.x;
          }
        } else if (bs.mv.phase === 'wait') {
          if (U.chance(dt * 30)) G.FX.burst('dust', b.x + U.rand(-0.6, 0.6), b.y - bs.halfH, { n: 2 });
          if (bs.mv.t <= 0) {
            bs.mv.phase = 'rise'; bs.mv.t = 0.4;
            bs.rig.group.visible = true;
            b.vy = MOVE_P.burrow.rise;
            G.Audio.sfx('roar');
            G.FX.shake(0.3, 0.3);
            G.FX.burst('land', b.x, b.y - bs.halfH);
            G.FX.ring(b.x, b.y, { r1: 3, life: 0.35, color: bs.cfg.colors.glow, alpha: 0.6 });
            if (p && !p.dead && p.invulnT <= 0 && MOVE_P.burrow.dmg > 0 && Math.abs(p.body.x - b.x) < 1.6 && Math.abs(p.body.y - b.y) < 3)
              p.damage(MOVE_P.burrow.dmg, b.x + 0.01);
          }
        } else {
          if (bs.mv.t <= 0 && b.onGround) return true;
          if (bs.mv.t <= -1) return true;
        }
        return false;
      }
    }
  };

  // ============================ BOSS CONFIGS (15) ============================
  // Built-in boss roster (the FALLBACK). Externalised to data/bosses.js (window.G.BOSS_DATA),
  // authored by the Boss designer. Move names (leap/slash/rain/volley/ring/summon/spikes/swoop/orbs/
  // burrow) and rigs (beetle/mantis/moth/serpent/golem) stay in code; configs compose them as data.
  const DEFAULT_CFG = {
    mossSovereign: { name: 'MOSS SOVEREIGN', rig: 'beetle', mode: 'ground', hp: 30, scale: 1, colors: { body: 0x18231c, accent: 0x2e5238, accent2: 0x3f7048, bone: 0xd8d2c0, glow: 0x9fffc0 }, moves: ['leap', 'slash'], moves2: ['leap', 'slash', 'rain'] },
    thornbackAlpha: { name: 'THORNBACK ALPHA', rig: 'beetle', mode: 'ground', hp: 26, scale: 0.9, colors: { body: 0x1c2415, accent: 0x47602a, accent2: 0x5e7e34, bone: 0xc8c0a0, glow: 0xcfe87a }, moves: ['slash', 'spikes'], moves2: ['slash', 'spikes', 'leap'] },
    sporefather: { name: 'SPOREFATHER', rig: 'beetle', mode: 'ground', hp: 34, scale: 1.15, colors: { body: 0x261622, accent: 0x6a3458, accent2: 0x8a4670, bone: 0xe0c8d4, glow: 0xff9ad8 }, moves: ['rain', 'summon'], moves2: ['rain', 'summon', 'ring'], minion: 'sporeling' },
    cindershell: { name: 'CINDERSHELL', rig: 'beetle', mode: 'ground', hp: 30, scale: 1.05, colors: { body: 0x241008, accent: 0x6e2c12, accent2: 0x96401a, bone: 0xe8cdb0, glow: 0xffa050 }, moves: ['leap', 'volley'], moves2: ['leap', 'volley', 'spikes'] },
    marshfiend: { name: 'MARSHFIEND', rig: 'beetle', mode: 'ground', hp: 28, scale: 1, colors: { body: 0x1c2008, accent: 0x4e5c1c, accent2: 0x6a7c26, bone: 0xd4d0a8, glow: 0xd4e87a }, moves: ['leap', 'spikes'], moves2: ['leap', 'spikes', 'rain'] },
    gloomTyrant: { name: 'GLOOM TYRANT', rig: 'mantis', mode: 'ground', hp: 30, scale: 1, colors: { body: 0x101a2c, accent: 0x24416a, accent2: 0x2e5288, bone: 0xc8d4e4, glow: 0x7cc7ff }, moves: ['slash', 'volley'], moves2: ['slash', 'volley', 'leap'] },
    paleMagistrate: { name: 'PALE MAGISTRATE', rig: 'mantis', mode: 'ground', hp: 28, scale: 0.95, colors: { body: 0x1a2422, accent: 0x3a5a4a, accent2: 0x4a7460, bone: 0xe4e0d0, glow: 0xc8e8d8 }, moves: ['slash', 'ring'], moves2: ['slash', 'ring', 'summon'], minion: 'gnatling' },
    crownlessKing: { name: 'THE CROWNLESS KING', rig: 'mantis', mode: 'ground', hp: 40, scale: 1.1, colors: { body: 0x14140e, accent: 0x4a4430, accent2: 0x6a6044, bone: 0xf0e8d0, glow: 0xffeeaa }, moves: ['slash', 'leap', 'ring'], moves2: ['slash', 'leap', 'ring', 'volley'], speed2: 1.4 },
    ashwingMatriarch: { name: 'ASHWING MATRIARCH', rig: 'moth', mode: 'fly', hp: 26, scale: 1, colors: { body: 0x241410, accent: 0x58291a, accent2: 0x7a3a22, bone: 0xe8d4c0, glow: 0xffb070 }, moves: ['swoop', 'rain'], moves2: ['swoop', 'rain', 'volley'] },
    duskweaver: { name: 'DUSKWEAVER', rig: 'moth', mode: 'fly', hp: 28, scale: 1.05, colors: { body: 0x1a1028, accent: 0x402a66, accent2: 0x55388a, bone: 0xdcd0ec, glow: 0xc9a0ff }, moves: ['swoop', 'orbs'], moves2: ['swoop', 'orbs', 'summon'], minion: 'driftwisp' },
    frostboundWarden: { name: 'FROSTBOUND WARDEN', rig: 'golem', mode: 'fly', hp: 32, scale: 1, colors: { body: 0x16222e, accent: 0x2e4a62, accent2: 0x40678a, bone: 0xe8f2fa, glow: 0xd0f0ff }, moves: ['volley', 'ring'], moves2: ['volley', 'ring', 'spikes'] },
    bonelordErevax: { name: 'BONELORD EREVAX', rig: 'golem', mode: 'fly', hp: 34, scale: 1.1, colors: { body: 0x201c14, accent: 0x4c4434, accent2: 0x6a6048, bone: 0xf0e8d0, glow: 0xe8dcc0 }, moves: ['ring', 'spikes'], moves2: ['ring', 'spikes', 'orbs'] },
    auricSentinel: { name: 'AURIC SENTINEL', rig: 'golem', mode: 'fly', hp: 30, scale: 0.95, colors: { body: 0x0e2228, accent: 0x1e4e54, accent2: 0x2a6e70, bone: 0xd8f4ec, glow: 0x90ffe8 }, moves: ['volley', 'orbs'], moves2: ['volley', 'orbs', 'ring'] },
    tidemaw: { name: 'TIDEMAW', rig: 'serpent', mode: 'fly', hp: 30, scale: 1, colors: { body: 0x0c2a30, accent: 0x1e5a62, accent2: 0x2a7e84, bone: 0xd0ecE4 & 0xffffff, glow: 0x8ae8e0 }, moves: ['swoop', 'volley'], moves2: ['swoop', 'volley', 'orbs'] },
    veilserpentYssa: { name: 'VEILSERPENT YSSA', rig: 'serpent', mode: 'fly', hp: 28, scale: 0.95, colors: { body: 0x180f2a, accent: 0x3c2a62, accent2: 0x523a86, bone: 0xe0d4f0, glow: 0xc9a0ff }, moves: ['swoop', 'ring'], moves2: ['swoop', 'ring', 'rain'] }
  };
  // boss epithets shown under the name on the cinematic name card
  const DEFAULT_EPITHETS = {
    mossSovereign: 'Warden of the Green Tomb', thornbackAlpha: 'First of the Bramble',
    sporefather: 'He Who Seeds the Dark', cindershell: 'Ember of the Deep Forge',
    marshfiend: 'Drowned King of the Mire', gloomTyrant: 'Sovereign of the Blue Hollow',
    paleMagistrate: 'Keeper of Pale Law', crownlessKing: 'Throne Without a Head',
    ashwingMatriarch: 'Mother of Cinders', duskweaver: 'Spinner of the Failing Light',
    frostboundWarden: 'Sentinel of the Rime', bonelordErevax: 'Lord of the Ossuary',
    auricSentinel: 'The Gilded Eye', tidemaw: 'Hunger of the Tides',
    veilserpentYssa: 'She Who Coils the Veil'
  };

  // ---- boss roster data overlay (data/bosses.js -> G.BOSS_DATA) ----
  const BOSS_COLOR_KEYS = ['body', 'accent', 'accent2', 'bone', 'glow'];
  const bossToNum = v => typeof v === 'string' ? (parseInt(v.replace('#', ''), 16) || 0) : (v | 0);
  let CFG = B.CONFIGS = {}, EPITHETS = B.EPITHETS = {};
  function normCfg(c) {
    const colors = {}; const sc = (c.colors || {});
    BOSS_COLOR_KEYS.forEach(k => colors[k] = bossToNum(sc[k] != null ? sc[k] : 0xffffff));
    const o = {
      name: c.name || 'BOSS', rig: RIGS[c.rig] ? c.rig : 'beetle', mode: c.mode === 'fly' ? 'fly' : 'ground',
      hp: +c.hp || 30, scale: +c.scale || 1, colors,
      moves: (Array.isArray(c.moves) && c.moves.length ? c.moves : ['leap', 'slash']).filter(m => MOVES[m]),
      moves2: (Array.isArray(c.moves2) && c.moves2.length ? c.moves2 : c.moves || ['leap', 'slash', 'rain']).filter(m => MOVES[m])
    };
    if (c.minion) o.minion = c.minion;
    if (c.speed2) o.speed2 = +c.speed2;
    if (!o.moves.length) o.moves = ['slash'];
    if (!o.moves2.length) o.moves2 = o.moves.slice();
    return o;
  }
  function serCfg(c) {
    const colors = {}; BOSS_COLOR_KEYS.forEach(k => colors[k] = '#' + ((c.colors[k] >>> 0) & 0xffffff).toString(16).padStart(6, '0'));
    const o = { name: c.name, rig: c.rig, mode: c.mode, hp: c.hp, scale: c.scale, colors, moves: c.moves.slice(), moves2: c.moves2.slice() };
    if (c.minion) o.minion = c.minion; if (c.speed2) o.speed2 = c.speed2;
    return o;
  }
  function applyBossData(data) {
    const d = data || G.BOSS_DATA || null;
    CFG = {}; for (const id in DEFAULT_CFG) CFG[id] = normCfg(DEFAULT_CFG[id]);
    EPITHETS = Object.assign({}, DEFAULT_EPITHETS);
    if (d) {
      if (d.configs) for (const id in d.configs) CFG[id] = normCfg(d.configs[id]);
      if (d.epithets) Object.assign(EPITHETS, d.epithets);
    }
    if (!CFG.mossSovereign) CFG.mossSovereign = normCfg(DEFAULT_CFG.mossSovereign);
    B.CONFIGS = CFG; B.EPITHETS = EPITHETS;
    B.LIST = Object.keys(CFG).map(id => ({ id, label: CFG[id].name }));
    B.RIG_NAMES = Object.keys(RIGS); B.MOVE_NAMES = Object.keys(MOVES);
  }
  B.applyBossData = applyBossData;
  B.exportBossDefaults = () => { const cfgs = {}; for (const id in DEFAULT_CFG) cfgs[id] = serCfg(normCfg(DEFAULT_CFG[id])); return { configs: cfgs, epithets: Object.assign({}, DEFAULT_EPITHETS) }; };
  B.exportBossCurrent = () => { const cfgs = {}; for (const id in CFG) cfgs[id] = serCfg(CFG[id]); return { configs: cfgs, epithets: Object.assign({}, EPITHETS) }; };
  applyBossData();

  // ---- move parameters (#10) ----
  B.applyMoveData = applyMoveData;
  B.exportMoveDefaults = () => JSON.parse(JSON.stringify(DEFAULT_MOVE_P));
  B.exportMoveCurrent = () => JSON.parse(JSON.stringify(MOVE_P));
  B.MOVE_PARAMS = () => MOVE_P;
  B.MOVE_SCHEMA = MOVE_SCHEMA;
  // which bosses (by id+label) use a given move in either phase
  B.movesUsedBy = id => B.LIST.filter(b => { const c = CFG[b.id]; return c && ((c.moves || []).includes(id) || (c.moves2 || []).includes(id)); });
  applyMoveData(G.MOVES_DATA);

  // ============================ PREVIEW (for the editor) ============================
  B.preview = typeId => {
    const cfg = CFG[typeId] || CFG.mossSovereign;
    const rig = RIGS[cfg.rig](cfg.colors, cfg.scale);
    return rig.group;
  };

  // ============================ SPAWN & UPDATE ============================
  B.spawn = (typeId, x, y, gates, saveKey, hurtBox) => {
    const cfg = CFG[typeId] || CFG.mossSovereign;
    const rig = RIGS[cfg.rig](cfg.colors, cfg.scale);
    const fly = cfg.mode === 'fly';
    const bs = {
      type: 'boss', isEnemy: true, alive: true, dead: false, noStagger: true,
      hp: cfg.hp, maxHp: cfg.hp, fly,
      gibColor: cfg.colors.accent,
      body: { x, y: y + (fly ? 2 : 0.5), w: 2.7 * cfg.scale, h: 2.5 * cfg.scale, vx: 0, vy: 0 },
      hurtBox: hurtBox || null,                         // editor-authored attack hit area (resizes how easily it's struck)
      halfH: 1.25 * cfg.scale,
      cfg, rig, gates, typeId, saveKey: saveKey || (G.room.id + ':' + typeId),
      group: rig.group,
      state: 'intro', t: 1.6, phase: 1, dir: -1,
      staggerAcc: 0, deathT: 0, mv: {}, move: null, lastMove: '',
      noGravity: fly,
      hoverY: y + 3,
      silGeo: new THREE.ShapeGeometry(U.ellipse(2.8 * cfg.scale, 2.4 * cfg.scale), 12),
      trail: [],
      hurt(d, dir) {
        if (!this.alive) return;
        this.hp -= d;
        this.staggerAcc += d;
        U.flashGroup(this.group, 0.06);
        G.Audio.sfx('bossHurt');
        if (this.hp <= 0) { startDeath(this); return; }
        if (this.hp <= this.maxHp / 2 && this.phase === 1) {
          this.phase = 2;
          this.state = 'roar'; this.t = 1.0; this.move = null;
          G.Audio.sfx('roar');
          G.FX.shake(0.5, 0.8);
          G.FX.hitStop(0.18);
          G.FX.burst('spore', this.body.x, this.body.y + 1.5, { n: 30, color: cfg.colors.glow });
          G.FX.ring(this.body.x, this.body.y + 1, { r1: 6, life: 0.5, color: cfg.colors.glow, alpha: 0.7 });
          if (G.Post) { G.Post.flash(0.42, cfg.colors.glow); G.Post.punch(1.6); }
          if (G.Main.camPunch) G.Main.camPunch(2.2);
        } else if (this.staggerAcc >= 9 && this.state !== 'stagger' && !fly) {
          this.staggerAcc = 0;
          this.state = 'stagger'; this.t = 1.1; this.move = null;
          this.body.vx = 0;
        }
      },
      update(dt) { bossUpdate(this, dt); }
    };
    G.Enemies._addToRoom(bs);
    G.Audio.sfx('roar');
    G.Audio.setBoss(true);
    if (G.Audio.stinger) G.Audio.stinger('boss');
    G.FX.shake(0.3, 0.8);
    G.UI.bossTitle(cfg.name, EPITHETS[typeId]);
    G.UI.setBoss(bs);
    if (G.Post) G.Post.flash(0.28, cfg.colors.glow);
    if (G.Main.camPunch) G.Main.camPunch(1.6);
    return bs;
  };

  function startDeath(bs) {
    bs.alive = false;
    bs.state = 'death'; bs.deathT = 0;
    bs.body.vx = 0;
    bs.noGravity = false;
    G.Audio.sfx('roar');
    G.Audio.sfx('die');
    G.FX.hitStop(0.4);
    if (G.FX.slowMo) G.FX.slowMo(0.25, 1.6);          // dramatic slow-motion finish
    G.FX.shake(0.6, 1.1);
    G.FX.burst('death', bs.body.x, bs.body.y + 1);
    G.FX.ring(bs.body.x, bs.body.y + 1, { r1: 7, life: 0.6, color: bs.cfg.colors.glow, alpha: 0.8 });
    G.FX.ring(bs.body.x, bs.body.y + 1, { r1: 11, life: 0.9, color: 0xffffff, alpha: 0.5 });
    G.Audio.setBoss(false);
    G.UI.setBoss(null);
    if (G.Post) { G.Post.flash(0.6, 0xffffff); G.Post.punch(2.4); }
    if (G.Main.camPunch) G.Main.camPunch(2.8);
    if (G.Main.dropGlimmer) G.Main.dropGlimmer(bs.body.x, bs.body.y + 1, 40 + (Math.random() * 20 | 0));
  }

  function pickMove(bs) {
    const list = bs.phase === 2 ? (bs.cfg.moves2 || bs.cfg.moves) : bs.cfg.moves;
    let id = list[(Math.random() * list.length) | 0];
    if (list.length > 1 && id === bs.lastMove) id = list[(list.indexOf(id) + 1) % list.length];
    bs.lastMove = id;
    const p = G.player;
    if (p && !p.dead) bs.dir = p.body.x < bs.body.x ? -1 : 1;
    bs.state = 'tele';
    bs.t = MOVE_P[id].tele / (bs.phase === 2 ? (bs.cfg.speed2 || 1.25) : 1);
    bs.move = id;
    bs.mv = {};
    // telegraph: a warning pulse so the attack reads before it lands
    U.flashGroup(bs.group, 0.1);
    G.FX.ring(bs.body.x, bs.body.y + (bs.fly ? 0 : 0.8), { r0: 0.5, r1: 2.6, life: 0.28, color: bs.cfg.colors.glow, alpha: 0.5 });
  }

  function bossUpdate(bs, dt) {
    const b = bs.body, p = G.player, cfg = bs.cfg;
    const spd = bs.phase === 2 ? (cfg.speed2 || 1.25) : 1;
    bs.t -= dt * (bs.state === 'idle' ? spd : 1);

    // physics
    if (bs.state !== 'death') {
      if (bs.noGravity) {
        // hover: drift toward hover height
        if (bs.state === 'idle' || bs.state === 'tele' || bs.state === 'roar') {
          const tx = p && !p.dead ? p.body.x + (b.x > p.body.x ? 3.5 : -3.5) : b.x;
          b.vx = U.damp(b.vx, U.clamp((tx - b.x) * 1.2, -4, 4), 3, dt);
          b.vy = U.damp(b.vy, U.clamp((bs.hoverY + Math.sin(G.time * 1.4) * 0.6 - b.y) * 2, -4, 4), 3, dt);
        }
        b.x += b.vx * dt; b.y += b.vy * dt;
        b.x = U.clamp(b.x, 3, G.room.w - 3);
        b.y = U.clamp(b.y, 3, G.room.h - 3);
        b.onGround = false;
      } else {
        b.vy -= 50 * dt;
        G.Physics.move(b, dt);
      }
    }

    switch (bs.state) {
      case 'intro':
        if (bs.t <= 0) { bs.state = 'idle'; bs.t = 0.8; }
        break;
      case 'idle':
        if (!bs.noGravity) b.vx = U.damp(b.vx, 0, 6, dt);
        if (p && !p.dead) bs.dir = p.body.x < b.x ? -1 : 1;
        if (bs.t <= 0) pickMove(bs);
        break;
      case 'tele':
        if (!bs.noGravity) b.vx = 0;
        if (bs.t <= 0) {
          bs.state = 'exec';
          MOVES[bs.move].start(bs);
        }
        break;
      case 'exec':
        if (MOVES[bs.move].run(bs, dt)) {
          bs.noGravity = bs.fly;
          bs.state = 'idle';
          bs.t = U.rand(0.5, 1.0) / spd;
          bs.move = null;
        }
        break;
      case 'stagger':
        b.vx = U.damp(b.vx, 0, 8, dt);
        if (bs.t <= 0) { bs.state = 'idle'; bs.t = 0.4; }
        break;
      case 'roar':
        if (!bs.noGravity) b.vx = 0;
        if (bs.t <= 0) { bs.state = 'idle'; bs.t = 0.5; }
        break;
      case 'death': {
        bs.deathT += dt;
        b.vy -= 50 * dt;
        G.Physics.move(b, dt);
        bs.rig.vis.rotation.z = U.damp(bs.rig.vis.rotation.z, bs.dir * 0.5, 1.5, dt);
        bs.rig.glow.material.opacity = Math.max(0, 0.16 - bs.deathT * 0.08);
        if (U.chance(dt * 18))
          G.FX.burst('soul', b.x + U.rand(-1.4, 1.4), b.y + U.rand(0, 2), { n: 3 });
        if (U.chance(dt * 10))
          G.FX.burst('spore', b.x + U.rand(-1.4, 1.4), b.y + U.rand(0, 2), { n: 3, color: cfg.colors.glow });
        if (bs.deathT > 2.4 && !bs.deadDone) {
          bs.deadDone = true;
          bs.dead = true;
          G.FX.burst('death', b.x, b.y + 1);
          G.FX.burst('healPop', b.x, b.y + 1);
          G.FX.ring(b.x, b.y + 1, { r1: 9, life: 0.8, color: 0xffffff, alpha: 0.7 });
          G.FX.shake(0.4, 0.5);
          (bs.gates || []).forEach(g2 => g2.open());
          G.save.bosses = G.save.bosses || {};
          G.save.bosses[bs.saveKey] = true;
          if (G.EventGraph && G.EventGraph.bossDeath) G.EventGraph.bossDeath(bs.typeId);   // fire On Boss Death
          if (G.Main && G.Main.persist) G.Main.persist();
          G.UI.toast(cfg.name.charAt(0) + cfg.name.slice(1).toLowerCase() + ' has fallen.');
          if (G.player) G.player.gainSoul(99);
        }
        return;
      }
    }

    if (bs.state !== 'death') G.Enemies._contactPlayer(bs);

    // ---- generic animation ----
    const v = bs.rig.vis;
    v.scale.x = bs.dir * cfg.scale;
    const tele = bs.state === 'tele';
    let crouch = 1;
    if (tele) crouch = 0.88;
    if (bs.state === 'exec' && bs.move === 'leap') crouch = 1.12;
    v.scale.y = U.damp(v.scale.y, crouch * cfg.scale, 10, dt);
    v.position.y = Math.sin(G.time * 1.8) * 0.06 + (bs.fly ? Math.sin(G.time * 2.6) * 0.12 : 0);

    let headRot = Math.sin(G.time * 1.3) * 0.05;
    if (tele) headRot = -0.25;
    if (bs.state === 'stagger') headRot = 0.55;
    if (bs.state === 'roar') headRot = -0.5;
    bs.rig.head.rotation.z = U.damp(bs.rig.head.rotation.z, headRot, 8, dt);

    let armRot = Math.sin(G.time * 1.6) * 0.08 - 0.1;
    if (tele && (bs.move === 'slash' || bs.move === 'leap')) armRot = 1.4;
    if (bs.state === 'exec' && bs.move === 'slash') armRot = -1.2;
    if (bs.state === 'stagger') armRot = 0.7;
    if (bs.state === 'roar' || (tele && bs.move !== 'slash' && bs.move !== 'leap')) armRot = 1.1;
    bs.rig.arms.forEach((a, i) => {
      a.rotation.z = U.damp(a.rotation.z, armRot + i * 0.15, bs.state === 'exec' && bs.move === 'slash' ? 22 : 8, dt);
    });
    bs.rig.legs.forEach((l, i) => {
      l.rotation.z = Math.abs(b.vx) > 0.5 ? Math.sin(G.time * 14 + i * 1.8) * 0.4 : Math.sin(G.time * 2 + i) * 0.05;
    });
    bs.rig.wings.forEach((w, i) => {
      const flap = Math.sin(G.time * (bs.state === 'exec' ? 34 : 16) + i * 0.4);
      w.rotation.z = (i === 0 ? 1 : -1) * (0.25 + flap * 0.35);
    });
    bs.rig.hands.forEach((h, i) => {
      const sd = i === 0 ? -1 : 1;
      const hx = sd * 2.1 * cfg.scale + Math.sin(G.time * 1.7 + i * 2) * 0.3;
      const hy = -0.3 * cfg.scale + Math.cos(G.time * 1.5 + i * 1.4) * 0.4 + (tele ? 1.2 : 0);
      h.position.x = U.damp(h.position.x, hx, 5, dt);
      h.position.y = U.damp(h.position.y, hy, 5, dt);
      h.rotation.z = Math.sin(G.time * 1.2 + i) * 0.15;
    });
    // serpent trail
    if (bs.rig.segs.length) {
      bs.trail.unshift({ x: b.x, y: b.y });
      if (bs.trail.length > 80) bs.trail.pop();
      bs.rig.segs.forEach((seg, i) => {
        const idx = Math.min(bs.trail.length - 1, (i + 1) * 6);
        const tp = bs.trail[idx] || bs.trail[bs.trail.length - 1] || b;
        seg.position.set(tp.x - b.x, tp.y - b.y + Math.sin(G.time * 3 + i) * 0.15, -0.01 * (i + 1));
      });
    }
    const ek = (bs.phase === 2 ? 1.2 : 0.9);
    bs.rig.eyes.forEach(e2 => { e2.scale.setScalar(ek + Math.sin(G.time * 3) * 0.1); });

    bs.group.position.set(b.x, b.y - (bs.fly ? 0.4 : 0.9 * cfg.scale), -0.08);
  }
})();
