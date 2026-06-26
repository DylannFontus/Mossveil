// MOSSVEIL — tool-player.js : the Player feel / loadout editor (Edit ▸ Content).
// Tunes the player movement & combat constants that used to be hard-coded in src/player.js
// (data/player.js -> window.G.PLAYER_DATA.tune). Only values change — the movement code is untouched.
// Takes effect on the next Play / reload. Fully offline, editor-only.
(function () {
  const T = G.Tools, PL = G.Player;
  if (!T || !PL || !PL.tuneDefaults) return;
  const clone = o => JSON.parse(JSON.stringify(o));
  const GROUPS = [
    ['Run', [['run', 'Run speed', 2, 16, 0.1], ['acc', 'Acceleration', 20, 200, 1], ['dec', 'Deceleration', 20, 200, 1], ['airAcc', 'Air control', 10, 160, 1]]],
    ['Gravity', [['gUp', 'Rising gravity', 10, 90, 1], ['gDown', 'Falling gravity', 10, 120, 1], ['fallMax', 'Max fall speed', -40, -8, 1]]],
    ['Jump', [['jumpV', 'Jump strength', 8, 30, 0.5], ['jumpCut', 'Jump cut (release)', 0.1, 0.9, 0.01], ['coyote', 'Coyote time', 0, 0.3, 0.01], ['buffer', 'Jump buffer', 0, 0.3, 0.01]]],
    ['Wall jump', [['wallSlide', 'Wall-slide speed', -8, 0, 0.1], ['wjX', 'Wall-jump push', 4, 16, 0.1], ['wjY', 'Wall-jump up', 8, 24, 0.1], ['wallLock', 'Control lock', 0, 0.4, 0.01]]],
    ['Dash', [['dashV', 'Dash speed', 10, 40, 0.5], ['dashT', 'Dash time', 0.08, 0.4, 0.01], ['dashCd', 'Dash cooldown', 0.1, 1.2, 0.01]]],
    ['Combat', [['atkCd', 'Attack cooldown', 0.15, 0.8, 0.01], ['pogoV', 'Pogo bounce', 8, 24, 0.5], ['soulHit', 'Soul per hit', 4, 24, 1], ['focusCost', 'Focus cost (heal)', 10, 60, 1], ['focusTime', 'Focus time', 0.3, 1.6, 0.05], ['spellCost', 'Spell cost', 10, 60, 1]]],
    ['Weather wind', [['windGround', 'Wind push (ground)', 0, 12, 0.5], ['windAir', 'Wind push (air)', 0, 26, 0.5]]],
    ['Vitals', [['maxHp', 'Max masks (HP)', 1, 12, 1], ['soulMax', 'Soul capacity', 33, 198, 1]]]
  ];

  let data = null, dirty = false, bodyEl = null, api = null;
  const MT = T.player = {
    get state() { return { data, dirty }; },
    getWorking() { return data; },
    load() { data = clone(PL.tune()); dirty = false; },
    reset() { data = clone(PL.tuneDefaults()); dirty = true; if (bodyEl) render(); },
    setField(key, v) { data[key] = v; dirty = true; },
    async save() { await api.data.save('player', 'PLAYER_DATA', { tune: data }); dirty = false; if (api) api.toast('Player feel saved · applies on next Play'); if (bodyEl) render(); return true; },
    openInTool() { return T.openTool('player'); }
  };

  function el(t, a, p, x) { return api.el(t, a, p, x); }
  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = '';
    const head = el('div', { style: 'display:flex;gap:8px;margin-bottom:8px' }, bodyEl);
    el('button', { class: 'tbtn play', onclick: () => MT.save().catch(e => api.toast('Save failed: ' + e.message)) }, head, '💾 Save player feel');
    el('button', { class: 'tbtn', onclick: () => { if (confirm('Reset all player tuning to default?')) MT.reset(); } }, head, '↺ Reset');
    el('span', { class: 'tc-mut', style: 'align-self:center' }, head, dirty ? '● unsaved' : 'saved ✓');
    el('div', { class: 'tc-mut', style: 'margin-bottom:10px' }, bodyEl, 'Tune how the wanderer moves and fights. Changes take effect the next time you Play (the values are read at startup).');
    GROUPS.forEach(([title, params]) => {
      el('h4', { style: 'margin:12px 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:var(--txt2)' }, bodyEl, title);
      params.forEach(([key, label, min, max, step]) => {
        const r = el('div', { class: 'tc-row' }, bodyEl); el('label', { style: 'width:160px' }, r, label);
        const inp = el('input', { type: 'range', min, max, step }, r); inp.value = data[key] != null ? data[key] : 0;
        const lbl = el('span', { class: 'tc-mut', style: 'width:54px;text-align:right' }, r, fmt(data[key], step));
        const def = PL.tuneDefaults()[key];
        const dflt = el('span', { class: 'tc-mut', style: 'width:64px;text-align:right;opacity:.6' }, r, 'def ' + fmt(def, step));
        inp.addEventListener('input', () => { const v = +inp.value; MT.setField(key, v); lbl.textContent = fmt(v, step); });
      });
    });
  }
  function fmt(v, step) { return step < 1 ? (+v).toFixed(2) : ('' + Math.round(v)); }

  T.registerTool({
    id: 'player', label: 'Player feel', icon: '🏃', group: 'Content',
    sub: 'movement, jump, dash & combat tuning',
    build(host, a) { api = a; bodyEl = host; if (!data) MT.load(); render(); }
  });
  if (T.roadmapDone) T.roadmapDone(13);
})();
