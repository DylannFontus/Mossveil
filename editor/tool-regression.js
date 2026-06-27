// MOSSVEIL — tool-regression.js : Level regression record / assert (Edit ▸ Tools).  Roadmap #64.
// The editor-side MANAGER for the game's deterministic-replay regression net (src/replay.js). A
// recorded run (▶ Play → F6 record → F6 stop) captures its input + RNG seed AND a baseline of the
// end state (room, player position, hp, soul). Saved here as a named CASE, it can later be replayed
// and asserted (▶ Play → F9) — if the end state drifts from the baseline, a gameplay regression is
// flagged. This tool owns the case LIBRARY + the last RESULTS dashboard; the actual record / assert
// happen in the running game and share the same localStorage (same-origin). Fully offline; never save()s.
(function () {
  const T = G.Tools;
  if (!T) return;
  const ED = () => G.__ed || {};

  // ---- shared store (the contract with src/replay.js) --------------------------------------------
  const LIBKEY = 'mossveil_regression';          // { name -> {seed,start,frames,expect,savedAt} }
  const RESKEY = 'mossveil_regression_results';  // { name -> {pass,expected,actual,diffs,at,error} }
  const RECKEY = 'mossveil_replay';              // the game's "last recording" {seed,start,frames,expect}
  const j = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') || d; } catch (_) { return d; } };
  const w = (k, o) => { try { localStorage.setItem(k, JSON.stringify(o)); } catch (_) { } };
  const loadCases = () => j(LIBKEY, {});
  const saveCases = o => w(LIBKEY, o);
  const loadResults = () => j(RESKEY, {});
  const saveResults = o => w(RESKEY, o);
  const lastRec = () => j(RECKEY, null);

  function caseRoom(c) { return (c.start && c.start.room) || (c.expect && c.expect.room) || '?'; }
  function caseDur(c) { let s = 0; for (const f of (c.frames || [])) s += (f && f.dt) || 0; return s; }
  function caseList() { const o = loadCases(); return Object.keys(o).map(n => Object.assign({ name: n }, o[n])); }

  // ---- library ops (also the test API) -----------------------------------------------------------
  function saveCase(name, rec) {
    rec = rec || lastRec();
    if (!name || !rec || !rec.frames || !rec.frames.length) return false;
    const o = loadCases();
    o[name] = { seed: rec.seed, start: rec.start, frames: rec.frames, expect: rec.expect || null, savedAt: Date.now() };
    saveCases(o); return true;
  }
  function saveCaseFromLast(name) { return saveCase(name, lastRec()); }
  function deleteCase(n) { const o = loadCases(); if (!(n in o)) return false; delete o[n]; saveCases(o); const r = loadResults(); if (n in r) { delete r[n]; saveResults(r); } return true; }
  function renameCase(a, b) { const o = loadCases(); if (!(a in o) || !b || (b in o)) return false; o[b] = o[a]; delete o[a]; saveCases(o); const r = loadResults(); if (a in r) { r[b] = r[a]; delete r[a]; saveResults(r); } return true; }
  function clearResults() { saveResults({}); }
  function exportJSON() { return JSON.stringify(loadCases(), null, 1); }
  function importJSON(str, mode) {
    let obj; try { obj = JSON.parse(str); } catch (_) { return false; }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
    const valid = {}; for (const k in obj) { const c = obj[k]; if (c && c.frames && c.frames.length) valid[k] = c; }
    saveCases(mode === 'replace' ? valid : Object.assign(loadCases(), valid));
    return true;
  }

  function stats() {
    const cs = caseList(), res = loadResults();
    let pass = 0, fail = 0, none = 0, frames = 0;
    for (const c of cs) {
      frames += (c.frames || []).length;
      const r = res[c.name];
      if (!r || r.pass === null || r.pass === undefined) none++; else if (r.pass) pass++; else fail++;
    }
    return { cases: cs.length, pass, fail, none, frames };
  }

  T.regression = {
    cases: caseList, results: loadResults, lastRecording: lastRec, stats,
    saveCase, saveCaseFromLast, deleteCase, renameCase, clearResults, exportJSON, importJSON,
    openInTool: () => T.openTool('regression')
  };

  // ============================== UI ==============================
  let bodyEl = null, api = null;
  const expanded = new Set();
  function el(t, a, p, x) { return api.el(t, a, p, x); }
  function jump(id) { if (G.LEVELS[id] && ED().openLevel) { ED().openLevel(id); T.closeTool(); api.toast('Opened ' + id); } }
  function resultOf(name) { return loadResults()[name] || null; }
  function badge(r) {
    if (!r || r.pass === null || r.pass === undefined) return { txt: '— not run', col: '#8a9a93', bg: 'transparent' };
    if (r.error) return { txt: '⚠ ' + r.error, col: '#10130f', bg: '#ffcf4a' };
    return r.pass ? { txt: '✓ pass', col: '#10130f', bg: '#7fd89a' } : { txt: '✗ fail', col: '#fff', bg: '#ff5a4a' };
  }

  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column';

    // ---- how-to header ----
    const hd = el('div', { class: 'tc-mut', style: 'padding:8px 12px;border-bottom:1px solid var(--line);font-size:11px;line-height:1.6' }, bodyEl);
    hd.innerHTML = 'Record a run in <b>▶ Play</b> with <b>F6</b> (start) → <b>F6</b> (stop) — it captures the input, seed and an <b>end-state baseline</b>. ' +
      'Save it here as a named <b>case</b>, then later press <b>F9</b> in Play to replay every case and assert the outcome still matches — catching gameplay regressions from tuning / level edits.';

    // ---- action row ----
    const ar = el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;align-items:center;padding:8px 12px;border-bottom:1px solid var(--line)' }, bodyEl);
    const rec = lastRec();
    const addBtn = el('button', { class: 'tbtn', title: rec ? 'Save the last F6 recording as a named regression case' : 'Record a run in ▶ Play (F6) first' }, ar, '➕ Save last recording as case');
    if (!rec) addBtn.style.opacity = '0.5';
    addBtn.addEventListener('click', () => {
      const r = lastRec();
      if (!r || !r.frames || !r.frames.length) { api.toast('No recording yet — press F6 in ▶ Play'); return; }
      const name = (prompt('Name this regression case:', caseRoom(r) + '-run') || '').trim();
      if (!name) return;
      if (loadCases()[name] && !confirm('Overwrite the existing case "' + name + '"?')) return;
      saveCase(name, r); render(); api.toast('Saved case "' + name + '"' + (r.expect ? '' : ' (no baseline — re-record to set one)'));
    });
    el('span', { style: 'flex:1' }, ar);
    el('button', { class: 'tbtn', title: 'Copy the whole case library as JSON' }, ar, '⤓ Export')
      .addEventListener('click', () => { navigator.clipboard && navigator.clipboard.writeText(exportJSON()); api.toast('Library JSON copied'); });
    el('button', { class: 'tbtn', title: 'Paste case-library JSON to merge in' }, ar, '⤒ Import')
      .addEventListener('click', () => { const s = prompt('Paste case-library JSON (merges into your cases):'); if (s && importJSON(s, 'merge')) { render(); api.toast('Imported'); } else if (s) api.toast('Invalid JSON'); });
    el('button', { class: 'tbtn', title: 'Clear the stored pass/fail results' }, ar, '✕ Clear results')
      .addEventListener('click', () => { clearResults(); render(); api.toast('Results cleared'); });

    // ---- stats bar ----
    const s = stats();
    const bar = el('div', { class: 'tc-mut', style: 'padding:8px 12px;border-bottom:1px solid var(--line);display:flex;gap:16px;flex-wrap:wrap;align-items:center' }, bodyEl);
    const stat = (lab, val, col) => { const sp = el('span', {}, bar); el('b', { style: 'color:' + (col || 'var(--txt)') }, sp, '' + val); sp.appendChild(document.createTextNode(' ' + lab)); };
    stat('cases', s.cases); stat('passed', s.pass, s.pass ? '#7fd89a' : null); stat('failed', s.fail, s.fail ? '#ff5a4a' : null);
    stat('not run', s.none); stat('frames', s.frames);

    // ---- table ----
    const wrap = el('div', { style: 'flex:1;overflow:auto' }, bodyEl);
    if (!s.cases) { el('div', { class: 'tc-mut', style: 'padding:26px;text-align:center' }, wrap, 'No regression cases yet. Record a run in ▶ Play (F6 / F6) then save it above.'); return; }
    const table = el('table', { style: 'width:100%;border-collapse:collapse;font-size:12px' }, wrap);
    const hr = el('tr', { style: 'position:sticky;top:0;background:var(--bg2);z-index:1' }, el('thead', {}, table));
    ['Case', 'Room', 'Frames', 'Duration', 'Baseline (hp · soul · pos)', 'Last result', ''].forEach((h, i) =>
      el('th', { style: 'padding:6px 8px;text-align:' + (i === 2 || i === 3 ? 'right' : 'left') + ';white-space:nowrap;color:var(--txt2)' }, hr, h));
    const tbody = el('tbody', {}, table);

    caseList().sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0)).forEach(c => {
      const r = resultOf(c.name), bg = badge(r), exp = c.expect;
      const tr = el('tr', { style: 'border-top:1px solid var(--line)' }, tbody);
      el('td', { style: 'padding:4px 8px;font-weight:600;color:var(--txt)' }, tr, c.name);
      const rt = el('td', { style: 'padding:4px 8px' }, tr);
      const a = el('a', { href: '#', style: 'color:var(--acc);text-decoration:none' }, rt, caseRoom(c));
      a.addEventListener('click', e => { e.preventDefault(); jump(caseRoom(c)); });
      el('td', { style: 'padding:4px 8px;text-align:right;color:var(--txt2)' }, tr, '' + (c.frames || []).length);
      el('td', { style: 'padding:4px 8px;text-align:right;color:var(--txt2)' }, tr, caseDur(c).toFixed(1) + 's');
      el('td', { style: 'padding:4px 8px;color:var(--txt2)' }, tr, exp ? (exp.hp + '/' + exp.maxHp + ' · ' + exp.soul + ' · ' + exp.x + ',' + exp.y) : '— no baseline');
      const bt = el('td', { style: 'padding:4px 8px' }, tr);
      el('span', { style: 'display:inline-block;padding:1px 8px;border-radius:8px;font-weight:600;color:' + bg.col + ';background:' + bg.bg + (bg.bg === 'transparent' ? ';border:1px solid var(--line)' : '') }, bt, bg.txt);
      // row actions
      const act = el('td', { style: 'padding:4px 8px;text-align:right;white-space:nowrap' }, tr);
      const exb = el('button', { class: 'tbtn', title: 'Diff / details', style: 'padding:1px 6px' }, act, expanded.has(c.name) ? '▾' : '▸');
      exb.addEventListener('click', () => { expanded.has(c.name) ? expanded.delete(c.name) : expanded.add(c.name); render(); });
      el('button', { class: 'tbtn', title: 'Rename', style: 'padding:1px 6px' }, act, '✎')
        .addEventListener('click', () => { const nn = (prompt('Rename case "' + c.name + '" to:', c.name) || '').trim(); if (nn && nn !== c.name) { if (renameCase(c.name, nn)) { render(); api.toast('Renamed'); } else api.toast('Name in use'); } });
      el('button', { class: 'tbtn', title: 'Delete', style: 'padding:1px 6px' }, act, '🗑')
        .addEventListener('click', () => { if (confirm('Delete regression case "' + c.name + '"?')) { deleteCase(c.name); expanded.delete(c.name); render(); api.toast('Deleted'); } });

      if (expanded.has(c.name)) {
        const dr = el('tr', {}, tbody), dc = el('td', { colspan: 7, style: 'padding:8px 16px 12px;background:var(--bg2)' }, dr);
        if (!exp) { el('div', { class: 'tc-mut' }, dc, 'No baseline stored for this case — re-record it in ▶ Play (F6) so it captures the end state.'); }
        if (!r) { el('div', { class: 'tc-mut', style: 'font-size:11px' }, dc, 'Not run yet. Open ▶ Play and press F9 to replay every case and assert it.'); }
        else if (r.error) { el('div', { style: 'color:#ffcf4a;font-size:11px' }, dc, 'Replay error: ' + r.error); }
        else if (r.pass) { el('div', { style: 'color:#7fd89a;font-size:11px' }, dc, '✓ Reproduced the baseline exactly — no regression.'); }
        else {
          el('div', { style: 'color:#ff5a4a;font-size:11px;margin-bottom:4px' }, dc, '✗ End state drifted from the baseline:');
          const dt = el('table', { style: 'border-collapse:collapse;font-size:11px' }, dc);
          const dh = el('tr', {}, el('thead', {}, dt));
          ['Field', 'Baseline', 'Now'].forEach(h => el('th', { style: 'padding:2px 12px;text-align:left;color:var(--txt2)' }, dh, h));
          const db = el('tbody', {}, dt);
          (r.diffs || []).forEach(d => {
            const row = el('tr', {}, db);
            el('td', { style: 'padding:2px 12px;color:var(--txt)' }, row, d.k);
            el('td', { style: 'padding:2px 12px;color:var(--txt2)' }, row, '' + d.exp);
            el('td', { style: 'padding:2px 12px;color:#ff9a4a' }, row, '' + d.act);
          });
        }
        if (r && r.at) el('div', { class: 'tc-mut', style: 'font-size:10px;margin-top:6px' }, dc, 'last run ' + new Date(r.at).toLocaleString());
      }
    });
  }

  T.registerTool({
    id: 'regression', label: 'Level regression record / assert', icon: '⏺️', group: 'Tools',
    sub: 'record a run → save a case → F9 in Play asserts no regression',
    build(host, a) { api = a; bodyEl = host; render(); }
  });
  if (T.roadmapDone) T.roadmapDone(64);
})();
