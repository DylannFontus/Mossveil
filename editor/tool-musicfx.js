// MOSSVEIL — tool-musicfx.js : music transition editor (Edit ▸ Systems).  Roadmap #82.
// Authors how the soundtrack crosses between themes (src/musicfx.js -> data/musicfx.js): the fade
// durations on a track swap, the dramatic stop + beat of silence + drive-in when a boss begins, the
// fade back to the biome theme when it's beaten, the resume fade, and the hard full-stop. A timeline
// preview draws the fade envelopes so you can see the pacing. Edits the overlay through the data layer;
// applies live + on next Play. Defaults byte-identical to the old constants in music.js.
(function () {
  const T = G.Tools, MX = G.MusicFX;
  if (!T || !MX || !MX.exportDefaults) return;
  const clone = o => JSON.parse(JSON.stringify(o));
  let data = null, dirty = false, bodyEl = null, api = null, pcv = null;

  const MT = T.musicfx = {
    get state() { return { data, dirty }; },
    getWorking() { return data; },
    load() { data = clone(MX.exportCurrent()); dirty = false; },
    revert() { data = clone(MX.exportDefaults()); dirty = true; if (bodyEl) render(); },
    applyToEngine() { MX.applyData(clone(data)); },
    async save() { await api.data.save('musicfx', 'MUSICFX_DATA', data); MT.applyToEngine(); dirty = false; if (api) api.toast('Music transitions saved'); if (bodyEl) render(); return true; },
    setField(k, v) { data[k] = v; dirty = true; if (pcv) draw(); },
    openInTool() { return T.openTool('musicfx'); }
  };

  // timeline preview: two fade-envelope diagrams (track swap, boss begins) on a shared time scale
  function draw() {
    if (!pcv) return;
    const cx = pcv.getContext('2d'), W = pcv.width, H = pcv.height, padL = 12, padR = 12;
    cx.clearRect(0, 0, W, H); cx.fillStyle = '#0b1410'; cx.fillRect(0, 0, W, H);
    const span1 = Math.max(data.trackSwapOut, data.trackSwapIn, 0.05);
    const span2 = Math.max(data.bossStopFade + data.bossSilence + data.bossInFade, 0.05);
    const pps = (W - padL - padR) / Math.max(span1, span2);
    const xOf = t => padL + t * pps;

    function envelope(yTop, yBot, label, segs) {
      cx.strokeStyle = 'rgba(255,255,255,0.12)'; cx.lineWidth = 1;
      cx.beginPath(); cx.moveTo(padL, yBot + 0.5); cx.lineTo(W - padR, yBot + 0.5); cx.stroke();
      cx.fillStyle = 'rgba(220,230,210,0.85)'; cx.font = '11px monospace'; cx.textAlign = 'left'; cx.textBaseline = 'top';
      cx.fillText(label, padL, yTop - 13);
      segs.forEach(s => {
        cx.strokeStyle = s.color; cx.lineWidth = 2; cx.beginPath();
        cx.moveTo(xOf(s.t0), s.v0 ? yTop : yBot);
        cx.lineTo(xOf(s.t1), s.v1 ? yTop : yBot);
        cx.stroke();
        // duration tag
        cx.fillStyle = s.color; cx.font = '10px monospace';
        if (s.tag) cx.fillText(s.tag, xOf((s.t0 + s.t1) / 2) - 10, (yTop + yBot) / 2 - 6);
      });
    }

    // track swap (top)
    const ty = 30, tb = 96;
    envelope(ty, tb, 'Track swap', [
      { t0: 0, t1: data.trackSwapOut, v0: 1, v1: 0, color: '#e09a9a', tag: data.trackSwapOut + 's' },
      { t0: 0, t1: data.trackSwapIn, v0: 0, v1: 1, color: '#9fd6a0', tag: data.trackSwapIn + 's' }
    ]);
    cx.fillStyle = 'rgba(200,210,200,0.55)'; cx.font = '9px monospace'; cx.textBaseline = 'top';
    cx.fillText('old out (red) · new in (green)', padL, tb + 4);

    // boss begins (bottom)
    const by = 150, bb = 216, s0 = data.bossStopFade, s1 = s0 + data.bossSilence;
    envelope(by, bb, 'Boss begins', [
      { t0: 0, t1: s0, v0: 1, v1: 0, color: '#e09a9a', tag: s0 + 's' },
      { t0: s0, t1: s1, v0: 0, v1: 0, color: 'rgba(180,180,200,0.6)', tag: data.bossSilence + 's' },
      { t0: s1, t1: s1 + data.bossInFade, v0: 0, v1: 1, color: '#c9a0ff', tag: data.bossInFade + 's' }
    ]);
    cx.fillStyle = 'rgba(200,210,200,0.55)'; cx.font = '9px monospace'; cx.textBaseline = 'top';
    cx.fillText('biome stop → silence → boss drive-in', padL, bb + 4);
  }

  function el(t, a, p, x) { return api.el(t, a, p, x); }

  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column';
    const head = el('div', { style: 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line)' }, bodyEl);
    el('button', { class: 'tbtn play', onclick: () => MT.save().catch(e => api.toast('Save failed: ' + e.message)) }, head, '💾 Save');
    el('button', { class: 'tbtn', onclick: () => { if (confirm('Reset music transitions to defaults?')) MT.revert(); } }, head, '↺ Revert');
    el('span', { class: 'tc-mut' }, head, dirty ? '● unsaved' : 'saved ✓');
    el('div', { style: 'flex:1' }, head);
    el('span', { class: 'tc-mut' }, head, 'applies live + on next Play');

    const grid = el('div', { style: 'flex:1;display:grid;grid-template-columns:1fr 480px;gap:0;min-height:0' }, bodyEl);
    const ctl = el('div', { style: 'overflow:auto;padding:14px 16px;display:flex;flex-direction:column;gap:16px;min-height:0;max-width:560px' }, grid);
    const side = el('div', { style: 'border-left:1px solid var(--line);padding:14px;display:flex;flex-direction:column;gap:8px;overflow:auto' }, grid);

    const s1 = section(ctl, '🔀 Track swap', 'When the biome theme changes, the old voices fade out as the new ones fade in (the master is untouched so they can\'t bleed back).');
    slider(s1, 'Old theme fade-out', 'trackSwapOut', 0.02, 3, 0.02);
    slider(s1, 'New theme fade-in', 'trackSwapIn', 0.02, 3, 0.02);

    const s2 = section(ctl, '⚔ Boss begins', 'The biome theme hard-stops to a beat of dread, then the boss theme drives in under the roar.');
    slider(s2, 'Biome hard-stop', 'bossStopFade', 0.02, 1.5, 0.02);
    slider(s2, 'Silence (dread)', 'bossSilence', 0, 3, 0.05);
    slider(s2, 'Boss theme fade-in', 'bossInFade', 0.02, 2, 0.02);

    const s3 = section(ctl, '🏆 Boss beaten', 'The boss theme fades out and the biome theme swells back in.');
    slider(s3, 'Boss theme fade-out', 'bossOutFade', 0.02, 3, 0.02);
    slider(s3, 'Biome return fade', 'biomeReturnFade', 0.02, 3, 0.02);

    const s4 = section(ctl, '⏯ Resume & stop', 'The fade-in when music resumes (cutscene end), and the hard full-stop when a fight begins.');
    slider(s4, 'Resume fade-in', 'resumeFade', 0.02, 3, 0.02);
    slider(s4, 'Hard stop fade', 'pauseFastFade', 0.02, 2, 0.02);

    el('div', { class: 'tc-mut', style: 'align-self:flex-start' }, side, 'Transition timeline');
    pcv = el('canvas', { width: '460', height: '240', style: 'border:1px solid var(--line);border-radius:6px;background:#0b1410;max-width:100%' }, side);
    el('div', { class: 'tc-mut', style: 'font-size:11px' }, side, 'Fade envelopes on a shared time scale — red is a voice fading out, green/purple fading in, grey is silence.');
    draw();
  }

  function slider(p, label, key, min, max, step) {
    const r = el('div', { class: 'tc-row' }, p); el('label', { style: 'flex:1' }, r, label);
    const inp = el('input', { type: 'range', min: '' + min, max: '' + max, step: '' + step }, r); inp.value = data[key];
    const num = el('input', { type: 'number', min: '' + min, max: '' + max, step: '' + step, style: 'width:66px' }, r); num.value = data[key];
    inp.addEventListener('input', () => { num.value = inp.value; MT.setField(key, +inp.value); });
    num.addEventListener('change', () => { inp.value = num.value; MT.setField(key, +num.value); });
  }

  function section(parent, title, desc) {
    const box = el('div', {}, parent);
    el('h3', { style: 'margin:0 0 2px;font-size:14px' }, box, title);
    if (desc) el('div', { class: 'tc-mut', style: 'margin-bottom:6px;font-size:11px;line-height:1.4' }, box, desc);
    return box;
  }

  T.registerTool({
    id: 'musicfx', label: 'Music transitions', icon: '🎼', group: 'Systems',
    sub: 'track swaps · boss enter/exit · resume',
    build(host, a) { api = a; bodyEl = host; if (!data) MT.load(); render(); }
  });
  if (T.roadmapDone) T.roadmapDone(82);
})();
