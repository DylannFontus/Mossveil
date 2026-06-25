// MOSSVEIL — tool-music.js : the in-engine Music / Soundtrack editor (Edit ▸ Audio).
// Authors the composed adaptive score that used to be hard-coded in src/music.js:
//   • Soundtracks    — add / duplicate / rename / delete tracks; edit tempo, key, scale,
//                      chord progression, pad & bass waveform, filter cutoffs and drum weight
//                      (this IS the per-track mixer, roadmap #2)
//   • Live preview   — audition any track, sweep Exploration → Combat intensity to hear both
//                      the calm bed and the dread battle engine (#2 combat curve)
//   • Adaptive rules — the biome → track map that "Auto" music uses per room (roadmap #3)
// Saves to data/music.js (window.G.MUSIC); the game reads that as the source of truth, so the
// soundtrack can be edited forever without code. Fully offline, editor-only.
(function () {
  const T = G.Tools, M = G.Music;
  if (!T || !M) return;
  const clone = o => JSON.parse(JSON.stringify(o));
  const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
  function noteName(hz) { if (!hz) return ''; const m = Math.round(69 + 12 * Math.log2(hz / 440)); return NOTES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1); }
  const DEFAULT_TRACK = { bpm: 90, root: 146.8, scale: 'MIN', prog: [0, 5, 3, 4], pad: 'sawtooth', padCut: 800, bass: 'sine', leadCut: 2000, drums: 0.4 };

  // ---------------- controller (also the test API: G.Tools.music) ----------------
  let data = null, selId = null, dirty = false;
  let previewing = false, loopOn = false, curIntensity = 0;
  let bodyEl = null, api = null, subTab = 'tracks';
  const firstId = () => Object.keys(data.tracks).filter(id => id !== 'boss')[0] || Object.keys(data.tracks)[0] || null;

  const MT = T.music = {
    get state() { return { data, selId, dirty, previewing, curIntensity }; },
    getWorking() { return data; },
    load() { data = clone(M.exportCurrent()); selId = firstId(); dirty = false; },
    revert() { data = clone(M.exportDefaults()); selId = firstId(); dirty = true; if (bodyEl) render(); },
    applyToEngine() { M.applyData(clone(data)); },
    async save() {
      await api.data.save('music', 'MUSIC', data);
      MT.applyToEngine(); dirty = false;
      if (api && api.toast) api.toast('Soundtrack saved · ' + Object.keys(data.tracks).length + ' tracks');
      if (bodyEl) render();
      return true;
    },
    select(id) { if (data.tracks[id]) { selId = id; if (bodyEl) render(); } },
    uniqueId(base) { base = (base || 'track').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'track'; let id = base, i = 1; while (data.tracks[id]) id = base + (++i); return id; },
    addTrack(src) {
      const id = MT.uniqueId('custom');
      data.tracks[id] = clone((src && data.tracks[src]) || data.tracks[selId] || DEFAULT_TRACK);
      selId = id; dirty = true; if (bodyEl) render(); return id;
    },
    duplicateTrack(id) { return MT.addTrack(id || selId); },
    removeTrack(id) {
      id = id || selId;
      if (id === 'boss') return false;                                  // boss theme is required
      if (Object.keys(data.tracks).filter(k => k !== 'boss').length <= 1) return false;
      delete data.tracks[id];
      for (const b in data.biome) if (data.biome[b] === id) delete data.biome[b];   // drop dangling rules
      if (selId === id) selId = firstId();
      dirty = true; if (bodyEl) render(); return true;
    },
    renameTrack(id, newId) {
      newId = (newId || '').trim();
      if (!newId || newId === id) return false;
      if (data.tracks[newId]) return false;
      data.tracks[newId] = data.tracks[id]; delete data.tracks[id];
      for (const b in data.biome) if (data.biome[b] === id) data.biome[b] = newId;
      if (selId === id) selId = newId;
      dirty = true; return true;
    },
    setField(id, key, val) {
      const t = data.tracks[id]; if (!t) return;
      if (key === 'prog') t.prog = val.slice();
      else t[key] = val;
      dirty = true;
      if (previewing && id === selId) MT.rearm();
    },
    rearm() { if (previewing && data.tracks[selId]) M.previewDef(data.tracks[selId], curIntensity); },
    // adaptive rules (biome -> track)
    biomeSet(biome, track) { data.biome[biome] = track; dirty = true; },
    biomeRename(oldB, newB) { if (!newB || data.biome[newB]) return false; data.biome[newB] = data.biome[oldB]; delete data.biome[oldB]; dirty = true; return true; },
    biomeDel(biome) { delete data.biome[biome]; dirty = true; },
    biomeAdd() { let b = 'biome', i = 1; while (data.biome[b]) b = 'biome' + (++i); data.biome[b] = selId || firstId(); dirty = true; if (bodyEl) render(); },
    // preview transport
    previewOn() {
      if (G.Audio && G.Audio.init) { try { G.Audio.init(); } catch (_) { } }
      previewing = true; MT.rearm(); startLoop();
    },
    previewOff() { previewing = false; if (M.stopPreview) M.stopPreview(); },
    setIntensity(v) { curIntensity = Math.max(0, Math.min(1, v)); if (previewing && M.previewIntensity) M.previewIntensity(curIntensity); },
    openInTool() { return T.openTool('music'); }
  };

  function startLoop() {
    if (loopOn) return; loopOn = true;
    const tick = () => {
      const ov = document.getElementById('toolHost');
      if (!ov || !ov.classList.contains('on')) { MT.previewOff(); loopOn = false; return; }  // tool closed -> stop
      if (previewing && M.update) M.update();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // ---------------- UI ----------------
  function el(tag, attrs, parent, text) { return api.el(tag, attrs, parent, text); }
  function trackIds(includeBoss) { return Object.keys(data.tracks).filter(id => includeBoss || id !== 'boss'); }

  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column';
    // ---- header / transport ----
    const head = el('div', { style: 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line);flex-wrap:wrap' }, bodyEl);
    const saveB = el('button', { class: 'tbtn play' }, head, '💾 Save soundtrack');
    saveB.addEventListener('click', () => MT.save().catch(e => api.toast('Save failed: ' + e.message)));
    const revB = el('button', { class: 'tbtn' }, head, '↺ Revert to built-in');
    revB.addEventListener('click', () => { if (confirm('Replace all tracks with the built-in defaults? (not saved until you Save)')) MT.revert(); });
    const dot = el('span', { class: 'tc-mut' }, head, dirty ? '● unsaved' : 'saved ✓');
    el('div', { style: 'flex:1' }, head);
    // transport
    const playB = el('button', { class: 'tbtn' + (previewing ? ' on' : '') }, head, previewing ? '⏹ Stop' : '▶ Preview');
    playB.addEventListener('click', () => { previewing ? MT.previewOff() : MT.previewOn(); render(); });
    el('span', { class: 'tc-mut' }, head, 'Vibe');
    const inten = el('input', { type: 'range', min: '0', max: '1', step: '0.01', style: 'width:160px' }, head); inten.value = String(curIntensity);
    const intLbl = el('span', { class: 'tc-mut', style: 'width:74px' }, head, curIntensity < 0.12 ? 'Exploration' : curIntensity > 0.7 ? 'Full combat' : 'Combat');
    inten.addEventListener('input', () => { MT.setIntensity(+inten.value); intLbl.textContent = curIntensity < 0.12 ? 'Exploration' : curIntensity > 0.7 ? 'Full combat' : 'Combat'; });
    // ---- sub tabs ----
    const tabs = el('div', { style: 'display:flex;gap:4px;padding:8px 14px 0' }, bodyEl);
    [['tracks', '🎚 Soundtracks'], ['rules', '🗺 Adaptive rules']].forEach(([id, lab]) => {
      const b = el('button', { class: 'tbtn' + (subTab === id ? ' on' : '') }, tabs, lab);
      b.addEventListener('click', () => { subTab = id; render(); });
    });
    const content = el('div', { style: 'flex:1;overflow:auto;padding:12px 14px' }, bodyEl);
    if (subTab === 'tracks') renderTracks(content); else renderRules(content);
  }

  function renderTracks(c) {
    const grid = el('div', { style: 'display:grid;grid-template-columns:230px 1fr;gap:14px;height:100%' }, c);
    // left: list
    const left = el('div', { style: 'display:flex;flex-direction:column;min-height:0' }, grid);
    const list = el('div', { class: 'tc-card', style: 'flex:1;overflow:auto;padding:6px' }, left);
    trackIds(true).forEach(id => {
      const isBoss = id === 'boss';
      const row = el('div', { class: 'tc-pal-item' + (id === selId ? ' sel' : ''), style: 'padding:6px 9px' }, list);
      el('span', {}, row, id);
      if (isBoss) el('span', { class: 'tc-pill planned', style: 'margin-left:auto' }, row, 'boss');
      row.addEventListener('click', () => MT.select(id));
    });
    const btns = el('div', { style: 'display:flex;gap:4px;margin-top:6px' }, left);
    el('button', { class: 'tbtn', onclick: () => MT.addTrack() }, btns, '+ New');
    el('button', { class: 'tbtn', onclick: () => MT.duplicateTrack() }, btns, '⧉ Dup');
    const delB = el('button', { class: 'tbtn', onclick: () => { if (!MT.removeTrack()) api.toast('Cannot delete this track.'); } }, btns, '🗑 Del');
    if (selId === 'boss') delB.disabled = true;
    // right: fields for selId
    const t = data.tracks[selId];
    const right = el('div', { style: 'overflow:auto;min-height:0' }, grid);
    if (!t) { el('div', { class: 'tc-mut' }, right, 'Select a track.'); return; }
    el('div', { class: 'tc-mut', style: 'margin-bottom:8px' }, right, selId === 'boss'
      ? 'The boss theme — always plays at full intensity during boss fights.'
      : 'Edit this track. Preview above to audition it; slide Vibe toward combat to hear the battle bed.');

    const rowId = el('div', { class: 'tc-row' }, right); el('label', {}, rowId, 'Track id / name');
    const idInp = el('input', { type: 'text' }, rowId); idInp.value = selId; idInp.disabled = selId === 'boss';
    idInp.addEventListener('change', () => { if (!MT.renameTrack(selId, idInp.value)) { idInp.value = selId; api.toast('Name in use or invalid.'); } else render(); });

    numRow(right, 'Tempo (BPM)', t.bpm, 40, 200, 1, v => MT.setField(selId, 'bpm', v));
    const rowRoot = el('div', { class: 'tc-row' }, right); el('label', {}, rowRoot, 'Root (Hz)');
    const rootInp = el('input', { type: 'number', min: '50', max: '600', step: '0.1' }, rowRoot); rootInp.value = t.root;
    const noteLbl = el('span', { class: 'tc-kbd' }, rowRoot, noteName(t.root));
    rootInp.addEventListener('input', () => { const v = +rootInp.value || t.root; MT.setField(selId, 'root', v); noteLbl.textContent = noteName(v); });
    rootInp.addEventListener('change', () => MT.rearm());

    const rowSc = el('div', { class: 'tc-row' }, right); el('label', {}, rowSc, 'Scale');
    const scSel = el('select', {}, rowSc);
    M.SCALE_NAMES.forEach(n => { const o = el('option', { value: n }, scSel, n); if (n === t.scale) o.selected = true; });
    scSel.addEventListener('change', () => { MT.setField(selId, 'scale', scSel.value); MT.rearm(); });

    const rowProg = el('div', { class: 'tc-row' }, right); el('label', {}, rowProg, 'Progression (4 bars)');
    const progWrap = el('div', { style: 'display:flex;gap:6px;flex:1' }, rowProg);
    t.prog.forEach((deg, i) => {
      const s = el('select', { style: 'flex:1' }, progWrap);
      ROMAN.forEach((rn, d) => { const o = el('option', { value: d }, s, rn); if (d === deg) o.selected = true; });
      s.addEventListener('change', () => { const p = t.prog.slice(); p[i] = +s.value; MT.setField(selId, 'prog', p); MT.rearm(); });
    });

    waveRow(right, 'Pad waveform', t.pad, v => { MT.setField(selId, 'pad', v); MT.rearm(); });
    rangeRow(right, 'Pad cutoff', t.padCut, 200, 2000, 10, 'Hz', v => MT.setField(selId, 'padCut', v));
    waveRow(right, 'Bass waveform', t.bass, v => { MT.setField(selId, 'bass', v); MT.rearm(); });
    rangeRow(right, 'Lead cutoff', t.leadCut, 800, 3500, 10, 'Hz', v => MT.setField(selId, 'leadCut', v));
    rangeRow(right, 'Drum weight', t.drums, 0, 1, 0.01, '', v => MT.setField(selId, 'drums', v));
  }

  function renderRules(c) {
    el('div', { class: 'tc-mut', style: 'margin-bottom:10px' }, c, 'When a room’s music is set to "Auto", the game picks a track from this biome → track map. Anything not listed falls back to "gloom".');
    const table = el('div', { class: 'tc-card' }, c);
    Object.keys(data.biome).sort().forEach(b => {
      const row = el('div', { class: 'tc-row', style: 'margin:3px 0' }, table);
      const bInp = el('input', { type: 'text', style: 'flex:0 0 160px' }, row); bInp.value = b;
      bInp.addEventListener('change', () => { if (!MT.biomeRename(b, bInp.value.trim())) { bInp.value = b; api.toast('Biome name in use or invalid.'); } else render(); });
      el('span', { class: 'tc-mut' }, row, '→');
      const sel = el('select', { style: 'flex:1' }, row);
      const ids = trackIds(false); if (!ids.includes(data.biome[b])) ids.unshift(data.biome[b]);
      ids.forEach(id => { const o = el('option', { value: id }, sel, id); if (id === data.biome[b]) o.selected = true; });
      sel.addEventListener('change', () => MT.biomeSet(b, sel.value));
      el('button', { class: 'tbtn', onclick: () => { MT.biomeDel(b); render(); } }, row, '🗑');
    });
    el('button', { class: 'tbtn', style: 'margin-top:8px', onclick: () => MT.biomeAdd() }, c, '+ Add mapping');
  }

  // small field helpers
  function numRow(parent, label, val, min, max, step, onChange) {
    const r = el('div', { class: 'tc-row' }, parent); el('label', {}, r, label);
    const inp = el('input', { type: 'number', min, max, step }, r); inp.value = val;
    inp.addEventListener('input', () => onChange(+inp.value));
    inp.addEventListener('change', () => MT.rearm());
  }
  function rangeRow(parent, label, val, min, max, step, unit, onChange) {
    const r = el('div', { class: 'tc-row' }, parent); el('label', {}, r, label);
    const inp = el('input', { type: 'range', min, max, step }, r); inp.value = val;
    const lbl = el('span', { class: 'tc-mut', style: 'width:62px;text-align:right' }, r, (step < 1 ? val.toFixed(2) : val) + (unit ? ' ' + unit : ''));
    inp.addEventListener('input', () => { const v = +inp.value; onChange(v); lbl.textContent = (step < 1 ? v.toFixed(2) : v) + (unit ? ' ' + unit : ''); });
    inp.addEventListener('change', () => MT.rearm());
  }
  function waveRow(parent, label, val, onChange) {
    const r = el('div', { class: 'tc-row' }, parent); el('label', {}, r, label);
    const sel = el('select', {}, r);
    M.WAVES.forEach(w => { const o = el('option', { value: w }, sel, w); if (w === val) o.selected = true; });
    sel.addEventListener('change', () => onChange(sel.value));
  }

  // ---------------- register the tool ----------------
  T.registerTool({
    id: 'music', label: 'Soundtrack editor', icon: '🎵', group: 'Audio',
    sub: 'compose & mix the adaptive score',
    build(host, a) { api = a; bodyEl = host; if (!data) MT.load(); render(); startLoop(); }
  });
  if (T.roadmapDone) T.roadmapDone(1, 2, 3);
})();
