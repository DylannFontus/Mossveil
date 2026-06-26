// MOSSVEIL — tool-loadout.js : charm loadout / notch economy editor (Edit ▸ Systems).  Roadmap #90.
// Authors the rules behind the charm equipment system (src/loadout.js -> data/loadout.js): how many
// notches you start with, how many you gain per boss felled, the cap, whether overcharming one charm
// over budget is allowed, and how fragile overcharm makes you. A live curve shows the notch budget as
// you fell bosses. Edits the data overlay through the data layer; applies to the engine live and on
// next Play. Fully offline, editor-only. Defaults byte-identical to the old constants in charms.js /
// player.js.
(function () {
  const T = G.Tools, L = G.Loadout;
  if (!T || !L || !L.exportDefaults) return;
  const clone = o => JSON.parse(JSON.stringify(o));
  let data = null, dirty = false, bodyEl = null, api = null, pcv = null;

  const numBosses = () => (G.Bosses && G.Bosses.LIST) ? G.Bosses.LIST.length : 15;
  const budget = bosses => Math.min(data.notchCap, data.baseNotches + bosses * data.notchesPerBoss);

  const MT = T.loadout = {
    get state() { return { data, dirty }; },
    getWorking() { return data; },
    load() { data = clone(L.exportCurrent()); dirty = false; },
    revert() { data = clone(L.exportDefaults()); dirty = true; if (bodyEl) render(); },
    applyToEngine() { L.applyData(clone(data)); },
    async save() { await api.data.save('loadout', 'LOADOUT_DATA', data); MT.applyToEngine(); dirty = false; if (api) api.toast('Loadout rules saved'); if (bodyEl) render(); return true; },
    setInt(k, v) { data[k] = Math.max(0, Math.round(+v || 0)); if (k === 'notchCap') data.notchCap = Math.max(data.baseNotches, data.notchCap); dirty = true; if (pcv) draw(); },
    setBool(k, v) { data[k] = !!v; dirty = true; if (pcv) draw(); },
    setNum(k, v) { data[k] = Math.max(1, +v || 1); dirty = true; if (pcv) draw(); },
    budget(bosses) { return budget(bosses); },
    openInTool() { return T.openTool('loadout'); }
  };

  function draw() {
    if (!pcv) return;
    const cx = pcv.getContext('2d'), W = pcv.width, H = pcv.height, nB = numBosses();
    cx.clearRect(0, 0, W, H);
    cx.fillStyle = '#0b1410'; cx.fillRect(0, 0, W, H);
    const padL = 30, padB = 24, padT = 14, gw = W - padL - 12, gh = H - padB - padT;
    const maxY = Math.max(data.notchCap, data.baseNotches + nB * data.notchesPerBoss, 1);
    const xOf = b => padL + (nB ? (b / nB) * gw : 0);
    const yOf = n => padT + gh - (n / maxY) * gh;
    // cap line
    cx.strokeStyle = 'rgba(255,120,120,0.5)'; cx.setLineDash([4, 3]); cx.beginPath(); cx.moveTo(padL, yOf(data.notchCap)); cx.lineTo(W - 12, yOf(data.notchCap)); cx.stroke(); cx.setLineDash([]);
    cx.fillStyle = 'rgba(255,150,150,0.8)'; cx.font = '10px monospace'; cx.textBaseline = 'bottom'; cx.textAlign = 'left';
    cx.fillText('cap ' + data.notchCap, padL + 2, yOf(data.notchCap) - 1);
    // axes
    cx.strokeStyle = 'rgba(255,255,255,0.25)'; cx.beginPath(); cx.moveTo(padL, padT); cx.lineTo(padL, padT + gh); cx.lineTo(W - 12, padT + gh); cx.stroke();
    // budget curve
    cx.strokeStyle = '#9fd6ff'; cx.lineWidth = 2; cx.beginPath();
    for (let b = 0; b <= nB; b++) { const x = xOf(b), y = yOf(budget(b)); if (b === 0) cx.moveTo(x, y); else cx.lineTo(x, y); }
    cx.stroke(); cx.lineWidth = 1;
    // dots
    cx.fillStyle = '#dfe8ff'; for (let b = 0; b <= nB; b++) { cx.beginPath(); cx.arc(xOf(b), yOf(budget(b)), 2.2, 0, 7); cx.fill(); }
    // labels
    cx.fillStyle = 'rgba(220,230,210,0.7)'; cx.textBaseline = 'top'; cx.textAlign = 'left';
    cx.fillText('0', padL, padT + gh + 4);
    cx.textAlign = 'right'; cx.fillText(nB + ' bosses', W - 12, padT + gh + 4);
    cx.textAlign = 'left'; cx.fillText('notches vs bosses felled  ·  start ' + data.baseNotches + ' (+' + data.notchesPerBoss + '/boss)  ·  max ' + budget(nB), padL, padT - 12);
  }

  function el(t, a, p, x) { return api.el(t, a, p, x); }

  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column';
    const head = el('div', { style: 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line)' }, bodyEl);
    el('button', { class: 'tbtn play', onclick: () => MT.save().catch(e => api.toast('Save failed: ' + e.message)) }, head, '💾 Save');
    el('button', { class: 'tbtn', onclick: () => { if (confirm('Reset loadout rules to the built-in defaults?')) MT.revert(); } }, head, '↺ Revert');
    el('span', { class: 'tc-mut' }, head, dirty ? '● unsaved' : 'saved ✓');
    el('div', { style: 'flex:1' }, head);
    el('span', { class: 'tc-mut' }, head, 'applies on next Play');

    const grid = el('div', { style: 'flex:1;display:grid;grid-template-columns:1fr 480px;gap:0;min-height:0' }, bodyEl);
    const ctl = el('div', { style: 'overflow:auto;padding:14px 16px;display:flex;flex-direction:column;gap:18px;min-height:0;max-width:560px' }, grid);
    const side = el('div', { style: 'border-left:1px solid var(--line);padding:14px;display:flex;flex-direction:column;gap:10px;overflow:auto' }, grid);

    // ---- notch budget ----
    const s1 = section(ctl, '💠 Notch budget', 'Charms cost notches; your budget grows as you fell bosses. Start + per-boss gain, clamped to the cap.');
    intRow(s1, 'Starting notches', 'baseNotches', 0, 12);
    intRow(s1, 'Notches per boss', 'notchesPerBoss', 0, 4);
    intRow(s1, 'Notch cap', 'notchCap', 1, 20);
    const bNote = el('div', { class: 'tc-card', style: 'margin-top:4px' }, s1);

    // ---- overcharm ----
    const s2 = section(ctl, '⚡ Overcharm', 'You may equip one charm over budget (overcharm), at the cost of taking extra damage. Turn it off to forbid going over, or tune how punishing it is.');
    const ocRow = el('div', { class: 'tc-row' }, s2);
    el('label', { style: 'flex:1' }, ocRow, 'Allow overcharm');
    const ocb = el('input', { type: 'checkbox' }, ocRow); ocb.checked = data.allowOvercharm;
    ocb.addEventListener('change', () => { MT.setBool('allowOvercharm', ocb.checked); ocNote(); });
    numRow(s2, 'Overcharm damage ×', 'overcharmDamageMult', 1, 4, 0.25, () => ocNote());
    const ocCard = el('div', { class: 'tc-card', style: 'margin-top:4px' }, s2);
    function ocNote() {
      ocCard.textContent = data.allowOvercharm
        ? 'Overcharmed, a 2-damage hit deals ' + (2 * data.overcharmDamageMult) + '. (Normal: 2.)'
        : 'Overcharming is forbidden — charms must fit the budget exactly.';
    }
    ocNote();

    function refreshNotes() { bNote.textContent = 'With ' + numBosses() + ' bosses you reach ' + budget(numBosses()) + ' notches (cap ' + data.notchCap + '). A new game starts at ' + data.baseNotches + '.'; }
    refreshNotes();

    // ---- preview ----
    el('div', { class: 'tc-mut', style: 'align-self:flex-start' }, side, 'Notch progression');
    pcv = el('canvas', { width: '460', height: '170', style: 'border:1px solid var(--line);border-radius:6px;background:#0b1410;max-width:100%' }, side);
    el('div', { class: 'tc-mut', style: 'font-size:11px' }, side, 'Notch budget as you fell bosses — the blue curve, clamped at the red cap line.');
    draw();
    // keep the budget note + curve in sync as fields change
    bodyEl._refreshNotes = refreshNotes;
  }

  function intRow(p, label, key, min, max) {
    const r = el('div', { class: 'tc-row' }, p); el('label', { style: 'flex:1' }, r, label);
    const inp = el('input', { type: 'number', min: '' + min, max: '' + max, step: '1', style: 'width:72px' }, r); inp.value = data[key];
    inp.addEventListener('change', () => { MT.setInt(key, inp.value); inp.value = data[key]; if (bodyEl._refreshNotes) bodyEl._refreshNotes(); });
  }
  function numRow(p, label, key, min, max, step, after) {
    const r = el('div', { class: 'tc-row' }, p); el('label', { style: 'flex:1' }, r, label);
    const inp = el('input', { type: 'range', min: '' + min, max: '' + max, step: '' + step }, r); inp.value = data[key];
    const lbl = el('span', { class: 'tc-mut', style: 'width:42px;text-align:right' }, r, '×' + data[key]);
    inp.addEventListener('input', () => { MT.setNum(key, +inp.value); lbl.textContent = '×' + data[key]; if (after) after(); });
  }

  function section(parent, title, desc) {
    const box = el('div', {}, parent);
    el('h3', { style: 'margin:0 0 2px;font-size:14px' }, box, title);
    if (desc) el('div', { class: 'tc-mut', style: 'margin-bottom:8px;font-size:11px;line-height:1.4' }, box, desc);
    return box;
  }

  T.registerTool({
    id: 'loadout', label: 'Charm loadout & notches', icon: '💠', group: 'Systems',
    sub: 'notch budget · overcharm rules',
    build(host, a) { api = a; bodyEl = host; if (!data) MT.load(); render(); }
  });
  if (T.roadmapDone) T.roadmapDone(90);
})();
