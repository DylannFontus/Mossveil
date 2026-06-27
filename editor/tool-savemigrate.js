// MOSSVEIL — tool-savemigrate.js : Save migration inspector (Edit ▸ Systems).  Roadmap #99.
// A front-end for G.SaveMigrate (src/savemigrate.js). Reads the real save slots from localStorage
// (shared same-origin with the game), shows each slot's schema version, whether it needs upgrading and
// which core containers it's missing, lists the registered migrations, and upgrades a slot (or all) in
// place — running the additive/idempotent migration chain and writing the versioned save back. Useful
// for keeping old saves forward-compatible and debugging save issues. Editor-only, fully offline.
(function () {
  const T = G.Tools, M = G.SaveMigrate;
  if (!T || !M) return;
  const SLOT_PREFIX = 'mossveil-slot-';
  const maxSlots = () => (G.Saves && G.Saves.MAX_SLOTS) || 5;

  function readSlotRaw(i) { try { const r = localStorage.getItem(SLOT_PREFIX + i); if (!r) return null; const s = JSON.parse(r); return (s && s.data && typeof s.data === 'object') ? s : null; } catch (e) { return null; } }
  function writeSlotRaw(i, slot) { try { localStorage.setItem(SLOT_PREFIX + i, JSON.stringify(slot)); return true; } catch (e) { return false; } }

  const MT = T.savemigrate = {
    version: () => M.VERSION,
    migrations: () => M.MIGRATIONS.map(m => ({ to: m.to, name: m.name, desc: m.desc || '' })),
    inspect: s => M.inspect(s),
    slots() {
      const out = [], n = maxSlots();
      for (let i = 0; i < n; i++) {
        const s = readSlotRaw(i);
        if (!s) { out.push({ i, present: false }); continue; }
        const ins = M.inspect(s.data);
        out.push({ i, present: true, version: ins.version, needs: ins.needs, missing: ins.missing, pending: ins.pending, updatedAt: s.updatedAt || 0, glimmer: s.data.glimmer });
      }
      return out;
    },
    migrateSlot(i) { const s = readSlotRaw(i); if (!s) return null; const res = M.migrate(s.data); writeSlotRaw(i, s); return res; },
    migrateAll() { const out = []; for (const sl of MT.slots()) if (sl.present) out.push(Object.assign({ i: sl.i }, MT.migrateSlot(sl.i))); return out; },
    openInTool: () => T.openTool('savemigrate')
  };

  let bodyEl = null, api = null;
  function el(t, a, p, x) { return api.el(t, a, p, x); }

  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:14px 16px;display:flex;flex-direction:column;gap:14px';
    const slots = MT.slots(), present = slots.filter(s => s.present), stale = present.filter(s => s.needs);

    el('div', { class: 'tc-mut', style: 'font-size:12px;line-height:1.5' }, bodyEl,
      'Save schema is at version ' + M.VERSION + '. Old saves are upgraded automatically when the game loads them; here you can inspect and upgrade the slots directly.');

    // header / migrate-all
    const head = el('div', { style: 'display:flex;align-items:center;gap:10px' }, bodyEl);
    el('div', { style: 'flex:1;font-size:13px' }, head, present.length + ' save' + (present.length === 1 ? '' : 's') + ' · ' + (stale.length ? (stale.length + ' need upgrading') : 'all up to date ✓'));
    if (stale.length) { const b = el('button', { class: 'tbtn on', style: 'padding:7px 12px' }, head, '⬆ Migrate all'); b.addEventListener('click', () => { const r = MT.migrateAll(); api.toast('Upgraded ' + r.filter(x => x.applied && x.applied.length).length + ' save(s)'); render(); }); }

    // slots
    const list = el('div', { style: 'display:flex;flex-direction:column;gap:8px' }, bodyEl);
    slots.forEach(sl => {
      const box = el('div', { style: 'padding:8px 10px;border:1px solid var(--line);border-radius:6px;display:flex;align-items:center;gap:10px' }, list);
      el('span', { style: 'font-weight:600;font-size:13px' }, box, 'Slot ' + sl.i);
      if (!sl.present) { el('span', { class: 'tc-mut', style: 'flex:1' }, box, 'empty'); return; }
      el('span', { class: 'tc-pill ' + (sl.needs ? '' : 'done'), style: 'font-size:10px' + (sl.needs ? ';background:#ffcf4a;color:#1a1408' : '') }, box, 'v' + sl.version);
      const info = el('span', { class: 'tc-mut', style: 'flex:1;font-size:11px' }, box, '✦ ' + (sl.glimmer != null ? sl.glimmer : '—') + (sl.missing && sl.missing.length ? '  ·  missing: ' + sl.missing.join(', ') : '  ·  complete'));
      if (sl.needs) { const b = el('button', { class: 'tbtn', style: 'padding:4px 10px;font-size:12px' }, box, 'Upgrade → v' + M.VERSION); b.addEventListener('click', () => { MT.migrateSlot(sl.i); api.toast('Slot ' + sl.i + ' upgraded'); render(); }); }
      else el('span', { class: 'tc-pill done', style: 'font-size:10px' }, box, 'up to date');
    });
    if (!present.length) el('div', { class: 'tc-mut', style: 'padding:14px;text-align:center;border:1px dashed var(--line);border-radius:6px' }, list, 'No saves in localStorage. Play the game to create one.');

    // migration registry
    el('div', { class: 'tc-mut', style: 'font-size:11px;margin-top:4px' }, bodyEl, 'MIGRATION CHAIN');
    const reg = el('div', { style: 'display:flex;flex-direction:column;gap:4px' }, bodyEl);
    MT.migrations().forEach(m => { const r = el('div', { style: 'font-size:12px;color:var(--txt2)' }, reg); el('b', { style: 'color:var(--txt)' }, r, '→ v' + m.to + '  '); r.appendChild(document.createTextNode(m.name + (m.desc ? ' — ' + m.desc : ''))); });
  }

  T.registerTool({
    id: 'savemigrate', label: 'Save migration', icon: '♻️', group: 'Systems',
    sub: 'inspect & upgrade old save slots',
    build(host, a) { api = a; bodyEl = host; render(); }
  });
  if (T.roadmapDone) T.roadmapDone(99);
})();
