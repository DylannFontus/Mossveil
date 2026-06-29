// MOSSVEIL — tool-findreplace.js : Batch find & replace (Edit ▸ Tools).  Roadmap #54.
// Make the same edit across every room at once — retype every enemy of a kind, recolour a whole biome,
// rename a switch signal everywhere it's wired, swap a decor/hazard variant, or replace words in signs.
// Field-targeted (it only ever writes the field the mode names, so it can't produce malformed objects),
// always previews the exact matches before you commit, and refreshes the open room. Editor-only, offline.
// Note: like the building/template stamps, a replace is NOT a single undo step — Save or snapshot first.
(function () {
  const T = G.Tools;
  if (!T) return;
  const ED = () => G.__ed || {};
  const levels = () => G.LEVELS || {};
  const W = () => G.World || {};
  const TEXT_KEYS = ['text', 'title', 'name'];

  function eachProp(fn) { const L = levels(); for (const id in L) (L[id].props || []).forEach((p, i) => fn(p, i, id)); }
  function eachEnemy(fn) { const L = levels(); for (const id in L) (L[id].enemies || []).forEach((e, i) => fn(e, i, id)); }

  // ---- option pools drawn from the game's own registries / current world ----
  const enemyTypes = () => ((G.Enemies && G.Enemies.TYPES) || []).map(t => t.id);
  const biomeList = () => (W().BIOMES && W().BIOMES.slice()) || Object.keys((W().PAL) || {});
  function kindPool(type) {
    if (type === 'decor') return ((W().DECOR_KINDS && W().DECOR_KINDS.standing) || []).concat((W().DECOR_KINDS && W().DECOR_KINDS.hanging) || []);
    if (type === 'mire') return ['mud', 'quicksand', 'ash'];
    if (type === 'pool') return ['lava', 'acid'];
    if (type === 'furniture') return Object.keys((W().FURN) || {});
    return [];
  }
  const KIND_TYPES = ['decor', 'mire', 'pool', 'furniture'];

  // distinct present-values, for the "from" dropdowns
  function present(mode, type) {
    const set = new Set();
    if (mode === 'enemyType') eachEnemy(e => set.add(e.type));
    else if (mode === 'kind') eachProp(p => { if (p.type === type) set.add(p.kind || ''); });
    else if (mode === 'signal') eachProp(p => { if (p.signal) set.add(p.signal); });
    else if (mode === 'biome') { const L = levels(); for (const id in L) if (L[id].biome) set.add(L[id].biome); }
    return [...set].filter(v => v !== '').sort();
  }

  // ---- scan (pure) ----
  function scan(s) {
    const m = [];
    if (s.mode === 'enemyType') eachEnemy((e, i, id) => { if (e.type === s.from) m.push({ level: id, kind: 'enemy', i, was: e.type }); });
    else if (s.mode === 'kind') eachProp((p, i, id) => { if (p.type === s.type && (p.kind || '') === s.from) m.push({ level: id, kind: 'prop', i, was: p.kind || '·' }); });
    else if (s.mode === 'signal') eachProp((p, i, id) => { if (p.signal === s.from) m.push({ level: id, kind: 'prop', i, was: p.signal, type: p.type }); });
    else if (s.mode === 'biome') { const L = levels(); for (const id in L) if ((L[id].biome || '') === s.from) m.push({ level: id, kind: 'level', was: L[id].biome }); }
    else if (s.mode === 'text' && s.from) eachProp((p, i, id) => { for (const k of TEXT_KEYS) if (typeof p[k] === 'string' && p[k].indexOf(s.from) >= 0) { m.push({ level: id, kind: 'prop', i, field: k, was: p[k] }); break; } });
    return m;
  }

  // ---- apply (mutates) ----
  function apply(s) {
    if (s.from == null || s.from === '' && s.mode !== 'text') return 0;
    if (s.mode === 'text' && !s.from) return 0;
    const m = scan(s); let n = 0;
    for (const it of m) {
      const L = levels()[it.level]; if (!L) continue;
      if (it.kind === 'enemy') { if (L.enemies[it.i]) { L.enemies[it.i].type = s.to; n++; } }
      else if (it.kind === 'level') { L.biome = s.to; n++; }
      else if (it.kind === 'prop') {
        const p = L.props[it.i]; if (!p) continue;
        if (s.mode === 'kind') { p.kind = s.to; n++; }
        else if (s.mode === 'signal') { p.signal = s.to; n++; }
        else if (s.mode === 'text') { p[it.field] = String(p[it.field]).split(s.from).join(s.to); n++; }
      }
    }
    if (n && ED().markDirty) ED().markDirty();
    if (n && ED().openLevel && ED().currentId) ED().openLevel(ED().currentId());
    return n;
  }

  // =================== test / external API ===================
  T.findreplace = { scan, apply, present, kindPool, count: s => scan(s).length, open: () => T.openTool('findreplace') };

  // =================== UI ===================
  let bodyEl = null, api = null;
  const MODES = [
    ['enemyType', 'Enemy type', 'Retype every enemy of one kind into another.'],
    ['kind', 'Prop variant (kind)', 'Swap a decor / hazard / furniture variant everywhere.'],
    ['signal', 'Switch signal', 'Rename a lever/plate/door signal across the world.'],
    ['biome', 'Room biome', 'Re-theme every room of one biome.'],
    ['text', 'Text in signs', 'Replace words inside signs, readables, NPC names…']
  ];
  const view = { mode: 'enemyType', type: 'decor', from: '', to: '', textFrom: '', textTo: '' };
  function el(t, a, p, x) { return api.el(t, a, p, x); }

  function curSpec() {
    if (view.mode === 'text') return { mode: 'text', from: view.textFrom, to: view.textTo };
    return { mode: view.mode, type: view.type, from: view.from, to: view.to };
  }

  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column;height:100%';
    const head = el('div', { style: 'padding:12px 14px;border-bottom:1px solid var(--line);display:flex;flex-direction:column;gap:10px' }, bodyEl);

    // mode picker
    const mrow = el('div', { style: 'display:flex;gap:5px;flex-wrap:wrap' }, head);
    MODES.forEach(([id, label]) => {
      const b = el('button', { class: 'tbtn' + (view.mode === id ? ' on' : '') }, mrow, label);
      b.addEventListener('click', () => { view.mode = id; view.from = ''; view.to = ''; render(); });
    });
    el('div', { class: 'tc-mut', style: 'font-size:11px' }, head, (MODES.find(m => m[0] === view.mode) || [])[2] || '');

    // from / to controls
    const ctl = el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:end' }, head);
    const dd = (parent, label, options, value, onPick, allowAny) => {
      const cell = el('label', { style: 'display:flex;flex-direction:column;gap:3px;font-size:11px;color:var(--txt2)' }, parent, label);
      const sel = el('select', {}, cell);
      if (allowAny) el('option', { value: '' }, sel, '— choose —');
      options.forEach(o => { const op = el('option', { value: o }, sel, o); if (o === value) op.selected = true; });
      sel.addEventListener('change', () => onPick(sel.value));
      return sel;
    };

    if (view.mode === 'kind') {
      dd(head, 'Prop type', KIND_TYPES, view.type, v => { view.type = v; view.from = ''; view.to = ''; render(); });
    }
    if (view.mode === 'enemyType') {
      dd(ctl, 'Find type', present('enemyType'), view.from, v => { view.from = v; render(); }, true);
      dd(ctl, 'Replace with', enemyTypes(), view.to, v => { view.to = v; });
    } else if (view.mode === 'kind') {
      dd(ctl, 'Find variant', present('kind', view.type), view.from, v => { view.from = v; render(); }, true);
      dd(ctl, 'Replace with', kindPool(view.type), view.to, v => { view.to = v; });
    } else if (view.mode === 'signal') {
      dd(ctl, 'Find signal', present('signal'), view.from, v => { view.from = v; render(); }, true);
      const cell = el('label', { style: 'display:flex;flex-direction:column;gap:3px;font-size:11px;color:var(--txt2)' }, ctl, 'Rename to');
      const inp = el('input', { type: 'text', value: view.to, placeholder: 'new-signal' }, cell); inp.addEventListener('input', () => view.to = inp.value);
    } else if (view.mode === 'biome') {
      dd(ctl, 'Find biome', present('biome'), view.from, v => { view.from = v; render(); }, true);
      dd(ctl, 'Replace with', biomeList(), view.to, v => { view.to = v; });
    } else if (view.mode === 'text') {
      const c1 = el('label', { style: 'display:flex;flex-direction:column;gap:3px;font-size:11px;color:var(--txt2)' }, ctl, 'Find text');
      const i1 = el('input', { type: 'text', value: view.textFrom, placeholder: 'words to find' }, c1); i1.addEventListener('input', () => { view.textFrom = i1.value; renderPreview(); });
      const c2 = el('label', { style: 'display:flex;flex-direction:column;gap:3px;font-size:11px;color:var(--txt2)' }, ctl, 'Replace with');
      const i2 = el('input', { type: 'text', value: view.textTo, placeholder: 'replacement' }, c2); i2.addEventListener('input', () => view.textTo = i2.value);
    }

    // preview + apply
    const previewWrap = el('div', { style: 'flex:1;overflow:auto;padding:10px 14px;min-height:0' }, bodyEl);
    const footer = el('div', { style: 'padding:10px 14px;border-top:1px solid var(--line);display:flex;align-items:center;gap:10px' }, bodyEl);
    const applyBtn = el('button', { class: 'tbtn on', style: 'padding:8px 14px' }, footer, 'Replace all');
    const countLbl = el('span', { class: 'tc-mut' }, footer);

    function renderPreview() {
      previewWrap.innerHTML = '';
      const s = curSpec();
      const ready = (s.mode === 'text') ? !!s.from : (s.from !== '' && s.from != null);
      const m = ready ? scan(s) : [];
      countLbl.textContent = ready ? (m.length + ' match' + (m.length === 1 ? '' : 'es')) : 'pick what to find';
      applyBtn.disabled = !ready || !m.length;
      applyBtn.style.opacity = applyBtn.disabled ? '.45' : '1';
      if (!ready) { el('div', { class: 'tc-mut', style: 'padding:14px;text-align:center' }, previewWrap, 'Choose what to find — matches preview here before anything changes.'); return; }
      if (!m.length) { el('div', { class: 'tc-mut', style: 'padding:14px;text-align:center' }, previewWrap, 'Nothing matches.'); return; }
      m.slice(0, 200).forEach(it => {
        const row = el('div', { class: 'tc-row', style: 'margin:2px 0;align-items:center;gap:8px' }, previewWrap);
        el('span', { style: 'width:14px;text-align:center;opacity:.8' }, row, it.kind === 'level' ? '🗺' : it.kind === 'enemy' ? '🐛' : '◆');
        const lvTitle = (levels()[it.level] || {}).title || it.level;
        el('span', { style: 'flex:1;font-size:12px;color:var(--txt)' }, row, lvTitle + (it.type ? '  ·  ' + it.type : '') + (it.field ? '  ·  ' + it.field : ''));
        el('span', { class: 'tc-mut', style: 'font-size:11px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, row, '“' + String(it.was).slice(0, 40) + '”');
      });
      if (m.length > 200) el('div', { class: 'tc-mut', style: 'padding:6px' }, previewWrap, '…and ' + (m.length - 200) + ' more (all will be replaced).');
    }

    applyBtn.addEventListener('click', () => {
      const s = curSpec();
      const n = apply(s);
      api.toast('Replaced ' + n + ' ' + (n === 1 ? 'match' : 'matches'));
      if (view.mode !== 'text') view.from = '';
      render();
    });
    renderPreview();
  }

  T.registerTool({
    id: 'findreplace', label: 'Batch find & replace', icon: '🔁', group: 'Tools',
    sub: 'retype · recolour · rename signals · swap variants — across every room',
    build(host, a) { api = a; bodyEl = host; render(); }
  });
  if (T.roadmapDone) T.roadmapDone(54);
})();
