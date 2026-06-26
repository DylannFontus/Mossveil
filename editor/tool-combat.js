// MOSSVEIL — tool-combat.js : Combat stem (Edit ▸ Audio).  Roadmap #81.
// Authors the classic-style combat groove — the consonant pad bed + driving arpeggio + kick + hat that
// swell with on-screen danger (the live "intensity"). Externalised into audio.js's DEFAULT_COMBAT ->
// data/combat.js (G.COMBAT_DATA). The groove is only audible in the 'classic' soundtrack style (the
// composed score doesn't use it), and a default overlay is byte-identical, so the score and every
// transition are untouched. Audition flips to classic style + drives the engine so you HEAR the stem.
(function () {
  const T = G.Tools, A = G.Audio;
  if (!T || !A || !A.combatExportCurrent) return;
  const clone = o => JSON.parse(JSON.stringify(o));
  const perf = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  // [path, label, min, max, step] grouped into sections
  const SECTIONS = [
    ['Mix & dynamics', [['busLevel', 'Stem level', 0, 0.6, 0.01], ['gate', 'Danger gate', 0, 0.5, 0.01]]],
    ['Tempo', [['stepSlow', 'Step · calm (s)', 0.06, 0.5, 0.005], ['stepFast', 'Step · intense (s)', 0.04, 0.4, 0.005]]],
    ['Pad bed', [['pad.level', 'Level', 0, 0.6, 0.01], ['pad.cutoff', 'Tone (Hz)', 200, 4000, 10], ['pad.q', 'Resonance', 0.1, 4, 0.1], ['pad.rootMult', 'Root ×', 0.25, 2, 0.05], ['pad.fifthMult', 'Fifth ×', 0.25, 2, 0.05]]],
    ['Arpeggio', [['arp.t', 'Note length (s)', 0.04, 0.4, 0.01], ['arp.volBase', 'Level · base', 0, 0.4, 0.005], ['arp.volInt', 'Level · +danger', 0, 0.4, 0.005], ['arp.attack', 'Attack (s)', 0, 0.05, 0.001]]],
    ['Kick', [['kick.every', 'Every N steps', 1, 8, 1], ['kick.f0', 'Pitch (Hz)', 40, 400, 1], ['kick.f1', 'Drop to (Hz)', 20, 300, 1], ['kick.t', 'Length (s)', 0.04, 0.4, 0.01], ['kick.volBase', 'Level · base', 0, 0.4, 0.005], ['kick.volInt', 'Level · +danger', 0, 0.4, 0.005]]],
    ['Hat', [['hat.f0', 'From (Hz)', 1000, 8000, 50], ['hat.f1', 'To (Hz)', 1000, 10000, 50], ['hat.t', 'Length (s)', 0.01, 0.2, 0.005], ['hat.volBase', 'Level · base', 0, 0.2, 0.005], ['hat.volInt', 'Level · +danger', 0, 0.2, 0.005], ['hat.q', 'Resonance', 0.1, 4, 0.1]]]
  ];
  const RANGE = {}; SECTIONS.forEach(([, rows]) => rows.forEach(r => RANGE[r[0]] = [r[2], r[3]]));
  const getP = (o, p) => p.split('.').reduce((a, k) => a && a[k], o);
  function setP(o, p, v) { const ks = p.split('.'), last = ks.pop(); let t = o; ks.forEach(k => t = t[k]); t[last] = v; }

  // ---------------- controller (test API: G.Tools.combat) ----------------
  let data = null, dirty = false, bodyEl = null, api = null, audIntensity = 0.85;
  let audLoop = false, audEnd = 0, audPrevStyle = null, prevCv = null;

  const MT = T.combat = {
    get state() { return { data, dirty, audIntensity }; },
    getWorking() { return data; },
    load() { data = clone(A.combatExportCurrent()); dirty = false; },
    revert() { data = clone(A.combatExportDefaults()); dirty = true; if (bodyEl) render(); },
    applyToEngine() { A.combatApplyData(clone(data)); },
    async save() { await api.data.save('combat', 'COMBAT_DATA', data); MT.applyToEngine(); dirty = false; if (api) api.toast('Combat stem saved'); if (bodyEl) render(); return true; },
    setField(path, val) {
      const r = RANGE[path] || [0, 1e9];
      let v = Math.max(r[0], Math.min(r[1], +val || 0));
      if (path === 'kick.every') v = Math.max(1, Math.round(v));
      setP(data, path, v); dirty = true;
    },
    setType(group, val) { const g = data[group]; if (g) { g.type = val; dirty = true; } },
    setPattern(spec) {
      const arr = (Array.isArray(spec) ? spec : String(spec).split(/[,\s]+/)).map(Number).filter(n => isFinite(n) && n > 0);
      if (arr.length) { data.arp.pattern = arr; dirty = true; }
      return data.arp.pattern;
    },
    setAudIntensity(v) { audIntensity = Math.max(0, Math.min(1, +v || 0)); },
    // audition: flip to classic style, push the working stem live, ramp danger up and run the engine
    audition() {
      if (A.init) { try { A.init(); } catch (_) { } }
      if (audPrevStyle == null && A.musicStyle) audPrevStyle = A.musicStyle();
      if (A.setMusicStyle) A.setMusicStyle('classic');
      MT.applyToEngine();
      if (A.setIntensity) A.setIntensity(audIntensity);
      audEnd = perf() + 4200; startAudLoop();
    },
    stopAudition() {
      if (A.setIntensity) A.setIntensity(0);
      if (audPrevStyle != null && A.setMusicStyle) { A.setMusicStyle(audPrevStyle); audPrevStyle = null; }
      audLoop = false;
    },
    openInTool() { return T.openTool('combat'); }
  };

  function startAudLoop() {
    if (audLoop) return; audLoop = true;
    let last = perf();
    const tick = () => {
      const now = perf(); const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!bodyEl || !document.body.contains(bodyEl) || now > audEnd) { MT.stopAudition(); return; }
      if (A.update) try { A.update(dt); } catch (_) { }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // ---------------- UI ----------------
  function el(t, a, p, x) { return api.el(t, a, p, x); }
  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column';
    const head = el('div', { style: 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line)' }, bodyEl);
    el('button', { class: 'tbtn play', onclick: () => MT.save().catch(e => api.toast('Save failed: ' + e.message)) }, head, '💾 Save');
    el('button', { class: 'tbtn', onclick: () => { if (confirm('Reset the combat stem to its defaults? (not saved until you Save)')) MT.revert(); } }, head, '↺ Reset');
    el('span', { class: 'tc-mut' }, head, dirty ? '● unsaved' : 'saved ✓');
    el('div', { style: 'flex:1' }, head);
    el('span', { class: 'tc-mut', style: 'font-size:11px' }, head, 'classic-style only · score is untouched');

    const grid = el('div', { style: 'flex:1;display:grid;grid-template-columns:1fr 380px;gap:0;min-height:0' }, bodyEl);
    // ---- left: parameter sections ----
    const left = el('div', { style: 'overflow:auto;padding:12px 16px;min-height:0' }, grid);
    el('div', { class: 'tc-mut', style: 'margin-bottom:10px;font-size:12px;max-width:560px' }, left,
      'The driving groove that fades in as danger rises, in the “classic” soundtrack. “+danger” values are added on top as intensity climbs to full. The composed score doesn’t use this stem, so changing it never affects normal play.');
    SECTIONS.forEach(([title, rows]) => {
      el('div', { style: 'font-weight:600;margin:14px 0 4px' }, left, title);
      // type selectors for pad/arp/kick
      const grp = rows[0][0].split('.')[0];
      if (grp === 'pad' || (title === 'Arpeggio')) typeRow(left, grp === 'pad' ? 'pad' : 'arp');
      if (title === 'Kick') typeRow(left, 'kick');
      rows.forEach(([path, label, min, max, step]) => {
        const r = el('div', { class: 'tc-row', style: 'margin:5px 0' }, left);
        el('label', { style: 'width:130px' }, r, label);
        const sld = el('input', { type: 'range', min: min, max: max, step: step, style: 'flex:1' }, r);
        sld.value = getP(data, path);
        const out = el('span', { class: 'tc-mut', style: 'width:66px;text-align:right' }, r, fmt(path, +sld.value));
        sld.addEventListener('input', () => { MT.setField(path, sld.value); out.textContent = fmt(path, getP(data, path)); markDirty(); drawSeq(); });
      });
      if (title === 'Arpeggio') {
        const r = el('div', { class: 'tc-row', style: 'margin:6px 0' }, left);
        el('label', { style: 'width:130px' }, r, 'Pattern (× root)');
        const inp = el('input', { type: 'text', style: 'flex:1', value: data.arp.pattern.join(', ') }, r);
        inp.addEventListener('change', () => { const p = MT.setPattern(inp.value); inp.value = p.join(', '); markDirty(); drawSeq(); });
        el('span', { class: 'tc-mut', style: 'flex-basis:100%;font-size:11px;margin-left:130px' }, left, 'Note pitches as multiples of the room root (1 = root, 1.5 = fifth, 2 = octave).');
      }
    });

    // ---- right: audition + sequencer preview (sticky) ----
    const right = el('div', { style: 'border-left:1px solid var(--line);padding:14px 14px;overflow:auto;min-height:0' }, grid);
    el('div', { style: 'font-weight:600;font-size:15px;margin-bottom:8px' }, right, '🥁 Combat stem');
    const ir = el('div', { class: 'tc-row', style: 'margin:6px 0' }, right);
    el('label', { style: 'width:80px' }, ir, 'Danger');
    const isl = el('input', { type: 'range', min: 0, max: 1, step: 0.01, style: 'flex:1' }, ir); isl.value = audIntensity;
    const iout = el('span', { class: 'tc-mut', style: 'width:46px;text-align:right' }, ir, Math.round(audIntensity * 100) + '%');
    isl.addEventListener('input', () => { MT.setAudIntensity(isl.value); iout.textContent = Math.round(audIntensity * 100) + '%'; drawSeq(); });
    const ab = el('div', { style: 'display:flex;gap:8px;margin:8px 0 10px' }, right);
    el('button', { class: 'tbtn play', onclick: () => MT.audition() }, ab, '▶ Audition');
    el('button', { class: 'tbtn', onclick: () => MT.stopAudition() }, ab, '⏹ Stop');
    el('span', { class: 'tc-mut', style: 'align-self:center;font-size:11px' }, ab, 'plays the stem at the danger above');
    el('div', { class: 'tc-mut', style: 'margin:6px 0 4px;font-size:11px' }, right, 'One bar of the groove at this danger level — arp pitch as bars, ● kick, ○ hat. Step spacing reflects the tempo.');
    prevCv = el('canvas', { width: 350, height: 170, style: 'border:1px solid var(--line);border-radius:6px;background:#0d0f14;display:block' }, right);
    drawSeq();
    const note = el('div', { class: 'tc-mut combatnote', style: 'margin-top:8px;font-size:11px' }, right, '');
    updateNote(note);
  }

  function typeRow(parent, group) {
    const r = el('div', { class: 'tc-row', style: 'margin:5px 0' }, parent);
    el('label', { style: 'width:130px' }, r, group === 'pad' ? 'Pad wave' : (group === 'arp' ? 'Arp wave' : 'Kick wave'));
    const sel = el('select', {}, r);
    ['sine', 'square', 'triangle', 'sawtooth'].forEach(w => el('option', { value: w }, sel, w));
    sel.value = data[group].type; sel.addEventListener('change', () => { MT.setType(group, sel.value); markDirty(); drawSeq(); });
  }

  function markDirty() { const tag = bodyEl && bodyEl.querySelector('.tc-mut'); if (tag && tag.textContent.indexOf('saved') >= 0) tag.textContent = '● unsaved'; }
  function fmt(path, v) {
    if (/vol|level|gate/i.test(path) || path === 'busLevel') return Math.round(v * 100) + '%';
    if (/\.t$|step|attack|\bt\b/.test(path) || path.endsWith('.t')) return (v * 1000 | 0) + ' ms';
    if (path === 'kick.every') return v + '';
    if (path.endsWith('Mult') || path.endsWith('.q')) return (+v).toFixed(2);
    return Math.round(v) + '';
  }
  function updateNote(node) {
    if (!node) return;
    const c = data, inten = audIntensity;
    const interval = c.stepSlow - inten * (c.stepSlow - c.stepFast);
    node.textContent = 'At ' + Math.round(inten * 100) + '% danger: step every ' + (interval * 1000 | 0) + ' ms · stem at ' + Math.round(inten * c.busLevel * 100) + '% · ' + (inten > c.gate ? 'groove ON' : 'below the gate (silent)');
  }

  // step-sequencer sketch: arp pitch bars + kick/hat markers, spaced by the tempo at this danger
  function drawSeq() {
    if (!prevCv) return;
    const g = prevCv.getContext('2d'), W = prevCv.width, H = prevCv.height, padB = 30, padT = 16;
    g.clearRect(0, 0, W, H);
    const c = data, inten = audIntensity, pat = c.arp.pattern, N = Math.min(16, pat.length * 2);
    const maxNote = Math.max.apply(null, pat.concat([1]));
    const baseY = H - padB, topY = padT, bw = (W - 12) / N;
    g.strokeStyle = 'rgba(255,255,255,0.07)'; g.beginPath(); g.moveTo(0, baseY); g.lineTo(W, baseY); g.stroke();
    g.font = '10px system-ui';
    for (let i = 0; i < N; i++) {
      const x = 6 + i * bw, note = pat[i % pat.length];
      const on = inten > c.gate;
      const h = (note / maxNote) * (baseY - topY);
      g.fillStyle = on ? 'hsl(' + (180 - (note / maxNote) * 120) + ',65%,55%)' : 'rgba(150,160,180,0.25)';
      g.fillRect(x + 1, baseY - h, Math.max(2, bw - 3), h);
      // kick / hat row
      const my = baseY + 12;
      if (i % c.kick.every === 0) { g.fillStyle = on ? '#e8636b' : 'rgba(232,99,107,0.3)'; g.beginPath(); g.arc(x + bw / 2, my, 4, 0, 7); g.fill(); }
      else if (i % 2 === 1) { g.strokeStyle = on ? '#6fc7e8' : 'rgba(111,199,232,0.3)'; g.lineWidth = 1.5; g.beginPath(); g.arc(x + bw / 2, my, 3.5, 0, 7); g.stroke(); }
    }
    g.fillStyle = 'rgba(180,190,210,0.5)'; g.fillText('● kick', 6, H - 4); g.fillText('○ hat', 56, H - 4);
    if (inten <= c.gate) { g.fillStyle = 'rgba(180,190,210,0.6)'; g.fillText('below danger gate — silent', W / 2 - 70, topY + 6); }
    const noteEl = bodyEl && bodyEl.querySelector('.tc-mut.combatnote'); if (noteEl) updateNote(noteEl);
  }

  T.registerTool({
    id: 'combat', label: 'Combat stem', icon: '🥁', group: 'Audio',
    sub: 'the classic-style battle groove that swells with danger',
    build(host, a) { api = a; bodyEl = host; if (!data) MT.load(); render(); }
  });
  if (T.roadmapDone) T.roadmapDone(81);
})();
