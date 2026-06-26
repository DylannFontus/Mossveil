// MOSSVEIL — tool-synth.js : Synth preset library (Edit ▸ Audio).  Roadmap #80.
// A palette of reusable "voice" presets (each one playable synth layer) for the SFX designer. Browse,
// audition and tweak a preset, then STAMP it into any sound (▶ Send to SFX appends it as a layer and
// saves data/sfx.js), or CAPTURE an existing SFX layer back into the library. The library itself saves
// to data/synth.js (G.SYNTH_DATA). The game never reads G.Synth — sounds still play from their own
// expanded specs — so this changes nothing about how the game sounds; it only feeds the SFX editor.
(function () {
  const T = G.Tools, A = G.Audio, S = G.Synth;
  if (!T || !A || !S) return;
  const clone = o => JSON.parse(JSON.stringify(o));
  const KIND_ICON = { tone: '〜', noise: '▦', bell: '🔔' };
  // per-kind editable fields: [key, label, min, max, step]
  const FIELDS = {
    tone: [['f0', 'Pitch (Hz)', 20, 4000, 1], ['f1', 'Glide to (Hz)', 20, 4000, 1], ['t', 'Length (s)', 0.02, 2, 0.01], ['a', 'Attack (s)', 0, 1, 0.005], ['vol', 'Level', 0, 1, 0.01]],
    noise: [['f0', 'From (Hz)', 20, 8000, 10], ['f1', 'To (Hz)', 20, 8000, 10], ['t', 'Length (s)', 0.02, 2, 0.01], ['q', 'Resonance', 0.1, 8, 0.1], ['a', 'Attack (s)', 0, 1, 0.005], ['vol', 'Level', 0, 1, 0.01]],
    bell: [['f0', 'Pitch (Hz)', 20, 4000, 1], ['dur', 'Ring (s)', 0.05, 4, 0.05], ['vol', 'Level', 0, 1, 0.01]]
  };
  const FRANGE = { f0: [1, 20000], f1: [1, 20000], t: [0.01, 8], dur: [0.02, 8], a: [0, 4], q: [0.1, 20], vol: [0, 1] };
  const sfxNames = () => Object.keys((A.sfxExportCurrent() || { sfx: {} }).sfx);
  const uniqueName = base => { let n = base, i = 2; while (data.presets[n]) n = base + '-' + (i++); return n; };

  // ---------------- controller (test API: G.Tools.synth) ----------------
  let data = null, sel = null, dirty = false, bodyEl = null, api = null;
  function cur() { return sel ? data.presets[sel] : null; }

  const MT = T.synth = {
    get state() { return { data, sel, dirty }; },
    getWorking() { return data; },
    names() { return Object.keys(data.presets); },
    load() { data = clone(S.exportCurrent()); if (!data.presets) data.presets = {}; sel = MT.names()[0] || null; dirty = false; },
    revert() { data = clone(S.exportDefaults()); sel = MT.names()[0] || null; dirty = true; if (bodyEl) render(); },
    applyToEngine() { S.applyData(clone(data)); },
    async save() { await api.data.save('synth', 'SYNTH_DATA', data); MT.applyToEngine(); dirty = false; if (api) api.toast('Synth library saved · ' + MT.names().length + ' presets'); if (bodyEl) render(); return true; },
    select(n) { sel = n; if (bodyEl) render(); },
    setField(key, val) {
      const L = cur(); if (!L) return;
      const r = FRANGE[key] || [0, 1e9];
      L[key] = Math.max(r[0], Math.min(r[1], +val || 0)); dirty = true;
    },
    setType(t) { const L = cur(); if (L && L.kind === 'tone') { L.type = S.waveTypes().indexOf(t) >= 0 ? t : 'sine'; dirty = true; } },
    setFtype(t) { const L = cur(); if (L && L.kind === 'noise') { if (t === 'none') delete L.ftype; else L.ftype = S.ftypes().indexOf(t) >= 0 ? t : 'lowpass'; dirty = true; } },
    // switch a preset's kind, carrying over pitch/level into a minimal valid layer for the new kind
    setKind(kind) {
      const L = cur(); if (!L || S.kinds().indexOf(kind) < 0) return;
      const f0 = L.f0 || 440, vol = L.vol != null ? L.vol : 0.12;
      let nl;
      if (kind === 'tone') nl = { kind: 'tone', type: 'sine', f0, f1: L.f1 || f0, t: L.t || 0.2, vol };
      else if (kind === 'noise') nl = { kind: 'noise', f0, f1: L.f1 || f0 * 2, t: L.t || 0.2, vol, ftype: 'lowpass' };
      else nl = { kind: 'bell', f0, vol, dur: L.dur || (L.t || 0.8) };
      data.presets[sel] = nl; dirty = true; if (bodyEl) render();
    },
    newPreset(name) { const n = uniqueName(name || 'new-voice'); data.presets[n] = { kind: 'tone', type: 'sine', f0: 440, f1: 440, t: 0.2, vol: 0.12 }; sel = n; dirty = true; if (bodyEl) render(); return n; },
    duplicate(name) { name = name || sel; if (!data.presets[name]) return null; const n = uniqueName(name + '-copy'); data.presets[n] = clone(data.presets[name]); sel = n; dirty = true; if (bodyEl) render(); return n; },
    rename(from, to) {
      from = from || sel; to = (to || '').trim();
      if (!from || !data.presets[from] || !to || (to !== from && data.presets[to])) return false;
      if (to === from) return true;
      const out = {}; for (const k in data.presets) out[k === from ? to : k] = data.presets[k];
      data.presets = out; sel = to; dirty = true; if (bodyEl) render(); return true;
    },
    remove(name) {
      name = name || sel; if (!data.presets[name]) return false;
      if (MT.names().length <= 1) return false;          // keep the library non-empty
      delete data.presets[name]; sel = MT.names()[0] || null; dirty = true; if (bodyEl) render(); return true;
    },
    audition(name) {
      if (A.init) { try { A.init(); } catch (_) { } }
      const L = name ? data.presets[name] : cur(); if (!L) return;
      if (A.sfxPlaySpec) try { A.sfxPlaySpec([clone(L)], '__synth__'); } catch (_) { }
    },
    // pure compose (no save): append the current preset as a new layer of `sfxName`
    composeSfx(sfxName, name) {
      const L = name ? data.presets[name] : cur(); if (!L || !sfxName) return null;
      const all = clone(A.sfxExportCurrent() || { sfx: {} }); if (!all.sfx[sfxName]) return null;
      all.sfx[sfxName] = all.sfx[sfxName].concat([clone(L)]); return all;
    },
    async sendToSfx(sfxName, name) {
      const all = MT.composeSfx(sfxName, name); if (!all) return false;
      await api.data.save('sfx', 'SFX_DATA', all); if (A.sfxApplyData) A.sfxApplyData(clone(all));
      if (api) api.toast('Layer added to “' + sfxName + '”'); return true;
    },
    // capture an existing SFX layer into the library as a new preset
    captureFromSfx(sfxName, layerIdx, presetName) {
      const spec = A.sfxSpec ? A.sfxSpec(sfxName) : null; if (!spec || !spec[layerIdx]) return null;
      const L = S.cleanLayer(spec[layerIdx]); if (!L) return null;
      const n = uniqueName(presetName || (sfxName + '-' + (L.kind)));
      data.presets[n] = L; sel = n; dirty = true; if (bodyEl) render(); return n;
    },
    openInTool() { return T.openTool('synth'); }
  };

  // ---------------- UI ----------------
  function el(t, a, p, x) { return api.el(t, a, p, x); }
  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column';
    const head = el('div', { style: 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line)' }, bodyEl);
    el('button', { class: 'tbtn play', onclick: () => MT.save().catch(e => api.toast('Save failed: ' + e.message)) }, head, '💾 Save library');
    el('button', { class: 'tbtn', onclick: () => { if (confirm('Reset the whole library to the built-in starter presets? (not saved until you Save)')) MT.revert(); } }, head, '↺ Reset');
    el('span', { class: 'tc-mut' }, head, dirty ? '● unsaved' : 'saved ✓');
    el('div', { style: 'flex:1' }, head);
    el('span', { class: 'tc-mut' }, head, MT.names().length + ' preset' + (MT.names().length === 1 ? '' : 's'));

    const grid = el('div', { style: 'flex:1;display:grid;grid-template-columns:210px 1fr;gap:0;min-height:0' }, bodyEl);
    // ---- list ----
    const left = el('div', { style: 'display:flex;flex-direction:column;border-right:1px solid var(--line);min-height:0' }, grid);
    const list = el('div', { style: 'flex:1;overflow:auto;padding:8px' }, left);
    MT.names().forEach(name => {
      const L = data.presets[name];
      const row = el('div', { class: 'tc-pal-item' + (name === sel ? ' sel' : ''), style: 'display:flex;align-items:center;gap:7px;padding:5px 8px' }, list);
      el('span', { style: 'opacity:.8;width:16px;text-align:center' }, row, KIND_ICON[L.kind] || '〜');
      el('span', {}, row, name);
      el('span', { class: 'tc-mut', style: 'margin-left:auto;font-size:10px' }, row, L.kind);
      row.addEventListener('click', () => MT.select(name));
    });
    const lb = el('div', { style: 'display:flex;gap:6px;padding:6px 8px;border-top:1px solid var(--line)' }, left);
    el('button', { class: 'tbtn', style: 'flex:1', onclick: () => MT.newPreset() }, lb, '+ New');
    el('button', { class: 'tbtn', style: 'flex:1', onclick: () => MT.duplicate() }, lb, '⧉ Dup');

    // ---- editor ----
    const right = el('div', { style: 'overflow:auto;padding:14px 16px;min-height:0' }, grid);
    const L = cur();
    if (!L) { el('div', { class: 'tc-mut' }, right, 'No preset selected.'); return; }
    const titleRow = el('div', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:10px' }, right);
    el('div', { style: 'font-weight:600;font-size:15px' }, titleRow, (KIND_ICON[L.kind] || '〜') + ' ' + sel);
    el('div', { style: 'flex:1' }, titleRow);
    el('button', { class: 'tbtn', onclick: () => { const to = prompt('Rename preset', sel); if (to != null && !MT.rename(sel, to)) api.toast('Name taken or invalid'); } }, titleRow, '✎ Rename');
    el('button', { class: 'tbtn', onclick: () => { if (MT.names().length <= 1) api.toast('Keep at least one preset'); else if (confirm('Delete preset “' + sel + '”?')) MT.remove(); } }, titleRow, '🗑 Delete');

    // kind switch
    const kr = el('div', { class: 'tc-row', style: 'margin:6px 0' }, right);
    el('label', { style: 'width:90px' }, kr, 'Kind');
    const ksel = el('select', {}, kr); S.kinds().forEach(k => el('option', { value: k, selected: k === L.kind ? 'selected' : null }, ksel, k));
    ksel.value = L.kind; ksel.addEventListener('change', () => MT.setKind(ksel.value));
    // tone waveform
    if (L.kind === 'tone') {
      const wr = el('div', { class: 'tc-row', style: 'margin:6px 0' }, right);
      el('label', { style: 'width:90px' }, wr, 'Waveform');
      const wsel = el('select', {}, wr); S.waveTypes().forEach(w => el('option', { value: w }, wsel, w));
      wsel.value = L.type || 'sine'; wsel.addEventListener('change', () => { MT.setType(wsel.value); markDirty(); drawEnv(cv); });
    }
    // noise filter
    if (L.kind === 'noise') {
      const fr = el('div', { class: 'tc-row', style: 'margin:6px 0' }, right);
      el('label', { style: 'width:90px' }, fr, 'Filter');
      const fsel = el('select', {}, fr); ['none'].concat(S.ftypes()).forEach(f => el('option', { value: f }, fsel, f));
      fsel.value = L.ftype || 'none'; fsel.addEventListener('change', () => { MT.setFtype(fsel.value); markDirty(); });
    }
    // numeric fields
    (FIELDS[L.kind] || []).forEach(([key, label, min, max, step]) => {
      const r = el('div', { class: 'tc-row', style: 'margin:7px 0' }, right);
      el('label', { style: 'width:90px' }, r, label);
      const slider = el('input', { type: 'range', min: min, max: max, step: step, style: 'flex:1' }, r);
      slider.value = (L[key] != null ? L[key] : (key === 'a' ? 0 : (key === 'f1' ? L.f0 : min)));
      const out = el('span', { class: 'tc-mut', style: 'width:64px;text-align:right' }, r, fmt(key, +slider.value));
      slider.addEventListener('input', () => { MT.setField(key, slider.value); out.textContent = fmt(key, +slider.value); markDirty(); drawEnv(cv); });
    });

    // audition + envelope sketch
    const ab = el('div', { style: 'display:flex;gap:8px;margin:12px 0 6px;align-items:center' }, right);
    el('button', { class: 'tbtn play', onclick: () => MT.audition() }, ab, '▶ Audition');
    el('span', { class: 'tc-mut', style: 'font-size:11px' }, ab, pitchNote(L));
    el('div', { class: 'tc-mut', style: 'margin:8px 0 4px;font-size:11px' }, right, 'Amplitude over time (a rough sketch of the voice’s envelope).');
    const cv = el('canvas', { width: 360, height: 110, style: 'border:1px solid var(--line);border-radius:6px;background:#0d0f14;display:block' }, right);
    drawEnv(cv);

    // use-in-sounds
    el('div', { style: 'font-weight:600;margin:16px 0 6px' }, right, 'Use in sounds');
    const send = el('div', { class: 'tc-row', style: 'margin:6px 0' }, right);
    el('label', { style: 'width:90px' }, send, 'Add to');
    const ssel = el('select', { style: 'min-width:120px' }, send); sfxNames().forEach(n => el('option', { value: n }, ssel, n));
    el('button', { class: 'tbtn play', onclick: () => MT.sendToSfx(ssel.value).catch(e => api.toast('Failed: ' + e.message)) }, send, '▶ Send to SFX');
    el('span', { class: 'tc-mut', style: 'flex-basis:100%;font-size:11px;margin-left:90px' }, right, 'Appends this voice as a new layer of the chosen sound (saves the SFX library).');
    // capture
    const cap = el('div', { class: 'tc-row', style: 'margin:8px 0 2px' }, right);
    el('label', { style: 'width:90px' }, cap, 'Capture from');
    const csel = el('select', { style: 'min-width:110px' }, cap); sfxNames().forEach(n => el('option', { value: n }, csel, n));
    const lsel = el('select', { style: 'min-width:90px' }, cap);
    const fillLayers = () => { lsel.innerHTML = ''; (A.sfxSpec(csel.value) || []).forEach((ly, i) => el('option', { value: i }, lsel, '#' + (i + 1) + ' ' + ly.kind)); };
    fillLayers(); csel.addEventListener('change', fillLayers);
    el('button', { class: 'tbtn', onclick: () => { const n = MT.captureFromSfx(csel.value, +lsel.value); if (n) api.toast('Captured as “' + n + '”'); } }, cap, '⬇ Capture');
  }

  function markDirty() { const tag = bodyEl && bodyEl.querySelector('.tc-mut'); if (tag && tag.textContent.indexOf('saved') >= 0) tag.textContent = '● unsaved'; }
  function fmt(key, v) { if (key === 'vol') return Math.round(v * 100) + '%'; if (key === 't' || key === 'dur' || key === 'a') return (v * 1000 | 0) + ' ms'; if (key === 'q') return v.toFixed(1); return Math.round(v) + ''; }
  function pitchNote(L) { if (L.kind === 'bell') return L.f0 + ' Hz · rings ' + (L.dur || 0.5) + 's'; const f1 = (L.f1 != null && L.f1 !== L.f0) ? (' → ' + Math.round(L.f1) + ' Hz') : ''; return Math.round(L.f0) + ' Hz' + f1; }

  // rough amplitude envelope: attack to peak, then decay to zero over the layer's length
  function drawEnv(cv) {
    if (!cv) return;
    const g = cv.getContext('2d'), W = cv.width, H = cv.height, padB = 12, padT = 8;
    g.clearRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, H - padB); g.lineTo(W, H - padB); g.stroke();
    g.fillStyle = 'rgba(180,190,210,0.5)'; g.font = '10px system-ui'; g.fillText('time →', W - 44, H - 2);
    const L = cur(); if (!L) return;
    const total = (L.kind === 'bell' ? (L.dur || 0.5) : (L.t || 0.2));
    const atk = Math.min(total * 0.6, L.a != null ? L.a : (L.kind === 'bell' ? 0.005 : 0.006));
    const peak = Math.min(1, (L.vol != null ? L.vol : 0.1) / 0.45);     // scale so a punchy 0.45 fills the box
    const baseY = H - padB, topY = padT, X = t => (t / total) * (W - 6) + 3, Y = a => baseY - a * (baseY - topY);
    g.strokeStyle = L.kind === 'bell' ? '#e8c45d' : (L.kind === 'noise' ? '#9aa6c8' : '#5fd0c8');
    g.lineWidth = 2; g.beginPath(); g.moveTo(X(0), Y(0));
    g.lineTo(X(atk), Y(peak));
    // decay: bells ring down exponentially; tones/noise fall roughly linearly to 0
    const steps = 48;
    for (let i = 1; i <= steps; i++) { const t = atk + (total - atk) * (i / steps); const k = (i / steps); const a = L.kind === 'bell' ? peak * Math.pow(1 - k, 1.6) : peak * (1 - k); g.lineTo(X(t), Y(Math.max(0, a))); }
    g.stroke();
    // fill
    g.lineTo(X(total), Y(0)); g.lineTo(X(0), Y(0)); g.closePath();
    g.fillStyle = 'rgba(120,150,200,0.12)'; g.fill();
  }

  T.registerTool({
    id: 'synth', label: 'Synth preset library', icon: '🎹', group: 'Audio',
    sub: 'reusable voice presets to audition and stamp into sound effects',
    build(host, a) { api = a; bodyEl = host; if (!data) MT.load(); render(); }
  });
  if (T.roadmapDone) T.roadmapDone(80);
})();
