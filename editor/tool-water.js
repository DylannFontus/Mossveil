// MOSSVEIL — tool-water.js : reflective-water surface editor (Edit ▸ Systems).  Roadmap #75.
// Authors the global look of the screen-space water reflection / refraction (src/water.js ->
// data/water.js): reflection strength, ripple, distance fade, caustic shimmer and tint. Individual
// water zones still override per-room. A LIVE ANIMATED PREVIEW renders a little scene mirrored into
// rippled, tinted, fading water so you can dial the look without launching the game. Edits the overlay
// through the data layer; applies on next Play. Defaults byte-identical to post.js / world.js.
(function () {
  const T = G.Tools, WX = G.WaterFX;
  if (!T || !WX || !WX.exportDefaults) return;
  const clone = o => JSON.parse(JSON.stringify(o));
  let data = null, dirty = false, bodyEl = null, api = null, pcv = null, sim = null;

  const hex2 = v => ('0' + Math.round(v * 255).toString(16)).slice(-2);
  const rgbToHex = c => '#' + hex2(c.r) + hex2(c.g) + hex2(c.b);
  const hexToRgb = h => ({ r: parseInt(h.slice(1, 3), 16) / 255, g: parseInt(h.slice(3, 5), 16) / 255, b: parseInt(h.slice(5, 7), 16) / 255 });

  const MT = T.water = {
    get state() { return { data, dirty }; },
    getWorking() { return data; },
    load() { data = clone(WX.exportCurrent()); dirty = false; },
    revert() { data = clone(WX.exportDefaults()); dirty = true; if (bodyEl) render(); },
    applyToEngine() { WX.applyData(clone(data)); },
    async save() { await api.data.save('water', 'WATER_DATA', data); MT.applyToEngine(); dirty = false; if (api) api.toast('Water look saved'); if (bodyEl) render(); return true; },
    setField(k, v) { data[k] = v; dirty = true; },
    setColor(hex) { data.color = hexToRgb(hex); dirty = true; },
    openInTool() { return T.openTool('water'); }
  };

  // ---- animated preview: a scene mirrored into rippled / tinted / fading water ----
  function frame(now) {
    if (!pcv || !document.body.contains(pcv)) { sim = null; return; }
    const s = sim, dt = Math.min(0.05, (now - s.last) / 1000 || 0.016); s.last = now; s.t += dt;
    draw(s.t);
    requestAnimationFrame(frame);
  }

  function drawScene(cx, W, wl) {
    const sky = cx.createLinearGradient(0, 0, 0, wl); sky.addColorStop(0, '#0b1a2a'); sky.addColorStop(1, '#23405a');
    cx.fillStyle = sky; cx.fillRect(0, 0, W, wl);
    cx.fillStyle = 'rgba(255,255,255,0.8)'; for (let i = 0; i < 22; i++) { const x = (i * 97) % W, y = (i * 53) % (wl - 10); cx.fillRect(x, y, 1.5, 1.5); }
    cx.fillStyle = '#e9f0e0'; cx.beginPath(); cx.arc(W - 90, wl * 0.34, 22, 0, 7); cx.fill();   // moon
    cx.fillStyle = '#16241c'; cx.beginPath(); cx.moveTo(0, wl); cx.lineTo(120, wl - 46); cx.lineTo(250, wl); cx.fill();
    cx.fillStyle = '#1c2e22'; cx.beginPath(); cx.moveTo(170, wl); cx.lineTo(330, wl - 64); cx.lineTo(W, wl); cx.fill();
  }

  function draw(t) {
    if (!pcv) return;
    const cx = pcv.getContext('2d'), W = pcv.width, H = pcv.height, wl = Math.round(H * 0.46);
    const c = data.color, tint = 'rgb(' + Math.round(c.r * 255) + ',' + Math.round(c.g * 255) + ',' + Math.round(c.b * 255) + ')';
    cx.globalCompositeOperation = 'source-over'; cx.globalAlpha = 1;
    drawScene(cx, W, wl);
    // water base
    cx.fillStyle = '#0a141c'; cx.fillRect(0, wl, W, H - wl);
    // mirrored, rippled reflection — strip by strip from the scene above
    const reflH = H - wl;
    for (let i = 0; i < reflH; i += 2) {
      const srcY = wl - i - 2, dstY = wl + i;
      if (srcY < 0) break;
      const off = data.ripple * 5 * Math.sin(i * 0.13 + t * 2.4) * (0.4 + i / reflH);
      cx.globalAlpha = Math.max(0, data.strength * (1 - (i / reflH) * Math.min(1.4, data.fade) * 0.7));
      cx.drawImage(pcv, 0, srcY, W, 2, off, dstY, W, 2);
    }
    cx.globalAlpha = 1;
    // tint the water
    cx.globalCompositeOperation = 'source-over';
    cx.fillStyle = tint; cx.globalAlpha = 0.28; cx.fillRect(0, wl, W, reflH); cx.globalAlpha = 1;
    // caustic shimmer
    if (data.caustics > 0.001) {
      cx.globalCompositeOperation = 'lighter'; cx.strokeStyle = 'rgba(200,230,255,' + Math.min(0.5, data.caustics * 0.5) + ')'; cx.lineWidth = 1.5;
      for (let b = 1; b <= 3; b++) {
        const y = wl + reflH * (b / 4); cx.beginPath();
        for (let x = 0; x <= W; x += 6) cx.lineTo(x, y + Math.sin(x * 0.05 + t * 1.6 + b) * 3 * data.caustics);
        cx.stroke();
      }
      cx.globalCompositeOperation = 'source-over';
    }
    // surface line
    cx.strokeStyle = 'rgba(180,210,235,0.5)'; cx.lineWidth = 1; cx.beginPath(); cx.moveTo(0, wl + 0.5); cx.lineTo(W, wl + 0.5); cx.stroke();
    cx.fillStyle = 'rgba(220,230,210,0.85)'; cx.font = '11px monospace'; cx.textAlign = 'left'; cx.textBaseline = 'top';
    cx.fillText('strength ' + data.strength.toFixed(2) + '  ripple ' + data.ripple.toFixed(2) + '  fade ' + data.fade.toFixed(2), 8, 6);
  }

  function startSim() { sim = { t: 0, last: performance.now() }; draw(0); requestAnimationFrame(frame); }

  function el(t, a, p, x) { return api.el(t, a, p, x); }

  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column';
    const head = el('div', { style: 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line)' }, bodyEl);
    el('button', { class: 'tbtn play', onclick: () => MT.save().catch(e => api.toast('Save failed: ' + e.message)) }, head, '💾 Save');
    el('button', { class: 'tbtn', onclick: () => { if (confirm('Reset the water look to defaults?')) MT.revert(); } }, head, '↺ Revert');
    el('span', { class: 'tc-mut' }, head, dirty ? '● unsaved' : 'saved ✓');
    el('div', { style: 'flex:1' }, head);
    el('span', { class: 'tc-mut' }, head, 'applies on next Play');

    const grid = el('div', { style: 'flex:1;display:grid;grid-template-columns:1fr 480px;gap:0;min-height:0' }, bodyEl);
    const ctl = el('div', { style: 'overflow:auto;padding:14px 16px;display:flex;flex-direction:column;gap:16px;min-height:0;max-width:560px' }, grid);
    const side = el('div', { style: 'border-left:1px solid var(--line);padding:14px;display:flex;flex-direction:column;gap:8px;overflow:auto' }, grid);

    const s1 = section(ctl, '🌊 Reflection', 'How the reflective water / wet-floor surface looks. Zones in a room can still override these per-room; this is the global default.');
    slider(s1, 'Strength', 'strength', 0, 1, 0.01);
    slider(s1, 'Ripple', 'ripple', 0, 4, 0.05);
    slider(s1, 'Distance fade', 'fade', 0, 4, 0.05);
    slider(s1, 'Caustic shimmer', 'caustics', 0, 2, 0.05);

    const s2 = section(ctl, '🎨 Tint', 'The colour the reflection is washed with.');
    const r = el('div', { class: 'tc-row' }, s2); el('label', { style: 'flex:1' }, r, 'Reflection tint');
    const col = el('input', { type: 'color' }, r); col.value = rgbToHex(data.color);
    col.addEventListener('input', () => MT.setColor(col.value));

    el('div', { class: 'tc-mut', style: 'align-self:flex-start' }, side, 'Live water preview');
    pcv = el('canvas', { width: '460', height: '260', style: 'border:1px solid var(--line);border-radius:6px;background:#0a141c;max-width:100%' }, side);
    el('div', { class: 'tc-mut', style: 'font-size:11px' }, side, 'The scene is mirrored into the water below the surface line; strength sets the mirror, ripple distorts it, fade dims it with depth, and the shimmer + tint colour it.');
    startSim();
  }

  function slider(p, label, key, min, max, step) {
    const r = el('div', { class: 'tc-row' }, p); el('label', { style: 'flex:1' }, r, label);
    const inp = el('input', { type: 'range', min: '' + min, max: '' + max, step: '' + step }, r); inp.value = data[key];
    const num = el('input', { type: 'number', min: '' + min, max: '' + max, step: '' + step, style: 'width:66px' }, r); num.value = data[key];
    inp.addEventListener('input', () => { num.value = inp.value; MT.setField(key, +inp.value); });
    num.addEventListener('change', () => { inp.value = num.value; MT.setField(key, +num.value); });
  }

  function section(parent, title, desc) {
    const box = el('div', {}, parent);
    el('h3', { style: 'margin:0 0 2px;font-size:14px' }, box, title);
    if (desc) el('div', { class: 'tc-mut', style: 'margin-bottom:6px;font-size:11px;line-height:1.4' }, box, desc);
    return box;
  }

  T.registerTool({
    id: 'water', label: 'Water & reflections', icon: '💧', group: 'Systems',
    sub: 'reflection · ripple · fade · tint',
    build(host, a) { api = a; bodyEl = host; if (!data) MT.load(); render(); }
  });
  if (T.roadmapDone) T.roadmapDone(75);
})();
