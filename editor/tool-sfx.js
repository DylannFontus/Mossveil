// MOSSVEIL — tool-sfx.js : the in-engine SFX designer (Edit ▸ Audio).
// Every sound effect that used to be a hard-coded synth in src/audio.js is now a list of synth
// layers (tone / noise / bell) you can edit, add to, and audition live. Saves to data/sfx.js
// (window.G.SFX_DATA); the game reads that as the source of truth. Fully offline, editor-only.
(function () {
  const T = G.Tools, A = G.Audio;
  if (!T || !A || !A.sfxExportDefaults) return;
  const clone = o => JSON.parse(JSON.stringify(o));
  const WAVES = ['sine', 'triangle', 'sawtooth', 'square'];
  const FTYPES = ['bandpass', 'lowpass', 'highpass'];
  const BUILTINS = Object.keys(A.sfxExportDefaults().sfx);
  const DEFAULTS = {
    tone: { kind: 'tone', type: 'sine', f0: 440, t: 0.2, vol: 0.2 },
    noise: { kind: 'noise', f0: 1000, t: 0.15, vol: 0.2, ftype: 'bandpass', q: 1 },
    bell: { kind: 'bell', f0: 523, vol: 0.1, dur: 1.0 }
  };

  // ---------------- controller (test API: G.Tools.sfx) ----------------
  let data = null, sel = null, dirty = false, bodyEl = null, api = null;
  const names = () => Object.keys(data.sfx);
  const MT = T.sfx = {
    get state() { return { data, sel, dirty }; },
    getWorking() { return data; },
    load() { data = clone(A.sfxExportCurrent()); sel = names()[0] || null; dirty = false; },
    revert() { data = clone(A.sfxExportDefaults()); sel = names()[0]; dirty = true; if (bodyEl) render(); },
    applyToEngine() { A.sfxApplyData(clone(data)); },
    async save() { await api.data.save('sfx', 'SFX_DATA', data); MT.applyToEngine(); dirty = false; if (api) api.toast('SFX saved · ' + names().length + ' sounds'); if (bodyEl) render(); return true; },
    select(n) { sel = n; if (bodyEl) render(); },
    uniqueName(base) { base = (base || 'sound').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'sound'; let n = base, i = 1; while (data.sfx[n]) n = base + (++i); return n; },
    addSfx(src) { const n = MT.uniqueName(src ? src : 'sound'); data.sfx[n] = clone((src && data.sfx[src]) || data.sfx[sel] || [clone(DEFAULTS.tone)]); sel = n; dirty = true; if (bodyEl) render(); return n; },
    duplicateSfx(n) { return MT.addSfx(n || sel); },
    removeSfx(n) { n = n || sel; if (names().length <= 1) return false; delete data.sfx[n]; if (sel === n) sel = names()[0]; dirty = true; if (bodyEl) render(); return true; },
    renameSfx(n, nn) { nn = (nn || '').trim(); if (!nn || nn === n || data.sfx[nn]) return false; data.sfx[nn] = data.sfx[n]; delete data.sfx[n]; if (sel === n) sel = nn; dirty = true; return true; },
    addLayer(n, kind) { data.sfx[n].push(clone(DEFAULTS[kind] || DEFAULTS.tone)); dirty = true; if (bodyEl) render(); },
    removeLayer(n, i) { data.sfx[n].splice(i, 1); dirty = true; if (bodyEl) render(); },
    setLayer(n, i, key, val) { const L = data.sfx[n][i]; if (!L) return; if (val === '' || val == null) delete L[key]; else L[key] = val; dirty = true; },
    play(n) { if (A.init) { try { A.init(); } catch (_) { } } A.sfxPlaySpec(data.sfx[n || sel]); },
    playLayer(n, i) { if (A.init) { try { A.init(); } catch (_) { } } A.sfxPlaySpec([data.sfx[n][i]]); },
    isBuiltin: n => BUILTINS.indexOf(n) >= 0,
    openInTool() { return T.openTool('sfx'); }
  };

  // ---------------- UI ----------------
  function el(t, a, p, x) { return api.el(t, a, p, x); }
  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column';
    const head = el('div', { style: 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line)' }, bodyEl);
    el('button', { class: 'tbtn play', onclick: () => MT.save().catch(e => api.toast('Save failed: ' + e.message)) }, head, '💾 Save SFX');
    el('button', { class: 'tbtn', onclick: () => { if (confirm('Replace all sounds with the built-in defaults? (not saved until you Save)')) MT.revert(); } }, head, '↺ Revert');
    el('span', { class: 'tc-mut' }, head, dirty ? '● unsaved' : 'saved ✓');
    el('div', { style: 'flex:1' }, head);
    el('span', { class: 'tc-mut' }, head, names().length + ' sounds');
    const grid = el('div', { style: 'flex:1;display:grid;grid-template-columns:210px 1fr;gap:0;min-height:0' }, bodyEl);
    // list
    const left = el('div', { style: 'display:flex;flex-direction:column;border-right:1px solid var(--line);min-height:0' }, grid);
    const list = el('div', { style: 'flex:1;overflow:auto;padding:8px' }, left);
    names().forEach(n => {
      const row = el('div', { class: 'tc-pal-item' + (n === sel ? ' sel' : ''), style: 'padding:5px 8px' }, list);
      el('span', {}, row, n);
      if (!MT.isBuiltin(n)) el('span', { class: 'tc-pill done', style: 'margin-left:auto' }, row, 'new');
      row.addEventListener('click', () => MT.select(n));
    });
    const btns = el('div', { style: 'display:flex;gap:4px;padding:8px;border-top:1px solid var(--line)' }, left);
    el('button', { class: 'tbtn', onclick: () => MT.addSfx() }, btns, '+ New');
    el('button', { class: 'tbtn', onclick: () => MT.duplicateSfx() }, btns, '⧉');
    el('button', { class: 'tbtn', onclick: () => { if (MT.isBuiltin(sel) && !confirm('“' + sel + '” is used by the game — delete anyway? (it just stops playing)')) return; if (!MT.removeSfx()) api.toast('Keep at least one sound.'); } }, btns, '🗑');
    // editor
    const right = el('div', { style: 'overflow:auto;padding:12px 14px;min-height:0' }, grid);
    renderSfx(right);
  }

  function renderSfx(host) {
    if (!sel || !data.sfx[sel]) { el('div', { class: 'tc-mut' }, host, 'Select a sound.'); return; }
    const top = el('div', { class: 'tc-row' }, host);
    el('label', {}, top, 'Name');
    const nameInp = el('input', { type: 'text' }, top); nameInp.value = sel;
    nameInp.addEventListener('change', () => { if (!MT.renameSfx(sel, nameInp.value)) { nameInp.value = sel; api.toast('Name in use or invalid.'); } else render(); });
    el('button', { class: 'tbtn play', onclick: () => MT.play() }, top, '▶ Play');
    if (MT.isBuiltin(sel)) el('div', { class: 'tc-mut', style: 'margin:2px 0 8px' }, host, 'Built-in sound — the game triggers “' + sel + '” by name; editing changes how it sounds everywhere.');
    data.sfx[sel].forEach((L, i) => renderLayer(host, L, i));
    const add = el('div', { style: 'display:flex;gap:6px;margin-top:8px' }, host);
    el('span', { class: 'tc-mut', style: 'align-self:center' }, add, 'Add layer:');
    ['tone', 'noise', 'bell'].forEach(k => el('button', { class: 'tbtn', onclick: () => MT.addLayer(sel, k) }, add, '+ ' + k));
  }

  // per-layer param schema
  const SCHEMA = {
    tone: [['type', 'wave'], ['f0', 'num', 20, 6000, 1], ['f1', 'num', 0, 6000, 1], ['t', 'num', 0.01, 3, 0.01], ['vol', 'num', 0, 0.6, 0.005], ['a', 'num', 0, 0.5, 0.005], ['delay', 'num', 0, 1, 0.01], ['f0Rand', 'num', 0, 3000, 10], ['dry', 'bool']],
    noise: [['ftype', 'ftype'], ['f0', 'num', 20, 8000, 10], ['f1', 'num', 0, 8000, 10], ['t', 'num', 0.01, 2, 0.01], ['vol', 'num', 0, 0.6, 0.005], ['a', 'num', 0, 0.3, 0.002], ['q', 'num', 0.1, 8, 0.1], ['delay', 'num', 0, 1, 0.01], ['f0Rand', 'num', 0, 3000, 10]],
    bell: [['f0', 'num', 50, 4000, 1], ['vol', 'num', 0, 0.6, 0.005], ['dur', 'num', 0.1, 3, 0.05], ['delay', 'num', 0, 1, 0.01]]
  };
  function renderLayer(host, L, i) {
    const card = el('div', { class: 'tc-card', style: 'margin:8px 0' }, host);
    const bar = el('div', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:6px' }, card);
    el('span', { class: 'tc-pill planned' }, bar, L.kind);
    el('div', { style: 'flex:1' }, bar);
    el('button', { class: 'tbtn', onclick: () => MT.playLayer(sel, i) }, bar, '▶');
    el('button', { class: 'tbtn', onclick: () => MT.removeLayer(sel, i) }, bar, '🗑');
    const grid = el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:4px 12px' }, card);
    (SCHEMA[L.kind] || []).forEach(([key, kind, min, max, step]) => {
      const r = el('div', { class: 'tc-row', style: 'margin:2px 0' }, grid);
      el('label', { style: 'width:62px' }, r, key);
      if (kind === 'wave' || kind === 'ftype') {
        const sel2 = el('select', {}, r); (kind === 'wave' ? WAVES : FTYPES).forEach(w => { const o = el('option', { value: w }, sel2, w); if (w === L[key]) o.selected = true; });
        sel2.addEventListener('change', () => MT.setLayer(sel, i, key, sel2.value));
      } else if (kind === 'bool') {
        const cb = el('input', { type: 'checkbox' }, r); cb.checked = !!L[key];
        cb.addEventListener('change', () => MT.setLayer(sel, i, key, cb.checked ? true : ''));
      } else {
        const inp = el('input', { type: 'number', min, max, step }, r); inp.value = L[key] != null ? L[key] : '';
        inp.addEventListener('change', () => MT.setLayer(sel, i, key, inp.value === '' ? '' : +inp.value));
      }
    });
  }

  T.registerTool({
    id: 'sfx', label: 'SFX designer', icon: '🔊', group: 'Audio',
    sub: 'design every sound effect from synth layers',
    build(host, a) { api = a; bodyEl = host; if (!data) MT.load(); render(); }
  });
  if (T.roadmapDone) T.roadmapDone(4);
})();
