// MOSSVEIL — tool-guides.js : Rulers, guides, align & neighbour view (Edit ▸ Tools).  #44 #43 #41.
// Three scene-authoring aids, all drawn through ONE overlay seam in editor.js (G.Tools.overlayDraw), so
// the editor's hot paths are untouched:
//   • Rulers (#44)   — a faint coordinate grid + tile-number ticks along the room's top & left edges.
//   • Guides (#44)   — coloured reference lines you drop at any X/Y (or presets: centre, thirds), and a
//                      one-click "snap selection to nearest guide".
//   • Align (#43)    — align / distribute the multi-selection (left·centre·right·top·middle·bottom·dist).
//   • Neighbours(#41)— ghost outlines + labels at every exit showing which room it leads to (multi-room
//                      context without rebuilding adjacent scenes).
// Everything is OFF by default (the seam early-returns), editor-only and fully offline.
(function () {
  const T = G.Tools;
  if (!T) return;
  const ED = () => G.__ed || {};
  const levels = () => G.LEVELS || {};
  const KEY = 'mossveil-ed-guides';

  const state = { rulers: false, ghosts: false, guides: [], step: 5 };
  try { Object.assign(state, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (_) { }
  if (!Array.isArray(state.guides)) state.guides = [];
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) { } };

  function guideCoords() {
    const xs = [], ys = [];
    state.guides.forEach(g => { if (g.axis === 'x') xs.push(g.at); else ys.push(g.at); });
    return { xs, ys };
  }

  // ---- the overlay drawer (called every frame by editor.js when in the Scene tab) ----
  function overlayDraw(ctx, U, L) {
    if (!L || !U || !U.toScreen) return;
    if (!state.rulers && !state.ghosts && !state.guides.length) return;   // nothing to do — stay cheap
    const S = (x, y) => U.toScreen(x, y);

    // rulers: faint grid + tile-number labels
    if (state.rulers) {
      const step = Math.max(2, state.step | 0 || 5);
      ctx.save();
      ctx.lineWidth = 1; ctx.font = '9px Segoe UI'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      for (let c = 0; c <= L.w; c += step) {
        const a = S(c, L.h), b = S(c, 0);
        ctx.strokeStyle = 'rgba(120,180,230,0.12)'; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.fillStyle = 'rgba(150,190,230,0.7)'; ctx.fillText(String(c), a.x + 2, a.y + 1);
      }
      for (let r = 0; r <= L.h; r += step) {
        const a = S(0, r), b = S(L.w, r);
        ctx.strokeStyle = 'rgba(120,180,230,0.12)'; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.fillStyle = 'rgba(150,190,230,0.7)'; ctx.fillText(String(r), a.x + 2, a.y + 1);
      }
      ctx.restore();
    }

    // guides: bright reference lines at chosen coords
    if (state.guides.length) {
      ctx.save(); ctx.lineWidth = 1.2; ctx.setLineDash([6, 4]); ctx.font = '10px Segoe UI';
      state.guides.forEach(g => {
        ctx.strokeStyle = 'rgba(95,214,168,0.9)'; ctx.fillStyle = 'rgba(95,214,168,0.95)';
        if (g.axis === 'x') { const a = S(g.at, L.h), b = S(g.at, 0); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.fillText('x' + g.at, a.x + 3, a.y + 11); }
        else { const a = S(0, g.at), b = S(L.w, g.at); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.fillText('y' + g.at, a.x + 3, a.y - 3); }
      });
      ctx.restore();
    }

    // neighbour ghosts: each exit labelled with where it leads + a ghost box just outside that edge
    if (state.ghosts) {
      ctx.save(); ctx.font = '10px Segoe UI'; ctx.textAlign = 'center';
      (L.transitions || []).forEach(t => {
        let cx, cy, dir;   // dir: which room edge this exit sits on
        if (t.rect) {
          cx = t.rect.x; cy = t.rect.y;
          dir = cx < L.w * 0.25 ? 'L' : cx > L.w * 0.75 ? 'R' : cy > L.h * 0.6 ? 'T' : 'B';
        } else if (t.side === 'L') { cx = 0; cy = L.h / 2; dir = 'L'; }
        else if (t.side === 'R') { cx = L.w; cy = L.h / 2; dir = 'R'; }
        else if (t.side === 'T') { cx = (t.x0 + t.x1 + 1) / 2; cy = L.h; dir = 'T'; }
        else { cx = (t.x0 != null ? (t.x0 + t.x1 + 1) / 2 : L.w / 2); cy = 0; dir = 'B'; }
        const off = 4;   // ghost offset (tiles) outside the room
        let gx = cx, gy = cy, gw = 6, gh = 3;
        if (dir === 'L') { gx = -off - gw / 2; }
        else if (dir === 'R') { gx = L.w + off + gw / 2; }
        else if (dir === 'T') { gy = L.h + off; }
        else { gy = -off; }
        const a = S(gx - gw / 2, gy + gh / 2), b = S(gx + gw / 2, gy - gh / 2);
        ctx.strokeStyle = 'rgba(150,200,255,0.5)'; ctx.fillStyle = 'rgba(150,200,255,0.08)'; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.2;
        ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y); ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y); ctx.setLineDash([]);
        const dest = (levels()[t.to] && (levels()[t.to].title || t.to)) || t.to || '?';
        ctx.fillStyle = 'rgba(190,220,255,0.95)'; const m = S(gx, gy); ctx.fillText('→ ' + dest, m.x, m.y - (b.y - a.y) / 2 - 4);
      });
      ctx.restore();
    }
  }
  T.overlayDraw = overlayDraw;

  // ---- guide management ----
  function addGuide(axis, at) { at = +(+at).toFixed(2); if (!isFinite(at)) return false; if (axis !== 'x' && axis !== 'y') return false; if (state.guides.some(g => g.axis === axis && g.at === at)) return true; state.guides.push({ axis, at }); persist(); return true; }
  function removeGuide(i) { if (i >= 0 && i < state.guides.length) { state.guides.splice(i, 1); persist(); return true; } return false; }
  function clearGuides() { state.guides = []; persist(); }
  function snapToGuides() { const c = guideCoords(); if (!c.xs.length && !c.ys.length) return 0; return (ED().alignOps ? ED().alignOps('snapGuides', c) : 0); }
  const align = mode => (ED().alignOps ? ED().alignOps(mode) : 0);

  // =================== test / external API ===================
  T.guides = {
    state, overlayDraw, guideCoords,
    setRuler: v => { state.rulers = !!v; persist(); }, setGhosts: v => { state.ghosts = !!v; persist(); }, setStep: n => { state.step = Math.max(2, n | 0); persist(); },
    addGuide, removeGuide, clearGuides, snapToGuides, align,
    open: () => T.openTool('guides')
  };

  // =================== UI ===================
  let bodyEl = null, api = null;
  function el(t, a, p, x) { return api.el(t, a, p, x); }

  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:14px 16px;display:flex;flex-direction:column;gap:14px;height:100%;overflow:auto';
    const cur = ED().currentId ? ED().currentId() : null, L = cur ? levels()[cur] : null;

    el('div', { class: 'tc-mut', style: 'font-size:12px;line-height:1.5' }, bodyEl, 'Visual aids drawn over the open room. Toggles take effect immediately in the Scene viewport.');

    // toggles
    const tog = el('div', { style: 'display:flex;flex-direction:column;gap:8px;padding:11px;border:1px solid var(--line);border-radius:8px' }, bodyEl);
    const toggle = (label, key) => {
      const row = el('label', { style: 'display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer' }, tog);
      const cb = el('input', { type: 'checkbox' }, row); cb.checked = !!state[key];
      row.appendChild(document.createTextNode(label));
      cb.addEventListener('change', () => { state[key] = cb.checked; persist(); });
    };
    toggle('📐 Rulers — coordinate grid + tile numbers', 'rulers');
    toggle('👻 Neighbour ghosts — show where each exit leads', 'ghosts');
    const srow = el('div', { class: 'tc-row' }, tog); el('label', {}, srow, 'Grid step');
    const stepIn = el('input', { type: 'number', min: '2', max: '50', value: state.step, style: 'max-width:70px' }, srow);
    stepIn.addEventListener('input', () => { state.step = Math.max(2, parseInt(stepIn.value, 10) || 5); persist(); });

    // guides
    const gbox = el('div', { style: 'display:flex;flex-direction:column;gap:8px;padding:11px;border:1px solid var(--line);border-radius:8px' }, bodyEl);
    el('div', { style: 'font-size:13px;color:var(--txt)' }, gbox, 'Guides');
    const addRow = el('div', { class: 'tc-row' }, gbox);
    el('label', {}, addRow, 'Add at');
    const axisSel = el('select', { style: 'max-width:120px' }, addRow); el('option', { value: 'x' }, axisSel, 'Vertical (X)'); el('option', { value: 'y' }, axisSel, 'Horizontal (Y)');
    const atIn = el('input', { type: 'number', value: L ? Math.round(L.w / 2) : 10, style: 'max-width:70px' }, addRow);
    const addBtn = el('button', { class: 'tbtn' }, addRow, '+ Add');
    addBtn.addEventListener('click', () => { addGuide(axisSel.value, atIn.value); render(); });
    if (L) {
      const presets = el('div', { style: 'display:flex;gap:5px;flex-wrap:wrap' }, gbox);
      const pb = (label, fn) => { const b = el('button', { class: 'tbtn', style: 'padding:3px 9px;font-size:11px' }, presets, label); b.addEventListener('click', () => { fn(); render(); }); };
      pb('Centre', () => { addGuide('x', L.w / 2); addGuide('y', L.h / 2); });
      pb('V thirds', () => { addGuide('x', L.w / 3); addGuide('x', 2 * L.w / 3); });
      pb('H thirds', () => { addGuide('y', L.h / 3); addGuide('y', 2 * L.h / 3); });
    }
    if (!state.guides.length) el('div', { class: 'tc-mut', style: 'font-size:11px' }, gbox, 'No guides yet.');
    state.guides.forEach((g, i) => {
      const row = el('div', { class: 'tc-row', style: 'margin:1px 0;align-items:center' }, gbox);
      el('span', { style: 'flex:1;font-size:12px;color:var(--txt)' }, row, (g.axis === 'x' ? 'Vertical  x = ' : 'Horizontal  y = ') + g.at);
      const rm = el('button', { class: 'tbtn', style: 'padding:1px 8px' }, row, '✕'); rm.addEventListener('click', () => { removeGuide(i); render(); });
    });
    if (state.guides.length) {
      const grow = el('div', { style: 'display:flex;gap:6px;margin-top:4px' }, gbox);
      const snap = el('button', { class: 'tbtn', style: 'padding:5px 10px' }, grow, '🧲 Snap selection to guides');
      snap.addEventListener('click', () => { const n = snapToGuides(); api.toast(n ? 'Snapped ' + n + ' object(s) to guides' : 'Select objects in the scene first'); });
      const clr = el('button', { class: 'tbtn', style: 'padding:5px 10px' }, grow, 'Clear all'); clr.addEventListener('click', () => { clearGuides(); render(); });
    }

    // align & distribute
    const abox = el('div', { style: 'display:flex;flex-direction:column;gap:8px;padding:11px;border:1px solid var(--line);border-radius:8px' }, bodyEl);
    el('div', { style: 'font-size:13px;color:var(--txt)' }, abox, 'Align & distribute selection');
    el('div', { class: 'tc-mut', style: 'font-size:11px' }, abox, 'Select 2+ objects (marquee-drag or Shift-click), then:');
    const mkRow = (label, items) => {
      const r = el('div', { style: 'display:flex;gap:5px;flex-wrap:wrap;align-items:center' }, abox);
      el('span', { class: 'tc-mut', style: 'width:64px;font-size:11px' }, r, label);
      items.forEach(([m, lab]) => { const b = el('button', { class: 'tbtn', style: 'padding:4px 9px;font-size:11px' }, r, lab); b.addEventListener('click', () => { const n = align(m); api.toast(n ? (n + ' object(s) ' + (m.indexOf('dist') === 0 ? 'distributed' : 'aligned')) : 'Select ' + (m.indexOf('dist') === 0 ? '3+' : '2+') + ' objects first'); }); });
    };
    mkRow('Horizontal', [['left', '⬅ Left'], ['centerH', '↔ Centre'], ['right', '➡ Right'], ['distH', '⇿ Distribute']]);
    mkRow('Vertical', [['bottom', '⬇ Bottom'], ['centerV', '↕ Middle'], ['top', '⬆ Top'], ['distV', '⤢ Distribute']]);

    if (!L) el('div', { class: 'tc-mut', style: 'font-size:11px' }, bodyEl, 'Open a room to use these aids.');
  }

  T.registerTool({
    id: 'guides', label: 'Rulers, guides & align', icon: '📐', group: 'Tools',
    sub: 'coordinate grid · drop guides · align / distribute · neighbour exits',
    build(host, a) { api = a; bodyEl = host; render(); }
  });
  if (T.roadmapDone) T.roadmapDone(44, 43, 41);
})();
