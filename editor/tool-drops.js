// MOSSVEIL — tool-drops.js : enemy & boss Glimmer drop tables (Edit ▸ Systems).  Roadmap #91.
// Authors how much Glimmer each slain creature spills (src/drops.js -> data/drops.js): a baseline
// drop for any enemy / any boss, plus per-type overrides — each a min/max Glimmer range and a drop
// chance. A live roll-simulation histogram shows the spread & average for any spec without launching
// the game. Edits the data overlay through the data layer; applies to the engine live and on next
// Play. Fully offline, editor-only. Defaults are byte-identical to the old hardcoded death-handler
// formulas in enemies.js / bosses.js.
(function () {
  const T = G.Tools, D = G.Drops;
  if (!T || !D || !D.exportDefaults) return;
  const clone = o => JSON.parse(JSON.stringify(o));
  let data = null, dirty = false, bodyEl = null, api = null, pcv = null, simKey = 'enemy';

  // baseline a given override map seeds from / falls back to
  const baseOf = map => (map === 'byBoss' ? data.boss : data.enemy);
  const rollSpec = s => (s.chance < 1 && Math.random() >= s.chance) ? 0 : s.min + Math.floor(Math.random() * (s.max - s.min + 1));
  const ev = s => Math.round(s.chance * (s.min + s.max) / 2 * 10) / 10;

  const MT = T.drops = {
    get state() { return { data, dirty }; },
    getWorking() { return data; },
    load() { data = clone(D.exportCurrent()); dirty = false; },
    revert() { data = clone(D.exportDefaults()); dirty = true; if (bodyEl) render(); },
    applyToEngine() { D.applyData(clone(data)); },
    async save() { await api.data.save('drops', 'DROPS_DATA', data); MT.applyToEngine(); dirty = false; if (api) api.toast('Drop tables saved'); if (bodyEl) render(); return true; },
    // baseline edit (group 'enemy'|'boss'); keeps min<=max and chance in 0..1
    setBase(group, field, v) { applyField(data[group], field, v); dirty = true; if (pcv) draw(); },
    // override edit on a map ('byType'|'byBoss') keyed by id
    setEntry(map, key, field, v) { if (data[map][key]) { applyField(data[map][key], field, v); dirty = true; if (pcv) draw(); } },
    setOverride(map, key, on) {
      if (on) data[map][key] = clone(baseOf(map)); else delete data[map][key];
      dirty = true; if (bodyEl) render();
    },
    hasOverride(map, key) { return !!data[map][key]; },
    specFor(map, key) { return clone(data[map][key] || baseOf(map)); },
    expected(s) { return ev(s); },
    openInTool() { return T.openTool('drops'); }
  };

  function applyField(s, field, v) {
    if (field === 'chance') { s.chance = Math.max(0, Math.min(1, v)); return; }
    const n = Math.max(0, Math.round(v || 0));
    s[field] = n;
    if (s.min > s.max) { if (field === 'min') s.max = s.min; else s.min = s.max; }
  }

  // resolve the spec the preview is simulating from simKey ('enemy' | 'boss' | 'type:<id>' | 'boss:<id>')
  function simSpec() {
    if (simKey === 'enemy') return data.enemy;
    if (simKey === 'boss') return data.boss;
    if (simKey.indexOf('type:') === 0) return data.byType[simKey.slice(5)] || data.enemy;
    if (simKey.indexOf('boss:') === 0) return data.byBoss[simKey.slice(5)] || data.boss;
    return data.enemy;
  }
  function simLabel() {
    if (simKey === 'enemy') return 'Enemy baseline';
    if (simKey === 'boss') return 'Boss baseline';
    if (simKey.indexOf('type:') === 0) return simKey.slice(5);
    if (simKey.indexOf('boss:') === 0) return simKey.slice(5);
    return simKey;
  }

  function draw() {
    if (!pcv) return;
    const cx = pcv.getContext('2d'), W = pcv.width, H = pcv.height, s = simSpec();
    cx.clearRect(0, 0, W, H);
    cx.fillStyle = '#0b1410'; cx.fillRect(0, 0, W, H);
    // simulate N rolls into a histogram bucketed by value (0..max)
    const N = 4000, hi = Math.max(1, s.max), counts = new Array(hi + 1).fill(0);
    let sum = 0, mn = Infinity, mx = 0;
    for (let i = 0; i < N; i++) { const r = rollSpec(s); counts[Math.min(r, hi)]++; sum += r; if (r < mn) mn = r; if (r > mx) mx = r; }
    const peak = Math.max(1, ...counts);
    const padL = 28, padB = 22, padT = 10, gw = W - padL - 10, gh = H - padB - padT;
    // bars
    const span = hi + 1, bw = gw / span;
    for (let v = 0; v <= hi; v++) {
      const h = (counts[v] / peak) * gh, x = padL + v * bw, y = padT + gh - h;
      cx.fillStyle = v === 0 ? '#5a4a2a' : '#ffe28a';
      cx.fillRect(x + 1, y, Math.max(1, bw - 2), h);
    }
    // axis baseline
    cx.strokeStyle = 'rgba(255,255,255,0.25)'; cx.beginPath(); cx.moveTo(padL, padT + gh + 0.5); cx.lineTo(W - 8, padT + gh + 0.5); cx.stroke();
    // value labels (0, hi, and mean tick)
    cx.fillStyle = 'rgba(220,230,210,0.7)'; cx.font = '10px monospace'; cx.textBaseline = 'top'; cx.textAlign = 'left';
    cx.fillText('0', padL, padT + gh + 4);
    cx.textAlign = 'right'; cx.fillText(String(hi), W - 8, padT + gh + 4);
    // mean marker
    const mean = sum / N, mxPix = padL + (mean + 0.5) * bw;
    cx.strokeStyle = '#9fffc0'; cx.setLineDash([3, 3]); cx.beginPath(); cx.moveTo(mxPix, padT); cx.lineTo(mxPix, padT + gh); cx.stroke(); cx.setLineDash([]);
    // readout
    cx.fillStyle = '#e9f3ec'; cx.font = '11px monospace'; cx.textAlign = 'left';
    cx.fillText(simLabel() + '  ·  ' + (mn === Infinity ? 0 : mn) + '–' + mx + ' ✦  avg ' + (Math.round(mean * 10) / 10), padL, padT - 2 + 0);
  }

  function el(t, a, p, x) { return api.el(t, a, p, x); }

  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column';
    const head = el('div', { style: 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line)' }, bodyEl);
    el('button', { class: 'tbtn play', onclick: () => MT.save().catch(e => api.toast('Save failed: ' + e.message)) }, head, '💾 Save');
    el('button', { class: 'tbtn', onclick: () => { if (confirm('Reset all drop tables to the built-in defaults?')) MT.revert(); } }, head, '↺ Revert');
    el('span', { class: 'tc-mut' }, head, dirty ? '● unsaved' : 'saved ✓');
    el('div', { style: 'flex:1' }, head);
    el('span', { class: 'tc-mut' }, head, 'applies on next Play');

    const grid = el('div', { style: 'flex:1;display:grid;grid-template-columns:1fr 480px;gap:0;min-height:0' }, bodyEl);
    const ctl = el('div', { style: 'overflow:auto;padding:14px 16px;display:flex;flex-direction:column;gap:18px;min-height:0' }, grid);
    const side = el('div', { style: 'border-left:1px solid var(--line);padding:14px;display:flex;flex-direction:column;gap:10px;overflow:auto' }, grid);

    // ---- baselines ----
    const sb = section(ctl, '🎲 Baseline drops', 'What a creature spills when it has no override below. Range is min–max Glimmer (inclusive); chance is the odds it drops anything at all.');
    baseRow(sb, 'Any enemy', 'enemy');
    baseRow(sb, 'Any boss', 'boss');

    // ---- per-enemy overrides ----
    const types = (G.Enemies && G.Enemies.TYPES) || [];
    const s1 = section(ctl, '☠ Per-enemy overrides', 'Tick a creature to give it its own drop. Unticked rows use the enemy baseline above.');
    overrideTable(s1, 'byType', types);

    // ---- per-boss overrides ----
    const bosses = (G.Bosses && G.Bosses.LIST) || [];
    if (bosses.length) {
      const s2 = section(ctl, '👑 Per-boss overrides', 'Tick a boss to give it its own drop. Unticked rows use the boss baseline above.');
      overrideTable(s2, 'byBoss', bosses);
    }

    // ---- simulation preview ----
    el('div', { class: 'tc-mut', style: 'align-self:flex-start' }, side, 'Roll simulation');
    const selRow = el('div', { class: 'tc-row', style: 'flex-wrap:wrap' }, side);
    el('label', {}, selRow, 'Simulate');
    const sel = el('select', { style: 'flex:1;min-width:160px' }, selRow);
    opt(sel, 'enemy', 'Enemy baseline');
    types.forEach(t => opt(sel, 'type:' + t.id, '☠ ' + (t.label || t.id) + (data.byType[t.id] ? '' : ' (baseline)')));
    opt(sel, 'boss', 'Boss baseline');
    bosses.forEach(b => opt(sel, 'boss:' + b.id, '👑 ' + (b.label || b.id) + (data.byBoss[b.id] ? '' : ' (baseline)')));
    sel.value = simKey;
    sel.addEventListener('change', () => { simKey = sel.value; draw(); });
    el('button', { class: 'tbtn', onclick: () => draw() }, selRow, '⟳ Re-roll');
    pcv = el('canvas', { width: '460', height: '170', style: 'border:1px solid var(--line);border-radius:6px;background:#0b1410;max-width:100%' }, side);
    el('div', { class: 'tc-mut', style: 'font-size:11px' }, side, 'Histogram of 4000 simulated kills — yellow bars are Glimmer amounts, the dark bar at 0 is "no drop", the dashed green line is the average.');
    draw();
  }

  // a baseline editor row: min / max / chance% + live EV
  function baseRow(parent, label, group) {
    const r = el('div', { class: 'tc-row', style: 'flex-wrap:wrap;gap:10px' }, parent);
    el('label', { style: 'min-width:80px' }, r, label);
    numCell(r, 'min', data[group].min, v => { MT.setBase(group, 'min', v); evUpd(); });
    numCell(r, 'max', data[group].max, v => { MT.setBase(group, 'max', v); evUpd(); });
    pctCell(r, 'chance', data[group].chance, v => { MT.setBase(group, 'chance', v); evUpd(); });
    const note = el('span', { class: 'tc-mut', style: 'min-width:74px;text-align:right' }, r, '');
    function evUpd() { note.textContent = 'avg ' + ev(data[group]) + ' ✦'; }
    evUpd();
  }

  function overrideTable(parent, map, list) {
    const tbl = el('div', { style: 'display:flex;flex-direction:column;gap:4px' }, parent);
    if (!list.length) { el('div', { class: 'tc-mut' }, tbl, 'none'); return; }
    list.forEach(item => {
      const id = item.id, on = !!data[map][id];
      const r = el('div', { class: 'tc-row', style: 'flex-wrap:wrap;gap:8px;opacity:' + (on ? '1' : '0.62') }, tbl);
      const cb = el('input', { type: 'checkbox' }, r); cb.checked = on;
      cb.addEventListener('change', () => MT.setOverride(map, id, cb.checked));
      el('label', { style: 'min-width:150px;flex:1' }, r, item.label || id);
      const spec = data[map][id] || baseOf(map);
      const cells = [];
      cells.push(numCell(r, 'min', spec.min, v => { MT.setEntry(map, id, 'min', v); evUpd(); }, !on));
      cells.push(numCell(r, 'max', spec.max, v => { MT.setEntry(map, id, 'max', v); evUpd(); }, !on));
      cells.push(pctCell(r, '%', spec.chance, v => { MT.setEntry(map, id, 'chance', v); evUpd(); }, !on));
      const note = el('span', { class: 'tc-mut', style: 'min-width:62px;text-align:right' }, r, '');
      function evUpd() { note.textContent = 'avg ' + ev(data[map][id] || baseOf(map)) + ' ✦'; }
      evUpd();
    });
  }

  // --- small field helpers ---
  function numCell(r, label, v, onCh, disabled) {
    el('span', { class: 'tc-mut', style: 'font-size:11px' }, r, label);
    const inp = el('input', disabled ? { type: 'number', min: '0', step: '1', style: 'width:58px', disabled: 'disabled' } : { type: 'number', min: '0', step: '1', style: 'width:58px' }, r);
    inp.value = v;
    inp.addEventListener('change', () => onCh(+inp.value || 0));
    return inp;
  }
  function pctCell(r, label, v, onCh, disabled) {
    el('span', { class: 'tc-mut', style: 'font-size:11px' }, r, label);
    const inp = el('input', disabled ? { type: 'number', min: '0', max: '100', step: '5', style: 'width:56px', disabled: 'disabled' } : { type: 'number', min: '0', max: '100', step: '5', style: 'width:56px' }, r);
    inp.value = Math.round(v * 100);
    inp.addEventListener('change', () => onCh(Math.max(0, Math.min(100, +inp.value || 0)) / 100));
    el('span', { class: 'tc-mut', style: 'font-size:11px;margin-left:-4px' }, r, '%');
    return inp;
  }
  function opt(sel, value, label) { const o = el('option', { value }, sel, label); return o; }

  function section(parent, title, desc) {
    const box = el('div', {}, parent);
    el('h3', { style: 'margin:0 0 2px;font-size:14px' }, box, title);
    if (desc) el('div', { class: 'tc-mut', style: 'margin-bottom:8px;font-size:11px;line-height:1.4' }, box, desc);
    return box;
  }

  T.registerTool({
    id: 'drops', label: 'Drop tables', icon: '🎲', group: 'Systems',
    sub: 'enemy & boss Glimmer drops',
    build(host, a) { api = a; bodyEl = host; if (!data) MT.load(); render(); }
  });
  if (T.roadmapDone) T.roadmapDone(91);
})();
