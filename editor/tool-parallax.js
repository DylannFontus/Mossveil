// MOSSVEIL — tool-parallax.js : backdrop & parallax-layer editor (Edit ▸ World).  Roadmap #73.
// Authors the room backdrop (src/parallax.js -> data/parallax.js): the gradient-sky and wall plane
// depths, the list of receding silhouette LAYERS (depth + decoration density + size each), and the
// per-depth silhouette shaping (margin, ground bias, scale, hump height, decoration density/size).
// Because the gameplay camera is a real perspective camera, a layer's z IS its parallax — nearer
// layers slide faster. A LIVE ANIMATED PREVIEW pans a little scene so you SEE the layers separate as
// you add / move / retune them. Edits the overlay through the data layer; applies on next room load.
// Defaults byte-identical to world.js's old hardcoded backdrop.
(function () {
  const T = G.Tools, PX = G.Parallax;
  if (!T || !PX || !PX.exportDefaults) return;
  const clone = o => JSON.parse(JSON.stringify(o));
  let data = null, dirty = false, bodyEl = null, api = null, pcv = null, sim = null;

  const MT = T.parallax = {
    get state() { return { data, dirty }; },
    getWorking() { return data; },
    load() { data = clone(PX.exportCurrent()); dirty = false; },
    revert() { data = clone(PX.exportDefaults()); dirty = true; if (bodyEl) render(); },
    applyToEngine() { PX.applyData(clone(data)); },
    async save() { await api.data.save('parallax', 'PARALLAX_DATA', data); MT.applyToEngine(); dirty = false; if (api) api.toast('Parallax backdrop saved'); if (bodyEl) render(); return true; },
    setField(k, v) { data[k] = v; dirty = true; },
    setShape(k, v) { data.shape[k] = v; dirty = true; },
    setLayer(i, k, v) { if (data.layers[i]) { data.layers[i][k] = v; dirty = true; } },
    addLayer() {
      // insert nearest a new layer half-way between the closest layer and the camera
      const ls = data.layers, nearest = ls.length ? ls[ls.length - 1].z : -18;
      ls.push({ z: Math.max(-6, +(nearest / 2).toFixed(1)), density: 1, scale: 1 });
      dirty = true; if (bodyEl) render();
    },
    removeLayer(i) { if (data.layers.length > 0 && data.layers[i]) { data.layers.splice(i, 1); dirty = true; if (bodyEl) render(); } },
    moveLayer(i, dir) {
      const j = i + dir, ls = data.layers;
      if (j < 0 || j >= ls.length) return;
      const t = ls[i]; ls[i] = ls[j]; ls[j] = t; dirty = true; if (bodyEl) render();
    },
    openInTool() { return T.openTool('parallax'); }
  };

  // ===================== animated parallax preview =====================
  // a layer at depth d (=-z) appears to move panX * focal/(focal+d); nearer layers move more.
  const FOCAL = 22;
  function pfactor(z) { return FOCAL / (FOCAL + (-z)); }
  // deterministic silhouette profile for a layer: an array of hump heights tiled across the band
  function profile(seed, n) {
    let s = (seed * 2654435761) >>> 0;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const out = [];
    for (let i = 0; i < n; i++) out.push(0.35 + rnd() * 0.65);
    return out;
  }
  function frame(now) {
    if (!pcv || !document.body.contains(pcv)) { sim = null; return; }
    const s = sim, dt = Math.min(0.05, (now - s.last) / 1000 || 0.016); s.last = now; s.t += dt;
    draw(s.t);
    requestAnimationFrame(frame);
  }
  function draw(t) {
    if (!pcv) return;
    const cx = pcv.getContext('2d'), W = pcv.width, H = pcv.height;
    const ground = Math.round(H * 0.9);
    const pan = Math.sin(t * 0.5) * 60;   // virtual camera sway
    // sky
    const sky = cx.createLinearGradient(0, 0, 0, ground);
    sky.addColorStop(0, '#16314a'); sky.addColorStop(1, '#0a1828');
    cx.globalAlpha = 1; cx.globalCompositeOperation = 'source-over';
    cx.fillStyle = sky; cx.fillRect(0, 0, W, H);
    // wall band
    cx.fillStyle = 'rgba(20,40,60,0.55)';
    const wallTop = Math.round(H * 0.18);
    cx.fillRect(0, wallTop, W, ground - wallTop);
    // silhouette layers, far -> near (data order is far..near already)
    const ls = data.layers;
    for (let li = 0; li < ls.length; li++) {
      const L = ls[li], z = L.z, dens = L.density || 1, scl = L.scale || 1;
      const depth = -z, dn = Math.min(1, depth / 80);
      // colour: distant layers fade toward the fog/sky, near layers darker & greener
      const col = mix([60, 120, 95], [14, 30, 26], 1 - dn);
      cx.fillStyle = 'rgb(' + col[0] + ',' + col[1] + ',' + col[2] + ')';
      const fac = pfactor(z), off = -pan * fac;
      const bumps = Math.max(3, Math.round((W / 46) * dens));
      const prof = profile(li + 7, bumps + 2);
      const step = W / bumps;
      const baseH = (26 + (1 - dn) * 0) + depth * 0.0;     // visual base
      const layerH = (38 - dn * 14) * scl;                 // nearer/bigger = taller silhouette
      const yBase = ground - 6 - (1 - dn) * 4;
      cx.beginPath();
      cx.moveTo(-40, ground + 40);
      cx.lineTo(-40, yBase);
      for (let i = -1; i <= bumps + 1; i++) {
        const px = ((i * step + (off % step) + W * 2) % (W + step * 2)) - step;
        const h = layerH * prof[(i + bumps) % prof.length];
        cx.lineTo(i * step + off, yBase - 8);
        cx.quadraticCurveTo(i * step + off + step / 2, yBase - 8 - h, (i + 1) * step + off, yBase - 8);
      }
      cx.lineTo(W + 40, yBase); cx.lineTo(W + 40, ground + 40); cx.closePath(); cx.fill();
      // hanging shapes near the top of the near-most layers
      if (li >= ls.length - 2) {
        cx.fillStyle = 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',0.85)';
        for (let i = 0; i < bumps; i += 2) {
          const hx = (i * step + off * 1.0 + W) % W;
          cx.beginPath(); cx.moveTo(hx - 4, wallTop); cx.lineTo(hx + 4, wallTop); cx.lineTo(hx, wallTop + 14 * scl); cx.closePath(); cx.fill();
        }
      }
    }
    // foreground ground
    cx.fillStyle = '#0b1612'; cx.fillRect(0, ground, W, H - ground);
    cx.fillStyle = 'rgba(230,240,220,0.85)'; cx.font = '11px monospace'; cx.textAlign = 'left'; cx.textBaseline = 'top';
    cx.fillText(ls.length + ' layer' + (ls.length === 1 ? '' : 's') + '  ·  sky ' + data.sky + '  wall ' + data.wall, 8, 6);
    cx.fillStyle = 'rgba(200,220,235,0.6)';
    cx.fillText('near layers slide faster ◄►', 8, H - 16);
  }
  function mix(a, b, k) { return [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * k)); }
  function startSim() { sim = { t: 0, last: performance.now() }; draw(0); requestAnimationFrame(frame); }

  function el(t, a, p, x) { return api.el(t, a, p, x); }

  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column';
    const head = el('div', { style: 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line)' }, bodyEl);
    el('button', { class: 'tbtn play', onclick: () => MT.save().catch(e => api.toast('Save failed: ' + e.message)) }, head, '💾 Save');
    el('button', { class: 'tbtn', onclick: () => { if (confirm('Reset the backdrop to defaults?')) MT.revert(); } }, head, '↺ Revert');
    el('span', { class: 'tc-mut' }, head, dirty ? '● unsaved' : 'saved ✓');
    el('div', { style: 'flex:1' }, head);
    el('span', { class: 'tc-mut' }, head, 'applies on next room load');

    const grid = el('div', { style: 'flex:1;display:grid;grid-template-columns:1fr 480px;gap:0;min-height:0' }, bodyEl);
    const ctl = el('div', { style: 'overflow:auto;padding:14px 16px;display:flex;flex-direction:column;gap:16px;min-height:0;max-width:600px' }, grid);
    const side = el('div', { style: 'border-left:1px solid var(--line);padding:14px;display:flex;flex-direction:column;gap:8px;overflow:auto' }, grid);

    const sb = section(ctl, '🌌 Backdrop planes', 'The flat gradient sky and the textured wall behind the silhouettes. More-negative = further back.');
    slider(sb, 'Sky depth', 'sky', -200, -10, 1);
    slider(sb, 'Wall depth', 'wall', -160, -6, 1);

    const sl = section(ctl, '🏔 Parallax layers', 'Receding silhouette layers, far → near. A layer\'s depth IS its parallax: nearer (less-negative) layers slide faster as the camera moves. Density scales decoration spacing, Size scales the silhouettes.');
    const lwrap = el('div', { id: 'pxLayers', style: 'display:flex;flex-direction:column;gap:10px' }, sl);
    data.layers.forEach((L, i) => layerRow(lwrap, L, i));
    el('button', { class: 'tbtn', style: 'align-self:flex-start;margin-top:4px', onclick: () => MT.addLayer() }, sl, '➕ Add layer');

    const ss = section(ctl, '✎ Silhouette shape (advanced)', 'Per-depth derivation the layers share: how wide each layer over-draws, its ground line & scale, the rolling-hump height, and the hanging/standing decoration chance, spacing and size.');
    sliderS(ss, 'Margin base', 'marginBase', 0, 60, 1);
    sliderS(ss, 'Margin per depth', 'marginPer', 0, 3, 0.05);
    sliderS(ss, 'Ground Y base', 'baseYBase', -10, 10, 0.1);
    sliderS(ss, 'Ground Y per depth', 'baseYPer', -1, 1, 0.01);
    sliderS(ss, 'Scale base', 'scaleBase', 0.1, 4, 0.05);
    sliderS(ss, 'Scale per depth', 'scalePer', 0, 0.4, 0.01);
    sliderS(ss, 'Hump height base', 'humpBase', 0, 12, 0.1);
    sliderS(ss, 'Hump height per depth', 'humpPer', 0, 1.5, 0.01);
    sliderS(ss, 'Top Y per depth', 'topYPer', 0, 1, 0.01);
    sliderS(ss, 'Hanging chance', 'hangChance', 0, 1, 0.01);
    sliderS(ss, 'Stalactite chance', 'stalactiteChance', 0, 1, 0.01);
    sliderS(ss, 'Hanging gap min', 'hangGapMin', 0.5, 20, 0.5);
    sliderS(ss, 'Hanging gap max', 'hangGapMax', 0.5, 30, 0.5);
    sliderS(ss, 'Hanging size min', 'hangScaleMin', 0.1, 3, 0.05);
    sliderS(ss, 'Hanging size max', 'hangScaleMax', 0.1, 4, 0.05);
    sliderS(ss, 'Standing gap min', 'standGapMin', 0.5, 20, 0.5);
    sliderS(ss, 'Standing gap max', 'standGapMax', 0.5, 30, 0.5);
    sliderS(ss, 'Standing size min', 'standScaleMin', 0.1, 3, 0.05);
    sliderS(ss, 'Standing size max', 'standScaleMax', 0.1, 4, 0.05);

    el('div', { class: 'tc-mut', style: 'align-self:flex-start' }, side, 'Live parallax preview');
    pcv = el('canvas', { width: '470', height: '240', style: 'border:1px solid var(--line);border-radius:6px;background:#0a1828;max-width:100%' }, side);
    el('div', { class: 'tc-mut', style: 'font-size:11px' }, side, 'The camera sways left↔right; nearer layers slide further than distant ones — that separation is the parallax. Density adds silhouettes; Size makes them taller.');
    startSim();
  }

  function layerRow(parent, L, i) {
    const box = el('div', { style: 'border:1px solid var(--line);border-radius:6px;padding:8px 10px;display:flex;flex-direction:column;gap:6px' }, parent);
    const top = el('div', { style: 'display:flex;align-items:center;gap:6px' }, box);
    el('span', { style: 'font-weight:600;font-size:12px' }, top, 'Layer ' + (i + 1) + (i === 0 ? '  (farthest)' : (i === data.layers.length - 1 ? '  (nearest)' : '')));
    el('div', { style: 'flex:1' }, top);
    el('button', { class: 'tbtn', style: 'padding:1px 7px', title: 'move farther (up)', onclick: () => MT.moveLayer(i, -1) }, top, '▲');
    el('button', { class: 'tbtn', style: 'padding:1px 7px', title: 'move nearer (down)', onclick: () => MT.moveLayer(i, 1) }, top, '▼');
    el('button', { class: 'tbtn', style: 'padding:1px 7px', title: 'remove layer', onclick: () => MT.removeLayer(i) }, top, '✕');
    layerSlider(box, 'Depth (z)', i, 'z', -200, -1, 1);
    layerSlider(box, 'Density', i, 'density', 0.1, 4, 0.05);
    layerSlider(box, 'Size', i, 'scale', 0.1, 4, 0.05);
  }

  function layerSlider(p, label, i, key, min, max, step) {
    const r = el('div', { class: 'tc-row' }, p); el('label', { style: 'flex:1' }, r, label);
    const inp = el('input', { type: 'range', min: '' + min, max: '' + max, step: '' + step }, r); inp.value = data.layers[i][key];
    const num = el('input', { type: 'number', min: '' + min, max: '' + max, step: '' + step, style: 'width:66px' }, r); num.value = data.layers[i][key];
    inp.addEventListener('input', () => { num.value = inp.value; MT.setLayer(i, key, +inp.value); });
    num.addEventListener('change', () => { inp.value = num.value; MT.setLayer(i, key, +num.value); });
  }

  function slider(p, label, key, min, max, step) {
    const r = el('div', { class: 'tc-row' }, p); el('label', { style: 'flex:1' }, r, label);
    const inp = el('input', { type: 'range', min: '' + min, max: '' + max, step: '' + step }, r); inp.value = data[key];
    const num = el('input', { type: 'number', min: '' + min, max: '' + max, step: '' + step, style: 'width:66px' }, r); num.value = data[key];
    inp.addEventListener('input', () => { num.value = inp.value; MT.setField(key, +inp.value); });
    num.addEventListener('change', () => { inp.value = num.value; MT.setField(key, +num.value); });
  }

  function sliderS(p, label, key, min, max, step) {
    const r = el('div', { class: 'tc-row' }, p); el('label', { style: 'flex:1' }, r, label);
    const inp = el('input', { type: 'range', min: '' + min, max: '' + max, step: '' + step }, r); inp.value = data.shape[key];
    const num = el('input', { type: 'number', min: '' + min, max: '' + max, step: '' + step, style: 'width:66px' }, r); num.value = data.shape[key];
    inp.addEventListener('input', () => { num.value = inp.value; MT.setShape(key, +inp.value); });
    num.addEventListener('change', () => { inp.value = num.value; MT.setShape(key, +num.value); });
  }

  function section(parent, title, desc) {
    const box = el('div', {}, parent);
    el('h3', { style: 'margin:0 0 2px;font-size:14px' }, box, title);
    if (desc) el('div', { class: 'tc-mut', style: 'margin-bottom:6px;font-size:11px;line-height:1.4' }, box, desc);
    return box;
  }

  T.registerTool({
    id: 'parallax', label: 'Parallax & backdrop', icon: '🏔', group: 'World',
    sub: 'silhouette layers · depth · density',
    build(host, a) { api = a; bodyEl = host; if (!data) MT.load(); render(); }
  });
  if (T.roadmapDone) T.roadmapDone(73);
})();
