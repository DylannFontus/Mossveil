// MOSSVEIL — tool-economy.js : Glimmer economy & costs editor (Edit ▸ Systems).  Roadmap #27.
// Authors the tuning behind the Glimmer economy (src/economy.js -> data/economy.js): the vendor charm
// price multiplier (charm price = charm.cost × this), the Glimmer to forge each nail level, and how
// much Soul you keep when you die. Edits the data overlay through the data layer; applies to the
// engine live and on next Play. Fully offline, editor-only. Defaults are byte-identical to the old
// hardcoded constants in main.js.
(function () {
  const T = G.Tools, E = G.Economy;
  if (!T || !E || !E.exportDefaults) return;
  const clone = o => JSON.parse(JSON.stringify(o));
  let data = null, dirty = false, bodyEl = null, api = null;

  const MT = T.economy = {
    get state() { return { data, dirty }; },
    getWorking() { return data; },
    load() { data = clone(E.exportCurrent()); dirty = false; },
    revert() { data = clone(E.exportDefaults()); dirty = true; if (bodyEl) render(); },
    applyToEngine() { E.applyData(clone(data)); },
    async save() { await api.data.save('economy', 'ECONOMY_DATA', data); MT.applyToEngine(); dirty = false; if (api) api.toast('Economy saved'); if (bodyEl) render(); return true; },
    setField(k, v) { data[k] = v; dirty = true; },
    setNail(i, v) { data.nailCosts[i] = Math.max(0, Math.round(v)); dirty = true; },
    addNail() { const a = data.nailCosts; a.push((a[a.length - 1] || 0) + 60); dirty = true; if (bodyEl) render(); },
    removeNail() { if (data.nailCosts.length > 1) { data.nailCosts.pop(); dirty = true; if (bodyEl) render(); } },
    nailTotal() { return data.nailCosts.reduce((a, c) => a + (+c || 0), 0); },
    openInTool() { return T.openTool('economy'); }
  };

  function el(t, a, p, x) { return api.el(t, a, p, x); }

  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column';
    const head = el('div', { style: 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line)' }, bodyEl);
    el('button', { class: 'tbtn play', onclick: () => MT.save().catch(e => api.toast('Save failed: ' + e.message)) }, head, '💾 Save');
    el('button', { class: 'tbtn', onclick: () => { if (confirm('Reset the economy to the built-in defaults?')) MT.revert(); } }, head, '↺ Revert');
    el('span', { class: 'tc-mut' }, head, dirty ? '● unsaved' : 'saved ✓');
    el('div', { style: 'flex:1' }, head);
    el('span', { class: 'tc-mut' }, head, 'applies on next Play');

    const wrap = el('div', { style: 'flex:1;overflow:auto;padding:14px 16px;display:flex;flex-direction:column;gap:16px;max-width:560px' }, bodyEl);

    // ---- charm prices ----
    const s1 = section(wrap, '💠 Charm prices', 'Vendor price of a charm = its cost rating × this multiplier (in Glimmer).');
    numRow(s1, 'Price multiplier', data.charmPriceMul, 0, 400, 5, v => { MT.setField('charmPriceMul', Math.max(0, Math.round(v))); priceUpd(); });
    const priceNote = el('div', { class: 'tc-card', style: 'margin-top:6px' }, s1);
    function priceUpd() {
      const list = (G.Charms && G.Charms.LIST) || [];
      if (!list.length) { priceNote.textContent = 'No charms loaded.'; return; }
      const costs = list.map(c => c.cost || 0), mul = data.charmPriceMul;
      const cheap = list.reduce((a, b) => (b.cost || 0) < (a.cost || 0) ? b : a);
      const dear = list.reduce((a, b) => (b.cost || 0) > (a.cost || 0) ? b : a);
      priceNote.textContent = list.length + ' charms · cheapest ' + cheap.name + ' = ' + Math.round((cheap.cost || 0) * mul) + ' ✦ · priciest ' + dear.name + ' = ' + Math.round((dear.cost || 0) * mul) + ' ✦ · whole set ' + costs.reduce((a, c) => a + c, 0) * mul + ' ✦';
    }
    priceUpd();

    // ---- nail forge ----
    const s2 = section(wrap, '⚒ Nail forging', 'The nailsmith raises base nail damage. One row per forge level — set the Glimmer each costs. Add/remove rows to change how many upgrades exist.');
    const nailWrap = el('div', {}, s2);
    function renderNails() {
      nailWrap.innerHTML = '';
      data.nailCosts.forEach((c, i) => {
        const r = el('div', { class: 'tc-row' }, nailWrap);
        el('label', {}, r, 'Forge → +' + (i + 1));
        const inp = el('input', { type: 'number', min: '0', step: '10', style: 'width:90px' }, r); inp.value = c;
        inp.addEventListener('change', () => { MT.setNail(i, +inp.value || 0); inp.value = data.nailCosts[i]; totalUpd(); });
        if (i === data.nailCosts.length - 1 && data.nailCosts.length > 1) el('button', { class: 'tbtn', title: 'Remove last level', style: 'padding:1px 7px', onclick: () => MT.removeNail() }, r, '✕');
      });
      const br = el('div', { class: 'tc-row' }, nailWrap);
      el('button', { class: 'tbtn', onclick: () => MT.addNail() }, br, '+ Add forge level');
    }
    renderNails();
    const nailNote = el('div', { class: 'tc-card', style: 'margin-top:6px' }, s2);
    function totalUpd() { nailNote.textContent = data.nailCosts.length + ' upgrades · ' + MT.nailTotal() + ' ✦ to fully forge (' + data.nailCosts.join(' → ') + ').'; }
    totalUpd();

    // ---- death penalty ----
    const s3 = section(wrap, '☠ Death penalty', 'When you die you keep this fraction of your Soul (the rest is lost). Your carried Glimmer always drops to a shade at the spot you fell — destroy it to reclaim.');
    rngRow(s3, 'Soul kept on death', data.soulKeptOnDeath, 0, 1, 0.05, v => { MT.setField('soulKeptOnDeath', v); soulUpd(); }, v => Math.round(v * 100) + '%');
    const soulNote = el('div', { class: 'tc-card', style: 'margin-top:6px' }, s3);
    function soulUpd() { const ex = 60; soulNote.textContent = 'e.g. with ' + ex + ' Soul you would respawn holding ' + Math.floor(ex * data.soulKeptOnDeath) + '.'; }
    soulUpd();
  }

  function section(parent, title, desc) {
    const box = el('div', {}, parent);
    el('h3', { style: 'margin:0 0 2px;font-size:14px' }, box, title);
    if (desc) el('div', { class: 'tc-mut', style: 'margin-bottom:8px;font-size:11px;line-height:1.4' }, box, desc);
    return box;
  }
  function numRow(p, label, v, min, max, step, onCh) {
    const r = el('div', { class: 'tc-row' }, p); el('label', {}, r, label);
    const inp = el('input', { type: 'range', min, max, step }, r); inp.value = v;
    const num = el('input', { type: 'number', min, max, step, style: 'width:70px' }, r); num.value = v;
    inp.addEventListener('input', () => { num.value = inp.value; onCh(+inp.value); });
    num.addEventListener('change', () => { inp.value = num.value; onCh(+num.value); });
  }
  function rngRow(p, label, v, min, max, step, onCh, fmt) {
    const r = el('div', { class: 'tc-row' }, p); el('label', {}, r, label);
    const inp = el('input', { type: 'range', min, max, step }, r); inp.value = v;
    const lbl = el('span', { class: 'tc-mut', style: 'width:48px;text-align:right' }, r, fmt(v));
    inp.addEventListener('input', () => { const x = +(+inp.value).toFixed(2); onCh(x); lbl.textContent = fmt(x); });
  }

  T.registerTool({
    id: 'economy', label: 'Economy & costs', icon: '💰', group: 'Systems',
    sub: 'charm prices · nail forge · death penalty',
    build(host, a) { api = a; bodyEl = host; if (!data) MT.load(); render(); }
  });
  if (T.roadmapDone) T.roadmapDone(27);
})();
