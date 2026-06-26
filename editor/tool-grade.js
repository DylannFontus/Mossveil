// MOSSVEIL — tool-grade.js : the in-engine Colour-grade editor (Edit ▸ World).
// Per-biome colour grade. The base grade is derived from each biome's palette (src/world.js
// gradeFor); this tool authors an optional override stored on the biome data (pal.grade in
// data/biomes.js) — exposure, contrast, saturation, bloom, vignette, grain, tint mix. Live CSS
// preview of a palette mockup. Saves through the biome dataset. Offline, editor-only.
(function () {
  const T = G.Tools, W = G.World, P = G.Post;
  if (!T || !W || !W.exportBiomeCurrent) return;
  const clone = o => JSON.parse(JSON.stringify(o));
  const hex = v => (typeof v === 'string' && v[0] === '#') ? v : ('#' + ((v >>> 0) & 0xffffff).toString(16).padStart(6, '0'));
  // [key, label, min, max, step, derived(pal)]
  const F = [
    ['exposure', 'Exposure', 0.6, 1.6, 0.01, () => 1.05],
    ['contrast', 'Contrast', 0.6, 1.6, 0.01, () => 1.05],
    ['saturation', 'Saturation', 0, 2, 0.01, () => 1.14],
    ['bloom', 'Bloom', 0, 1.2, 0.01, p => p.rays ? 0.72 : 0.56],
    ['vignette', 'Vignette', 0, 0.9, 0.01, () => 0.46],
    ['grain', 'Film grain', 0, 0.4, 0.01, () => 0],
    ['tintMix', 'Tint strength', 0, 0.6, 0.01, () => 0.16]
  ];

  let data = null, sel = null, dirty = false, bodyEl = null, api = null, prevWrap = null;
  const ids = () => Object.keys(data.palettes);
  const MT = T.grade = {
    get state() { return { data, sel, dirty }; },
    getWorking() { return data; },
    load() { data = clone(W.exportBiomeCurrent()); sel = ids()[0] || null; dirty = false; },
    applyToEngine() { W.applyBiomeData(clone(data)); },
    async save() { await api.data.save('biomes', 'BIOME_DATA', data); MT.applyToEngine(); dirty = false; if (api) api.toast('Grades saved (biome data)'); if (bodyEl) render(); return true; },
    select(k) { sel = k; if (bodyEl) render(); },
    derived(biome, key) { const f = F.find(x => x[0] === key); return f ? f[5](data.palettes[biome] || {}) : 0; },
    val(biome, key) { const p = data.palettes[biome]; return (p.grade && p.grade[key] != null) ? p.grade[key] : MT.derived(biome, key); },
    setGrade(biome, key, v) { const p = data.palettes[biome]; p.grade = p.grade || {}; p.grade[key] = v; dirty = true; updatePreview(); },
    clearGrade(biome) { delete data.palettes[biome].grade; dirty = true; if (bodyEl) render(); },
    hasOverride(biome) { return !!data.palettes[biome].grade; },
    // push the current biome's grade to the editor viewport post pipeline (visible once panel closes)
    applyToViewport() { if (P && P.setGrade) { const g = {}; F.forEach(([k]) => { if (k !== 'tintMix') g[k] = MT.val(sel, k); }); P.setGrade(g); } },
    openInTool() { return T.openTool('grade'); }
  };

  function el(t, a, p, x) { return api.el(t, a, p, x); }
  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column';
    const head = el('div', { style: 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line)' }, bodyEl);
    el('button', { class: 'tbtn play', onclick: () => MT.save().catch(e => api.toast('Save failed: ' + e.message)) }, head, '💾 Save grades');
    el('span', { class: 'tc-mut' }, head, dirty ? '● unsaved' : 'saved ✓');
    el('div', { style: 'flex:1' }, head);
    el('button', { class: 'tbtn', onclick: () => MT.applyToViewport() }, head, '⊞ Apply to viewport');
    const grid = el('div', { style: 'flex:1;display:grid;grid-template-columns:190px 1fr;gap:0;min-height:0' }, bodyEl);
    const left = el('div', { style: 'display:flex;flex-direction:column;border-right:1px solid var(--line);min-height:0' }, grid);
    const list = el('div', { style: 'flex:1;overflow:auto;padding:8px' }, left);
    ids().forEach(k => {
      const row = el('div', { class: 'tc-pal-item' + (k === sel ? ' sel' : ''), style: 'padding:5px 8px' }, list);
      el('span', { style: 'width:11px;height:11px;border-radius:3px;flex-shrink:0;background:' + hex(data.palettes[k].bgTop) }, row);
      el('span', {}, row, data.palettes[k].label || k);
      if (MT.hasOverride(k)) el('span', { class: 'tc-pill done', style: 'margin-left:auto' }, row, '★');
      row.addEventListener('click', () => MT.select(k));
    });
    renderGrade(el('div', { style: 'overflow:auto;padding:12px 14px;min-height:0' }, grid));
  }

  function renderGrade(host) {
    if (!sel || !data.palettes[sel]) { el('div', { class: 'tc-mut' }, host, 'Select a biome.'); return; }
    prevWrap = el('div', { style: 'height:120px;border-radius:8px;border:1px solid var(--line);overflow:hidden;position:relative;margin-bottom:10px' }, host);
    buildPreview();
    el('div', { class: 'tc-mut', style: 'margin-bottom:8px' }, host, 'Override the colour grade for the “' + (data.palettes[sel].label || sel) + '” biome. Leave a slider at its derived value to keep the auto look. (Bloom is approximate in this preview.)');
    F.forEach(([key, label, min, max, step]) => {
      const r = el('div', { class: 'tc-row' }, host); el('label', {}, r, label);
      const inp = el('input', { type: 'range', min, max, step }, r); inp.value = MT.val(sel, key);
      const lbl = el('span', { class: 'tc-mut', style: 'width:48px;text-align:right' }, r, (+MT.val(sel, key)).toFixed(2));
      inp.addEventListener('input', () => { const v = +inp.value; MT.setGrade(sel, key, v); lbl.textContent = v.toFixed(2); });
    });
    const btns = el('div', { style: 'display:flex;gap:6px;margin-top:10px' }, host);
    if (MT.hasOverride(sel)) el('button', { class: 'tbtn', onclick: () => MT.clearGrade(sel) }, btns, '↺ Clear override (use derived)');
  }

  function buildPreview() {
    prevWrap.innerHTML = '';
    const p = data.palettes[sel];
    const inner = el('div', { style: 'position:absolute;inset:0;background:linear-gradient(' + hex(p.bgTop) + ',' + hex(p.bgBottom) + ')' }, prevWrap);
    // a few shapes so saturation/contrast read
    ['moss', 'mossDark', 'glow', 'dust', 'light'].forEach((k, i) => el('div', { style: 'position:absolute;bottom:14px;left:' + (16 + i * 46) + 'px;width:34px;height:34px;border-radius:50%;background:' + hex(p[k]) }, inner));
    el('div', { style: 'position:absolute;top:12px;left:16px;width:60%;height:10px;border-radius:5px;background:' + hex(p.terrain) }, inner);
    el('div', { style: 'position:absolute;top:30px;left:16px;width:40%;height:8px;border-radius:4px;background:' + hex(p.sil) }, inner);
    updatePreview();
  }
  function updatePreview() {
    if (!prevWrap || !prevWrap.firstChild) return;
    const inner = prevWrap.firstChild;
    const exp = MT.val(sel, 'exposure'), con = MT.val(sel, 'contrast'), sat = MT.val(sel, 'saturation');
    inner.style.filter = 'brightness(' + exp.toFixed(3) + ') contrast(' + con.toFixed(3) + ') saturate(' + sat.toFixed(3) + ')';
    // vignette + grain + tint overlays
    let ov = prevWrap.querySelector('.tc-grade-ov');
    if (!ov) ov = el('div', { class: 'tc-grade-ov', style: 'position:absolute;inset:0;pointer-events:none' }, prevWrap);
    const vig = MT.val(sel, 'vignette'), grain = MT.val(sel, 'grain'), tintMix = MT.val(sel, 'tintMix');
    const lc = hex(data.palettes[sel].light || 0xffffff);
    ov.style.background =
      'radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(0,0,0,' + (vig * 0.9).toFixed(2) + ') 100%),' +
      'linear-gradient(' + lc + ',' + lc + ')';
    ov.style.opacity = '1';
    ov.style.mixBlendMode = 'normal';
    // tint as a soft wash via a second layer
    let tn = prevWrap.querySelector('.tc-grade-tint');
    if (!tn) tn = el('div', { class: 'tc-grade-tint', style: 'position:absolute;inset:0;pointer-events:none;mix-blend-mode:soft-light' }, prevWrap);
    tn.style.background = lc; tn.style.opacity = (tintMix * 0.9).toFixed(2);
    let gr = prevWrap.querySelector('.tc-grade-grain');
    if (!gr) gr = el('div', { class: 'tc-grade-grain', style: 'position:absolute;inset:0;pointer-events:none;mix-blend-mode:overlay' }, prevWrap);
    gr.style.opacity = (grain * 1.5).toFixed(2);
    gr.style.background = 'repeating-conic-gradient(#fff 0 0.0006turn, #000 0 0.0012turn)';
  }

  T.registerTool({
    id: 'grade', label: 'Colour-grade editor', icon: '🎞', group: 'World',
    sub: 'per-biome grade override with live preview',
    build(host, a) { api = a; bodyEl = host; if (!data) MT.load(); render(); }
  });
  if (T.roadmapDone) T.roadmapDone(15);
})();
