// MOSSVEIL — tool-materials.js : the in-engine Terrain-material editor (Edit ▸ World).
// Authors the terrain materials that used to be hard-coded in src/world.js (data/materials.js ->
// window.G.MATERIAL_DATA). Materials are keyed by the tile character levels use; this tool groups
// them by material id (so a material's hard + curvy variants edit together), tunes colour / foliage /
// surface sound / label, and can add new materials on a safe unused character. Offline, editor-only.
(function () {
  const T = G.Tools, W = G.World;
  if (!T || !W || !W.exportMaterialDefaults) return;
  const clone = o => JSON.parse(JSON.stringify(o));
  const hex = v => (typeof v === 'string' && v[0] === '#') ? v : ('#' + ((v >>> 0) & 0xffffff).toString(16).padStart(6, '0'));
  const SOUNDS = ['', 'stone', 'grass', 'wood', 'metal', 'sand'];   // '' = default (from id/biome)
  const RESERVED = new Set([' ', '=', '^', '#']);   // tile chars the parser uses for non-materials
  const BUILTIN_IDS = (() => { const s = new Set(); const m = W.exportMaterialDefaults().materials; for (const c in m) s.add(m[c].id); return s; })();

  // ---------------- controller (test API: G.Tools.materials) ----------------
  let data = null, sel = null, dirty = false, bodyEl = null, api = null;
  // group chars by material id, in first-seen order
  function groups() {
    const order = [], by = {};
    for (const ch in data.materials) { const id = data.materials[ch].id; if (!by[id]) { by[id] = { id, chars: [] }; order.push(id); } by[id].chars.push(ch); }
    return order.map(id => by[id]);
  }
  function repChar(id) { const g = groups().find(x => x.id === id); return g ? g.chars[0] : null; }
  const MT = T.materials = {
    get state() { return { data, sel, dirty }; },
    getWorking() { return data; },
    load() { data = clone(W.exportMaterialCurrent()); sel = groups()[0] && groups()[0].id; dirty = false; },
    revert() { data = clone(W.exportMaterialDefaults()); sel = groups()[0].id; dirty = true; if (bodyEl) render(); },
    applyToEngine() { W.applyMaterialData(clone(data)); },
    async save() { await api.data.save('materials', 'MATERIAL_DATA', data); MT.applyToEngine(); dirty = false; if (api) api.toast('Materials saved · ' + groups().length); if (bodyEl) render(); return true; },
    select(id) { sel = id; if (bodyEl) render(); },
    val(id, key) { const c = repChar(id); return c ? data.materials[c][key] : undefined; },
    setGroup(id, key, v) { groups().find(g => g.id === id).chars.forEach(ch => { if (v === '' && key === 'sound') delete data.materials[ch].sound; else data.materials[ch][key] = v; }); dirty = true; },
    freeChar(upper) { const lo = 'acefghijlmnoqrtuvxyz', up = 'ABCEFHIJLMNOQRTUVWXYZ'; const pool = upper ? up : lo; for (const ch of pool) if (!data.materials[ch] && !RESERVED.has(ch)) return ch; return null; },
    addMaterial(withSmooth) {
      const id = (() => { let b = 'custom', i = 1; const ids = new Set(groups().map(g => g.id)); while (ids.has(b + i)) i++; return b + i; })();
      const hc = MT.freeChar(false); if (!hc) { api && api.toast('No free material character left.'); return null; }
      data.materials[hc] = { id, label: 'New Material', foliage: false, smooth: false, col: '#808088' };
      if (withSmooth) { const sc = MT.freeChar(true); if (sc) data.materials[sc] = { id, label: 'New Material', foliage: false, smooth: true, col: '#808088' }; }
      sel = id; dirty = true; if (bodyEl) render(); return id;
    },
    removeMaterial(id) { if (BUILTIN_IDS.has(id)) return false; groups().find(g => g.id === id).chars.forEach(ch => delete data.materials[ch]); sel = groups()[0] && groups()[0].id; dirty = true; if (bodyEl) render(); return true; },
    isBuiltin: id => BUILTIN_IDS.has(id),
    openInTool() { return T.openTool('materials'); }
  };

  // ---------------- UI ----------------
  function el(t, a, p, x) { return api.el(t, a, p, x); }
  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column';
    const head = el('div', { style: 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line)' }, bodyEl);
    el('button', { class: 'tbtn play', onclick: () => MT.save().catch(e => api.toast('Save failed: ' + e.message)) }, head, '💾 Save materials');
    el('button', { class: 'tbtn', onclick: () => { if (confirm('Replace all materials with the built-in defaults?')) MT.revert(); } }, head, '↺ Revert');
    el('span', { class: 'tc-mut' }, head, dirty ? '● unsaved' : 'saved ✓');
    el('div', { style: 'flex:1' }, head);
    el('span', { class: 'tc-mut' }, head, groups().length + ' materials');
    const grid = el('div', { style: 'flex:1;display:grid;grid-template-columns:200px 1fr;gap:0;min-height:0' }, bodyEl);
    const left = el('div', { style: 'display:flex;flex-direction:column;border-right:1px solid var(--line);min-height:0' }, grid);
    const list = el('div', { style: 'flex:1;overflow:auto;padding:8px' }, left);
    groups().forEach(g => {
      const col = MT.val(g.id, 'col'), tcol = col === 'terrain' ? '#55b070' : hex(col);
      const row = el('div', { class: 'tc-pal-item' + (g.id === sel ? ' sel' : ''), style: 'padding:5px 8px' }, list);
      el('span', { style: 'width:12px;height:12px;border-radius:3px;flex-shrink:0;background:' + tcol }, row);
      el('span', {}, row, MT.val(g.id, 'label') || g.id);
      el('span', { class: 'pal-hint' }, row, g.chars.join(''));
      row.addEventListener('click', () => MT.select(g.id));
    });
    const btns = el('div', { style: 'display:flex;gap:4px;padding:8px;border-top:1px solid var(--line)' }, left);
    el('button', { class: 'tbtn', onclick: () => MT.addMaterial(false) }, btns, '+ New');
    el('button', { class: 'tbtn', onclick: () => MT.addMaterial(true) }, btns, '+ New + curvy');
    renderMat(el('div', { style: 'overflow:auto;padding:12px 14px;min-height:0' }, grid));
  }

  function renderMat(host) {
    if (!sel) { el('div', { class: 'tc-mut' }, host, 'Select a material.'); return; }
    const g = groups().find(x => x.id === sel); if (!g) { el('div', { class: 'tc-mut' }, host, 'Select a material.'); return; }
    el('div', { class: 'tc-mut', style: 'margin-bottom:8px' }, host, 'Tile character' + (g.chars.length > 1 ? 's' : '') + ': ' + g.chars.map(c => '“' + c + '”').join(', ') + (g.chars.length > 1 ? ' (hard + curvy variant edit together)' : '') + '. Colour/foliage changes appear on the next room load or Play.');
    const rL = el('div', { class: 'tc-row' }, host); el('label', {}, rL, 'Label'); const lInp = el('input', { type: 'text' }, rL); lInp.value = MT.val(sel, 'label') || '';
    lInp.addEventListener('input', () => MT.setGroup(sel, 'label', lInp.value)); lInp.addEventListener('change', render);
    // colour: biome-terrain token or a fixed colour
    const col = MT.val(sel, 'col');
    const rT = el('div', { class: 'tc-row' }, host); const tcb = el('input', { type: 'checkbox' }, rT); tcb.checked = col === 'terrain';
    el('label', { style: 'width:auto' }, rT, 'Use biome terrain colour (follows the palette)');
    const rC = el('div', { class: 'tc-row' }, host); el('label', {}, rC, 'Colour'); const ci = el('input', { type: 'color' }, rC); ci.value = col === 'terrain' ? '#55b070' : hex(col); ci.disabled = col === 'terrain';
    tcb.addEventListener('change', () => { MT.setGroup(sel, 'col', tcb.checked ? 'terrain' : ci.value); render(); });
    ci.addEventListener('input', () => MT.setGroup(sel, 'col', ci.value));
    const rF = el('div', { class: 'tc-row' }, host); const fcb = el('input', { type: 'checkbox' }, rF); fcb.checked = !!MT.val(sel, 'foliage');
    el('label', { style: 'width:auto' }, rF, 'Grass / moss grows on top (flammable foliage)');
    fcb.addEventListener('change', () => MT.setGroup(sel, 'foliage', fcb.checked));
    const rS = el('div', { class: 'tc-row' }, host); el('label', {}, rS, 'Footstep sound'); const ssel = el('select', {}, rS);
    SOUNDS.forEach(s => { const o = el('option', { value: s }, ssel, s || '(default)'); if ((MT.val(sel, 'sound') || '') === s) o.selected = true; });
    ssel.addEventListener('change', () => MT.setGroup(sel, 'sound', ssel.value));
    if (!MT.isBuiltin(sel)) el('button', { class: 'tbtn', style: 'margin-top:12px', onclick: () => MT.removeMaterial(sel) }, host, '🗑 Delete material');
    else el('div', { class: 'tc-mut', style: 'margin-top:12px' }, host, 'Built-in material — its tile character is used by existing levels, so it can’t be deleted (edit freely).');
  }

  T.registerTool({
    id: 'materials', label: 'Terrain materials', icon: '🧱', group: 'World',
    sub: 'colour, foliage & footstep sound per material',
    build(host, a) { api = a; bodyEl = host; if (!data) MT.load(); render(); }
  });
  if (T.roadmapDone) T.roadmapDone(20);
})();
