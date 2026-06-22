// MOSSVEIL — prologue.js : the opening cinematic that plays on a NEW game, before the
// Awakening intro. A weary elder walks through a rainswept gloom with a cane-sword, two
// studio cards hard-cut in, then he drives the blade into the ground and the title rises.
(function () {
  const U = G.U;
  const P = G.Prologue = { active: false };
  const BAR = 0.135;                          // letterbox bar fraction
  const serif = 'Georgia, "Times New Roman", serif';

  const PHASES = [
    { n: 'walkA', d: 8.0 }, { n: 'card1', d: 3.0 }, { n: 'walkB', d: 4.0 }, { n: 'card2', d: 3.0 },
    { n: 'walkC', d: 1.5 }, { n: 'raise', d: 1.5 }, { n: 'smash', d: 0.6 },
    { n: 'blackHold', d: 2.0 }, { n: 'titleIn', d: 2.0 }, { n: 'titleHold', d: 2.0 }, { n: 'titleOut', d: 2.2 }
  ];
  const WALKING = new Set(['walkA', 'card1', 'walkB', 'card2', 'walkC']);
  const VISIBLE = new Set(['walkA', 'walkB', 'walkC', 'raise', 'smash']);
  const RAISED_ROT = Math.PI * 0.93, RAISED_Y = 0.98;

  let man = null, parts = null, groundY = 4, walkX = 0, walkPh = 0, walkSpeed = 1.5;
  let camX = 0, camY = 0, camZ = 17;
  let phaseI = 0, t = 0, hardBlack = false, smashed = false, visTime = 0;
  let thunderT = 0, flashA = 0, titleAlpha = 0, rain = [], doneCb = null;

  function makeLevel() {
    const w = 130, h = 24, grd = 4, tiles = [];
    for (let r = 0; r < h; r++) tiles.push(r >= h - grd ? '#'.repeat(w) : ' '.repeat(w));
    return {
      id: 'prologue', title: '', area: null, biome: 'gloom', w, h, mapPos: { mx: -9999, my: -9999 },
      tiles, spawns: { P: { x: 14, y: grd } }, enemies: [], props: [], transitions: []
    };
  }

  function buildOldMan() {
    const group = new THREE.Group();
    const vis = new THREE.Group(); group.add(vis);
    const DARK = 0x0b1018, CLOAK = 0x152433, CLOAKIN = 0x203a4e, SKIN = 0xa39c8a, STEEL = 0x70808c, GRIP = 0x2a2018;
    const glow = U.glowSprite(0x49708c, 7, 0.15); glow.position.set(0.1, 0.45, -0.08); group.add(glow);
    // shuffling legs
    const mkLeg = () => U.flat(U.poly([[-0.07, 0], [0.07, 0], [0.05, -0.52], [-0.05, -0.52]]), DARK, {});
    const legL = mkLeg(); legL.position.set(-0.15, -0.26, 0.03);
    const legR = mkLeg(); legR.position.set(0.17, -0.26, 0.04);
    vis.add(legL, legR);
    // hunched robe (leaning forward, toward the cane)
    vis.add(U.flat(U.splineShape([
      [-0.02, 0.62], [-0.46, 0.2], [-0.58, -0.4], [-0.42, -0.84], [0, -0.92],
      [0.5, -0.84], [0.66, -0.34], [0.5, 0.18], [0.28, 0.6]
    ]), CLOAK, { z: 0.06 }));
    vis.add(U.flat(U.splineShape([
      [0.0, 0.5], [-0.28, 0.16], [-0.36, -0.36], [-0.24, -0.74], [0, -0.8],
      [0.3, -0.74], [0.42, -0.34], [0.32, 0.16], [0.18, 0.48]
    ]), CLOAKIN, { z: 0.07 }));
    // weary head, tilted down
    const head = new THREE.Group(); head.position.set(0.18, 0.66, 0.12); head.rotation.z = -0.28;
    head.add(U.flat(U.ellipse(0.2, 0.23), SKIN, {}));
    head.add(U.flat(U.splineShape([[-0.26, -0.06], [-0.27, 0.2], [-0.06, 0.36], [0.22, 0.28], [0.28, 0.0], [0.18, -0.14]]), DARK, { z: -0.01, y: 0.05 }));
    head.add(U.flat(U.splineShape([[-0.15, -0.04], [-0.2, -0.42], [-0.08, -0.7], [0, -0.78], [0.1, -0.64], [0.17, -0.34], [0.13, -0.04]]), 0x8d9491, { z: 0.01, y: -0.14 }));
    head.add(U.flat(U.ellipse(0.045, 0.06), 0x120e08, { z: 0.02, x: 0.05, y: 0.05 }));
    vis.add(head);
    // cane-sword: group pivots at the hand; blade extends downward
    const cane = new THREE.Group(); cane.position.set(0.54, 0.12, 0.2); cane.rotation.z = 0.2;
    cane.add(U.flat(U.poly([[-0.035, 0.0], [0.035, 0.0], [0.018, -0.98], [-0.018, -0.98]]), STEEL, {}));
    cane.add(U.flat(U.poly([[-0.2, 0.0], [0.2, 0.0], [0.17, 0.07], [-0.17, 0.07]]), 0x3a444c, { z: 0.01 }));
    cane.add(U.flat(U.poly([[-0.04, 0.07], [0.04, 0.07], [0.04, 0.3], [-0.04, 0.3]]), GRIP, { z: 0.01 }));
    cane.add(U.flat(U.ellipse(0.07, 0.07), 0x4a4038, { y: 0.35, z: 0.01 }));
    vis.add(cane);
    // arm reaching to the cane
    const arm = U.flat(U.poly([[-0.06, 0], [0.06, 0], [0.05, -0.42], [-0.05, -0.42]]), CLOAK, {});
    arm.position.set(0.36, 0.5, 0.13); arm.rotation.z = 0.55;
    vis.add(arm);
    return { group, vis, legL, legR, head, cane, arm };
  }

  function animWalk() {
    const s = Math.sin(walkPh);
    parts.legL.rotation.z = s * 0.5;
    parts.legR.rotation.z = -s * 0.5;
    parts.vis.position.y = -0.03 + Math.abs(s) * 0.05;
    parts.head.rotation.z = -0.28 + s * 0.05;
  }
  function animRaise(l) {
    const e = U.ease.outCubic(U.clamp(l, 0, 1));
    parts.cane.rotation.z = U.lerp(0.2, RAISED_ROT, e);
    parts.cane.position.y = U.lerp(0.12, RAISED_Y, e);
    parts.cane.position.x = U.lerp(0.54, 0.32, e);
    parts.head.rotation.z = U.lerp(-0.28, 0.06, e);
    parts.vis.rotation.z = U.lerp(0, 0.05, e);
  }
  function animSmash(l) {
    const e = Math.min(1, l / 0.45);
    const k = e * e;
    parts.cane.rotation.z = U.lerp(RAISED_ROT, 0, k);
    parts.cane.position.y = U.lerp(RAISED_Y, 0.0, k);
    parts.cane.position.x = U.lerp(0.32, 0.5, k);
    parts.vis.rotation.z = U.lerp(0.05, -0.12, k);
    parts.head.rotation.z = U.lerp(0.06, -0.4, k);
    if (!smashed && l >= 0.45) {
      smashed = true; hardBlack = true;
      G.Audio.caneSmash(); G.Audio.prologueStop();
      if (G.FX) G.FX.shake(0.45, 0.5);
    }
  }

  function drawRain(ctx, w, h) {
    ctx.save();
    ctx.strokeStyle = 'rgba(180,205,230,0.32)'; ctx.lineWidth = 1.1;
    ctx.beginPath();
    for (const d of rain) {
      const x = d.x * w, y = d.y * h, ln = d.len * h;
      ctx.moveTo(x, y); ctx.lineTo(x - ln * 0.18, y + ln);
    }
    ctx.stroke();
    ctx.restore();
  }
  function drawCard(ctx, w, h, top, main, sub) {
    ctx.save(); ctx.textAlign = 'center'; ctx.fillStyle = '#e8e4da';
    ctx.font = `italic ${Math.round(h * 0.026)}px ${serif}`;
    ctx.fillText(top, w / 2, h * 0.445);
    ctx.font = `${Math.round(h * 0.058)}px ${serif}`;
    ctx.fillText(main, w / 2, h * 0.52);
    ctx.font = `italic ${Math.round(h * 0.026)}px ${serif}`;
    ctx.fillText(sub, w / 2, h * 0.575);
    ctx.restore();
  }
  function drawTitle(ctx, w, h, a) {
    ctx.save(); ctx.globalAlpha = U.clamp(a, 0, 1); ctx.textAlign = 'center';
    ctx.fillStyle = '#eaf2ee'; ctx.shadowColor = 'rgba(160,240,200,0.5)'; ctx.shadowBlur = 30;
    ctx.font = `${Math.round(h * 0.1)}px ${serif}`;
    ctx.fillText('M O S S V E I L', w / 2, h * 0.47);
    ctx.shadowBlur = 0; ctx.font = `italic ${Math.round(h * 0.028)}px ${serif}`;
    ctx.fillStyle = 'rgba(200,220,210,0.85)';
    ctx.fillText('—  e c h o e s   b e n e a t h  —', w / 2, h * 0.47 + h * 0.06);
    ctx.restore();
  }

  function newDrop(spread) { return { x: Math.random(), y: spread ? Math.random() : -0.05, len: 0.03 + Math.random() * 0.04, sp: 0.85 + Math.random() * 0.5 }; }

  P.start = function (onDone) {
    doneCb = onDone;
    G.LEVELS.prologue = makeLevel();
    const sp = G.World.load('prologue', 'P');
    groundY = sp.y;
    // wet, storm-lit ground: the rain reflects on a glossy floor and the grade goes cold & dark
    if (G.Post) {
      G.Post.setWater({ y: groundY - 0.35, strength: 0.5, color: '#8fb0c8', ripple: 1.5, fade: 1.3 });
      G.Post.setGrade({ exposure: 0.95, contrast: 1.17, saturation: 1.0, vignette: 0.56, bloom: 0.66 });
    }
    if (G.player) G.player.root.visible = false;
    parts = buildOldMan(); man = parts.group;
    walkX = sp.x; walkPh = 0; walkSpeed = 1.5;
    man.position.set(walkX, groundY + 0.82, 0);
    G.scene.add(man);
    camX = walkX + 2.6; camY = groundY + 1.7; camZ = 17;
    phaseI = 0; t = 0; hardBlack = false; smashed = false; visTime = 0;
    thunderT = 3; flashA = 0; titleAlpha = 0;
    rain = []; for (let i = 0; i < 130; i++) rain.push(newDrop(true));
    P.active = true;
    G.Audio.prologueStart();
    G.Audio.thunder(); flashA = 0.8;
    if (G.Post) G.Post.flash(0.4, 0xcfe0ff);
  };

  function nextPhase() {
    phaseI++;
    if (phaseI >= PHASES.length) { P.finish(); return; }
    const ph = PHASES[phaseI].n;
    if (ph === 'raise') { parts.legL.rotation.z = 0; parts.legR.rotation.z = 0; parts.vis.position.y = 0; G.Audio.prologueResolve(); }
  }

  P.update = function (dt) {
    if (!P.active) return;
    const ph = PHASES[phaseI].n, dur = PHASES[phaseI].d, l = t / dur;
    thunderT -= dt;
    if (thunderT <= 0 && !smashed) { thunderT = 3; G.Audio.thunder(); flashA = 0.82; if (G.Post) G.Post.flash(0.4, 0xcfe0ff); }   // rain/thunder cease at the smash
    flashA = Math.max(0, flashA - dt * 2.2);
    for (const d of rain) { d.y += d.sp * dt; if (d.y > 1.06) { d.x = Math.random(); d.y = -0.05; d.sp = 0.85 + Math.random() * 0.5; } }
    if (WALKING.has(ph)) { walkX += walkSpeed * dt; walkPh += dt * walkSpeed * 2.6; animWalk(); }
    if (VISIBLE.has(ph)) visTime += dt;
    if (ph === 'raise') animRaise(l);
    if (ph === 'smash') animSmash(l);
    if (ph === 'titleIn') titleAlpha = U.clamp(l, 0, 1);
    else if (ph === 'titleHold') titleAlpha = 1;
    else if (ph === 'titleOut') titleAlpha = U.clamp(1 - l, 0, 1);
    if (man) man.position.x = walkX;
    camX = U.damp(camX, walkX + 2.6, 4, dt);
    G.camera.position.set(camX, camY, camZ);
    t += dt;
    if (t >= dur) { t -= dur; nextPhase(); }
  };

  P.drawHUD = function (ctx, w, h) {
    const ph = PHASES[phaseI] ? PHASES[phaseI].n : 'titleOut';
    if (VISIBLE.has(ph) && !hardBlack) {
      drawRain(ctx, w, h);
      const fb = U.clamp(1 - visTime / 8, 0, 1);                  // slow 8s reveal from black
      if (fb > 0.001) { ctx.fillStyle = `rgba(2,4,7,${fb})`; ctx.fillRect(0, 0, w, h); }
      if (flashA > 0.01) { ctx.fillStyle = `rgba(205,222,255,${flashA * 0.45})`; ctx.fillRect(0, 0, w, h); }
    } else {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
    }
    if (ph === 'card1') drawCard(ctx, w, h, 'a', 'TITIT CROISSANT GAMES', 'production');
    if (ph === 'card2') drawCard(ctx, w, h, 'a', 'Dylann André Fontus', 'game');
    if (titleAlpha > 0.001) drawTitle(ctx, w, h, titleAlpha);
    const bar = BAR * h;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, bar); ctx.fillRect(0, h - bar, w, bar);
  };

  P.skip = function () { if (P.active) P.finish(); };

  // headless test hooks
  P._phase = () => (PHASES[phaseI] ? PHASES[phaseI].n : null);
  P._seek = (name, localT) => {
    const i = PHASES.findIndex(ph => ph.n === name);
    if (i < 0) return; phaseI = i; t = localT || 0; visTime = 6; hardBlack = name === 'blackHold' || name === 'titleIn' || name === 'titleHold' || name === 'titleOut';
    if (name === 'raise') { parts.legL.rotation.z = 0; parts.legR.rotation.z = 0; animRaise(1); }
    if (name === 'titleIn' || name === 'titleHold') titleAlpha = 1;
  };

  P.finish = function () {
    if (!P.active) return;
    P.active = false;
    if (man) { G.scene.remove(man); U.disposeDeep && U.disposeDeep(man); man = null; parts = null; }
    if (G.Post) G.Post.setWater(null);   // drop the wet ground; the next room sets its own look
    G.Audio.prologueStop();
    const cb = doneCb; doneCb = null;
    if (cb) cb();
  };
})();
