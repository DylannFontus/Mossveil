// MOSSVEIL — tool-biomes.js : the in-engine Biome / palette editor (Edit ▸ World).
// Authors the biome palettes that used to be hard-coded in src/world.js — background gradient, fog,
// terrain & moss colours, glow, dust, god-rays, ambient particle and decor kinds. Saves to
// data/biomes.js (window.G.BIOME_DATA); new biomes become selectable per room. Offline, editor-only.
(function () {
  const T = G.Tools, W = G.World;
  if (!T || !W || !W.exportBiomeDefaults) return;
  const clone = o => JSON.parse(JSON.stringify(o));
  const COLORS = [
    ['bgTop', 'Background top'], ['bgBottom', 'Background bottom'], ['fog', 'Fog colour'],
    ['sil', 'Silhouette'], ['terrain', 'Terrain'], ['moss', 'Moss'], ['mossDark', 'Moss (dark)'],
    ['glow', 'Glow'], ['dust', 'Dust motes'], ['light', 'Light tint']
  ];
  const hex = v => (typeof v === 'string' && v[0] === '#') ? v : ('#' + ((v >>> 0) & 0xffffff).toString(16).padStart(6, '0'));

  // ---------------- controller (test API: G.Tools.biomes) ----------------
  let data = null, sel = null, dirty = false, bodyEl = null, api = null;
  const BUILTINS = Object.keys(W.exportBiomeDefaults().palettes);
  const ids = () => Object.keys(data.palettes);
  const MT = T.biomes = {
    get state() { return { data, sel, dirty }; },
    getWorking() { return data; },
    load() { data = clone(W.exportBiomeCurrent()); sel = ids()[0] || null; dirty = false; },
    revert() { data = clone(W.exportBiomeDefaults()); sel = ids()[0]; dirty = true; if (bodyEl) render(); },
    applyToEngine() { W.applyBiomeData(clone(data)); },
    async save() { await api.data.save('biomes', 'BIOME_DATA', data); MT.applyToEngine(); dirty = false; if (api) api.toast('Biomes saved · ' + ids().length + ' palettes'); if (bodyEl) render(); return true; },
    select(k) { sel = k; if (bodyEl) render(); },
    uniqueId(base) { base = (base || 'biome').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'biome'; let n = base, i = 1; while (data.palettes[n]) n = base + (++i); return n; },
    addBiome(src) { const n = MT.uniqueId(src || 'biome'); data.palettes[n] = clone((src && data.palettes[src]) || data.palettes[sel]); data.palettes[n].label = (data.palettes[n].label || n) + (src == null ? '' : ' copy'); sel = n; dirty = true; if (bodyEl) render(); return n; },
    duplicateBiome(k) { return MT.addBiome(k || sel); },
    removeBiome(k) { k = k || sel; if (ids().length <= 1) return false; delete data.palettes[k]; if (sel === k) sel = ids()[0]; dirty = true; if (bodyEl) render(); return true; },
    renameBiome(k, nk) { nk = (nk || '').trim(); if (!nk || nk === k || data.palettes[nk]) return false; data.palettes[nk] = data.palettes[k]; delete data.palettes[k]; if (sel === k) sel = nk; dirty = true; return true; },
    setColor(k, key, hexv) { data.palettes[k][key] = hexv; dirty = true; },
    setField(k, key, val) { data.palettes[k][key] = val; dirty = true; },
    setDeco(k, arr) { data.palettes[k].deco = arr; dirty = true; },
    isBuiltin: k => BUILTINS.indexOf(k) >= 0,
    openInTool() { return T.openTool('biomes'); }
  };

  // ---------------- UI ----------------
  function el(t, a, p, x) { return api.el(t, a, p, x); }
  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column';
    const head = el('div', { style: 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line)' }, bodyEl);
    el('button', { class: 'tbtn play', onclick: () => MT.save().catch(e => api.toast('Save failed: ' + e.message)) }, head, '💾 Save biomes');
    el('button', { class: 'tbtn', onclick: () => { if (confirm('Replace all palettes with the built-in defaults? (not saved until you Save)')) MT.revert(); } }, head, '↺ Revert');
    el('span', { class: 'tc-mut' }, head, dirty ? '● unsaved' : 'saved ✓');
    el('div', { style: 'flex:1' }, head);
    el('span', { class: 'tc-mut' }, head, ids().length + ' biomes');
    const grid = el('div', { style: 'flex:1;display:grid;grid-template-columns:200px 1fr;gap:0;min-height:0' }, bodyEl);
    const left = el('div', { style: 'display:flex;flex-direction:column;border-right:1px solid var(--line);min-height:0' }, grid);
    const list = el('div', { style: 'flex:1;overflow:auto;padding:8px' }, left);
    ids().forEach(k => {
      const p = data.palettes[k];
      const row = el('div', { class: 'tc-pal-item' + (k === sel ? ' sel' : ''), style: 'padding:5px 8px' }, list);
      el('span', { style: 'width:12px;height:12px;border-radius:3px;flex-shrink:0;background:' + hex(p.bgTop) }, row);
      el('span', {}, row, p.label || k);
      row.addEventListener('click', () => MT.select(k));
    });
    const btns = el('div', { style: 'display:flex;gap:4px;padding:8px;border-top:1px solid var(--line)' }, left);
    el('button', { class: 'tbtn', onclick: () => MT.addBiome() }, btns, '+ New');
    el('button', { class: 'tbtn', onclick: () => MT.duplicateBiome() }, btns, '⧉');
    el('button', { class: 'tbtn', onclick: () => { if (MT.isBuiltin(sel) && !confirm('“' + sel + '” is a built-in biome — rooms using it fall back to Verdant. Delete anyway?')) return; if (!MT.removeBiome()) api.toast('Keep at least one biome.'); } }, btns, '🗑');
    renderBiome(el('div', { style: 'overflow:auto;padding:12px 14px;min-height:0' }, grid));
  }

  function renderBiome(host) {
    if (!sel || !data.palettes[sel]) { el('div', { class: 'tc-mut' }, host, 'Select a biome.'); return; }
    const p = data.palettes[sel];
    // swatch preview
    const sw = el('div', { style: 'height:80px;border-radius:7px;border:1px solid var(--line);margin-bottom:10px;position:relative;overflow:hidden;background:linear-gradient(' + hex(p.bgTop) + ',' + hex(p.bgBottom) + ')' }, host);
    ['moss', 'mossDark', 'glow', 'dust'].forEach((k, i) => el('div', { style: 'position:absolute;bottom:8px;left:' + (10 + i * 30) + 'px;width:22px;height:22px;border-radius:50%;border:1px solid rgba(0,0,0,.4);background:' + hex(p[k]) }, sw));
    const rId = el('div', { class: 'tc-row' }, host); el('label', {}, rId, 'Id'); const idInp = el('input', { type: 'text' }, rId); idInp.value = sel;
    idInp.addEventListener('change', () => { if (!MT.renameBiome(sel, idInp.value)) { idInp.value = sel; api.toast('Id in use or invalid.'); } else render(); });
    const rL = el('div', { class: 'tc-row' }, host); el('label', {}, rL, 'Label'); const lInp = el('input', { type: 'text' }, rL); lInp.value = p.label || '';
    lInp.addEventListener('input', () => MT.setField(sel, 'label', lInp.value)); lInp.addEventListener('change', render);
    el('h4', { style: 'margin:12px 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:var(--txt2)' }, host, 'Colours');
    const cg = el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:2px 14px' }, host);
    COLORS.forEach(([key, label]) => {
      const r = el('div', { class: 'tc-row', style: 'margin:2px 0' }, cg); el('label', { style: 'width:120px' }, r, label);
      const ci = el('input', { type: 'color' }, r); ci.value = hex(p[key]);
      ci.addEventListener('input', () => { MT.setColor(sel, key, ci.value); sw.style.background = 'linear-gradient(' + hex(data.palettes[sel].bgTop) + ',' + hex(data.palettes[sel].bgBottom) + ')'; });
    });
    el('h4', { style: 'margin:12px 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:var(--txt2)' }, host, 'Atmosphere');
    numRow(host, 'Fog near', p.fogNear, 0, 200, 1, v => MT.setField(sel, 'fogNear', v));
    numRow(host, 'Fog far', p.fogFar, 0, 300, 1, v => MT.setField(sel, 'fogFar', v));
    numRow(host, 'Audio root (Hz)', p.root, 50, 600, 0.1, v => MT.setField(sel, 'root', v));
    const rR = el('div', { class: 'tc-row' }, host); const cb = el('input', { type: 'checkbox' }, rR); cb.checked = !!p.rays;
    el('label', { style: 'width:auto' }, rR, 'God-rays / light shafts');
    cb.addEventListener('change', () => MT.setField(sel, 'rays', cb.checked));
    const rA = el('div', { class: 'tc-row' }, host); el('label', {}, rA, 'Ambient particle'); const aInp = el('input', { type: 'text' }, rA); aInp.value = p.amb || '';
    aInp.addEventListener('change', () => MT.setField(sel, 'amb', aInp.value.trim()));
    const rD = el('div', { class: 'tc-row' }, host); el('label', {}, rD, 'Decor kinds'); const dInp = el('input', { type: 'text', placeholder: 'comma-separated' }, rD); dInp.value = (p.deco || []).join(', ');
    dInp.addEventListener('change', () => MT.setDeco(sel, dInp.value.split(',').map(s => s.trim()).filter(Boolean)));
    el('div', { class: 'tc-mut', style: 'margin-top:8px' }, host, 'Decor kinds are silhouette shapes scattered in this biome (e.g. mushroom, tree, column, crystalSpire). Ambient particle is the drifting motes (leaf, spore, ember, snow, mote, pollen, bubble…).');
  }

  function numRow(parent, label, val, min, max, step, onChange) {
    const r = el('div', { class: 'tc-row' }, parent); el('label', {}, r, label);
    const inp = el('input', { type: 'number', min, max, step }, r); inp.value = val;
    inp.addEventListener('change', () => onChange(+inp.value));
  }

  T.registerTool({
    id: 'biomes', label: 'Biome / palette editor', icon: '🎨', group: 'World',
    sub: 'colours, fog, decor & ambience per biome',
    build(host, a) { api = a; bodyEl = host; if (!data) MT.load(); render(); }
  });
  if (T.roadmapDone) T.roadmapDone(14);
})();
