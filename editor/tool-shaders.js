// MOSSVEIL — tool-shaders.js : node-based shader graph editor (Edit ▸ World).  Roadmap #78.
// Authors the fullscreen screen-effect overlays (src/shaders.js -> data/shaders.js). Each GRAPH is a
// little DAG of typed nodes (sources · generators · math · colour · output); the editor draws them as
// draggable boxes wired by bezier curves, previews the result LIVE on the CPU (same evaluator the
// game uses), and shows the GENERATED GLSL. "Apply in game" picks the one graph the game composites
// on top of the frame (blend + opacity per graph). Saves through the data layer; applies immediately.
(function () {
  const T = G.Tools, SH = G.Shaders;
  if (!T || !SH || !SH.exportDefaults) return;
  const clone = o => JSON.parse(JSON.stringify(o));
  const META = {};            // type -> meta (filled on first use)
  SH.nodeMeta().forEach(m => META[m.type] = m);

  let data = null, dirty = false, bodyEl = null, api = null, gid = null;
  let pcv = null, sim = null, svg = null, canvasEl = null, armed = null, glslPre = null, drag = null;

  const NODE_W = 162, HEAD = 24, IROW = 19, INSET = 8;

  const MT = T.shaders = {
    get state() { return { data, dirty, gid }; },
    getWorking() { return gid ? data.graphs[gid] : null; },
    load() { data = clone(SH.exportCurrent()); dirty = false; if (!gid || !data.graphs[gid]) gid = Object.keys(data.graphs)[0] || null; },
    revert() { data = clone(SH.exportDefaults()); gid = Object.keys(data.graphs)[0] || null; dirty = true; if (bodyEl) render(); },
    applyToEngine() { SH.applyData(clone(data)); SH.invalidate(); },
    async save() { await api.data.save('shaders', 'SHADERS_DATA', data); MT.applyToEngine(); dirty = false; if (api) api.toast('Shader graphs saved'); if (bodyEl) render(); return true; },

    selectGraph(id) { if (data.graphs[id]) { gid = id; armed = null; if (bodyEl) render(); } },
    setActive(id) { data.active = (id && data.graphs[id]) ? id : ''; dirty = true; if (bodyEl) render(); },
    setGraphProp(k, v) { const g = MT.getWorking(); if (g) { g[k] = v; dirty = true; } },
    addGraph() {
      let base = 'graph', i = 1, id = base + i; while (data.graphs[id]) { i++; id = base + i; }
      data.graphs[id] = SH.cleanGraph({ name: 'New graph', blend: 'normal', opacity: 1, out: 'out', nodes: { out: { type: 'output', x: 360, y: 120, props: {}, ins: {} } } });
      gid = id; dirty = true; if (bodyEl) render(); return id;
    },
    removeGraph(id) {
      if (!data.graphs[id]) return;
      delete data.graphs[id];
      if (data.active === id) data.active = '';
      if (gid === id) gid = Object.keys(data.graphs)[0] || null;
      dirty = true; if (bodyEl) render();
    },
    renameGraph(id, name) { if (data.graphs[id]) { data.graphs[id].name = name; dirty = true; } },

    addNode(type) {
      const g = MT.getWorking(); if (!g || !META[type]) return null;
      let base = type, i = 1, id = base + i; while (g.nodes[id]) { i++; id = base + i; }
      const n = Object.keys(g.nodes).length;
      g.nodes[id] = SH.cleanNode({ type, x: 30 + (n % 6) * 26, y: 30 + (n % 6) * 26, props: {}, ins: {} });
      if (type === 'output' && (!g.out || !g.nodes[g.out])) g.out = id;
      dirty = true; if (bodyEl) render(); return id;
    },
    removeNode(id) {
      const g = MT.getWorking(); if (!g || !g.nodes[id]) return;
      delete g.nodes[id];
      for (const nid in g.nodes) { const ins = g.nodes[nid].ins; for (const p in ins) if (ins[p] === id) ins[p] = null; }
      if (g.out === id) g.out = null;
      if (armed === id) armed = null;
      dirty = true; if (bodyEl) render();
    },
    setNodeProp(id, key, v) { const g = MT.getWorking(); if (g && g.nodes[id] && key in g.nodes[id].props) { g.nodes[id].props[key] = v; dirty = true; updateGlsl(); } },
    moveNode(id, x, y) { const g = MT.getWorking(); if (g && g.nodes[id]) { g.nodes[id].x = Math.max(0, x | 0); g.nodes[id].y = Math.max(0, y | 0); dirty = true; } },
    // would connecting dst.port <- src create a cycle? (src must not already depend on dst)
    wouldCycle(src, dst) {
      const g = MT.getWorking(); if (!g) return false;
      const seen = {};
      const reach = id => { if (!id || !g.nodes[id] || seen[id]) return false; if (id === dst) return true; seen[id] = 1; const ins = g.nodes[id].ins; for (const p in ins) if (reach(ins[p])) return true; return false; };
      return reach(src);
    },
    connect(src, dst, port) {
      const g = MT.getWorking(); if (!g || !g.nodes[src] || !g.nodes[dst]) return false;
      if (META[g.nodes[dst].type].ins.indexOf(port) < 0) return false;
      if (src === dst || MT.wouldCycle(src, dst)) return false;
      g.nodes[dst].ins[port] = src; dirty = true; if (bodyEl) render(); return true;
    },
    disconnect(dst, port) { const g = MT.getWorking(); if (g && g.nodes[dst] && port in g.nodes[dst].ins) { g.nodes[dst].ins[port] = null; dirty = true; if (bodyEl) render(); } },
    setOutput(id) { const g = MT.getWorking(); if (g && g.nodes[id] && g.nodes[id].type === 'output') { g.out = id; dirty = true; if (bodyEl) render(); } },
    glslText() { const g = MT.getWorking(); return g ? SH.glsl(g) : ''; },
    openInTool() { return T.openTool('shaders'); }
  };

  function el(t, a, p, x) { return api.el(t, a, p, x); }

  // ============================================================ port geometry (analytic — matches layout)
  function inPortPos(node, idx) { return { x: node.x + INSET, y: node.y + HEAD + 6 + idx * IROW + IROW / 2 }; }
  function outPortPos(node) { return { x: node.x + NODE_W - INSET, y: node.y + HEAD / 2 + 1 }; }

  function drawWires() {
    if (!svg) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const g = MT.getWorking(); if (!g) return;
    const NS = 'http://www.w3.org/2000/svg';
    for (const id in g.nodes) {
      const n = g.nodes[id], meta = META[n.type];
      meta.ins.forEach((port, i) => {
        const src = n.ins[port]; if (!src || !g.nodes[src]) return;
        const a = outPortPos(g.nodes[src]), b = inPortPos(n, i);
        const path = document.createElementNS(NS, 'path');
        const dx = Math.max(28, Math.abs(b.x - a.x) * 0.5);
        path.setAttribute('d', 'M' + a.x + ',' + a.y + ' C' + (a.x + dx) + ',' + a.y + ' ' + (b.x - dx) + ',' + b.y + ' ' + b.x + ',' + b.y);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', META[n.type].cat === 'Output' ? '#7fd1ff' : '#6c9cc7');
        path.setAttribute('stroke-width', '2');
        svg.appendChild(path);
      });
    }
    // size the svg to cover the node bounds
    let mx = 600, my = 360;
    for (const id in g.nodes) { mx = Math.max(mx, g.nodes[id].x + NODE_W + 40); my = Math.max(my, g.nodes[id].y + 220); }
    svg.setAttribute('width', mx); svg.setAttribute('height', my);
    svg.style.width = mx + 'px'; svg.style.height = my + 'px';
  }

  // ============================================================ live CPU preview (over a structured backdrop)
  function frame(now) {
    if (!pcv || !document.body.contains(pcv)) { sim = null; return; }
    const dt = Math.min(0.05, (now - sim.last) / 1000 || 0.016); sim.last = now; sim.t += dt;
    draw(sim.t); requestAnimationFrame(frame);
  }
  function draw(t) {
    if (!pcv) return;
    const cx = pcv.getContext('2d'), W = pcv.width, H = pcv.height;
    // backdrop: a graded sky + ground band + a bright disc, so alpha overlays are visible
    const grd = cx.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, '#2a3550'); grd.addColorStop(0.62, '#42506a'); grd.addColorStop(0.63, '#243024'); grd.addColorStop(1, '#101a12');
    cx.fillStyle = grd; cx.fillRect(0, 0, W, H);
    cx.fillStyle = 'rgba(255,235,170,0.85)'; cx.beginPath(); cx.arc(W * 0.7, H * 0.32, H * 0.13, 0, Math.PI * 2); cx.fill();
    const g = MT.getWorking(); if (!g) return;
    const img = cx.getImageData(0, 0, W, H), d = img.data, add = g.blend === 'additive', op = g.opacity;
    const step = 3;
    for (let py = 0; py < H; py += step) {
      const uy = 1 - py / H;
      for (let px = 0; px < W; px += step) {
        const o = SH.evalCPU(g, px / W, uy, t);
        const a = Math.max(0, Math.min(1, o.a)) * op;
        if (a <= 0.001 && !add) continue;
        const or = o.r * 255, og = o.g * 255, ob = o.b * 255;
        for (let yy = py; yy < py + step && yy < H; yy++) for (let xx = px; xx < px + step && xx < W; xx++) {
          const k = (yy * W + xx) * 4;
          if (add) { d[k] = Math.min(255, d[k] + or * a); d[k + 1] = Math.min(255, d[k + 1] + og * a); d[k + 2] = Math.min(255, d[k + 2] + ob * a); }
          else { d[k] = d[k] * (1 - a) + or * a; d[k + 1] = d[k + 1] * (1 - a) + og * a; d[k + 2] = d[k + 2] * (1 - a) + ob * a; }
        }
      }
    }
    cx.putImageData(img, 0, 0);
    cx.fillStyle = 'rgba(230,240,255,0.85)'; cx.font = '11px monospace'; cx.textAlign = 'left'; cx.textBaseline = 'top';
    cx.fillText(g.name + '  ·  ' + g.blend + '  ·  ' + Object.keys(g.nodes).length + ' nodes', 7, 6);
    if (data.active === gid) { cx.fillStyle = 'rgba(140,255,170,0.95)'; cx.fillText('● applied in game', 7, H - 16); }
  }
  function startSim() { sim = { t: 0, last: performance.now() }; draw(0); requestAnimationFrame(frame); }
  function updateGlsl() { if (glslPre) glslPre.textContent = MT.glslText(); }

  // ============================================================ render
  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:0;display:flex;flex-direction:column';

    // ---- top toolbar ----
    const head = el('div', { style: 'display:flex;align-items:center;gap:8px;padding:9px 14px;border-bottom:1px solid var(--line);flex-wrap:wrap' }, bodyEl);
    el('button', { class: 'tbtn play', onclick: () => MT.save().catch(e => api.toast('Save failed: ' + e.message)) }, head, '💾 Save');
    el('button', { class: 'tbtn', onclick: () => { if (confirm('Reset ALL shader graphs to defaults?')) MT.revert(); } }, head, '↺ Revert');
    el('span', { class: 'tc-mut' }, head, dirty ? '● unsaved' : 'saved ✓');
    el('div', { style: 'width:10px' }, head);

    // graph selector
    el('label', { class: 'tc-mut' }, head, 'Graph');
    const gsel = el('select', {}, head);
    Object.keys(data.graphs).forEach(id => { const o = el('option', { value: id }, gsel, data.graphs[id].name + '  (' + id + ')'); if (id === gid) o.selected = true; });
    gsel.addEventListener('change', () => MT.selectGraph(gsel.value));
    el('button', { class: 'tbtn', title: 'new graph', onclick: () => MT.addGraph() }, head, '➕');
    el('button', { class: 'tbtn', title: 'rename graph', onclick: () => { const nm = prompt('Graph name', MT.getWorking().name); if (nm != null) { MT.renameGraph(gid, nm); render(); } } }, head, '✎');
    el('button', { class: 'tbtn', title: 'delete graph', onclick: () => { if (Object.keys(data.graphs).length > 1 && confirm('Delete graph “' + MT.getWorking().name + '”?')) MT.removeGraph(gid); } }, head, '✕');

    el('div', { style: 'flex:1' }, head);
    // apply-in-game + blend + opacity
    const ag = el('label', { class: 'tc-row', style: 'gap:5px', title: 'composite this graph over the game frame' }, head);
    const cb = el('input', { type: 'checkbox' }, ag); cb.checked = data.active === gid;
    cb.addEventListener('change', () => MT.setActive(cb.checked ? gid : ''));
    el('span', {}, ag, 'Apply in game');
    const g0 = MT.getWorking();
    el('label', { class: 'tc-mut' }, head, 'Blend');
    const bsel = el('select', {}, head); ['normal', 'additive'].forEach(b => { const o = el('option', { value: b }, bsel, b); if (g0 && g0.blend === b) o.selected = true; });
    bsel.addEventListener('change', () => { MT.setGraphProp('blend', bsel.value); });
    el('label', { class: 'tc-mut' }, head, 'Opacity');
    const op = el('input', { type: 'range', min: '0', max: '1', step: '0.01', style: 'width:80px' }, head); op.value = g0 ? g0.opacity : 1;
    op.addEventListener('input', () => MT.setGraphProp('opacity', +op.value));

    // ---- body: node palette | graph canvas | side (preview + glsl) ----
    const grid = el('div', { style: 'flex:1;display:grid;grid-template-columns:150px 1fr 360px;min-height:0' }, bodyEl);

    // palette
    const pal = el('div', { style: 'border-right:1px solid var(--line);overflow:auto;padding:8px;display:flex;flex-direction:column;gap:8px' }, grid);
    el('div', { class: 'tc-mut', style: 'font-size:11px' }, pal, 'Add node');
    const cats = {}; SH.nodeMeta().forEach(m => (cats[m.cat] = cats[m.cat] || []).push(m));
    ['Source', 'Generator', 'Math', 'Colour', 'Output'].forEach(cat => {
      if (!cats[cat]) return;
      el('div', { class: 'tc-mut', style: 'font-size:10px;text-transform:uppercase;letter-spacing:0.5px;opacity:0.7;margin-top:4px' }, pal, cat);
      cats[cat].forEach(m => el('button', { class: 'tbtn', style: 'text-align:left;font-size:12px', title: m.type, onclick: () => MT.addNode(m.type) }, pal, m.label));
    });

    // canvas
    const wrap = el('div', { style: 'position:relative;overflow:auto;background:repeating-linear-gradient(0deg,#161a22,#161a22 23px,#1a1f29 23px,#1a1f29 24px),repeating-linear-gradient(90deg,#161a22,#161a22 23px,#1a1f29 23px,#1a1f29 24px);min-height:0' }, grid);
    canvasEl = el('div', { style: 'position:relative;width:1400px;height:900px' }, wrap);
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '1400'); svg.setAttribute('height', '900');
    svg.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none';
    canvasEl.appendChild(svg);
    const g = MT.getWorking();
    if (g) for (const id in g.nodes) nodeBox(id);
    drawWires();

    // side panel: preview + glsl
    const side = el('div', { style: 'border-left:1px solid var(--line);display:flex;flex-direction:column;min-height:0' }, grid);
    const pv = el('div', { style: 'padding:12px;display:flex;flex-direction:column;gap:6px' }, side);
    el('div', { class: 'tc-mut' }, pv, 'Live preview (CPU — same maths the game runs)');
    pcv = el('canvas', { width: '320', height: '200', style: 'border:1px solid var(--line);border-radius:6px;background:#0d1018;width:100%' }, pv);
    el('div', { class: 'tc-mut', style: 'font-size:11px' }, pv, armed ? 'Click an input ● to wire from “' + armed + '”, or click the output ● again to cancel.' : 'Click a node’s output ● then an input ● to wire them. Drag headers to arrange.');
    const gl = el('div', { style: 'flex:1;border-top:1px solid var(--line);display:flex;flex-direction:column;min-height:0;padding:10px 12px' }, side);
    el('div', { class: 'tc-mut', style: 'margin-bottom:4px' }, gl, 'Generated GLSL (compiled from the graph)');
    glslPre = el('pre', { style: 'flex:1;overflow:auto;margin:0;font-size:10px;line-height:1.35;background:#0c0f16;border:1px solid var(--line);border-radius:6px;padding:8px;white-space:pre;color:#bcd' }, gl);
    updateGlsl();
    startSim();
  }

  // ---- one node box ----
  function nodeBox(id) {
    const g = MT.getWorking(), n = g.nodes[id], meta = META[n.type];
    const isOut = n.type === 'output', isRoot = g.out === id;
    const box = el('div', {
      'data-node': id,
      style: 'position:absolute;left:' + n.x + 'px;top:' + n.y + 'px;width:' + NODE_W + 'px;background:#222836;border:1px solid ' + (isRoot ? '#7fd1ff' : (armed === id ? '#ffd27f' : '#3a4356')) + ';border-radius:7px;box-shadow:0 4px 14px rgba(0,0,0,0.4);font-size:12px;user-select:none'
    }, canvasEl);
    // header (drag handle)
    const hd = el('div', { class: 'shnode-head', style: 'display:flex;align-items:center;gap:5px;padding:3px 7px;height:' + HEAD + 'px;box-sizing:border-box;cursor:move;background:' + catColor(meta.cat) + ';border-radius:6px 6px 0 0' }, box);
    el('span', { style: 'font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, hd, meta.label + (isRoot ? ' ◀' : ''));
    if (isOut && !isRoot) el('button', { class: 'tbtn', style: 'padding:0 5px;font-size:10px', title: 'use as the graph output', onclick: () => MT.setOutput(id) }, hd, '◎');
    el('button', { class: 'tbtn', style: 'padding:0 5px', title: 'delete node', onclick: () => MT.removeNode(id) }, hd, '✕');
    hd.addEventListener('pointerdown', ev => startDrag(ev, id, box));
    // output port (top-right)
    if (meta.ret !== 'out') {
      const od = el('span', { class: 'shport', title: 'output', style: portCss('#9bd', n.x, n.y, NODE_W - INSET - 4, HEAD / 2 - 5, armed === id) }, box);
      od.style.position = 'absolute'; od.style.right = '3px'; od.style.top = (HEAD / 2 - 5) + 'px';
      od.addEventListener('click', () => { armed = (armed === id) ? null : id; render(); });
    }
    // input ports + labels
    const insWrap = el('div', { style: 'padding:6px 7px 4px;display:flex;flex-direction:column;gap:' + (IROW - 13) + 'px' }, box);
    meta.ins.forEach(port => {
      const row = el('div', { style: 'display:flex;align-items:center;gap:6px;height:13px' }, insWrap);
      const dot = el('span', { class: 'shport', title: 'input ' + port, style: 'width:10px;height:10px;border-radius:50%;background:' + (n.ins[port] ? '#7fd1ff' : '#566') + ';border:1px solid #99b;cursor:pointer;flex:none' }, row);
      dot.addEventListener('click', () => {
        if (n.ins[port]) { MT.disconnect(id, port); return; }
        if (armed && armed !== id) { const a = armed; armed = null; MT.connect(a, id, port); }
      });
      el('span', { style: 'opacity:0.85;flex:1' }, row, port + (n.ins[port] ? ' ← ' + n.ins[port] : ''));
    });
    // props
    if (meta.props.length) {
      const pr = el('div', { style: 'padding:2px 8px 8px;display:flex;flex-direction:column;gap:3px' }, box);
      meta.props.forEach(ps => propRow(pr, id, ps));
    }
  }
  function propRow(parent, id, ps) {
    const n = MT.getWorking().nodes[id];
    const isCol = /^(r|g|b)\d?$/.test(ps.key);
    const r = el('div', { style: 'display:flex;align-items:center;gap:5px' }, parent);
    el('label', { style: 'flex:1;font-size:11px;opacity:0.85' }, r, ps.key);
    const inp = el('input', { type: 'range', min: '' + ps.min, max: '' + ps.max, step: ps.int ? '1' : (Math.abs(ps.max - ps.min) > 20 ? '0.5' : '0.01'), style: 'width:70px' }, r);
    inp.value = n.props[ps.key];
    const nm = el('input', { type: 'number', min: '' + ps.min, max: '' + ps.max, step: ps.int ? '1' : 'any', style: 'width:46px;font-size:11px' }, r);
    nm.value = n.props[ps.key];
    inp.addEventListener('input', () => { nm.value = inp.value; MT.setNodeProp(id, ps.key, +inp.value); });
    nm.addEventListener('change', () => { inp.value = nm.value; MT.setNodeProp(id, ps.key, +nm.value); });
  }
  function portCss() { return 'width:11px;height:11px;border-radius:50%;background:#9bd;border:1px solid #ccd;cursor:pointer'; }
  function catColor(cat) { return ({ Source: '#2c3a4a', Generator: '#2c4a3a', Math: '#3a3a4a', Colour: '#4a2c44', Output: '#1f3a4a' })[cat] || '#333'; }

  // ---- node drag ----
  function startDrag(ev, id, box) {
    ev.preventDefault();
    const g = MT.getWorking(), n = g.nodes[id];
    drag = { id, box, sx: ev.clientX, sy: ev.clientY, ox: n.x, oy: n.y };
    box.setPointerCapture && box.setPointerCapture(ev.pointerId);
    window.addEventListener('pointermove', onDrag);
    window.addEventListener('pointerup', endDrag);
  }
  function onDrag(ev) {
    if (!drag) return;
    const nx = Math.max(0, drag.ox + (ev.clientX - drag.sx)), ny = Math.max(0, drag.oy + (ev.clientY - drag.sy));
    drag.box.style.left = nx + 'px'; drag.box.style.top = ny + 'px';
    MT.moveNode(drag.id, nx, ny); drawWires();
  }
  function endDrag() { drag = null; window.removeEventListener('pointermove', onDrag); window.removeEventListener('pointerup', endDrag); }

  T.registerTool({
    id: 'shaders', label: 'Shader graph', icon: '🌀', group: 'World',
    sub: 'node-based · screen overlay · GLSL',
    build(host, a) { api = a; bodyEl = host; if (!data) MT.load(); render(); }
  });
  if (T.roadmapDone) T.roadmapDone(78);
})();
