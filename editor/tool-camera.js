// MOSSVEIL — tool-camera.js : gameplay camera editor (Edit ▸ Systems).  Roadmap #76.
// Authors how the camera follows the player (src/camera.js -> data/camera.js): the follow stiffness,
// the springy look-ahead, the vertical bias, and the impact zoom-"punch". A LIVE ANIMATED PREVIEW runs
// the exact follow math against a simulated wandering player so you can feel the response without
// launching the game. Edits the overlay through the data layer; applies live + on next Play. Defaults
// byte-identical to the old constants in main.js.
(function () {
  const T = G.Tools, C = G.Cam, U = G.U;
  if (!T || !C || !C.exportDefaults) return;
  const clone = o => JSON.parse(JSON.stringify(o));
  const damp = (U && U.damp) ? U.damp : (a, b, r, dt) => a + (b - a) * (1 - Math.exp(-r * dt));
  const clamp = (U && U.clamp) ? U.clamp : (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  let data = null, dirty = false, bodyEl = null, api = null, pcv = null;
  let sim = null;   // { t, px, py, ppx, ppy, cx, cy, lead, punch, ptimer, last }

  const MT = T.camera = {
    get state() { return { data, dirty }; },
    getWorking() { return data; },
    load() { data = clone(C.exportCurrent()); dirty = false; },
    revert() { data = clone(C.exportDefaults()); dirty = true; if (bodyEl) render(); },
    applyToEngine() { C.applyData(clone(data)); },
    async save() { await api.data.save('camera', 'CAMERA_DATA', data); MT.applyToEngine(); dirty = false; if (api) api.toast('Camera feel saved'); if (bodyEl) render(); return true; },
    setField(k, v) { data[k] = v; dirty = true; },
    openInTool() { return T.openTool('camera'); }
  };

  // ---- animated preview: re-runs main.js updateCamera() math against a wandering player ----
  function frame(now) {
    if (!pcv || !document.body.contains(pcv)) { sim = null; return; }   // tool closed -> stop the loop
    const s = sim, dt = Math.min(0.05, (now - s.last) / 1000 || 0.016); s.last = now; s.t += dt;
    // simulated player path: a wandering sinusoid (horizontal) + gentle bob (vertical)
    s.ppx = s.px; s.ppy = s.py;
    s.px = Math.sin(s.t * 0.9) * 9 + Math.sin(s.t * 0.37) * 4;
    s.py = Math.sin(s.t * 0.6) * 2.2;
    const vx = (s.px - s.ppx) / dt, vy = (s.py - s.ppy) / dt, facing = vx >= 0 ? 1 : -1;
    // look-ahead + follow, exactly as updateCamera()
    const leadTarget = facing * data.lookAhead + clamp(vx * data.lookVelFactor, -data.lookVelMax, data.lookVelMax);
    s.lead = damp(s.lead, leadTarget, data.lookSpring, dt);
    const lookX = s.px + s.lead, lookY = s.py + data.vBias + clamp(vy * data.vVelFactor, data.vClampDown, data.vClampUp);
    s.cx = damp(s.cx, lookX, data.followX, dt);
    s.cy = damp(s.cy, lookY, data.followY, dt);
    // periodic impact -> zoom punch
    s.ptimer -= dt; if (s.ptimer <= 0) { s.ptimer = 2.2; s.punch = Math.min(data.punchMax, s.punch + data.punchDefault); }
    s.punch = damp(s.punch, 0, data.punchEase, dt);
    drawSim(s);
    requestAnimationFrame(frame);
  }

  function drawSim(s) {
    const cx = pcv.getContext('2d'), W = pcv.width, H = pcv.height;
    const scale = 13 * (1 + s.punch * 0.06);          // the punch nudges zoom
    cx.fillStyle = '#0b1410'; cx.fillRect(0, 0, W, H);
    const wx = x => W / 2 + (x - s.cx) * scale, wy = y => H / 2 - (y - s.cy) * scale;
    // world reference ticks (scroll as the camera moves)
    cx.strokeStyle = 'rgba(120,150,135,0.16)'; cx.lineWidth = 1;
    for (let gx = Math.floor(s.cx - 18); gx < s.cx + 18; gx++) { if (gx % 3) continue; cx.beginPath(); cx.moveTo(wx(gx), 0); cx.lineTo(wx(gx), H); cx.stroke(); }
    cx.strokeStyle = 'rgba(120,150,135,0.10)';
    for (let gy = Math.floor(s.cy - 8); gy < s.cy + 8; gy++) { if (gy % 2) continue; cx.beginPath(); cx.moveTo(0, wy(gy)); cx.lineTo(W, wy(gy)); cx.stroke(); }
    // camera centre crosshair
    cx.strokeStyle = 'rgba(255,210,120,0.6)'; cx.beginPath(); cx.moveTo(W / 2 - 9, H / 2); cx.lineTo(W / 2 + 9, H / 2); cx.moveTo(W / 2, H / 2 - 9); cx.lineTo(W / 2, H / 2 + 9); cx.stroke();
    // look-ahead target (where the camera is leading to)
    cx.fillStyle = 'rgba(160,200,255,0.5)'; cx.beginPath(); cx.arc(wx(s.px + s.lead), wy(s.py + data.vBias), 3, 0, 7); cx.fill();
    // player
    const px = wx(s.px), py = wy(s.py);
    cx.fillStyle = '#dff0e6'; cx.beginPath(); cx.arc(px, py, 5, 0, 7); cx.fill();
    cx.strokeStyle = '#9fffc0'; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(px, py); cx.lineTo(px + (s.px - s.ppx > 0 ? 12 : -12), py); cx.stroke(); cx.lineWidth = 1;
    cx.fillStyle = 'rgba(220,230,210,0.7)'; cx.font = '10px monospace'; cx.textAlign = 'left'; cx.textBaseline = 'top';
    cx.fillText('● player   ✛ camera   ○ look-ahead', 8, 6);
  }

  function startSim() {
    sim = { t: 0, px: 0, py: 0, ppx: 0, ppy: 0, cx: 0, cy: data.vBias, lead: 0, punch: 0, ptimer: 2.2, last: performance.now() };
    drawSim(sim);                 // draw one frame immediately (so the preview isn't blank before rAF)
    requestAnimationFrame(frame);
  }

  function el(t, a, p, x) { return api.el(t, a, p, x); }

  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column';
    const head = el('div', { style: 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line)' }, bodyEl);
    el('button', { class: 'tbtn play', onclick: () => MT.save().catch(e => api.toast('Save failed: ' + e.message)) }, head, '💾 Save');
    el('button', { class: 'tbtn', onclick: () => { if (confirm('Reset the camera feel to defaults?')) MT.revert(); } }, head, '↺ Revert');
    el('span', { class: 'tc-mut' }, head, dirty ? '● unsaved' : 'saved ✓');
    el('div', { style: 'flex:1' }, head);
    el('span', { class: 'tc-mut' }, head, 'applies live + on next Play');

    const grid = el('div', { style: 'flex:1;display:grid;grid-template-columns:1fr 480px;gap:0;min-height:0' }, bodyEl);
    const ctl = el('div', { style: 'overflow:auto;padding:14px 16px;display:flex;flex-direction:column;gap:16px;min-height:0;max-width:560px' }, grid);
    const side = el('div', { style: 'border-left:1px solid var(--line);padding:14px;display:flex;flex-direction:column;gap:8px;overflow:auto' }, grid);

    const s1 = section(ctl, '🎯 Follow', 'How quickly the camera catches up to the player (damp rate; higher is snappier, lower is floatier).');
    slider(s1, 'Horizontal follow', 'followX', 0.5, 16, 0.1);
    slider(s1, 'Vertical follow', 'followY', 0.5, 16, 0.1);

    const s2 = section(ctl, '👁 Look-ahead', 'The camera leads toward where you face and move, so you see more of what is ahead.');
    slider(s2, 'Lead distance', 'lookAhead', 0, 6, 0.1);
    slider(s2, 'Lead per speed', 'lookVelFactor', 0, 0.5, 0.01);
    slider(s2, 'Max speed lead', 'lookVelMax', 0, 6, 0.1);
    slider(s2, 'Lead spring', 'lookSpring', 0.2, 10, 0.1);

    const s3 = section(ctl, '↕ Vertical framing', 'How high above the player the camera sits, and how much it leans with rising / falling.');
    slider(s3, 'Height bias', 'vBias', -2, 4, 0.1);
    slider(s3, 'Lean per fall/rise', 'vVelFactor', 0, 0.4, 0.01);
    slider(s3, 'Lean down clamp', 'vClampDown', -4, 0, 0.1);
    slider(s3, 'Lean up clamp', 'vClampUp', 0, 4, 0.1);

    const s4 = section(ctl, '💥 Impact punch', 'The brief zoom-kick on hits, hard landings and dashes.');
    slider(s4, 'Max stack', 'punchMax', 0, 6, 0.1);
    slider(s4, 'Ease-out speed', 'punchEase', 1, 20, 0.5);
    slider(s4, 'Default kick', 'punchDefault', 0, 3, 0.1);

    el('div', { class: 'tc-mut', style: 'align-self:flex-start' }, side, 'Live feel preview');
    pcv = el('canvas', { width: '460', height: '240', style: 'border:1px solid var(--line);border-radius:6px;background:#0b1410;max-width:100%' }, side);
    el('div', { class: 'tc-mut', style: 'font-size:11px' }, side, 'A simulated player wanders; the camera follows with your settings. The world grid scrolls, the ✛ is the camera centre, the ○ is the look-ahead target, and it punches every couple of seconds.');
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
    id: 'camera', label: 'Camera feel', icon: '🎥', group: 'Systems',
    sub: 'follow · look-ahead · impact punch',
    build(host, a) { api = a; bodyEl = host; if (!data) MT.load(); render(); }
  });
  if (T.roadmapDone) T.roadmapDone(76);
})();
