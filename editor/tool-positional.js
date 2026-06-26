// MOSSVEIL — tool-positional.js : positional / 3D-audio editor (Edit ▸ Audio).  Roadmap #83.
// Authors how positional one-shots (Audio.sfxAt) and footsteps attenuate + pan by distance to the camera
// (src/positional.js -> data/positional.js): the reference distance, roll-off steepness, far-distance
// floor gain, the world-units-to-hard-pan width, and how much vertical distance counts. A LIVE ANIMATED
// PREVIEW shows the distance→gain falloff curve and a top-down stereo field with a source orbiting the
// listener, so you can dial the 3D feel without launching the game. Edits the overlay through the data
// layer; applies live + on next Play. Defaults byte-identical to audio.js's old spatial() constants.
(function () {
  const T = G.Tools, P = G.Positional;
  if (!T || !P || !P.exportDefaults) return;
  const clone = o => JSON.parse(JSON.stringify(o));
  let data = null, dirty = false, bodyEl = null, api = null, pcv = null, sim = null;

  const MT = T.positional = {
    get state() { return { data, dirty }; },
    getWorking() { return data; },
    load() { data = clone(P.exportCurrent()); dirty = false; },
    revert() { data = clone(P.exportDefaults()); dirty = true; if (bodyEl) render(); },
    applyToEngine() { P.applyData(clone(data)); },
    async save() { await api.data.save('positional', 'POSITIONAL_DATA', data); MT.applyToEngine(); dirty = false; if (api) api.toast('Positional audio saved'); if (bodyEl) render(); return true; },
    setField(k, v) { data[k] = v; dirty = true; },
    openInTool() { return T.openTool('positional'); }
  };

  // ---- the falloff / pan maths on the WORKING copy (mirrors G.Positional, so the preview is live) ----
  const distOf = (dx, dy) => Math.abs(dx) + Math.abs(dy) * data.yWeight;
  const gainFor = d => Math.max(data.minGain, Math.min(1, 1 / (1 + Math.pow(d / data.refDist, data.falloffPow))));
  const panFor = dx => Math.max(-1, Math.min(1, dx / data.panWidth));

  // ---- animated preview: falloff curve (top) + top-down stereo field (bottom) ----
  function frame(now) {
    if (!pcv || !document.body.contains(pcv)) { sim = null; return; }
    const s = sim, dt = Math.min(0.05, (now - s.last) / 1000 || 0.016); s.last = now; s.t += dt;
    draw(s.t);
    requestAnimationFrame(frame);
  }

  function draw(t) {
    if (!pcv) return;
    const cx = pcv.getContext('2d'), W = pcv.width, H = pcv.height;
    cx.clearRect(0, 0, W, H); cx.fillStyle = '#0b1410'; cx.fillRect(0, 0, W, H);

    // a source orbiting the listener — distance + pan both vary so you see the curve and the field together
    const ang = t * 0.6;
    const radius = data.refDist * (1.1 + 0.85 * Math.sin(t * 0.5));
    const dx = radius * Math.cos(ang), dy = radius * Math.sin(ang) * 0.6;
    const dist = distOf(dx, dy), gain = gainFor(dist), pan = panFor(dx);

    // ----- top panel: distance -> gain falloff curve -----
    const padL = 36, padR = 12, gy0 = 18, gy1 = 120, gx0 = padL, gx1 = W - padR;
    const maxD = Math.max(24, data.refDist * 3.2);
    const X = d => gx0 + (d / maxD) * (gx1 - gx0);
    const Y = g => gy1 - g * (gy1 - gy0);
    // axes + floor
    cx.strokeStyle = 'rgba(255,255,255,0.12)'; cx.lineWidth = 1;
    cx.beginPath(); cx.moveTo(gx0, gy0); cx.lineTo(gx0, gy1); cx.lineTo(gx1, gy1); cx.stroke();
    cx.setLineDash([3, 3]); cx.strokeStyle = 'rgba(224,154,154,0.55)';
    cx.beginPath(); cx.moveTo(gx0, Y(data.minGain)); cx.lineTo(gx1, Y(data.minGain)); cx.stroke(); cx.setLineDash([]);
    // refDist knee marker
    cx.strokeStyle = 'rgba(201,160,255,0.5)';
    cx.beginPath(); cx.moveTo(X(data.refDist), gy0); cx.lineTo(X(data.refDist), gy1); cx.stroke();
    // the curve
    cx.strokeStyle = '#9fd6a0'; cx.lineWidth = 2; cx.beginPath();
    for (let px = gx0; px <= gx1; px++) { const d = ((px - gx0) / (gx1 - gx0)) * maxD; const y = Y(gainFor(d)); px === gx0 ? cx.moveTo(px, y) : cx.lineTo(px, y); }
    cx.stroke();
    // travelling marker at the source's current distance
    if (dist <= maxD) { cx.fillStyle = '#ffe08a'; cx.beginPath(); cx.arc(X(dist), Y(gain), 3.5, 0, 7); cx.fill(); }
    cx.fillStyle = 'rgba(220,230,210,0.85)'; cx.font = '11px monospace'; cx.textAlign = 'left'; cx.textBaseline = 'top';
    cx.fillText('distance → gain', gx0, 2);
    cx.fillStyle = 'rgba(201,160,255,0.8)'; cx.font = '9px monospace'; cx.fillText('ref ' + data.refDist, X(data.refDist) + 2, gy0);
    cx.fillStyle = 'rgba(224,154,154,0.8)'; cx.fillText('floor ' + data.minGain.toFixed(2), gx1 - 64, Y(data.minGain) - 11);

    // ----- bottom panel: top-down stereo field -----
    const fy0 = 142, fy1 = H - 14, fcy = (fy0 + fy1) / 2, fcx = W / 2, fH = fy1 - fy0;
    cx.fillStyle = 'rgba(255,255,255,0.04)'; cx.fillRect(0, fy0, W, fH);
    // L / R guide split
    cx.strokeStyle = 'rgba(255,255,255,0.08)'; cx.beginPath(); cx.moveTo(fcx, fy0); cx.lineTo(fcx, fy1); cx.stroke();
    cx.fillStyle = 'rgba(200,210,200,0.5)'; cx.font = '9px monospace'; cx.textAlign = 'left'; cx.textBaseline = 'top';
    cx.fillText('L', 6, fy0 + 3); cx.textAlign = 'right'; cx.fillText('R', W - 6, fy0 + 3); cx.textAlign = 'left';
    // listener (the camera/ear) at centre
    cx.fillStyle = '#cfe6cf'; cx.beginPath(); cx.arc(fcx, fcy, 5, 0, 7); cx.fill();
    cx.strokeStyle = 'rgba(207,230,207,0.7)'; cx.beginPath(); cx.arc(fcx, fcy, 5, -0.9, 0.9); cx.lineWidth = 2; cx.stroke();
    // source position: x by pan, y by signed vertical offset; size/opacity by gain
    const sx = fcx + pan * (W / 2 - 16);
    const sy = fcy + Math.max(-1, Math.min(1, dy / (data.refDist * 1.8))) * (fH / 2 - 10);
    cx.globalAlpha = 0.25 + gain * 0.75; cx.fillStyle = '#7fd0ff';
    cx.beginPath(); cx.arc(sx, sy, 3 + gain * 7, 0, 7); cx.fill(); cx.globalAlpha = 1;
    cx.strokeStyle = 'rgba(127,208,255,0.35)'; cx.lineWidth = 1; cx.beginPath(); cx.moveTo(fcx, fcy); cx.lineTo(sx, sy); cx.stroke();
    // per-channel level bars (equal-power-ish split of the gain by pan)
    const lG = gain * (1 - Math.max(0, pan)), rG = gain * (1 - Math.max(0, -pan));
    cx.fillStyle = 'rgba(127,208,255,0.7)';
    cx.fillRect(6, fy1 - 4 - lG * (fH - 8), 8, lG * (fH - 8));
    cx.fillRect(W - 14, fy1 - 4 - rG * (fH - 8), 8, rG * (fH - 8));
    cx.fillStyle = 'rgba(220,230,210,0.85)'; cx.font = '11px monospace'; cx.textBaseline = 'top';
    cx.fillText('stereo field  gain ' + gain.toFixed(2) + '  pan ' + (pan >= 0 ? '+' : '') + pan.toFixed(2), padL, fy0 - 13);
  }

  function startSim() { sim = { t: 0, last: performance.now() }; draw(0); requestAnimationFrame(frame); }

  function el(t, a, p, x) { return api.el(t, a, p, x); }

  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column';
    const head = el('div', { style: 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line)' }, bodyEl);
    el('button', { class: 'tbtn play', onclick: () => MT.save().catch(e => api.toast('Save failed: ' + e.message)) }, head, '💾 Save');
    el('button', { class: 'tbtn', onclick: () => { if (confirm('Reset positional audio to defaults?')) MT.revert(); } }, head, '↺ Revert');
    el('span', { class: 'tc-mut' }, head, dirty ? '● unsaved' : 'saved ✓');
    el('div', { style: 'flex:1' }, head);
    el('span', { class: 'tc-mut' }, head, 'applies live + on next Play');

    const grid = el('div', { style: 'flex:1;display:grid;grid-template-columns:1fr 480px;gap:0;min-height:0' }, bodyEl);
    const ctl = el('div', { style: 'overflow:auto;padding:14px 16px;display:flex;flex-direction:column;gap:16px;min-height:0;max-width:560px' }, grid);
    const side = el('div', { style: 'border-left:1px solid var(--line);padding:14px;display:flex;flex-direction:column;gap:8px;overflow:auto' }, grid);

    const s1 = section(ctl, '📐 Distance falloff', 'How a positioned sound quietens with distance from the camera. The reference distance is the roll-off knee; the steepness shapes the curve; the floor keeps far sounds faintly audible.');
    slider(s1, 'Reference distance', 'refDist', 0.5, 40, 0.5);
    slider(s1, 'Roll-off steepness', 'falloffPow', 0.25, 6, 0.05);
    slider(s1, 'Floor gain', 'minGain', 0, 1, 0.01);

    const s2 = section(ctl, '🎧 Stereo & height', 'How far off-centre a sound has to be for a hard left/right pan, and how much its vertical distance counts toward attenuation (vs purely horizontal).');
    slider(s2, 'Pan width', 'panWidth', 1, 60, 1);
    slider(s2, 'Vertical weight', 'yWeight', 0, 2, 0.05);

    el('div', { class: 'tc-mut', style: 'align-self:flex-start' }, side, 'Live spatial preview');
    pcv = el('canvas', { width: '460', height: '260', style: 'border:1px solid var(--line);border-radius:6px;background:#0b1410;max-width:100%' }, side);
    el('div', { class: 'tc-mut', style: 'font-size:11px' }, side, 'Top: the distance→gain curve (purple = reference distance, red = floor). Bottom: a source orbiting the listener — horizontal is pan, the dot size/brightness is gain, the side bars are the L/R channel levels.');
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
    id: 'positional', label: 'Positional audio', icon: '🎧', group: 'Audio',
    sub: 'distance falloff · stereo pan · height',
    build(host, a) { api = a; bodyEl = host; if (!data) MT.load(); render(); }
  });
  if (T.roadmapDone) T.roadmapDone(83);
})();
