// MOSSVEIL — tool-tutorial.js : the Tutorial / hints editor (Edit ▸ Systems).  Roadmap #93.
// Authors the contextual first-time hints (src/tutorial.js -> data/tutorial.js). Each hint has a text,
// a screen placement + duration, and a trigger (room enter / near a prop / enemy near / HP below / an
// ability gained) evaluated against the live game; the first time the trigger is met in play the hint
// shows once via G.UI.banner. A master enable toggle, and a "reset seen" that re-arms every hint in the
// running playtest (across the Play iframe). Fully offline.
(function () {
  const T = G.Tools, TU = G.Tutorial;
  if (!T || !TU || !TU.exportDefaults) return;
  const clone = o => JSON.parse(JSON.stringify(o));
  const TRIG_LABELS = { roomEnter: 'On room enter', propNear: 'Near a prop', enemyNear: 'Enemy nearby', hpBelow: 'HP below N', abilityGained: 'Ability gained' };
  const PLACES = ['top', 'center', 'bottom'];
  const PROP_HINT = 'lever, bench, spellwell, smith, vendor, shrine…';

  let data = null, sel = 0, dirty = false, bodyEl = null, api = null;

  function trigDefaults(type) {
    if (type === 'propNear') return { type, prop: 'lever', dist: 2.5 };
    if (type === 'enemyNear') return { type, dist: 9 };
    if (type === 'hpBelow') return { type, n: 2 };
    if (type === 'abilityGained') return { type, ability: 'wings' };
    return { type: 'roomEnter' };
  }

  const MT = T.tutorial = {
    get state() { return { data, sel, dirty }; },
    getWorking() { return data; },
    load() { data = clone(TU.exportCurrent()); sel = 0; dirty = false; },
    revert() { data = clone(TU.exportDefaults()); sel = 0; dirty = true; if (bodyEl) render(); },
    applyToEngine() { TU.applyData(clone(data)); },
    async save() { await api.data.save('tutorial', 'TUTORIAL_DATA', data); MT.applyToEngine(); dirty = false; if (api) api.toast('Tutorial saved · ' + data.hints.length + ' hints'); if (bodyEl) render(); return true; },
    select(i) { sel = i; if (bodyEl) render(); },
    setEnabled(v) { data.enabled = !!v; dirty = true; if (bodyEl) render(); },
    uniqueId(base) { base = (base || 'hint').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'hint'; let n = base, i = 1; const has = x => data.hints.some(h => h.id === x); while (has(n)) n = base + (++i); return n; },
    addHint(src) {
      const from = (src != null && data.hints[src]) || data.hints[sel] || { id: 'hint', trigger: { type: 'roomEnter' }, text: 'New hint', place: 'bottom', secs: 4 };
      const h = clone(from); h.id = MT.uniqueId(src != null ? h.id : 'hint'); if (src == null) h.text = 'New hint';
      data.hints.push(h); sel = data.hints.length - 1; dirty = true; if (bodyEl) render(); return h.id;
    },
    duplicateHint(i) { return MT.addHint(i == null ? sel : i); },
    removeHint(i) { i = i == null ? sel : i; if (data.hints.length <= 1) return false; data.hints.splice(i, 1); if (sel >= data.hints.length) sel = data.hints.length - 1; dirty = true; if (bodyEl) render(); return true; },
    setId(i, v) { v = (v || '').trim(); if (!v || data.hints.some((h, j) => j !== i && h.id === v)) return false; data.hints[i].id = v; dirty = true; return true; },
    setField(i, key, v) { data.hints[i][key] = v; dirty = true; },
    setTrigType(i, type) { data.hints[i].trigger = trigDefaults(type); dirty = true; if (bodyEl) render(); },
    setTrigParam(i, key, v) { data.hints[i].trigger[key] = v; dirty = true; },
    resetSeenLive() {
      try { const f = document.getElementById('playIframe'); const w = f && f.contentWindow; if (w && w.G && w.G.Tutorial) { w.G.Tutorial.reset(); return true; } } catch (e) { }
      if (TU.reset) TU.reset(); return false;
    },
    openInTool() { return T.openTool('tutorial'); }
  };

  function el(t, a, p, x) { return api.el(t, a, p, x); }

  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column';
    const head = el('div', { style: 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line);flex-wrap:wrap' }, bodyEl);
    el('button', { class: 'tbtn play', onclick: () => MT.save().catch(e => api.toast('Save failed: ' + e.message)) }, head, '💾 Save tutorial');
    el('button', { class: 'tbtn', onclick: () => { if (confirm('Replace hints with the built-in defaults?')) MT.revert(); } }, head, '↺ Revert');
    const en = el('label', { style: 'display:flex;align-items:center;gap:4px;font-size:12px;color:var(--txt2)' }, head);
    const cb = el('input', { type: 'checkbox' }, en); cb.checked = data.enabled !== false; cb.addEventListener('change', () => MT.setEnabled(cb.checked));
    en.appendChild(document.createTextNode('enabled'));
    el('span', { class: 'tc-mut' }, head, dirty ? '● unsaved' : 'saved ✓');
    el('div', { style: 'flex:1' }, head);
    el('button', { class: 'tbtn', title: 'Re-arm every hint in the running playtest', onclick: () => api.toast(MT.resetSeenLive() ? 'Hints re-armed in the running game' : 'No game running') }, head, '⟲ Reset seen');
    el('span', { class: 'tc-mut' }, head, data.hints.length + ' hints');

    const grid = el('div', { style: 'flex:1;display:grid;grid-template-columns:220px 1fr;gap:0;min-height:0' }, bodyEl);
    const left = el('div', { style: 'display:flex;flex-direction:column;border-right:1px solid var(--line);min-height:0' }, grid);
    const list = el('div', { style: 'flex:1;overflow:auto;padding:8px' }, left);
    data.hints.forEach((h, i) => {
      const row = el('div', { class: 'tc-pal-item' + (i === sel ? ' sel' : ''), style: 'padding:5px 8px;flex-direction:column;align-items:flex-start;gap:1px' }, list);
      el('span', { style: 'font-size:12px' }, row, '💡 ' + h.id);
      el('span', { class: 'tc-mut', style: 'font-size:10px' }, row, TRIG_LABELS[h.trigger.type] || h.trigger.type);
      row.addEventListener('click', () => MT.select(i));
    });
    const btns = el('div', { style: 'display:flex;gap:4px;padding:8px;border-top:1px solid var(--line)' }, left);
    el('button', { class: 'tbtn', onclick: () => MT.addHint() }, btns, '+ New');
    el('button', { class: 'tbtn', onclick: () => MT.duplicateHint() }, btns, '⧉');
    el('button', { class: 'tbtn', onclick: () => { if (!MT.removeHint()) api.toast('Keep at least one.'); } }, btns, '🗑');
    renderHint(el('div', { style: 'overflow:auto;padding:12px 14px;min-height:0' }, grid));
  }

  function renderHint(host) {
    const h = data.hints[sel]; if (!h) { el('div', { class: 'tc-mut' }, host, 'Select a hint.'); return; }
    const rId = el('div', { class: 'tc-row' }, host); el('label', {}, rId, 'Id'); const idInp = el('input', { type: 'text' }, rId); idInp.value = h.id;
    idInp.addEventListener('change', () => { if (!MT.setId(sel, idInp.value)) { idInp.value = h.id; api.toast('Id in use or invalid.'); } render(); });
    const rT = el('div', { class: 'tc-row', style: 'align-items:flex-start' }, host); el('label', {}, rT, 'Text'); const tInp = el('textarea', { rows: '2', style: 'flex:1;background:var(--bg3);color:var(--txt);border:1px solid #45454d;border-radius:5px;padding:5px 7px;font-size:13px' }, rT); tInp.value = h.text;
    tInp.addEventListener('input', () => MT.setField(sel, 'text', tInp.value));
    const rP = el('div', { class: 'tc-row' }, host); el('label', {}, rP, 'Placement'); const pSel = el('select', {}, rP);
    PLACES.forEach(pl => { const o = el('option', { value: pl }, pSel, pl); if (pl === h.place) o.selected = true; }); pSel.addEventListener('change', () => { MT.setField(sel, 'place', pSel.value); });
    const rS = el('div', { class: 'tc-row' }, host); el('label', {}, rS, 'Seconds'); const sInp = el('input', { type: 'number', min: '0.5', max: '20', step: '0.5' }, rS); sInp.value = h.secs; sInp.addEventListener('change', () => MT.setField(sel, 'secs', Math.max(0.5, Math.min(20, +sInp.value || 4))));

    el('h4', { style: 'margin:12px 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:var(--txt2)' }, host, 'Trigger');
    const rC = el('div', { class: 'tc-row' }, host); el('label', {}, rC, 'When'); const cSel = el('select', {}, rC);
    TU.TRIGS.forEach(t => { const o = el('option', { value: t }, cSel, TRIG_LABELS[t] || t); if (t === h.trigger.type) o.selected = true; });
    cSel.addEventListener('change', () => { MT.setTrigType(sel, cSel.value); });
    const tt = h.trigger.type;
    if (tt === 'propNear') {
      const r = el('div', { class: 'tc-row' }, host); el('label', {}, r, 'Prop type'); const inp = el('input', { type: 'text', placeholder: PROP_HINT }, r); inp.value = h.trigger.prop || 'lever'; inp.addEventListener('change', () => MT.setTrigParam(sel, 'prop', inp.value.trim() || 'lever'));
      const r2 = el('div', { class: 'tc-row' }, host); el('label', {}, r2, 'Distance'); const d = el('input', { type: 'number', min: '0.5', max: '20', step: '0.5' }, r2); d.value = h.trigger.dist || 2.5; d.addEventListener('change', () => MT.setTrigParam(sel, 'dist', +d.value || 2.5));
    } else if (tt === 'enemyNear') {
      const r = el('div', { class: 'tc-row' }, host); el('label', {}, r, 'Distance'); const d = el('input', { type: 'number', min: '1', max: '40', step: '1' }, r); d.value = h.trigger.dist || 9; d.addEventListener('change', () => MT.setTrigParam(sel, 'dist', +d.value || 9));
    } else if (tt === 'hpBelow') {
      const r = el('div', { class: 'tc-row' }, host); el('label', {}, r, 'HP <'); const n = el('input', { type: 'number', min: '1', max: '20', step: '1' }, r); n.value = h.trigger.n || 2; n.addEventListener('change', () => MT.setTrigParam(sel, 'n', +n.value || 2));
    } else if (tt === 'abilityGained') {
      const r = el('div', { class: 'tc-row' }, host); el('label', {}, r, 'Ability'); const inp = el('input', { type: 'text', placeholder: 'wings, ember, frost, gale, dive…' }, r); inp.value = h.trigger.ability || 'wings'; inp.addEventListener('change', () => MT.setTrigParam(sel, 'ability', inp.value.trim() || 'wings'));
    }

    el('div', { class: 'tc-card', style: 'margin-top:10px;color:var(--txt2);font-size:12px' }, host).appendChild(document.createTextNode('Shows once when the trigger is first met during play; ⟲ Reset seen re-arms them. Master "enabled" toggles the whole system.'));
  }

  T.registerTool({
    id: 'tutorial', label: 'Tutorial & hints', icon: '💡', group: 'Systems',
    sub: 'contextual first-time hints · triggers',
    build(host, a) { api = a; bodyEl = host; if (!data) MT.load(); render(); }
  });
  if (T.roadmapDone) T.roadmapDone(93);
})();
