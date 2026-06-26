// MOSSVEIL — tool-enemies.js : the in-engine Enemy designer (Edit ▸ Content).
// Authors a library of reusable custom enemy types (named behaviour specs) saved to
// data/enemies-lib.js (G.ENEMY_LIB). Each becomes placeable like any built-in enemy (it joins
// E.TYPES and spawns through the proven mkBehaviorEnemy). Fully offline, editor-only.
(function () {
  const T = G.Tools, E = G.Enemies;
  if (!T || !E || !E.exportLibDefaults) return;
  const clone = o => JSON.parse(JSON.stringify(o));
  const P = E.behaviorPresets || { idle: ['patrol', 'wander', 'still'], onSight: ['chase', 'flee'], attack: ['contact', 'shoot', 'leap'] };
  const DEFAULT_SPEC = { hp: 3, speed: 2, sight: 9, fly: false, color: '#8a5a7a', size: 0.8, idle: 'patrol', onSight: 'chase', attack: 'contact', shootCd: 2 };

  let data = null, sel = null, dirty = false, bodyEl = null, api = null;
  const ids = () => Object.keys(data.enemies);
  const MT = T.enemies = {
    get state() { return { data, sel, dirty }; },
    getWorking() { return data; },
    load() { data = clone(E.exportLibCurrent()); sel = ids()[0] || null; dirty = false; },
    applyToEngine() { E.applyEnemyLib(clone(data)); },
    async save() { await api.data.save('enemies-lib', 'ENEMY_LIB', data); MT.applyToEngine(); dirty = false; if (api) api.toast('Enemies saved · ' + ids().length); if (bodyEl) render(); return true; },
    select(id) { sel = id; if (bodyEl) render(); },
    uniqueId(base) { base = (base || 'enemy').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'enemy'; let n = base, i = 1; while (data.enemies[n]) n = base + (++i); return n; },
    addEnemy(src) { const n = MT.uniqueId(src || 'enemy'); const from = (src && data.enemies[src]) || (sel && data.enemies[sel]) || { name: 'New Enemy', spec: clone(DEFAULT_SPEC) }; data.enemies[n] = { name: src ? (from.name + ' copy') : 'New Enemy', spec: clone(from.spec) }; sel = n; dirty = true; if (bodyEl) render(); return n; },
    duplicateEnemy(id) { return MT.addEnemy(id || sel); },
    removeEnemy(id) { id = id || sel; delete data.enemies[id]; sel = ids()[0] || null; dirty = true; if (bodyEl) render(); return true; },
    renameId(id, nid) { nid = (nid || '').trim(); if (!nid || nid === id || data.enemies[nid]) return false; data.enemies[nid] = data.enemies[id]; delete data.enemies[id]; if (sel === id) sel = nid; dirty = true; return true; },
    setName(id, v) { data.enemies[id].name = v; dirty = true; },
    setSpec(id, key, v) { data.enemies[id].spec[key] = v; dirty = true; },
    openInTool() { return T.openTool('enemies'); }
  };

  function el(t, a, p, x) { return api.el(t, a, p, x); }
  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column';
    const head = el('div', { style: 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line)' }, bodyEl);
    el('button', { class: 'tbtn play', onclick: () => MT.save().catch(e => api.toast('Save failed: ' + e.message)) }, head, '💾 Save enemies');
    el('span', { class: 'tc-mut' }, head, dirty ? '● unsaved' : 'saved ✓');
    el('div', { style: 'flex:1' }, head);
    el('span', { class: 'tc-mut' }, head, ids().length + ' custom');
    const grid = el('div', { style: 'flex:1;display:grid;grid-template-columns:200px 1fr;gap:0;min-height:0' }, bodyEl);
    const left = el('div', { style: 'display:flex;flex-direction:column;border-right:1px solid var(--line);min-height:0' }, grid);
    const list = el('div', { style: 'flex:1;overflow:auto;padding:8px' }, left);
    if (!ids().length) el('div', { class: 'tc-mut', style: 'padding:6px' }, list, 'No custom enemies yet. Add one — it becomes placeable in the Enemies asset browser.');
    ids().forEach(id => {
      const e = data.enemies[id];
      const row = el('div', { class: 'tc-pal-item' + (id === sel ? ' sel' : ''), style: 'padding:5px 8px' }, list);
      el('span', { style: 'width:12px;height:12px;border-radius:50%;flex-shrink:0;background:' + (e.spec.color || '#8a5a7a') }, row);
      el('span', {}, row, e.name);
      row.addEventListener('click', () => MT.select(id));
    });
    const btns = el('div', { style: 'display:flex;gap:4px;padding:8px;border-top:1px solid var(--line)' }, left);
    el('button', { class: 'tbtn', onclick: () => MT.addEnemy() }, btns, '+ New');
    el('button', { class: 'tbtn', onclick: () => { if (sel) MT.duplicateEnemy(); } }, btns, '⧉');
    el('button', { class: 'tbtn', onclick: () => { if (sel) MT.removeEnemy(); } }, btns, '🗑');
    renderEnemy(el('div', { style: 'overflow:auto;padding:12px 14px;min-height:0' }, grid));
  }

  function renderEnemy(host) {
    if (!sel || !data.enemies[sel]) { el('div', { class: 'tc-mut' }, host, 'Create or select an enemy.'); return; }
    const e = data.enemies[sel], s = e.spec;
    // preview swatch
    const sw = el('div', { style: 'height:90px;display:flex;align-items:center;justify-content:center;background:#0e1218;border:1px solid var(--line);border-radius:8px;margin-bottom:10px' }, host);
    el('div', { style: 'width:' + (28 + s.size * 40) + 'px;height:' + (24 + s.size * 32) + 'px;border-radius:50%;background:' + s.color + (s.fly ? ';box-shadow:0 0 16px ' + s.color : '') }, sw);
    const rId = el('div', { class: 'tc-row' }, host); el('label', {}, rId, 'Id'); const idInp = el('input', { type: 'text' }, rId); idInp.value = sel;
    idInp.addEventListener('change', () => { if (!MT.renameId(sel, idInp.value)) { idInp.value = sel; api.toast('Id in use or invalid.'); } });
    const rN = el('div', { class: 'tc-row' }, host); el('label', {}, rN, 'Name'); const nInp = el('input', { type: 'text' }, rN); nInp.value = e.name;
    nInp.addEventListener('input', () => MT.setName(sel, nInp.value)); nInp.addEventListener('change', render);
    num(host, 'Health', s.hp, 1, 30, 1, v => MT.setSpec(sel, 'hp', v));
    num(host, 'Speed', s.speed, 0.5, 8, 0.5, v => MT.setSpec(sel, 'speed', v));
    num(host, 'Sight range', s.sight, 2, 20, 0.5, v => MT.setSpec(sel, 'sight', v));
    num(host, 'Size', s.size, 0.4, 2, 0.05, v => { MT.setSpec(sel, 'size', v); render(); });
    const rC = el('div', { class: 'tc-row' }, host); el('label', {}, rC, 'Colour'); const ci = el('input', { type: 'color' }, rC); ci.value = s.color;
    ci.addEventListener('input', () => { MT.setSpec(sel, 'color', ci.value); render(); });
    const rF = el('div', { class: 'tc-row' }, host); const fcb = el('input', { type: 'checkbox' }, rF); fcb.checked = !!s.fly;
    el('label', { style: 'width:auto' }, rF, 'Flying');
    fcb.addEventListener('change', () => { MT.setSpec(sel, 'fly', fcb.checked); render(); });
    sel2(host, 'Idle behaviour', P.idle, s.idle, v => MT.setSpec(sel, 'idle', v));
    sel2(host, 'On sight', P.onSight, s.onSight, v => MT.setSpec(sel, 'onSight', v));
    sel2(host, 'Attack', P.attack, s.attack, v => { MT.setSpec(sel, 'attack', v); render(); });
    if (s.attack === 'shoot') num(host, 'Shoot cooldown', s.shootCd, 0.3, 6, 0.1, v => MT.setSpec(sel, 'shootCd', v));
    el('div', { class: 'tc-mut', style: 'margin-top:10px' }, host, 'Saved enemies appear in the Scene ▸ Enemies asset browser (reopen it after saving) and spawn with this behaviour.');
  }

  function num(p, label, v, min, max, step, onCh) { const r = el('div', { class: 'tc-row' }, p); el('label', {}, r, label); const i = el('input', { type: 'number', min, max, step }, r); i.value = v; i.addEventListener('change', () => onCh(+i.value)); }
  function sel2(p, label, opts, v, onCh) { const r = el('div', { class: 'tc-row' }, p); el('label', {}, r, label); const s = el('select', {}, r); opts.forEach(o => { const op = el('option', { value: o }, s, o); if (o === v) op.selected = true; }); s.addEventListener('change', () => onCh(s.value)); }

  T.registerTool({
    id: 'enemies', label: 'Enemy designer', icon: '🐛', group: 'Content',
    sub: 'author reusable custom enemy types',
    build(host, a) { api = a; bodyEl = host; if (!data) MT.load(); render(); }
  });
  if (T.roadmapDone) T.roadmapDone(8);
})();
