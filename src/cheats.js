// MOSSVEIL — cheats.js : playtest CHEATS (roadmap #63). A small dev/QA module that lets you bend the
// rules while testing a level: god mode, infinite soul, always-ready dash, unlimited moth-wing flaps,
// plus one-shot favours (heal, fill soul, gift Glimmer, unlock every charm, clear the loadout, unlock
// all abilities, wipe the room's foes). It is driven by the editor's Cheats tool (a remote over the
// Play-here iframe) and is callable from the console as G.Cheats. Persistent toggles are enforced in
// ONE main.js per-frame seam; god mode rides ONE guard in player.damage(); everything else just calls
// the existing engine APIs (no extra seams). Inert by default — a fresh game behaves exactly as before.
(function () {
  const C = G.Cheats = {
    god: false,
    infiniteSoul: false,
    infiniteDash: false,
    infiniteAir: false,
    _onChange: null
  };
  const TOGGLES = C.TOGGLES = ['god', 'infiniteSoul', 'infiniteDash', 'infiniteAir'];

  function changed() { if (typeof C._onChange === 'function') { try { C._onChange(C.status()); } catch (e) { } } }
  function soulMax() { return (G.Player && G.Player.SOUL_MAX) || 99; }
  function persist() { if (G.Main && G.Main.persist) G.Main.persist(); }

  C.status = () => {
    const p = G.player;
    return {
      god: C.god, infiniteSoul: C.infiniteSoul, infiniteDash: C.infiniteDash, infiniteAir: C.infiniteAir,
      any: C.god || C.infiniteSoul || C.infiniteDash || C.infiniteAir,
      inGame: !!(p && !p.dead),
      hp: p ? p.hp : 0, maxHp: p ? p.maxHp : 0, soul: p ? Math.round(p.soul) : 0,
      glimmer: (G.Main && G.Main.glimmer) ? G.Main.glimmer() : 0,
      charmsOwned: (G.Charms && G.Charms.owned) ? G.Charms.owned().length : 0,
      totalCharms: (G.Charms && G.Charms.LIST) ? G.Charms.LIST.length : 0,
      foes: roomFoes()
    };
  };

  // ---- persistent toggles ----------------------------------------------------------------------
  C.set = (key, on) => { if (TOGGLES.indexOf(key) < 0) return false; C[key] = !!on; changed(); return true; };
  C.toggle = key => { if (TOGGLES.indexOf(key) < 0) return false; C[key] = !C[key]; changed(); return C[key]; };
  C.reset = () => { C.god = C.infiniteSoul = C.infiniteDash = C.infiniteAir = false; changed(); };

  // per-frame enforcement (the ONE main.js seam, play-state only): keeps the toggled values pinned
  // every frame so the soul orb stays full, the dash never cools, the wings never run out, etc.
  C.update = () => {
    const p = G.player;
    if (!p || p.dead) return;
    if (C.god) p.hp = p.maxHp;
    if (C.infiniteSoul) p.soul = soulMax();
    if (C.infiniteDash) p.dashCdT = 0;          // dash is always off cooldown
    if (C.infiniteAir) p.wingUsed = false;      // moth-wing flap refreshes (no-op without wings)
  };

  // ---- one-shot favours (no seam — they call existing engine APIs) -----------------------------
  C.heal = () => { const p = G.player; if (!p) return false; p.hp = p.maxHp; changed(); return true; };
  C.fillSoul = () => { const p = G.player; if (!p) return false; p.soul = soulMax(); changed(); return true; };
  C.giveGlimmer = n => {
    n = Math.max(1, n | 0 || 100);
    if (G.Main && G.Main.addGlimmer) { G.Main.addGlimmer(n); changed(); return true; }
    if (G.save) { G.save.glimmer = (G.save.glimmer || 0) + n; persist(); changed(); return true; }
    return false;
  };
  C.unlockCharms = () => {
    if (!G.Charms || !G.Charms.LIST || !G.save) return 0;
    let n = 0;
    for (const c of G.Charms.LIST) if (G.Charms.grant(c.id)) n++;   // grant() persists + dedupes
    changed();
    return n;
  };
  C.clearCharms = () => {
    if (!G.save) return false;
    G.save.charmsEquipped = [];
    if (G.player && G.Charms && G.Charms.apply) G.Charms.apply(G.player);
    persist(); changed(); return true;
  };
  // unlock every spell + the moth wings (mirrors world.js applyGrant('all'), kept self-contained)
  C.unlockAbilities = () => {
    const S = G.save; if (!S) return false;
    S.spells = S.spells || {};
    for (const k of ['bolt', 'scream', 'dive', 'ember', 'frost', 'gale']) S.spells[k] = 2;
    S.boltElement = S.boltElement || 'ember';
    S.wings = true;
    if (G.player) { G.player.hasWings = true; G.player.soul = soulMax(); }
    persist(); changed(); return true;
  };
  C.killEnemies = () => {
    let n = 0;
    if (G.room && G.room.entities) {
      for (const e of G.room.entities.slice()) {
        if (e && e.isEnemy && e.alive && e.type !== 'boss' && typeof e.hurt === 'function') { e.hurt(9999, e.body && e.body.x >= 0 ? 1 : -1); n++; }
      }
    }
    changed(); return n;
  };

  function roomFoes() {
    if (!G.room || !G.room.entities) return 0;
    let n = 0;
    for (const e of G.room.entities) if (e && e.isEnemy && e.alive && e.type !== 'boss') n++;
    return n;
  }

  // ---- on-screen indicator: a small top-right badge so an active cheat is never forgotten --------
  C.draw = (cx, w) => {
    const on = [];
    if (C.god) on.push('GOD');
    if (C.infiniteSoul) on.push('∞SOUL');
    if (C.infiniteDash) on.push('∞DASH');
    if (C.infiniteAir) on.push('∞AIR');
    if (!on.length) return;
    const label = '✦ ' + on.join(' · ');
    cx.save();
    cx.font = '12px monospace'; cx.textAlign = 'right'; cx.textBaseline = 'top';
    const tw = cx.measureText(label).width + 18;
    cx.fillStyle = 'rgba(16,6,10,0.74)'; cx.fillRect(w - tw - 8, 8, tw, 20);
    cx.fillStyle = '#ff9ec4';
    cx.fillText(label, w - 16, 12);
    cx.restore();
  };
})();
