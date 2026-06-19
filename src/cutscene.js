// MOSSVEIL — cutscene.js : data-driven cinematic timeline runtime.
// A cutscene is { id, name, level, skippable, events:[{t,dur,type,...params}] }.
// Events write to a persistent state (player pose, letterbox, fade, blur, text, camera)
// that is composited each frame. Used by the game (intro / on-enter) and the editor.
(function () {
  const U = G.U;
  const BAR_MAX = 0.135;     // each letterbox bar covers up to this fraction of the height
  const serif = 'Georgia, "Times New Roman", serif';

  // ---- floating emote symbol above the protagonist (!, ?, ..., music note, heart, z) ----
  function symbolTex(symbol, color) {
    const [c, x] = U.makeCanvas(128, 128);
    x.font = 'bold 86px Georgia, serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.lineWidth = 9;
    x.strokeStyle = 'rgba(0,0,0,0.55)';
    x.strokeText(symbol, 64, 70);
    x.fillStyle = color ? U.css(color) : '#ffffff';
    x.fillText(symbol, 64, 70);
    const tex = new THREE.CanvasTexture(c);
    tex.userData = { ownMap: true };
    return tex;
  }
  function spawnEmote(cs, symbol, color) {
    if (!G.scene) return;
    const tex = symbolTex(symbol || '!', color);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(1.2, 1.2, 1);
    sp.position.set(cs.pose.rootX, cs.pose.rootY + 2.1, 0.6);
    G.scene.add(sp);
    cs._sprites.push({ sp, t: 0, life: 1.6, pop: 0 });
  }
  function updateSprites(cs, dt) {
    for (let i = cs._sprites.length - 1; i >= 0; i--) {
      const e = cs._sprites[i];
      e.t += dt;
      const k = e.t / e.life;
      e.sp.position.x = cs.pose.rootX;
      e.sp.position.y = cs.pose.rootY + 2.1 + Math.min(0.7, e.t * 1.4);
      const pop = e.t < 0.18 ? U.ease.outBack(e.t / 0.18) : 1;
      e.sp.scale.setScalar(1.2 * pop);
      e.sp.material.opacity = e.t < 0.18 ? e.t / 0.18 : Math.max(0, 1 - (k - 0.11) / 0.89);
      if (e.t >= e.life) { G.scene.remove(e.sp); e.sp.material.map.dispose(); e.sp.material.dispose(); cs._sprites.splice(i, 1); }
    }
  }
  function clearSprites(cs) {
    if (!cs._sprites) return;
    for (const e of cs._sprites) { G.scene.remove(e.sp); e.sp.material.map.dispose(); e.sp.material.dispose(); }
    cs._sprites.length = 0;
  }
  const phase = (cs, ev) => cs.time - ev.t; // seconds into the event

  // ---- event handlers: each may define start(cs,ev), run(cs,ev,dt,local), end(cs,ev) ----
  const HANDLERS = {
    fade: { run(cs, ev, dt, l) { cs.fadeAlpha = U.lerp(ev.from, ev.to, U.ease.inOutQuad(l)); } },
    letterbox: { run(cs, ev, dt, l) { cs.barFrac = U.lerp(ev.from, ev.to, U.ease.inOutQuad(l)); } },
    blur: { run(cs, ev, dt, l) { cs.blurPx = U.lerp(ev.from, ev.to, U.ease.inOutQuad(l)); } },

    text: {
      start(cs, ev) { G.Audio.sfx('chime'); },
      run(cs, ev, dt, l) {
        const fi = 0.16, fo = 0.16;
        let a = 1;
        if (l < fi) a = l / fi; else if (l > 1 - fo) a = (1 - l) / fo;
        cs.text = { str: ev.text || '', alpha: U.clamp(a, 0, 1) };
      },
      end(cs) { cs.text = null; }
    },

    camera: {
      run(cs, ev, dt, l) {
        if (!ev._rt) ev._rt = { from: { x: cs.cam.x, y: cs.cam.y, z: cs.cam.z } };
        const e = U.ease.inOutQuad(l);
        cs.cam.x = U.lerp(ev._rt.from.x, cs.spawnX + (ev.dx || 0), e);
        cs.cam.y = U.lerp(ev._rt.from.y, cs.spawnY + (ev.dy || 0), e);
        cs.cam.z = U.lerp(ev._rt.from.z, ev.z !== undefined ? ev.z : ev._rt.from.z, e);
      }
    },
    // dolly the camera back to exactly where gameplay will frame it, for a seamless handoff
    cameraRestore: {
      run(cs, ev, dt, l) {
        if (!ev._rt) {
          const to = (cs.gameplayCam && cs.gameplayCam()) || { x: cs.spawnX + 1.7, y: cs.spawnY + 1.2, z: 30 };
          ev._rt = { from: { x: cs.cam.x, y: cs.cam.y, z: cs.cam.z }, to };
        }
        const e = U.ease.inOutQuad(l);
        cs.cam.x = U.lerp(ev._rt.from.x, ev._rt.to.x, e);
        cs.cam.y = U.lerp(ev._rt.from.y, ev._rt.to.y, e);
        cs.cam.z = U.lerp(ev._rt.from.z, ev._rt.to.z, e);
      }
    },

    shakePulse: { start(cs, ev) { G.FX.shake(ev.amp || 0.3, ev.dur || 0.4); } },
    sfx: { start(cs, ev) { G.Audio.sfx(ev.name || 'uiBell'); } },
    hold: {},

    // protagonist rises out of the earth — clip reveal + erupting debris + tremor
    riseFromGround: {
      start(cs, ev) {
        ev._rt = { y0: cs.pose.rootY };
        cs.clipY = cs.spawnY - 0.6;
        G.Audio.sfx('rumble');
        G.FX.shake(0.3, 0.6);
        G.FX.burst('dust', cs.spawnX, cs.spawnY - 0.55, { n: 16 });
        G.FX.burst('gib', cs.spawnX, cs.spawnY - 0.55, { n: 8, color: 0x3a2c20 });
      },
      run(cs, ev, dt, l) {
        const sm = l * l * (3 - 2 * l);                 // smoothstep
        cs.pose.rootY = U.lerp(ev._rt.y0, cs.spawnY, sm);
        cs.pose.stand = U.lerp(0.12, 0.22, l);
        cs.pose.eyeOpen = 0;
        cs.pose.glowScale = U.lerp(4.5, 6.5, Math.sin(l * Math.PI));
        cs.pose.glowBoost = 0.05 + 0.13 * Math.sin(l * Math.PI);
        G.FX.shake(0.04 + 0.07 * (1 - l), 0.12);
        const sx = cs.spawnX, sy = cs.spawnY - 0.55;
        if (Math.random() < dt * 18) G.FX.burst('dust', sx + U.rand(-1.3, 1.3), sy, { n: 2 });
        if (Math.random() < dt * 6) G.FX.burst('gib', sx + U.rand(-0.9, 0.9), sy, { n: 2, color: 0x3a2c20 });
        if (Math.random() < dt * 8) G.FX.p(true, { x: sx + U.rand(-0.9, 0.9), y: sy + U.rand(0, 1.2), vx: U.rand(-0.5, 0.5), vy: U.rand(1, 3), life: U.rand(0.6, 1.3), size: U.rand(0.1, 0.26), color: 0xcfe8e0, alpha: 0.7 });
        // occasional ground-crack flare while still buried
        if (l < 0.5 && Math.random() < dt * 3) G.FX.ring(sx + U.rand(-0.6, 0.6), sy, { r1: 1.6, life: 0.4, color: 0xcfe8e0, alpha: 0.4 });
      },
      end(cs, ev) {
        cs.clipY = null;
        cs.pose.rootY = cs.spawnY;
        cs.pose.glowBoost = 0;
        G.Audio.sfx('quake');
        G.FX.shake(0.45, 0.5);
        G.FX.hitStop(0.05);
        G.FX.ring(cs.spawnX, cs.spawnY - 0.4, { r1: 5.5, life: 0.7, color: 0xcfe8e0, alpha: 0.6 });
        G.FX.burst('land', cs.spawnX, cs.spawnY - 0.55);
        G.FX.burst('soul', cs.spawnX, cs.spawnY + 0.2, { n: 12 });
        G.FX.burst('gib', cs.spawnX, cs.spawnY - 0.5, { n: 10, color: 0x3a2c20 });
      }
    },

    wake: {
      start(cs) { G.Audio.sfx('soul'); G.FX.burst('soul', cs.spawnX, cs.spawnY + 0.3, { n: 5 }); },
      run(cs, ev, dt, l) {
        cs.pose.eyeOpen = U.ease.outQuad(l);
        cs.pose.headTurn = Math.sin(l * 24) * 0.05 * (1 - l);
        if (l > 0.5 && !ev._jolt) { ev._jolt = true; G.FX.shake(0.12, 0.18); }
      }
    },

    stand: {
      run(cs, ev, dt, l) {
        if (!ev._rt) ev._rt = { s0: cs.pose.stand };
        cs.pose.stand = U.lerp(ev._rt.s0, 1, U.ease.inOutQuad(l));
        cs.pose.eyeOpen = 1;
        if (l > 0.55 && !ev._step) { ev._step = true; G.FX.burst('dust', cs.spawnX, cs.spawnY - 0.55, { n: 5 }); G.Audio.sfx('drop'); }
      }
    },

    look: {
      run(cs, ev, dt, l) {
        if (!ev._rt) ev._rt = { f0: cs.pose.facing };
        cs.pose.facing = U.lerp(ev._rt.f0, ev.dir, U.ease.inOutQuad(l));
        const dir = ev.dir >= ev._rt.f0 ? 1 : -1;
        cs.pose.headTurn = Math.sin(l * Math.PI) * 0.22 * dir;
      },
      end(cs) { cs.pose.headTurn = 0; }
    },

    // ---------------- expressive / emotive animations ----------------
    talk: {
      start(cs) { cs.pose.stand = 1; },
      run(cs, ev, dt, l) {
        const ph = phase(cs, ev) * (ev.speed || 9);
        const b = Math.abs(Math.sin(ph));
        cs.pose.expr = { headBob: -b * 0.05, bob: Math.sin(ph) * 0.012, squash: Math.sin(ph) * 0.02 };
        if (Math.random() < dt * 7) G.Audio.sfx('talk');
      },
      end(cs) { cs.pose.expr = null; }
    },
    confused: {
      start(cs) { cs.pose.stand = 1; spawnEmote(cs, '?', 0xcfe0ff); G.Audio.sfx('talk'); },
      run(cs, ev, dt, l) {
        const ph = phase(cs, ev);
        cs.pose.expr = { headTilt: Math.sin(ph * 2.4) * 0.26, headBob: Math.sin(ph * 2.4 + 1) * 0.03, lean: Math.sin(ph * 2.4) * 0.05 };
      },
      end(cs) { cs.pose.expr = null; }
    },
    surprised: {
      start(cs) { cs.pose.stand = 1; spawnEmote(cs, '!', 0xfff0a0); G.FX.shake(0.18, 0.25); G.Audio.sfx('clink'); },
      run(cs, ev, dt, l) {
        const j = Math.exp(-l * 4.5);
        cs.pose.expr = { bob: j * 0.32, squash: -j * 0.18, eye: 1 + j * 0.7, headBob: j * 0.06 };
      },
      end(cs) { cs.pose.expr = null; }
    },
    nod: {
      start(cs) { cs.pose.stand = 1; },
      run(cs, ev, dt, l) {
        const ph = phase(cs, ev) * (ev.speed || 6);
        cs.pose.expr = { headBob: -Math.abs(Math.sin(ph)) * 0.09, bob: -Math.abs(Math.sin(ph)) * 0.02 };
      },
      end(cs) { cs.pose.expr = null; }
    },
    shakeHead: {
      start(cs) { cs.pose.stand = 1; },
      run(cs, ev, dt, l) {
        const ph = phase(cs, ev) * (ev.speed || 7);
        cs.pose.expr = { headJx: Math.sin(ph) * 0.08, headTilt: Math.sin(ph) * 0.06 };
      },
      end(cs) { cs.pose.expr = null; }
    },
    laugh: {
      start(cs) { cs.pose.stand = 1; spawnEmote(cs, '♪', 0xa8f0c8); },
      run(cs, ev, dt, l) {
        const ph = phase(cs, ev) * 11;
        const b = Math.abs(Math.sin(ph));
        cs.pose.expr = { bob: b * 0.09, squash: Math.sin(ph) * 0.05, headTilt: -0.13 + Math.sin(ph) * 0.03, lean: -0.05 };
      },
      end(cs) { cs.pose.expr = null; }
    },
    sad: {
      start(cs) { spawnEmote(cs, '…', 0x9fb0c0); },
      run(cs, ev, dt, l) {
        cs.pose.stand = 0.82;
        const ph = phase(cs, ev);
        cs.pose.expr = { headBob: -0.13 + Math.sin(ph * 1.1) * 0.012, headTilt: 0.05, lean: 0.07, bob: -0.05 };
      },
      end(cs) { cs.pose.expr = null; }
    },
    fear: {
      start(cs) { G.Audio.sfx('talk'); },
      run(cs, ev, dt, l) {
        cs.pose.stand = 0.9;
        cs.pose.expr = { jx: U.rand(-0.035, 0.035), bob: U.rand(-0.02, 0.02), headJx: U.rand(-0.025, 0.025), headBob: -0.04, squash: -0.05 };
      },
      end(cs) { cs.pose.expr = null; }
    },
    excited: {
      start(cs) { cs.pose.stand = 1; spawnEmote(cs, '!', 0xa8f0c8); },
      run(cs, ev, dt, l) {
        const ph = phase(cs, ev) * 8;
        const hop = Math.max(0, Math.sin(ph));
        cs.pose.expr = { bob: hop * 0.2, squash: -hop * 0.09, headBob: hop * 0.03 };
        if (hop < 0.06 && Math.random() < dt * 30) G.FX.burst('dust', cs.pose.rootX, cs.pose.rootY - 0.55, { n: 2 });
      },
      end(cs) { cs.pose.expr = null; }
    },
    collapse: {
      start(cs) { G.Audio.sfx('drop'); G.FX.burst('dust', cs.pose.rootX, cs.pose.rootY - 0.5, { n: 6 }); },
      run(cs, ev, dt, l) {
        cs.pose.stand = U.lerp(1, 0, U.ease.inQuad(l));
        cs.pose.eyeOpen = U.lerp(1, 0.25, l);
        cs.pose.expr = { lean: U.ease.inQuad(l) * 0.15 * (cs.pose.facing < 0 ? -1 : 1) };
      },
      end(cs) { cs.pose.expr = null; }
    },
    walk: {
      run(cs, ev, dt, l) {
        if (!ev._rt) ev._rt = { x0: cs.pose.rootX, to: cs.spawnX + (ev.dx || 0) };
        cs.pose.stand = 1;
        const e = U.ease.inOutQuad(l);
        cs.pose.rootX = U.lerp(ev._rt.x0, ev._rt.to, e);
        const dir = ev._rt.to >= ev._rt.x0 ? 1 : -1;
        cs.pose.facing = dir;
        const ph = phase(cs, ev) * 9;
        cs.pose.expr = { legSwing: Math.sin(ph) * 0.5, bob: Math.abs(Math.sin(ph)) * 0.05, lean: -dir * 0.06 };
        if (Math.abs(Math.sin(ph)) > 0.95 && Math.random() < dt * 30) G.FX.burst('dust', cs.pose.rootX - dir * 0.3, cs.pose.rootY - 0.55, { n: 1 });
      },
      end(cs) { cs.pose.expr = null; }
    },
    emote: { start(cs, ev) { spawnEmote(cs, ev.symbol || '!', ev.color); } },
    flash: {
      run(cs, ev, dt, l) { cs.flash = { a: Math.pow(1 - l, 2), color: ev.color !== undefined ? ev.color : 0xffffff }; },
      end(cs) { cs.flash = null; }
    }
  };

  const C = G.Cutscene = {
    active: null,
    glCanvas: null,

    start(id, opts = {}) {
      const data = G.CUTSCENES && G.CUTSCENES[id];
      if (!data || !data.events) { if (opts.onDone) opts.onDone(); return; }
      const cs = JSON.parse(JSON.stringify(data));
      cs.spawnX = opts.spawnX !== undefined ? opts.spawnX : (G.player ? G.player.body.x : 5);
      cs.spawnY = opts.spawnY !== undefined ? opts.spawnY : (G.player ? G.player.body.y : 5);
      cs.onDone = opts.onDone;
      cs.gameplayCam = opts.gameplayCam || null;
      cs.inPlaceKeepPos = !!opts.inPlace;
      cs.time = 0; cs._done = false;
      cs.total = cs.events.reduce((m, e) => Math.max(m, e.t + (e.dur || 0)), 0.1) + 0.05;
      cs.barFrac = (opts.inPlace && data.letterboxStart) ? 1 : 0;
      cs.fadeAlpha = opts.inPlace ? 0 : 1;   // in-place dialogue doesn't fade from black
      cs.blurPx = 0; cs.text = null; cs.clipY = null; cs.flash = null;
      cs._sprites = [];
      const facing0 = opts.facing !== undefined ? opts.facing : 1;
      cs.cam = opts.startCam ? { x: opts.startCam.x, y: opts.startCam.y, z: opts.startCam.z } : { x: cs.spawnX, y: cs.spawnY + 1.4, z: 30 };
      cs.pose = { rootX: cs.spawnX, rootY: cs.spawnY, stand: 0.2, eyeOpen: 0, facing: facing0, headTurn: 0, glowBoost: 0, glowScale: 5.5, expr: null };
      const rise = cs.events.find(e => e.type === 'riseFromGround');
      if (rise) {
        cs.pose.rootY = cs.spawnY - (rise.depth || 2.4); cs.pose.stand = 0.12; cs.clipY = cs.spawnY - 0.6;
      } else {
        // no underground rise → start already standing (dialogue / in-place cutscenes)
        cs.pose.stand = 1; cs.pose.eyeOpen = 1; cs.pose.glowScale = 9; cs.pose.glowBoost = 0;
      }
      this.glCanvas = G.renderer && G.renderer.domElement;
      if (G.renderer) G.renderer.localClippingEnabled = true;
      if (G.player) { G.player.cinematic = true; }
      // hide the foreground silhouette layer so it can't block the close-up camera
      this._hidFg = (G.room && G.room.foreground) || null;
      if (this._hidFg) this._hidFg.visible = false;
      this.active = cs;
      this._apply();
    },

    step(dt) {
      const cs = this.active;
      if (!cs || cs._done) return;
      cs.time += dt;
      for (const ev of cs.events) {
        const t1 = ev.t + Math.max(ev.dur || 0, 1e-4);
        if (cs.time >= ev.t && !ev._started) {
          ev._started = true;
          const h = HANDLERS[ev.type];
          if (h && h.start) h.start(cs, ev);
        }
        if (ev._started && !ev._ended) {
          const local = U.clamp((cs.time - ev.t) / Math.max(ev.dur || 0, 1e-4), 0, 1);
          const h = HANDLERS[ev.type];
          if (h && h.run) h.run(cs, ev, dt, local);
          if (cs.time >= t1) {
            ev._ended = true;
            if (h && h.end) h.end(cs, ev);
          }
        }
      }
      updateSprites(cs, dt);
      this._apply();
      if (cs.time >= cs.total) this.finish();
    },

    update(dt) { this.step(dt); },

    _apply() {
      const cs = this.active;
      if (!cs) return;
      if (G.player) {
        G.Player.cinePose(G.player, cs.pose);
        G.Player.cineClip(G.player, cs.clipY);
      }
      if (this.glCanvas) this.glCanvas.style.filter = cs.blurPx > 0.05 ? `blur(${cs.blurPx.toFixed(2)}px)` : '';
    },

    skip() {
      const cs = this.active;
      if (cs && cs.skippable !== false) this.finish();
    },

    finish() {
      const cs = this.active;
      if (!cs || cs._fin) return;
      cs._fin = true;
      cs.pose.stand = 1; cs.pose.eyeOpen = 1; cs.pose.headTurn = 0; cs.pose.expr = null;
      cs.pose.glowBoost = 0; cs.pose.glowScale = 9;
      if (!cs.inPlaceKeepPos) { cs.pose.facing = 1; cs.pose.rootY = cs.spawnY; }
      cs.clipY = null; cs.barFrac = 0; cs.fadeAlpha = 0; cs.blurPx = 0; cs.text = null; cs.flash = null;
      clearSprites(cs);
      if (G.player) {
        // carry the cutscene's final stance back to the body so a walk actually relocates the player
        if (cs.inPlaceKeepPos) {
          G.player.body.x = cs.pose.rootX;
          G.player.body.y = cs.pose.rootY;
          G.player.facing = cs.pose.facing < 0 ? -1 : 1;
        }
        G.Player.cinePose(G.player, cs.pose);
        G.Player.cineClip(G.player, null);
      }
      if (this._hidFg) { this._hidFg.visible = true; this._hidFg = null; }
      if (this.glCanvas) this.glCanvas.style.filter = '';
      const cb = cs.onDone;
      this.active = null;
      if (cb) cb();
    },

    // editor / test: jump to a timestamp by fast-forwarding from the start
    debugSeek(t) {
      const cs = this.active;
      if (!cs) return;
      cs.events.forEach(e => { e._started = e._ended = e._jolt = e._step = false; e._rt = null; });
      cs.time = 0; cs._done = false; cs._fin = false;
      cs.barFrac = 0; cs.fadeAlpha = 1; cs.blurPx = 0; cs.text = null; cs.flash = null;
      clearSprites(cs);
      cs.cam = { x: cs.spawnX, y: cs.spawnY + 1.4, z: 30 };
      cs.pose = { rootX: cs.spawnX, rootY: cs.spawnY, stand: 0.2, eyeOpen: 0, facing: 1, headTurn: 0, glowBoost: 0, glowScale: 5.5, expr: null };
      const rise = cs.events.find(e => e.type === 'riseFromGround');
      if (rise) { cs.pose.rootY = cs.spawnY - (rise.depth || 2.4); cs.pose.stand = 0.12; cs.clipY = cs.spawnY - 0.6; }
      else { cs.pose.stand = 1; cs.pose.eyeOpen = 1; cs.pose.glowScale = 9; }
      let guard = 0;
      while (this.active && cs.time < t && guard++ < 8000) { this.step(1 / 60); if (G.FX) G.FX.update(1 / 60); }
    },

    drawHUD(ctx, w, h) {
      const cs = this.active;
      const bar = (cs ? cs.barFrac : 0) * BAR_MAX * h;
      if (bar > 0.5) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, bar);
        ctx.fillRect(0, h - bar, w, bar);
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fillRect(0, bar - 1, w, 1);
        ctx.fillRect(0, h - bar, w, 1);
      }
      if (cs && cs.text && cs.text.alpha > 0.01) {
        ctx.save();
        ctx.globalAlpha = cs.text.alpha;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#eef2ee';
        ctx.shadowColor = 'rgba(0,0,0,0.85)';
        ctx.shadowBlur = 26;
        ctx.font = `italic ${Math.round(h * 0.058)}px ${serif}`;
        ctx.fillText(cs.text.str, w / 2, h * 0.5);
        ctx.restore();
      }
      const fa = cs ? cs.fadeAlpha : 0;
      if (fa > 0.001) { ctx.fillStyle = `rgba(2,4,6,${U.clamp(fa, 0, 1)})`; ctx.fillRect(0, 0, w, h); }
      if (cs && cs.flash && cs.flash.a > 0.004) {
        const c = new THREE.Color(cs.flash.color);
        ctx.fillStyle = `rgba(${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0},${U.clamp(cs.flash.a, 0, 1)})`;
        ctx.fillRect(0, 0, w, h);
      }
    }
  };
})();
