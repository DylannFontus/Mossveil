// MOSSVEIL — savemigrate.js : versioned SAVE MIGRATION (G.SaveMigrate). As the save schema evolves, an
// old save in a slot may be missing fields a newer build expects. This is a tiny migration chain: each
// save carries a version (_v); on load the active slot is brought up to the current VERSION by running
// every pending migration in order, then stamped. Migrations are additive + idempotent, so a current
// save is untouched and re-running is a no-op — inert by default. Hooked into main.js readSlot() with a
// guarded one-liner; the in-editor Save-migration tool inspects + upgrades the slots in localStorage.
(function () {
  const M = G.SaveMigrate = {};
  M.VERSION = 1;   // bump when you add a migration below

  // each migration upgrades a save FROM version (to-1) up TO version `to`. Keep them additive +
  // idempotent (only fill what's missing) so re-running can never corrupt a save.
  M.MIGRATIONS = [
    {
      to: 1, name: 'baseline containers', desc: 'ensure the core save containers exist',
      fn(s) {
        if (typeof s.glimmer !== 'number') s.glimmer = 0;
        if (!s.flags || typeof s.flags !== 'object') s.flags = {};
        if (!s.spells || typeof s.spells !== 'object') s.spells = {};
        if (!Array.isArray(s.charmsOwned)) s.charmsOwned = [];
        if (!Array.isArray(s.charmsEquipped)) s.charmsEquipped = [];
      }
    }
  ];

  M.versionOf = s => (s && typeof s._v === 'number') ? s._v : 0;
  M.needs = s => M.versionOf(s) < M.VERSION;
  M.pending = s => { const v = M.versionOf(s); return M.MIGRATIONS.filter(m => m.to > v && m.to <= M.VERSION).map(m => ({ to: m.to, name: m.name, desc: m.desc || '' })); };

  // bring a save up to VERSION in place; returns { from, to, applied:[versions] }
  M.migrate = s => {
    if (!s || typeof s !== 'object') return { from: 0, to: M.VERSION, applied: [] };
    const from = M.versionOf(s), applied = [];
    for (const m of M.MIGRATIONS) if (m.to > from && m.to <= M.VERSION) { try { m.fn(s); applied.push(m.to); } catch (e) { } }
    s._v = M.VERSION;
    return { from, to: M.VERSION, applied };
  };

  // a non-mutating report for the editor tool (version, what's pending, which containers are missing)
  M.inspect = s => {
    const o = s || {}, version = M.versionOf(o), missing = [];
    if (typeof o.glimmer !== 'number') missing.push('glimmer');
    if (!o.flags || typeof o.flags !== 'object') missing.push('flags');
    if (!o.spells || typeof o.spells !== 'object') missing.push('spells');
    if (!Array.isArray(o.charmsOwned)) missing.push('charmsOwned');
    if (!Array.isArray(o.charmsEquipped)) missing.push('charmsEquipped');
    return { version, current: M.VERSION, needs: version < M.VERSION, pending: M.pending(o), missing };
  };
})();
