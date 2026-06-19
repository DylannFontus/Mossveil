// MOSSVEIL — player.js : the wanderer. controller + combat + procedural rig
(function () {
  const U = G.U;

  // tuning
  const RUN = 8.8, ACC = 90, DEC = 75, AIR_ACC = 60;
  const G_UP = 44, G_DOWN = 62, FALL_MAX = -21;
  const JUMP_V = 18, JUMP_CUT = 0.42, COYOTE = 0.1, BUFFER = 0.13;
  const WALL_SLIDE = -3.4, WJ_X = 9.8, WJ_Y = 15.5, WALL_LOCK = 0.14;
  const DASH_V = 23, DASH_T = 0.16, DASH_CD = 0.45;
  const ATK_CD = 0.36, ATK_ACTIVE0 = 0.02, ATK_ACTIVE1 = 0.13, POGO_V = 14.5;
  const MAX_HP = 5, SOUL_MAX = 99, SOUL_HIT = 12, FOCUS_COST = 33, FOCUS_TIME = 0.85, SPELL_COST = 33;
  const INVULN = 1.3;

  function buildRig(p) {
    const root = new THREE.Group();
    const vis = new THREE.Group();
    vis.scale.set(1.15, 1.15, 1);
    root.add(vis);

    const C_CLOAK = 0x2c3a46, C_CLOAK_IN = 0x3e5263, C_CLOAK_BK = 0x1c2730, C_BODY = 0x10151a, C_MASK = 0xe9e4d4;

    const glow = U.glowSprite(0xcfe8e0, 9, 0.32);
    glow.position.set(0, 0.2, -0.06);
    root.add(glow);
    p.glow = glow;

    // flutter wings (hidden normally)
    const wingL = U.flat(U.splineShape([[0, 0], [-0.75, 0.5], [-1.1, 0.15], [-0.65, -0.3], [0, -0.1]]), 0xeef4ff, { additive: true, opacity: 0.85 });
    const wingR = U.flat(U.splineShape([[0, 0], [0.75, 0.5], [1.1, 0.15], [0.65, -0.3], [0, -0.1]]), 0xeef4ff, { additive: true, opacity: 0.85 });
    wingL.position.set(-0.1, 0.45, 0.01); wingR.position.set(0.1, 0.45, 0.01);
    wingL.scale.setScalar(0); wingR.scale.setScalar(0);
    vis.add(wingL, wingR);
    p.wings = [wingL, wingR];

    const cloakBack = U.flat(U.splineShape([
      [-0.06, 0.72], [-0.46, 0.4], [-0.58, -0.15], [-0.4, -0.66], [0, -0.74],
      [0.4, -0.66], [0.58, -0.15], [0.46, 0.4], [0.06, 0.72]
    ]), C_CLOAK_BK, { z: 0.02 });
    vis.add(cloakBack);
    p.cloakBack = cloakBack;

    // legs
    const legGeo = U.poly([[-0.055, 0], [0.055, 0], [0.045, -0.34], [-0.045, -0.34]]);
    const legL = U.flat(legGeo, C_BODY, { z: 0.04 });
    const legR = U.flat(U.poly([[-0.055, 0], [0.055, 0], [0.045, -0.34], [-0.045, -0.34]]), C_BODY, { z: 0.05 });
    legL.position.set(-0.13, -0.42, 0.04);
    legR.position.set(0.13, -0.42, 0.05);
    vis.add(legL, legR);
    p.legL = legL; p.legR = legR;

    const body = U.flat(U.ellipse(0.42, 0.6), C_BODY, { z: 0.06, y: 0.05 });
    vis.add(body);

    const cloak = new THREE.Group();
    cloak.position.set(0, 0.55, 0.1);
    const cloakMain = U.flat(U.splineShape([
      [-0.04, 0.2], [-0.4, -0.05], [-0.5, -0.62], [-0.33, -1.18], [0, -1.27],
      [0.33, -1.18], [0.5, -0.62], [0.4, -0.05], [0.04, 0.2]
    ]), C_CLOAK, {});
    const cloakIn = U.flat(U.splineShape([
      [-0.02, 0.08], [-0.26, -0.12], [-0.32, -0.6], [-0.2, -1.02], [0, -1.08],
      [0.2, -1.02], [0.32, -0.6], [0.26, -0.12], [0.02, 0.08]
    ]), C_CLOAK_IN, { z: 0.02 });
    cloak.add(cloakMain, cloakIn);
    vis.add(cloak);
    p.cloak = cloak;

    // head
    const head = new THREE.Group();
    head.position.set(0, 0.72, 0.14);
    const mask = U.flat(U.splineShape([
      [-0.31, -0.02], [-0.36, 0.2], [-0.2, 0.43], [0.2, 0.43], [0.36, 0.2], [0.31, -0.02], [0, -0.1]
    ]), C_MASK, {});
    const hornL = U.flat(U.splineShape([
      [-0.13, 0.34], [-0.38, 0.5], [-0.6, 0.82], [-0.48, 0.44], [-0.28, 0.28]
    ]), C_MASK, { z: -0.01 });
    const hornR = U.flat(U.splineShape([
      [0.13, 0.34], [0.38, 0.5], [0.6, 0.82], [0.48, 0.44], [0.28, 0.28]
    ]), C_MASK, { z: -0.01 });
    const eyeL = U.flat(U.ellipse(0.105, 0.17), 0x17110b, { z: 0.02, x: -0.135, y: 0.13 });
    const eyeR = U.flat(U.ellipse(0.105, 0.17), 0x17110b, { z: 0.02, x: 0.135, y: 0.13 });
    const glintL = U.flat(U.ellipse(0.035, 0.05), 0xd9a066, { z: 0.03, x: -0.115, y: 0.17 });
    const glintR = U.flat(U.ellipse(0.035, 0.05), 0xd9a066, { z: 0.03, x: 0.155, y: 0.17 });
    head.add(mask, hornL, hornR, eyeL, eyeR, glintL, glintR);
    vis.add(head);
    p.head = head; p.eyes = [eyeL, eyeR];

    // silhouette geometry for dash ghosts
    p.silGeo = new THREE.ShapeGeometry(U.splineShape([
      [-0.05, 1.3], [-0.45, 0.9], [-0.6, 0.1], [-0.42, -0.7], [0, -0.8],
      [0.42, -0.7], [0.6, 0.1], [0.45, 0.9], [0.05, 1.3]
    ]), 10);

    p.vis = vis;
    return root;
  }

  function create(x, y) {
    const p = {
      body: { x, y, w: 0.62, h: 1.3, vx: 0, vy: 0, dropTimer: 0 },
      hp: MAX_HP, maxHp: MAX_HP, soul: 0,
      facing: 1, dead: false,
      hasWings: !!G.save.wings,
      // timers
      coyoteT: 0, jumpBufT: 0, jumpCut: false, wallLockT: 0,
      dashT: 0, dashCdT: 0, dashDir: 1, ghostT: 0,
      atkT: 0, atkCdT: 0, atkDir: 'side', atkHit: null, swingFlip: false,
      invulnT: 0, hurtT: 0, deathT: 0,
      focusT: 0, focusing: false, castPressT: -1,
      wingUsed: false, wingAnimT: 0,
      wallSliding: false, lastSafe: { x, y }, safeAccum: 0, spikeRespawnT: 0,
      bobPh: 0, blinkT: U.rand(2, 5), blinkAnim: 0, landAnim: 0, stretch: 1,
      gainSoul(n) {
        if (this.dead) return;
        this.soul = Math.min(SOUL_MAX, this.soul + n);
      },
      spendSoul(n) { this.soul = Math.max(0, this.soul - n); },
      damage(n, fromX) {
        if (this.dead || this.invulnT > 0) return false;
        this.hp -= n;
        this.cancelFocus();
        G.UI.onPlayerHurt();
        G.FX.hitStop(0.22);
        G.FX.shake(0.35, 0.4);
        G.FX.burst('spark', this.body.x, this.body.y + 0.3, { n: 14, color: 0xffffff });
        G.FX.ring(this.body.x, this.body.y + 0.3, { r1: 2.6, life: 0.3, color: 0xffffff });
        U.flashGroup(this.root, 0.1);
        if (this.hp <= 0) { this.die(); return true; }
        G.Audio.sfx('hurt');
        this.invulnT = INVULN;
        this.hurtT = 0.3;
        const dir = this.body.x < fromX ? -1 : 1;
        this.body.vx = dir * 9;
        this.body.vy = 7;
        this.dashT = 0;
        return true;
      },
      die() {
        if (this.dead) return;
        this.dead = true;
        this.deathT = 0;
        this.body.vx = 0; this.body.vy = 0;
        G.Audio.sfx('die');
        G.FX.shake(0.5, 0.6);
        G.FX.hitStop(0.3);
      },
      cancelFocus() {
        this.focusing = false; this.focusT = 0;
      },
      reset(x2, y2) {
        this.body.x = x2; this.body.y = y2;
        this.body.vx = 0; this.body.vy = 0;
        this.hp = this.maxHp;
        this.dead = false;
        this.invulnT = 0.3;
        this.lastSafe = { x: x2, y: y2 };
        this.root.visible = true;
        this.deathT = 0;
        this.hasWings = !!G.save.wings;
      }
    };
    p.root = buildRig(p);
    p.root.position.set(x, y, 0);
    G.scene.add(p.root);
    G.player = p;

    p.update = dt => update(p, dt);
    return p;
  }

  // ---------------- combat ----------------
  function doAttack(p) {
    const I = G.Input;
    p.atkCdT = ATK_CD;
    p.atkT = 0.0001;
    p.atkHit = new Set();
    p.swingFlip = !p.swingFlip;
    const b = p.body;
    if (I.down('up')) p.atkDir = 'up';
    else if (I.down('down') && !b.onGround) p.atkDir = 'down';
    else p.atkDir = 'side';
    G.Audio.sfx('swing');
    const ang = p.atkDir === 'up' ? Math.PI / 2 : p.atkDir === 'down' ? -Math.PI / 2 : (p.facing > 0 ? 0 : Math.PI);
    const ox = p.atkDir === 'side' ? p.facing * 1.0 : 0;
    const oy = p.atkDir === 'up' ? 1.25 : p.atkDir === 'down' ? -1.25 : 0.2;
    G.FX.slash(b.x + ox, b.y + oy, ang + (p.swingFlip ? 0.12 : -0.12), false);
  }

  function attackHitbox(p) {
    const b = p.body;
    if (p.atkDir === 'up') return { x: b.x, y: b.y + 1.45, w: 1.7, h: 1.6 };
    if (p.atkDir === 'down') return { x: b.x, y: b.y - 1.45, w: 1.55, h: 1.6 };
    return { x: b.x + p.facing * 1.2, y: b.y + 0.1, w: 2.05, h: 1.45 };
  }

  function resolveAttack(p, dt) {
    if (p.atkT <= 0) return;
    p.atkT += dt;
    if (p.atkT < ATK_ACTIVE0 || p.atkT > ATK_ACTIVE1 + 0.05) {
      if (p.atkT > ATK_CD) p.atkT = 0;
      return;
    }
    const hb = attackHitbox(p);
    let landed = false, pogo = false;
    for (const e of G.room.entities) {
      if (e.isEnemy && e.alive && !p.atkHit.has(e) && U.overlap(hb, e.body)) {
        p.atkHit.add(e);
        const kdir = p.atkDir === 'side' ? p.facing : (e.body.x >= p.body.x ? 1 : -1);
        e.hurt(1, kdir, p.atkDir);
        landed = true;
        if (p.atkDir === 'down') pogo = true;
        p.gainSoul(SOUL_HIT);
        G.FX.burst('spark', (hb.x + e.body.x) / 2, e.body.y + 0.2, { n: 9, dir: kdir });
        G.FX.burst('soul', e.body.x, e.body.y + 0.3, { n: 5 });
      }
      if (e.type === 'projectile' && !e.friendly && !e.dead && !p.atkHit.has(e) && U.overlap(hb, e.body)) {
        p.atkHit.add(e);
        e.pop();
        landed = true;
        if (p.atkDir === 'down') pogo = true;
      }
    }
    if (p.atkDir === 'down' && G.Physics.spikeTouch(hb)) pogo = true;
    if (pogo) {
      p.body.vy = POGO_V;
      p.jumpCut = false;
      p.wingUsed = false;
      p.dashCdT = Math.min(p.dashCdT, 0.05);
      G.Audio.sfx('pogo');
    }
    if (landed) {
      G.Audio.sfx('hit');
      G.FX.hitStop(0.06);
      G.FX.shake(0.07, 0.1);
      if (p.atkDir === 'side') p.body.vx -= p.facing * 1.5;
    } else if (p.atkT >= ATK_ACTIVE0 && p.atkT - dt < ATK_ACTIVE0 && p.atkDir === 'side') {
      // clink on walls
      const wx = p.body.x + p.facing * 1.5;
      if (G.Physics.pointSolid(wx, p.body.y + 0.1)) {
        G.Audio.sfx('clink');
        G.FX.burst('spark', p.body.x + p.facing * 1.1, p.body.y + 0.1, { n: 4, color: 0xfff0b0 });
      }
    }
  }

  // ---------------- main update ----------------
  function update(p, dt) {
    const I = G.Input, b = p.body;

    if (p.cinematic) return; // posed externally by the cutscene system

    if (p.dead) {
      p.deathT += dt;
      if (p.deathT < 0.5) {
        p.vis.rotation.z += dt * 4 * -p.facing;
      } else if (p.root.visible) {
        p.root.visible = false;
        G.FX.burst('death', b.x, b.y + 0.3);
        G.FX.ring(b.x, b.y + 0.3, { r1: 5, life: 0.5, color: 0xcfeaff });
      }
      if (p.deathT > 1.6) G.Main.onPlayerDeath();
      return;
    }

    // timers
    p.coyoteT -= dt; p.jumpBufT -= dt; p.dashCdT -= dt; p.atkCdT -= dt;
    p.invulnT -= dt; p.hurtT -= dt; p.wallLockT -= dt; p.blinkT -= dt;
    p.wingAnimT -= dt; p.landAnim -= dt;

    if (p.spikeRespawnT > 0) {
      p.spikeRespawnT -= dt;
      if (p.spikeRespawnT <= 0) {
        b.x = p.lastSafe.x; b.y = p.lastSafe.y;
        b.vx = 0; b.vy = 0;
        p.invulnT = Math.max(p.invulnT, 0.8);
      }
      p.root.position.set(b.x, b.y, 0);
      return; // frozen during spike reposition
    }

    const ax = I.axisX();
    const canControl = p.hurtT <= 0 && p.dashT <= 0;

    // facing
    if (ax !== 0 && canControl && p.atkT <= 0.06) p.facing = ax;

    // horizontal movement
    if (p.dashT > 0) {
      b.vx = p.dashDir * DASH_V;
      b.vy = 0;
      p.dashT -= dt;
      p.ghostT -= dt;
      if (p.ghostT <= 0) {
        p.ghostT = 0.03;
        G.FX.ghost(p.silGeo, b.x, b.y + 0.2, p.facing * 1.15);
      }
    } else if (canControl && p.wallLockT <= 0) {
      const target = ax * RUN;
      const acc = b.onGround ? (ax !== 0 ? ACC : DEC) : AIR_ACC;
      if (ax !== 0 || b.onGround) {
        if (b.vx < target) b.vx = Math.min(target, b.vx + acc * dt);
        else if (b.vx > target) b.vx = Math.max(target, b.vx - acc * dt);
      } else {
        // gentle air drag when no input
        b.vx = U.damp(b.vx, 0, 1.5, dt);
      }
    }

    // wall slide
    const pushingWall = (ax > 0 && b.wallR) || (ax < 0 && b.wallL);
    p.wallSliding = !b.onGround && pushingWall && b.vy < 0 && p.dashT <= 0;
    if (p.wallSliding) {
      if (b.vy < WALL_SLIDE) b.vy = U.damp(b.vy, WALL_SLIDE, 18, dt);
      p.wingUsed = false;
      if (U.chance(dt * 14)) G.FX.burst('dust', b.x + p.facing * 0.35, b.y - 0.2, { n: 1 });
    }

    // gravity
    if (p.dashT <= 0) {
      const g = b.vy > 0 && !p.jumpCut ? G_UP : G_DOWN;
      b.vy -= g * dt;
      if (b.vy < FALL_MAX) b.vy = FALL_MAX;
    }

    // jumping
    if (I.pressed('jump')) p.jumpBufT = BUFFER;
    if (I.pressed('jump') && I.down('down') && b.onOneWay) {
      b.dropTimer = 0.22; p.jumpBufT = 0;
    }
    if (p.jumpBufT > 0 && canControl) {
      if (b.onGround || p.coyoteT > 0) {
        b.vy = JUMP_V;
        p.jumpCut = false; p.jumpBufT = 0; p.coyoteT = 0;
        G.Audio.sfx('jump');
        G.FX.burst('dust', b.x, b.y - 0.6, { n: 4 });
        p.stretch = 1.25;
      } else if (p.wallSliding || (!b.onGround && (b.wallL || b.wallR))) {
        const dir = b.wallL ? 1 : -1;
        b.vx = dir * WJ_X; b.vy = WJ_Y;
        p.facing = dir;
        p.jumpCut = false; p.jumpBufT = 0;
        p.wallLockT = WALL_LOCK;
        G.Audio.sfx('jump');
        G.FX.burst('dust', b.x - dir * 0.3, b.y, { n: 5 });
        p.stretch = 1.25;
      } else if (p.hasWings && !p.wingUsed) {
        b.vy = JUMP_V * 0.82;
        p.wingUsed = true; p.jumpCut = false; p.jumpBufT = 0;
        p.wingAnimT = 0.4;
        G.Audio.sfx('wings');
        G.FX.ring(b.x, b.y - 0.4, { r1: 1.6, life: 0.3, color: 0xdfeaff, alpha: 0.5 });
        p.stretch = 1.2;
      }
    }
    if (I.released('jump') && b.vy > 0 && !p.jumpCut) {
      b.vy *= JUMP_CUT;
      p.jumpCut = true;
    }

    // dash
    if (I.pressed('dash') && p.dashCdT <= 0 && p.hurtT <= 0) {
      p.dashT = DASH_T; p.dashCdT = DASH_CD;
      p.dashDir = ax !== 0 ? ax : p.facing;
      p.facing = p.dashDir;
      p.jumpCut = true;
      p.cancelFocus();
      G.Audio.sfx('dash');
      G.FX.burst('dust', b.x, b.y - 0.4, { n: 5, dir: -p.dashDir });
    }

    // attack
    if (I.pressed('attack') && p.atkCdT <= 0 && p.hurtT <= 0) {
      p.cancelFocus();
      doAttack(p);
    }
    resolveAttack(p, dt);

    // cast / focus
    if (I.pressed('cast') && p.hurtT <= 0) {
      if (!b.onGround) { trySpell(p); p.castPressT = -1; }
      else p.castPressT = 0;
    }
    if (p.castPressT >= 0) {
      p.castPressT += dt;
      if (I.released('cast')) {
        if (p.castPressT < 0.22) trySpell(p);
        p.castPressT = -1;
      } else if (p.castPressT >= 0.22) {
        if (p.soul >= FOCUS_COST && p.hp < p.maxHp) {
          p.focusing = true; p.focusT = 0;
          G.Audio.sfx('focus');
        }
        p.castPressT = -1;
      }
    }
    if (p.focusing) {
      if (!I.down('cast') || !b.onGround || ax !== 0 || p.atkT > 0 || p.dashT > 0) {
        p.cancelFocus();
      } else {
        p.focusT += dt;
        if (U.chance(dt * 22)) G.FX.burst('heal', b.x, b.y + 0.3);
        p.glow.material.opacity = 0.22 + (p.focusT / FOCUS_TIME) * 0.5;
        if (p.focusT >= FOCUS_TIME) {
          p.cancelFocus();
          p.spendSoul(FOCUS_COST);
          p.hp = Math.min(p.maxHp, p.hp + 1);
          G.Audio.sfx('heal');
          G.FX.burst('healPop', b.x, b.y + 0.4);
          G.FX.ring(b.x, b.y + 0.4, { r1: 3, life: 0.45, color: 0xffffff });
          G.UI.onHeal();
        }
      }
    }

    // physics
    const wasGround = b.onGround;
    G.Physics.move(b, dt);
    if (b.onGround) {
      p.coyoteT = COYOTE;
      p.wingUsed = false;
      if (!wasGround) {
        const impact = Math.min(1, -b.vyLand / 25 || 0.4);
        G.FX.burst('land', b.x, b.y - 0.62);
        if (p.dashT <= 0) G.Audio.sfx('drop');
        p.landAnim = 0.18;
        p.stretch = 0.72;
      }
      p.safeAccum += dt;
      if (p.safeAccum > 0.25 && !G.Physics.spikeTouch({ x: b.x, y: b.y - 1, w: 2, h: 2 })) {
        p.lastSafe = { x: b.x, y: b.y + 0.05 };
      }
    } else {
      p.safeAccum = 0;
      b.vyLand = b.vy;
    }
    if (p.dashT > 0 && (b.wallL || b.wallR)) p.dashT = 0;

    // spikes
    if (p.invulnT <= 0 && G.Physics.spikeTouch(b)) {
      const died = p.hp <= 1;
      p.damage(1, b.x + 0.01);
      if (!died) p.spikeRespawnT = 0.4;
    }

    // out of bounds safety
    if (b.y < -6) {
      p.damage(1, b.x);
      if (!p.dead) { b.x = p.lastSafe.x; b.y = p.lastSafe.y; b.vx = 0; b.vy = 0; }
    }

    animate(p, dt);
    p.root.position.set(b.x, b.y, 0);
  }

  function trySpell(p) {
    if (p.soul < SPELL_COST) { G.Audio.sfx('soul'); return; }
    p.spendSoul(SPELL_COST);
    G.Audio.sfx('spell');
    G.Enemies.fireBolt(p.body.x + p.facing * 0.7, p.body.y + 0.35, p.facing);
    p.body.vx -= p.facing * 3;
    G.FX.shake(0.1, 0.12);
    G.FX.burst('soul', p.body.x + p.facing * 0.8, p.body.y + 0.35, { n: 6 });
  }

  // ---------------- procedural animation ----------------
  function animate(p, dt) {
    const b = p.body, v = p.vis;
    const speed = Math.abs(b.vx);
    const running = b.onGround && speed > 0.5;

    // squash & stretch toward 1
    p.stretch = U.damp(p.stretch, 1, 12, dt);
    let sy = p.stretch, sx = 1 / p.stretch;
    if (p.dashT > 0) { sx = 1.35; sy = 0.7; }
    if (p.wallSliding) { sx = 0.92; sy = 1.05; }
    v.scale.set(p.facing * sx * 1.15, sy * 1.15, 1);

    // body bob & lean
    p.bobPh += dt * (running ? speed * 2.2 : 2);
    const bob = running ? Math.abs(Math.sin(p.bobPh)) * 0.09 : Math.sin(p.bobPh) * 0.03;
    v.position.y = bob + (p.focusing ? -0.12 : 0);
    let lean = 0;
    if (running) lean = -p.facing * 0.12;
    if (p.dashT > 0) lean = -p.dashDir * 0.22;
    if (!b.onGround) lean = U.clamp(-b.vx * 0.012, -0.18, 0.18);
    if (p.wallSliding) lean = p.facing * 0.15;
    if (p.hurtT > 0) lean = p.facing * 0.35;
    v.rotation.z = U.damp(v.rotation.z, lean * p.facing, 14, dt); // facing-flip aware

    // cloak
    let cloakRot = 0, cloakSy = 1;
    if (running) cloakRot = 0.18 + Math.sin(p.bobPh * 0.5) * 0.06;
    if (!b.onGround) {
      cloakRot = U.clamp(b.vx * 0.02 * p.facing, -0.1, 0.25);
      cloakSy = U.clamp(1 + b.vy * 0.012, 0.8, 1.25);
      if (b.vy > 2) cloakSy = 0.8;
      if (b.vy < -3) { cloakSy = 1.15; cloakRot += 0.1; }
    }
    if (p.dashT > 0) { cloakRot = 0.5; cloakSy = 0.75; }
    if (p.focusing) { cloakRot = 0; cloakSy = 1.12; }
    p.cloak.rotation.z = U.damp(p.cloak.rotation.z, -cloakRot, 10, dt);
    p.cloak.scale.y = U.damp(p.cloak.scale.y, cloakSy, 8, dt);
    p.cloak.scale.x = U.damp(p.cloak.scale.x, p.focusing ? 1.15 : 1, 8, dt);
    p.cloakBack.rotation.z = p.cloak.rotation.z * 1.4 + Math.sin(G.time * 2.2) * 0.04;

    // head
    let headY = 0.72 + bob * 0.5, headRot = 0;
    if (p.atkT > 0 && p.atkT < 0.16) {
      headRot = p.atkDir === 'up' ? 0.3 : p.atkDir === 'down' ? -0.3 : 0.12;
    }
    if (p.focusing) { headY -= 0.1; headRot = -0.25; }
    if (!b.onGround) headRot += U.clamp(b.vy * 0.008, -0.12, 0.1);
    p.head.position.y = U.damp(p.head.position.y, headY, 16, dt);
    p.head.rotation.z = U.damp(p.head.rotation.z, headRot, 14, dt);

    // attack lunge
    if (p.atkT > 0 && p.atkT < 0.15) {
      const k = 1 - p.atkT / 0.15;
      v.position.x = (p.atkDir === 'side' ? p.facing * 0.18 * k * p.facing : 0); // local (flip-aware)
    } else v.position.x = U.damp(v.position.x, 0, 18, dt);

    // legs
    if (running) {
      const sw = Math.sin(p.bobPh);
      p.legL.rotation.z = sw * 0.7;
      p.legR.rotation.z = -sw * 0.7;
      if (Math.abs(sw) > 0.93 && U.chance(dt * 30)) G.FX.burst('dust', b.x - p.facing * 0.3, b.y - 0.6, { n: 1 });
    } else if (!b.onGround) {
      p.legL.rotation.z = U.damp(p.legL.rotation.z, 0.35, 8, dt);
      p.legR.rotation.z = U.damp(p.legR.rotation.z, -0.2, 8, dt);
    } else {
      p.legL.rotation.z = U.damp(p.legL.rotation.z, 0, 10, dt);
      p.legR.rotation.z = U.damp(p.legR.rotation.z, 0, 10, dt);
    }

    // flutter wings
    if (p.wingAnimT > 0) {
      const k = p.wingAnimT / 0.4;
      const flap = Math.sin(G.time * 40) * 0.4;
      p.wings[0].scale.setScalar(k);
      p.wings[1].scale.setScalar(k);
      p.wings[0].rotation.z = flap;
      p.wings[1].rotation.z = -flap;
    } else {
      p.wings[0].scale.setScalar(0);
      p.wings[1].scale.setScalar(0);
    }

    // blink
    if (p.blinkT <= 0) { p.blinkT = U.rand(2.5, 5.5); p.blinkAnim = 0.12; }
    if (p.blinkAnim > 0) {
      p.blinkAnim -= dt;
      const k = p.blinkAnim > 0.06 ? (0.12 - p.blinkAnim) / 0.06 : p.blinkAnim / 0.06;
      p.eyes[0].scale.y = p.eyes[1].scale.y = 1 - k * 0.9;
    } else p.eyes[0].scale.y = p.eyes[1].scale.y = 1;

    // invulnerability blink
    p.root.visible = !(p.invulnT > 0 && Math.floor(G.time * 14) % 2 === 0);

    // glow
    if (!p.focusing)
      p.glow.material.opacity = 0.3 + Math.sin(G.time * 1.7) * 0.05 + (p.soul / SOUL_MAX) * 0.12;
  }

  // ---------------- cinematic posing (driven by the cutscene system) ----------------
  // st: { rootX, rootY, stand(0..1), eyeOpen(0..1), facing(-1..1), headTurn, glowBoost }
  // stand=0 is a crumpled, just-unearthed heap; stand=1 is the alert upright stance.
  // Body parts uncurl on staggered sub-ranges for a premium "rising to its feet" feel.
  function cinePose(p, st) {
    const e = U.ease;
    p.root.position.set(st.rootX, st.rootY, 0);
    p.root.visible = true;
    p.vis.rotation.z = 0;
    const s = U.clamp(st.stand, 0, 1);
    const legP = e.inOutQuad(U.clamp(s / 0.55, 0, 1));        // legs plant first
    const bodyP = e.inOutQuad(U.clamp((s - 0.05) / 0.7, 0, 1)); // torso straightens
    const hipP = e.inOutQuad(U.clamp((s - 0.1) / 0.7, 0, 1));    // weight rises
    const headP = e.inOutQuad(U.clamp((s - 0.45) / 0.55, 0, 1)); // head lifts last
    const breathe = Math.sin(G.time * 1.5) * 0.018 * (0.3 + 0.7 * s);
    const facing = st.facing === undefined ? 1 : st.facing;
    const fsign = facing < 0 ? -1 : 1;
    const headTurn = st.headTurn || 0;

    const vis = p.vis;
    vis.scale.x = facing * 1.15;                       // passing through 0 reads as a turn
    vis.scale.y = U.lerp(0.6, 1.0, bodyP) * 1.15;
    vis.position.x = 0;
    vis.position.y = U.lerp(-0.5, 0, U.ease.outCubic(hipP)) + breathe;
    vis.rotation.z = U.lerp(0.34 * fsign, 0, bodyP);   // curled forward → upright

    p.legL.rotation.z = U.lerp(1.2, 0, legP);
    p.legR.rotation.z = U.lerp(-1.0, 0, legP);
    p.legL.position.set(U.lerp(-0.05, -0.13, legP), U.lerp(-0.28, -0.42, legP), 0.04);
    p.legR.position.set(U.lerp(0.05, 0.13, legP), U.lerp(-0.28, -0.42, legP), 0.05);

    p.cloak.rotation.z = U.lerp(0.6, 0, bodyP);
    p.cloak.scale.set(1, U.lerp(0.55, 1, bodyP), 1);
    p.cloakBack.rotation.z = p.cloak.rotation.z * 1.25 + Math.sin(G.time * 2) * 0.03;

    p.head.position.x = headTurn * 0.13;
    p.head.position.y = U.lerp(0.34, 0.72, headP) + breathe * 0.6;
    p.head.rotation.z = U.lerp(0.62 * fsign, 0, headP) + headTurn * 0.32;

    const eo = U.clamp(st.eyeOpen || 0, 0, 1);
    p.eyes[0].scale.set(1, eo, 1);
    p.eyes[1].scale.set(1, eo, 1);
    p.wings[0].scale.setScalar(0);
    p.wings[1].scale.setScalar(0);

    // ---- expression overlay (talk / confused / surprised / nod / walk ...) ----
    const ex = st.expr;
    if (ex) {
      vis.position.x += ex.jx || 0;
      vis.position.y += ex.bob || 0;
      vis.scale.y *= 1 + (ex.squash || 0);
      vis.scale.x *= 1 - (ex.squash || 0) * 0.5;
      vis.rotation.z += ex.lean || 0;
      p.head.position.x += ex.headJx || 0;
      p.head.position.y += ex.headBob || 0;
      p.head.rotation.z += ex.headTilt || 0;
      if (ex.legSwing) { p.legL.rotation.z += ex.legSwing; p.legR.rotation.z -= ex.legSwing; }
      if (ex.eye) { p.eyes[0].scale.set(ex.eye, eo * ex.eye, 1); p.eyes[1].scale.set(ex.eye, eo * ex.eye, 1); }
    }

    p.glow.scale.setScalar(st.glowScale || 9);
    p.glow.material.opacity = 0.07 + 0.12 * s + (st.glowBoost || 0);
  }

  // clip every player material below `groundY` so the figure can rise out of the earth.
  // the soul-glow is left unclipped so it reads as light leaking up through the ground.
  const _clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  function cineClip(p, groundY) {
    const on = groundY !== null && groundY !== undefined;
    if (on) _clipPlane.constant = -groundY;
    const planes = on ? [_clipPlane] : null;
    p.root.traverse(c => {
      if (c === p.glow) return;
      if (c.material) {
        const mats = Array.isArray(c.material) ? c.material : [c.material];
        mats.forEach(m => { m.clippingPlanes = planes; });
      }
    });
  }

  G.Player = { create, MAX_HP, SOUL_MAX, FOCUS_COST, cinePose, cineClip };
})();
