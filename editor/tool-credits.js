// MOSSVEIL — tool-credits.js : ending / credits roll editor (Edit ▸ Systems).  Roadmap #94.
// Authors the credits screen the game fades to when it's finished (src/credits.js -> data/credits.js):
// the lines of text with their sizes & fade-in delays, the colours, the layout, and how long the roll
// holds before a key returns to play. A scrubbable live preview replays the fade so you can time it
// without finishing the game. Edits the overlay through the data layer; applies on next Play. Defaults
// byte-identical to the old hardcoded roll in ui.js / main.js.
(function () {
  const T = G.Tools, C = G.Credits;
  if (!T || !C || !C.exportDefaults) return;
  const clone = o => JSON.parse(JSON.stringify(o));
  const SERIF = 'Georgia, "Times New Roman", serif';
  let data = null, dirty = false, bodyEl = null, api = null, pcv = null, scrubT = 2.0;

  const rgb = h => /^#[0-9a-fA-F]{6}$/.test(h) ? (parseInt(h.slice(1, 3), 16) + ',' + parseInt(h.slice(3, 5), 16) + ',' + parseInt(h.slice(5, 7), 16)) : '240,248,244';

  const MT = T.credits = {
    get state() { return { data, dirty }; },
    getWorking() { return data; },
    load() { data = clone(C.exportCurrent()); dirty = false; },
    revert() { data = clone(C.exportDefaults()); dirty = true; if (bodyEl) render(); },
    applyToEngine() { C.applyData(clone(data)); },
    async save() { await api.data.save('credits', 'CREDITS_DATA', data); MT.applyToEngine(); dirty = false; if (api) api.toast('Credits saved'); if (bodyEl) render(); return true; },
    setStyle(k, v) { data[k] = v; dirty = true; if (pcv) draw(); },
    setLine(i, field, v) { if (data.lines[i]) { data.lines[i][field] = v; dirty = true; if (pcv) draw(); } },
    addLine() { data.lines.push({ text: 'New line', size: 16, delay: 0, italic: true }); dirty = true; if (bodyEl) render(); },
    removeLine(i) { if (data.lines[i]) { data.lines.splice(i, 1); dirty = true; if (bodyEl) render(); } },
    moveLine(i, dir) { const a = data.lines, j = i + dir; if (a[i] && a[j]) { const t = a[i]; a[i] = a[j]; a[j] = t; dirty = true; if (bodyEl) render(); } },
    maxDelay() { return data.lines.reduce((m, l) => Math.max(m, l.delay || 0), 0); },
    openInTool() { return T.openTool('credits'); }
  };

  // re-implements ui.js drawEnding() from the working values, scaled to fit the preview
  function draw() {
    if (!pcv) return;
    const cx = pcv.getContext('2d'), W = pcv.width, H = pcv.height, t = scrubT, sc = 0.6;
    cx.clearRect(0, 0, W, H);
    cx.fillStyle = '#0b1410'; cx.fillRect(0, 0, W, H);                    // dark base so the wash reads
    cx.fillStyle = 'rgba(' + rgb(data.bg) + ',' + Math.min(0.92, t * 0.8) + ')'; cx.fillRect(0, 0, W, H);
    cx.textAlign = 'center';
    let y = H * data.startY;
    for (const ln of data.lines) {
      const a = Math.max(0, Math.min(1, (t - (ln.delay || 0)) / 0.8));
      cx.globalAlpha = a;
      cx.fillStyle = data.textColor;
      cx.font = (ln.italic ? 'italic ' : '') + Math.max(6, Math.round(ln.size * sc)) + 'px ' + SERIF;
      cx.fillText(ln.text, W / 2, y);
      y += ln.size * sc + data.lineGap * sc;
    }
    cx.globalAlpha = 1;
  }

  function el(t, a, p, x) { return api.el(t, a, p, x); }

  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column';
    const head = el('div', { style: 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line)' }, bodyEl);
    el('button', { class: 'tbtn play', onclick: () => MT.save().catch(e => api.toast('Save failed: ' + e.message)) }, head, '💾 Save');
    el('button', { class: 'tbtn', onclick: () => { if (confirm('Reset the credits to the built-in defaults?')) MT.revert(); } }, head, '↺ Revert');
    el('span', { class: 'tc-mut' }, head, dirty ? '● unsaved' : 'saved ✓');
    el('div', { style: 'flex:1' }, head);
    el('span', { class: 'tc-mut' }, head, 'applies on next Play');

    const grid = el('div', { style: 'flex:1;display:grid;grid-template-columns:1fr 440px;gap:0;min-height:0' }, bodyEl);
    const ctl = el('div', { style: 'overflow:auto;padding:14px 16px;display:flex;flex-direction:column;gap:18px;min-height:0' }, grid);
    const side = el('div', { style: 'border-left:1px solid var(--line);padding:14px;display:flex;flex-direction:column;gap:8px;overflow:auto' }, grid);

    // ---- lines ----
    const s1 = section(ctl, '📜 Roll lines', 'Each line fades in after its delay (seconds). Size is the font size in px; tick italic for the flowing style. Reorder with ↑↓.');
    const list = el('div', { style: 'display:flex;flex-direction:column;gap:6px' }, s1);
    data.lines.forEach((ln, i) => lineRow(list, ln, i));
    el('button', { class: 'tbtn', style: 'margin-top:6px;align-self:flex-start', onclick: () => MT.addLine() }, s1, '+ Add line');

    // ---- style ----
    const s2 = section(ctl, '🎨 Style & layout', 'The pale wash that fades over the screen, the text colour, where the block starts, and the gap between lines.');
    colorRow(s2, 'Background wash', 'bg');
    colorRow(s2, 'Text colour', 'textColor');
    rangeRow(s2, 'Start height', 'startY', 0, 1, 0.02, v => Math.round(v * 100) + '%');
    numRow(s2, 'Line gap (px)', 'lineGap', 0, 80, 1);

    // ---- timing ----
    const s3 = section(ctl, '⏱ Timing', 'How long the roll holds before any key returns the player to the world.');
    numRow(s3, 'Hold before dismiss (s)', 'dismissAfter', 0, 20, 0.5);

    // ---- preview ----
    el('div', { class: 'tc-mut', style: 'align-self:flex-start' }, side, 'Live preview');
    pcv = el('canvas', { width: '420', height: '300', style: 'border:1px solid var(--line);border-radius:6px;background:#0b1410;max-width:100%' }, side);
    const scr = el('div', { class: 'tc-row' }, side);
    el('label', {}, scr, 'Scrub');
    const sl = el('input', { type: 'range', min: '0', max: '' + (MT.maxDelay() + 2).toFixed(1), step: '0.1', style: 'flex:1' }, scr); sl.value = scrubT;
    const tl = el('span', { class: 'tc-mut', style: 'width:42px;text-align:right' }, scr, scrubT.toFixed(1) + 's');
    sl.addEventListener('input', () => { scrubT = +sl.value; tl.textContent = scrubT.toFixed(1) + 's'; draw(); });
    el('div', { class: 'tc-mut', style: 'font-size:11px' }, side, 'Drag Scrub to replay the fade-in. Lines appear at their delay; the wash deepens over the first ~1.1s.');
    draw();
  }

  function lineRow(parent, ln, i) {
    const r = el('div', { class: 'tc-row', style: 'flex-wrap:wrap;gap:6px' }, parent);
    el('button', { class: 'tbtn', style: 'padding:1px 6px', title: 'Move up', onclick: () => MT.moveLine(i, -1) }, r, '↑');
    el('button', { class: 'tbtn', style: 'padding:1px 6px', title: 'Move down', onclick: () => MT.moveLine(i, 1) }, r, '↓');
    const tx = el('input', { type: 'text', style: 'flex:1;min-width:140px;font-size:12px', placeholder: '(blank spacer)' }, r); tx.value = ln.text;
    tx.addEventListener('input', () => MT.setLine(i, 'text', tx.value));
    el('span', { class: 'tc-mut', style: 'font-size:10px' }, r, 'sz');
    const sz = el('input', { type: 'number', min: '1', max: '120', step: '1', style: 'width:50px' }, r); sz.value = ln.size;
    sz.addEventListener('change', () => MT.setLine(i, 'size', Math.max(1, Math.round(+sz.value || 1))));
    el('span', { class: 'tc-mut', style: 'font-size:10px' }, r, 'delay');
    const dl = el('input', { type: 'number', min: '0', step: '0.1', style: 'width:54px' }, r); dl.value = ln.delay;
    dl.addEventListener('change', () => MT.setLine(i, 'delay', Math.max(0, +dl.value || 0)));
    const it = el('input', { type: 'checkbox', title: 'Italic' }, r); it.checked = !!ln.italic;
    it.addEventListener('change', () => MT.setLine(i, 'italic', it.checked));
    el('span', { class: 'tc-mut', style: 'font-size:10px' }, r, 'i');
    el('button', { class: 'tbtn', style: 'padding:1px 6px', title: 'Remove', onclick: () => MT.removeLine(i) }, r, '✕');
  }

  function colorRow(p, label, key) {
    const r = el('div', { class: 'tc-row' }, p); el('label', { style: 'flex:1' }, r, label);
    const inp = el('input', { type: 'color' }, r); inp.value = data[key];
    inp.addEventListener('input', () => MT.setStyle(key, inp.value));
  }
  function rangeRow(p, label, key, min, max, step, fmt) {
    const r = el('div', { class: 'tc-row' }, p); el('label', { style: 'flex:1' }, r, label);
    const inp = el('input', { type: 'range', min: '' + min, max: '' + max, step: '' + step }, r); inp.value = data[key];
    const lbl = el('span', { class: 'tc-mut', style: 'width:42px;text-align:right' }, r, fmt(data[key]));
    inp.addEventListener('input', () => { const v = +(+inp.value).toFixed(2); MT.setStyle(key, v); lbl.textContent = fmt(v); });
  }
  function numRow(p, label, key, min, max, step) {
    const r = el('div', { class: 'tc-row' }, p); el('label', { style: 'flex:1' }, r, label);
    const inp = el('input', { type: 'number', min: '' + min, max: '' + max, step: '' + step, style: 'width:72px' }, r); inp.value = data[key];
    inp.addEventListener('change', () => { MT.setStyle(key, Math.max(min, +inp.value || 0)); inp.value = data[key]; });
  }

  function section(parent, title, desc) {
    const box = el('div', {}, parent);
    el('h3', { style: 'margin:0 0 2px;font-size:14px' }, box, title);
    if (desc) el('div', { class: 'tc-mut', style: 'margin-bottom:8px;font-size:11px;line-height:1.4' }, box, desc);
    return box;
  }

  T.registerTool({
    id: 'credits', label: 'Ending / credits', icon: '📜', group: 'Systems',
    sub: 'final roll · text · timing',
    build(host, a) { api = a; bodyEl = host; if (!data) MT.load(); render(); }
  });
  if (T.roadmapDone) T.roadmapDone(94);
})();
