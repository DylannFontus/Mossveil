// MOSSVEIL — ui.js : HUD canvas overlay, titles, fades, menus
(function () {
  const U = G.U;
  const UI = G.UI = {};

  let cv, cx, w, h, dpr;
  let vignette = null;

  // transient state
  let prompts = [];
  let toasts = [];           // {text, t}
  let areaQ = [];            // queued area titles {text, t}
  let banners = [];          // placed text banners (from the Logic graph) {text, place, t, secs}
  let bossT = -1, bossText = '', bossSub = '';
  let maskFlash = 0, healFlash = 0, lowHpPulse = 0;
  const fade = { val: 1, target: 1, speed: 2, cb: null, iris: false, ix: null, iy: null };
  let deathTextT = 0;

  UI.init = () => {
    cv = document.getElementById('hud');
    cx = cv.getContext('2d');
    UI.resize();
  };

  UI.resize = () => {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = innerWidth; h = innerHeight;
    cv.width = w * dpr; cv.height = h * dpr;
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    // pre-render vignette
    vignette = document.createElement('canvas');
    vignette.width = w * dpr; vignette.height = h * dpr;
    const vc = vignette.getContext('2d');
    vc.scale(dpr, dpr);
    const rg = vc.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.42, w / 2, h / 2, Math.max(w, h) * 0.72);
    rg.addColorStop(0, 'rgba(0,0,0,0)');
    rg.addColorStop(1, 'rgba(2,6,8,0.55)');
    vc.fillStyle = rg;
    vc.fillRect(0, 0, w, h);
    const tg = vc.createLinearGradient(0, 0, 0, h * 0.18);
    tg.addColorStop(0, 'rgba(2,6,8,0.35)');
    tg.addColorStop(1, 'rgba(2,6,8,0)');
    vc.fillStyle = tg;
    vc.fillRect(0, 0, w, h * 0.18);
  };

  UI.prompt = (wx, wy, text, sign) => { prompts.push({ wx, wy, text, sign }); };
  UI.toast = text => { toasts.push({ text, t: 0 }); G.Audio.sfx('uiBell'); };
  UI.areaTitle = text => { areaQ.push({ text, t: 0 }); };
  // a placed text banner (Logic graph "Show Text" with a placement: top / center / bottom)
  UI.banner = (text, place, secs) => { banners.push({ text: text || '', place: place || 'center', t: 0, secs: secs || 2.5 }); };
  function drawBanners(dt) {
    for (let i = banners.length - 1; i >= 0; i--) {
      const b = banners[i]; b.t += dt;
      const total = b.secs + 0.8;
      if (b.t > total) { banners.splice(i, 1); continue; }
      const a = b.t < 0.4 ? b.t / 0.4 : b.t > b.secs ? Math.max(0, 1 - (b.t - b.secs) / 0.8) : 1;
      const y = b.place === 'top' ? h * 0.16 : b.place === 'bottom' ? h * 0.84 : h * 0.5;
      cx.save();
      cx.globalAlpha = a; cx.textAlign = 'center'; cx.textBaseline = 'middle';
      cx.font = `italic ${Math.round(h * 0.04)}px ${serif}`;
      cx.fillStyle = '#eef4ef'; cx.shadowColor = 'rgba(0,0,0,0.92)'; cx.shadowBlur = 14;
      b.text.split('\n').forEach((ln, k, arr) => cx.fillText(ln, w / 2, y + (k - (arr.length - 1) / 2) * h * 0.05));
      cx.restore();
    }
  }
  UI.bossTitle = (text, sub) => { bossText = text; bossSub = sub || ''; bossT = 0; };
  // persistent boss health bar (Hollow Knight style)
  const bossBar = { boss: null, name: '', maxHp: 1, dispHp: 0, lagHp: 0, shown: 0 };
  UI.setBoss = boss => {
    if (boss) { bossBar.boss = boss; bossBar.name = boss.cfg.name; bossBar.maxHp = boss.maxHp; bossBar.dispHp = boss.hp; bossBar.lagHp = boss.hp; }
    else { bossBar.boss = null; }
  };
  UI.bossBarShown = () => bossBar.shown;   // for tests
  UI.onPlayerHurt = () => { maskFlash = 0.6; };
  UI.onHeal = () => { healFlash = 0.6; };
  UI.setFade = (target, speed, cb, opts) => {
    fade.target = target; fade.speed = speed; fade.cb = cb || null;
    fade.iris = !!(opts && opts.iris);
    if (opts && opts.x != null) { fade.ix = opts.x; fade.iy = opts.y; }
    else if (fade.ix == null) { fade.ix = w / 2; fade.iy = h / 2; }
  };
  UI.resetDeathText = () => { deathTextT = 0; };

  const serif = (G.Theme && G.Theme.font) ? G.Theme.font('body') : 'Georgia, "Times New Roman", serif';
  const ICON_DEF = { glimmer: '✦', diamond: '◆', diamondOutline: '◇', check: '✓' };
  const icon = name => (G.Theme && G.Theme.icon) ? G.Theme.icon(name) : (ICON_DEF[name] || '');
  const SLOT_VIEW = (G.Saves ? G.Saves.slotCount() : 5);   // number of save slots shown (data/saves.js)

  function maskPath(x, y, s) {
    cx.beginPath();
    cx.moveTo(x, y - s * 0.55);
    cx.bezierCurveTo(x + s * 0.62, y - s * 0.55, x + s * 0.62, y - s * 0.05, x + s * 0.45, y + s * 0.32);
    cx.bezierCurveTo(x + s * 0.3, y + s * 0.62, x, y + s * 0.72, x, y + s * 0.72);
    cx.bezierCurveTo(x, y + s * 0.72, x - s * 0.3, y + s * 0.62, x - s * 0.45, y + s * 0.32);
    cx.bezierCurveTo(x - s * 0.62, y - s * 0.05, x - s * 0.62, y - s * 0.55, x, y - s * 0.55);
    cx.closePath();
  }

  function drawHud(dt) {
    const p = G.player;
    if (!p) return;
    const HS = G.HUD ? G.HUD.soul() : { x: 64, y: 64, r: 30, fillTop: '#eef8ff', fillBot: '#9fcfe0' };
    const HM = G.HUD ? G.HUD.masks() : { x: 122, y: 52, spacing: 38, size: 13, color: '#e9e4d4' };
    const HG = G.HUD ? G.HUD.glimmer() : { x: 38, y: 110, dotR: 6, textX: 52, textY: 111, dotColor: '#ffe28a', textColor: 'rgba(240,230,200,0.92)', fontSize: 16 };
    maskFlash = Math.max(0, maskFlash - dt);
    healFlash = Math.max(0, healFlash - dt);
    lowHpPulse += dt * 5;

    // soul orb
    const ox = HS.x, oy = HS.y, or_ = HS.r;
    let soulShown = p.soul;
    if (p.focusing) soulShown = Math.max(0, p.soul - (p.focusT / 0.85) * 33);
    const frac = soulShown / 99;
    cx.save();
    cx.beginPath(); cx.arc(ox, oy, or_, 0, U.TAU);
    cx.fillStyle = 'rgba(8,14,16,0.75)';
    cx.fill();
    cx.save();
    cx.beginPath(); cx.arc(ox, oy, or_ - 2.5, 0, U.TAU); cx.clip();
    const lvl = oy + (or_ - 2.5) - frac * 2 * (or_ - 2.5);
    const sg = cx.createLinearGradient(0, lvl, 0, oy + or_);
    sg.addColorStop(0, HS.fillTop); sg.addColorStop(1, HS.fillBot);
    cx.fillStyle = sg;
    cx.fillRect(ox - or_, lvl + Math.sin(G.time * 3) * 1.5, or_ * 2, or_ * 2);
    if (frac > 0) {
      cx.fillStyle = 'rgba(255,255,255,0.5)';
      cx.beginPath();
      cx.ellipse(ox, lvl + Math.sin(G.time * 3) * 1.5, or_ * 0.8, 3, 0, 0, U.TAU);
      cx.fill();
    }
    cx.restore();
    // rim
    const canFocus = p.soul >= 33;
    cx.lineWidth = 3;
    cx.strokeStyle = canFocus ? `rgba(238,248,255,${0.85 + Math.sin(G.time * 4) * 0.15})` : 'rgba(150,170,180,0.7)';
    cx.beginPath(); cx.arc(ox, oy, or_, 0, U.TAU); cx.stroke();
    cx.lineWidth = 1;
    cx.strokeStyle = 'rgba(238,248,255,0.25)';
    cx.beginPath(); cx.arc(ox, oy, or_ + 5, -0.7, U.TAU * 0.5 - 0.4); cx.stroke();
    cx.restore();

    // masks
    for (let i = 0; i < p.maxHp; i++) {
      const mx = HM.x + i * HM.spacing, my = HM.y;
      const alive = i < p.hp;
      let s = HM.size;
      if (alive && i === p.hp - 1 && maskFlash > 0) s = HM.size + maskFlash * 6;
      if (alive && healFlash > 0 && i === p.hp - 1) s = HM.size + Math.sin(healFlash * 10) * 4;
      cx.save();
      if (p.hp === 1 && alive) cx.globalAlpha = 0.7 + Math.sin(lowHpPulse) * 0.3;
      maskPath(mx, my, s);
      if (alive) {
        cx.fillStyle = HM.color;
        cx.shadowColor = 'rgba(233,228,212,0.7)';
        cx.shadowBlur = 8;
        cx.fill();
      } else {
        cx.fillStyle = 'rgba(10,16,18,0.6)';
        cx.fill();
        cx.shadowBlur = 0;
        cx.lineWidth = 1.5;
        cx.strokeStyle = 'rgba(180,190,195,0.35)';
        cx.stroke();
      }
      cx.restore();
    }
    if (maskFlash > 0.3) {
      cx.fillStyle = `rgba(120,10,10,${(maskFlash - 0.3) * 0.6})`;
      cx.fillRect(0, 0, w, h);
    }

    // glimmer counter
    const glim = G.Main.glimmer ? G.Main.glimmer() : 0;
    cx.save();
    cx.textAlign = 'left'; cx.textBaseline = 'middle';
    cx.beginPath(); cx.arc(HG.x, HG.y, HG.dotR, 0, U.TAU);
    cx.fillStyle = HG.dotColor; cx.shadowColor = 'rgba(255,226,138,0.7)'; cx.shadowBlur = 8; cx.fill();
    cx.shadowBlur = 0;
    cx.fillStyle = HG.textColor; cx.font = `${HG.fontSize}px ${serif}`;
    cx.fillText(String(glim), HG.textX, HG.textY);
    cx.restore();
  }

  // a subtle edge arrow pointing to the nearest bench in this room when it's off-screen
  function drawCompass() {
    if (!G.player || !G.room || !G.room.entities) return;
    let best = null, bd = 1e9;
    for (const e of G.room.entities) {
      if (e.type !== 'bench') continue;
      const ex = e.x !== undefined ? e.x : (e.body ? e.body.x : 0), ey = e.y !== undefined ? e.y : (e.body ? e.body.y : 0);
      const d = Math.hypot(ex - G.player.body.x, ey - G.player.body.y);
      if (d < bd) { bd = d; best = { x: ex, y: ey }; }
    }
    if (!best || bd < 7) return;
    const s = U.toScreen(best.x, best.y), m = 48;
    if (s.x > m && s.x < w - m && s.y > m && s.y < h - m) return;   // already on-screen
    const ex = U.clamp(s.x, m, w - m), ey = U.clamp(s.y, m, h - m);
    const ang = Math.atan2(s.y - h / 2, s.x - w / 2);
    cx.save();
    cx.globalAlpha = 0.8;
    cx.translate(ex, ey); cx.rotate(ang);
    cx.fillStyle = 'rgba(255,220,150,0.9)'; cx.strokeStyle = 'rgba(20,16,8,0.6)'; cx.lineWidth = 1.5;
    cx.beginPath(); cx.moveTo(13, 0); cx.lineTo(-6, -7); cx.lineTo(-6, 7); cx.closePath(); cx.fill(); cx.stroke();
    cx.restore();
    cx.save(); cx.globalAlpha = 0.65; cx.fillStyle = 'rgba(255,232,184,0.9)';
    cx.font = `11px ${serif}`; cx.textAlign = 'center';
    cx.fillText('bench', ex, ey + (ey > h / 2 ? -15 : 21)); cx.restore();
  }

  // top-right objective tracker for the currently-tracked quest (+ a world marker to its target)
  function drawObjectiveTracker() {
    if (!G.Quests) return;
    const q = G.Quests.tracked(); if (!q) return;
    cx.save(); cx.textAlign = 'right'; cx.textBaseline = 'alphabetic';
    cx.shadowColor = 'rgba(0,0,0,0.65)'; cx.shadowBlur = 5;
    cx.fillStyle = 'rgba(255,233,176,0.92)'; cx.font = `bold ${Math.round(h * 0.022)}px ${serif}`;
    cx.fillText(icon('diamond') + ' ' + (q.title || ''), w - 22, 30);
    if (q.objective) { cx.fillStyle = 'rgba(208,222,214,0.82)'; cx.font = `italic ${Math.round(h * 0.018)}px ${serif}`; cx.fillText(q.objective, w - 22, 30 + Math.round(h * 0.026)); }
    cx.restore();
    if (q.target && G.room && q.target.room === G.room.id) {
      const s = U.toScreen(q.target.x, q.target.y), m = 50;
      if (s.x < m || s.x > w - m || s.y < m || s.y > h - m) {
        const ex = U.clamp(s.x, m, w - m), ey = U.clamp(s.y, m, h - m), ang = Math.atan2(s.y - h / 2, s.x - w / 2);
        cx.save(); cx.globalAlpha = 0.8; cx.translate(ex, ey); cx.rotate(ang);
        cx.fillStyle = 'rgba(255,233,176,0.9)'; cx.strokeStyle = 'rgba(20,16,8,0.6)'; cx.lineWidth = 1.5;
        cx.beginPath(); cx.moveTo(13, 0); cx.lineTo(-6, -7); cx.lineTo(-6, 7); cx.closePath(); cx.fill(); cx.stroke(); cx.restore();
      } else {
        cx.save(); cx.globalAlpha = 0.55 + Math.sin((G.time || 0) * 4) * 0.3; cx.fillStyle = 'rgba(255,233,176,0.9)';
        cx.translate(s.x, s.y - 1.5); cx.rotate(Math.PI / 4); cx.fillRect(-5, -5, 10, 10); cx.restore();
      }
    }
  }
  // pause -> Quests log page (same menu chrome)
  function drawQuestLog() {
    pmAcc = biomeAccent(); menuChrome(); menuHeader('QUESTS');
    const quests = G.Quests ? G.Quests.all() : [];
    const rows = quests.filter(q => q.state === 'active').concat(quests.filter(q => q.state === 'done'));
    if (!rows.length) { cx.save(); cx.textAlign = 'left'; cx.fillStyle = 'rgba(190,210,200,0.7)'; cx.font = `italic ${Math.round(h * 0.026)}px ${serif}`; cx.fillText('No quests yet — speak with the folk you meet.', w * 0.3, h * 0.4); cx.restore(); }
    const lx = w * 0.3, ly = h * 0.27, step = Math.min(h * 0.086, 64);
    const idx = U.clamp(G.Main.questIndex || 0, 0, Math.max(0, rows.length - 1));
    const visible = Math.min(rows.length, Math.floor((h * 0.62) / step));
    const top = U.clamp(idx - (visible >> 1), 0, Math.max(0, rows.length - visible));
    cx.save(); cx.textBaseline = 'alphabetic';
    for (let r = 0; r < visible; r++) {
      const i = top + r, q = rows[i]; if (!q) break;
      const yy = ly + r * step, sel = i === idx, isDone = q.state === 'done';
      if (sel) { cx.globalAlpha = 0.9; cx.fillStyle = pmAcc; cx.fillRect(lx - 12, yy - 24, w * 0.46, step - 12); cx.globalAlpha = 1; }
      cx.font = `${sel ? '900' : '700'} ${Math.round(h * 0.03)}px ${menuFont}`; cx.textAlign = 'left';
      cx.fillStyle = sel ? '#06120e' : (isDone ? 'rgba(140,170,150,0.6)' : 'rgba(220,236,226,0.95)');
      cx.fillText((isDone ? icon('check') + ' ' : icon('diamond') + ' ') + (q.title || q.id), lx, yy);
      cx.font = `italic ${Math.round(h * 0.022)}px ${serif}`; cx.fillStyle = sel ? 'rgba(6,18,14,0.78)' : 'rgba(180,200,190,0.7)';
      cx.fillText(isDone ? 'Complete' : (q.objective || ''), lx, yy + Math.round(h * 0.03));
    }
    cx.restore();
    cx.save(); cx.textAlign = 'right'; cx.fillStyle = 'rgba(150,172,162,0.7)'; cx.font = `13px ${serif}`; cx.fillText('↑ ↓  browse        Esc  back', w - 32, h - 32); cx.restore();
  }

  // soul-well spell tree (same menu chrome)
  function drawSpellTree() {
    pmAcc = biomeAccent(); menuChrome(); menuHeader('SPELLS');
    const tree = G.Main.SPELL_TREE || [], idx = U.clamp(G.Main.spellIndex || 0, 0, tree.length - 1);
    cx.save(); cx.textAlign = 'left'; cx.textBaseline = 'alphabetic';
    cx.font = `${Math.round(h * 0.022)}px ${serif}`; cx.fillStyle = 'rgba(201,160,255,0.85)';
    cx.fillText('Glimmer  ' + (G.Main.glimmer ? G.Main.glimmer() : 0) + ' ' + icon('glimmer'), w * 0.3, h * 0.16 + 26);
    const lx = w * 0.3, ly = h * 0.28, step = Math.min(h * 0.1, 76);
    for (let i = 0; i < tree.length; i++) {
      const s = tree[i], yy = ly + i * step, sel = i === idx, lvl = G.Main.spellLevel(s.id), cost = G.Main.spellCost(s.id);
      if (sel) { cx.globalAlpha = 0.9; cx.fillStyle = pmAcc; cx.fillRect(lx - 12, yy - 26, w * 0.5, step - 12); cx.globalAlpha = 1; }
      cx.font = `${sel ? '900' : '700'} ${Math.round(h * 0.032)}px ${menuFont}`; cx.textAlign = 'left';
      cx.fillStyle = sel ? '#06120e' : (lvl >= 1 ? 'rgba(222,210,245,0.95)' : 'rgba(150,140,165,0.7)');
      cx.fillText(s.name + (lvl >= 2 ? '  ★★' : lvl >= 1 ? '  ★' : ''), lx, yy);
      cx.font = `italic ${Math.round(h * 0.021)}px ${serif}`; cx.fillStyle = sel ? 'rgba(6,18,14,0.8)' : 'rgba(180,200,190,0.7)';
      cx.fillText(s.tiers[lvl] || s.tiers[1], lx, yy + Math.round(h * 0.03));
      cx.textAlign = 'right'; cx.font = `${Math.round(h * 0.022)}px ${serif}`; cx.fillStyle = sel ? 'rgba(6,18,14,0.85)' : 'rgba(201,160,255,0.8)';
      cx.fillText(lvl >= 2 ? 'mastered' : (cost + ' ' + icon('glimmer') + '  ·  ' + s.cast), lx + w * 0.5 - 16, yy);
      cx.textAlign = 'left';
    }
    cx.restore();
    cx.save(); cx.textAlign = 'right'; cx.fillStyle = 'rgba(150,172,162,0.7)'; cx.font = `13px ${serif}`;
    cx.fillText('↑ ↓  select        Enter  learn / empower        Esc  back', w - 32, h - 32); cx.restore();
  }

  function drawPrompts() {
    cx.textAlign = 'center';
    for (const pr of prompts) {
      const s = U.toScreen(pr.wx, pr.wy);
      const lines = pr.text.split('\n');
      const fs = pr.sign ? 17 : 15;
      cx.font = `${pr.sign ? 'italic ' : ''}${fs}px ${serif}`;
      const wMax = Math.max(...lines.map(l => cx.measureText(l).width));
      const bh = lines.length * (fs + 6) + 14;
      cx.fillStyle = 'rgba(4,10,12,0.72)';
      cx.strokeStyle = 'rgba(200,220,225,0.25)';
      cx.lineWidth = 1;
      roundRect(s.x - wMax / 2 - 14, s.y - bh, wMax + 28, bh, 8);
      cx.fill(); cx.stroke();
      cx.fillStyle = '#d8e4e0';
      lines.forEach((l, i) => cx.fillText(l, s.x, s.y - bh + 24 + i * (fs + 6)));
    }
    prompts = [];
  }

  function roundRect(x, y, ww, hh, r) {
    cx.beginPath();
    cx.moveTo(x + r, y);
    cx.arcTo(x + ww, y, x + ww, y + hh, r);
    cx.arcTo(x + ww, y + hh, x, y + hh, r);
    cx.arcTo(x, y + hh, x, y, r);
    cx.arcTo(x, y, x + ww, y, r);
    cx.closePath();
  }

  function drawAreaTitle(dt) {
    if (!areaQ.length) return;
    const a = areaQ[0];
    a.t += dt;
    const IN = 0.7, HOLD = 2.0, OUT = 0.9;
    let alpha;
    if (a.t < IN) alpha = a.t / IN;
    else if (a.t < IN + HOLD) alpha = 1;
    else alpha = 1 - (a.t - IN - HOLD) / OUT;
    if (a.t > IN + HOLD + OUT) { areaQ.shift(); return; }
    cx.save();
    cx.globalAlpha = Math.max(0, alpha);
    cx.textAlign = 'center';
    cx.fillStyle = '#e8f0ec';
    cx.shadowColor = 'rgba(0,0,0,0.8)';
    cx.shadowBlur = 16;
    cx.font = `42px ${serif}`;
    const ty = h * 0.3;
    cx.fillText(a.text, w / 2, ty);
    cx.shadowBlur = 0;
    const tw = cx.measureText(a.text).width;
    cx.strokeStyle = 'rgba(232,240,236,0.6)';
    cx.lineWidth = 1;
    cx.beginPath();
    cx.moveTo(w / 2 - tw / 2 - 60, ty + 16); cx.lineTo(w / 2 + tw / 2 + 60, ty + 16);
    cx.stroke();
    cx.beginPath(); cx.arc(w / 2, ty + 16, 3.5, 0, U.TAU); cx.fill();
    cx.restore();
  }

  function drawBossTitle(dt) {
    if (bossT < 0) return;
    bossT += dt;
    const IN = 0.5, HOLD = 2.1, OUT = 0.8;
    if (bossT > IN + HOLD + OUT) { bossT = -1; return; }
    const alpha = bossT < IN ? bossT / IN : bossT < IN + HOLD ? 1 : 1 - (bossT - IN - HOLD) / OUT;
    const rev = U.clamp(bossT / IN, 0, 1);        // wipe-in reveal of the name + flanking slashes
    cx.save();
    cx.globalAlpha = Math.max(0, alpha);
    cx.textAlign = 'center'; cx.textBaseline = 'alphabetic';
    cx.translate(w / 2, h * 0.66);
    const sc = 1 + (1 - rev) * 0.12;
    cx.scale(sc, sc);
    // name
    cx.font = `900 54px ${menuFont}`;
    cx.fillStyle = '#eef7ee'; cx.shadowColor = 'rgba(120,255,170,0.55)'; cx.shadowBlur = 26;
    cx.fillText(bossText, 0, 0);
    cx.shadowBlur = 0;
    // flanking accent slashes that grow with the reveal
    const nameW = cx.measureText(bossText).width, sl = (nameW / 2 + 28) * rev;
    cx.strokeStyle = 'rgba(150,240,190,0.7)'; cx.lineWidth = 2;
    cx.beginPath(); cx.moveTo(-nameW / 2 - 18, 14); cx.lineTo(-nameW / 2 - 18 - sl * 0.5, 14); cx.stroke();
    cx.beginPath(); cx.moveTo(nameW / 2 + 18, 14); cx.lineTo(nameW / 2 + 18 + sl * 0.5, 14); cx.stroke();
    // epithet
    if (bossSub) {
      cx.font = `italic 21px ${serif}`; cx.fillStyle = 'rgba(200,224,210,0.85)';
      cx.globalAlpha = Math.max(0, alpha) * U.clamp((bossT - IN * 0.5) / IN, 0, 1);
      cx.fillText(bossSub, 0, 34);
    }
    cx.restore();
  }

  function drawBossBar(dt) {
    const b = bossBar;
    const targetShown = (b.boss && b.boss.alive) ? 1 : 0;
    b.shown = U.damp(b.shown, targetShown, 5, dt);
    if (b.shown < 0.01 && targetShown === 0) return;
    if (b.boss) {
      b.dispHp = U.damp(b.dispHp, Math.max(0, b.boss.hp), 16, dt);   // snappy fill
      b.lagHp = U.damp(b.lagHp, Math.max(0, b.boss.hp), 3, dt);      // trailing "damage" ghost
    }
    const frac = U.clamp(b.dispHp / b.maxHp, 0, 1);
    const lag = U.clamp(b.lagHp / b.maxHp, 0, 1);
    const bw = Math.min(560, w * 0.6), bh = 11;
    const bx = w / 2 - bw / 2, by = h - 46;
    cx.save();
    cx.globalAlpha = b.shown;
    // name
    cx.textAlign = 'center';
    cx.font = `italic 19px ${serif}`;
    cx.fillStyle = 'rgba(232,240,236,0.92)';
    cx.shadowColor = 'rgba(0,0,0,0.7)'; cx.shadowBlur = 6;
    cx.fillText(b.name, w / 2, by - 9);
    cx.shadowBlur = 0;
    // frame
    cx.fillStyle = 'rgba(8,10,12,0.7)';
    cx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
    // damage trail (the slowly-draining ghost)
    cx.fillStyle = 'rgba(200,90,80,0.55)';
    cx.fillRect(bx, by, bw * lag, bh);
    // current health
    const grad = cx.createLinearGradient(bx, 0, bx + bw, 0);
    grad.addColorStop(0, '#d9e8df'); grad.addColorStop(1, '#f4fff8');
    cx.fillStyle = grad;
    cx.fillRect(bx, by, bw * frac, bh);
    // phase divider notch at the 50% threshold (where the boss enters phase 2)
    cx.fillStyle = 'rgba(20,24,26,0.85)';
    cx.fillRect(bx + bw * 0.5 - 1, by - 1, 2, bh + 2);
    // border
    cx.strokeStyle = 'rgba(220,235,225,0.5)'; cx.lineWidth = 1;
    cx.strokeRect(bx - 2.5, by - 2.5, bw + 5, bh + 5);
    // phase pips (filled = current phase) at the right end of the name line
    const phase = (b.boss && b.boss.phase) || 1;
    for (let i = 0; i < 2; i++) {
      cx.beginPath(); cx.arc(bx + bw - 6 - i * 13, by - 13, 4, 0, 6.28);
      cx.fillStyle = (2 - i) <= phase ? '#bff0d0' : 'rgba(160,180,170,0.3)'; cx.fill();
    }
    cx.restore();
  }

  function drawToasts(dt) {
    for (let i = toasts.length - 1; i >= 0; i--) {
      const t = toasts[i];
      t.t += dt;
      if (t.t > 4.2) { toasts.splice(i, 1); continue; }
      const alpha = t.t < 0.4 ? t.t / 0.4 : t.t > 3.4 ? 1 - (t.t - 3.4) / 0.8 : 1;
      cx.save();
      cx.globalAlpha = Math.max(0, alpha);
      cx.textAlign = 'center';
      cx.font = `italic 21px ${serif}`;
      cx.fillStyle = '#e6eee8';
      cx.shadowColor = 'rgba(0,0,0,0.9)';
      cx.shadowBlur = 10;
      cx.fillText(t.text, w / 2, h * 0.82 - i * 32);
      cx.restore();
    }
  }

  // Title screen shares the pause-menu look: slanted backdrop, drifting bats, wanderer,
  // and a biome-accent slash on the selected item.
  function drawTitleScreen() {
    pmAcc = biomeAccent();
    menuChrome({ vtitle: false, nod: true });   // no side title; the wanderer nods
    // title + subtitle (pushed to the right)
    cx.save(); cx.textAlign = 'left'; cx.textBaseline = 'alphabetic';
    cx.fillStyle = '#eaf2ee'; cx.shadowColor = pmAcc; cx.shadowBlur = 24;
    cx.font = `900 ${Math.round(h * 0.105)}px ${menuFont}`;
    cx.fillText('MOSSVEIL', w * 0.52, h * 0.22); cx.shadowBlur = 0;
    cx.fillStyle = 'rgba(200,220,210,0.8)'; cx.font = `italic ${Math.round(h * 0.026)}px ${serif}`;
    cx.fillText('— echoes beneath —', w * 0.52 + 5, h * 0.22 + Math.round(h * 0.04));
    cx.restore();

    // diagonal accent-slash menu list (right side)
    const items = G.Main.menuItems || [];
    G.UI.titleButtons = [];
    const ang = -0.05, lx = w * 0.54, ly = h * 0.38, step = Math.min(h * 0.082, 58), fs = Math.round(Math.min(h * 0.046, 30));
    const cos = Math.cos(ang), sin = Math.sin(ang), colW = Math.min(w * 0.34, 420);
    cx.save(); cx.translate(lx, ly); cx.rotate(ang); cx.textBaseline = 'middle';
    for (let i = 0; i < items.length; i++) {
      const it = items[i], sel = i === G.Main.menuIndex && !G.Main.confirm, yy = i * step;
      if (sel) {
        const sw = colW, sh = fs * 1.2;
        cx.save(); cx.globalAlpha = 0.92; cx.fillStyle = pmAcc;
        cx.beginPath();
        cx.moveTo(-16, yy - sh * 0.5); cx.lineTo(sw, yy - sh * 0.55);
        cx.lineTo(sw + sh * 0.65, yy + sh * 0.5); cx.lineTo(-16 + sh * 0.35, yy + sh * 0.5);
        cx.closePath(); cx.fill(); cx.restore();
      }
      const label = it.label.toUpperCase();
      cx.font = `${sel ? '900' : '700'} ${fs}px ${menuFont}`; cx.textAlign = 'left';
      if (!it.enabled) cx.fillStyle = 'rgba(120,132,126,0.35)';
      else { if (!sel) { cx.lineWidth = 1; cx.strokeStyle = 'rgba(120,180,160,0.25)'; cx.strokeText(label, 6, yy); } cx.fillStyle = sel ? '#06120e' : 'rgba(202,226,216,0.9)'; }
      cx.fillText(label, 6, yy);
      const scx = lx + (-16) * cos - yy * sin, scy = ly + (-16) * sin + yy * cos;
      G.UI.titleButtons.push({ x: scx, y: scy - fs * 0.85, w: colW + 40, h: fs * 1.6, index: i, enabled: it.enabled });
    }
    cx.restore();

    cx.save(); cx.textAlign = 'right'; cx.textBaseline = 'alphabetic';
    cx.fillStyle = 'rgba(150,172,162,0.7)'; cx.font = `13px ${serif}`;
    cx.fillText('↑ ↓  select        Enter  confirm        or click', w - 32, h - 32);
    cx.restore();

    if (G.Main.confirm) drawConfirm();
  }

  function drawConfirm() {
    const c = G.Main.confirm;
    cx.save();
    cx.fillStyle = 'rgba(3,7,9,0.72)';
    cx.fillRect(0, 0, w, h);
    const bw = 460, bh = 170, bx = w / 2 - bw / 2, by = h / 2 - bh / 2;
    roundRect(bx, by, bw, bh, 12);
    cx.fillStyle = 'rgba(16,24,21,0.96)';
    cx.fill();
    cx.strokeStyle = 'rgba(150,200,170,0.5)';
    cx.lineWidth = 1.5;
    cx.stroke();
    cx.textAlign = 'center';
    cx.fillStyle = '#e6eee8';
    cx.font = `19px ${serif}`;
    cx.fillText(c.message, w / 2, by + 52);
    G.UI.confirmButtons = [];
    const labels = [['Yes', true], ['No', false]];
    const bwid = 130, bhi = 44, gap = 30;
    const totalW = bwid * 2 + gap;
    labels.forEach((lb, i) => {
      const x = w / 2 - totalW / 2 + i * (bwid + gap);
      const y = by + bh - 64;
      const sel = c.sel === i;
      roundRect(x, y, bwid, bhi, 8);
      cx.fillStyle = sel ? (i === 0 ? 'rgba(90,50,50,0.95)' : 'rgba(38,72,54,0.95)') : 'rgba(24,32,28,0.8)';
      cx.fill();
      cx.lineWidth = sel ? 2 : 1;
      cx.strokeStyle = sel ? 'rgba(220,230,210,0.85)' : 'rgba(120,140,130,0.4)';
      cx.stroke();
      cx.fillStyle = sel ? '#fff' : '#c6d4cc';
      cx.font = `${sel ? 21 : 19}px ${serif}`;
      cx.textBaseline = 'middle';
      cx.fillText(lb[0], x + bwid / 2, y + bhi / 2 + 1);
      G.UI.confirmButtons.push({ x, y, w: bwid, h: bhi, yes: lb[1] });
    });
    cx.textBaseline = 'alphabetic';
    cx.restore();
  }

  const ROMAN = ['I', 'II', 'III', 'IV', 'V'];
  function drawTrashIcon(bx, by, s, color) {
    // a small vector trash can centred in a box of side ~s at (bx,by)
    cx.save();
    cx.strokeStyle = color;
    cx.lineWidth = 1.6;
    cx.lineJoin = 'round';
    cx.lineCap = 'round';
    const w2 = s * 0.5, top = by - s * 0.42;
    // lid
    cx.beginPath();
    cx.moveTo(bx - w2, top); cx.lineTo(bx + w2, top);
    cx.stroke();
    // handle
    cx.beginPath();
    cx.moveTo(bx - s * 0.18, top); cx.lineTo(bx - s * 0.12, top - s * 0.16);
    cx.lineTo(bx + s * 0.12, top - s * 0.16); cx.lineTo(bx + s * 0.18, top);
    cx.stroke();
    // body
    cx.beginPath();
    cx.moveTo(bx - w2 * 0.82, top + s * 0.06);
    cx.lineTo(bx - w2 * 0.62, by + s * 0.5);
    cx.lineTo(bx + w2 * 0.62, by + s * 0.5);
    cx.lineTo(bx + w2 * 0.82, top + s * 0.06);
    cx.stroke();
    // ribs
    cx.beginPath();
    for (const dx of [-s * 0.18, 0, s * 0.18]) { cx.moveTo(bx + dx, top + s * 0.22); cx.lineTo(bx + dx, by + s * 0.4); }
    cx.stroke();
    cx.restore();
  }

  // Load Save shares the pause-menu look; the saved-vessel rows carry the biome accent.
  function drawSlots() {
    pmAcc = biomeAccent();
    menuChrome();
    menuHeader('LOAD SAVE');
    const slots = G.Main.slots || [];
    const bw = Math.min(w * 0.5, 560), bh = 76, gap = 12;
    const x0 = Math.min(w * 0.4, w - bw - 40), y0 = h * 0.28;
    G.UI.slotButtons = []; G.UI.slotTrashButtons = [];
    for (let i = 0; i < SLOT_VIEW; i++) {
      const y = y0 + i * (bh + gap);
      const sel = i === G.Main.slotIndex && !G.Main.confirm;
      const slot = slots[i], info = slot ? G.Main.slotInfo(slot) : null;
      roundRect(x0, y, bw, bh, 8);
      if (sel) { cx.globalAlpha = 0.92; cx.fillStyle = pmAcc; cx.fill(); cx.globalAlpha = 1; }
      else { cx.fillStyle = 'rgba(12,20,17,0.66)'; cx.fill(); cx.lineWidth = 1; cx.strokeStyle = 'rgba(110,140,125,0.35)'; cx.stroke(); }
      // vessel numeral
      cx.textAlign = 'center'; cx.textBaseline = 'middle';
      cx.fillStyle = sel ? '#06120e' : 'rgba(150,180,165,0.7)';
      cx.font = `900 ${Math.round(bh * 0.4)}px ${menuFont}`;
      cx.fillText(ROMAN[i], x0 + 42, y + bh / 2);
      cx.beginPath(); cx.moveTo(x0 + 82, y + 14); cx.lineTo(x0 + 82, y + bh - 14);
      cx.strokeStyle = sel ? 'rgba(6,18,14,0.3)' : 'rgba(140,170,155,0.22)'; cx.lineWidth = 1; cx.stroke();
      cx.textAlign = 'left';
      const tx = x0 + 100;
      if (info) {
        cx.fillStyle = sel ? '#06120e' : '#cad8d0'; cx.font = `21px ${serif}`;
        cx.fillText(info.place, tx, y + 26);
        cx.fillStyle = sel ? 'rgba(6,18,14,0.72)' : 'rgba(170,195,182,0.75)'; cx.font = `13px ${serif}`;
        cx.fillText(info.detail, tx, y + 47);
        cx.fillStyle = sel ? 'rgba(6,18,14,0.6)' : 'rgba(140,165,153,0.6)'; cx.font = `italic 12px ${serif}`;
        cx.fillText((G.Saves ? G.Saves.label('restedPrefix') : 'rested ') + info.when, tx, y + 64);
        const tbx = x0 + bw - 28, tbox = 34;
        drawTrashIcon(tbx, y + 24, 17, sel ? 'rgba(70,20,18,0.9)' : 'rgba(180,150,148,0.6)');
        G.UI.slotTrashButtons.push({ x: tbx - tbox / 2, y, w: tbox, h: bh, index: i });
      } else {
        cx.fillStyle = sel ? '#06120e' : 'rgba(150,170,160,0.6)'; cx.font = `italic 20px ${serif}`;
        cx.fillText(G.Saves ? G.Saves.label('emptyTitle') : '— empty vessel —', tx, y + bh / 2 - 4);
        cx.fillStyle = sel ? 'rgba(6,18,14,0.6)' : 'rgba(150,180,165,0.5)'; cx.font = `13px ${serif}`;
        cx.fillText(G.Saves ? G.Saves.label('emptySub') : 'begin a new journey here', tx, y + bh / 2 + 18);
      }
      cx.textBaseline = 'alphabetic';
      G.UI.slotButtons.push({ x: x0, y, w: bw, h: bh, index: i });
    }
    // back
    const back = { x: x0, y: y0 + SLOT_VIEW * (bh + gap) + 6, w: 120, h: 34 };
    roundRect(back.x, back.y, back.w, back.h, 7); cx.fillStyle = 'rgba(14,22,19,0.7)'; cx.fill();
    cx.lineWidth = 1; cx.strokeStyle = 'rgba(120,150,135,0.4)'; cx.stroke();
    cx.fillStyle = '#c6d4cc'; cx.font = `16px ${serif}`; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.fillText('‹ Back', back.x + back.w / 2, back.y + back.h / 2); cx.textBaseline = 'alphabetic';
    G.UI.slotBack = back;
    cx.save(); cx.textAlign = 'right'; cx.fillStyle = 'rgba(150,172,162,0.7)'; cx.font = `13px ${serif}`;
    cx.fillText('↑ ↓  select        Enter  choose        Del  delete        Esc  back', w - 32, h - 32); cx.restore();
    if (G.Main.confirm) drawConfirm();
  }

  function drawGoodbye() {
    cx.save();
    cx.fillStyle = '#04070a';
    cx.fillRect(0, 0, w, h);
    cx.textAlign = 'center';
    cx.fillStyle = '#9fd8b8';
    cx.font = `40px ${serif}`;
    cx.fillText('M O S S V E I L', w / 2, h * 0.42);
    cx.fillStyle = 'rgba(200,215,208,0.8)';
    cx.font = `italic 19px ${serif}`;
    cx.fillText('The veil settles. You may close this window.', w / 2, h * 0.42 + 44);
    cx.fillStyle = 'rgba(150,165,158,0.6)';
    cx.font = `15px ${serif}`;
    cx.fillText('— press any key to return to the menu —', w / 2, h * 0.42 + 84);
    cx.restore();
  }

  function menuBackdrop() {
    cx.save();
    const bg = cx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, 'rgba(3,8,9,0.84)'); bg.addColorStop(0.5, 'rgba(3,8,9,0.7)'); bg.addColorStop(1, 'rgba(3,8,9,0.86)');
    cx.fillStyle = bg; cx.fillRect(0, 0, w, h);
  }
  // shared vertical menu; items: { label, sub, right }. returns clickable rects.
  function vmenu(items, sel, y0, bw, bh, gap) {
    const x0 = w / 2 - bw / 2, rects = [];
    items.forEach((it, i) => {
      const y = y0 + i * (bh + gap), s = i === sel;
      roundRect(x0, y, bw, bh, 9);
      cx.fillStyle = s ? 'rgba(38,72,54,0.92)' : 'rgba(18,28,24,0.7)'; cx.fill();
      cx.lineWidth = s ? 2.2 : 1; cx.strokeStyle = s ? 'rgba(180,240,200,0.8)' : 'rgba(120,150,135,0.45)'; cx.stroke();
      cx.textAlign = 'left'; cx.textBaseline = 'middle';
      cx.fillStyle = (it.dim ? 'rgba(140,150,145,0.6)' : (s ? '#eafff0' : '#c6d4cc')); cx.font = `${s ? 21 : 19}px ${serif}`;
      cx.fillText(it.label, x0 + 22, y + (it.sub ? bh / 2 - 9 : bh / 2));
      if (it.sub) { cx.fillStyle = 'rgba(175,195,182,0.62)'; cx.font = `13px ${serif}`; cx.fillText(it.sub, x0 + 22, y + bh / 2 + 11); }
      if (it.right) { cx.textAlign = 'right'; cx.fillStyle = it.afford === false ? 'rgba(210,120,110,0.9)' : '#ffe28a'; cx.font = `15px ${serif}`; cx.fillText(it.right, x0 + bw - 18, y + bh / 2); }
      rects.push({ x: x0, y, w: bw, h: bh, index: i });
    });
    cx.textAlign = 'center'; cx.textBaseline = 'alphabetic';
    return rects;
  }
  function menuHint(t) { cx.font = `italic 13px ${serif}`; cx.fillStyle = 'rgba(140,160,152,0.55)'; cx.textAlign = 'center'; cx.fillText(t, w / 2, h - 24); }
  function menuTitle(t, y, glow) {
    cx.textAlign = 'center'; cx.fillStyle = '#eaf2ee'; cx.shadowColor = glow || 'rgba(160,240,200,0.4)'; cx.shadowBlur = 16;
    cx.font = `40px ${serif}`; cx.fillText(t, w / 2, y); cx.shadowBlur = 0;
  }
  // ============ pause menu — Persona-3-Reload inspired, with a bat sweep ============
  let pmOpen = 0, pmClosing = 0, pmSel = 0, pmTime = 0, pmAcc = '#6cf2b0';
  const swp = { on: false, t: 0, dir: 1, bats: [] };
  // The bat sweep has three beats (seconds): the swarm COVERs the screen, HOLDs it
  // fully black while the menu swaps in/out behind it, then REVEALs the result.
  const SWP_COVER = 0.22, SWP_HOLD = 0.30, SWP_REVEAL = 0.26;   // faster curtain (bats themselves stay calm)
  const SWP_TOTAL = SWP_COVER + SWP_HOLD + SWP_REVEAL;   // ~1.08s
  const menuFont = (G.Theme && G.Theme.font) ? G.Theme.font('display') : '"Arial Black", "Arial Bold", Impact, sans-serif';
  // the pause menu's accent follows the biome the player is in
  function biomeAccent() {
    const gl = G.room && G.room.pal && G.room.pal.glow;
    return gl ? '#' + gl.toString(16).padStart(6, '0') : '#6cf2b0';
  }

  UI.openPause = () => { pmOpen = 0; pmClosing = 0; pmSel = G.Main.pauseIndex || 0; pmAcc = biomeAccent(); startSweep('up', 'open'); G.Audio.sfx('uiBell'); };
  UI.closePause = () => { pmClosing = SWP_TOTAL + 0.05; startSweep('down', 'close'); };
  // a screen-filling bat sweep from a RANDOM edge — used between the pause menu and its
  // sub-menus (Charms / Map / Settings / Quit) so the swap is hidden behind the swarm.
  UI.menuSweep = () => { pmAcc = biomeAccent(); startSweep(['up', 'down', 'left', 'right'][Math.floor(Math.random() * 4)], 'menu'); };

  function startSweep(dir, kind) {
    if (dir === 1) dir = 'up'; else if (dir === -1) dir = 'down';
    // axis the curtain travels along, and the sign of the swarm's velocity on it
    const axis = (dir === 'left' || dir === 'right') ? 'x' : 'y';
    const sgn = (dir === 'up' || dir === 'left') ? -1 : 1;
    swp.on = true; swp.t = 0; swp.axis = axis; swp.sgn = sgn; swp.kind = kind || 'menu'; swp.bats = [];
    // FEW but BIG opaque bats spread across the whole screen (+ a deep margin in the travel
    // axis). Big overlapping bodies black out the frame on their own — no curtain — and the
    // low count keeps it smooth.
    for (let i = 0; i < 80; i++) {
      const sp = U.rand(1.0, 2.4);
      const speed = sp * U.rand(0.55, 1.1) * sgn;       // calm drift in the sweep direction
      const along = U.rand(-0.5, 1.5);                  // the whole axis + deep margin
      const perp = U.rand(-0.2, 1.2);
      const jit = U.rand(-0.35, 0.35) * sp;
      // bats nearest the entering edge appear first; the rest follow within a short window
      const a01 = U.clamp((along + 0.5) / 2, 0, 1);
      const delay = (sgn < 0 ? 1 - a01 : a01) * 0.07;
      const b = { s: U.rand(4.2, 7.6), flap: U.rand(0, 6.28), flapSp: U.rand(13, 22), delay };
      if (axis === 'y') { b.px = perp; b.py = along; b.vx = jit; b.vy = speed; }
      else { b.px = along; b.py = perp; b.vx = speed; b.vy = jit; }
      swp.bats.push(b);
    }
  }
  function batPath(ctx, f) {
    ctx.beginPath();
    ctx.moveTo(0, -2);
    ctx.bezierCurveTo(5, -6 - f * 5, 12, -3, 20, -7 - f * 7);
    ctx.bezierCurveTo(16, 0, 11, 3, 4, 4);
    ctx.bezierCurveTo(2, 7, -2, 7, -4, 4);
    ctx.bezierCurveTo(-11, 3, -16, 0, -20, -7 - f * 7);
    ctx.bezierCurveTo(-12, -3, -5, -6 - f * 5, 0, -2);
    ctx.closePath();
  }
  // Each bat is its OWN opaque cover: a solid dark body (plus a slightly-larger dark
  // under-body so overlapping bats leave no gaps) with a bright glowing edge. No shadow
  // blur (cheap) — the swarm itself blacks out the screen, no separate curtain needed.
  function drawBat(ctx, x, y, s, flap, alpha) {
    if (alpha <= 0.01) return;
    const f = Math.sin(flap);
    ctx.save();
    ctx.translate(x, y); ctx.scale(s, s);
    ctx.lineJoin = 'round'; ctx.fillStyle = '#070d0b'; ctx.strokeStyle = pmAcc;
    // under-body: the same shape, fattened by a wide stroke, fills the gaps between bats
    ctx.globalAlpha = alpha;
    batPath(ctx, f);
    ctx.lineWidth = 9; ctx.strokeStyle = '#070d0b'; ctx.stroke();
    ctx.fill();
    // glowing edge — two cheap bright strokes (no blur)
    ctx.strokeStyle = pmAcc;
    ctx.globalAlpha = alpha * 0.32; ctx.lineWidth = 2.4; ctx.stroke();
    ctx.globalAlpha = alpha * 0.9; ctx.lineWidth = 0.9; ctx.stroke();
    ctx.restore();
  }
  function updateSweep(dt) {
    if (!swp.on) return;
    swp.t += dt;
    if (swp.t >= SWP_TOTAL) { swp.on = false; return; }
    for (const b of swp.bats) { if (swp.t < b.delay) continue; b.px += b.vx * dt * 0.6; b.py += b.vy * dt * 0.6; b.flap += dt * b.flapSp; }
  }
  // true once the swarm has the screen blacked out (cover done) — the cue to swap the menu
  function sweepCovered() { return swp.on && swp.t >= SWP_COVER; }
  function drawSweep(ctx) {
    if (!swp.on) return;
    const sc = (w / 1280) * 2.2;
    // The bats ARE the sweep — no separate curtain. They snap to full opacity quickly
    // (well before the menu swaps), hold the blackout, then fade out on the reveal.
    const fade = swp.t < SWP_COVER ? U.clamp(swp.t / (SWP_COVER * 0.35), 0, 1)
      : swp.t > SWP_COVER + SWP_HOLD ? U.clamp(1 - (swp.t - SWP_COVER - SWP_HOLD) / SWP_REVEAL, 0, 1)
        : 1;
    for (const b of swp.bats) {
      if (swp.t < b.delay) continue;
      const fin = U.clamp((swp.t - b.delay) / 0.05, 0, 1);
      drawBat(ctx, b.px * w, b.py * h, b.s * sc, b.flap, fade * fin);
    }
  }
  function drawWanderer(ctx, x, y, s, alpha, nodT) {
    ctx.save();
    ctx.translate(x, y); ctx.scale(s, s); ctx.globalAlpha = alpha;
    // body (cloak) — stays still
    ctx.fillStyle = '#0b171b';
    ctx.beginPath();
    ctx.moveTo(0, -175); ctx.bezierCurveTo(-122, -118, -150, 70, -108, 235);
    ctx.lineTo(108, 235); ctx.bezierCurveTo(150, 70, 122, -118, 0, -175); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#16282f';
    ctx.beginPath();
    ctx.moveTo(0, -148); ctx.bezierCurveTo(-72, -100, -92, 70, -62, 224);
    ctx.lineTo(62, 224); ctx.bezierCurveTo(92, 70, 72, -100, 0, -148); ctx.closePath(); ctx.fill();
    // head (horns + mask + eyes) — nods on a loop when nodT is given (two dips, then a rest)
    ctx.save();
    if (nodT != null) {
      const c = nodT % 3.4;
      const dip = c < 1.5 ? Math.max(0, Math.sin(c / 1.5 * Math.PI * 3)) : 0;
      ctx.translate(0, -40); ctx.rotate(dip * 0.05); ctx.translate(0, 40 + dip * 12);
    }
    ctx.fillStyle = '#e9e4d4';
    ctx.beginPath(); ctx.moveTo(-24, -120); ctx.bezierCurveTo(-72, -150, -104, -214, -82, -150); ctx.bezierCurveTo(-62, -118, -42, -110, -24, -116); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(24, -120); ctx.bezierCurveTo(72, -150, 104, -214, 82, -150); ctx.bezierCurveTo(62, -118, 42, -110, 24, -116); ctx.closePath(); ctx.fill();
    ctx.shadowColor = 'rgba(120,255,190,0.4)'; ctx.shadowBlur = 26;
    ctx.beginPath();
    ctx.moveTo(0, -132); ctx.bezierCurveTo(-58, -126, -64, -58, -34, -34);
    ctx.bezierCurveTo(-14, -20, 14, -20, 34, -34); ctx.bezierCurveTo(64, -58, 58, -126, 0, -132); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#17110b';
    ctx.beginPath(); ctx.ellipse(-20, -72, 9, 17, 0, 0, 6.28); ctx.fill();
    ctx.beginPath(); ctx.ellipse(20, -72, 9, 17, 0, 0, 6.28); ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  function drawPause(open) {
    const items = G.Main.pauseItems || [];
    if (G.Main.state === 'pause') pmAcc = biomeAccent();
    cx.save();
    // background
    cx.globalAlpha = U.clamp(open, 0, 1);
    const g = cx.createLinearGradient(0, 0, w * 0.7, h);
    g.addColorStop(0, 'rgba(5,18,15,0.97)'); g.addColorStop(1, 'rgba(2,7,9,0.98)');
    cx.fillStyle = g; cx.fillRect(0, 0, w, h);
    cx.globalAlpha = open * 0.08;
    cx.fillStyle = pmAcc;
    cx.beginPath(); cx.moveTo(w * 0.52, 0); cx.lineTo(w * 0.66, 0); cx.lineTo(w * 0.44, h); cx.lineTo(w * 0.3, h); cx.closePath(); cx.fill();
    cx.restore();
    // drifting ambient bats
    for (let i = 0; i < 7; i++) {
      const ph = pmTime * 0.16 + i * 1.7;
      drawBat(cx, ((Math.sin(ph) * 0.5 + 0.5) * 0.9 + 0.05) * w, (((i * 0.137 + pmTime * 0.025) % 1)) * h, 0.5 + (i % 3) * 0.22, pmTime * 7 + i, open * 0.16);
    }
    // vertical decorative title
    cx.save(); cx.globalAlpha = open * 0.09; cx.translate(w * 0.045, h * 0.5); cx.rotate(-Math.PI / 2);
    cx.textAlign = 'center'; cx.fillStyle = '#cfeede'; cx.font = `900 ${Math.round(h * 0.15)}px ${menuFont}`;
    cx.fillText('MOSSVEIL', 0, 0); cx.restore();
    // wanderer art
    drawWanderer(cx, w * 0.3, h * 0.62, (h / 720) * 0.8, open * 0.92);
    // info box (Glimmer)
    cx.save(); cx.globalAlpha = open;
    const bx = 36, by = 34;
    roundRect(bx, by, 178, 44, 4);
    cx.fillStyle = 'rgba(8,16,13,0.85)'; cx.fill();
    cx.strokeStyle = pmAcc; cx.lineWidth = 1.5; cx.stroke();
    cx.textAlign = 'left'; cx.textBaseline = 'middle';
    cx.fillStyle = '#ffe28a'; cx.font = `bold 19px ${serif}`;
    cx.fillText(icon('diamondOutline') + ' ' + (G.Main.glimmer ? G.Main.glimmer() : 0), bx + 14, by + 15);
    cx.fillStyle = 'rgba(190,210,200,0.7)'; cx.font = `10px ${serif}`;
    cx.fillText('GLIMMER', bx + 15, by + 32);
    cx.restore();
    // diagonal italic menu list with slash highlight
    G.UI.pauseButtons = [];
    const ang = -0.05, lx = w * 0.56, ly = h * 0.3, step = h * 0.082, fs = Math.round(h * 0.05);
    const cos = Math.cos(ang), sin = Math.sin(ang);
    cx.save(); cx.translate(lx, ly); cx.rotate(ang);
    cx.font = `900 ${fs}px ${menuFont}`; cx.textAlign = 'left'; cx.textBaseline = 'middle';
    for (let i = 0; i < items.length; i++) {
      const ip = U.clamp((open - i * 0.05) / 0.4, 0, 1);
      const e = U.ease.outCubic(ip);
      const sel = U.clamp(1 - Math.abs(pmSel - i), 0, 1);
      const yy = i * step, xx = -sel * 34 + (1 - e) * 90;
      const label = items[i].replace(' to Title', '').toUpperCase();
      if (sel > 0.02) {
        const sw = fs * 6.6, sh = fs * 1.12;
        cx.save(); cx.globalAlpha = e * sel; cx.fillStyle = pmAcc;
        cx.beginPath();
        cx.moveTo(xx - 16, yy - sh * 0.5); cx.lineTo(xx + sw, yy - sh * 0.55);
        cx.lineTo(xx + sw + sh * 0.7, yy + sh * 0.5); cx.lineTo(xx - 16 + sh * 0.35, yy + sh * 0.5);
        cx.closePath(); cx.fill(); cx.restore();
      }
      cx.globalAlpha = e;
      if (sel <= 0.5) { cx.lineWidth = 1; cx.strokeStyle = 'rgba(120,180,160,0.28)'; cx.strokeText(label, xx + 6, yy); }
      cx.fillStyle = sel > 0.5 ? '#06120e' : 'rgba(202,226,216,0.9)';
      cx.fillText(label, xx + 6, yy);
      const scx = lx + xx * cos - yy * sin, scy = ly + xx * sin + yy * cos;
      G.UI.pauseButtons.push({ x: scx - 8, y: scy - fs * 0.7, w: fs * 8, h: fs * 1.4, index: i });
    }
    cx.restore();
    // description + prompts
    cx.save(); cx.globalAlpha = open; cx.textAlign = 'right'; cx.textBaseline = 'alphabetic';
    const desc = (G.Main.pauseDescs && G.Main.pauseDescs[items[Math.round(U.clamp(pmSel, 0, items.length - 1))]]) || '';
    cx.fillStyle = 'rgba(222,236,229,0.92)'; cx.font = `italic 16px ${serif}`;
    cx.fillText(desc, w - 32, h - 56);
    cx.fillStyle = 'rgba(150,172,162,0.7)'; cx.font = `13px ${serif}`;
    cx.fillText('↑ ↓  select        Enter  confirm        Esc  resume', w - 32, h - 32);
    cx.restore();
  }

  // Charms share the pause/settings look: slanted backdrop, bats, wanderer, and a
  // biome-accent slash on the selected charm.
  function drawCharms() {
    pmAcc = biomeAccent();
    menuChrome();
    menuHeader('CHARMS');
    const C = G.Charms;
    cx.save(); cx.textAlign = 'left'; cx.textBaseline = 'alphabetic';
    cx.font = `${Math.round(h * 0.024)}px ${serif}`;
    const over = C.isOvercharmed && C.isOvercharmed();
    cx.fillStyle = over ? 'rgba(255,120,110,0.95)' : 'rgba(190,210,200,0.85)';
    cx.fillText('Notches  ' + C.usedNotches() + ' / ' + C.notches() + (over ? '   ⚠ OVERCHARMED (×2 damage taken)' : ''), w * 0.42, h * 0.16 + 26);
    const syns = C.synergies ? C.synergies() : [];
    if (syns.length) {
      cx.fillStyle = 'rgba(150,235,190,0.9)'; cx.font = `italic ${Math.round(h * 0.02)}px ${serif}`;
      cx.fillText('Synergy: ' + syns.map(s => s.name).join(' · '), w * 0.42, h * 0.16 + 48);
    }
    cx.restore();

    const list = C.LIST;
    G.UI.charmButtons = [];
    const ang = -0.05, lx = w * 0.44, ly = h * 0.30, step = Math.min(h * 0.072, 52), fs = Math.round(Math.min(h * 0.04, 25));
    const cos = Math.cos(ang), sin = Math.sin(ang), colW = Math.min(w * 0.44, 520);
    cx.save(); cx.translate(lx, ly); cx.rotate(ang); cx.textBaseline = 'middle';
    list.forEach((c, i) => {
      const sel = i === G.Main.charmIndex, yy = i * step;
      const owned = C.isOwned(c.id), eq = C.isEquipped(c.id), affordable = eq || C.canEquip(c.id);
      if (sel) {
        const sw = colW, sh = fs * 1.2;
        cx.save(); cx.globalAlpha = 0.92; cx.fillStyle = pmAcc;
        cx.beginPath();
        cx.moveTo(-16, yy - sh * 0.5); cx.lineTo(sw, yy - sh * 0.55);
        cx.lineTo(sw + sh * 0.65, yy + sh * 0.5); cx.lineTo(-16 + sh * 0.35, yy + sh * 0.5);
        cx.closePath(); cx.fill(); cx.restore();
      }
      // equipped pip
      cx.beginPath(); cx.arc(fs * 0.2, yy, fs * 0.22, 0, 6.28);
      cx.fillStyle = eq ? (sel ? '#06120e' : pmAcc) : (sel ? 'rgba(6,18,14,0.35)' : 'rgba(120,140,130,0.3)'); cx.fill();
      // name
      const nm = owned ? c.name.toUpperCase() : '— LOCKED —';
      cx.font = `${sel ? '900' : '700'} ${fs}px ${menuFont}`; cx.textAlign = 'left';
      if (!sel && owned) { cx.lineWidth = 1; cx.strokeStyle = 'rgba(120,180,160,0.25)'; cx.strokeText(nm, fs * 0.75, yy); }
      cx.fillStyle = sel ? '#06120e' : (!owned ? 'rgba(130,140,135,0.5)' : (affordable ? 'rgba(202,226,216,0.9)' : 'rgba(170,140,140,0.7)'));
      cx.fillText(nm, fs * 0.75, yy);
      // cost / equipped tag (right)
      cx.textAlign = 'right'; cx.font = `${Math.round(fs * 0.8)}px ${serif}`;
      cx.fillStyle = sel ? '#06120e' : 'rgba(200,220,190,0.75)';
      cx.fillText(owned ? (icon('diamond').repeat(c.cost) + (eq ? '   equipped' : '')) : 'undiscovered', colW - 8, yy);
      const scx = lx + (-16) * cos - yy * sin, scy = ly + (-16) * sin + yy * cos;
      G.UI.charmButtons.push({ x: scx, y: scy - fs * 0.85, w: colW + 40, h: fs * 1.6, index: i });
    });
    cx.restore();

    // selected charm description + hint (right)
    const selc = list[U.clamp(G.Main.charmIndex, 0, list.length - 1)];
    cx.save(); cx.textAlign = 'right'; cx.textBaseline = 'alphabetic';
    cx.fillStyle = 'rgba(222,236,229,0.92)'; cx.font = `italic 16px ${serif}`;
    cx.fillText(selc ? (C.isOwned(selc.id) ? selc.desc : 'Undiscovered — find it in the world or buy it from a vendor.') : '', w - 32, h - 58);
    cx.fillStyle = 'rgba(150,172,162,0.7)'; cx.font = `13px ${serif}`;
    cx.fillText('↑ ↓  select        Enter / Z  equip · unequip        Esc  back', w - 32, h - 32);
    cx.restore();
  }

  // ---- Hunter's Journal (bestiary) ----
  const portraitCache = {};   // type id -> canvas (rendered once via G.Thumb)
  function portraitFor(id) {
    if (portraitCache[id] !== undefined) return portraitCache[id];
    let out = null;
    try { const grp = G.Enemies.preview && G.Enemies.preview(id); if (grp && G.Thumb) out = G.Thumb.snapshot(grp, { size: 200 }); } catch (e) { out = null; }
    portraitCache[id] = out;
    return out;
  }
  function drawJournal() {
    pmAcc = biomeAccent();
    menuChrome({ vtitle: false });
    menuHeader('JOURNAL');
    const types = G.Enemies.TYPES || [], kills = (G.save && G.save.kills) || {};
    const found = types.filter(t => kills[t.id] > 0).length;
    cx.save();
    cx.textAlign = 'left'; cx.textBaseline = 'alphabetic';
    cx.font = `${Math.round(h * 0.022)}px ${serif}`; cx.fillStyle = 'rgba(190,210,200,0.8)';
    cx.fillText('Discovered  ' + found + ' / ' + types.length, w * 0.30, h * 0.16 + 24);

    // scrolling list (left column)
    const idx = U.clamp(G.Main.journalIndex, 0, Math.max(0, types.length - 1));
    const lx = w * 0.30, ly = h * 0.26, step = Math.min(h * 0.052, 34), fs = Math.round(Math.min(h * 0.03, 19));
    const visible = Math.min(types.length, Math.floor((h * 0.62) / step));
    let top = U.clamp(idx - (visible >> 1), 0, Math.max(0, types.length - visible));
    cx.textBaseline = 'middle';
    for (let r = 0; r < visible; r++) {
      const i = top + r, t = types[i]; if (!t) break;
      const yy = ly + r * step, sel = i === idx, seen = kills[t.id] > 0;
      if (sel) { cx.globalAlpha = 0.9; cx.fillStyle = pmAcc; cx.fillRect(lx - 12, yy - step * 0.45, w * 0.22, step * 0.9); cx.globalAlpha = 1; }
      cx.font = `${sel ? '900' : '700'} ${fs}px ${menuFont}`; cx.textAlign = 'left';
      cx.fillStyle = sel ? '#06120e' : (seen ? 'rgba(202,226,216,0.9)' : 'rgba(120,135,128,0.5)');
      cx.fillText(seen ? t.label.replace(/\s*\(.*\)/, '').toUpperCase() : '— — —', lx, yy);
      if (seen) { cx.textAlign = 'right'; cx.font = `${Math.round(fs * 0.85)}px ${serif}`; cx.fillStyle = sel ? '#06120e' : 'rgba(150,200,180,0.7)'; cx.fillText('×' + kills[t.id], lx + w * 0.21 - 14, yy); }
    }
    cx.restore();

    // detail panel (right): portrait + name + lore
    const sel = types[idx];
    if (sel) {
      const seen = kills[sel.id] > 0;
      const px = w * 0.60, py = h * 0.24, pw = w * 0.34, boxS = Math.min(w * 0.16, h * 0.28);
      cx.save();
      cx.strokeStyle = pmAcc; cx.globalAlpha = 0.5; cx.lineWidth = 2; cx.strokeRect(px, py, boxS, boxS); cx.globalAlpha = 1;
      if (seen) {
        const por = portraitFor(sel.id);
        if (por) cx.drawImage(por, px + 4, py + 4, boxS - 8, boxS - 8);
      } else {
        cx.fillStyle = 'rgba(120,135,128,0.5)'; cx.font = `900 ${Math.round(boxS * 0.4)}px ${menuFont}`;
        cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText('?', px + boxS / 2, py + boxS / 2);
      }
      cx.textAlign = 'left'; cx.textBaseline = 'alphabetic';
      const tx = px + boxS + 26;
      cx.fillStyle = '#eaf2ee'; cx.font = `900 ${Math.round(h * 0.04)}px ${menuFont}`;
      cx.fillText(seen ? sel.label.replace(/\s*\(.*\)/, '') : 'Undiscovered', tx, py + boxS * 0.34);
      cx.fillStyle = 'rgba(160,200,182,0.8)'; cx.font = `italic ${Math.round(h * 0.022)}px ${serif}`;
      cx.fillText(seen ? (sel.label.match(/\((.*)\)/) ? sel.label.match(/\((.*)\)/)[1] : '') : '', tx, py + boxS * 0.34 + 26);
      if (seen) { cx.fillStyle = 'rgba(150,200,180,0.7)'; cx.font = `${Math.round(h * 0.02)}px ${serif}`; cx.fillText('Slain  ×' + kills[sel.id], tx, py + boxS * 0.34 + 52); }
      // lore (wrapped)
      const lore = seen ? ((G.Enemies.BESTIARY && G.Enemies.BESTIARY[sel.id]) || '') : 'Slay this creature to record it in your journal.';
      cx.fillStyle = 'rgba(214,228,221,0.9)'; cx.font = `${Math.round(h * 0.024)}px ${serif}`;
      wrapText(cx, lore, px, py + boxS + 36, pw, Math.round(h * 0.034));
      cx.restore();
    }
    cx.save(); cx.textAlign = 'right'; cx.textBaseline = 'alphabetic';
    cx.fillStyle = 'rgba(150,172,162,0.7)'; cx.font = `13px ${serif}`;
    cx.fillText('↑ ↓  browse        Esc  back', w - 32, h - 32); cx.restore();
  }
  // simple word-wrap helper for canvas text
  function wrapText(ctx, text, x, y, maxW, lh) {
    const words = String(text).split(' '); let line = '', yy = y;
    for (const wd of words) {
      const test = line ? line + ' ' + wd : wd;
      if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, yy); line = wd; yy += lh; }
      else line = test;
    }
    if (line) ctx.fillText(line, x, yy);
  }

  // The pause menu's chrome (slanted dark backdrop, drifting bats, vertical title,
  // wanderer art), tinted by the current biome accent. Shared by Settings / Charms / Slots.
  // opts: { vtitle:false } hides the side MOSSVEIL · { nod:true } makes the wanderer nod.
  function menuChrome(opts) {
    opts = opts || {};
    cx.save();
    const g = cx.createLinearGradient(0, 0, w * 0.7, h);
    g.addColorStop(0, 'rgba(5,18,15,0.97)'); g.addColorStop(1, 'rgba(2,7,9,0.98)');
    cx.fillStyle = g; cx.fillRect(0, 0, w, h);
    cx.globalAlpha = 0.08; cx.fillStyle = pmAcc;
    cx.beginPath(); cx.moveTo(w * 0.52, 0); cx.lineTo(w * 0.66, 0); cx.lineTo(w * 0.44, h); cx.lineTo(w * 0.3, h); cx.closePath(); cx.fill();
    cx.restore();
    for (let i = 0; i < 7; i++) {
      const ph = pmTime * 0.16 + i * 1.7;
      drawBat(cx, ((Math.sin(ph) * 0.5 + 0.5) * 0.9 + 0.05) * w, (((i * 0.137 + pmTime * 0.025) % 1)) * h, 0.5 + (i % 3) * 0.22, pmTime * 7 + i, 0.16);
    }
    if (opts.vtitle !== false) {
      cx.save(); cx.globalAlpha = 0.09; cx.translate(w * 0.045, h * 0.5); cx.rotate(-Math.PI / 2);
      cx.textAlign = 'center'; cx.fillStyle = '#cfeede'; cx.font = `900 ${Math.round(h * 0.15)}px ${menuFont}`;
      cx.fillText('MOSSVEIL', 0, 0); cx.restore();
    }
    drawWanderer(cx, w * 0.3, h * 0.62, (h / 720) * 0.8, 0.9, opts.nod ? G.time : null);
  }

  // a bold accent-glow header for the pause-style menus
  function menuHeader(text) {
    cx.save(); cx.textAlign = 'left'; cx.textBaseline = 'alphabetic';
    cx.fillStyle = '#eaf2ee'; cx.shadowColor = pmAcc; cx.shadowBlur = 16;
    cx.font = `900 ${Math.round(h * 0.075)}px ${menuFont}`;
    cx.fillText(text, w * 0.42, h * 0.16); cx.shadowBlur = 0; cx.restore();
  }

  // Settings shares the pause menu's look: slanted dark backdrop, drifting bats, the
  // wanderer, and a biome-accent slash on the selected row.
  function drawSettings() {
    pmAcc = biomeAccent();
    menuChrome();
    menuHeader('SETTINGS');

    const rows = (G.Main.settingsRows && G.Main.settingsRows()) || [];
    G.UI.settingsButtons = [];
    const ang = -0.05, lx = w * 0.44, ly = h * 0.22, step = Math.min(h * 0.06, 44), fs = Math.round(Math.min(h * 0.036, 23));
    const cos = Math.cos(ang), sin = Math.sin(ang), colW = Math.min(w * 0.46, 540);
    const idx = G.Main.settingsIndex || 0;
    const visible = Math.min(rows.length, Math.floor((h * 0.68) / step));
    const top = U.clamp(idx - (visible >> 1), 0, Math.max(0, rows.length - visible));
    cx.save(); cx.translate(lx, ly); cx.rotate(ang); cx.textBaseline = 'middle';
    for (let r = 0; r < visible; r++) {
      const i = top + r; if (i >= rows.length) break;
      const sel = i === idx, yy = r * step;
      if (sel) {
        const sw = colW, sh = fs * 1.2;
        cx.save(); cx.globalAlpha = 0.92; cx.fillStyle = pmAcc;
        cx.beginPath();
        cx.moveTo(-16, yy - sh * 0.5); cx.lineTo(sw, yy - sh * 0.55);
        cx.lineTo(sw + sh * 0.65, yy + sh * 0.5); cx.lineTo(-16 + sh * 0.35, yy + sh * 0.5);
        cx.closePath(); cx.fill(); cx.restore();
      }
      cx.font = `${sel ? '900' : '700'} ${fs}px ${menuFont}`; cx.textAlign = 'left';
      if (!sel) { cx.lineWidth = 1; cx.strokeStyle = 'rgba(120,180,160,0.25)'; cx.strokeText(rows[i].label.toUpperCase(), 6, yy); }
      cx.fillStyle = sel ? '#06120e' : 'rgba(202,226,216,0.9)';
      cx.fillText(rows[i].label.toUpperCase(), 6, yy);
      cx.textAlign = 'right'; cx.font = `${Math.round(fs * 0.82)}px ${serif}`;
      cx.fillStyle = sel ? '#06120e' : '#cfe8d8';
      cx.fillText('‹  ' + rows[i].value + '  ›', colW - 8, yy);
      const scx = lx + (-16) * cos - yy * sin, scy = ly + (-16) * sin + yy * cos;
      G.UI.settingsButtons.push({ x: scx, y: scy - fs * 0.85, w: colW + 40, h: fs * 1.6, index: i });
    }
    cx.restore();

    cx.save(); cx.textAlign = 'right'; cx.textBaseline = 'alphabetic';
    cx.fillStyle = 'rgba(150,172,162,0.7)'; cx.font = `13px ${serif}`;
    cx.fillText('↑ ↓  select        ← →  adjust / open        Esc  back', w - 32, h - 32);
    cx.restore();
  }

  // ---- NPC dialogue box ----
  function drawNpcBust(ctx, ox, oy, s, color) {
    ctx.save(); ctx.translate(ox, oy);
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(-s, s * 1.1); ctx.quadraticCurveTo(-s * 1.15, -s * 0.2, -s * 0.5, -s * 0.95);
    ctx.quadraticCurveTo(0, -s * 1.35, s * 0.5, -s * 0.95); ctx.quadraticCurveTo(s * 1.15, -s * 0.2, s, s * 1.1); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(6,10,14,0.9)'; ctx.beginPath(); ctx.ellipse(0, -s * 0.5, s * 0.44, s * 0.6, 0, 0, 6.28); ctx.fill();
    ctx.fillStyle = '#bfe8ff';
    ctx.beginPath(); ctx.ellipse(-s * 0.16, -s * 0.5, s * 0.06, s * 0.1, 0, 0, 6.28); ctx.fill();
    ctx.beginPath(); ctx.ellipse(s * 0.16, -s * 0.5, s * 0.06, s * 0.1, 0, 0, 6.28); ctx.fill();
    ctx.restore();
  }
  function drawDialogue() {
    const D = G.Dialogue; if (!D || !D.active) return;
    const boxH = Math.min(h * 0.3, 230), by = h - boxH - 18, bx = w * 0.06, bw = w * 0.88, acc = D.color();
    cx.save();
    cx.fillStyle = 'rgba(6,12,14,0.93)'; roundRect(bx, by, bw, boxH, 12); cx.fill();
    cx.strokeStyle = acc + '99'; cx.lineWidth = 1.5; cx.stroke();
    const ps = boxH * 0.32, pbx = bx + 16, pby = by + 16;
    cx.save(); roundRect(pbx, pby, ps * 2, ps * 2, 8); cx.clip();
    cx.fillStyle = 'rgba(10,16,20,0.6)'; cx.fillRect(pbx, pby, ps * 2, ps * 2);
    drawNpcBust(cx, pbx + ps, pby + ps * 1.25, ps, acc); cx.restore();
    cx.strokeStyle = acc + '55'; roundRect(pbx, pby, ps * 2, ps * 2, 8); cx.stroke();
    const tx = pbx + ps * 2 + 28, tw = bx + bw - tx - 24;
    cx.textAlign = 'left'; cx.textBaseline = 'alphabetic';
    cx.fillStyle = acc; cx.font = `bold ${Math.round(h * 0.028)}px ${menuFont}`;
    cx.fillText((D.speaker() || '').toUpperCase(), tx, by + 38);
    cx.fillStyle = 'rgba(226,236,230,0.96)'; cx.font = `${Math.round(h * 0.026)}px ${serif}`;
    wrapText(cx, D.shownText(), tx, by + 68, tw, Math.round(h * 0.036));
    G.UI.dlgButtons = [];
    const ch = (!D.isTyping()) ? D.choices() : null;
    if (ch) {
      const lh = h * 0.036, chY = by + boxH - 14 - ch.length * lh;
      ch.forEach((c, i) => {
        const yy = chY + i * lh, sel = i === (G.Main.dlgChoice || 0);
        cx.fillStyle = sel ? acc : 'rgba(190,210,200,0.8)'; cx.font = `${sel ? 'bold ' : ''}${Math.round(h * 0.025)}px ${serif}`;
        cx.fillText((sel ? '▸ ' : '    ') + c.label, tx, yy + h * 0.025);
        G.UI.dlgButtons.push({ x: tx, y: yy, w: tw, h: lh, index: i });
      });
    } else if (!D.isTyping()) {
      cx.fillStyle = acc; cx.font = `${Math.round(h * 0.03)}px serif`; cx.textAlign = 'right';
      cx.fillText('▸', bx + bw - 22, by + boxH - 16);
    }
    cx.restore();
  }

  // Controls / key-binding menu — same pause-style chrome; each row shows an action + its key,
  // selectable to rebind (the next key pressed becomes the binding). Scrolls like Settings.
  function drawControls() {
    pmAcc = biomeAccent();
    menuChrome();
    menuHeader('CONTROLS');
    const items = G.Input.BINDABLE || [];
    const rows = items.map(([a, label]) => ({ label, value: G.Input.bindingLabel(a) }));
    rows.push({ label: 'Reset to defaults', value: '↺', reset: true });
    G.UI.controlButtons = [];
    const ang = -0.05, lx = w * 0.44, ly = h * 0.21, step = Math.min(h * 0.052, 38), fs = Math.round(Math.min(h * 0.032, 21));
    const cos = Math.cos(ang), sin = Math.sin(ang), colW = Math.min(w * 0.46, 540);
    const idx = U.clamp(G.Main.ctrlIndex || 0, 0, rows.length - 1);
    const visible = Math.min(rows.length, Math.floor((h * 0.70) / step));
    const top = U.clamp(idx - (visible >> 1), 0, Math.max(0, rows.length - visible));
    cx.save(); cx.translate(lx, ly); cx.rotate(ang); cx.textBaseline = 'middle';
    for (let r = 0; r < visible; r++) {
      const i = top + r; if (i >= rows.length) break;
      const sel = i === idx, yy = r * step, listening = sel && G.Main.ctrlListening;
      if (sel) {
        const sw = colW, sh = fs * 1.2;
        cx.save(); cx.globalAlpha = 0.92; cx.fillStyle = listening ? '#caa24a' : pmAcc;
        cx.beginPath();
        cx.moveTo(-16, yy - sh * 0.5); cx.lineTo(sw, yy - sh * 0.55);
        cx.lineTo(sw + sh * 0.65, yy + sh * 0.5); cx.lineTo(-16 + sh * 0.35, yy + sh * 0.5);
        cx.closePath(); cx.fill(); cx.restore();
      }
      cx.font = `${sel ? '900' : '700'} ${fs}px ${menuFont}`; cx.textAlign = 'left';
      if (!sel) { cx.lineWidth = 1; cx.strokeStyle = 'rgba(120,180,160,0.25)'; cx.strokeText(rows[i].label.toUpperCase(), 6, yy); }
      cx.fillStyle = sel ? '#06120e' : 'rgba(202,226,216,0.9)';
      cx.fillText(rows[i].label.toUpperCase(), 6, yy);
      cx.textAlign = 'right'; cx.font = `${Math.round(fs * 0.85)}px ${serif}`;
      cx.fillStyle = sel ? '#06120e' : '#cfe8d8';
      cx.fillText(listening ? 'press a key…' : rows[i].value, colW - 8, yy);
      const scx = lx + (-16) * cos - yy * sin, scy = ly + (-16) * sin + yy * cos;
      G.UI.controlButtons.push({ x: scx, y: scy - fs * 0.85, w: colW + 40, h: fs * 1.6, index: i });
    }
    cx.restore();

    cx.save(); cx.textAlign = 'right'; cx.textBaseline = 'alphabetic';
    cx.fillStyle = 'rgba(150,172,162,0.7)'; cx.font = `13px ${serif}`;
    cx.fillText(G.Main.ctrlListening ? 'press a key to bind…        Esc  cancel' : '↑ ↓  select        Enter / Z  rebind        Esc  back', w - 32, h - 32);
    cx.restore();
  }

  function drawBench() {
    menuBackdrop();
    menuTitle('R E S T E D', h * 0.3, 'rgba(255,230,180,0.4)');
    cx.font = `italic 15px ${serif}`; cx.fillStyle = 'rgba(200,215,208,0.7)'; cx.textAlign = 'center';
    cx.fillText('Your masks are mended; your journey is recorded.', w / 2, h * 0.3 + 30);
    G.UI.benchButtons = vmenu(G.Main.benchItems.map(t => ({ label: t })), G.Main.benchIndex, h * 0.44, 300, 48, 12);
    menuHint('↑ ↓ select · Enter choose · ESC leave');
    cx.restore();
  }
  function drawTravel() {
    menuBackdrop();
    menuTitle('T R A V E L', h * 0.16);
    const list = (G.save && G.save.benchList) || [];
    const cur = G.room ? G.room.id : null;
    const items = list.map(b => ({ label: b.name, sub: b.room === cur ? '— you are here —' : 'a bench you have rested at', dim: b.room === cur }));
    G.UI.travelButtons = vmenu(items, G.Main.travelIndex, h * 0.26, Math.min(560, w - 80), 54, 8);
    menuHint('↑ ↓ select · Enter travel · ESC back');
    cx.restore();
  }
  function drawShop() {
    menuBackdrop();
    menuTitle('V E N D O R', h * 0.15, 'rgba(255,230,160,0.4)');
    cx.font = `15px ${serif}`; cx.fillStyle = '#ffe28a'; cx.textAlign = 'center';
    cx.fillText('Glimmer  ' + G.Main.glimmer(), w / 2, h * 0.15 + 28);
    const sl = G.Main.shopList || [];
    const items = sl.map(c => { const price = G.Main.charmPrice(c.id); return { label: c.name, sub: c.desc, right: price + ' ' + icon('diamondOutline'), afford: G.Main.glimmer() >= price }; });
    G.UI.shopButtons = vmenu(items, G.Main.shopIndex, h * 0.25, Math.min(620, w - 80), 56, 8);
    menuHint('↑ ↓ select · Enter buy · ESC leave');
    cx.restore();
  }

  function drawMap() {
    const mv = G.Main.mapView;
    cx.save();
    cx.globalAlpha = 0.96;
    G.MapView.draw(cx, {
      w, h, pan: mv.pan, zoom: mv.zoom,
      visitedOnly: true,
      current: G.room ? G.room.id : null,
      playerPos: G.player ? { x: G.player.body.x, y: G.player.body.y } : null
    });
    // player-placed pins (map space = same frame as view.pan)
    const pins = (G.save && G.save.pins) || [];
    for (const pin of pins) {
      const sx = (pin.x - mv.pan.x) * mv.zoom + w / 2, sy = (pin.y - mv.pan.y) * mv.zoom + h / 2;
      cx.fillStyle = '#ffcf6a'; cx.strokeStyle = 'rgba(20,16,8,0.8)'; cx.lineWidth = 1.5;
      cx.beginPath(); cx.moveTo(sx, sy); cx.lineTo(sx - 5, sy - 11); cx.lineTo(sx + 5, sy - 11); cx.closePath();
      cx.fill(); cx.stroke();
      cx.beginPath(); cx.arc(sx, sy - 11, 4.5, 0, U.TAU); cx.fillStyle = '#ffe9b0'; cx.fill(); cx.stroke();
    }
    cx.globalAlpha = 1;
    cx.drawImage(vignette, 0, 0, w, h);
    cx.textAlign = 'center';
    cx.font = `26px ${serif}`;
    cx.fillStyle = 'rgba(232,240,236,0.9)';
    cx.fillText("WANDERER'S MAP", w / 2, 52);
    // exploration completion
    const total = Object.keys(G.LEVELS || {}).length || 1;
    const seen = Object.keys((G.save && G.save.visited) || {}).length;
    cx.font = `15px ${serif}`; cx.fillStyle = 'rgba(170,210,190,0.8)';
    cx.fillText('Explored  ' + Math.round(seen / total * 100) + '%   ·   ' + seen + ' / ' + total + ' chambers', w / 2, 76);
    cx.font = `14px ${serif}`;
    cx.fillStyle = 'rgba(180,195,190,0.7)';
    cx.fillText('arrows — pan      + / −  — zoom      Z — drop pin      X — clear pin      M — close', w / 2, h - 26);
    cx.restore();
  }

  function drawDeath(dt) {
    deathTextT += dt;
    const a = Math.min(1, deathTextT / 0.8);
    cx.save();
    cx.globalAlpha = a;
    cx.textAlign = 'center';
    cx.fillStyle = '#cdd8d4';
    cx.shadowColor = 'rgba(0,0,0,1)';
    cx.shadowBlur = 18;
    cx.font = `44px ${serif}`;
    cx.fillText('You have fallen.', w / 2, h * 0.45);
    cx.restore();
  }

  function drawEnding(t) {
    // ending / credits roll — content & style externalised to data/credits.js (G.Credits); the literal
    // fallback reproduces the old hardcoded roll byte-for-byte.
    const C = G.Credits;
    cx.save();
    cx.fillStyle = C ? C.bgStyle(Math.min(0.92, t * 0.8)) : `rgba(240,248,244,${Math.min(0.92, t * 0.8)})`;
    cx.fillRect(0, 0, w, h);
    cx.textAlign = 'center';
    const lines = C ? C.lines() : [
      { text: 'M O S S V E I L', size: 46, delay: 0.5, italic: false },
      { text: 'the glade remembers you', size: 22, delay: 1.6, italic: true },
      { text: '', size: 10, delay: 0, italic: true },
      { text: 'woven from code alone — every shape, sound and shadow', size: 16, delay: 2.8, italic: true },
      { text: '', size: 10, delay: 0, italic: true },
      { text: 'press any key to wander on', size: 17, delay: 4.0, italic: true }
    ];
    const tcol = C ? C.textColor() : '#1c2a24', gap = C ? C.lineGap() : 18;
    let y = h * (C ? C.startY() : 0.36);
    for (const ln of lines) {
      const a = U.clamp((t - ln.delay) / 0.8, 0, 1);
      cx.globalAlpha = a;
      cx.fillStyle = tcol;
      cx.font = `${ln.italic ? 'italic ' : ''}${ln.size}px ${serif}`;
      cx.fillText(ln.text, w / 2, y);
      y += ln.size + gap;
    }
    cx.restore();
  }

  UI.draw = (dt) => {
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx.clearRect(0, 0, w, h);
    const st = G.Main.state;

    // weather (rain/snow/wind…) over the world but under the HUD
    if (G.Weather && (st === 'play' || st === 'pause' || st === 'transition' || st === 'dead')) G.Weather.draw(cx, w, h);

    if (st === 'play' || st === 'dead' || st === 'pause' || st === 'transition' || st === 'dialogue') {
      drawHud(dt);
      if (st === 'play') { drawCompass(); drawObjectiveTracker(); }
      drawPrompts();
      drawAreaTitle(dt);
      drawBossBar(dt);
      drawBossTitle(dt);
      drawToasts(dt);
      drawBanners(dt);
    }
    cx.drawImage(vignette, 0, 0, w, h);

    if (st === 'title') drawTitleScreen();
    if (st === 'slots') { drawSlots(); drawToasts(dt); }
    // pause menu: the bats COVER the screen first, then the menu opens/closes behind
    // the blackout, so you never see the raw transition (P3R-style).
    pmTime += dt; updateSweep(dt);
    if (st === 'pause') {
      pmSel = U.damp(pmSel, G.Main.pauseIndex, 16, dt);
      // hold the menu hidden until the swarm has covered the screen, then reveal it
      const target = (swp.on && swp.kind === 'open' && !sweepCovered()) ? 0 : 1;
      pmOpen = U.damp(pmOpen, target, 14, dt);
      pmClosing = 0;
      drawPause(pmOpen);
    } else if (pmClosing > 0) {
      pmClosing -= dt;
      // keep the menu up until the swarm covers it, then drop it behind the blackout
      const target = (swp.on && swp.kind === 'close' && !sweepCovered()) ? 1 : 0;
      pmOpen = U.damp(pmOpen, target, 14, dt);
      drawPause(pmOpen);
    }
    if (st === 'dialogue') drawDialogue();
    if (st === 'quests') drawQuestLog();
    if (st === 'spelltree') drawSpellTree();
    if (st === 'charms') drawCharms();
    if (st === 'journal') drawJournal();
    if (st === 'settings') drawSettings();
    if (st === 'controls') drawControls();
    if (st === 'bench') drawBench();
    if (st === 'travel') { drawTravel(); drawToasts(dt); }
    if (st === 'shop') { drawShop(); drawToasts(dt); }
    if (st === 'dead') drawDeath(dt);
    if (st === 'ending') drawEnding(G.Main.endingT);
    if (st === 'map') drawMap();
    if (st === 'cutscene') G.Cutscene.drawHUD(cx, w, h);
    if (st === 'prologue' && G.Prologue) G.Prologue.drawHUD(cx, w, h);
    if (st === 'exited') drawGoodbye();

    drawSweep(cx);   // the bat sweep rides over the pause open/close transition

    // fade
    fade.val = U.damp(fade.val, fade.target, fade.speed, dt);
    if (Math.abs(fade.val - fade.target) < 0.02 && fade.cb) {
      const cb = fade.cb; fade.cb = null; fade.val = fade.target;
      cb();
    }
    if (fade.val > 0.01) {
      if (fade.iris) {                                   // iris transition: black with a shrinking/growing hole
        const maxR = Math.hypot(w, h) * 0.62, R = (1 - U.clamp(fade.val, 0, 1)) * maxR;
        cx.save();
        cx.fillStyle = 'rgba(2,5,7,1)';
        cx.beginPath(); cx.rect(0, 0, w, h);
        cx.moveTo(fade.ix + R, fade.iy); cx.arc(fade.ix, fade.iy, R, 0, Math.PI * 2, true);
        cx.fill('evenodd');
        if (R > 1) { cx.strokeStyle = 'rgba(150,200,180,0.25)'; cx.lineWidth = 3; cx.beginPath(); cx.arc(fade.ix, fade.iy, R, 0, Math.PI * 2); cx.stroke(); }
        cx.restore();
      } else {
        cx.fillStyle = `rgba(2,5,7,${U.clamp(fade.val, 0, 1)})`;
        cx.fillRect(0, 0, w, h);
      }
    }
    if (G.Debug && G.Debug.draw && (G.Debug.on || (G.Debug.anyLayer && G.Debug.anyLayer()))) G.Debug.draw(cx, w, h);   // dev entity inspector (F4) + overlay layers (#60)
    if (G.DebugTime && G.DebugTime.draw) G.DebugTime.draw(cx, w, h);      // time-control readout (#62)
    if (G.Cheats && G.Cheats.draw) G.Cheats.draw(cx, w, h);              // active-cheat indicator (#63)
    if (G.Heatmap && G.Heatmap.show && G.Heatmap.draw) G.Heatmap.draw(cx, w, h);   // play/death heatmap overlay (#66)
  };
})();
