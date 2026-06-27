// MOSSVEIL — tool-cheats.js : playtest CHEATS panel (Edit ▸ Tools). Roadmap #63.
// A live remote for the running game's G.Cheats: flip god mode / infinite soul / always-ready dash /
// unlimited moth-wings, and fire one-shot favours (heal, fill soul, gift Glimmer, unlock every charm,
// clear the loadout, unlock all abilities, wipe the room's foes) — for reaching a gated area, surviving
// a brutal fight while you study it, or stress-testing a level. It drives G.Cheats inside the editor's
// same-origin Play-here iframe, so it needs a game to be running; when nothing is playing it says so and
// offers ▶ Play here. No engine change from the editor side — purely an additive remote.
(function () {
  const T = G.Tools;
  if (!T) return;
  const TOGGLES = [
    ['god', '🛡 God mode', 'take no damage'],
    ['infiniteSoul', '🔵 Infinite soul', 'soul stays full'],
    ['infiniteDash', '💨 Infinite dash', 'dash never cools down'],
    ['infiniteAir', '🦋 Infinite air', 'moth-wing flap refreshes']
  ];

  // ---- reach the live game's Cheats through the Play iframe (override-able by tests) -------------
  function liveTarget() {
    try {
      const f = document.getElementById('playIframe');
      const w = f && f.contentWindow;
      return (w && w.G && w.G.Cheats) ? w.G.Cheats : null;
    } catch (e) { return null; }   // cross-origin or not loaded yet
  }

  const EMPTY = { available: false, any: false, inGame: false, god: false, infiniteSoul: false, infiniteDash: false, infiniteAir: false, hp: 0, maxHp: 0, soul: 0, glimmer: 0, charmsOwned: 0, totalCharms: 0, foes: 0 };

  const API = T.cheats = {
    TOGGLES: TOGGLES.map(t => t[0]),
    _target: null,                                   // tests inject a stand-in here
    target() { return this._target ? this._target() : liveTarget(); },
    available() { return !!this.target(); },
    status() {
      const d = this.target();
      if (!d) return Object.assign({}, EMPTY);
      const s = d.status(); s.available = true; return s;
    },
    toggle(key) { const d = this.target(); if (d) { d.toggle(key); return true; } return false; },
    set(key, on) { const d = this.target(); if (d) { d.set(key, on); return true; } return false; },
    reset() { const d = this.target(); if (d) { d.reset(); return true; } return false; },
    heal() { const d = this.target(); if (d) { d.heal(); return true; } return false; },
    fillSoul() { const d = this.target(); if (d) { d.fillSoul(); return true; } return false; },
    giveGlimmer(n) { const d = this.target(); if (d) { d.giveGlimmer(n); return true; } return false; },
    unlockCharms() { const d = this.target(); return d ? d.unlockCharms() : false; },
    clearCharms() { const d = this.target(); if (d) { d.clearCharms(); return true; } return false; },
    unlockAbilities() { const d = this.target(); if (d) { d.unlockAbilities(); return true; } return false; },
    killEnemies() { const d = this.target(); return d ? d.killEnemies() : false; },
    openInTool: () => T.openTool('cheats')
  };

  // =================== UI ===================
  let bodyEl = null, api = null, poll = null, rootMarker = null, lastSig = '';
  function el(t, a, p, x) { return api.el(t, a, p, x); }
  function startPlay() { const b = document.getElementById('btnPlayHere'); if (b) b.click(); }

  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:14px 16px;display:flex;flex-direction:column;gap:14px';
    const st = API.status();

    el('div', { class: 'tc-mut', style: 'font-size:12px;line-height:1.5' }, bodyEl,
      'Bend the rules while playtesting the running game. Toggles persist; favours fire once.');

    if (!st.available) {
      const box = el('div', { style: 'padding:18px;border:1px dashed var(--line);border-radius:6px;text-align:center;color:var(--txt2)' }, bodyEl);
      el('div', { style: 'margin-bottom:12px' }, box, 'No game is running. Start a playtest to cheat in it.');
      const pb = el('button', { class: 'tbtn on', style: 'padding:8px 16px' }, box, '▶ Play here');
      pb.addEventListener('click', () => startPlay());
      rootMarker = bodyEl.firstChild;
      return;
    }

    // live status banner
    el('div', { style: 'padding:8px 12px;border-radius:6px;text-align:center;font-size:13px;background:var(--bg2);color:' + (st.any ? '#ff9ec4' : 'var(--txt2)') }, bodyEl,
      st.inGame
        ? ('♥ ' + st.hp + '/' + st.maxHp + '   ·   🔵 ' + st.soul + '   ·   ✦ ' + st.glimmer + '   ·   ☠ ' + st.foes + ' foes' + (st.any ? '   ·   CHEATS ON' : ''))
        : 'Not in play (menu / cutscene) — toggles apply once you are in a room.');

    // toggles
    const tg = el('div', {}, bodyEl);
    el('div', { class: 'tc-mut', style: 'font-size:11px;margin-bottom:6px' }, tg, 'TOGGLES');
    const grid = el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:8px' }, tg);
    TOGGLES.forEach(([key, label, hint]) => {
      const on = !!st[key];
      const b = el('button', { class: 'tbtn' + (on ? ' on' : ''), title: hint, style: 'padding:9px 6px;font-size:12px;text-align:left' }, grid, (on ? '● ' : '○ ') + label);
      b.addEventListener('click', () => { API.toggle(key); render(); });
    });

    // one-shot favours
    const ac = el('div', {}, bodyEl);
    el('div', { class: 'tc-mut', style: 'font-size:11px;margin-bottom:6px' }, ac, 'FAVOURS (one-shot)');
    const ag = el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, ac);
    const fav = (label, title, fn) => { const b = el('button', { class: 'tbtn', title, style: 'flex:1 1 44%;min-width:120px;padding:8px 6px;font-size:12px' }, ag, label); b.addEventListener('click', () => { fn(); render(); }); };
    fav('♥ Full heal', 'Refill all masks', () => API.heal());
    fav('🔵 Fill soul', 'Top up the soul orb', () => API.fillSoul());
    fav('✦ +100 Glimmer', 'Gift 100 Glimmer', () => API.giveGlimmer(100));
    fav('✦ +500 Glimmer', 'Gift 500 Glimmer', () => API.giveGlimmer(500));
    fav('💠 Unlock charms', 'Own every charm (' + st.charmsOwned + '/' + st.totalCharms + ')', () => API.unlockCharms());
    fav('○ Clear loadout', 'Unequip every charm', () => API.clearCharms());
    fav('✨ Unlock abilities', 'All spells + moth wings', () => API.unlockAbilities());
    fav('☠ Kill room foes', 'Slay every enemy in the room', () => API.killEnemies());

    // reset
    const rb = el('button', { class: 'tbtn' + (st.any ? ' on' : ''), style: 'padding:8px 6px;font-size:12px' }, bodyEl, '↺ Turn all cheats off');
    rb.addEventListener('click', () => { API.reset(); render(); });

    rootMarker = bodyEl.firstChild;
  }

  function build(host, a) {
    api = a; bodyEl = host;
    if (poll) { clearInterval(poll); poll = null; }
    render();
    lastSig = JSON.stringify(API.status());
    // light poll so the banner tracks the game (toggled from the console, play just started, soul/glimmer
    // changing in real time…). Self-cleans: the root marker is removed when another tool replaces the body,
    // and the overlay loses the 'on' class when the tool is closed.
    poll = setInterval(() => {
      const ov = document.getElementById('toolHost');
      const torn = !rootMarker || !bodyEl.contains(rootMarker);   // another tool took over the body
      const closed = !ov || !ov.classList.contains('on');         // overlay hidden (tool closed)
      if (torn || closed) { clearInterval(poll); poll = null; return; }
      const s = JSON.stringify(API.status());
      if (s !== lastSig) { lastSig = s; render(); }
    }, 400);
  }

  T.registerTool({
    id: 'cheats', label: 'Cheats', icon: '🃏', group: 'Tools',
    sub: 'god · infinite soul · unlock charms · heal · kill foes — in the live game',
    build
  });
  if (T.roadmapDone) T.roadmapDone(63);
})();
