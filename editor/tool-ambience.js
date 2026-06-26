// MOSSVEIL — tool-ambience.js : the Ambience / soundscape editor (Edit ▸ Audio).  Roadmap #5.
// Authors the procedural ambient bed: the always-on filtered-noise CAVE WIND and the slow detuned
// DRONE voices (part of the 'classic' soundtrack style). Tunes data/ambience.js (G.AMBIENCE_DATA),
// applies live to the running audio nodes (every node is live-settable), and can audition the full
// bed in classic style. Fully offline. An empty overlay is byte-identical to the built-in soundscape.
(function () {
  const T = G.Tools, A = G.Audio;
  if (!T || !A || !A.ambExportCurrent) return;
  const clone = o => JSON.parse(JSON.stringify(o));
  const WAVES = ['sine', 'triangle', 'sawtooth', 'square'];

  function el(tag, attrs, parent, text) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'style') e.style.cssText = attrs[k];
      else if (k.startsWith('on') && typeof attrs[k] === 'function') e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    }
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }

  let data = null, dirty = false, auditioning = false, bodyEl = null, api = null, statusEl = null;
  const SCH = A.ambSchema();

  const MT = T.ambience = {
    get state() { return { data, dirty, auditioning }; },
    schema: () => SCH,
    getWorking() { return data; },
    load() { data = clone(A.ambExportCurrent()); dirty = false; },
    applyToEngine() { A.ambApplyData(clone(data)); },
    setBed(v) { data.bed = +v; touch(); },
    setWind(key, v) { data.wind[key] = +v; touch(); },
    setDrone(i, key, v) { data.drones[i][key] = +v; touch(); },
    setDroneType(i, t) { data.drones[i].type = t; touch(); },
    audition() { try { A.init && A.init(); if (A.setMusicStyle) A.setMusicStyle('classic'); MT.applyToEngine(); auditioning = true; if (bodyEl) syncStatus(); } catch (_) { } },
    stopAudition() { try { if (A.setMusicStyle) A.setMusicStyle('score'); } catch (_) { } auditioning = false; if (bodyEl) syncStatus(); },
    revert() { data = clone(A.ambExportDefaults()); dirty = true; MT.applyToEngine(); if (bodyEl) render(); },
    async save() { await api.data.save('ambience', 'AMBIENCE_DATA', data); MT.applyToEngine(); dirty = false; if (api) api.toast('Ambience saved'); if (bodyEl) syncStatus(); return true; },
    openInTool() { return T.openTool('ambience'); }
  };
  function touch() { dirty = true; MT.applyToEngine(); syncStatus(); }
  function syncStatus() { if (statusEl) statusEl.textContent = (dirty ? '● unsaved' : 'saved ✓') + (auditioning ? ' · auditioning' : ''); }

  function slider(host, label, val, min, max, step, on, def) {
    const r = el('div', { class: 'tc-row' }, host);
    el('label', { style: 'width:150px' }, r, label);
    const rng = el('input', { type: 'range', min, max, step, value: val }, r);
    const num = el('input', { type: 'number', min, max, step, value: val, style: 'width:80px;flex:0 0 auto' }, r);
    if (def != null) el('span', { class: 'tc-mut', style: 'width:60px;text-align:right;font-size:11px', title: 'default' }, r, 'def ' + def);
    const set = v => { rng.value = v; num.value = v; on(v); };
    rng.addEventListener('input', () => set(rng.value));
    num.addEventListener('change', () => set(num.value));
  }

  function render() {
    bodyEl.innerHTML = ''; bodyEl.style.cssText = '';
    const head = el('div', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:10px' }, bodyEl);
    el('button', { class: 'tbtn play', onclick: () => MT.save().catch(e => api.toast('Save failed: ' + e.message)) }, head, '💾 Save ambience');
    el('button', { class: 'tbtn', onclick: () => { if (confirm('Reset the soundscape to its built-in defaults?')) MT.revert(); } }, head, '↺ Revert');
    el('button', { class: 'tbtn', onclick: () => auditioning ? MT.stopAudition() : MT.audition() }, head, auditioning ? '■ Stop' : '▶ Audition');
    statusEl = el('span', { class: 'tc-mut' }, head); syncStatus();

    el('div', { class: 'tc-mut', style: 'margin-bottom:8px' }, bodyEl, 'Audition plays the full bed in the classic drone style so you can hear every layer (the drones are silent under the composed score). Changes apply live; Save persists them and they load with the game.');

    const def = A.ambExportDefaults();
    // wind — the always-on ambient bed
    el('h4', { style: 'margin:12px 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:var(--txt2)' }, bodyEl, 'Cave wind (always on)');
    SCH.wind.forEach(([k, label, mn, mx, st]) => slider(bodyEl, label, data.wind[k], mn, mx, st, v => MT.setWind(k, v), def.wind[k]));
    SCH.bed.forEach(([k, label, mn, mx, st]) => slider(bodyEl, label, data.bed, mn, mx, st, v => MT.setBed(v), def.bed));

    // drones — classic-style pad voices
    el('h4', { style: 'margin:16px 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:var(--txt2)' }, bodyEl, 'Drone voices (classic style)');
    data.drones.forEach((dr, i) => {
      const card = el('div', { class: 'tc-card', style: 'margin:6px 0' }, bodyEl);
      const hd = el('div', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:4px' }, card);
      el('span', { style: 'font-weight:600' }, hd, 'Voice ' + (i + 1));
      const tsel = el('select', {}, hd);
      WAVES.forEach(w => { const o = el('option', { value: w }, tsel, w); if (w === dr.type) o.selected = true; });
      tsel.addEventListener('change', () => MT.setDroneType(i, tsel.value));
      const d0 = (def.drones[i] || def.drones[0]);
      SCH.drone.forEach(([k, label, mn, mx, st]) => slider(card, label, dr[k], mn, mx, st, v => MT.setDrone(i, k, v), d0[k]));
    });
  }

  T.registerTool({
    id: 'ambience', label: 'Ambience / soundscape', icon: '🌫', group: 'Audio',
    sub: 'cave wind + drone bed',
    build(host, a) { api = a; bodyEl = host; if (!data) MT.load(); render(); }
  });
  if (T.roadmapDone) T.roadmapDone(5);
})();
