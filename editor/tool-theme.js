// MOSSVEIL — tool-theme.js : Typography & Iconography editor (Edit ▸ Systems).  Roadmap #30.
// Authors the two UI font families (serif body + heavy display) and the small glyph vocabulary the
// game uses for currency and quest markers (Glimmer ✦, the filled/outline cost diamonds ◆/◇, the done
// check ✓) — src/theme.js -> data/theme.js. A live preview re-draws a sample title, body line, currency
// readout and quest rows from the working values, so you can reskin the look without launching the game.
// Edits the overlay through the data layer; applies on next Play. Offline, editor-only. Byte-identical
// defaults to the old constants in src/ui.js / world.js.
(function () {
  const T = G.Tools, Th = G.Theme;
  if (!T || !Th || !Th.exportDefaults) return;
  const clone = o => JSON.parse(JSON.stringify(o));
  let data = null, dirty = false, bodyEl = null, api = null, pcv = null;

  const MT = T.theme = {
    get state() { return { data, dirty }; },
    getWorking() { return data; },
    load() { data = clone(Th.exportCurrent()); dirty = false; },
    revert() { data = clone(Th.exportDefaults()); dirty = true; if (bodyEl) render(); },
    applyToEngine() { Th.applyData(clone(data)); },
    async save() { await api.data.save('theme', 'THEME_DATA', data); MT.applyToEngine(); dirty = false; if (api) api.toast('Typography saved'); if (bodyEl) render(); return true; },
    setFont(role, v) { data.fonts[role] = v; dirty = true; if (pcv) draw(); },
    setIcon(name, v) { data.icons[name] = v; dirty = true; if (pcv) draw(); },
    openInTool() { return T.openTool('theme'); }
  };

  function draw() {
    if (!pcv) return;
    const cx = pcv.getContext('2d'), W = pcv.width, Hh = pcv.height, f = data.fonts, ic = data.icons;
    const bg = cx.createLinearGradient(0, 0, 0, Hh); bg.addColorStop(0, '#141c18'); bg.addColorStop(1, '#0b1410');
    cx.fillStyle = bg; cx.fillRect(0, 0, W, Hh);
    cx.textBaseline = 'alphabetic'; cx.textAlign = 'left';
    // display font title
    cx.fillStyle = '#e9f3ec'; cx.font = '900 38px ' + f.display;
    cx.fillText('MOSSVEIL', 20, 52);
    // body line + currency
    cx.fillStyle = 'rgba(201,160,255,0.9)'; cx.font = '20px ' + f.body;
    cx.fillText('Glimmer  120 ' + ic.glimmer, 20, 92);
    // quest rows
    cx.fillStyle = 'rgba(255,233,176,0.92)'; cx.font = 'bold 18px ' + f.body;
    cx.fillText(ic.diamond + ' Tend the Grove', 20, 124);
    cx.fillStyle = 'rgba(140,170,150,0.85)'; cx.font = '18px ' + f.body;
    cx.fillText(ic.check + ' Light the Lantern', 20, 150);
    // shop price + charm pips
    cx.fillStyle = '#ffe28a'; cx.font = 'bold 18px ' + f.body; cx.textAlign = 'right';
    cx.fillText('240 ' + ic.diamondOutline, W - 20, 124);
    cx.fillStyle = 'rgba(200,220,190,0.85)'; cx.fillText(ic.diamond.repeat(3) + '  equipped', W - 20, 150);
  }

  function el(t, a, p, x) { return api.el(t, a, p, x); }
  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column';
    const head = el('div', { style: 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line)' }, bodyEl);
    el('button', { class: 'tbtn play', onclick: () => MT.save().catch(e => api.toast('Save failed: ' + e.message)) }, head, '💾 Save');
    el('button', { class: 'tbtn', onclick: () => { if (confirm('Reset typography & icons to defaults?')) MT.revert(); } }, head, '↺ Revert');
    el('span', { class: 'tc-mut' }, head, dirty ? '● unsaved' : 'saved ✓');
    el('div', { style: 'flex:1' }, head);
    el('span', { class: 'tc-mut' }, head, 'applies on next Play');

    const grid = el('div', { style: 'flex:1;display:grid;grid-template-columns:1fr 440px;gap:0;min-height:0' }, bodyEl);
    const ctl = el('div', { style: 'overflow:auto;padding:12px 16px;display:flex;flex-direction:column;gap:14px;min-height:0' }, grid);
    const prev = el('div', { style: 'border-left:1px solid var(--line);padding:14px;display:flex;flex-direction:column;align-items:center;gap:8px' }, grid);

    const s1 = section(ctl, '🔤 Fonts', 'CSS font-family lists. Body is the serif used for nearly all text; Display is the heavy face for menu titles.');
    textRow(s1, 'Body font', data.fonts.body, v => MT.setFont('body', v));
    textRow(s1, 'Display font', data.fonts.display, v => MT.setFont('display', v));
    const presets = el('div', { class: 'tc-row' }, s1);
    el('span', { class: 'tc-mut' }, presets, 'Body presets:');
    [['Georgia, "Times New Roman", serif', 'Serif'], ['Palatino, "Book Antiqua", serif', 'Palatino'], ['"Trebuchet MS", system-ui, sans-serif', 'Humanist'], ['"Courier New", monospace', 'Mono']].forEach(([v, lab]) =>
      el('button', { class: 'tbtn', onclick: () => { data.fonts.body = v; dirty = true; render(); } }, presets, lab));

    const s2 = section(ctl, '✦ Icons', 'Single glyphs (any character or emoji) for the currency & quest markers. Change one and it updates everywhere the game shows it.');
    iconRow(s2, 'Glimmer (currency)', 'glimmer');
    iconRow(s2, 'Cost diamond (filled)', 'diamond');
    iconRow(s2, 'Cost diamond (outline)', 'diamondOutline');
    iconRow(s2, 'Quest complete', 'check');

    function iconRow(p, label, name) {
      const r = el('div', { class: 'tc-row' }, p); el('label', {}, r, label);
      const tx = el('input', { type: 'text', maxlength: '4', style: 'width:54px;text-align:center;font-size:18px' }, r); tx.value = data.icons[name];
      tx.addEventListener('input', () => MT.setIcon(name, tx.value));
    }

    el('div', { class: 'tc-mut', style: 'align-self:flex-start' }, prev, 'Live preview');
    pcv = el('canvas', { width: '420', height: '180', style: 'border:1px solid var(--line);border-radius:6px;background:#0b1410;max-width:100%' }, prev);
    el('div', { class: 'tc-mut', style: 'font-size:11px;align-self:flex-start' }, prev, 'Title in Display font; the rest in Body, with the four icons in place.');
    draw();
  }

  function section(parent, title, desc) {
    const box = el('div', {}, parent);
    el('h3', { style: 'margin:0 0 2px;font-size:14px' }, box, title);
    if (desc) el('div', { class: 'tc-mut', style: 'margin-bottom:8px;font-size:11px;line-height:1.4' }, box, desc);
    return box;
  }
  function textRow(p, label, v, onCh) {
    const r = el('div', { class: 'tc-row' }, p); el('label', {}, r, label);
    const tx = el('input', { type: 'text', style: 'flex:1;font-size:12px' }, r); tx.value = v;
    tx.addEventListener('input', () => onCh(tx.value));
  }

  T.registerTool({
    id: 'theme', label: 'Typography & icons', icon: '🔤', group: 'Systems',
    sub: 'UI fonts · currency & quest glyphs',
    build(host, a) { api = a; bodyEl = host; if (!data) MT.load(); render(); }
  });
  if (T.roadmapDone) T.roadmapDone(30);
})();
