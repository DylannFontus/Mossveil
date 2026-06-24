// MOSSVEIL — weather.js : per-room atmosphere. Each preset is a blend of properties
// (rain, snow, leaves, embers, fog, wind, lightning, wetness) so effects can stack and
// share one wind/gust model. Drawn on a 2D canvas (HUD in-game, overlay in the editor);
// lightning couples to the bloom flash + thunder, and the wet look nudges the grade +
// any water reflection. Author it per level from the editor's Level settings.
(function () {
  const U = G.U;
  const W = G.Weather = { kind: 'none', userEnabled: true };   // userEnabled toggled by the Settings menu

  // preset → properties. rain/snow/leaves/embers are particle densities (0..1),
  // wind is horizontal strength, fog is haze, wet drives reflection+grade, lightning bool.
  const PRESETS = {
    none: {},
    rain: { rain: 0.6, wet: 0.6, wind: 0.18 },
    storm: { rain: 1.0, wet: 1.0, wind: 0.55, lightning: 1, fog: 0.15 },
    wind: { leaves: 0.7, wind: 1.0 },
    fog: { fog: 0.75, wind: 0.25 },
    snow: { snow: 0.7, wind: 0.3, fog: 0.2 },
    embers: { embers: 0.6, wind: 0.28, fog: 0.12 },
    blizzard: { snow: 1.0, wind: 1.0, fog: 0.45 }
  };
  W.KINDS = Object.keys(PRESETS);
  W.LABELS = { none: 'Clear', rain: 'Rain', storm: 'Thunderstorm', wind: 'Windy', fog: 'Fog / mist', snow: 'Snow', embers: 'Embers / ash', blizzard: 'Blizzard' };

  let P = {}, parts = [], fogBlobs = [], t = 0, lT = 0, lightFlash = 0, splashT = 0;

  function makeParts() {
    parts = [];
    const add = (type, n, mk) => { for (let i = 0; i < n; i++) parts.push(Object.assign({ type }, mk())); };
    if (P.rain) add('rain', Math.round(150 * P.rain), () => ({ x: Math.random(), y: Math.random(), sp: 0.9 + Math.random() * 0.6, len: 0.02 + Math.random() * 0.045 }));
    if (P.snow) add('snow', Math.round(130 * P.snow), () => ({ x: Math.random(), y: Math.random(), sp: 0.05 + Math.random() * 0.07, r: 1 + Math.random() * 2.2, ph: Math.random() * 6.28, sw: 0.3 + Math.random() * 0.7 }));
    if (P.leaves) add('leaf', Math.round(28 * P.leaves), () => ({ x: Math.random(), y: Math.random(), sp: 0.12 + Math.random() * 0.16, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 6, sz: 3 + Math.random() * 4, hue: Math.random() }));
    if (P.embers) add('ember', Math.round(60 * P.embers), () => ({ x: Math.random(), y: Math.random(), sp: 0.04 + Math.random() * 0.06, r: 0.8 + Math.random() * 1.6, ph: Math.random() * 6.28, fl: 0.5 + Math.random() * 0.5 }));
    fogBlobs = P.fog ? Array.from({ length: 5 }, (_, i) => ({ x: Math.random(), y: 0.2 + Math.random() * 0.7, sp: 0.01 + Math.random() * 0.02, r: 0.35 + Math.random() * 0.3, a: 0.05 + Math.random() * 0.06 })) : [];
  }

  W.set = function (kind) {
    kind = (kind && PRESETS[kind]) ? kind : 'none';
    if (kind === W.kind && parts.length) return;
    W.kind = kind;
    P = PRESETS[kind];
    lightFlash = 0; t = 0; splashT = 0;
    lT = P.lightning ? U.rand(2, 5) : 0;
    makeParts();
  };

  // current wind value with slow gusts (screen-fractions / sec, signed)
  function wind() { return (P.wind || 0) * (0.55 + 0.45 * Math.sin(t * 0.7) + 0.25 * Math.sin(t * 2.3 + 1.7)); }
  W.windVec = function () { return wind(); };         // signed gusty wind (used by the fire system to drift flames & spread fire)

  W.update = function (dt) {
    t += dt;
    lightFlash = Math.max(0, lightFlash - dt * 3.2);
    if (W.kind === 'none' || W.userEnabled === false) return;
    const wx = wind();
    for (const d of parts) {
      if (d.type === 'rain') { d.y += d.sp * dt; d.x += wx * 0.35 * dt; if (d.y > 1.05) { d.x = Math.random(); d.y = -0.05; } }
      else if (d.type === 'snow') { d.y += d.sp * dt; d.x += (wx * 0.5 + Math.sin(d.ph + t * d.sw) * 0.03) * dt; if (d.y > 1.05) { d.x = Math.random(); d.y = -0.05; } }
      else if (d.type === 'leaf') { d.x += (wx * 1.1 + 0.05) * dt; d.y += (d.sp * 0.3 + Math.sin(t * 1.3 + d.ph || 0) * 0.05) * dt; d.rot += d.vr * dt; if (d.x > 1.08) { d.x = -0.06; d.y = Math.random(); } if (d.y > 1.05) d.y = -0.05; }
      else if (d.type === 'ember') { d.y -= d.sp * dt; d.x += (wx * 0.7) * dt; d.ph += dt * 6; if (d.y < -0.05) { d.y = 1.05; d.x = Math.random(); } }
      if (d.x > 1.08) d.x -= 1.16; else if (d.x < -0.08) d.x += 1.16;
    }
    for (const f of fogBlobs) { f.x += (f.sp + wx * 0.4) * dt; if (f.x > 1.3) f.x -= 1.6; }
    // lightning
    if (P.lightning) {
      lT -= dt;
      if (lT <= 0) {
        lT = U.rand(3.5, 9);
        lightFlash = 1;
        if (G.Post) { G.Post.flash(0.5, 0xcfe0ff); G.Post.punch(0.35); }
        if (G.Audio && G.Audio.thunder) setTimeout(() => { try { G.Audio.thunder(); } catch (_) { } }, U.rand(220, 900));
      }
    }
    // rain puddle ripples around the player (only during normal play)
    if (P.rain && G.player && G.player.body && G.FX && !G.EDITOR && G.Main && G.Main.state === 'play') {
      splashT -= dt;
      if (splashT <= 0) { splashT = 0.06 / P.rain; const b = G.player.body; G.FX.ring(b.x + U.rand(-10, 10), b.y - 0.62, { r0: 0.05, r1: 0.5, life: 0.35, color: 0x9fc8e0, alpha: 0.22 }); }
    }
  };

  W.draw = function (ctx, w, h) {
    if (W.userEnabled === false) return;
    if (W.kind === 'none' && lightFlash <= 0.01) return;
    ctx.save();
    // fog haze first (behind particles)
    for (const f of fogBlobs) {
      const g = ctx.createRadialGradient(f.x * w, f.y * h, 0, f.x * w, f.y * h, f.r * w);
      g.addColorStop(0, 'rgba(200,210,220,' + (f.a * (P.fog || 0)).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(200,210,220,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
    // rain as one stroked path
    const rainParts = [];
    for (const d of parts) {
      if (d.type === 'rain') { rainParts.push(d); continue; }
      if (d.type === 'snow') { ctx.fillStyle = 'rgba(238,244,250,0.85)'; ctx.beginPath(); ctx.arc(d.x * w, d.y * h, d.r, 0, 6.28); ctx.fill(); }
      else if (d.type === 'leaf') {
        ctx.save(); ctx.translate(d.x * w, d.y * h); ctx.rotate(d.rot);
        ctx.fillStyle = d.hue < 0.5 ? 'rgba(150,110,50,0.8)' : 'rgba(110,140,70,0.8)';
        ctx.beginPath(); ctx.ellipse(0, 0, d.sz, d.sz * 0.5, 0, 0, 6.28); ctx.fill(); ctx.restore();
      } else if (d.type === 'ember') {
        const a = (0.5 + 0.5 * Math.sin(d.ph)) * d.fl;
        ctx.fillStyle = 'rgba(255,' + (150 + (a * 80) | 0) + ',70,' + (0.5 + a * 0.4).toFixed(2) + ')';
        ctx.beginPath(); ctx.arc(d.x * w, d.y * h, d.r, 0, 6.28); ctx.fill();
      }
    }
    if (rainParts.length) {
      const wx = wind();
      ctx.strokeStyle = 'rgba(184,208,232,0.26)'; ctx.lineWidth = 1.1; ctx.beginPath();
      for (const d of rainParts) { const x = d.x * w, y = d.y * h; ctx.moveTo(x, y); ctx.lineTo(x + wx * 14 - 2.2, y + d.len * h); }
      ctx.stroke();
    }
    if (lightFlash > 0.01) { ctx.fillStyle = 'rgba(200,220,255,' + (lightFlash * 0.11).toFixed(3) + ')'; ctx.fillRect(0, 0, w, h); }
    ctx.restore();
  };

  // colour-grade nudge for the active weather, merged onto the biome grade by world.js
  W.gradeFor = function (base) {
    if (W.kind === 'none') return base;
    const g = Object.assign({}, base);
    const wet = P.wet || 0, fog = P.fog || 0;
    if (wet) { g.exposure = (base.exposure || 1.05) * (1 - 0.07 * wet); g.contrast = (base.contrast || 1.05) + 0.08 * wet; g.saturation = (base.saturation || 1.14) + 0.05 * wet; g.bloom = (base.bloom || 0.6) + 0.05 * wet; }
    if (fog) { g.contrast = (g.contrast || base.contrast || 1.05) - 0.06 * fog; g.exposure = (g.exposure || base.exposure || 1.05) + 0.04 * fog; g.vignette = Math.min(0.72, (base.vignette || 0.46) + 0.08 * fog); }
    if (P.snow) g.saturation = (g.saturation || base.saturation || 1.14) - 0.08 * P.snow;
    if (P.embers) g.exposure = (g.exposure || base.exposure || 1.05) + 0.03;
    return g;
  };
  W.props = function () { return P; };
})();
