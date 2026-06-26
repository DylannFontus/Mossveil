// MOSSVEIL — tool-bosses.js : the in-engine Boss designer (Edit ▸ Content).
// Authors the boss roster that used to be hard-coded in src/bosses.js (data/bosses.js -> G.BOSS_DATA):
// name, epithet, rig, ground/fly, health, scale, the 5 body colours, and the phase-1 / phase-2 move
// sets (composed from the engine's move library). New bosses join B.LIST so a Boss-trigger can use
// them. Move + rig implementations stay in code. Fully offline, editor-only.
(function () {
  const T = G.Tools, B = G.Bosses, E = G.Enemies;
  if (!T || !B || !B.exportBossDefaults) return;
  const clone = o => JSON.parse(JSON.stringify(o));
  const RIGS = B.RIG_NAMES || ['beetle', 'mantis', 'moth', 'serpent', 'golem'];
  const MOVES = B.MOVE_NAMES || ['leap', 'slash', 'rain', 'volley', 'ring', 'summon', 'spikes', 'swoop', 'orbs', 'burrow'];
  const COLORS = [['body', 'Body'], ['accent', 'Accent'], ['accent2', 'Accent 2'], ['bone', 'Bone'], ['glow', 'Glow']];
  const BUILTIN = Object.keys(B.exportBossDefaults().configs);

  let data = null, sel = null, dirty = false, bodyEl = null, api = null;
  const ids = () => Object.keys(data.configs);
  const MT = T.bosses = {
    get state() { return { data, sel, dirty }; },
    getWorking() { return data; },
    load() { data = clone(B.exportBossCurrent()); sel = ids()[0] || null; dirty = false; },
    revert() { data = clone(B.exportBossDefaults()); sel = ids()[0]; dirty = true; if (bodyEl) render(); },
    applyToEngine() { B.applyBossData(clone(data)); },
    async save() { await api.data.save('bosses', 'BOSS_DATA', data); MT.applyToEngine(); dirty = false; if (api) api.toast('Bosses saved · ' + ids().length); if (bodyEl) render(); return true; },
    select(id) { sel = id; if (bodyEl) render(); },
    uniqueId(base) { base = (base || 'boss').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'boss'; let n = base, i = 1; while (data.configs[n]) n = base + (++i); return n; },
    addBoss(src) { const n = MT.uniqueId(src || 'boss'); data.configs[n] = clone((src && data.configs[src]) || data.configs[sel]); data.configs[n].name = (data.configs[n].name || 'BOSS') + (src ? ' COPY' : ''); if (src == null) data.configs[n].name = 'NEW BOSS'; data.epithets[n] = (src && data.epithets[src]) || ''; sel = n; dirty = true; if (bodyEl) render(); return n; },
    duplicateBoss(id) { return MT.addBoss(id || sel); },
    removeBoss(id) { id = id || sel; if (ids().length <= 1) return false; delete data.configs[id]; delete data.epithets[id]; sel = ids()[0]; dirty = true; if (bodyEl) render(); return true; },
    renameId(id, nid) { nid = (nid || '').trim(); if (!nid || nid === id || data.configs[nid]) return false; data.configs[nid] = data.configs[id]; data.epithets[nid] = data.epithets[id] || ''; delete data.configs[id]; delete data.epithets[id]; if (sel === id) sel = nid; dirty = true; return true; },
    setCfg(id, key, v) { data.configs[id][key] = v; dirty = true; },
    setColor(id, key, hex) { data.configs[id].colors[key] = hex; dirty = true; },
    setEpithet(id, v) { data.epithets[id] = v; dirty = true; },
    hasMove(id, phase, m) { return (data.configs[id][phase] || []).indexOf(m) >= 0; },
    toggleMove(id, phase, m) { const a = data.configs[id][phase] = (data.configs[id][phase] || []).slice(); const i = a.indexOf(m); if (i >= 0) a.splice(i, 1); else a.push(m); dirty = true; },
    isBuiltin: id => BUILTIN.indexOf(id) >= 0,
    openInTool() { return T.openTool('bosses'); }
  };

  function el(t, a, p, x) { return api.el(t, a, p, x); }
  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column';
    const head = el('div', { style: 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line)' }, bodyEl);
    el('button', { class: 'tbtn play', onclick: () => MT.save().catch(e => api.toast('Save failed: ' + e.message)) }, head, '💾 Save bosses');
    el('button', { class: 'tbtn', onclick: () => { if (confirm('Replace the boss roster with the built-in defaults?')) MT.revert(); } }, head, '↺ Revert');
    el('span', { class: 'tc-mut' }, head, dirty ? '● unsaved' : 'saved ✓');
    el('div', { style: 'flex:1' }, head);
    el('span', { class: 'tc-mut' }, head, ids().length + ' bosses');
    const grid = el('div', { style: 'flex:1;display:grid;grid-template-columns:210px 1fr;gap:0;min-height:0' }, bodyEl);
    const left = el('div', { style: 'display:flex;flex-direction:column;border-right:1px solid var(--line);min-height:0' }, grid);
    const list = el('div', { style: 'flex:1;overflow:auto;padding:8px' }, left);
    ids().forEach(id => {
      const c = data.configs[id];
      const row = el('div', { class: 'tc-pal-item' + (id === sel ? ' sel' : ''), style: 'padding:5px 8px' }, list);
      el('span', { style: 'width:12px;height:12px;border-radius:3px;flex-shrink:0;background:' + c.colors.glow }, row);
      el('span', {}, row, c.name);
      row.addEventListener('click', () => MT.select(id));
    });
    const btns = el('div', { style: 'display:flex;gap:4px;padding:8px;border-top:1px solid var(--line)' }, left);
    el('button', { class: 'tbtn', onclick: () => MT.addBoss() }, btns, '+ New');
    el('button', { class: 'tbtn', onclick: () => MT.duplicateBoss() }, btns, '⧉');
    el('button', { class: 'tbtn', onclick: () => { if (!MT.removeBoss()) api.toast('Keep at least one boss.'); } }, btns, '🗑');
    renderBoss(el('div', { style: 'overflow:auto;padding:12px 14px;min-height:0' }, grid));
  }

  function renderBoss(host) {
    if (!sel || !data.configs[sel]) { el('div', { class: 'tc-mut' }, host, 'Select a boss.'); return; }
    const c = data.configs[sel];
    const sw = el('div', { style: 'height:64px;border-radius:8px;border:1px solid var(--line);margin-bottom:10px;display:flex' }, host);
    COLORS.forEach(([k]) => el('div', { style: 'flex:1;background:' + c.colors[k] }, sw));
    const rId = el('div', { class: 'tc-row' }, host); el('label', {}, rId, 'Id'); const idInp = el('input', { type: 'text' }, rId); idInp.value = sel;
    idInp.addEventListener('change', () => { if (!MT.renameId(sel, idInp.value)) { idInp.value = sel; api.toast('Id in use or invalid.'); } });
    const rN = el('div', { class: 'tc-row' }, host); el('label', {}, rN, 'Name'); const nInp = el('input', { type: 'text' }, rN); nInp.value = c.name;
    nInp.addEventListener('input', () => MT.setCfg(sel, 'name', nInp.value)); nInp.addEventListener('change', render);
    const rE = el('div', { class: 'tc-row' }, host); el('label', {}, rE, 'Epithet'); const eInp = el('input', { type: 'text', placeholder: 'Warden of…' }, rE); eInp.value = data.epithets[sel] || '';
    eInp.addEventListener('input', () => MT.setEpithet(sel, eInp.value));
    sel2(host, 'Rig (skeleton)', RIGS, c.rig, v => { MT.setCfg(sel, 'rig', v); render(); });
    sel2(host, 'Mode', ['ground', 'fly'], c.mode, v => MT.setCfg(sel, 'mode', v));
    num(host, 'Health', c.hp, 5, 120, 1, v => MT.setCfg(sel, 'hp', v));
    num(host, 'Scale', c.scale, 0.6, 1.8, 0.05, v => { MT.setCfg(sel, 'scale', v); });
    el('h4', { style: 'margin:12px 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:var(--txt2)' }, host, 'Colours');
    const cg = el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:2px 14px' }, host);
    COLORS.forEach(([k, lab]) => { const r = el('div', { class: 'tc-row', style: 'margin:2px 0' }, cg); el('label', { style: 'width:80px' }, r, lab); const ci = el('input', { type: 'color' }, r); ci.value = c.colors[k]; ci.addEventListener('input', () => { MT.setColor(sel, k, ci.value); sw.children[COLORS.findIndex(x => x[0] === k)].style.background = ci.value; }); });
    el('h4', { style: 'margin:12px 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:var(--txt2)' }, host, 'Phase 1 moves');
    moveGrid(host, 'moves');
    el('h4', { style: 'margin:12px 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:var(--txt2)' }, host, 'Phase 2 moves (enraged)');
    moveGrid(host, 'moves2');
    const rM = el('div', { class: 'tc-row' }, host); el('label', {}, rM, 'Minion (summon)'); const mSel = el('select', {}, rM);
    el('option', { value: '' }, mSel, '(none)');
    (E && E.TYPES ? E.TYPES : []).forEach(t => { const o = el('option', { value: t.id }, mSel, t.label); if (t.id === c.minion) o.selected = true; });
    mSel.addEventListener('change', () => MT.setCfg(sel, 'minion', mSel.value || undefined));
    num(host, 'Phase-2 speed ×', c.speed2 || 1, 1, 2, 0.05, v => MT.setCfg(sel, 'speed2', v > 1.001 ? v : undefined));
    el('div', { class: 'tc-mut', style: 'margin-top:10px' }, host, 'Saved bosses appear in a Boss-trigger’s type dropdown. Move and rig behaviours are built-in; this composes them.');
  }

  function moveGrid(host, phase) {
    const g = el('div', { style: 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:2px 10px' }, host);
    MOVES.forEach(m => {
      const r = el('label', { class: 'tc-mut', style: 'display:flex;align-items:center;gap:5px' }, g);
      const cb = el('input', { type: 'checkbox' }, r); cb.checked = MT.hasMove(sel, phase, m);
      el('span', {}, r, m);
      cb.addEventListener('change', () => MT.toggleMove(sel, phase, m));
    });
  }
  function num(p, label, v, min, max, step, onCh) { const r = el('div', { class: 'tc-row' }, p); el('label', {}, r, label); const i = el('input', { type: 'number', min, max, step }, r); i.value = v; i.addEventListener('change', () => onCh(+i.value)); }
  function sel2(p, label, opts, v, onCh) { const r = el('div', { class: 'tc-row' }, p); el('label', {}, r, label); const s = el('select', {}, r); opts.forEach(o => { const op = el('option', { value: o }, s, o); if (o === v) op.selected = true; }); s.addEventListener('change', () => onCh(s.value)); }

  T.registerTool({
    id: 'bosses', label: 'Boss designer', icon: '👑', group: 'Content',
    sub: 'roster, phases, moves, rig & colours',
    build(host, a) { api = a; bodyEl = host; if (!data) MT.load(); render(); }
  });
  if (T.roadmapDone) T.roadmapDone(9);
})();
