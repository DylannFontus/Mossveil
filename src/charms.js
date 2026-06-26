// MOSSVEIL — charms.js : equippable charms (Hollow Knight style). Each costs notches;
// notches grow as you fell bosses. Effects are applied to the player's derived stats.
// The charm + synergy SET is a data overlay (data/charms.js -> window.G.CHARMS) authored by
// the in-editor Charm designer (Edit ▸ Content); these built-ins are the fallback. Effects are
// data-driven (additive hp/nail, multiplicative dash/focus/soul) so new charms need no code.
(function () {
  const C = G.Charms = {};
  const clone = o => JSON.parse(JSON.stringify(o));

  const DEFAULTS = {
    list: [
      { id: 'stoneheart', name: 'Stoneheart', cost: 3, desc: '+1 mask — a sturdier shell.', effects: { hp: 1 } },
      { id: 'keenedge', name: 'Keen Edge', cost: 2, desc: 'Your strikes cut deeper (+1 damage).', effects: { nail: 1 } },
      { id: 'swiftfocus', name: 'Swift Focus', cost: 2, desc: 'Mend a mask far faster.', effects: { focusMul: 0.55 } },
      { id: 'windstep', name: 'Wind Step', cost: 1, desc: 'Dash recovers more quickly.', effects: { dashMul: 0.6 } },
      { id: 'soulsiphon', name: 'Soul Siphon', cost: 2, desc: 'Draw more soul from each strike.', effects: { soulMul: 1.6 } },
      { id: 'glassheart', name: 'Glass Heart', cost: 1, desc: '+2 damage, but −1 mask. High risk.', effects: { nail: 2, hp: -1 } }
    ],
    // bonus effects when specific charms are equipped together
    synergies: [
      { need: ['keenedge', 'glassheart'], name: 'Ruin Edge', desc: 'Keen Edge + Glass Heart — strikes cut deeper still (+1 damage).', effects: { nail: 1 } },
      { need: ['swiftfocus', 'soulsiphon'], name: 'Soul Flow', desc: 'Swift Focus + Soul Siphon — soul gathers and mends faster.', effects: { focusMul: 0.85, soulMul: 1.25 } },
      { need: ['stoneheart', 'windstep'], name: 'Sure Footing', desc: 'Stoneheart + Wind Step — a steadier frame (+1 mask).', effects: { hp: 1 } }
    ]
  };

  // the live, normalised set (overlaid by the editor's data)
  let LIST = [], byId = {}, SYNERGIES = [];
  function normEffects(e) {
    e = e || {};
    const o = {};
    if (e.hp) o.hp = +e.hp;
    if (e.nail) o.nail = +e.nail;
    if (e.dashMul != null) o.dashMul = +e.dashMul;
    if (e.focusMul != null) o.focusMul = +e.focusMul;
    if (e.soulMul != null) o.soulMul = +e.soulMul;
    return o;
  }
  function normCharm(c) {
    return { id: String(c.id), name: c.name || c.id, cost: Math.max(0, c.cost | 0), desc: c.desc || '', effects: normEffects(c.effects) };
  }
  function normSyn(s) {
    return { need: (s.need || []).slice(), name: s.name || 'Synergy', desc: s.desc || '', effects: normEffects(s.effects) };
  }
  function applyData(data) {
    const d = data || G.CHARMS || null;
    LIST = ((d && d.list) ? d.list : DEFAULTS.list).map(normCharm);
    byId = {}; LIST.forEach(c => byId[c.id] = c);
    SYNERGIES = ((d && d.synergies) ? d.synergies : DEFAULTS.synergies).map(normSyn);
    C.LIST = LIST; C.SYNERGIES = SYNERGIES;
    if (G.player && C.apply) C.apply(G.player);   // hot-apply after an edit
  }
  C.applyData = applyData;
  C.exportDefaults = () => clone(DEFAULTS);
  C.exportCurrent = () => ({ list: clone(LIST), synergies: clone(SYNERGIES) });
  C.get = id => byId[id];
  C.synergies = () => SYNERGIES.filter(s => s.need.every(id => C.isEquipped(id)));
  applyData();

  // available notches: a base of 3, plus one per boss felled (capped). Tuning lives in data/loadout.js
  // (G.Loadout) so the editor can author it; the literal fallback keeps the old 3 / +1 / cap-9 behaviour.
  C.notches = () => {
    const s = G.save || {};
    let bosses = 0;
    if (s.bosses) { for (const k in s.bosses) if (s.bosses[k]) bosses++; }
    else if (s.bossDead) bosses = 1;
    return G.Loadout ? G.Loadout.notchesForBosses(bosses) : Math.min(9, 3 + bosses);
  };
  C.equipped = () => (G.save && G.save.charmsEquipped) || [];
  C.usedNotches = () => C.equipped().reduce((a, id) => a + (byId[id] ? byId[id].cost : 0), 0);
  C.isEquipped = id => C.equipped().indexOf(id) >= 0;
  // overcharm: you may exceed the budget by equipping one charm over — but only if you're not
  // already over (HK rule). Overcharmed = take double damage.
  C.canEquip = id => {
    const c = byId[id]; if (!c) return false;
    const used = C.usedNotches();
    if (used + c.cost <= C.notches()) return true;       // fits normally
    if (G.Loadout && !G.Loadout.allowOvercharm()) return false;  // overcharm disabled by the editor
    return used <= C.notches();                          // overcharm (one over) allowed if not already over
  };
  C.isOvercharmed = () => C.usedNotches() > C.notches();

  // ownership — charms are found in the world (pickups) or bought from a vendor
  C.owned = () => (G.save && G.save.charmsOwned) || [];
  C.isOwned = id => C.owned().indexOf(id) >= 0;
  C.grant = id => {
    if (!byId[id] || !G.save) return false;
    if (C.isOwned(id)) return false;
    G.save.charmsOwned = C.owned().concat([id]);
    if (G.Main && G.Main.persist) G.Main.persist();
    return true;
  };

  // toggle a charm on/off; returns false if not owned or it won't fit the notch budget
  C.toggle = id => {
    const c = byId[id]; if (!c) return false;
    if (!G.save || !C.isOwned(id)) return false;
    const eq = C.equipped().slice();
    const i = eq.indexOf(id);
    if (i >= 0) eq.splice(i, 1);
    else { if (!C.canEquip(id)) return false; eq.push(id); }
    G.save.charmsEquipped = eq;
    if (G.Main && G.Main.persist) G.Main.persist();
    if (G.player) C.apply(G.player);
    return true;
  };

  // accumulate one effects block onto the running stat tally
  function addEffects(st, e) {
    if (!e) return;
    if (e.hp) st.hp += e.hp;
    if (e.nail) st.nail += e.nail;
    if (e.dashMul != null) st.dashMul *= e.dashMul;
    if (e.focusMul != null) st.focusMul *= e.focusMul;
    if (e.soulMul != null) st.soulMul *= e.soulMul;
  }
  // recompute a player's charm-derived stats from the equipped set
  C.apply = p => {
    if (!p) return;
    const st = { hp: 5, nail: 1 + ((G.save && G.save.nailLevel) || 0), dashMul: 1, focusMul: 1, soulMul: 1 };
    for (const id of C.equipped()) { const c = byId[id]; if (c) addEffects(st, c.effects); }
    for (const s of SYNERGIES) if (s.need.every(id => C.isEquipped(id))) addEffects(st, s.effects);
    // difficulty / accessibility mode tweaks the derived stats (integer-safe, all foes + bosses)
    const D = G.Difficulty;
    p.maxHp = Math.max(1, st.hp + (D ? D.maskBonus() : 0));
    p.nailDmg = Math.max(1, st.nail + (D ? D.dmgBonus() : 0));
    p.dashCdMul = st.dashMul;
    p.focusMul = st.focusMul;
    p.soulMul = st.soulMul * (D ? D.soulMul() : 1);
    p.overcharmed = C.isOvercharmed();
    if (p.hp > p.maxHp) p.hp = p.maxHp;
  };
})();
