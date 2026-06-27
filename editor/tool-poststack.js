// MOSSVEIL — tool-poststack.js : post-FX & screen-feedback editor (Edit ▸ Systems).  Roadmap #74.
// Authors the global post knobs that aren't per-biome grade (#15) or on/off toggles (#87): the grade
// cross-fade speed, the ambient-occlusion strength, and the chromatic-aberration + screen-flash impact
// spikes (src/poststack.js -> data/poststack.js). A LIVE ANIMATED PREVIEW fakes the aberration channel
// split + flash and replays an impact every couple of seconds, so you can feel the screen punch. Edits
// the overlay through the data layer; applies live + on next Play. Defaults byte-identical to post.js.
(function () {
  const T = G.Tools, P = G.PostFX;
  if (!T || !P || !P.exportDefaults) return;
  const clone = o => JSON.parse(JSON.stringify(o));
  const SERIF = 'Georgia, "Times New Roman", serif';
  let data = null, dirty = false, bodyEl = null, api = null, pcv = null, sim = null;

  const MT = T.poststack = {
    get state() { return { data, dirty }; },
    getWorking() { return data; },
    load() { data = clone(P.exportCurrent()); dirty = false; },
    revert() { data = clone(P.exportDefaults()); dirty = true; if (bodyEl) render(); },
    applyToEngine() { P.applyData(clone(data)); },
    async save() { await api.data.save('poststack', 'POSTFX_DATA', data); MT.applyToEngine(); dirty = false; if (api) api.toast('Post-FX saved'); if (bodyEl) render(); return true; },
    setField(k, v) { data[k] = v; dirty = true; },
    punchNow() { if (sim) { sim.aberr = Math.min(data.aberrMax, sim.aberr + data.aberrDefault); sim.flash = Math.max(sim.flash, data.flashDefault); } },
    openInTool() { return T.openTool('poststack'); }
  };

  // ---- animated preview: fakes chromatic aberration (RGB channel split) + screen flash ----
  function frame(now) {
    if (!pcv || !document.body.contains(pcv)) { sim = null; return; }
    const s = sim, dt = Math.min(0.05, (now - s.last) / 1000 || 0.016); s.last = now; s.t += dt;
    s.ptimer -= dt; if (s.ptimer <= 0) { s.ptimer = 2.0; MT.punchNow(); }
    s.aberr *= Math.max(0, 1 - dt * data.aberrDecay);
    s.flash *= Math.max(0, 1 - dt * data.flashDecay);
    draw(s);
    requestAnimationFrame(frame);
  }

  function sample(cx, dx, color) {
    cx.save();
    cx.translate(dx, 0);
    cx.fillStyle = color; cx.strokeStyle = color; cx.lineWidth = 2;
    // a little moon over a horizon, then the wordmark
    cx.beginPath(); cx.arc(330, 70, 26, 0, 7); cx.fill();
    cx.beginPath(); cx.moveTo(20, 150); cx.lineTo(440, 150); cx.stroke();
    cx.beginPath(); cx.moveTo(60, 150); cx.lineTo(120, 110); cx.lineTo(180, 150); cx.fill();
    cx.beginPath(); cx.moveTo(200, 150); cx.lineTo(280, 96); cx.lineTo(360, 150); cx.fill();
    cx.font = '900 34px ' + SERIF; cx.textAlign = 'center'; cx.fillText('MOSSVEIL', 230, 205);
    cx.restore();
  }

  function draw(s) {
    if (!pcv) return;
    const cx = pcv.getContext('2d'), W = pcv.width, H = pcv.height, off = s.aberr * 3.4;
    cx.globalCompositeOperation = 'source-over';
    cx.fillStyle = '#0a120e'; cx.fillRect(0, 0, W, H);
    // RGB split: three coloured copies offset by the aberration, summed with 'lighter'
    cx.globalCompositeOperation = 'lighter';
    sample(cx, -off, 'rgb(255,46,46)');
    sample(cx, 0, 'rgb(46,255,92)');
    sample(cx, off, 'rgb(60,120,255)');
    cx.globalCompositeOperation = 'source-over';
    // screen flash
    if (s.flash > 0.002) { cx.fillStyle = 'rgba(255,255,255,' + Math.min(0.85, s.flash) + ')'; cx.fillRect(0, 0, W, H); }
    // readout
    cx.fillStyle = 'rgba(220,230,210,0.85)'; cx.font = '11px monospace'; cx.textAlign = 'left'; cx.textBaseline = 'top';
    cx.fillText('aberration ' + s.aberr.toFixed(2) + ' / ' + data.aberrMax.toFixed(1) + '   flash ' + s.flash.toFixed(2), 8, 6);
  }

  function startSim() {
    sim = { t: 0, aberr: 0, flash: 0, ptimer: 0.4, last: performance.now() };
    draw(sim);
    requestAnimationFrame(frame);
  }

  function el(t, a, p, x) { return api.el(t, a, p, x); }

  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column';
    const head = el('div', { style: 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line)' }, bodyEl);
    el('button', { class: 'tbtn play', onclick: () => MT.save().catch(e => api.toast('Save failed: ' + e.message)) }, head, '💾 Save');
    el('button', { class: 'tbtn', onclick: () => { if (confirm('Reset post-FX to the built-in defaults?')) MT.revert(); } }, head, '↺ Revert');
    el('span', { class: 'tc-mut' }, head, dirty ? '● unsaved' : 'saved ✓');
    el('div', { style: 'flex:1' }, head);
    el('span', { class: 'tc-mut' }, head, 'aberration/flash apply live · AO/grade-rate on next Play');

    const grid = el('div', { style: 'flex:1;display:grid;grid-template-columns:1fr 480px;gap:0;min-height:0' }, bodyEl);
    const ctl = el('div', { style: 'overflow:auto;padding:14px 16px;display:flex;flex-direction:column;gap:16px;min-height:0;max-width:560px' }, grid);
    const side = el('div', { style: 'border-left:1px solid var(--line);padding:14px;display:flex;flex-direction:column;gap:8px;overflow:auto' }, grid);

    const s1 = section(ctl, '🎞 Grade & ambient occlusion', 'The speed the colour grade cross-fades when you enter a room, and the overall ambient-occlusion strength (0 disables). These apply on the next Play.');
    slider(s1, 'Grade cross-fade', 'gradeRate', 0.2, 12, 0.1);
    slider(s1, 'Ambient occlusion', 'ssao', 0, 1.5, 0.05);

    const s2 = section(ctl, '💢 Impact aberration', 'The chromatic-aberration spike on hits, hard landings and dashes — the colour-split flash that sells an impact.');
    slider(s2, 'Max stack', 'aberrMax', 0, 6, 0.1);
    slider(s2, 'Default spike', 'aberrDefault', 0, 3, 0.05);
    slider(s2, 'Fade speed', 'aberrDecay', 0.5, 20, 0.5);

    const s3 = section(ctl, '⚡ Impact flash', 'The white screen-flash (bursts, boss phase, big hits).');
    slider(s3, 'Default flash', 'flashDefault', 0, 1, 0.05);
    slider(s3, 'Fade speed', 'flashDecay', 0.5, 20, 0.5);

    el('div', { class: 'tc-mut', style: 'align-self:flex-start' }, side, 'Live impact preview');
    pcv = el('canvas', { width: '460', height: '240', style: 'border:1px solid var(--line);border-radius:6px;background:#0a120e;max-width:100%' }, side);
    const r = el('div', { class: 'tc-row' }, side);
    el('button', { class: 'tbtn', onclick: () => MT.punchNow() }, r, '💥 Punch now');
    el('span', { class: 'tc-mut', style: 'font-size:11px' }, r, 'auto-fires every 2s');
    el('div', { class: 'tc-mut', style: 'font-size:11px' }, side, 'The wordmark splits into red/blue fringes by the aberration amount and the screen flashes white — both decay at the fade speeds above.');
    startSim();
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
    id: 'poststack', label: 'Post-FX & screen feedback', icon: '🎛️', group: 'Systems',
    sub: 'AO · grade fade · impact aberration & flash',
    build(host, a) { api = a; bodyEl = host; if (!data) MT.load(); render(); }
  });
  if (T.roadmapDone) T.roadmapDone(74);
})();
