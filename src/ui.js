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
  let bossT = -1, bossText = '';
  let maskFlash = 0, healFlash = 0, lowHpPulse = 0;
  const fade = { val: 1, target: 1, speed: 2, cb: null };
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
  UI.bossTitle = text => { bossText = text; bossT = 0; };
  // persistent boss health bar (Hollow Knight style)
  const bossBar = { boss: null, name: '', maxHp: 1, dispHp: 0, lagHp: 0, shown: 0 };
  UI.setBoss = boss => {
    if (boss) { bossBar.boss = boss; bossBar.name = boss.cfg.name; bossBar.maxHp = boss.maxHp; bossBar.dispHp = boss.hp; bossBar.lagHp = boss.hp; }
    else { bossBar.boss = null; }
  };
  UI.bossBarShown = () => bossBar.shown;   // for tests
  UI.onPlayerHurt = () => { maskFlash = 0.6; };
  UI.onHeal = () => { healFlash = 0.6; };
  UI.setFade = (target, speed, cb) => { fade.target = target; fade.speed = speed; fade.cb = cb || null; };
  UI.resetDeathText = () => { deathTextT = 0; };

  const serif = 'Georgia, "Times New Roman", serif';
  const SLOT_VIEW = 5;   // number of save slots shown on the slots screen

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
    maskFlash = Math.max(0, maskFlash - dt);
    healFlash = Math.max(0, healFlash - dt);
    lowHpPulse += dt * 5;

    // soul orb
    const ox = 64, oy = 64, or_ = 30;
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
    sg.addColorStop(0, '#eef8ff'); sg.addColorStop(1, '#9fcfe0');
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
      const mx = 122 + i * 38, my = 52;
      const alive = i < p.hp;
      let s = 13;
      if (alive && i === p.hp - 1 && maskFlash > 0) s = 13 + maskFlash * 6;
      if (alive && healFlash > 0 && i === p.hp - 1) s = 13 + Math.sin(healFlash * 10) * 4;
      cx.save();
      if (p.hp === 1 && alive) cx.globalAlpha = 0.7 + Math.sin(lowHpPulse) * 0.3;
      maskPath(mx, my, s);
      if (alive) {
        cx.fillStyle = '#e9e4d4';
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
    cx.beginPath(); cx.arc(38, 110, 6, 0, U.TAU);
    cx.fillStyle = '#ffe28a'; cx.shadowColor = 'rgba(255,226,138,0.7)'; cx.shadowBlur = 8; cx.fill();
    cx.shadowBlur = 0;
    cx.fillStyle = 'rgba(240,230,200,0.92)'; cx.font = `16px ${serif}`;
    cx.fillText(String(glim), 52, 111);
    cx.restore();
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
    const IN = 0.4, HOLD = 2.0, OUT = 0.7;
    if (bossT > IN + HOLD + OUT) { bossT = -1; return; }
    let alpha = bossT < IN ? bossT / IN : bossT < IN + HOLD ? 1 : 1 - (bossT - IN - HOLD) / OUT;
    cx.save();
    cx.globalAlpha = Math.max(0, alpha);
    cx.textAlign = 'center';
    cx.font = `52px ${serif}`;
    cx.fillStyle = '#dff2e4';
    cx.shadowColor = 'rgba(120,255,170,0.5)';
    cx.shadowBlur = 22;
    const sc = 1 + (bossT < IN ? (1 - bossT / IN) * 0.15 : 0);
    cx.translate(w / 2, h * 0.68);
    cx.scale(sc, sc);
    cx.fillText(bossText, 0, 0);
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
    // border
    cx.strokeStyle = 'rgba(220,235,225,0.5)'; cx.lineWidth = 1;
    cx.strokeRect(bx - 2.5, by - 2.5, bw + 5, bh + 5);
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

  function drawTitleScreen() {
    cx.save();
    const bg = cx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, 'rgba(3,8,9,0.82)');
    bg.addColorStop(0.5, 'rgba(3,8,9,0.6)');
    bg.addColorStop(1, 'rgba(3,8,9,0.85)');
    cx.fillStyle = bg;
    cx.fillRect(0, 0, w, h);
    cx.textAlign = 'center';
    const pulse = 0.5 + Math.sin(G.time * 1.5) * 0.5;

    cx.fillStyle = '#eaf2ee';
    cx.shadowColor = 'rgba(160,240,200,0.45)';
    cx.shadowBlur = 28;
    cx.font = `86px ${serif}`;
    const sp = '  ';
    cx.fillText('M O S S V E I L', w / 2, h * 0.34);
    cx.shadowBlur = 0;
    cx.font = `italic 22px ${serif}`;
    cx.fillStyle = 'rgba(200,220,210,0.85)';
    cx.fillText('—  e c h o e s   b e n e a t h  —', w / 2, h * 0.34 + 46);

    // ---- menu buttons ----
    const items = G.Main.menuItems || [];
    const bw = 280, bh = 46, gap = 13;
    const x0 = w / 2 - bw / 2;
    const y0 = h * 0.48;
    G.UI.titleButtons = [];
    items.forEach((it, i) => {
      const y = y0 + i * (bh + gap);
      const sel = i === G.Main.menuIndex && !G.Main.confirm;
      roundRect(x0, y, bw, bh, 9);
      cx.fillStyle = !it.enabled ? 'rgba(14,18,16,0.45)' : (sel ? 'rgba(38,72,54,0.92)' : 'rgba(18,28,24,0.7)');
      cx.fill();
      cx.lineWidth = sel ? 2.2 : 1;
      cx.strokeStyle = !it.enabled ? 'rgba(110,125,118,0.3)' : (sel ? `rgba(180,240,200,${0.7 + pulse * 0.3})` : 'rgba(120,150,135,0.45)');
      cx.stroke();
      cx.fillStyle = !it.enabled ? 'rgba(140,150,145,0.35)' : (sel ? '#eafff0' : '#c6d4cc');
      cx.font = `${sel ? 23 : 21}px ${serif}`;
      cx.textBaseline = 'middle';
      cx.fillText(it.label, w / 2, y + bh / 2 + 1);
      if (sel) { cx.fillStyle = 'rgba(180,240,200,0.9)'; cx.fillText('‹', x0 + 22, y + bh / 2 + 1); cx.fillText('›', x0 + bw - 22, y + bh / 2 + 1); }
      G.UI.titleButtons.push({ x: x0, y, w: bw, h: bh, index: i, enabled: it.enabled });
    });
    cx.textBaseline = 'alphabetic';

    cx.font = `italic 13px ${serif}`;
    cx.fillStyle = 'rgba(140,160,152,0.55)';
    cx.fillText('↑ ↓ select · Enter / Z confirm · or click — an original 2.5D homage, woven procedurally', w / 2, h - 24);
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

  function drawSlots() {
    cx.save();
    const bg = cx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, 'rgba(3,8,9,0.86)');
    bg.addColorStop(0.5, 'rgba(3,8,9,0.7)');
    bg.addColorStop(1, 'rgba(3,8,9,0.88)');
    cx.fillStyle = bg;
    cx.fillRect(0, 0, w, h);
    const pulse = 0.5 + Math.sin(G.time * 1.5) * 0.5;

    cx.textAlign = 'center';
    cx.fillStyle = '#eaf2ee';
    cx.shadowColor = 'rgba(160,240,200,0.4)';
    cx.shadowBlur = 20;
    cx.font = `46px ${serif}`;
    cx.fillText('C H O O S E   A   V E S S E L', w / 2, h * 0.155);
    cx.shadowBlur = 0;

    const slots = G.Main.slots || [];
    const bw = Math.min(580, w - 80), bh = 78, gap = 14;
    const total = SLOT_VIEW * bh + (SLOT_VIEW - 1) * gap;
    const x0 = w / 2 - bw / 2;
    const y0 = Math.max(h * 0.22, h * 0.5 - total / 2 + 14);
    G.UI.slotButtons = [];
    G.UI.slotTrashButtons = [];

    for (let i = 0; i < SLOT_VIEW; i++) {
      const y = y0 + i * (bh + gap);
      const sel = i === G.Main.slotIndex && !G.Main.confirm;
      const slot = slots[i];
      const info = slot ? G.Main.slotInfo(slot) : null;

      roundRect(x0, y, bw, bh, 10);
      cx.fillStyle = sel ? 'rgba(34,64,49,0.92)' : 'rgba(16,25,21,0.74)';
      cx.fill();
      cx.lineWidth = sel ? 2.2 : 1;
      cx.strokeStyle = sel ? `rgba(180,240,200,${0.7 + pulse * 0.3})` : 'rgba(110,140,125,0.4)';
      cx.stroke();

      // vessel numeral badge
      cx.textAlign = 'center';
      cx.fillStyle = sel ? 'rgba(180,240,200,0.95)' : 'rgba(150,180,165,0.7)';
      cx.font = `italic 30px ${serif}`;
      cx.textBaseline = 'middle';
      cx.fillText(ROMAN[i], x0 + 40, y + bh / 2);
      cx.beginPath();
      cx.moveTo(x0 + 76, y + 16); cx.lineTo(x0 + 76, y + bh - 16);
      cx.strokeStyle = 'rgba(140,170,155,0.25)'; cx.lineWidth = 1; cx.stroke();

      cx.textAlign = 'left';
      const tx = x0 + 96;
      if (info) {
        cx.fillStyle = sel ? '#eafff0' : '#cad8d0';
        cx.font = `22px ${serif}`;
        cx.fillText(info.place, tx, y + 28);
        cx.fillStyle = 'rgba(170,195,182,0.75)';
        cx.font = `14px ${serif}`;
        cx.fillText(info.detail, tx, y + 50);
        cx.fillStyle = 'rgba(140,165,153,0.6)';
        cx.font = `italic 13px ${serif}`;
        cx.fillText('rested ' + info.when, tx, y + 68);
        // trash button (top-right)
        const tbx = x0 + bw - 30, tby = y + 26, tbox = 34;
        drawTrashIcon(tbx, tby, 18, sel ? 'rgba(235,170,165,0.95)' : 'rgba(180,150,148,0.6)');
        G.UI.slotTrashButtons.push({ x: tbx - tbox / 2, y: y, w: tbox, h: bh, index: i });
      } else {
        cx.textAlign = 'center';
        cx.fillStyle = sel ? 'rgba(210,225,216,0.85)' : 'rgba(150,170,160,0.6)';
        cx.font = `italic 21px ${serif}`;
        cx.fillText('— empty vessel —', x0 + bw / 2 + 20, y + bh / 2 - 6);
        cx.fillStyle = 'rgba(150,180,165,0.5)';
        cx.font = `13px ${serif}`;
        cx.fillText('begin a new journey here', x0 + bw / 2 + 20, y + bh / 2 + 18);
      }
      if (sel) {
        cx.fillStyle = 'rgba(180,240,200,0.9)';
        cx.font = `20px ${serif}`;
        cx.textAlign = 'center';
        cx.fillText('‹', x0 + 12, y + bh / 2);
      }
      cx.textBaseline = 'alphabetic';
      G.UI.slotButtons.push({ x: x0, y, w: bw, h: bh, index: i });
    }

    // back button
    const back = { x: x0, y: y0 + SLOT_VIEW * (bh + gap) + 6, w: 120, h: 36 };
    roundRect(back.x, back.y, back.w, back.h, 8);
    cx.fillStyle = 'rgba(18,28,24,0.7)';
    cx.fill();
    cx.strokeStyle = 'rgba(120,150,135,0.45)'; cx.lineWidth = 1; cx.stroke();
    cx.fillStyle = '#c6d4cc'; cx.font = `17px ${serif}`;
    cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.fillText('‹ Back', back.x + back.w / 2, back.y + back.h / 2 + 1);
    cx.textBaseline = 'alphabetic';
    G.UI.slotBack = back;

    cx.font = `italic 13px ${serif}`;
    cx.fillStyle = 'rgba(140,160,152,0.55)';
    cx.textAlign = 'center';
    cx.fillText('↑ ↓ select · Enter / Z choose · Del delete · Esc back — empty slots start a new run', w / 2, h - 22);
    cx.restore();

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
  const SWP_COVER = 0.32, SWP_HOLD = 0.40, SWP_REVEAL = 0.36;
  const SWP_TOTAL = SWP_COVER + SWP_HOLD + SWP_REVEAL;   // ~1.08s
  const menuFont = '"Arial Black", "Arial Bold", Impact, sans-serif';
  // the pause menu's accent follows the biome the player is in
  function biomeAccent() {
    const gl = G.room && G.room.pal && G.room.pal.glow;
    return gl ? '#' + gl.toString(16).padStart(6, '0') : '#6cf2b0';
  }

  UI.openPause = () => { pmOpen = 0; pmClosing = 0; pmSel = G.Main.pauseIndex || 0; pmAcc = biomeAccent(); startSweep(1); G.Audio.sfx('uiBell'); };
  UI.closePause = () => { pmClosing = SWP_TOTAL + 0.05; startSweep(-1); };

  function startSweep(dir) {
    // dir > 0 = opening (bats sweep UP), dir < 0 = closing (bats sweep DOWN)
    swp.on = true; swp.t = 0; swp.dir = dir; swp.bats = [];
    for (let i = 0; i < 170; i++) {
      const sp = U.rand(0.9, 2.3);
      swp.bats.push({
        px: U.rand(-0.06, 1.06),
        // bias the swarm toward the edge it enters from so it reads as a wave
        py: dir > 0 ? U.rand(0.35, 1.55) : U.rand(-0.55, 0.65),
        vx: U.rand(-0.4, 0.4) * sp,
        vy: (dir > 0 ? -1 : 1) * sp * U.rand(0.95, 1.7),
        s: U.rand(0.8, 2.7), flap: U.rand(0, 6.28), flapSp: U.rand(14, 24), delay: U.rand(0, 0.12)
      });
    }
  }
  function drawBat(ctx, x, y, s, flap, alpha) {
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.translate(x, y); ctx.scale(s, s); ctx.globalAlpha = alpha;
    const f = Math.sin(flap);
    ctx.fillStyle = '#060a08';
    ctx.shadowColor = pmAcc; ctx.shadowBlur = 7;
    ctx.beginPath();
    ctx.moveTo(0, -2);
    ctx.bezierCurveTo(5, -6 - f * 5, 12, -3, 20, -7 - f * 7);
    ctx.bezierCurveTo(16, 0, 11, 3, 4, 4);
    ctx.bezierCurveTo(2, 7, -2, 7, -4, 4);
    ctx.bezierCurveTo(-11, 3, -16, 0, -20, -7 - f * 7);
    ctx.bezierCurveTo(-12, -3, -5, -6 - f * 5, 0, -2);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function updateSweep(dt) {
    if (!swp.on) return;
    swp.t += dt;
    if (swp.t >= SWP_TOTAL) { swp.on = false; return; }
    for (const b of swp.bats) { if (swp.t < b.delay) continue; b.px += b.vx * dt * 0.6; b.py += b.vy * dt * 0.6; b.flap += dt * b.flapSp; }
  }
  // 0 → 0.5 as the curtain slides on, held at 0.5 (fully covering) through the hold, 0.5 → 1 as it slides off
  function sweepTravel(t) {
    const ez = x => x * x * (3 - 2 * x);   // smoothstep
    if (t < SWP_COVER) return 0.5 * ez(t / SWP_COVER);
    if (t < SWP_COVER + SWP_HOLD) return 0.5;
    return 0.5 + 0.5 * ez(U.clamp((t - SWP_COVER - SWP_HOLD) / SWP_REVEAL, 0, 1));
  }
  // true once the swarm has the screen fully blacked out (cover done) — the cue to swap the menu
  function sweepCovered() { return swp.on && swp.t >= SWP_COVER; }
  function drawSweep(ctx) {
    if (!swp.on) return;
    const sc = (w / 1280) * 2.2;
    // A dark curtain rides with the swarm: it slides on to fully black out the screen,
    // HOLDS there while the menu swaps behind it, then slides off to reveal the result —
    // so the game<->pause transition underneath is never visible. The band is taller than
    // the screen and travels up on open / down on close.
    const Hb = 1.8;
    const travel = sweepTravel(swp.t);
    const bt = U.lerp(swp.dir > 0 ? 1.0 : -1.8, swp.dir > 0 ? -1.8 : 1.0, travel);
    const y0 = bt * h, y1 = (bt + Hb) * h;
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, 'rgba(3,6,5,0)');
    g.addColorStop(0.14, 'rgba(3,6,5,1)');
    g.addColorStop(0.86, 'rgba(3,6,5,1)');
    g.addColorStop(1, 'rgba(3,6,5,0)');
    ctx.save();
    ctx.fillStyle = g;
    ctx.fillRect(0, Math.min(y0, y1), w, Math.abs(y1 - y0));
    ctx.restore();
    // bats fade in over the cover, stay through the hold, fade out over the reveal
    const fade = swp.t < SWP_COVER ? U.clamp(swp.t / (SWP_COVER * 0.6), 0, 1)
      : swp.t > SWP_COVER + SWP_HOLD ? U.clamp(1 - (swp.t - SWP_COVER - SWP_HOLD) / SWP_REVEAL, 0, 1)
        : 1;
    for (const b of swp.bats) {
      if (swp.t < b.delay) continue;
      const fin = swp.dir > 0 ? U.clamp((swp.t - b.delay) / 0.12, 0, 1) : 1;
      drawBat(ctx, b.px * w, b.py * h, b.s * sc, b.flap, 0.96 * fade * fin);
    }
  }
  function drawWanderer(ctx, x, y, s, alpha) {
    ctx.save();
    ctx.translate(x, y); ctx.scale(s, s); ctx.globalAlpha = alpha;
    ctx.fillStyle = '#0b171b';
    ctx.beginPath();
    ctx.moveTo(0, -175); ctx.bezierCurveTo(-122, -118, -150, 70, -108, 235);
    ctx.lineTo(108, 235); ctx.bezierCurveTo(150, 70, 122, -118, 0, -175); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#16282f';
    ctx.beginPath();
    ctx.moveTo(0, -148); ctx.bezierCurveTo(-72, -100, -92, 70, -62, 224);
    ctx.lineTo(62, 224); ctx.bezierCurveTo(92, 70, 72, -100, 0, -148); ctx.closePath(); ctx.fill();
    // horns
    ctx.fillStyle = '#e9e4d4';
    ctx.beginPath(); ctx.moveTo(-24, -120); ctx.bezierCurveTo(-72, -150, -104, -214, -82, -150); ctx.bezierCurveTo(-62, -118, -42, -110, -24, -116); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(24, -120); ctx.bezierCurveTo(72, -150, 104, -214, 82, -150); ctx.bezierCurveTo(62, -118, 42, -110, 24, -116); ctx.closePath(); ctx.fill();
    // mask
    ctx.shadowColor = 'rgba(120,255,190,0.4)'; ctx.shadowBlur = 26;
    ctx.beginPath();
    ctx.moveTo(0, -132); ctx.bezierCurveTo(-58, -126, -64, -58, -34, -34);
    ctx.bezierCurveTo(-14, -20, 14, -20, 34, -34); ctx.bezierCurveTo(64, -58, 58, -126, 0, -132); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#17110b';
    ctx.beginPath(); ctx.ellipse(-20, -72, 9, 17, 0, 0, 6.28); ctx.fill();
    ctx.beginPath(); ctx.ellipse(20, -72, 9, 17, 0, 0, 6.28); ctx.fill();
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
    cx.fillText('◇ ' + (G.Main.glimmer ? G.Main.glimmer() : 0), bx + 14, by + 15);
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

  function drawCharms() {
    menuBackdrop();
    const C = G.Charms;
    cx.textAlign = 'center';
    cx.fillStyle = '#eaf2ee'; cx.shadowColor = 'rgba(160,240,200,0.4)'; cx.shadowBlur = 18;
    cx.font = `40px ${serif}`; cx.fillText('C H A R M S', w / 2, h * 0.13); cx.shadowBlur = 0;
    // notch meter
    const used = C.usedNotches(), total = C.notches();
    cx.font = `15px ${serif}`; cx.fillStyle = 'rgba(190,210,200,0.8)';
    cx.fillText('Notches  ' + used + ' / ' + total, w / 2, h * 0.13 + 28);
    const list = C.LIST, n = list.length;
    const bw = Math.min(640, w - 80), bh = 56, gap = 8, x0 = w / 2 - bw / 2;
    const y0 = h * 0.22;
    G.UI.charmButtons = [];
    list.forEach((c, i) => {
      const y = y0 + i * (bh + gap);
      const sel = i === G.Main.charmIndex;
      const owned = C.isOwned(c.id);
      const eq = C.isEquipped(c.id);
      const affordable = eq || C.canEquip(c.id);
      roundRect(x0, y, bw, bh, 9);
      cx.fillStyle = sel ? 'rgba(36,64,50,0.94)' : 'rgba(16,25,21,0.74)'; cx.fill();
      cx.lineWidth = sel ? 2.2 : 1;
      cx.strokeStyle = eq ? 'rgba(150,240,180,0.85)' : (sel ? 'rgba(180,240,200,0.8)' : 'rgba(110,140,125,0.4)'); cx.stroke();
      // equipped pip
      cx.beginPath(); cx.arc(x0 + 22, y + bh / 2, 7, 0, Math.PI * 2);
      cx.fillStyle = eq ? '#9bf0b8' : 'rgba(120,140,130,0.25)'; cx.fill();
      cx.textAlign = 'left';
      cx.fillStyle = !owned ? 'rgba(130,140,135,0.55)' : (affordable ? (sel ? '#eafff0' : '#cad8d0') : 'rgba(150,120,120,0.7)');
      cx.font = `19px ${serif}`; cx.textBaseline = 'middle';
      cx.fillText(owned ? c.name : '— locked —', x0 + 40, y + 19);
      cx.fillStyle = 'rgba(175,195,182,0.62)'; cx.font = `13px ${serif}`;
      cx.fillText(owned ? c.desc : 'Undiscovered — find it in the world or buy it from a vendor.', x0 + 40, y + 39);
      cx.textAlign = 'right'; cx.fillStyle = 'rgba(200,220,190,0.75)'; cx.font = `13px ${serif}`;
      cx.fillText('◆'.repeat(c.cost), x0 + bw - 16, y + bh / 2);
      G.UI.charmButtons.push({ x: x0, y, w: bw, h: bh, index: i });
    });
    cx.textAlign = 'center'; cx.textBaseline = 'alphabetic';
    cx.font = `italic 13px ${serif}`; cx.fillStyle = 'rgba(140,160,152,0.55)';
    cx.fillText('↑ ↓ select · Enter / Z equip-unequip · ESC back', w / 2, h - 22);
    cx.restore();
  }

  function drawSettings() {
    menuBackdrop();
    const s = G.settings || { volume: 0.8, shake: true, quality: 'high' };
    cx.textAlign = 'center';
    cx.fillStyle = '#eaf2ee'; cx.shadowColor = 'rgba(160,240,200,0.4)'; cx.shadowBlur = 18;
    cx.font = `40px ${serif}`; cx.fillText('S E T T I N G S', w / 2, h * 0.2); cx.shadowBlur = 0;
    const rows = [
      ['Sound volume', Math.round(s.volume * 100) + '%'],
      ['Screen shake', s.shake ? 'On' : 'Off'],
      ['Visual quality', s.quality.charAt(0).toUpperCase() + s.quality.slice(1)]
    ];
    const bw = 460, bh = 52, gap = 12, x0 = w / 2 - bw / 2, y0 = h * 0.34;
    G.UI.settingsButtons = [];
    rows.forEach((r, i) => {
      const y = y0 + i * (bh + gap);
      const sel = i === G.Main.settingsIndex;
      roundRect(x0, y, bw, bh, 9);
      cx.fillStyle = sel ? 'rgba(38,72,54,0.92)' : 'rgba(18,28,24,0.7)'; cx.fill();
      cx.lineWidth = sel ? 2.2 : 1;
      cx.strokeStyle = sel ? 'rgba(180,240,200,0.8)' : 'rgba(120,150,135,0.45)'; cx.stroke();
      cx.textAlign = 'left'; cx.fillStyle = sel ? '#eafff0' : '#c6d4cc';
      cx.font = `19px ${serif}`; cx.textBaseline = 'middle';
      cx.fillText(r[0], x0 + 22, y + bh / 2);
      cx.textAlign = 'right'; cx.fillStyle = '#eafff0';
      cx.fillText('‹  ' + r[1] + '  ›', x0 + bw - 20, y + bh / 2);
      G.UI.settingsButtons.push({ x: x0, y, w: bw, h: bh, index: i });
    });
    cx.textAlign = 'center'; cx.textBaseline = 'alphabetic';
    cx.font = `italic 13px ${serif}`; cx.fillStyle = 'rgba(140,160,152,0.55)';
    cx.fillText('↑ ↓ select · ← → adjust · ESC back', w / 2, h - 26);
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
    const items = sl.map(c => { const price = G.Main.charmPrice(c.id); return { label: c.name, sub: c.desc, right: price + ' ◇', afford: G.Main.glimmer() >= price }; });
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
    cx.globalAlpha = 1;
    cx.drawImage(vignette, 0, 0, w, h);
    cx.textAlign = 'center';
    cx.font = `26px ${serif}`;
    cx.fillStyle = 'rgba(232,240,236,0.9)';
    cx.fillText("WANDERER'S MAP", w / 2, 52);
    cx.font = `14px ${serif}`;
    cx.fillStyle = 'rgba(180,195,190,0.7)';
    cx.fillText('arrows — pan      + / −  — zoom      M — close', w / 2, h - 26);
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
    cx.save();
    cx.fillStyle = `rgba(240,248,244,${Math.min(0.92, t * 0.8)})`;
    cx.fillRect(0, 0, w, h);
    cx.textAlign = 'center';
    const lines = [
      ['M O S S V E I L', 46, 0.5],
      ['the glade remembers you', 22, 1.6],
      ['', 10, 0],
      ['woven from code alone — every shape, sound and shadow', 16, 2.8],
      ['', 10, 0],
      ['press any key to wander on', 17, 4.0]
    ];
    let y = h * 0.36;
    for (const [text, size, delay] of lines) {
      const a = U.clamp((t - delay) / 0.8, 0, 1);
      cx.globalAlpha = a;
      cx.fillStyle = '#1c2a24';
      cx.font = `${size === 46 ? '' : 'italic '}${size}px ${serif}`;
      cx.fillText(text, w / 2, y);
      y += size + 18;
    }
    cx.restore();
  }

  UI.draw = (dt) => {
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx.clearRect(0, 0, w, h);
    const st = G.Main.state;

    if (st === 'play' || st === 'dead' || st === 'pause' || st === 'transition') {
      drawHud(dt);
      drawPrompts();
      drawAreaTitle(dt);
      drawBossBar(dt);
      drawBossTitle(dt);
      drawToasts(dt);
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
      const target = (swp.on && swp.dir > 0 && !sweepCovered()) ? 0 : 1;
      pmOpen = U.damp(pmOpen, target, 14, dt);
      pmClosing = 0;
      drawPause(pmOpen);
    } else if (pmClosing > 0) {
      pmClosing -= dt;
      // keep the menu up until the swarm covers it, then drop it behind the blackout
      const target = (swp.on && swp.dir < 0 && !sweepCovered()) ? 1 : 0;
      pmOpen = U.damp(pmOpen, target, 14, dt);
      drawPause(pmOpen);
    }
    if (st === 'charms') drawCharms();
    if (st === 'settings') drawSettings();
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
      cx.fillStyle = `rgba(2,5,7,${U.clamp(fade.val, 0, 1)})`;
      cx.fillRect(0, 0, w, h);
    }
  };
})();
