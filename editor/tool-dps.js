// MOSSVEIL — tool-dps.js : Encounter / DPS simulator (Edit ▸ Tools).  Roadmap #65.
// An editor-only QA scanner (the lint / deps / world / perf standalone-tool pattern — ZERO engine
// change, read-only over G.LEVELS + the enemy / boss registries). For every room it models the fight:
// how long the player needs to clear the foes at the current nail DPS, how much incoming pressure the
// room applies, and how many masks the clear is expected to cost — so you can SPOT difficulty spikes
// and dead-easy rooms before playtesting. The player loadout (nail level, masks) is a live knob.
//
// The combat numbers are GROUNDED in the engine: player nail cadence ATK_CD 0.36s and i-frames
// INVULN 1.3s (src/player.js), nail damage 1+nailLevel and 5 base masks (src/charms.js), and each
// enemy's HP + contact damage (src/enemies.js makers; custom/lib HP read live from G.Enemies; boss HP
// read live from G.Bosses). The design multipliers (effort / threat / avoid) are documented in model()
// and shown in-tool, so the difficulty numbers are transparent, not magic. Fully offline; never save()s.
(function () {
  const T = G.Tools;
  if (!T) return;
  const ED = () => G.__ed || {};

  // ---- combat model (grounded constants + documented design weights) -----------------------------
  const ATK_CD = 0.36;     // src/player.js TUNE.atkCd — seconds between nail swings
  const INVULN = 1.3;      // src/player.js INVULN — i-frames after the player takes a hit
  const BASE_NAIL = 1;     // src/charms.js — nailDmg = 1 + nailLevel
  const BASE_MASKS = 5;    // src/charms.js — base hp 5 (+ masks)

  // Per-enemy combat table. hp + contact are GROUNDED in src/enemies.js (maker `hp:` and contactPlayer
  // default dmg 1).  eff = effort multiplier: how much longer than raw hp/dps a kill really takes once
  // you account for armour / phasing / burrowing.  threat = incoming-danger weight on its contact
  // damage — fliers, rangers and chargers are harder to avoid than a plodding walker.
  const ENEMY = {
    tumblebug:  { hp: 2, contact: 1, eff: 1.0, threat: 1.0, note: 'walker' },
    gnatling:   { hp: 2, contact: 1, eff: 1.1, threat: 1.5, note: 'chasing flier' },
    bulbil:     { hp: 3, contact: 1, eff: 1.0, threat: 1.4, note: 'spitter (ranged)' },
    bramblehog: { hp: 4, contact: 1, eff: 1.1, threat: 1.3, note: 'charger' },
    lurcher:    { hp: 3, contact: 1, eff: 1.1, threat: 1.3, note: 'leaper' },
    spinemaw:   { hp: 3, contact: 1, eff: 1.1, threat: 1.4, note: 'ceiling dropper' },
    driftwisp:  { hp: 2, contact: 1, eff: 1.5, threat: 1.4, note: 'phasing — hard to hit' },
    shellback:  { hp: 4, contact: 1, eff: 1.6, threat: 1.0, note: 'front-armoured' },
    skimmer:    { hp: 2, contact: 1, eff: 1.2, threat: 1.5, note: 'dive-bomber' },
    sporeling:  { hp: 1, contact: 1, eff: 1.0, threat: 1.2, note: 'swarmer' },
    mortarbug:  { hp: 3, contact: 1, eff: 1.0, threat: 1.4, note: 'artillery (ranged)' },
    blastcap:   { hp: 1, contact: 1, eff: 1.0, threat: 1.3, note: 'exploder' },
    hookworm:   { hp: 3, contact: 1, eff: 1.3, threat: 1.2, note: 'burrower' },
    sentine:    { hp: 3, contact: 1, eff: 1.1, threat: 1.4, note: 'turret eye (ranged)' }
  };
  const CUSTOM = { hp: 3, contact: 1, eff: 1.0, threat: 1.2, note: 'custom / library' };   // fallback for lib types
  const BOSS = { eff: 3.0, threat: 6, fallbackHp: 30 };  // bosses can't be facetanked → big effort + pressure
  const AVOID = 0.08;        // share of theoretical contact windows that actually land (player-skill factor)
  const TTC_REF = 30;        // a clear this long (s) saturates the "length" half of the difficulty score
  const RISK_TIERS = [[0.15, 'trivial'], [0.4, 'safe'], [0.75, 'risky'], [1.0, 'deadly']];  // else 'lethal'
  const DIFF_TIERS = [[15, 'Trivial'], [35, 'Light'], [60, 'Moderate'], [85, 'Hard']];      // else 'Lethal'

  // ---- player loadout (editor-only QA preference, NOT a committed dataset) ------------------------
  const PKEY = 'mossveil-ed-dpsprofile';
  const DEF_PROFILE = { nail: 0, masks: BASE_MASKS };
  function profile() {
    try { const p = JSON.parse(localStorage.getItem(PKEY) || 'null'); if (p && p.nail >= 0 && p.masks >= 1) return { nail: p.nail | 0, masks: p.masks | 0 }; } catch (_) { }
    return Object.assign({}, DEF_PROFILE);
  }
  function setProfile(nail, masks) {
    nail = Math.max(0, Math.min(8, Math.round(+nail || 0)));
    masks = Math.max(1, Math.min(20, Math.round(+masks || BASE_MASKS)));
    try { localStorage.setItem(PKEY, JSON.stringify({ nail, masks })); } catch (_) { }
    return { nail, masks };
  }
  function loadout() {
    const pr = profile();
    const nailDmg = BASE_NAIL + pr.nail;
    return { nail: pr.nail, masks: pr.masks, nailDmg, dps: nailDmg / ATK_CD, atkCd: ATK_CD };
  }

  // ---- per-enemy / per-boss stat lookup (live from the registries where possible) ----------------
  function enemyStat(e) {
    const type = (e && e.type) || (typeof e === 'string' ? e : '');
    if (ENEMY[type]) return Object.assign({ type }, ENEMY[type]);
    // custom / library type — read HP from the placed spec or the enemy library, behaviour weights default
    let hp = CUSTOM.hp;
    const spec = (e && e.spec) || (G.Enemies && G.Enemies.libSpec && G.Enemies.libSpec(type));
    if (spec && +spec.hp > 0) hp = +spec.hp;
    return Object.assign({ type: type || 'custom' }, CUSTOM, { hp });
  }
  function bossHp(id) {
    try { const r = G.Bosses && G.Bosses.exportBossCurrent && G.Bosses.exportBossCurrent(); const c = r && r.configs && r.configs[id]; if (c && +c.hp > 0) return +c.hp; } catch (_) { }
    return BOSS.fallbackHp;
  }

  // ---- per-room simulation (pure; no DOM) --------------------------------------------------------
  function roomSim(id) {
    const lv = (G.LEVELS || {})[id]; if (!lv) return null;
    const lo = loadout(), dps = lo.dps, maxHp = lo.masks;
    // group enemies by type
    const counts = {};
    for (const e of (lv.enemies || [])) { const s = enemyStat(e); (counts[s.type] = counts[s.type] || { stat: s, count: 0 }).count++; }
    let totalHp = 0, effHp = 0, threatScore = 0, foes = 0;
    const byType = Object.keys(counts).map(t => {
      const stat = counts[t].stat, count = counts[t].count;
      const eHp = stat.hp * stat.eff * count, thr = stat.contact * stat.threat * count;
      totalHp += stat.hp * count; effHp += eHp; threatScore += thr; foes += count;
      return { type: t, count, hp: stat.hp, eff: stat.eff, effHp: eHp, contact: stat.contact, threat: thr, note: stat.note };
    }).sort((a, b) => b.effHp - a.effHp);
    // boss (a bossTrigger means a boss fight happens here)
    let hasBoss = false, bossId = null, bHp = 0;
    for (const p of (lv.props || [])) if (p && p.type === 'bossTrigger') { hasBoss = true; bossId = p.boss || 'mossSovereign'; bHp = bossHp(bossId); totalHp += bHp; effHp += bHp * BOSS.eff; threatScore += BOSS.threat; break; }

    const ttc = dps > 0 ? effHp / dps : 0;                       // time-to-clear (s) at current nail DPS
    const hitsTaken = threatScore * (ttc / INVULN) * AVOID;      // expected masks lost over the clear
    const r = maxHp > 0 ? hitsTaken / maxHp : 0;                 // fraction of the health bar
    const survives = hitsTaken < maxHp;
    let risk = 'lethal'; for (let i = 0; i < RISK_TIERS.length; i++) if (r < RISK_TIERS[i][0]) { risk = RISK_TIERS[i][1]; break; }
    const lenScore = Math.max(0, Math.min(1, ttc / TTC_REF)), riskScore = Math.max(0, Math.min(1, r));
    const difficulty = Math.round(100 * (0.45 * lenScore + 0.55 * riskScore));
    let tier = 'Lethal'; for (let i = 0; i < DIFF_TIERS.length; i++) if (difficulty < DIFF_TIERS[i][0]) { tier = DIFF_TIERS[i][1]; break; }
    return {
      id, title: lv.title || '', biome: lv.biome || '', foes, byType,
      totalHp, effHp: Math.round(effHp * 10) / 10, hasBoss, bossId, bossHp: bHp,
      ttc, threat: Math.round(threatScore * 10) / 10, hitsTaken, masksLeft: Math.max(0, maxHp - hitsTaken),
      maxHp, dps, risk, survives, difficulty, tier
    };
  }

  function rooms() { const L = G.LEVELS || {}; return Object.keys(L).map(roomSim).filter(Boolean); }

  function stats() {
    const r = rooms(), combat = r.filter(x => x.foes > 0 || x.hasBoss);
    const ttcs = combat.map(x => x.ttc);
    return {
      rooms: r.length, combatRooms: combat.length,
      foes: r.reduce((a, x) => a + x.foes, 0), bosses: r.filter(x => x.hasBoss).length,
      enemyHp: r.reduce((a, x) => a + x.totalHp, 0),
      avgTtc: ttcs.length ? Math.round(ttcs.reduce((a, v) => a + v, 0) / ttcs.length * 10) / 10 : 0,
      maxDifficulty: r.length ? Math.max.apply(null, r.map(x => x.difficulty)) : 0,
      lethal: r.filter(x => !x.survives && (x.foes > 0 || x.hasBoss)).length,
      hardest: combat.slice().sort((a, b) => b.difficulty - a.difficulty)[0] || null
    };
  }

  const model = () => ({
    ATK_CD, INVULN, BASE_NAIL, BASE_MASKS, AVOID, TTC_REF,
    ENEMY: JSON.parse(JSON.stringify(ENEMY)), CUSTOM: Object.assign({}, CUSTOM), BOSS: Object.assign({}, BOSS),
    riskTiers: RISK_TIERS.map(t => t.slice()), diffTiers: DIFF_TIERS.map(t => t.slice()), defaultProfile: Object.assign({}, DEF_PROFILE)
  });

  // =================== test / external API ===================
  T.dps = { rooms, stats, roomSim, profile, setProfile, loadout, model, openInTool: () => T.openTool('dps') };

  // =================== UI ===================
  let bodyEl = null, api = null;
  const TIER_COLOR = { Trivial: '#7fd89a', Light: '#a8d86a', Moderate: '#ffcf4a', Hard: '#ff9a4a', Lethal: '#ff5a4a' };
  const RISK_COLOR = { trivial: '#7fd89a', safe: '#a8d86a', risky: '#ffcf4a', deadly: '#ff9a4a', lethal: '#ff5a4a' };
  const COLS = [
    { key: 'id', label: 'Room', get: r => r.title || r.id, num: false, grow: true },
    { key: 'biome', label: 'Biome', get: r => r.biome, num: false },
    { key: 'foes', label: 'Foes', get: r => r.foes + (r.hasBoss ? 100 : 0), show: r => r.foes + (r.hasBoss ? ' +boss' : ''), num: true },
    { key: 'totalHp', label: 'HP pool', get: r => r.totalHp, num: true },
    { key: 'ttc', label: 'Clear', get: r => r.ttc, show: r => r.ttc ? r.ttc.toFixed(1) + 's' : '·', num: true },
    { key: 'threat', label: 'Threat', get: r => r.threat, show: r => r.threat || '·', num: true },
    { key: 'hitsTaken', label: 'Masks lost', get: r => r.hitsTaken, num: true },
    { key: 'difficulty', label: 'Difficulty', get: r => r.difficulty, num: true }
  ];
  const FILTERS = [
    ['all', 'All', () => true],
    ['combat', 'Has foes', r => r.foes > 0 || r.hasBoss],
    ['boss', 'Boss rooms', r => r.hasBoss],
    ['hard', 'Hard+', r => r.difficulty >= 60],
    ['lethal', 'Won’t survive', r => (r.foes > 0 || r.hasBoss) && !r.survives]
  ];
  const view = { sort: 'difficulty', dir: -1, q: '', filter: 'combat', expanded: new Set() };

  function el(t, a, p, x) { return api.el(t, a, p, x); }
  function jump(id) { if (G.LEVELS[id] && ED().openLevel) { ED().openLevel(id); T.closeTool(); api.toast('Opened ' + id); } }

  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column';
    const lo = loadout(), s = stats();

    // ---- player-loadout knobs ----
    const lb = el('div', { class: 'tc-mut', style: 'padding:8px 12px;border-bottom:1px solid var(--line);display:flex;gap:14px;flex-wrap:wrap;align-items:center' }, bodyEl);
    el('b', { style: 'color:var(--txt)' }, lb, 'Simulated run');
    const knob = (lab, val, min, max, on) => {
      const w = el('span', { style: 'display:flex;gap:4px;align-items:center' }, lb);
      el('span', {}, w, lab);
      const inp = el('input', { type: 'number', min: '' + min, max: '' + max, step: '1', value: '' + val, style: 'width:54px' }, w);
      inp.addEventListener('change', () => on(inp.value));
      return inp;
    };
    knob('nail lvl', lo.nail, 0, 8, v => { setProfile(v, lo.masks); render(); api.toast('Nail level ' + profile().nail); });
    knob('masks', lo.masks, 1, 20, v => { setProfile(lo.nail, v); render(); api.toast('Masks ' + profile().masks); });
    el('span', {}, lb, '→ nail ' + lo.nailDmg + ' dmg · ' + lo.dps.toFixed(2) + ' DPS');
    const reset = el('button', { class: 'tbtn', title: 'Reset to a fresh base run (no upgrades)' }, lb, '↺ base');
    reset.addEventListener('click', () => { setProfile(DEF_PROFILE.nail, DEF_PROFILE.masks); render(); api.toast('Loadout reset'); });

    // ---- stats bar ----
    const bar = el('div', { class: 'tc-mut', style: 'padding:8px 12px;border-bottom:1px solid var(--line);display:flex;gap:14px;flex-wrap:wrap;align-items:center' }, bodyEl);
    const stat = (lab, val, warn) => { const w = el('span', {}, bar); el('b', { style: 'color:' + (warn && val ? '#ff9a4a' : 'var(--txt)') }, w, '' + val); w.appendChild(document.createTextNode(' ' + lab)); };
    stat('combat rooms', s.combatRooms); stat('foes', s.foes); stat('bosses', s.bosses);
    stat('enemy HP', s.enemyHp); stat('avg clear', s.avgTtc + 's'); stat('won’t survive', s.lethal, true);
    if (s.hardest) { const w = el('span', {}, bar); el('span', {}, w, 'hardest: '); el('b', { style: 'color:' + (TIER_COLOR[s.hardest.tier] || 'var(--txt)') }, w, (s.hardest.title || s.hardest.id) + ' (' + s.hardest.difficulty + ')'); }

    // ---- toolbar: search + filters ----
    const tb = el('div', { style: 'display:flex;align-items:center;gap:6px;padding:8px 12px;border-bottom:1px solid var(--line);flex-wrap:wrap' }, bodyEl);
    const q = el('input', { type: 'text', placeholder: 'Search rooms…', value: view.q, style: 'flex:0 0 170px' }, tb);
    q.addEventListener('input', () => { view.q = q.value; renderTable(); });
    FILTERS.forEach(f => { const bt = el('button', { class: 'tbtn' + (view.filter === f[0] ? ' on' : '') }, tb, f[1]); bt.addEventListener('click', () => { view.filter = f[0]; render(); }); });

    // ---- table ----
    const wrap = el('div', { style: 'flex:1;overflow:auto' }, bodyEl);
    const table = el('table', { style: 'width:100%;border-collapse:collapse;font-size:12px' }, wrap);
    const hr = el('tr', { style: 'position:sticky;top:0;background:var(--bg2);z-index:1' }, el('thead', {}, table));
    COLS.forEach(c => {
      const th = el('th', { style: 'padding:6px 8px;text-align:' + (c.num ? 'right' : 'left') + ';cursor:pointer;white-space:nowrap;color:var(--txt2)' }, hr, c.label + (view.sort === c.key ? (view.dir > 0 ? ' ▲' : ' ▼') : ''));
      th.addEventListener('click', () => { if (view.sort === c.key) view.dir = -view.dir; else { view.sort = c.key; view.dir = c.num ? -1 : 1; } renderTable(); });
    });
    el('th', { style: 'padding:6px 8px' }, hr, '');
    const tbody = el('tbody', {}, table);

    function visibleRooms() {
      const txt = view.q.trim().toLowerCase();
      const filt = (FILTERS.find(f => f[0] === view.filter) || FILTERS[0])[2];
      const r = rooms().filter(x => filt(x) && (!txt || (x.id + ' ' + x.title + ' ' + x.biome).toLowerCase().includes(txt)));
      const col = COLS.find(c => c.key === view.sort) || COLS[0];
      r.sort((a, b) => { const va = col.get(a), vb = col.get(b); const d = (typeof va === 'number') ? va - vb : ('' + va).localeCompare('' + vb); return d * view.dir; });
      return r;
    }

    function renderTable() {
      tbody.innerHTML = '';
      const vis = visibleRooms();
      if (!vis.length) { el('td', { colspan: COLS.length + 1, class: 'tc-mut', style: 'padding:18px;text-align:center' }, el('tr', {}, tbody), 'No rooms match.'); return; }
      vis.forEach(r => {
        const tr = el('tr', { style: 'border-top:1px solid var(--line)' }, tbody);
        COLS.forEach(c => {
          const td = el('td', { style: 'padding:4px 8px;white-space:nowrap;text-align:' + (c.num ? 'right' : 'left') }, tr);
          if (c.key === 'id') {
            el('span', { title: r.risk, style: 'display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:7px;background:' + (RISK_COLOR[r.risk] || '#7fd89a') }, td);
            const a = el('a', { href: '#', style: 'color:var(--acc);text-decoration:none' }, td, r.title || r.id);
            a.addEventListener('click', e => { e.preventDefault(); jump(r.id); });
            if (r.title) el('span', { class: 'tc-mut', style: 'margin-left:6px;font-size:10px' }, td, r.id);
          } else if (c.key === 'difficulty') {
            const badge = el('span', { style: 'display:inline-block;min-width:30px;padding:1px 7px;border-radius:8px;font-weight:600;color:#10130f;background:' + (TIER_COLOR[r.tier] || '#7fd89a') }, td, '' + r.difficulty);
            badge.title = r.tier;
          } else if (c.key === 'hitsTaken') {
            const lost = Math.round(r.hitsTaken * 10) / 10;
            el('span', { style: 'color:' + (r.survives ? 'var(--txt2)' : '#ff5a4a') }, td, (r.foes || r.hasBoss) ? (lost + ' / ' + r.maxHp + (r.survives ? '' : ' ✗')) : '·');
          } else {
            el('span', { style: 'color:var(--txt2)' }, td, '' + (c.show ? c.show(r) : (c.get(r) || (c.num ? 0 : '·'))));
          }
        });
        const act = el('td', { style: 'padding:4px 8px;text-align:right;white-space:nowrap' }, tr);
        const exp = el('button', { class: 'tbtn', title: 'Encounter breakdown', style: 'padding:1px 6px' }, act, view.expanded.has(r.id) ? '▾' : '▸');
        exp.addEventListener('click', () => { view.expanded.has(r.id) ? view.expanded.delete(r.id) : view.expanded.add(r.id); renderTable(); });
        if (view.expanded.has(r.id)) renderDetail(r);
      });
    }

    function renderDetail(r) {
      const dr = el('tr', {}, tbody), dc = el('td', { colspan: COLS.length + 1, style: 'padding:8px 16px 12px;background:var(--bg2)' }, dr);
      if (!r.byType.length && !r.hasBoss) { el('span', { class: 'tc-mut' }, dc, 'No foes — a safe room.'); return; }
      // per-type table
      const tbl = el('table', { style: 'border-collapse:collapse;font-size:11px;margin-bottom:8px' }, dc);
      const head = el('tr', {}, el('thead', {}, tbl));
      ['Enemy', '×', 'HP', 'eff·HP', 'threat', 'behaviour'].forEach((h, i) => el('th', { style: 'padding:2px 10px;text-align:' + (i >= 1 && i <= 4 ? 'right' : 'left') + ';color:var(--txt2)' }, head, h));
      const tb2 = el('tbody', {}, tbl);
      r.byType.forEach(b => {
        const row = el('tr', {}, tb2);
        el('td', { style: 'padding:2px 10px' }, row, b.type);
        el('td', { style: 'padding:2px 10px;text-align:right' }, row, '' + b.count);
        el('td', { style: 'padding:2px 10px;text-align:right' }, row, '' + b.hp);
        el('td', { style: 'padding:2px 10px;text-align:right' }, row, '' + (Math.round(b.effHp * 10) / 10));
        el('td', { style: 'padding:2px 10px;text-align:right' }, row, '' + (Math.round(b.threat * 10) / 10));
        el('td', { class: 'tc-mut', style: 'padding:2px 10px' }, row, b.note);
      });
      if (r.hasBoss) {
        const row = el('tr', {}, tb2);
        el('td', { style: 'padding:2px 10px;color:#ff9a4a' }, row, '⚑ ' + r.bossId);
        el('td', { style: 'padding:2px 10px;text-align:right' }, row, '1');
        el('td', { style: 'padding:2px 10px;text-align:right' }, row, '' + r.bossHp);
        el('td', { style: 'padding:2px 10px;text-align:right' }, row, '' + (Math.round(r.bossHp * BOSS.eff * 10) / 10));
        el('td', { style: 'padding:2px 10px;text-align:right' }, row, '' + BOSS.threat);
        el('td', { class: 'tc-mut', style: 'padding:2px 10px' }, row, 'boss fight');
      }
      // the maths
      const m = el('div', { class: 'tc-mut', style: 'font-size:11px;line-height:1.7' }, dc);
      const span = (txt, col) => el('span', { style: 'color:' + (col || 'var(--txt)') }, m, txt);
      m.appendChild(document.createTextNode('clear time = effective HP ' + r.effHp + ' ÷ ' + r.dps.toFixed(2) + ' DPS = '));
      span(r.ttc.toFixed(1) + 's'); m.appendChild(document.createTextNode('   ·   pressure ' + r.threat + ' over the clear → '));
      span('~' + (Math.round(r.hitsTaken * 10) / 10) + ' masks lost', r.survives ? 'var(--txt)' : '#ff5a4a');
      m.appendChild(document.createElement('br'));
      m.appendChild(document.createTextNode('verdict: '));
      span(r.risk + ' · ' + r.tier + ' (' + r.difficulty + ')', RISK_COLOR[r.risk]);
      m.appendChild(document.createTextNode(r.survives ? '  — survivable on this loadout' : '  — predicted to down the player'));
    }

    renderTable();
  }

  T.registerTool({
    id: 'dps', label: 'Encounter / DPS simulator', icon: '⚔️', group: 'Tools',
    sub: 'clear time · incoming pressure · per-room difficulty',
    build(host, a) { api = a; bodyEl = host; render(); }
  });
  if (T.roadmapDone) T.roadmapDone(65);
})();
