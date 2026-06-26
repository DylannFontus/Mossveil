// MOSSVEIL — tool-dialogue.js : the Dialogue graph editor (Edit ▸ Narrative).  Roadmap #22.
// Branching NPC dialogue lives INLINE on each NPC prop in level data as prop.dialogue.lines[].
// The old inspector showed it as a flat numbered list; this is a visual NODE GRAPH: every line is a
// node, and the flow between them (linear fall-through, a line's explicit `goto`, and per-choice
// `goto`) is drawn as labelled arrows so branching reads at a glance. Editing happens in a side panel.
//   • Edits the live prop.dialogue object in place and marks the world dirty (Save = Ctrl+S, like the
//     inline inspector did) — it is NOT a data/<name> dataset, so this tool is editor-only & offline.
//   • Deleting a line REMAPS every goto index so edges keep pointing at the same logical line
//     (the flat inspector left those dangling — a real correctness win).
//   • Unreachable lines (not reachable from line 0) are flagged. Node positions are remembered
//     per-NPC in localStorage; they never touch the exported level JSON.
(function () {
  const T = G.Tools; if (!T) return;
  const ED = () => G.__ed || {};
  const LAY_KEY = 'mossveil-dlg-layout';
  const COLW = 250, ROWH = 132, M = 28, NODE_W = 196;

  // ---- tiny DOM helper (self-contained so editNPC works before build() runs) ----
  function el(tag, attrs, parent, text) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'style') e.style.cssText = attrs[k];
      else if (k.startsWith('on') && typeof attrs[k] === 'function') e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    }
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  const svgEl = (tag, attrs) => { const e = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };

  // ---- module state ----
  let target = null;          // { levelId, idx }
  let lines = null;           // reference to prop.dialogue.lines
  let sel = 0;                // selected line index (-1 = none / END)
  let pos = {};               // id -> {x,y}; ids are line indices (numbers) + 'end'
  let nodeEls = {};           // id -> DOM node div
  let bodyEl = null, graphEl = null, innerEl = null, svg = null, inspEl = null, statusEl = null;

  // ---- find every NPC across all levels ----
  function npcList() {
    const out = [], L = G.LEVELS || {};
    for (const lid in L) {
      const props = (L[lid] && L[lid].props) || [];
      props.forEach((p, i) => { if (p && p.type === 'npc') out.push({ levelId: lid, idx: i, name: p.name || '(unnamed)', lines: ((p.dialogue && p.dialogue.lines) || []).length }); });
    }
    return out;
  }
  function propOf(t) { const L = G.LEVELS || {}; const lv = L[t && t.levelId]; return lv && lv.props && lv.props[t.idx]; }

  // ---- load an NPC's dialogue (seeding a first line if it has none, like the old inspector) ----
  function loadTarget(t) {
    const p = propOf(t); if (!p) return false;
    p.dialogue = p.dialogue || { lines: [] };
    if (!p.dialogue.lines.length) p.dialogue.lines.push({ speaker: p.name || '', text: p.text || '' });
    target = { levelId: t.levelId, idx: t.idx }; lines = p.dialogue.lines; sel = 0;
    loadLayout();
    return true;
  }

  // ---- flow graph: edges out of each line ----
  // Mirrors dialogue.js runtime: choices intercept (pick one); else `end`; else explicit `goto`;
  // else linear fall-through to i+1 (or END past the last line).
  function computeEdges() {
    const n = lines.length, E = [];
    const tgt = g => (g != null && g >= 0 && g < n) ? g : 'end';
    for (let i = 0; i < n; i++) {
      const ln = lines[i];
      if (ln.choices && ln.choices.length) ln.choices.forEach(c => E.push({ from: i, to: tgt(c.goto), kind: 'choice', label: c.label || '…' }));
      else if (ln.end) E.push({ from: i, to: 'end', kind: 'end' });
      else if (ln.goto != null) E.push({ from: i, to: tgt(ln.goto), kind: 'goto' });
      else E.push({ from: i, to: i + 1 < n ? i + 1 : 'end', kind: 'flow' });
    }
    return E;
  }
  function reachable() {
    const n = lines.length, seen = new Set(), E = computeEdges();
    const adj = {}; E.forEach(e => { if (e.to !== 'end') (adj[e.from] = adj[e.from] || []).push(e.to); });
    if (n) { const q = [0]; seen.add(0); while (q.length) { const u = q.shift(); (adj[u] || []).forEach(v => { if (!seen.has(v)) { seen.add(v); q.push(v); } }); } }
    return seen;
  }

  // ---- auto layout: layered by distance from line 0; unreachable in a band below; END at the right ----
  function autoLayout() {
    const n = lines.length, E = computeEdges();
    const depth = new Array(n).fill(-1);
    const adj = {}; E.forEach(e => { if (e.to !== 'end') (adj[e.from] = adj[e.from] || []).push(e.to); });
    if (n) { depth[0] = 0; const q = [0]; while (q.length) { const u = q.shift(); (adj[u] || []).forEach(v => { if (depth[v] < 0) { depth[v] = depth[u] + 1; q.push(v); } }); } }
    let maxD = 0; for (let i = 0; i < n; i++) if (depth[i] > maxD) maxD = depth[i];
    const colRow = {}, P = {};
    for (let i = 0; i < n; i++) if (depth[i] >= 0) { const c = depth[i]; const r = (colRow[c] = (colRow[c] || 0)); P[i] = { x: M + c * COLW, y: M + r * ROWH }; colRow[c] = r + 1; }
    let maxRows = 0; for (const c in colRow) maxRows = Math.max(maxRows, colRow[c]);
    let band = 0; const bandY = M + maxRows * ROWH + 54;
    for (let i = 0; i < n; i++) if (depth[i] < 0) { P[i] = { x: M + band * COLW, y: bandY }; band++; }
    P.end = { x: M + (maxD + 1) * COLW, y: M };
    return P;
  }
  function layKey() { return LAY_KEY + '::' + (target ? target.levelId + '::' + target.idx : ''); }
  function loadLayout() {
    pos = autoLayout();
    try { const st = JSON.parse(localStorage.getItem(layKey()) || 'null'); if (st) for (const k in st) if (pos[k] !== undefined || k === 'end') pos[k] = st[k]; } catch (_) { }
  }
  function saveLayout() { try { localStorage.setItem(layKey(), JSON.stringify(pos)); } catch (_) { } }

  // ---- dirty / status ----
  function mark() { if (ED().markDirty) ED().markDirty(); if (statusEl) statusEl.textContent = '● unsaved — Ctrl+S to save the world'; }

  // ================= public + test API =================
  const MT = T.dialogue = {
    get state() { return { target, sel, lines }; },
    npcs: npcList,
    lines: () => lines,
    edges: computeEdges,
    reachable: () => [...reachable()],
    editNPC(levelId, idx) { if (!loadTarget({ levelId, idx })) return false; return T.openTool('dialogue'); },
    select(i) { sel = i; if (bodyEl) { paintSel(); renderInspector(); } },
    addLine(seed) {
      const ln = seed ? JSON.parse(JSON.stringify(seed)) : { speaker: (propOf(target) || {}).name || '', text: '' };
      lines.push(ln); sel = lines.length - 1;
      pos[sel] = { x: M + (Object.keys(pos).length % 4) * COLW, y: M + ((lines.length) % 5) * ROWH };
      mark(); if (bodyEl) restructure(); return sel;
    },
    duplicateLine(i) { i = i == null ? sel : i; return MT.addLine(lines[i]); },
    removeLine(i) {
      i = i == null ? sel : i; if (lines.length <= 1) return false;
      lines.splice(i, 1);
      const fix = g => (g == null) ? g : (g === i ? -1 : (g > i ? g - 1 : g));   // keep gotos pointing at the same logical line
      lines.forEach(ln => {
        if (ln.goto != null) ln.goto = fix(ln.goto);
        if (ln.choices) ln.choices.forEach(c => { if (c.goto != null) c.goto = fix(c.goto); });
      });
      if (sel >= lines.length) sel = lines.length - 1;
      mark(); if (bodyEl) { loadLayout(); restructure(); } return true;
    },
    setSpeaker(i, v) { lines[i].speaker = v; mark(); },
    setText(i, v) { lines[i].text = v; mark(); },
    setEnd(i, on) { if (on) lines[i].end = true; else delete lines[i].end; mark(); if (bodyEl) restructure(); },
    setGoto(i, v) { const ln = lines[i]; if (v == null || v === 'auto') delete ln.goto; else ln.goto = (v === 'end' ? -1 : +v); mark(); if (bodyEl) restructure(); },
    addChoice(i) { const ln = lines[i]; ln.choices = ln.choices || []; ln.choices.push({ label: 'New choice', goto: -1 }); mark(); if (bodyEl) restructure(); return ln.choices.length - 1; },
    removeChoice(i, ci) { const ln = lines[i]; if (!ln.choices) return; ln.choices.splice(ci, 1); if (!ln.choices.length) delete ln.choices; mark(); if (bodyEl) restructure(); },
    setChoice(i, ci, key, v) { const c = lines[i].choices[ci]; if (v === '' || v == null) delete c[key]; else c[key] = (key === 'goto' ? (v === 'end' ? -1 : +v) : v); mark(); if (bodyEl) { renderGraph(); drawEdges(); } },
    setChoiceQuest(i, ci, title, objective) { const c = lines[i].choices[ci]; const t = (title || '').trim(); if (t) c.quest = { id: t.toLowerCase().replace(/[^a-z0-9]+/g, '-'), title: t, objective: (objective || '').trim() || t }; else delete c.quest; mark(); },
    autoLayout() { pos = autoLayout(); saveLayout(); if (bodyEl) { renderGraph(); drawEdges(); } },
    openInScene() { if (target && ED().selectProp) { ED().selectProp(target.levelId, target.idx); T.closeTool(); } },
    openInTool() { return T.openTool('dialogue'); }
  };

  // ================= rendering =================
  function build(host) {
    bodyEl = host; bodyEl.innerHTML = ''; bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column';
    const npcs = npcList();
    if (!npcs.length) { el('div', { class: 'tc-mut', style: 'padding:24px' }, bodyEl, 'No NPCs found. Place an NPC prop (Hierarchy ▸ add ▸ Props ▸ NPC) in a level, then author its branching dialogue here as a graph.'); return; }
    // default target: the selected NPC in the scene, else the first NPC found
    if (!target || !propOf(target) || propOf(target).type !== 'npc') {
      const si = ED().selectedItem && ED().selectedItem();
      if (si && si.ref && si.ref.type === 'npc') loadTarget({ levelId: ED().currentId(), idx: si.i });
      else loadTarget(npcs[0]);
    } else loadTarget(target);

    // ---- toolbar ----
    const head = el('div', { style: 'display:flex;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid var(--line);flex-wrap:wrap' }, bodyEl);
    el('span', { class: 'tc-mut' }, head, 'NPC');
    const npcSel = el('select', { style: 'background:var(--bg3);color:var(--txt);border:1px solid #45454d;border-radius:5px;padding:4px 7px;font-size:13px;max-width:280px' }, head);
    const byLevel = {}; npcs.forEach(npc => (byLevel[npc.levelId] = byLevel[npc.levelId] || []).push(npc));
    Object.keys(byLevel).forEach(lid => {
      const og = el('optgroup', { label: lid }, npcSel);
      byLevel[lid].forEach(npc => { const o = el('option', { value: String(npc.idx) }, og, npc.name + ' · ' + npc.lines + ' line' + (npc.lines === 1 ? '' : 's')); if (target && lid === target.levelId && npc.idx === target.idx) o.selected = true; });
    });
    npcSel.addEventListener('change', () => { const opt = npcSel.selectedOptions[0]; loadTarget({ levelId: opt.parentNode.label, idx: +opt.value }); restructure(); });
    el('button', { class: 'tbtn', onclick: () => MT.addLine() }, head, '+ Add line');
    el('button', { class: 'tbtn', onclick: () => MT.autoLayout() }, head, '⤢ Auto-layout');
    el('button', { class: 'tbtn', onclick: () => MT.openInScene() }, head, '◎ Select in scene');
    el('div', { style: 'flex:1' }, head);
    statusEl = el('span', { class: 'tc-mut' }, head, 'editing in place');

    // ---- main: graph + inspector ----
    const main = el('div', { style: 'flex:1;display:flex;min-height:0' }, bodyEl);
    graphEl = el('div', { style: 'flex:1;position:relative;overflow:auto;background:repeating-linear-gradient(45deg,transparent,transparent 13px,rgba(255,255,255,.012) 13px,rgba(255,255,255,.012) 14px)' }, main);
    innerEl = el('div', { style: 'position:relative;min-width:100%;min-height:100%' }, graphEl);
    svg = svgEl('svg', { style: 'position:absolute;left:0;top:0;overflow:visible;pointer-events:none' });
    const defs = svgEl('defs', {});
    [['ar-flow', '#6a7280'], ['ar-goto', '#c8a24f'], ['ar-choice', '#4fa3ff'], ['ar-end', '#c45a6a']].forEach(([id, col]) => {
      const mk = svgEl('marker', { id, viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' });
      mk.appendChild(svgEl('path', { d: 'M0,0 L10,5 L0,10 z', fill: col })); defs.appendChild(mk);
    });
    svg.appendChild(defs); innerEl.appendChild(svg);
    inspEl = el('div', { style: 'width:330px;flex-shrink:0;border-left:1px solid var(--line);overflow:auto;padding:12px 14px' }, main);

    renderGraph(); drawEdges(); renderInspector();
  }

  function restructure() { renderGraph(); drawEdges(); renderInspector(); }

  function renderGraph() {
    // clear node divs (keep the svg)
    Object.values(nodeEls).forEach(n => n.remove()); nodeEls = {};
    const reach = reachable();
    lines.forEach((ln, i) => {
      const p = pos[i] || (pos[i] = { x: M, y: M });
      const node = el('div', {
        class: 'dlg-node', style: `position:absolute;left:${p.x}px;top:${p.y}px;width:${NODE_W}px;` +
          `background:var(--bg2);border:1px solid ${i === sel ? 'var(--acc)' : 'var(--line)'};border-radius:8px;` +
          `box-shadow:${i === sel ? '0 0 0 1px var(--acc)' : '0 4px 14px rgba(0,0,0,.35)'};cursor:grab;user-select:none;` +
          (reach.has(i) ? '' : 'opacity:.7;border-style:dashed;')
      }, innerEl);
      const hd = el('div', { style: 'display:flex;align-items:center;gap:6px;padding:5px 8px;border-bottom:1px solid var(--line)' }, node);
      el('span', { style: 'font-size:10px;color:var(--txt2);font-family:monospace' }, hd, '#' + i);
      el('span', { style: 'font-size:12px;font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, hd, ln.speaker || '—');
      if (!reach.has(i) && i !== 0) el('span', { style: 'font-size:9px;color:#c45a6a', title: 'Not reachable from line 0' }, hd, '⚠');
      if (ln.end) el('span', { style: 'font-size:9px;color:#c45a6a' }, hd, '■ end');
      const txt = el('div', { style: 'padding:6px 8px;font-size:11px;color:var(--txt);max-height:46px;overflow:hidden;line-height:1.35' }, node, (ln.text || '').slice(0, 96) || '(no text)');
      txt.style.opacity = ln.text ? '1' : '.5';
      const foot = el('div', { style: 'padding:4px 8px;border-top:1px solid var(--line);display:flex;gap:4px;flex-wrap:wrap' }, node);
      if (ln.choices && ln.choices.length) ln.choices.forEach(c => el('span', { style: 'font-size:9px;background:#22384f;color:#9fcdff;border-radius:8px;padding:1px 6px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, foot, '▸ ' + (c.label || '…')));
      else if (ln.goto != null) el('span', { style: 'font-size:9px;color:#c8a24f' }, foot, '→ goto ' + (ln.goto < 0 || ln.goto >= lines.length ? 'end' : '#' + ln.goto));
      else if (!ln.end) el('span', { style: 'font-size:9px;color:var(--txt2)' }, foot, i + 1 < lines.length ? '↡ continues to #' + (i + 1) : '↡ ends');
      nodeEls[i] = node;
      wireDrag(node, i);
      node.addEventListener('mousedown', e => { if (!/INPUT|BUTTON|SELECT|TEXTAREA/.test(e.target.tagName)) MT.select(i); });
    });
    // END sink node
    const pe = pos.end || (pos.end = { x: M + 4 * COLW, y: M });
    const endNode = el('div', { class: 'dlg-end', style: `position:absolute;left:${pe.x}px;top:${pe.y}px;width:96px;text-align:center;background:#3a1f25;border:1px solid #6a2e3a;border-radius:18px;padding:7px 8px;color:#e7b6bf;font-size:11px;cursor:grab;user-select:none` }, innerEl, '■ dialogue ends');
    nodeEls.end = endNode; wireDrag(endNode, 'end');
    sizeCanvas();
  }

  function sizeCanvas() {
    let w = 0, h = 0;
    for (const id in nodeEls) { const n = nodeEls[id], p = pos[id] || { x: 0, y: 0 }; w = Math.max(w, p.x + n.offsetWidth); h = Math.max(h, p.y + n.offsetHeight); }
    innerEl.style.width = (w + M * 2) + 'px'; innerEl.style.height = (h + M * 2) + 'px';
    svg.setAttribute('width', w + M * 2); svg.setAttribute('height', h + M * 2);
  }

  function center(id, side) {
    const n = nodeEls[id], p = pos[id]; if (!n || !p) return { x: 0, y: 0 };
    return { x: p.x + (side === 'out' ? n.offsetWidth : 0), y: p.y + n.offsetHeight / 2 };
  }
  function drawEdges() {
    [...svg.querySelectorAll('.dlg-edge')].forEach(e => e.remove());
    const colors = { flow: '#6a7280', goto: '#c8a24f', choice: '#4fa3ff', end: '#c45a6a' };
    const marker = { flow: 'ar-flow', goto: 'ar-goto', choice: 'ar-choice', end: 'ar-end' };
    computeEdges().forEach(e => {
      const a = center(e.from, 'out'), b = center(e.to, 'in');
      const dx = Math.max(36, Math.abs(b.x - a.x) * 0.4);
      const path = svgEl('path', {
        class: 'dlg-edge', d: `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`,
        fill: 'none', stroke: colors[e.kind], 'stroke-width': e.from === sel ? 2.4 : 1.5,
        'stroke-dasharray': e.kind === 'flow' ? '5 4' : '', opacity: e.from === sel ? 1 : 0.7,
        'marker-end': 'url(#' + marker[e.kind] + ')'
      });
      svg.appendChild(path);
      if (e.kind === 'choice' && e.label) {
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 - 4;
        const t = svgEl('text', { class: 'dlg-edge', x: mx, y: my, fill: '#bcd9ff', 'font-size': '10', 'text-anchor': 'middle', 'paint-order': 'stroke', stroke: '#0c1116', 'stroke-width': '3', 'stroke-linejoin': 'round' });
        t.textContent = e.label.slice(0, 18); svg.appendChild(t);
      }
    });
  }

  function paintSel() {
    for (const id in nodeEls) {
      if (id === 'end') continue;
      const isSel = (+id === sel), n = nodeEls[id];
      n.style.borderColor = isSel ? 'var(--acc)' : 'var(--line)';
      n.style.boxShadow = isSel ? '0 0 0 1px var(--acc)' : '0 4px 14px rgba(0,0,0,.35)';
    }
    drawEdges();
  }

  // ---- node dragging ----
  function wireDrag(node, id) {
    node.addEventListener('mousedown', e => {
      if (/INPUT|BUTTON|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      e.preventDefault(); node.style.cursor = 'grabbing';
      const sx = e.clientX, sy = e.clientY, ox = pos[id].x, oy = pos[id].y;
      const move = ev => { pos[id] = { x: Math.max(0, ox + (ev.clientX - sx)), y: Math.max(0, oy + (ev.clientY - sy)) }; node.style.left = pos[id].x + 'px'; node.style.top = pos[id].y + 'px'; drawEdges(); };
      const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); node.style.cursor = 'grab'; sizeCanvas(); saveLayout(); };
      document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
    });
  }

  // ================= inspector (right panel) =================
  function row(host, label) { const r = el('div', { class: 'tc-row', style: 'margin:6px 0' }, host); if (label != null) el('label', { style: 'width:96px' }, r, label); return r; }
  function gotoOptions(sel2, val, allowAuto) {
    const o = el('select', {}, sel2);
    if (allowAuto) el('option', { value: 'auto' }, o, '↡ continue (next line)');
    el('option', { value: 'end' }, o, '■ end dialogue');
    lines.forEach((ln, i) => el('option', { value: String(i) }, o, '#' + i + ' ' + (ln.speaker ? ln.speaker + ': ' : '') + (ln.text || '').slice(0, 18)));
    o.value = val; return o;
  }
  function renderInspector() {
    inspEl.innerHTML = '';
    const ln = lines[sel];
    if (!ln) { el('div', { class: 'tc-mut' }, inspEl, 'Select a line node on the left.'); return; }
    const hd = el('div', { style: 'display:flex;align-items:center;gap:6px;margin-bottom:6px' }, inspEl);
    el('h3', { style: 'margin:0;font-size:14px;flex:1' }, hd, 'Line #' + sel);
    el('button', { class: 'tbtn', title: 'Duplicate', onclick: () => MT.duplicateLine() }, hd, '⧉');
    el('button', { class: 'tbtn dangerBtn', title: 'Delete line', onclick: () => { if (!MT.removeLine()) T.toast('Keep at least one line.'); } }, hd, '🗑');

    const rs = row(inspEl, 'Speaker'); const sp = el('input', { type: 'text' }, rs); sp.value = ln.speaker || '';
    sp.addEventListener('input', () => { MT.setSpeaker(sel, sp.value); const n = nodeEls[sel]; if (n) n.querySelector('span:nth-child(2)').textContent = sp.value || '—'; });
    const rt = row(inspEl, 'Text'); rt.style.alignItems = 'flex-start';
    const ta = el('textarea', { rows: '4', style: 'flex:1;background:var(--bg3);color:var(--txt);border:1px solid #45454d;border-radius:5px;padding:5px 7px;font-size:13px;resize:vertical' }, rt); ta.value = ln.text || '';
    ta.addEventListener('input', () => { MT.setText(sel, ta.value); const n = nodeEls[sel]; if (n) { const t = n.children[1]; t.textContent = ta.value.slice(0, 96) || '(no text)'; t.style.opacity = ta.value ? '1' : '.5'; } });

    const re = row(inspEl); const cb = el('input', { type: 'checkbox' }, re); cb.checked = !!ln.end;
    el('label', { style: 'width:auto' }, re, 'Dialogue ends after this line');
    cb.addEventListener('change', () => MT.setEnd(sel, cb.checked));

    if (!ln.end && !(ln.choices && ln.choices.length)) {
      const rg = row(inspEl, 'On continue');
      const val = ln.goto == null ? 'auto' : ((ln.goto < 0 || ln.goto >= lines.length) ? 'end' : String(ln.goto));
      const g = gotoOptions(rg, val, true);
      g.addEventListener('change', () => MT.setGoto(sel, g.value));
    }

    el('h4', { style: 'margin:14px 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:var(--txt2)' }, inspEl, 'Choices' + (ln.choices && ln.choices.length ? ' · ' + ln.choices.length : ''));
    if (ln.choices && ln.choices.length) el('div', { class: 'tc-mut', style: 'font-size:11px;margin-bottom:4px' }, inspEl, 'When a line has choices the player must pick one; each jumps to its target and can set a flag, start/finish a quest, or fire a signal.');
    (ln.choices || []).forEach((c, ci) => {
      const card = el('div', { class: 'tc-card', style: 'margin:6px 0;padding:8px 10px' }, inspEl);
      const ch = el('div', { style: 'display:flex;gap:6px;align-items:center;margin-bottom:4px' }, card);
      const lab = el('input', { type: 'text', placeholder: 'choice label', style: 'flex:1;background:var(--bg3);color:var(--txt);border:1px solid #45454d;border-radius:5px;padding:4px 6px;font-size:12px' }, ch); lab.value = c.label || '';
      lab.addEventListener('input', () => MT.setChoice(sel, ci, 'label', lab.value));
      el('button', { class: 'tbtn', title: 'Remove choice', onclick: () => MT.removeChoice(sel, ci) }, ch, '✕');
      const rgo = row(card, 'Goto'); rgo.style.margin = '3px 0';
      const g = gotoOptions(rgo, (c.goto == null || c.goto < 0 || c.goto >= lines.length) ? 'end' : String(c.goto), false);
      g.addEventListener('change', () => MT.setChoice(sel, ci, 'goto', g.value));
      const adv = el('details', { style: 'margin-top:4px' }, card); el('summary', { style: 'cursor:pointer;font-size:11px;color:var(--txt2)' }, adv, 'flag · quest · signal');
      const mk = (lbl, key, ph) => { const r = row(adv, lbl); r.style.margin = '3px 0'; const inp = el('input', { type: 'text', placeholder: ph || '', style: 'flex:1;background:var(--bg3);color:var(--txt);border:1px solid #45454d;border-radius:5px;padding:4px 6px;font-size:12px' }, r); inp.value = c[key] || ''; inp.addEventListener('change', () => MT.setChoice(sel, ci, key, inp.value.trim())); return inp; };
      mk('Set flag', 'flag', 'flag id');
      mk('Finish quest', 'completeQuest', 'quest id');
      mk('Signal', 'signal', 'event-graph signal');
      const rq = row(adv, 'Start quest'); rq.style.margin = '3px 0';
      const qt = el('input', { type: 'text', placeholder: 'title', style: 'flex:1;background:var(--bg3);color:var(--txt);border:1px solid #45454d;border-radius:5px;padding:4px 6px;font-size:12px;min-width:0' }, rq); qt.value = (c.quest && c.quest.title) || '';
      const qo = el('input', { type: 'text', placeholder: 'objective', style: 'flex:1;background:var(--bg3);color:var(--txt);border:1px solid #45454d;border-radius:5px;padding:4px 6px;font-size:12px;min-width:0' }, rq); qo.value = (c.quest && c.quest.objective) || '';
      const setQ = () => MT.setChoiceQuest(sel, ci, qt.value, qo.value); qt.addEventListener('change', setQ); qo.addEventListener('change', setQ);
    });
    el('button', { class: 'tbtn', style: 'margin-top:6px', onclick: () => MT.addChoice(sel) }, inspEl, '+ Add choice');
  }

  T.registerTool({
    id: 'dialogue', label: 'Dialogue graph', icon: '💬', group: 'Narrative',
    sub: 'branching NPC dialogue · visual node graph',
    build(host) { build(host); }
  });
  if (T.roadmapDone) T.roadmapDone(22);
})();
