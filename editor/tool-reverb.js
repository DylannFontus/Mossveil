// MOSSVEIL — tool-reverb.js : the in-engine Reverb / space editor (Edit ▸ Audio).
// Authors the per-biome reverb character that used to be hard-coded in src/world.js. Each entry is
// [wet, tail-seconds, decay] — big stone halls ring, forges are dry. Saves to data/reverb.js
// (window.G.REVERB_DATA) and auditions live. Offline, editor-only.
(function () {
  const T = G.Tools, W = G.World, A = G.Audio;
  if (!T || !W || !W.exportReverbDefaults) return;
  const clone = o => JSON.parse(JSON.stringify(o));
  const FIELDS = [['Wet (mix)', 0, 1, 0.01], ['Tail (seconds)', 0.2, 5, 0.05], ['Decay', 1, 4, 0.05]];

  let data = null, sel = null, dirty = false, bodyEl = null, api = null;
  const keys = () => Object.keys(data.reverb);
  const MT = T.reverb = {
    get state() { return { data, sel, dirty }; },
    getWorking() { return data; },
    load() { data = clone(W.exportReverbCurrent()); sel = '_default'; dirty = false; },
    revert() { data = clone(W.exportReverbDefaults()); sel = '_default'; dirty = true; if (bodyEl) render(); },
    applyToEngine() { W.applyReverbData(clone(data)); },
    async save() { await api.data.save('reverb', 'REVERB_DATA', data); MT.applyToEngine(); dirty = false; if (api) api.toast('Reverb saved · ' + keys().length + ' spaces'); if (bodyEl) render(); return true; },
    select(k) { sel = k; if (bodyEl) render(); audition(); },
    addEntry(biome) { if (!biome || data.reverb[biome]) return false; data.reverb[biome] = (data.reverb[sel] || data.reverb._default).slice(); sel = biome; dirty = true; if (bodyEl) render(); return true; },
    removeEntry(k) { k = k || sel; if (k === '_default') return false; delete data.reverb[k]; if (sel === k) sel = '_default'; dirty = true; if (bodyEl) render(); return true; },
    setVal(k, idx, val) { data.reverb[k][idx] = val; dirty = true; audition(); },
    test() { if (A && A.init) { try { A.init(); } catch (_) { } } audition(); if (A && A.sfx) A.sfx('bench'); },
    openInTool() { return T.openTool('reverb'); }
  };
  function audition() { if (A && A.setReverb && data.reverb[sel]) { try { A.init && A.init(); A.setReverb(data.reverb[sel][0], data.reverb[sel][1], data.reverb[sel][2]); } catch (_) { } } }

  function el(t, a, p, x) { return api.el(t, a, p, x); }
  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column';
    const head = el('div', { style: 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line)' }, bodyEl);
    el('button', { class: 'tbtn play', onclick: () => MT.save().catch(e => api.toast('Save failed: ' + e.message)) }, head, '💾 Save reverb');
    el('button', { class: 'tbtn', onclick: () => { if (confirm('Replace all reverb spaces with the built-in defaults?')) MT.revert(); } }, head, '↺ Revert');
    el('span', { class: 'tc-mut' }, head, dirty ? '● unsaved' : 'saved ✓');
    el('div', { style: 'flex:1' }, head);
    el('button', { class: 'tbtn', onclick: () => MT.test() }, head, '🔔 Test space');
    const grid = el('div', { style: 'flex:1;display:grid;grid-template-columns:190px 1fr;gap:0;min-height:0' }, bodyEl);
    const left = el('div', { style: 'display:flex;flex-direction:column;border-right:1px solid var(--line);min-height:0' }, grid);
    const list = el('div', { style: 'flex:1;overflow:auto;padding:8px' }, left);
    keys().forEach(k => {
      const row = el('div', { class: 'tc-pal-item' + (k === sel ? ' sel' : ''), style: 'padding:5px 8px' }, list);
      el('span', {}, row, k === '_default' ? '(default)' : k);
      row.addEventListener('click', () => MT.select(k));
    });
    // add for a biome that has no entry yet
    const addRow = el('div', { style: 'display:flex;gap:4px;padding:8px;border-top:1px solid var(--line)' }, left);
    const avail = (W.BIOMES || []).filter(b => !data.reverb[b]);
    const asel = el('select', { style: 'flex:1' }, addRow);
    el('option', { value: '' }, asel, avail.length ? 'add biome…' : '(all biomes set)');
    avail.forEach(b => el('option', { value: b }, asel, b));
    el('button', { class: 'tbtn', onclick: () => { if (asel.value) MT.addEntry(asel.value); } }, addRow, '+');
    const right = el('div', { style: 'overflow:auto;padding:14px 16px;min-height:0' }, grid);
    renderEntry(right);
  }

  function renderEntry(host) {
    if (!sel || !data.reverb[sel]) { el('div', { class: 'tc-mut' }, host, 'Select a space.'); return; }
    el('div', { class: 'tc-mut', style: 'margin-bottom:10px' }, host, sel === '_default'
      ? 'The fallback reverb for any biome without its own entry.'
      : 'Reverb for the “' + sel + '” biome. Edits audition instantly — hit Test space to hear a bell ring out.');
    const v = data.reverb[sel];
    FIELDS.forEach(([label, min, max, step], i) => {
      const r = el('div', { class: 'tc-row' }, host); el('label', {}, r, label);
      const inp = el('input', { type: 'range', min, max, step }, r); inp.value = v[i];
      const lbl = el('span', { class: 'tc-mut', style: 'width:48px;text-align:right' }, r, (+v[i]).toFixed(2));
      inp.addEventListener('input', () => { const x = +inp.value; MT.setVal(sel, i, x); lbl.textContent = x.toFixed(2); });
    });
    if (sel !== '_default') el('button', { class: 'tbtn', style: 'margin-top:10px', onclick: () => MT.removeEntry() }, host, '🗑 Remove this space (use default)');
  }

  T.registerTool({
    id: 'reverb', label: 'Reverb / space', icon: '🏛', group: 'Audio',
    sub: 'per-biome reverb character with live audition',
    build(host, a) { api = a; bodyEl = host; if (!data) MT.load(); render(); }
  });
  if (T.roadmapDone) T.roadmapDone(6);
})();
