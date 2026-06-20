// MOSSVEIL — charms.js : equippable charms (Hollow Knight style). Each costs notches;
// notches grow as you fell bosses. Effects are applied to the player's derived stats.
(function () {
  const C = G.Charms = {};

  C.LIST = [
    { id: 'stoneheart', name: 'Stoneheart', cost: 3, desc: '+1 mask — a sturdier shell.' },
    { id: 'keenedge', name: 'Keen Edge', cost: 2, desc: 'Your strikes cut deeper (+1 damage).' },
    { id: 'swiftfocus', name: 'Swift Focus', cost: 2, desc: 'Mend a mask far faster.' },
    { id: 'windstep', name: 'Wind Step', cost: 1, desc: 'Dash recovers more quickly.' },
    { id: 'soulsiphon', name: 'Soul Siphon', cost: 2, desc: 'Draw more soul from each strike.' },
    { id: 'glassheart', name: 'Glass Heart', cost: 1, desc: '+2 damage, but −1 mask. High risk.' }
  ];
  const byId = {};
  C.LIST.forEach(c => byId[c.id] = c);
  C.get = id => byId[id];

  // available notches: a base of 3, plus one per boss felled (capped)
  C.notches = () => {
    const s = G.save || {};
    let n = 3;
    if (s.bosses) { for (const k in s.bosses) if (s.bosses[k]) n++; }
    else if (s.bossDead) n++;
    return Math.min(9, n);
  };
  C.equipped = () => (G.save && G.save.charmsEquipped) || [];
  C.usedNotches = () => C.equipped().reduce((a, id) => a + (byId[id] ? byId[id].cost : 0), 0);
  C.isEquipped = id => C.equipped().indexOf(id) >= 0;
  C.canEquip = id => { const c = byId[id]; return c && (C.usedNotches() + c.cost <= C.notches()); };

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
    else { if (C.usedNotches() + c.cost > C.notches()) return false; eq.push(id); }
    G.save.charmsEquipped = eq;
    if (G.Main && G.Main.persist) G.Main.persist();
    if (G.player) C.apply(G.player);
    return true;
  };

  // recompute a player's charm-derived stats from the equipped set
  C.apply = p => {
    if (!p) return;
    let hp = 5, nail = 1, dashMul = 1, focusMul = 1, soulMul = 1;
    for (const id of C.equipped()) {
      switch (id) {
        case 'stoneheart': hp += 1; break;
        case 'keenedge': nail += 1; break;
        case 'swiftfocus': focusMul *= 0.55; break;
        case 'windstep': dashMul *= 0.6; break;
        case 'soulsiphon': soulMul *= 1.6; break;
        case 'glassheart': nail += 2; hp -= 1; break;
      }
    }
    p.maxHp = Math.max(1, hp);
    p.nailDmg = nail;
    p.dashCdMul = dashMul;
    p.focusMul = focusMul;
    p.soulMul = soulMul;
    if (p.hp > p.maxHp) p.hp = p.maxHp;
  };
})();
