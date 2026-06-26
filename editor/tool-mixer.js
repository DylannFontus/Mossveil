// MOSSVEIL — tool-mixer.js : the in-engine Audio mixer (Edit ▸ Audio).
// Relative bus levels for music / sfx / ambient (data/mixer.js -> window.G.MIXER_DATA), applied by
// src/audio.js at startup and live here. Includes a master VU meter. The player's master volume
// stays in the game's settings menu. Offline, editor-only.
(function () {
  const T = G.Tools, A = G.Audio;
  if (!T || !A || !A.mixExportDefaults) return;
  const clone = o => JSON.parse(JSON.stringify(o));
  const BUSES = [['music', 'Music', '🎵'], ['sfx', 'Sound effects', '🔊'], ['ambient', 'Ambience', '🌫']];

  let data = null, dirty = false, bodyEl = null, api = null, meterEl = null, loopOn = false;
  const MT = T.mixer = {
    get state() { return { data, dirty }; },
    getWorking() { return data; },
    load() { data = clone(A.mixExportCurrent()); dirty = false; },
    revert() { data = A.mixExportDefaults(); dirty = true; A.applyMixData(data); if (bodyEl) render(); },
    setLevel(key, v) { data[key] = v; dirty = true; if (A.init) { try { A.init(); } catch (_) { } } A.setMix({ [key]: v }); },
    async save() { await api.data.save('mixer', 'MIXER_DATA', data); A.applyMixData(data); dirty = false; if (api) api.toast('Mixer saved'); if (bodyEl) render(); return true; },
    test() { if (A.init) { try { A.init(); } catch (_) { } } if (A.sfx) A.sfx('bench'); },
    openInTool() { return T.openTool('mixer'); }
  };

  function el(t, a, p, x) { return api.el(t, a, p, x); }
  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = '';
    el('div', { class: 'tc-mut', style: 'margin-bottom:10px' }, bodyEl, 'Relative levels for each audio bus (1.00 = default). Changes apply live and persist for the game. The player’s overall volume lives in the game’s Settings menu.');
    const head = el('div', { style: 'display:flex;gap:8px;margin-bottom:12px' }, bodyEl);
    el('button', { class: 'tbtn play', onclick: () => MT.save().catch(e => api.toast('Save failed: ' + e.message)) }, head, '💾 Save mixer');
    el('button', { class: 'tbtn', onclick: () => { if (confirm('Reset all bus levels to default?')) MT.revert(); } }, head, '↺ Reset');
    el('button', { class: 'tbtn', onclick: () => MT.test() }, head, '🔔 Test');
    el('span', { class: 'tc-mut', style: 'align-self:center' }, head, dirty ? '● unsaved' : 'saved ✓');
    BUSES.forEach(([key, label, icon]) => {
      const card = el('div', { class: 'tc-card', style: 'margin:8px 0' }, bodyEl);
      const r = el('div', { class: 'tc-row', style: 'margin:0' }, card);
      el('label', { style: 'width:150px' }, r, icon + '  ' + label);
      const inp = el('input', { type: 'range', min: '0', max: '2', step: '0.01' }, r); inp.value = data[key];
      const lbl = el('span', { class: 'tc-mut', style: 'width:46px;text-align:right' }, r, (+data[key]).toFixed(2));
      inp.addEventListener('input', () => { const v = +inp.value; MT.setLevel(key, v); lbl.textContent = v.toFixed(2); });
    });
    // master VU meter
    el('h4', { style: 'margin:16px 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:var(--txt2)' }, bodyEl, 'Master output');
    const meterWrap = el('div', { style: 'height:18px;border-radius:9px;background:var(--bg3);overflow:hidden;border:1px solid var(--line)' }, bodyEl);
    meterEl = el('div', { style: 'height:100%;width:0%;background:linear-gradient(90deg,#3fa860,#c9c150,#d05a5a);transition:width .05s' }, meterWrap);
    el('div', { class: 'tc-mut', style: 'margin-top:6px' }, bodyEl, 'Hit Test (or play in the editor) to see the meter move.');
    startLoop();
  }

  function startLoop() {
    if (loopOn) return; loopOn = true;
    const tick = () => {
      const ov = document.getElementById('toolHost');
      if (!ov || !ov.classList.contains('on')) { loopOn = false; return; }
      if (meterEl && A.meterLevel) meterEl.style.width = Math.round(A.meterLevel() * 100) + '%';
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  T.registerTool({
    id: 'mixer', label: 'Audio mixer', icon: '🎚', group: 'Audio',
    sub: 'music / sfx / ambient bus levels + VU meter',
    build(host, a) { api = a; bodyEl = host; if (!data) MT.load(); render(); }
  });
  if (T.roadmapDone) T.roadmapDone(7);
})();
