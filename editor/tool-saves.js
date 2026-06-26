// MOSSVEIL — tool-saves.js : save-slot editor (Edit ▸ Systems).  Roadmap #86.
// Authors the Load Save screen (src/saves.js -> data/saves.js): how many save slots there are (1..5)
// and the wording — the place a fresh run shows, the "Moth Wings" tag, the "N bosses felled" detail,
// the empty-vessel lines, and the "rested …" prefix. A live mini-preview of the slots screen redraws
// from the working values. Edits the overlay through the data layer; applies on next Play. Defaults
// byte-identical to the old constants in main.js / ui.js.
(function () {
  const T = G.Tools, S = G.Saves;
  if (!T || !S || !S.exportDefaults) return;
  const clone = o => JSON.parse(JSON.stringify(o));
  const SERIF = 'Georgia, "Times New Roman", serif';
  const ROMAN = ['I', 'II', 'III', 'IV', 'V'];
  let data = null, dirty = false, bodyEl = null, api = null, pcv = null;

  const MT = T.saves = {
    get state() { return { data, dirty }; },
    getWorking() { return data; },
    load() { data = clone(S.exportCurrent()); dirty = false; },
    revert() { data = clone(S.exportDefaults()); dirty = true; if (bodyEl) render(); },
    applyToEngine() { S.applyData(clone(data)); },
    async save() { await api.data.save('saves', 'SAVES_DATA', data); MT.applyToEngine(); dirty = false; if (api) api.toast('Save slots saved'); if (bodyEl) render(); return true; },
    setCount(v) { data.slotCount = Math.max(1, Math.min(S.MAX_SLOTS || 5, Math.round(+v || 1))); dirty = true; if (pcv) draw(); },
    setLabel(k, v) { data.labels[k] = v; dirty = true; if (pcv) draw(); },
    openInTool() { return T.openTool('saves'); }
  };

  // a faithful-ish mini render of the Load Save screen from the working labels
  function draw() {
    if (!pcv) return;
    const cx = pcv.getContext('2d'), W = pcv.width, H = pcv.height, L = data.labels;
    cx.clearRect(0, 0, W, H);
    const bg = cx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#101a16'); bg.addColorStop(1, '#0a120e');
    cx.fillStyle = bg; cx.fillRect(0, 0, W, H);
    cx.textBaseline = 'alphabetic';
    cx.fillStyle = 'rgba(200,216,208,0.85)'; cx.font = '700 13px ' + SERIF; cx.textAlign = 'left';
    cx.fillText('LOAD SAVE', 16, 22);
    const n = data.slotCount, pad = 34, gap = 7, ch = Math.min(54, (H - pad - 12 - (n - 1) * gap) / n), bw = W - 28, x0 = 14;
    for (let i = 0; i < n; i++) {
      const y = pad + i * (ch + gap), filled = i === 0;
      cx.fillStyle = filled ? 'rgba(120,180,150,0.9)' : 'rgba(12,20,17,0.66)';
      roundRect(cx, x0, y, bw, ch, 6); cx.fill();
      if (!filled) { cx.strokeStyle = 'rgba(110,140,125,0.35)'; cx.lineWidth = 1; cx.stroke(); }
      // numeral
      cx.textAlign = 'center'; cx.textBaseline = 'middle';
      cx.fillStyle = filled ? '#06120e' : 'rgba(150,180,165,0.7)'; cx.font = '900 ' + Math.round(ch * 0.36) + 'px ' + SERIF;
      cx.fillText(ROMAN[i] || (i + 1), x0 + 26, y + ch / 2);
      cx.strokeStyle = filled ? 'rgba(6,18,14,0.3)' : 'rgba(140,170,155,0.22)'; cx.lineWidth = 1;
      cx.beginPath(); cx.moveTo(x0 + 50, y + 8); cx.lineTo(x0 + 50, y + ch - 8); cx.stroke();
      cx.textAlign = 'left'; const tx = x0 + 62;
      if (filled) {
        cx.fillStyle = '#06120e'; cx.font = '15px ' + SERIF; cx.fillText('Hollow Glade', tx, y + ch * 0.32);
        const detail = [L.wings, '2' + L.bossPlural].join('  ·  ');
        cx.fillStyle = 'rgba(6,18,14,0.72)'; cx.font = '11px ' + SERIF; cx.fillText(detail, tx, y + ch * 0.58);
        cx.fillStyle = 'rgba(6,18,14,0.6)'; cx.font = 'italic 10px ' + SERIF; cx.fillText(L.restedPrefix + '3 minutes ago', tx, y + ch * 0.82);
      } else {
        cx.fillStyle = 'rgba(150,170,160,0.6)'; cx.font = 'italic 14px ' + SERIF; cx.fillText(L.emptyTitle, tx, y + ch * 0.42);
        cx.fillStyle = 'rgba(150,180,165,0.5)'; cx.font = '11px ' + SERIF; cx.fillText(L.emptySub, tx, y + ch * 0.74);
      }
      cx.textBaseline = 'alphabetic';
    }
  }
  function roundRect(cx, x, y, w, h, r) { cx.beginPath(); cx.moveTo(x + r, y); cx.arcTo(x + w, y, x + w, y + h, r); cx.arcTo(x + w, y + h, x, y + h, r); cx.arcTo(x, y + h, x, y, r); cx.arcTo(x, y, x + w, y, r); cx.closePath(); }

  function el(t, a, p, x) { return api.el(t, a, p, x); }

  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column';
    const head = el('div', { style: 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line)' }, bodyEl);
    el('button', { class: 'tbtn play', onclick: () => MT.save().catch(e => api.toast('Save failed: ' + e.message)) }, head, '💾 Save');
    el('button', { class: 'tbtn', onclick: () => { if (confirm('Reset save-slot settings to defaults?')) MT.revert(); } }, head, '↺ Revert');
    el('span', { class: 'tc-mut' }, head, dirty ? '● unsaved' : 'saved ✓');
    el('div', { style: 'flex:1' }, head);
    el('span', { class: 'tc-mut' }, head, 'applies on next Play');

    const grid = el('div', { style: 'flex:1;display:grid;grid-template-columns:1fr 360px;gap:0;min-height:0' }, bodyEl);
    const ctl = el('div', { style: 'overflow:auto;padding:14px 16px;display:flex;flex-direction:column;gap:18px;min-height:0;max-width:560px' }, grid);
    const side = el('div', { style: 'border-left:1px solid var(--line);padding:14px;display:flex;flex-direction:column;gap:8px;overflow:auto' }, grid);

    // ---- slot count ----
    const s1 = section(ctl, '🗄 Save slots', 'How many independent saves the Load Save screen offers (1–5). Reducing the count just hides the higher slots — their data is kept, not deleted.');
    const r = el('div', { class: 'tc-row' }, s1); el('label', { style: 'flex:1' }, r, 'Number of slots');
    const sl = el('input', { type: 'range', min: '1', max: '' + (S.MAX_SLOTS || 5), step: '1' }, r); sl.value = data.slotCount;
    const lbl = el('span', { class: 'tc-mut', style: 'width:30px;text-align:right' }, r, '' + data.slotCount);
    sl.addEventListener('input', () => { MT.setCount(+sl.value); lbl.textContent = '' + data.slotCount; });

    // ---- wording ----
    const s2 = section(ctl, '✍ Slot wording', 'The text on the slots screen. The detail line reads e.g. "Moth Wings · 2 bosses felled".');
    textRow(s2, 'New-run place', 'newGamePlace', 'shown before you rest at a bench');
    textRow(s2, 'Wings tag', 'wings', '');
    textRow(s2, 'Boss felled (one)', 'bossSingular', 'note the leading space');
    textRow(s2, 'Bosses felled (many)', 'bossPlural', 'note the leading space');
    textRow(s2, 'Empty slot title', 'emptyTitle', '');
    textRow(s2, 'Empty slot subtitle', 'emptySub', '');
    textRow(s2, 'Rested prefix', 'restedPrefix', 'precedes "3 minutes ago"');

    // ---- preview ----
    el('div', { class: 'tc-mut', style: 'align-self:flex-start' }, side, 'Slots screen preview');
    pcv = el('canvas', { width: '340', height: '300', style: 'border:1px solid var(--line);border-radius:6px;max-width:100%' }, side);
    el('div', { class: 'tc-mut', style: 'font-size:11px' }, side, 'Slot I is shown as an example save; the rest as empty vessels.');
    draw();
  }

  function textRow(p, label, key, hint) {
    const r = el('div', { class: 'tc-row', style: 'flex-wrap:wrap' }, p);
    el('label', { style: 'flex:1;min-width:130px' }, r, label);
    const tx = el('input', { type: 'text', style: 'flex:1;min-width:150px;font-size:12px' }, r); tx.value = data.labels[key];
    tx.addEventListener('input', () => MT.setLabel(key, tx.value));
    if (hint) el('div', { class: 'tc-mut', style: 'flex-basis:100%;font-size:10px;margin-top:-2px' }, r, hint);
  }

  function section(parent, title, desc) {
    const box = el('div', {}, parent);
    el('h3', { style: 'margin:0 0 2px;font-size:14px' }, box, title);
    if (desc) el('div', { class: 'tc-mut', style: 'margin-bottom:8px;font-size:11px;line-height:1.4' }, box, desc);
    return box;
  }

  T.registerTool({
    id: 'saves', label: 'Save slots', icon: '🗄', group: 'Systems',
    sub: 'slot count · screen wording',
    build(host, a) { api = a; bodyEl = host; if (!data) MT.load(); render(); }
  });
  if (T.roadmapDone) T.roadmapDone(86);
})();
