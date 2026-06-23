// MOSSVEIL — enemies.js : 14 creature types + projectiles
(function () {
  const U = G.U;
  const E = G.Enemies = {};

  function addToRoom(ent) {
    G.room.entities.push(ent);
    if (ent.group) G.room.group.add(ent.group);
    return ent;
  }
  E._addToRoom = addToRoom;

  function contactPlayer(ent, dmg = 1) {
    const p = G.player;
    if (p && !p.dead && p.invulnT <= 0 && U.overlap(ent.body, p.body)) {
      p.damage(dmg, ent.body.x);
    }
  }
  E._contactPlayer = contactPlayer;

  // freeze an enemy's AI for `secs` (the central update loop reads .stagT). Bosses opt out via noStagger.
  E.stagger = (ent, secs) => {
    if (!ent || !ent.alive || ent.noStagger) return;
    ent.poise = 0;
    ent.stagT = Math.max(ent.stagT || 0, secs || 0.5);
    U.flashGroup(ent.group, Math.min(0.45, secs || 0.5), 0x9fe8ff);
    G.FX.burst('spark', ent.body.x, ent.body.y + 0.3, { n: 7, color: 0x9fe8ff });
    G.FX.ring(ent.body.x, ent.body.y + 0.2, { r1: 1.3, life: 0.25, color: 0x9fe8ff, alpha: 0.4 });
    G.Audio.sfx('clink');
  };

  function baseHurt(ent, dmg, dir, opts = {}) {
    if (!ent.alive) return;
    ent.hp -= dmg;
    U.flashGroup(ent.group, 0.07);
    if (!opts.noKb) {
      ent.body.vx = dir * (opts.kb || 7);
      if (ent.fly) ent.body.vy = U.rand(1, 3);
    }
    // poise: hits build it up; when it breaks the enemy staggers (mostly matters for tanky foes)
    if (ent.hp > 0 && !opts.noStagger && !ent.noStagger) {
      ent.poise = (ent.poise || 0) + dmg + (opts.poise || 0);
      if (ent.poise >= (ent.poiseMax || 4)) E.stagger(ent, opts.stagT || 0.5);
    }
    if (ent.hp <= 0) {
      ent.alive = false;
      ent.dead = true;
      G.Audio.sfx('kill');
      G.FX.burst('gib', ent.body.x, ent.body.y, { n: 10, dir, color: ent.gibColor || 0x39443c });
      G.FX.burst('soul', ent.body.x, ent.body.y + 0.3, { n: 6 });
      G.FX.burst('spark', ent.body.x, ent.body.y + 0.2, { n: 8, dir });
      G.FX.ring(ent.body.x, ent.body.y + 0.2, { r1: 1.8, life: 0.3, color: 0xdfffe8, alpha: 0.5 });
      if (G.Main.dropGlimmer) G.Main.dropGlimmer(ent.body.x, ent.body.y + 0.3, 2 + (Math.random() * 3 | 0));
      if (ent.onDeath) ent.onDeath();
      return true;
    }
    return false;
  }
  E._baseHurt = baseHurt;

  function turnAtEdges(ent) {
    const b = ent.body;
    const ahead = b.x + ent.dir * (b.w / 2 + 0.15);
    const wall = (ent.dir > 0 && b.wallR) || (ent.dir < 0 && b.wallL);
    if (wall || !G.Physics.groundBelow(ahead, b.y - b.h / 2 + 0.1, 1.2)) ent.dir *= -1;
  }

  // =========================== TUMBLEBUG ===========================
  function mkTumblebug(x, y) {
    const grp = new THREE.Group();
    const vis = new THREE.Group();
    grp.add(vis);
    vis.add(U.flat(U.splineShape([[-0.45, 0], [-0.42, 0.3], [-0.2, 0.5], [0.2, 0.5], [0.42, 0.3], [0.45, 0]]), 0x222c24, {}));
    vis.add(U.flat(U.splineShape([[-0.34, 0.26], [-0.1, 0.43], [0.18, 0.42], [0.05, 0.32], [-0.18, 0.3]]), 0x4d7355, { z: 0.02 }));
    vis.add(U.flat(U.ellipse(0.3, 0.26), 0xd6cfbe, { z: 0.03, x: 0.42, y: 0.12 }));
    vis.add(U.flat(U.ellipse(0.07, 0.1), 0x17110b, { z: 0.05, x: 0.48, y: 0.14 }));
    const legs = [];
    for (let i = 0; i < 3; i++) {
      const leg = U.flat(U.poly([[-0.035, 0], [0.035, 0], [0.03, -0.18], [-0.03, -0.18]]), 0x171d18, { z: 0.01 });
      leg.position.set(-0.22 + i * 0.2, -0.02, 0.01);
      vis.add(leg);
      legs.push(leg);
    }
    return {
      type: 'tumblebug', isEnemy: true, alive: true, dead: false, hp: 2, fly: false,
      gibColor: 0x2e3c30,
      body: { x, y: y - 0.15, w: 0.85, h: 0.6, vx: 0, vy: 0 },
      group: grp, dir: U.chance(0.5) ? 1 : -1, ph: U.rand(0, 9), turnCd: 0, kbT: 0,
      hurt(d, dir) {
        const dead = baseHurt(this, d, dir, { kb: 6 });
        G.Audio.sfx('hit');
        if (!dead) {                                  // brief free slide, then turn back toward the player
          this.kbT = 0.22;
          const p = G.player; if (p) this.dir = p.body.x < this.body.x ? -1 : 1;
          this.turnCd = 0.3;                          // keep the chosen facing; don't edge-flip it right away
        }
      },
      update(dt) {
        const b = this.body;
        this.turnCd -= dt;
        if (this.kbT > 0) this.kbT -= dt;
        if (this.alive) {
          // free knockback slide for a beat, then always damp toward the walk speed so the
          // knockback decays (physics has no ground friction) and it heads back toward the player
          if (this.kbT <= 0) b.vx = U.damp(b.vx, this.dir * 1.7, 6, dt);
          b.vy -= 50 * dt;
          G.Physics.move(b, dt);
          if (b.onGround && this.turnCd <= 0) { const d0 = this.dir; turnAtEdges(this); if (d0 !== this.dir) this.turnCd = 0.3; }
          contactPlayer(this);
        }
        this.ph += dt * (4 + Math.abs(b.vx) * 3);
        vis.scale.x = this.dir;
        vis.position.y = Math.abs(Math.sin(this.ph)) * 0.03;
        legs.forEach((l, i) => { l.rotation.z = Math.sin(this.ph * 2 + i * 2) * 0.5; });
        grp.position.set(b.x, b.y - 0.12, -0.05);
      }
    };
  }

  // =========================== GNATLING ===========================
  function mkGnatling(x, y) {
    const grp = new THREE.Group();
    const vis = new THREE.Group();
    grp.add(vis);
    const wingL = U.flat(U.ellipse(0.5, 0.2), 0xaecad6, { additive: true, opacity: 0.45 });
    const wingR = U.flat(U.ellipse(0.5, 0.2), 0xaecad6, { additive: true, opacity: 0.45 });
    wingL.position.set(-0.1, 0.28, -0.02);
    wingR.position.set(-0.14, 0.24, -0.03);
    vis.add(wingL, wingR);
    vis.add(U.flat(U.ellipse(0.52, 0.46), 0x1d2428, {}));
    vis.add(U.flat(U.ellipse(0.09, 0.11), 0xe8b04a, { z: 0.03, x: 0.14, y: 0.06, additive: true, opacity: 0.95 }));
    vis.add(U.flat(U.poly([[0, -0.14], [0.1, -0.2], [0, -0.46]]), 0x39444a, { z: -0.01 }));
    return {
      type: 'gnatling', isEnemy: true, alive: true, dead: false, hp: 2, fly: true,
      gibColor: 0x27333a,
      body: { x, y, w: 0.6, h: 0.55, vx: 0, vy: 0 },
      group: grp, ph: U.rand(0, 9), homeX: x, homeY: y, aggro: false,
      hurt(d, dir) { baseHurt(this, d, dir, { kb: 9 }); G.Audio.sfx('hit'); },
      update(dt) {
        const b = this.body, p = G.player;
        this.ph += dt;
        if (!this.alive) return;
        let tx, ty;
        if (p && !p.dead) {
          const d = U.dist(b.x, b.y, p.body.x, p.body.y);
          if (!this.aggro && d < 9 && G.Physics.los(b.x, b.y, p.body.x, p.body.y + 0.4)) this.aggro = true;
          if (this.aggro && d > 16) this.aggro = false;
        }
        if (this.aggro && p && !p.dead) { tx = p.body.x; ty = p.body.y + 0.5; }
        else { tx = this.homeX + Math.sin(this.ph * 0.7) * 2.2; ty = this.homeY + Math.sin(this.ph * 1.1) * 0.8; }
        b.vx = U.clamp(b.vx + U.clamp(tx - b.x, -1, 1) * (this.aggro ? 14 : 5) * dt, -5.5, 5.5);
        b.vy = U.clamp(b.vy + U.clamp(ty - b.y, -1, 1) * (this.aggro ? 14 : 5) * dt, -4.5, 4.5);
        b.vx *= 1 - dt * 0.7; b.vy *= 1 - dt * 0.7;
        G.Physics.move(b, dt);
        contactPlayer(this);
        if (Math.abs(b.vx) > 0.4) vis.scale.x = b.vx > 0 ? 1 : -1;
        const flap = Math.sin(G.time * 38 + this.ph);
        wingL.rotation.z = 0.5 + flap * 0.5;
        wingR.rotation.z = 0.65 + flap * 0.45;
        vis.position.y = Math.sin(this.ph * 2.4) * 0.08;
        grp.position.set(b.x, b.y, -0.05);
      }
    };
  }

  // =========================== BULBIL (spitter) ===========================
  function mkBulbil(x, y) {
    const grp = new THREE.Group();
    const vis = new THREE.Group();
    grp.add(vis);
    for (let i = 0; i < 3; i++) {
      const a = -0.7 + i * 0.7;
      const leaf = U.flat(U.poly([[-0.1, 0], [0.1, 0], [a * 0.6, 0.75]]), 0x1f3326, { z: -0.02 });
      leaf.position.set(a * 0.25, -0.3, -0.02);
      vis.add(leaf);
    }
    const jawB = U.flat(U.splineShape([[-0.42, 0], [-0.3, 0.18], [0.42, 0.12], [0.42, -0.1], [-0.3, -0.18]]), 0x44663f, {});
    const jawT = U.flat(U.splineShape([[-0.4, 0], [-0.28, -0.14], [0.44, -0.08], [0.44, 0.12], [-0.26, 0.2]]), 0x55784a, { z: 0.02 });
    jawB.position.set(0, 0.25, 0); jawT.position.set(0, 0.38, 0.02);
    const throat = U.flat(U.ellipse(0.3, 0.2), 0xb9e87e, { additive: true, opacity: 0, z: 0.01, x: 0.1, y: 0.32 });
    vis.add(jawB, jawT, throat);
    return {
      type: 'bulbil', isEnemy: true, alive: true, dead: false, hp: 3, fly: false,
      gibColor: 0x3c5a36,
      body: { x, y: y - 0.2, w: 0.85, h: 0.75, vx: 0, vy: 0 },
      group: grp, cd: U.rand(1, 2), tele: 0,
      hurt(d, dir) { baseHurt(this, d, dir, { noKb: true }); G.Audio.sfx('hit'); },
      update(dt) {
        const b = this.body, p = G.player;
        if (this.alive && p && !p.dead) {
          const d = U.dist(b.x, b.y, p.body.x, p.body.y);
          vis.scale.x = p.body.x < b.x ? -1 : 1;
          if (this.tele > 0) {
            this.tele -= dt;
            throat.material.opacity = 0.9 * Math.min(1, (0.5 - this.tele) * 4);
            jawT.rotation.z = -0.35 * Math.min(1, (0.5 - this.tele) * 3);
            if (this.tele <= 0) {
              const dx = p.body.x - b.x, t = 0.9;
              spawnProjectile({
                x: b.x + Math.sign(dx) * 0.4, y: b.y + 0.5,
                vx: U.clamp(dx / t, -9, 9), vy: U.clamp((p.body.y - b.y) / t + 0.5 * 22 * t, 4, 14),
                grav: 22, r: 0.26, color: 0xb9e87e, friendly: false, life: 4
              });
              G.Audio.sfx('spore');
              this.cd = U.rand(2.2, 3.2);
              throat.material.opacity = 0;
            }
          } else {
            jawT.rotation.z = U.damp(jawT.rotation.z, Math.sin(G.time * 2) * 0.03, 6, dt);
            this.cd -= dt;
            if (this.cd <= 0 && d < 11.5 && G.Physics.los(b.x, b.y + 0.5, p.body.x, p.body.y)) this.tele = 0.5;
          }
          contactPlayer(this);
        }
        vis.position.y = Math.sin(G.time * 1.7 + x) * 0.04;
        grp.position.set(b.x, b.y - 0.18, -0.06);
      }
    };
  }

  // =========================== BRAMBLEHOG (charger) ===========================
  function mkBramblehog(x, y) {
    const grp = new THREE.Group();
    const vis = new THREE.Group();
    grp.add(vis);
    vis.add(U.flat(U.splineShape([[-0.6, 0], [-0.62, 0.3], [-0.3, 0.52], [0.35, 0.5], [0.62, 0.22], [0.6, 0]]), 0x20282d, {}));
    for (let i = 0; i < 4; i++) {
      const sx = -0.45 + i * 0.26;
      vis.add(U.flat(U.poly([[sx - 0.1, 0.34], [sx + 0.1, 0.34], [sx + (i - 1.5) * 0.12, 0.85 - Math.abs(i - 1.5) * 0.1]]), 0x46565e, { z: -0.01 }));
    }
    vis.add(U.flat(U.splineShape([[0.5, 0.1], [0.78, 0.2], [0.85, 0.08], [0.7, -0.02]]), 0xcfc4ae, { z: 0.02 }));
    vis.add(U.flat(U.ellipse(0.08, 0.1), 0xe86a4a, { z: 0.04, x: 0.45, y: 0.26, additive: true, opacity: 0.9 }));
    const legs = [];
    for (let i = 0; i < 4; i++) {
      const leg = U.flat(U.poly([[-0.04, 0], [0.04, 0], [0.035, -0.22], [-0.035, -0.22]]), 0x14191c, { z: 0.01 });
      leg.position.set(-0.4 + i * 0.26, 0, 0.01);
      vis.add(leg);
      legs.push(leg);
    }
    return {
      type: 'bramblehog', isEnemy: true, alive: true, dead: false, hp: 4, fly: false,
      gibColor: 0x2c363c,
      body: { x, y: y - 0.1, w: 1.2, h: 0.85, vx: 0, vy: 0 },
      group: grp, dir: U.chance(0.5) ? 1 : -1, state: 'patrol', t: 0, ph: U.rand(0, 9),
      hurt(d, dir) {
        baseHurt(this, d, dir, { kb: 3 });
        G.Audio.sfx('hit');
        if (this.alive && this.state === 'patrol') { this.state = 'alert'; this.t = 0.25; this.dir = dir * -1 || this.dir; }
      },
      update(dt) {
        const b = this.body, p = G.player;
        this.ph += dt * (3 + Math.abs(b.vx) * 2);
        if (this.alive) {
          this.t -= dt;
          if (this.state === 'patrol') {
            b.vx = U.damp(b.vx, this.dir * 1.9, 5, dt);
            if (p && !p.dead && Math.abs(p.body.y - b.y) < 2 && Math.abs(p.body.x - b.x) < 10 &&
                Math.sign(p.body.x - b.x) === this.dir &&
                G.Physics.los(b.x, b.y + 0.2, p.body.x, p.body.y + 0.2)) {
              this.state = 'alert'; this.t = 0.38;
              G.Audio.sfx('clink');
            }
          } else if (this.state === 'alert') {
            b.vx = U.damp(b.vx, 0, 12, dt);
            vis.rotation.z = -this.dir * 0.18;
            if (this.t <= 0) { this.state = 'charge'; this.t = 2.2; G.Audio.sfx('dash'); }
          } else if (this.state === 'charge') {
            b.vx = this.dir * 11;
            vis.rotation.z = 0;
            if (U.chance(dt * 25)) G.FX.burst('dust', b.x - this.dir * 0.5, b.y - 0.4, { n: 1 });
            const wall = (this.dir > 0 && b.wallR) || (this.dir < 0 && b.wallL);
            const ahead = b.x + this.dir * (b.w / 2 + 0.2);
            if (wall) {
              this.state = 'dizzy'; this.t = 0.9;
              b.vx = -this.dir * 4;
              G.FX.shake(0.15, 0.2);
              G.FX.burst('spark', b.x + this.dir * 0.7, b.y, { n: 6 });
              G.Audio.sfx('stomp');
            } else if (!G.Physics.groundBelow(ahead, b.y - b.h / 2 + 0.1, 1.4) || this.t <= 0) {
              this.state = 'dizzy'; this.t = 0.7; b.vx = 0;
            }
          } else if (this.state === 'dizzy') {
            b.vx = U.damp(b.vx, 0, 8, dt);
            vis.rotation.z = Math.sin(G.time * 14) * 0.06;
            if (this.t <= 0) { this.state = 'patrol'; this.dir *= -1; vis.rotation.z = 0; }
          }
          b.vy -= 50 * dt;
          G.Physics.move(b, dt);
          if (this.state === 'patrol' && b.onGround) turnAtEdges(this);
          contactPlayer(this);
        }
        vis.scale.x = this.dir;
        legs.forEach((l, i) => { l.rotation.z = Math.sin(this.ph * 2.2 + i * 1.7) * 0.45; });
        grp.position.set(b.x, b.y - 0.32, -0.05);
      }
    };
  }

  // =========================== LURCHER (hopper) ===========================
  function mkLurcher(x, y) {
    const grp = new THREE.Group();
    const vis = new THREE.Group();
    grp.add(vis);
    vis.add(U.flat(U.splineShape([[-0.5, 0], [-0.45, 0.45], [0, 0.65], [0.45, 0.45], [0.5, 0]]), 0x263a2c, {}));
    vis.add(U.flat(U.ellipse(0.13, 0.16), 0xffe084, { z: 0.03, x: 0.2, y: 0.34, additive: true }));
    const legL = U.flat(U.poly([[-0.08, 0], [0.08, 0], [0.16, -0.4], [0, -0.42]]), 0x16221a, { x: -0.28, z: 0.01 });
    const legR = U.flat(U.poly([[-0.08, 0], [0.08, 0], [0.16, -0.4], [0, -0.42]]), 0x16221a, { x: 0.22, z: 0.01 });
    vis.add(legL, legR);
    return {
      type: 'lurcher', isEnemy: true, alive: true, dead: false, hp: 3, fly: false,
      gibColor: 0x2c4434,
      body: { x, y: y - 0.1, w: 0.9, h: 0.8, vx: 0, vy: 0 },
      group: grp, dir: 1, cd: U.rand(0.5, 1.5), crouch: 0,
      hurt(d, dir) { baseHurt(this, d, dir, { kb: 8 }); G.Audio.sfx('hit'); },
      update(dt) {
        const b = this.body, p = G.player;
        if (this.alive) {
          this.cd -= dt;
          if (b.onGround) {
            b.vx = U.damp(b.vx, 0, 10, dt);
            if (p && !p.dead && this.cd <= 0) {
              const d = Math.abs(p.body.x - b.x);
              if (d < 9 && Math.abs(p.body.y - b.y) < 5 && G.Physics.los(b.x, b.y, p.body.x, p.body.y)) {
                this.crouch += dt;
                if (this.crouch > 0.35) {
                  this.dir = p.body.x > b.x ? 1 : -1;
                  b.vx = this.dir * U.clamp(d * 1.4, 4, 10);
                  b.vy = 11;
                  this.cd = U.rand(0.9, 1.6);
                  this.crouch = 0;
                  G.Audio.sfx('jump');
                  G.FX.burst('dust', b.x, b.y - 0.4, { n: 5 });
                }
              } else this.crouch = 0;
            }
          }
          b.vy -= 42 * dt;
          G.Physics.move(b, dt);
          contactPlayer(this);
        }
        vis.scale.x = this.dir;
        vis.scale.y = this.crouch > 0 ? 0.8 : (b.onGround ? 1 : 1.15);
        legL.rotation.z = b.onGround ? 0 : 0.5;
        legR.rotation.z = b.onGround ? 0 : 0.3;
        grp.position.set(b.x, b.y - 0.3, -0.05);
      }
    };
  }

  // =========================== SPINEMAW (ceiling lurker) ===========================
  function mkSpinemaw(x, y) {
    const grp = new THREE.Group();
    const vis = new THREE.Group();
    grp.add(vis);
    vis.add(U.flat(U.splineShape([[-0.4, 0.3], [-0.44, -0.15], [0, -0.42], [0.44, -0.15], [0.4, 0.3]]), 0x2c2433, {}));
    for (let i = 0; i < 4; i++) {
      const sx = -0.3 + i * 0.2;
      vis.add(U.flat(U.poly([[sx - 0.07, -0.3], [sx + 0.07, -0.3], [sx, -0.62]]), 0xb9aec8, { z: 0.02 }));
    }
    vis.add(U.flat(U.ellipse(0.1, 0.12), 0xff8a9a, { z: 0.03, x: -0.12, y: -0.05, additive: true }));
    vis.add(U.flat(U.ellipse(0.1, 0.12), 0xff8a9a, { z: 0.03, x: 0.12, y: -0.05, additive: true }));
    return {
      type: 'spinemaw', isEnemy: true, alive: true, dead: false, hp: 3, fly: true,
      gibColor: 0x3a2f44,
      body: { x, y, w: 0.8, h: 0.8, vx: 0, vy: 0 },
      group: grp, homeY: y, state: 'wait', t: 0,
      hurt(d, dir) { baseHurt(this, d, dir, { kb: 4 }); G.Audio.sfx('hit'); if (this.alive && this.state === 'wait') { this.state = 'drop'; } },
      update(dt) {
        const b = this.body, p = G.player;
        if (this.alive) {
          this.t -= dt;
          if (this.state === 'wait') {
            b.vx = 0; b.vy = 0;
            b.y = U.damp(b.y, this.homeY, 4, dt);
            if (p && !p.dead && Math.abs(p.body.x - b.x) < 1.6 && p.body.y < b.y && b.y - p.body.y < 12) {
              this.state = 'drop';
              G.Audio.sfx('clink');
            }
          } else if (this.state === 'drop') {
            b.vy -= 70 * dt;
            G.Physics.move(b, dt);
            if (b.onGround) {
              this.state = 'rest'; this.t = 0.8;
              G.FX.burst('dust', b.x, b.y - 0.4, { n: 6 });
              G.Audio.sfx('stomp');
            }
          } else if (this.state === 'rest') {
            if (this.t <= 0) this.state = 'climb';
          } else { // climb
            b.vy = 4; b.vx = 0;
            G.Physics.move(b, dt);
            if (b.y >= this.homeY || b.hitHead) { b.y = Math.min(b.y, this.homeY); this.state = 'wait'; }
          }
          contactPlayer(this);
        }
        vis.scale.y = this.state === 'drop' ? 1.25 : 1;
        vis.position.y = Math.sin(G.time * 2 + x) * 0.05;
        grp.position.set(b.x, b.y, -0.05);
      }
    };
  }

  // =========================== DRIFTWISP (phasing ghost) ===========================
  function mkDriftwisp(x, y) {
    const grp = new THREE.Group();
    const vis = new THREE.Group();
    grp.add(vis);
    const bodyM = U.flat(U.splineShape([[-0.4, 0.2], [-0.25, 0.5], [0.25, 0.5], [0.4, 0.2], [0.25, -0.5], [0, -0.3], [-0.25, -0.5]]), 0x9fd8e8, { additive: true, opacity: 0.45 });
    vis.add(bodyM);
    vis.add(U.flat(U.ellipse(0.09, 0.13), 0xffffff, { z: 0.02, x: -0.11, y: 0.15, additive: true, opacity: 0.9 }));
    vis.add(U.flat(U.ellipse(0.09, 0.13), 0xffffff, { z: 0.02, x: 0.11, y: 0.15, additive: true, opacity: 0.9 }));
    const glow = U.glowSprite(0x9fd8e8, 4, 0.3);
    grp.add(glow);
    return {
      type: 'driftwisp', isEnemy: true, alive: true, dead: false, hp: 2, fly: true,
      gibColor: 0x6a98a8,
      body: { x, y, w: 0.7, h: 0.8, vx: 0, vy: 0 },
      group: grp, ph: U.rand(0, 9),
      hurt(d, dir) { baseHurt(this, d, dir, { kb: 11 }); G.Audio.sfx('hit'); },
      update(dt) {
        const b = this.body, p = G.player;
        this.ph += dt;
        if (this.alive) {
          if (p && !p.dead) {
            const d = U.dist(b.x, b.y, p.body.x, p.body.y);
            if (d < 13) {
              b.vx = U.clamp(b.vx + Math.sign(p.body.x - b.x) * 4 * dt, -3.2, 3.2);
              b.vy = U.clamp(b.vy + Math.sign(p.body.y + 0.4 - b.y) * 4 * dt, -3.2, 3.2);
            }
          }
          b.vx *= 1 - dt * 0.4; b.vy *= 1 - dt * 0.4;
          // phases through walls: no physics collision
          b.x += b.vx * dt; b.y += b.vy * dt;
          contactPlayer(this);
          if (U.chance(dt * 6)) G.FX.p(true, { x: b.x, y: b.y - 0.3, vx: 0, vy: -0.5, life: 0.8, size: 0.18, color: 0x9fd8e8, alpha: 0.5 });
        }
        vis.scale.x = b.vx > 0 ? 1 : -1;
        bodyM.material.opacity = 0.35 + Math.sin(this.ph * 2.2) * 0.12;
        vis.position.y = Math.sin(this.ph * 1.8) * 0.12;
        grp.position.set(b.x, b.y, -0.04);
      }
    };
  }

  // =========================== SHELLBACK (armored front) ===========================
  function mkShellback(x, y) {
    const grp = new THREE.Group();
    const vis = new THREE.Group();
    grp.add(vis);
    vis.add(U.flat(U.splineShape([[-0.55, 0], [-0.5, 0.45], [-0.05, 0.62], [0.4, 0.45], [0.5, 0]]), 0x2a3036, {}));
    // armored face plate
    vis.add(U.flat(U.splineShape([[0.35, 0], [0.42, 0.5], [0.62, 0.35], [0.66, 0]]), 0x8a949c, { z: 0.02 }));
    vis.add(U.flat(U.ellipse(0.07, 0.09), 0xffb060, { z: 0.04, x: 0.42, y: 0.3, additive: true }));
    const legs = [];
    for (let i = 0; i < 3; i++) {
      const leg = U.flat(U.poly([[-0.04, 0], [0.04, 0], [0.03, -0.2], [-0.03, -0.2]]), 0x14181c, { z: 0.01 });
      leg.position.set(-0.3 + i * 0.25, -0.02, 0.01);
      vis.add(leg);
      legs.push(leg);
    }
    return {
      type: 'shellback', isEnemy: true, alive: true, dead: false, hp: 4, fly: false,
      gibColor: 0x363e46,
      body: { x, y: y - 0.12, w: 1.0, h: 0.7, vx: 0, vy: 0 },
      group: grp, dir: U.chance(0.5) ? 1 : -1, ph: U.rand(0, 9),
      hurt(d, dir, atkDir) {
        // front armor: side hits from the front clink off
        if (atkDir === 'side' && dir === -this.dir) {
          G.Audio.sfx('clink');
          G.FX.burst('spark', this.body.x + this.dir * 0.5, this.body.y + 0.2, { n: 5, color: 0xfff0b0 });
          this.body.vx = -dir * 2;
          return;
        }
        baseHurt(this, d, dir, { kb: 5 });
        G.Audio.sfx('hit');
      },
      update(dt) {
        const b = this.body, p = G.player;
        this.ph += dt * (3 + Math.abs(b.vx) * 2);
        if (this.alive) {
          // walks toward player when near, else patrols
          let speed = 1.4;
          if (p && !p.dead && Math.abs(p.body.x - b.x) < 8 && Math.abs(p.body.y - b.y) < 2.5) {
            this.dir = p.body.x > b.x ? 1 : -1;
            speed = 2.6;
          }
          b.vx = U.damp(b.vx, this.dir * speed, 5, dt);
          b.vy -= 50 * dt;
          G.Physics.move(b, dt);
          if (b.onGround) turnAtEdges(this);
          contactPlayer(this);
        }
        vis.scale.x = this.dir;
        legs.forEach((l, i) => { l.rotation.z = Math.sin(this.ph * 2 + i * 1.9) * 0.45; });
        grp.position.set(b.x, b.y - 0.22, -0.05);
      }
    };
  }

  // =========================== SKIMMER (dive-bomber) ===========================
  function mkSkimmer(x, y) {
    const grp = new THREE.Group();
    const vis = new THREE.Group();
    grp.add(vis);
    const wingL = U.flat(U.splineShape([[0, 0], [-0.6, 0.4], [-0.95, 0.1], [-0.5, -0.15]]), 0xc8d8e8, { additive: true, opacity: 0.4, z: -0.02 });
    const wingR = U.flat(U.splineShape([[0, 0], [0.6, 0.4], [0.95, 0.1], [0.5, -0.15]]), 0xc8d8e8, { additive: true, opacity: 0.4, z: -0.02 });
    vis.add(wingL, wingR);
    vis.add(U.flat(U.splineShape([[-0.5, 0.1], [0, 0.25], [0.55, 0.05], [0.3, -0.18], [-0.3, -0.18]]), 0x222a34, {}));
    vis.add(U.flat(U.ellipse(0.08, 0.1), 0x8ae0ff, { z: 0.03, x: 0.32, y: 0.02, additive: true }));
    return {
      type: 'skimmer', isEnemy: true, alive: true, dead: false, hp: 2, fly: true,
      gibColor: 0x2c3a48,
      body: { x, y, w: 0.9, h: 0.5, vx: 2, vy: 0 },
      group: grp, homeY: y, state: 'patrol', t: 0, dir: 1, diveTarget: null,
      hurt(d, dir) { baseHurt(this, d, dir, { kb: 8 }); G.Audio.sfx('hit'); },
      update(dt) {
        const b = this.body, p = G.player;
        if (this.alive) {
          this.t -= dt;
          if (this.state === 'patrol') {
            b.vx = U.damp(b.vx, this.dir * 3.2, 4, dt);
            b.vy = U.damp(b.vy, (this.homeY - b.y) * 2 + Math.sin(G.time * 2) * 0.8, 5, dt);
            if (b.wallL) this.dir = 1;
            if (b.wallR) this.dir = -1;
            if (p && !p.dead && this.t <= 0 && Math.abs(p.body.x - b.x) < 8 && p.body.y < b.y && b.y - p.body.y < 9 &&
                G.Physics.los(b.x, b.y, p.body.x, p.body.y)) {
              this.state = 'tele'; this.t = 0.4;
              this.diveTarget = { x: p.body.x, y: p.body.y + 0.3 };
            }
          } else if (this.state === 'tele') {
            b.vx = U.damp(b.vx, 0, 8, dt);
            b.vy = U.damp(b.vy, 1.5, 8, dt);
            if (this.t <= 0) {
              this.state = 'dive';
              const dx = this.diveTarget.x - b.x, dy = this.diveTarget.y - b.y;
              const d = Math.hypot(dx, dy) || 1;
              b.vx = (dx / d) * 14; b.vy = (dy / d) * 14;
              this.t = 0.9;
              G.Audio.sfx('dash');
            }
          } else if (this.state === 'dive') {
            if (U.chance(dt * 30)) G.FX.p(true, { x: b.x, y: b.y, vx: 0, vy: 0, life: 0.3, size: 0.2, color: 0x8ae0ff, alpha: 0.5 });
            if (this.t <= 0 || b.onGround || b.wallL || b.wallR || b.hitHead) {
              this.state = 'rise'; this.t = 1.2;
            }
          } else { // rise
            b.vx = U.damp(b.vx, this.dir * 2, 3, dt);
            b.vy = U.damp(b.vy, U.clamp((this.homeY - b.y) * 2, -2, 5), 4, dt);
            if (Math.abs(this.homeY - b.y) < 1 || this.t <= 0) { this.state = 'patrol'; this.t = U.rand(1, 2); }
          }
          G.Physics.move(b, dt);
          contactPlayer(this);
        }
        vis.scale.x = b.vx >= 0 ? 1 : -1;
        const flap = Math.sin(G.time * 30);
        wingL.rotation.z = flap * 0.4;
        wingR.rotation.z = -flap * 0.4;
        vis.rotation.z = U.clamp(b.vy * 0.04, -0.4, 0.4) * (b.vx >= 0 ? 1 : -1);
        grp.position.set(b.x, b.y, -0.05);
      }
    };
  }

  // =========================== SPORELING (swarmer) ===========================
  function mkSporeling(x, y) {
    const grp = new THREE.Group();
    const vis = new THREE.Group();
    grp.add(vis);
    vis.add(U.flat(U.ellipse(0.4, 0.36), 0x3c2c3a, {}));
    vis.add(U.flat(U.splineShape([[-0.25, 0.12], [0, 0.34], [0.25, 0.12], [0, 0.2]]), 0xc06a9e, { z: 0.02 }));
    vis.add(U.flat(U.ellipse(0.06, 0.08), 0xffc0dd, { z: 0.03, x: 0.1, y: 0.02, additive: true }));
    const legs = [];
    for (let i = 0; i < 2; i++) {
      const leg = U.flat(U.poly([[-0.03, 0], [0.03, 0], [0.02, -0.14], [-0.02, -0.14]]), 0x1c141a, { z: 0.01 });
      leg.position.set(-0.08 + i * 0.16, -0.14, 0.01);
      vis.add(leg);
      legs.push(leg);
    }
    return {
      type: 'sporeling', isEnemy: true, alive: true, dead: false, hp: 1, fly: false,
      gibColor: 0x4c3448,
      body: { x, y: y - 0.2, w: 0.55, h: 0.45, vx: 0, vy: 0 },
      group: grp, dir: U.chance(0.5) ? 1 : -1, ph: U.rand(0, 9), hopCd: 0,
      hurt(d, dir) { baseHurt(this, d, dir, { kb: 10 }); G.Audio.sfx('hit'); },
      update(dt) {
        const b = this.body, p = G.player;
        this.ph += dt * (4 + Math.abs(b.vx) * 2);
        this.hopCd -= dt;
        if (this.alive) {
          if (p && !p.dead && Math.abs(p.body.x - b.x) < 9 && Math.abs(p.body.y - b.y) < 4 &&
              G.Physics.los(b.x, b.y, p.body.x, p.body.y)) {
            this.dir = p.body.x > b.x ? 1 : -1;
            b.vx = U.damp(b.vx, this.dir * 4.8, 8, dt);
            if (b.onGround && this.hopCd <= 0 && U.chance(dt * 2)) { b.vy = 7; this.hopCd = 0.5; }
          } else {
            b.vx = U.damp(b.vx, this.dir * 1.5, 6, dt);
            if (b.onGround) turnAtEdges(this);
          }
          b.vy -= 48 * dt;
          G.Physics.move(b, dt);
          if (b.onGround && Math.abs(b.vx) > 4) { const d0 = this.dir; turnAtEdges(this); this.dir = d0; }
          contactPlayer(this);
        }
        vis.scale.x = this.dir;
        legs.forEach((l, i) => { l.rotation.z = Math.sin(this.ph * 3 + i * 2.5) * 0.6; });
        grp.position.set(b.x, b.y - 0.1, -0.05);
      }
    };
  }

  // =========================== MORTARBUG (heavy lobber) ===========================
  function mkMortarbug(x, y) {
    const grp = new THREE.Group();
    const vis = new THREE.Group();
    grp.add(vis);
    vis.add(U.flat(U.splineShape([[-0.7, 0], [-0.65, 0.45], [-0.2, 0.72], [0.4, 0.6], [0.7, 0.25], [0.68, 0]]), 0x33301f, {}));
    const tube = U.flat(U.poly([[-0.12, 0], [0.12, 0], [0.2, 0.75], [-0.2, 0.75]]), 0x55502e, { z: 0.02, x: -0.15, y: 0.5 });
    tube.rotation.z = 0.4;
    vis.add(tube);
    vis.add(U.flat(U.ellipse(0.09, 0.11), 0xd8e84a, { z: 0.04, x: 0.45, y: 0.3, additive: true }));
    const legsArr = [];
    for (let i = 0; i < 4; i++) {
      const leg = U.flat(U.poly([[-0.045, 0], [0.045, 0], [0.04, -0.2], [-0.04, -0.2]]), 0x1a180e, { z: 0.01 });
      leg.position.set(-0.45 + i * 0.3, 0, 0.01);
      vis.add(leg);
      legsArr.push(leg);
    }
    return {
      type: 'mortarbug', isEnemy: true, alive: true, dead: false, hp: 3, fly: false,
      gibColor: 0x3e3a24,
      body: { x, y: y - 0.1, w: 1.3, h: 0.85, vx: 0, vy: 0 },
      group: grp, cd: U.rand(1.5, 2.5), tele: 0,
      hurt(d, dir) { baseHurt(this, d, dir, { noKb: true }); G.Audio.sfx('hit'); },
      update(dt) {
        const b = this.body, p = G.player;
        if (this.alive) {
          b.vy -= 50 * dt;
          G.Physics.move(b, dt);
          if (p && !p.dead) {
            vis.scale.x = p.body.x < b.x ? -1 : 1;
            const d = Math.abs(p.body.x - b.x);
            if (this.tele > 0) {
              this.tele -= dt;
              vis.scale.y = 1 - Math.sin(Math.min(1, (0.6 - this.tele) / 0.6) * Math.PI) * 0.12;
              if (this.tele <= 0) {
                const t = 1.4, dx = p.body.x - b.x;
                const shell = spawnProjectile({
                  x: b.x, y: b.y + 0.8,
                  vx: U.clamp(dx / t, -8, 8), vy: 14, grav: 20, r: 0.34,
                  color: 0xd8e84a, friendly: false, life: 5
                });
                shell.onPop = () => {
                  for (let i = -1; i <= 1; i++)
                    spawnProjectile({ x: shell.body.x, y: shell.body.y + 0.3, vx: i * 3, vy: 3, grav: 16, r: 0.18, color: 0xd8e84a, friendly: false, life: 2 });
                  G.FX.burst('spore', shell.body.x, shell.body.y, { n: 10, color: 0xd8e84a });
                };
                G.Audio.sfx('spore');
                G.FX.burst('dust', b.x, b.y, { n: 4 });
                this.cd = U.rand(3, 4.2);
              }
            } else {
              this.cd -= dt;
              if (this.cd <= 0 && d < 16 && d > 2) this.tele = 0.6;
            }
          }
          contactPlayer(this);
        }
        grp.position.set(b.x, b.y - 0.32, -0.06);
      }
    };
  }

  // =========================== BLASTCAP (mine) ===========================
  function mkBlastcap(x, y) {
    const grp = new THREE.Group();
    const vis = new THREE.Group();
    grp.add(vis);
    vis.add(U.flat(U.poly([[-0.12, 0], [0.12, 0], [0.08, 0.3], [-0.08, 0.3]]), 0x3a2c20, {}));
    const cap = U.flat(U.splineShape([[-0.5, 0.25], [-0.3, 0.62], [0, 0.72], [0.3, 0.62], [0.5, 0.25], [0, 0.18]]), 0x8a4a3a, { z: 0.02 });
    vis.add(cap);
    const core = U.flat(U.ellipse(0.24, 0.18), 0xff7a50, { additive: true, opacity: 0.4, z: 0.04, y: 0.42 });
    vis.add(core);
    return {
      type: 'blastcap', isEnemy: true, alive: true, dead: false, hp: 1, fly: false,
      gibColor: 0x6a3a2c,
      body: { x, y: y - 0.25, w: 0.8, h: 0.6, vx: 0, vy: 0 },
      group: grp, arming: -1,
      explode() {
        if (this.dead) return;
        this.alive = false; this.dead = true;
        G.Audio.sfx('stomp');
        G.FX.shake(0.25, 0.3);
        G.FX.ring(this.body.x, this.body.y + 0.3, { r1: 3.4, life: 0.4, color: 0xffa050, alpha: 0.8 });
        G.FX.burst('spark', this.body.x, this.body.y + 0.3, { n: 16, color: 0xffa050 });
        G.FX.burst('gib', this.body.x, this.body.y, { n: 8, color: this.gibColor });
        const p = G.player;
        if (p && !p.dead && p.invulnT <= 0 && U.dist(this.body.x, this.body.y, p.body.x, p.body.y) < 2.6)
          p.damage(1, this.body.x);
      },
      hurt(d, dir) {
        // popped safely before it arms
        if (this.arming < 0) { baseHurt(this, d, dir, { noKb: true }); G.Audio.sfx('hit'); }
        else this.explode();
      },
      update(dt) {
        const b = this.body, p = G.player;
        if (this.alive) {
          if (this.arming >= 0) {
            this.arming -= dt;
            core.material.opacity = 0.5 + Math.sin(G.time * 24) * 0.4;
            cap.scale.y = 1 + Math.sin(G.time * 24) * 0.08;
            if (this.arming <= 0) this.explode();
          } else if (p && !p.dead && U.dist(b.x, b.y, p.body.x, p.body.y) < 2.4) {
            this.arming = 0.65;
            G.Audio.sfx('clink');
          } else {
            core.material.opacity = 0.35 + Math.sin(G.time * 2 + x) * 0.1;
          }
        }
        grp.position.set(b.x, b.y - 0.28, -0.06);
      }
    };
  }

  // =========================== HOOKWORM (burrower) ===========================
  function mkHookworm(x, y) {
    const grp = new THREE.Group();
    const vis = new THREE.Group();
    grp.add(vis);
    const segs = [];
    for (let i = 0; i < 4; i++) {
      const s = U.flat(U.ellipse(0.5 - i * 0.07, 0.42 - i * 0.05), 0x4a3a2c, { z: -i * 0.01, y: -i * 0.34 });
      vis.add(s);
      segs.push(s);
    }
    vis.add(U.flat(U.splineShape([[-0.3, 0.1], [0, 0.42], [0.3, 0.1], [0, 0.22]]), 0xd8c8a8, { z: 0.03, y: 0.1 }));
    vis.add(U.flat(U.ellipse(0.07, 0.09), 0xff6a4a, { z: 0.05, x: -0.1, y: 0.16, additive: true }));
    vis.add(U.flat(U.ellipse(0.07, 0.09), 0xff6a4a, { z: 0.05, x: 0.1, y: 0.16, additive: true }));
    return {
      type: 'hookworm', isEnemy: true, alive: true, dead: false, hp: 3, fly: false,
      gibColor: 0x52412e,
      body: { x, y: y - 2.5, w: 0.9, h: 1.4, vx: 0, vy: 0 },
      group: grp, baseY: y, state: 'hidden', t: 0, targetX: x,
      hurt(d, dir) {
        if (this.state === 'hidden' || this.state === 'tele') return; // underground
        baseHurt(this, d, dir, { noKb: true });
        G.Audio.sfx('hit');
      },
      update(dt) {
        const b = this.body, p = G.player;
        if (this.alive) {
          this.t -= dt;
          if (this.state === 'hidden') {
            grp.visible = false;
            b.y = this.baseY - 3;
            if (p && !p.dead && Math.abs(p.body.x - this.targetX) < 8 && Math.abs(p.body.y - this.baseY) < 3 && this.t <= 0) {
              this.state = 'tele'; this.t = 0.55;
              this.emergeX = U.clamp(p.body.x, this.targetX - 7, this.targetX + 7);
            }
          } else if (this.state === 'tele') {
            grp.visible = false;
            if (U.chance(dt * 40)) G.FX.burst('dust', this.emergeX + U.rand(-0.4, 0.4), this.baseY - 0.9, { n: 2 });
            if (this.t <= 0) {
              this.state = 'up'; this.t = 0.7;
              b.x = this.emergeX;
              b.y = this.baseY - 2.2;
              grp.visible = true;
              G.Audio.sfx('stomp');
              G.FX.burst('dust', b.x, this.baseY - 1, { n: 10 });
              G.FX.shake(0.12, 0.2);
            }
          } else if (this.state === 'up') {
            grp.visible = true;
            b.y = U.damp(b.y, this.baseY - 0.3, 10, dt);
            contactPlayer(this);
            if (this.t <= 0) { this.state = 'down'; this.t = 0.5; }
          } else { // down
            b.y = U.damp(b.y, this.baseY - 3, 6, dt);
            if (this.t <= 0) { this.state = 'hidden'; this.t = U.rand(0.6, 1.4); }
          }
        }
        segs.forEach((s, i) => { s.position.x = Math.sin(G.time * 5 + i * 1.2) * 0.06 * i; });
        grp.position.set(b.x, b.y + 0.4, -0.07);
      }
    };
  }

  // =========================== SENTINE (turret eye) ===========================
  function mkSentine(x, y) {
    const grp = new THREE.Group();
    const vis = new THREE.Group();
    grp.add(vis);
    vis.add(U.flat(U.poly([[-0.3, 0], [0.3, 0], [0.18, 0.5], [-0.18, 0.5]]), 0x232a30, {}));
    const headG = new THREE.Group();
    headG.position.y = 0.7;
    headG.add(U.flat(U.ellipse(0.6, 0.5), 0x2c343c, {}));
    const iris = U.flat(U.ellipse(0.26, 0.26), 0x9fe8ff, { z: 0.03, additive: true });
    const pupil = U.flat(U.ellipse(0.1, 0.12), 0x102030, { z: 0.05 });
    headG.add(iris, pupil);
    vis.add(headG);
    return {
      type: 'sentine', isEnemy: true, alive: true, dead: false, hp: 3, fly: false,
      gibColor: 0x34404a,
      body: { x, y: y - 0.05, w: 0.95, h: 1.0, vx: 0, vy: 0 },
      group: grp, cd: U.rand(1, 2), charge: 0,
      hurt(d, dir) { baseHurt(this, d, dir, { noKb: true }); G.Audio.sfx('hit'); },
      update(dt) {
        const b = this.body, p = G.player;
        if (this.alive && p && !p.dead) {
          const dx = p.body.x - b.x, dy = p.body.y + 0.3 - (b.y + 0.45);
          pupil.position.x = U.clamp(dx * 0.04, -0.18, 0.18);
          pupil.position.y = U.clamp(dy * 0.04, -0.12, 0.12);
          const d = Math.hypot(dx, dy);
          if (this.charge > 0) {
            this.charge -= dt;
            iris.material.opacity = 0.6 + Math.sin(G.time * 30) * 0.4;
            iris.scale.setScalar(1 + (0.5 - this.charge) * 0.8);
            if (this.charge <= 0) {
              const n = Math.hypot(dx, dy) || 1;
              spawnProjectile({ x: b.x + (dx / n) * 0.6, y: b.y + 0.45 + (dy / n) * 0.6, vx: (dx / n) * 11, vy: (dy / n) * 11, r: 0.24, color: 0x9fe8ff, friendly: false, life: 2.5 });
              G.Audio.sfx('spell');
              this.cd = U.rand(1.8, 2.6);
              iris.scale.setScalar(1);
            }
          } else {
            iris.material.opacity = 0.9;
            this.cd -= dt;
            if (this.cd <= 0 && d < 13 && G.Physics.los(b.x, b.y + 0.5, p.body.x, p.body.y + 0.3)) this.charge = 0.5;
          }
          contactPlayer(this);
        }
        headG.position.y = 0.7 + Math.sin(G.time * 1.6 + x) * 0.05;
        grp.position.set(b.x, b.y - 0.5, -0.06);
      }
    };
  }

  // =========================== PROJECTILES ===========================
  function spawnProjectile(o) {
    const grp = new THREE.Group();
    const core = U.flat(U.ellipse(o.r * 2, o.r * 2), o.color, { additive: true, opacity: 0.95 });
    const glow = U.glowSprite(o.color, o.r * 9, 0.4);
    grp.add(core, glow);
    const ent = {
      type: 'projectile', friendly: !!o.friendly, alive: true, dead: false,
      body: { x: o.x, y: o.y, w: o.r * 2, h: o.r * 2, vx: o.vx, vy: o.vy },
      group: grp, life: o.life || 3, dmg: o.dmg || 1, homing: o.homing || 0,
      pop() {
        if (this.dead) return;
        this.dead = true;
        G.FX.burst(this.friendly ? 'soul' : 'spore', this.body.x, this.body.y, { n: 7, color: o.color });
        if (this.friendly) G.Audio.sfx('spellHit');
        if (this.onPop) this.onPop();
      },
      update(dt) {
        if (this.dead) return;
        const b = this.body;
        this.life -= dt;
        if (this.life <= 0) { this.pop(); return; }
        if (o.grav) b.vy -= o.grav * dt;
        if (this.homing && G.player && !G.player.dead) {
          const p = G.player;
          const dx = p.body.x - b.x, dy = p.body.y + 0.4 - b.y;
          const d = Math.hypot(dx, dy) || 1;
          b.vx += (dx / d) * this.homing * dt;
          b.vy += (dy / d) * this.homing * dt;
          const sp = Math.hypot(b.vx, b.vy);
          const max = o.maxSpeed || 7;
          if (sp > max) { b.vx = b.vx / sp * max; b.vy = b.vy / sp * max; }
        }
        b.x += b.vx * dt; b.y += b.vy * dt;
        if (G.Physics.rectVsSolids(b)) { this.pop(); return; }
        if (this.friendly) {
          for (const e of G.room.entities) {
            if (e.isEnemy && e.alive && U.overlap(b, e.body)) {
              e.hurt(this.dmg, Math.sign(b.vx) || 1, 'spell');
              this.pop();
              G.FX.shake(0.08, 0.1);
              break;
            }
          }
          if (U.chance(dt * 60)) G.FX.p(true, { x: b.x, y: b.y, vx: -b.vx * 0.08, vy: U.rand(-1, 1), life: 0.35, size: U.rand(0.15, 0.3), color: 0xbfe8ff });
        } else {
          const p = G.player;
          if (p && !p.dead && p.invulnT <= 0 && U.overlap(b, p.body)) {
            p.damage(this.dmg, b.x);
            this.pop();
          }
          if (U.chance(dt * 30)) G.FX.p(true, { x: b.x, y: b.y, vx: 0, vy: 0, life: 0.4, size: 0.15, color: o.color, alpha: 0.6 });
        }
        grp.position.set(b.x, b.y, 0.15);
        core.scale.setScalar(1 + Math.sin(G.time * 20) * 0.15);
      }
    };
    return addToRoom(ent);
  }
  E.spawnProjectile = spawnProjectile;

  E.fireBolt = (x, y, dir) => {
    spawnProjectile({ x, y, vx: dir * 17, vy: 0, r: 0.32, color: 0xcfeaff, friendly: true, life: 1.1, dmg: 3 });
  };

  // =========================== SHOCKWAVE ===========================
  E.spawnShockwave = function (x, y, dir, color) {
    const ent = {
      type: 'shockwave', alive: true, dead: false,
      body: { x, y: y + 0.5, w: 0.9, h: 1.1, vx: dir * 10, vy: 0 },
      group: new THREE.Group(), life: 1.3,
      update(dt) {
        const b = this.body;
        this.life -= dt;
        b.x += b.vx * dt;
        if (this.life <= 0 || G.Physics.pointSolid(b.x + dir * 0.5, b.y)) { this.dead = true; return; }
        for (let i = 0; i < 3; i++) {
          if (!G.Physics.groundBelow(b.x, b.y - 0.54, 0.4)) b.y -= 0.3; else break;
        }
        G.FX.burst('dust', b.x, b.y - 0.5, { n: 2 });
        G.FX.p(true, { x: b.x, y: b.y - 0.2, vx: U.rand(-1, 1), vy: U.rand(2, 5), life: 0.3, size: U.rand(0.2, 0.45), color: color || 0xc8ffd8 });
        contactPlayer(this);
      }
    };
    return addToRoom(ent);
  };

  // =========================== FACTORY ===========================
  const MAKERS = {
    tumblebug: mkTumblebug, gnatling: mkGnatling, bulbil: mkBulbil, bramblehog: mkBramblehog,
    lurcher: mkLurcher, spinemaw: mkSpinemaw, driftwisp: mkDriftwisp, shellback: mkShellback,
    skimmer: mkSkimmer, sporeling: mkSporeling, mortarbug: mkMortarbug, blastcap: mkBlastcap,
    hookworm: mkHookworm, sentine: mkSentine
  };
  E.TYPES = [
    { id: 'tumblebug', label: 'Tumblebug (walker)' },
    { id: 'gnatling', label: 'Gnatling (chasing flier)' },
    { id: 'bulbil', label: 'Bulbil (spitter plant)' },
    { id: 'bramblehog', label: 'Bramblehog (charger)' },
    { id: 'lurcher', label: 'Lurcher (leaper)' },
    { id: 'spinemaw', label: 'Spinemaw (ceiling dropper)' },
    { id: 'driftwisp', label: 'Driftwisp (phasing ghost)' },
    { id: 'shellback', label: 'Shellback (front-armored)' },
    { id: 'skimmer', label: 'Skimmer (dive-bomber)' },
    { id: 'sporeling', label: 'Sporeling (swarmer)' },
    { id: 'mortarbug', label: 'Mortarbug (artillery)' },
    { id: 'blastcap', label: 'Blastcap (mine fungus)' },
    { id: 'hookworm', label: 'Hookworm (burrower)' },
    { id: 'sentine', label: 'Sentine (turret eye)' }
  ];
  E.make = (type, x, y) => {
    const mk = MAKERS[type];
    return mk ? mk(x, y) : null;
  };

  // bosses live in bosses.js
  E.spawnBoss = (typeId, x, y, gates, saveKey) => G.Bosses.spawn(typeId, x, y, gates, saveKey);
})();
