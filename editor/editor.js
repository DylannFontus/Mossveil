// MOSSVEIL Editor — Unity-style level editor for the game's data-driven levels.
(function () {
  const U = G.U;
  G.EDITOR = true;
  G.save = {};
  G.time = 0;
  G.hitStop = 0;

  // ---------------- state ----------------
  let currentId = Object.keys(G.LEVELS)[0] || null;
  let tool = 'select';
  let tab = 'scene';            // 'scene' | 'map'
  let snap = true, gizmos = true, scatter = false;
  let dirty = false;
  let sel = null;               // {kind:'prop'|'enemy'|'zone'|'spawn', i | key}
  let multi = [];               // additional multi-selection (array of sel descriptors)
  let marquee = null;           // rubber-band box {x0,y0,x1,y1} in world coords
  let clipboard = null;         // copied cluster {items,ox,oy}
  let lastWorld = { x: 0, y: 0 };
  let prefabs = {};             // name -> captured cluster
  try { prefabs = JSON.parse(localStorage.getItem('mossveil-ed-prefabs')) || {}; } catch (e) { }
  try { clipboard = JSON.parse(localStorage.getItem('mossveil-ed-clip')) || null; } catch (e) { }
  let placing = null;           // asset descriptor being placed
  let undoStack = [], redoStack = [];
  let rebuildTimer = 0, needsRebuild = false;
  const previewGroups = [];     // boss ghost previews

  const lvl = () => G.LEVELS[currentId];

  // ---- cutscene editor state ----
  let csMode = false;            // Scenes tab active
  let csCurrent = null;          // current cutscene id
  let csSel = -1;                // selected event index (-1 = cutscene-level props)
  let csDirty = false;
  let csDrag = null;             // active timeline block drag
  let csPreview = null;          // in-viewport cutscene preview { id, restoreId, sx, sy, lastCam, done }
  const csCur = () => G.CUTSCENES && G.CUTSCENES[csCurrent];

  // event type schema: default params + inspector fields. t & dur are implicit on every event.
  const CS_EVENTS = {
    fade: { dur: 1, def: { from: 1, to: 0 }, fields: [['from', 'num'], ['to', 'num']], hint: 'screen-black overlay alpha (1=black)' },
    letterbox: { dur: 0.6, def: { from: 0, to: 1 }, fields: [['from', 'num'], ['to', 'num']], hint: 'cinematic bar coverage (0=none,1=full)' },
    blur: { dur: 0.7, def: { from: 0, to: 6 }, fields: [['from', 'num'], ['to', 'num']], hint: 'world blur in pixels' },
    text: { dur: 4, def: { text: 'Some words...' }, fields: [['text', 'text']], hint: 'centred caption (fades in & out)' },
    camera: { dur: 3, def: { dx: 0, dy: 1, z: 18 }, fields: [['dx', 'num'], ['dy', 'num'], ['z', 'num']], hint: 'move camera to spawn + (dx,dy) at distance z' },
    cameraRestore: { dur: 2.6, def: {}, fields: [], hint: 'dolly the camera back to the gameplay framing for a seamless handoff (put this last)' },
    shakePulse: { dur: 0.4, def: { amp: 0.3 }, fields: [['amp', 'num']], hint: 'one screen-shake burst' },
    sfx: { dur: 0.1, def: { name: 'chime' }, fields: [['name', 'text']], hint: 'play a sound (chime, rumble, quake, roar, bench...)' },
    riseFromGround: { dur: 10, def: { depth: 2.4 }, fields: [['depth', 'num']], hint: 'protagonist rises out of the earth (clip + debris + shake)' },
    wake: { dur: 1, def: {}, fields: [], hint: 'eyes open with a shudder' },
    stand: { dur: 5, def: {}, fields: [], hint: 'rise from crumpled to upright' },
    look: { dur: 1, def: { dir: -1 }, fields: [['dir', 'num']], hint: 'turn to face dir (-1 left, 1 right)' },
    talk: { dur: 2.5, def: { speed: 9 }, fields: [['speed', 'num']], hint: 'speaking — rhythmic head/body bob + blips' },
    confused: { dur: 2.5, def: {}, fields: [], hint: 'puzzled head tilt + ? bubble' },
    surprised: { dur: 1, def: {}, fields: [], hint: 'startled jolt, wide eyes + ! bubble' },
    nod: { dur: 1.4, def: { speed: 6 }, fields: [['speed', 'num']], hint: 'nod yes' },
    shakeHead: { dur: 1.4, def: { speed: 7 }, fields: [['speed', 'num']], hint: 'shake head no' },
    laugh: { dur: 2.5, def: {}, fields: [], hint: 'bouncy laughter + note' },
    sad: { dur: 2.5, def: {}, fields: [], hint: 'downcast droop + … bubble' },
    fear: { dur: 1.8, def: {}, fields: [], hint: 'trembling fear' },
    excited: { dur: 1.8, def: {}, fields: [], hint: 'happy little hops + ! bubble' },
    collapse: { dur: 1.2, def: {}, fields: [], hint: 'crumple to the ground' },
    walk: { dur: 2.5, def: { dx: 4 }, fields: [['dx', 'num']], hint: 'walk to spawn + dx (legs animate, body moves)' },
    emote: { dur: 1.2, def: { symbol: '!' }, fields: [['symbol', 'text']], hint: 'float a symbol above the head: ! ? … ♪ ♥ z' },
    flash: { dur: 0.4, def: {}, fields: [], hint: 'bright screen flash' },
    hold: { dur: 1, def: {}, fields: [], hint: 'do nothing for a beat' }
  };

  // ---------------- dom ----------------
  const $ = id => document.getElementById(id);
  const glCanvas = $('gl'), overlay = $('overlay'), mapCanvas = $('mapCanvas');
  const octx = overlay.getContext('2d'), mctx = mapCanvas.getContext('2d');

  function el(tag, attrs, parent, text) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'style') e.style.cssText = attrs[k];
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    }
    if (text !== undefined) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }

  // ---------------- three setup ----------------
  const FOV = 32;
  const renderer = G.renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  const scene = G.scene = new THREE.Scene();
  const camera = G.camera = new THREE.PerspectiveCamera(FOV, 1, 1, 300);
  let camX = 20, camY = 10, camZ = 34;
  let postOn = true;   // WYSIWYG: show the game's post-processing in the editor viewport
  G.FX.init(scene);
  if (G.Post) G.Post.init();

  function resize() {
    const r = $('viewportWrap').getBoundingClientRect();
    G.viewW = r.width; G.viewH = r.height;
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
    const dpr = Math.min(2, devicePixelRatio || 1);
    overlay.width = r.width * dpr; overlay.height = r.height * dpr;
    mapCanvas.width = r.width * dpr; mapCanvas.height = r.height * dpr;
    G.pxScale = (renderer.domElement.height / 2) / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    G.FX.resize(renderer.domElement.height, FOV);
    if (G.Post) G.Post.resize();
  }
  addEventListener('resize', resize);

  // ---- resizable panels (session only — resets on reload) ----
  let edLeftW = 250, edRightW = 300;
  function applyLayout() {
    $('app').style.gridTemplateColumns = edLeftW + 'px 1fr ' + edRightW + 'px';
    $('vsplitL').style.left = (edLeftW - 4) + 'px';
    $('vsplitR').style.right = (edRightW - 4) + 'px';
    resize();
  }
  (function () {
    let drag = null;
    const onDown = which => e => { drag = which; e.preventDefault(); try { e.target.setPointerCapture(e.pointerId); } catch (_) { } e.target.classList.add('drag'); };
    $('vsplitL').addEventListener('pointerdown', onDown('L'));
    $('vsplitR').addEventListener('pointerdown', onDown('R'));
    addEventListener('pointermove', e => {
      if (!drag) return;
      const W = window.innerWidth;
      if (drag === 'L') edLeftW = Math.max(150, Math.min(W * 0.42, e.clientX));
      else edRightW = Math.max(190, Math.min(W * 0.42, W - e.clientX));
      applyLayout();
    });
    addEventListener('pointerup', () => { if (drag) { drag = null; $('vsplitL').classList.remove('drag'); $('vsplitR').classList.remove('drag'); } });
  })();
  // Window-level retime drag for the central cutscene timeline blocks (started in
  // refreshCsTab). Listening on the window keeps the drag alive when the cursor
  // slides off a narrow block.
  (function () {
    addEventListener('pointermove', ev => {
      if (!csDrag) return;
      let nt = Math.max(0, csDrag.startT + (ev.clientX - csDrag.startX) / csDrag.scale);
      nt = Math.round(nt * 10) / 10;
      if (Math.abs(nt - csDrag.e.t) > 1e-6) {
        csDrag.moved = true; csDrag.e.t = nt;
        csDrag.blk.style.left = (nt * csDrag.scale) + 'px';
        csDrag.blk.title = `${csDrag.e.type} — ${nt.toFixed(2)}s for ${(csDrag.e.dur || 0)}s`;
      }
    });
    addEventListener('pointerup', () => {
      if (!csDrag) return;
      const moved = csDrag.moved; csDrag = null;
      if (moved) { markCsDirty(); refreshCsTab(); refreshInspector(); }
    });
  })();

  // mouse → world position on the z=0 plane
  function mouseWorld(e) {
    const r = $('viewportWrap').getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
    const ny = -((e.clientY - r.top) / r.height) * 2 + 1;
    const v = new THREE.Vector3(nx, ny, 0.5).unproject(camera);
    const dir = v.sub(camera.position).normalize();
    const t = -camera.position.z / dir.z;
    return {
      x: camera.position.x + dir.x * t,
      y: camera.position.y + dir.y * t
    };
  }

  // ---------------- room build / rebuild ----------------
  function rebuild(keepSel = true) {
    const keep = keepSel ? sel : null;
    try {
      G.World.load(currentId, 'P');
    } catch (err) {
      console.error(err);
      return;
    }
    // settle entities into their visual position once, but freeze AI after
    for (const e of G.room.entities) { try { e.update(0); } catch (_) { } }
    // boss ghost previews
    previewGroups.length = 0;
    for (const p of (lvl().props || [])) {
      if (p.type === 'bossTrigger') {
        const ghost = G.Bosses.preview(p.boss || 'mossSovereign');
        ghost.position.set(p.x, p.y - 0.9, -0.08);
        ghost.traverse(c => {
          if (c.material) { c.material.transparent = true; c.material.opacity *= 0.45; }
        });
        G.room.group.add(ghost);
        previewGroups.push(ghost);
      }
    }
    sel = keep;
    refreshHierarchy();
    refreshInspector();
    $('stLevel').textContent = `${currentId}  ·  ${lvl().w}×${lvl().h}  ·  ${lvl().biome}`;
  }
  function queueRebuild() {
    needsRebuild = true;
    markDirty();
  }
  function markDirty() {
    dirty = true;
    $('dirty').style.display = 'inline';
  }

  // ---------------- undo ----------------
  function pushUndo() {
    undoStack.push(JSON.stringify({ id: currentId, data: lvl() }));
    if (undoStack.length > 60) undoStack.shift();
    redoStack.length = 0;
  }
  function doUndo() {
    if (!undoStack.length) return;
    redoStack.push(JSON.stringify({ id: currentId, data: lvl() }));
    const s = JSON.parse(undoStack.pop());
    G.LEVELS[s.id] = s.data;
    if (s.id !== currentId) currentId = s.id;
    sel = null;
    rebuild(false);
    markDirty();
  }
  function doRedo() {
    if (!redoStack.length) return;
    undoStack.push(JSON.stringify({ id: currentId, data: lvl() }));
    const s = JSON.parse(redoStack.pop());
    G.LEVELS[s.id] = s.data;
    sel = null;
    rebuild(false);
    markDirty();
  }

  // ---------------- tiles ----------------
  function setTile(c, r, ch) {
    const L = lvl();
    if (c < 0 || r < 0 || c >= L.w || r >= L.h) return;
    const row = L.tiles[r].padEnd(L.w, ' ');
    if (row[c] === ch) return;
    L.tiles[r] = row.slice(0, c) + ch + row.slice(c + 1);
    queueRebuild();
  }
  function worldToTile(wx, wy) {
    const L = lvl();
    return { c: Math.floor(wx), r: L.h - 1 - Math.floor(wy) };
  }

  // ---------------- selection model ----------------
  // Builds a list of pickable items with world-space rects.
  function zoneRect(tz) {
    const L = lvl();
    if (tz.rect) return tz.rect;
    if (tz.side === 'L') return { x: 0.4, y: L.h / 2, w: 0.9, h: L.h };
    if (tz.side === 'R') return { x: L.w - 0.4, y: L.h / 2, w: 0.9, h: L.h };
    if (tz.side === 'T') return { x: (tz.x0 + tz.x1 + 1) / 2, y: L.h - 0.4, w: tz.x1 - tz.x0 + 1, h: 1.6 };
    return { x: (tz.x0 + tz.x1 + 1) / 2, y: 0.5, w: tz.x1 - tz.x0 + 1, h: 2 };
  }
  const PROP_SIZE = {
    bench: [2.6, 1.5], sign: [1.1, 1.4], readable: [1.1, 1.6], lamp: [0.8, 2.1],
    crystal: [1.3, 1.8], wings: [1.6, 1.2], shrine: [1.8, 2.8], gate: [1.1, 5],
    bossTrigger: [2, 2], decor: [1.6, 1.6], light: [1.4, 1.4], ray: [2, 2], textTrigger: [3, 3],
    vendor: [1.2, 2], charmPickup: [1, 1]
  };
  function propRect(p) {
    if (p.type === 'textTrigger' || p.type === 'cutsceneTrigger') return { x: p.x, y: p.y, w: p.w || 3, h: p.h || 3 };
    if (p.type === 'setActiveTrigger') return { x: p.x, y: p.y, w: p.w || 4, h: p.h || 4 };
    const s = PROP_SIZE[p.type] || [1.5, 1.5];
    const k = p.type === 'decor' ? (p.scale || 1) : 1;
    return { x: p.x, y: p.y + (p.type === 'textTrigger' ? 0 : s[1] * k / 2 - 0.2), w: s[0] * k, h: s[1] * k };
  }
  function pickables() {
    const L = lvl(), out = [];
    (L.props || []).forEach((p, i) => out.push({ kind: 'prop', i, rect: propRect(p), ref: p }));
    (L.enemies || []).forEach((e, i) => out.push({ kind: 'enemy', i, rect: { x: e.x, y: e.y, w: 1.2, h: 1.2 }, ref: e }));
    (L.transitions || []).forEach((t, i) => out.push({ kind: 'zone', i, rect: zoneRect(t), ref: t }));
    Object.keys(L.spawns || {}).forEach(k => out.push({ kind: 'spawn', key: k, rect: { x: L.spawns[k].x, y: L.spawns[k].y, w: 1, h: 1.4 }, ref: L.spawns[k] }));
    return out;
  }
  function pickAt(wx, wy) {
    let best = null, bestArea = 1e9;
    for (const it of pickables()) {
      const r = it.rect;
      if (Math.abs(wx - r.x) * 2 <= r.w && Math.abs(wy - r.y) * 2 <= r.h) {
        const a = r.w * r.h;
        if (a < bestArea) { bestArea = a; best = it; }
      }
    }
    return best;
  }
  function selectedItem() {
    if (!sel) return null;
    const L = lvl();
    if (sel.kind === 'prop') return L.props[sel.i] ? { kind: 'prop', i: sel.i, ref: L.props[sel.i] } : null;
    if (sel.kind === 'enemy') return L.enemies[sel.i] ? { kind: 'enemy', i: sel.i, ref: L.enemies[sel.i] } : null;
    if (sel.kind === 'zone') return L.transitions[sel.i] ? { kind: 'zone', i: sel.i, ref: L.transitions[sel.i] } : null;
    if (sel.kind === 'spawn') return L.spawns[sel.key] ? { kind: 'spawn', key: sel.key, ref: L.spawns[sel.key] } : null;
    return null;
  }
  function deleteSelected() {
    const all = selAll();
    if (!all.length) return;
    pushUndo();
    const L = lvl();
    // splice indices high-to-low per kind so earlier removals don't shift later ones
    const idx = k => all.filter(s => s.kind === k).map(s => s.i).sort((a, b) => b - a);
    idx('prop').forEach(i => L.props.splice(i, 1));
    idx('enemy').forEach(i => L.enemies.splice(i, 1));
    idx('zone').forEach(i => L.transitions.splice(i, 1));
    all.filter(s => s.kind === 'spawn').forEach(s => { delete L.spawns[s.key]; });
    sel = null; multi = [];
    queueRebuild();
    refreshHierarchy(); refreshInspector();
  }
  function duplicateSelected() {
    const it = selectedItem();
    if (!it || it.kind === 'spawn') return;
    pushUndo();
    const L = lvl();
    const copy = JSON.parse(JSON.stringify(it.ref));
    copy.x = (copy.x || 0) + 1.5;
    if (it.kind === 'prop') { L.props.push(copy); sel = { kind: 'prop', i: L.props.length - 1 }; }
    else if (it.kind === 'enemy') { L.enemies.push(copy); sel = { kind: 'enemy', i: L.enemies.length - 1 }; }
    else if (it.kind === 'zone') { L.transitions.push(copy); sel = { kind: 'zone', i: L.transitions.length - 1 }; }
    queueRebuild();
    refreshHierarchy(); refreshInspector();
  }

  // ---------------- multi-select / clipboard / prefabs ----------------
  function sameSel(a, b) { return a && b && a.kind === b.kind && (a.kind === 'spawn' ? a.key === b.key : a.i === b.i); }
  function selAll() { const out = []; const add = s => { if (s && !out.some(o => sameSel(o, s))) out.push(s); }; multi.forEach(add); add(sel); return out; }
  function moveTarget(s) {   // the object carrying x/y for a selection
    const L = lvl();
    if (s.kind === 'prop') return L.props[s.i];
    if (s.kind === 'enemy') return L.enemies[s.i];
    if (s.kind === 'spawn') return L.spawns[s.key];
    if (s.kind === 'zone') { const z = L.transitions[s.i]; return z && z.rect ? z.rect : z; }
    return null;
  }
  function selectInBox(box) {
    const L = lvl(), res = [];
    const x0 = Math.min(box.x0, box.x1), x1 = Math.max(box.x0, box.x1), y0 = Math.min(box.y0, box.y1), y1 = Math.max(box.y0, box.y1);
    const inb = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
    (L.props || []).forEach((p, i) => { if (inb(p.x, p.y)) res.push({ kind: 'prop', i }); });
    (L.enemies || []).forEach((p, i) => { if (inb(p.x, p.y)) res.push({ kind: 'enemy', i }); });
    (L.transitions || []).forEach((z, i) => { const r = z.rect || z; if (inb(r.x, r.y)) res.push({ kind: 'zone', i }); });
    for (const k in (L.spawns || {})) { const s = L.spawns[k]; if (inb(s.x, s.y)) res.push({ kind: 'spawn', key: k }); }
    return res;
  }
  function captureSelection() {
    const L = lvl(), items = [];
    for (const s of selAll()) {
      if (s.kind === 'spawn') continue;
      const ref = s.kind === 'prop' ? L.props[s.i] : s.kind === 'enemy' ? L.enemies[s.i] : L.transitions[s.i];
      if (!ref) continue;
      const t = s.kind === 'zone' ? (ref.rect || ref) : ref;
      items.push({ kind: s.kind, data: JSON.parse(JSON.stringify(ref)), x: t.x || 0, y: t.y || 0 });
    }
    if (!items.length) return null;
    const ox = items.reduce((a, b) => a + b.x, 0) / items.length, oy = items.reduce((a, b) => a + b.y, 0) / items.length;
    return { items, ox, oy };
  }
  function stampCapture(cap, wx, wy) {
    if (!cap || !cap.items || !cap.items.length) return;
    const L = lvl(); multi = [];
    for (const it of cap.items) {
      const d = JSON.parse(JSON.stringify(it.data));
      const nx = +(wx + (it.x - cap.ox)).toFixed(2), ny = +(wy + (it.y - cap.oy)).toFixed(2);
      if (it.kind === 'prop') { d.x = nx; d.y = ny; L.props = L.props || []; L.props.push(d); multi.push({ kind: 'prop', i: L.props.length - 1 }); }
      else if (it.kind === 'enemy') { d.x = nx; d.y = ny; L.enemies = L.enemies || []; L.enemies.push(d); multi.push({ kind: 'enemy', i: L.enemies.length - 1 }); }
      else if (it.kind === 'zone') { if (d.rect) { d.rect.x = nx; d.rect.y = ny; } else { d.x = nx; d.y = ny; } L.transitions = L.transitions || []; L.transitions.push(d); multi.push({ kind: 'zone', i: L.transitions.length - 1 }); }
    }
    sel = multi[0] || null;
  }
  function copySelection() { const c = captureSelection(); if (!c) return; clipboard = c; try { localStorage.setItem('mossveil-ed-clip', JSON.stringify(c)); } catch (e) { } }
  function pasteClipboard() { if (!clipboard) return; pushUndo(); stampCapture(clipboard, lastWorld.x, lastWorld.y); queueRebuild(); refreshHierarchy(); refreshInspector(); }
  function savePrefab(nameArg) {
    const c = captureSelection(); if (!c) { if (typeof nameArg !== 'string') alert('Select one or more objects first (marquee-drag, or Shift-click to add).'); return; }
    const name = (typeof nameArg === 'string' ? nameArg : (prompt('Prefab name:', 'cluster') || '')).trim(); if (!name) return;
    prefabs[name] = c;
    try { localStorage.setItem('mossveil-ed-prefabs', JSON.stringify(prefabs)); } catch (e) { }
    refreshAssets();
  }
  function deletePrefab(name) { delete prefabs[name]; try { localStorage.setItem('mossveil-ed-prefabs', JSON.stringify(prefabs)); } catch (e) { } refreshAssets(); }
  function stampPrefab(name, x, y) { const pf = prefabs[name]; if (pf) stampCapture(pf, x, y); }
  function alignSelected() {   // snap every selected object to the half-tile grid
    const all = selAll(); if (!all.length) return; pushUndo();
    for (const s of all) { const t = moveTarget(s); if (t && t.x !== undefined) { t.x = Math.round(t.x * 2) / 2; t.y = Math.round(t.y * 2) / 2; } }
    queueRebuild(); refreshInspector();
  }

  // ---------------- viewport input ----------------
  let panning = false, painting = false, dragging = null;
  let lastMouse = { x: 0, y: 0 };

  // ---- viewport input: Pointer Events unify mouse, touch and Apple Pencil ----
  // one finger / pen / left-click = act (place·select·drag·paint); two fingers = pan + pinch-zoom
  const vpEl = $('viewportWrap');
  const pointers = new Map();   // pointerId -> { x, y }
  let pinch = null;             // { dist, cx, cy } sampled during a 2-finger gesture
  let gesturing = false;        // true while a 2-finger pan/zoom is in progress

  function pinchSample() {
    const p = [...pointers.values()];
    const dx = p[1].x - p[0].x, dy = p[1].y - p[0].y;
    return { dist: Math.hypot(dx, dy) || 1, cx: (p[0].x + p[1].x) / 2, cy: (p[0].y + p[1].y) / 2 };
  }
  function abortSingle() {           // drop any in-progress single-pointer action
    dragging = null; painting = false; panning = false; mapDrag = null;
  }

  vpEl.addEventListener('contextmenu', e => e.preventDefault());
  vpEl.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button > 2) return;
    // The cutscene tab (timeline DOM + preview bar) and the playtest overlay (with its
    // Stop button) handle their own input. Bail out BEFORE capturing the pointer —
    // otherwise vpEl steals pointerup and clicks on those buttons never fire.
    if (tab === 'cutscene' || $('playFrame').classList.contains('on')) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { vpEl.setPointerCapture(e.pointerId); } catch (_) { }

    // a second touch/pen contact starts a pan/zoom gesture
    if (pointers.size === 2 && e.pointerType !== 'mouse') {
      abortSingle(); gesturing = true; pinch = pinchSample(); return;
    }
    if (pointers.size > 1) return;       // ignore extra fingers
    if (gesturing) return;

    if (tab === 'map') return mapMouseDown(e);
    // mouse middle/right button pans
    if (e.pointerType === 'mouse' && (e.button === 1 || e.button === 2)) {
      panning = true; lastMouse = { x: e.clientX, y: e.clientY }; return;
    }
    const w = mouseWorld(e);
    lastWorld = w;
    if (placing) { placeAsset(w.x, w.y); return; }
    if (tool === 'select') {
      const hit = pickAt(w.x, w.y);
      if (hit) {
        const hs = hit.kind === 'spawn' ? { kind: 'spawn', key: hit.key } : { kind: hit.kind, i: hit.i };
        if (keepPlacing) {                          // Shift-click: toggle in the multi-selection
          const k = multi.findIndex(m => sameSel(m, hs));
          if (k >= 0) multi.splice(k, 1); else multi.push(hs);
          sel = hs;
        } else {
          if (!selAll().some(s => sameSel(s, hs))) { sel = hs; multi = []; }   // fresh pick clears the group
          else sel = hs;                                                       // clicked an already-grouped item: keep group
          pushUndo();
          const primary = moveTarget(sel);
          const others = selAll().filter(s => !sameSel(s, sel)).map(moveTarget).filter(t => t && t.x !== undefined);
          dragging = { off: { x: (primary ? primary.x : hit.ref.x) - w.x, y: (primary ? primary.y : hit.ref.y) - w.y }, others, px: primary ? primary.x : 0, py: primary ? primary.y : 0 };
        }
        refreshHierarchy(); refreshInspector();
      } else {
        if (!keepPlacing) { sel = null; multi = []; }
        marquee = { x0: w.x, y0: w.y, x1: w.x, y1: w.y };
        refreshHierarchy(); refreshInspector();
      }
    } else {
      pushUndo();
      painting = true;
      paintAt(w);
    }
  });
  addEventListener('pointermove', e => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (gesturing && pointers.size >= 2) { updateGesture(); return; }
    if (tab === 'cutscene') return;
    if (tab === 'map') { if (mapDrag) mapMouseMove(e); return; }
    if (panning) {
      const r = vpEl.getBoundingClientRect();
      const worldPerPx = (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * camZ) / r.height;
      camX -= (e.clientX - lastMouse.x) * worldPerPx;
      camY += (e.clientY - lastMouse.y) * worldPerPx;
      lastMouse = { x: e.clientX, y: e.clientY };
      return;
    }
    const overViewport = e.target === glCanvas || e.target === overlay || e.target === vpEl;
    if (!overViewport && !dragging && !painting && !marquee) return;
    const w = mouseWorld(e);
    lastWorld = w;
    const t = worldToTile(w.x, w.y);
    $('stMouse').textContent = `x ${w.x.toFixed(1)}  y ${w.y.toFixed(1)}  ·  tile ${t.c},${t.r}`;
    if (marquee) { marquee.x1 = w.x; marquee.y1 = w.y; }
    else if (dragging) {
      let nx = w.x + dragging.off.x, ny = w.y + dragging.off.y;
      if (snap) { nx = Math.round(nx * 2) / 2; ny = Math.round(ny * 2) / 2; }
      nx = +nx.toFixed(2); ny = +ny.toFixed(2);
      const primary = moveTarget(sel);
      if (primary && primary.x !== undefined) {
        const dx = nx - primary.x, dy = ny - primary.y;
        primary.x = nx; primary.y = ny;
        for (const t2 of (dragging.others || [])) { t2.x = +((t2.x || 0) + dx).toFixed(2); t2.y = +((t2.y || 0) + dy).toFixed(2); }
      } else { const it = selectedItem(); if (it) { it.ref.x = nx; it.ref.y = ny; } }
      queueRebuild();
      refreshInspector();
    } else if (painting) paintAt(w);
  });
  function endPointer(e) {
    pointers.delete(e.pointerId);
    try { vpEl.releasePointerCapture(e.pointerId); } catch (_) { }
    if (pointers.size < 2) { pinch = null; gesturing = false; }
    if (pointers.size === 0) {
      panning = false;
      if (marquee) {
        const area = Math.abs(marquee.x1 - marquee.x0) + Math.abs(marquee.y1 - marquee.y0);
        if (area > 0.4) {
          const found = selectInBox(marquee);
          if (keepPlacing) { for (const f of found) if (!multi.some(m => sameSel(m, f))) multi.push(f); }
          else multi = found;
          sel = multi[0] || null;
          refreshHierarchy(); refreshInspector();
        }
        marquee = null;
      }
      if (dragging || painting) { dragging = null; painting = false; needsRebuild = true; }
      mapDrag = null;
    }
  }
  addEventListener('pointerup', endPointer);
  addEventListener('pointercancel', endPointer);

  function updateGesture() {
    const now = pinchSample();
    const r = vpEl.getBoundingClientRect();
    if (tab === 'map') {
      mapView.pan.x -= (now.cx - pinch.cx) / mapView.zoom;
      mapView.pan.y -= (now.cy - pinch.cy) / mapView.zoom;
      mapView.zoom = U.clamp(mapView.zoom * (now.dist / pinch.dist), 0.4, 12);
    } else {
      const worldPerPx = (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * camZ) / r.height;
      camX -= (now.cx - pinch.cx) * worldPerPx;
      camY += (now.cy - pinch.cy) * worldPerPx;
      camZ = U.clamp(camZ * (pinch.dist / now.dist), 8, 110);
    }
    pinch = now;
  }
  $('viewportWrap').addEventListener('wheel', e => {
    e.preventDefault();
    if (tab === 'map') {
      mapView.zoom = U.clamp(mapView.zoom * (e.deltaY > 0 ? 0.88 : 1.14), 0.4, 12);
      return;
    }
    camZ = U.clamp(camZ * (e.deltaY > 0 ? 1.1 : 0.9), 8, 110);
  }, { passive: false });

  function paintAt(w) {
    const t = worldToTile(w.x, w.y);
    const ch = tool === 'solid' ? '#' : tool === 'oneway' ? '=' : tool === 'spike' ? '^' : ' ';
    setTile(t.c, t.r, ch);
  }

  function placeAsset(wx, wy) {
    pushUndo();
    const L = lvl();
    let x = wx, y = wy;
    if (snap) { x = Math.round(x * 2) / 2; y = Math.round(y * 2) / 2; }
    x = +x.toFixed(2); y = +y.toFixed(2);
    const a = placing;
    // prefab: stamp a saved cluster of objects
    if (a.cat === 'prefab') { stampPrefab(a.prefab, x, y); if (!keepPlacing) setPlacing(null); queueRebuild(); refreshHierarchy(); refreshInspector(); return; }
    // scatter brush: stamp a randomized cluster of this decor
    if (scatter && a.id === 'decor') {
      L.props = L.props || [];
      const n = 4 + (Math.random() * 4 | 0);
      let last;
      for (let i = 0; i < n; i++) {
        const r = Math.random() * 2.6, ang = Math.random() * Math.PI * 2;
        const px = +(x + Math.cos(ang) * r).toFixed(2), py = +(y + Math.sin(ang) * r * 0.5).toFixed(2);
        const p = Object.assign({ type: 'decor', kind: a.kind || 'tree', x: px, y: py }, JSON.parse(JSON.stringify(a.defaults || {})));
        p.scale = +(0.7 + Math.random() * 0.9).toFixed(2);
        p.flip = Math.random() < 0.5;
        p.seed = Math.random() * 999 | 0;
        L.props.push(p); last = L.props.length - 1;
      }
      sel = { kind: 'prop', i: last };
      if (!keepPlacing) setPlacing(null);
      queueRebuild(); refreshHierarchy(); refreshInspector();
      return;
    }
    if (a.cat === 'enemy') {
      L.enemies = L.enemies || [];
      L.enemies.push({ type: a.id, x, y });
      sel = { kind: 'enemy', i: L.enemies.length - 1 };
    } else if (a.cat === 'spawn') {
      L.spawns = L.spawns || {};
      let k = 1;
      while (L.spawns[String(k)]) k++;
      L.spawns[String(k)] = { x, y };
      sel = { kind: 'spawn', key: String(k) };
    } else if (a.cat === 'zone') {
      L.transitions = L.transitions || [];
      L.transitions.push({ rect: { x, y, w: 3, h: 4 }, to: Object.keys(G.LEVELS).find(id => id !== currentId) || currentId, spawn: 'P' });
      sel = { kind: 'zone', i: L.transitions.length - 1 };
    } else {
      L.props = L.props || [];
      const p = Object.assign({ type: a.id, x, y }, JSON.parse(JSON.stringify(a.defaults || {})));
      if (a.id === 'bossTrigger') p.boss = a.boss || 'mossSovereign';
      if (a.id === 'decor') p.kind = a.kind || 'tree';
      L.props.push(p);
      sel = { kind: 'prop', i: L.props.length - 1 };
    }
    if (!keepPlacing) setPlacing(null);
    queueRebuild();
    refreshHierarchy(); refreshInspector();
  }
  let keepPlacing = false;
  addEventListener('keydown', e => { if (e.key === 'Shift') keepPlacing = true; });
  addEventListener('keyup', e => { if (e.key === 'Shift') keepPlacing = false; });

  // ---------------- gizmo overlay ----------------
  function drawOverlay() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    octx.clearRect(0, 0, G.viewW, G.viewH);
    if (tab !== 'scene') return;
    const L = lvl();
    if (!L) return;

    // room bounds
    const a = U.toScreen(0, 0), b = U.toScreen(L.w, L.h);
    octx.strokeStyle = 'rgba(255,255,255,0.25)';
    octx.setLineDash([6, 6]);
    octx.strokeRect(a.x, b.y, b.x - a.x, a.y - b.y);
    octx.setLineDash([]);

    if (!gizmos) return;
    const item = selectedItem();
    for (const it of pickables()) {
      const r = it.rect;
      const p1 = U.toScreen(r.x - r.w / 2, r.y + r.h / 2);
      const p2 = U.toScreen(r.x + r.w / 2, r.y - r.h / 2);
      const isSel = item && it.kind === item.kind && (it.kind === 'spawn' ? it.key === item.key : it.i === item.i);
      const inMulti = multi.some(m => sameSel(m, it.kind === 'spawn' ? { kind: 'spawn', key: it.key } : { kind: it.kind, i: it.i }));
      let col = '#7fb2e8';
      if (it.kind === 'enemy') col = '#e87f7f';
      if (it.kind === 'zone') col = '#7fe8c0';
      if (it.kind === 'spawn') col = '#a0e87f';
      if (it.ref.type === 'textTrigger') col = '#e8b85f';
      if (it.ref.type === 'bossTrigger') col = '#e85fd0';
      if (it.ref.type === 'cutsceneTrigger') col = '#5fd0e8';
      if (it.ref.type === 'setActiveTrigger') col = '#c89bff';
      const inactive = it.ref.active === false;
      octx.globalAlpha = inactive ? 0.4 : 1;        // dim objects that are switched off
      octx.strokeStyle = isSel ? '#ffd887' : (inMulti ? '#7fe8ff' : col + 'aa');
      octx.lineWidth = (isSel || inMulti) ? 2.5 : 1.2;
      if (inactive || it.kind === 'zone' || it.ref.type === 'textTrigger' || it.ref.type === 'bossTrigger' || it.ref.type === 'cutsceneTrigger' || it.ref.type === 'setActiveTrigger') octx.setLineDash([4, 4]);
      octx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
      octx.setLineDash([]);
      // label
      const name = (it.kind === 'enemy' ? it.ref.type
        : it.kind === 'zone' ? `→ ${it.ref.to}`
        : it.kind === 'spawn' ? `spawn ${it.key}`
        : it.ref.type + (it.ref.kind ? ':' + it.ref.kind : '')) + (inactive ? '  (off)' : '');
      octx.font = '10px Segoe UI';
      octx.fillStyle = isSel ? '#ffd887' : col;
      octx.fillText(name, p1.x + 2, p1.y - 3);
      octx.globalAlpha = 1;
    }
    if (marquee) {
      const m1 = U.toScreen(Math.min(marquee.x0, marquee.x1), Math.max(marquee.y0, marquee.y1));
      const m2 = U.toScreen(Math.max(marquee.x0, marquee.x1), Math.min(marquee.y0, marquee.y1));
      octx.fillStyle = 'rgba(127,232,255,0.12)';
      octx.fillRect(m1.x, m1.y, m2.x - m1.x, m2.y - m1.y);
      octx.strokeStyle = '#7fe8ff'; octx.lineWidth = 1; octx.setLineDash([5, 4]);
      octx.strokeRect(m1.x, m1.y, m2.x - m1.x, m2.y - m1.y); octx.setLineDash([]);
    }
    if (placing) {
      octx.fillStyle = 'rgba(255,255,255,0.75)';
      octx.font = '12px Segoe UI';
      octx.fillText(`placing: ${placing.label}  (click to place · Shift = place many · Esc = cancel)`, 12, 20);
    }
  }

  // ---------------- inspector ----------------
  function frow(parent, label) {
    const r = el('div', { class: 'frow' }, parent);
    el('label', {}, r, label);
    return r;
  }
  function numField(parent, label, get, set, step = 0.5) {
    const r = frow(parent, label);
    const inp = el('input', { type: 'number', step }, r);
    inp.value = get();
    inp.addEventListener('change', () => { pushUndo(); set(parseFloat(inp.value) || 0); queueRebuild(); });
    return inp;
  }
  function textField(parent, label, get, set, area = false) {
    const r = frow(parent, label);
    const inp = el(area ? 'textarea' : 'input', area ? {} : { type: 'text' }, r);
    inp.value = get() || '';
    inp.addEventListener('change', () => { pushUndo(); set(inp.value); queueRebuild(); });
    return inp;
  }
  function checkField(parent, label, get, set) {
    const r = frow(parent, label);
    const inp = el('input', { type: 'checkbox' }, r);
    inp.checked = !!get();
    inp.addEventListener('change', () => { pushUndo(); set(inp.checked); queueRebuild(); });
  }
  function selectField(parent, label, options, get, set) {
    const r = frow(parent, label);
    const s = el('select', {}, r);
    for (const o of options) el('option', { value: o.v }, s, o.t);
    s.value = get();
    s.addEventListener('change', () => { pushUndo(); set(s.value); queueRebuild(); });
    return s;
  }
  function colorField(parent, label, get, set) {
    const r = frow(parent, label);
    const inp = el('input', { type: 'color' }, r);
    inp.value = get() || '#ffffff';
    inp.addEventListener('change', () => { pushUndo(); set(inp.value); queueRebuild(); });
    const clr = el('button', { class: 'tbtn' }, r, 'biome');
    clr.title = 'use biome default colour';
    clr.addEventListener('click', () => { pushUndo(); set(null); queueRebuild(); refreshInspector(); });
  }

  // ---- set-active trigger: target helpers (a target object may live in ANY level) ----
  // Objects are referenced by a stable per-level `oid`, assigned lazily the first time a
  // trigger points at them, so editing/reordering other objects never breaks the link.
  function ensureOid(levelId, ref) {
    if (typeof ref.oid === 'number') return ref.oid;
    const L = G.LEVELS[levelId]; let mx = 0;
    const scan = o => { if (o && typeof o.oid === 'number' && o.oid > mx) mx = o.oid; };
    (L.props || []).forEach(scan); (L.enemies || []).forEach(scan); (L.transitions || []).forEach(scan);
    ref.oid = mx + 1;
    return ref.oid;
  }
  function objLabel(kind, ref, i) {
    const x = Math.round(ref.x != null ? ref.x : (ref.rect ? ref.rect.x : 0));
    const y = Math.round(ref.y != null ? ref.y : (ref.rect ? ref.rect.y : 0));
    if (kind === 'enemy') return `enemy ${ref.type} #${i} @(${x},${y})`;
    if (kind === 'zone') return `portal → ${ref.to} #${i}`;
    return `${ref.type}${ref.kind ? ':' + ref.kind : ''} #${i} @(${x},${y})`;
  }
  // every togglable object in a level → { key:'kind:index', label, ref }
  function targetableList(levelId) {
    const L = G.LEVELS[levelId]; const out = [];
    if (!L) return out;
    (L.props || []).forEach((r, i) => { if (r.type !== 'setActiveTrigger') out.push({ key: 'prop:' + i, label: objLabel('prop', r, i), ref: r }); });
    (L.enemies || []).forEach((r, i) => out.push({ key: 'enemy:' + i, label: objLabel('enemy', r, i), ref: r }));
    (L.transitions || []).forEach((r, i) => out.push({ key: 'zone:' + i, label: objLabel('zone', r, i), ref: r }));
    return out;
  }

  function refreshInspector() {
    if (csMode) return refreshCsInspector();
    const body = $('insBody');
    body.innerHTML = '';
    const it = selectedItem();
    $('stSel').textContent = it ? `selected: ${it.kind} ${it.ref.type || it.ref.to || it.key || ''}` : '';
    if (!it) {
      // level settings
      const L = lvl();
      el('div', { class: 'insNote' }, body, 'Level settings (nothing selected)');
      textField(body, 'Title', () => L.title, v => { L.title = v; });
      textField(body, 'Area text', () => L.area, v => { L.area = v || null; });
      selectField(body, 'Biome', G.World.BIOMES.map(b2 => ({ v: b2, t: G.World.PAL[b2].label })), () => L.biome, v => { L.biome = v; });
      numField(body, 'Width', () => L.w, v => resizeLevel(Math.max(20, Math.round(v)), L.h), 1);
      numField(body, 'Height', () => L.h, v => resizeLevel(L.w, Math.max(12, Math.round(v))), 1);
      numField(body, 'Map X', () => (L.mapPos || { mx: 0 }).mx, v => { L.mapPos = L.mapPos || { mx: 0, my: 0 }; L.mapPos.mx = v; }, 1);
      numField(body, 'Map Y', () => (L.mapPos || { my: 0 }).my, v => { L.mapPos = L.mapPos || { mx: 0, my: 0 }; L.mapPos.my = v; }, 1);
      const csOpts = [{ v: '', t: '(none)' }].concat(Object.keys(G.CUTSCENES || {}).map(id => ({ v: id, t: (G.CUTSCENES[id].name || id) })));
      selectField(body, 'Intro cutscene', csOpts, () => L.intro || '', v => { if (v) L.intro = v; else delete L.intro; });
      el('div', { class: 'insNote' }, body,
        'Intro cutscene plays once when a NEW game starts in this level. Author cutscenes in the Scenes tab. ' +
        'Paint terrain with the toolbar tools; pick assets below and click to place them.');

      // ---- per-level look (post-processing grade override) ----
      el('div', { class: 'hgroup' }, body, 'Look — colour grade');
      const applyGrade = () => { if (L.grade && G.Post) G.Post.setGrade(L.grade); markDirty(); };
      const gset = (k, v) => { L.grade = L.grade || {}; if (v === null || v === '' || isNaN(v)) delete L.grade[k]; else L.grade[k] = v; if (!Object.keys(L.grade).length) delete L.grade; applyGrade(); };
      numField(body, 'Exposure', () => (L.grade && L.grade.exposure !== undefined) ? L.grade.exposure : 1.05, v => gset('exposure', +v.toFixed(2)), 0.05);
      numField(body, 'Bloom', () => (L.grade && L.grade.bloom !== undefined) ? L.grade.bloom : 0.6, v => gset('bloom', +Math.max(0, v).toFixed(2)), 0.05);
      numField(body, 'Vignette', () => (L.grade && L.grade.vignette !== undefined) ? L.grade.vignette : 0.46, v => gset('vignette', +U.clamp(v, 0, 1).toFixed(2)), 0.05);
      numField(body, 'Saturation', () => (L.grade && L.grade.saturation !== undefined) ? L.grade.saturation : 1.14, v => gset('saturation', +Math.max(0, v).toFixed(2)), 0.05);
      numField(body, 'Contrast', () => (L.grade && L.grade.contrast !== undefined) ? L.grade.contrast : 1.05, v => gset('contrast', +Math.max(0, v).toFixed(2)), 0.05);
      colorField(body, 'Tint', () => (L.grade && L.grade.tint) || '#ffffff', v => {
        L.grade = L.grade || {};
        if (!v || v.toLowerCase() === '#ffffff') delete L.grade.tint; else L.grade.tint = v;
        if (!Object.keys(L.grade).length) delete L.grade;
        applyGrade();
      });
      el('div', { class: 'insNote' }, body, 'Overrides the biome’s automatic grade for this level. Leave at defaults to use the biome look. Shown live in the viewport.');
      return;
    }
    const p = it.ref;
    el('div', { class: 'insNote' }, body, `${it.kind.toUpperCase()} — ${p.type || (it.kind === 'zone' ? 'transition' : '') || it.key || ''}`);
    // Active toggle — works for every placeable object (prop/decor/light/boss/marker/enemy/portal).
    // When off, the object isn't built into the game (it doesn't show or work). A Set-active
    // trigger can flip it on/off at runtime. Shown dimmed with "(off)" in the viewport.
    if (it.kind === 'prop' || it.kind === 'enemy' || it.kind === 'zone') {
      checkField(body, 'Active', () => p.active !== false, v => { if (v) delete p.active; else p.active = false; });
      if (p.oid != null) el('div', { class: 'insNote', style: 'opacity:.6' }, body, 'Object id: ' + p.oid + '  (referenced by a Set-active trigger)');
    }
    if (it.kind !== 'zone' || p.rect) {
      if (it.kind === 'zone') {
        numField(body, 'X', () => p.rect.x, v => { p.rect.x = v; });
        numField(body, 'Y', () => p.rect.y, v => { p.rect.y = v; });
        numField(body, 'W', () => p.rect.w, v => { p.rect.w = Math.max(0.5, v); });
        numField(body, 'H', () => p.rect.h, v => { p.rect.h = Math.max(0.5, v); });
      } else {
        numField(body, 'X', () => p.x, v => { p.x = v; });
        numField(body, 'Y', () => p.y, v => { p.y = v; });
      }
    }
    if (it.kind === 'zone') {
      selectField(body, 'Edge', [{ v: 'rect', t: 'free rect (portal)' }, { v: 'L', t: 'left edge' }, { v: 'R', t: 'right edge' }, { v: 'T', t: 'top edge' }, { v: 'B', t: 'bottom edge' }],
        () => p.rect ? 'rect' : p.side,
        v => {
          if (v === 'rect') { p.rect = p.rect || zoneRect(p); delete p.side; delete p.x0; delete p.x1; }
          else {
            delete p.rect; p.side = v;
            if (v === 'T' || v === 'B') { p.x0 = p.x0 ?? Math.round(lvl().w / 2 - 2); p.x1 = p.x1 ?? Math.round(lvl().w / 2 + 2); }
          }
        });
      if (!p.rect && (p.side === 'T' || p.side === 'B')) {
        numField(body, 'Col from', () => p.x0, v => { p.x0 = Math.round(v); }, 1);
        numField(body, 'Col to', () => p.x1, v => { p.x1 = Math.round(v); }, 1);
      }
      selectField(body, 'To level', Object.keys(G.LEVELS).map(id => ({ v: id, t: id })), () => p.to, v => { p.to = v; });
      const target = G.LEVELS[p.to];
      const spawnOpts = target ? Object.keys(target.spawns || {}).map(k => ({ v: k, t: 'spawn ' + k })) : [];
      if (!spawnOpts.length) spawnOpts.push({ v: 'P', t: '(default)' });
      selectField(body, 'Arrive at', spawnOpts, () => p.spawn, v => { p.spawn = v; });
      el('div', { class: 'insNote' }, body, 'Tip: the destination level needs a spawn point with that id. Place one from the Markers category.');
    }
    if (it.kind === 'enemy') {
      selectField(body, 'Type', G.Enemies.TYPES.map(t2 => ({ v: t2.id, t: t2.label })), () => p.type, v => { p.type = v; });
    }
    if (it.kind === 'prop') {
      switch (p.type) {
        case 'sign': case 'readable':
          textField(body, 'Title', () => p.title, v => { p.title = v || undefined; });
          textField(body, 'Text', () => p.text, v => { p.text = v; }, true);
          selectField(body, 'Style', [{ v: 'tablet', t: 'stone tablet' }, { v: 'effigy', t: 'effigy' }, { v: 'totem', t: 'totem' }], () => p.style || 'tablet', v => { p.style = v; });
          el('div', { class: 'insNote' }, body, 'Shows its text when the player stands near — use for lore.');
          break;
        case 'textTrigger':
          numField(body, 'W', () => p.w || 3, v => { p.w = v; });
          numField(body, 'H', () => p.h || 3, v => { p.h = v; });
          textField(body, 'Text', () => p.text, v => { p.text = v; }, true);
          checkField(body, 'Only once', () => p.once, v => { p.once = v; });
          el('div', { class: 'insNote' }, body, 'Invisible zone — pops its text up when the player walks through it.');
          break;
        case 'cutsceneTrigger': {
          numField(body, 'W', () => p.w || 3, v => { p.w = v; });
          numField(body, 'H', () => p.h || 3, v => { p.h = v; });
          const csOpts = Object.keys(G.CUTSCENES || {}).map(id => ({ v: id, t: (G.CUTSCENES[id].name || id) }));
          if (!csOpts.length) csOpts.push({ v: '', t: '(no cutscenes — make one in Scenes)' });
          if (!p.cutscene && csOpts[0].v) p.cutscene = csOpts[0].v;
          selectField(body, 'Cutscene', csOpts, () => p.cutscene || csOpts[0].v, v => { p.cutscene = v; });
          checkField(body, 'Only once', () => p.once !== false, v => { p.once = v; });
          el('div', { class: 'insNote' }, body, 'Invisible zone — plays the chosen cutscene when the player walks in (in place, then control returns). "Only once" is remembered in the save.');
          break;
        }
        case 'setActiveTrigger': {
          numField(body, 'W', () => p.w || 4, v => { p.w = Math.max(0.5, v); });
          numField(body, 'H', () => p.h || 4, v => { p.h = Math.max(0.5, v); });
          checkField(body, 'Only once', () => !!p.once, v => { p.once = v; });
          el('div', { class: 'insNote' }, body, 'Invisible zone. When the player walks in, each target below is switched on/off. Targets may live in ANY scene; the change is remembered in the save (and applied instantly if the target is in this room).');
          el('div', { class: 'hgroup' }, body, 'Targets to flip');
          p.targets = p.targets || [];
          const levelOpts = Object.keys(G.LEVELS).map(id => ({ v: id, t: id }));
          p.targets.forEach((t, ti) => {
            const box = el('div', { style: 'border:1px solid #2c2c34;border-radius:5px;padding:6px 7px;margin:0 0 8px;background:#15151b' }, body);
            const hd = el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin:-1px 0 4px' }, box);
            el('span', { style: 'color:#9fb0c0;font-size:11px' }, hd, 'Target ' + (ti + 1));
            const rm = el('span', { style: 'color:#d77;cursor:pointer;font-size:12px', title: 'Remove this target' }, hd, '✕');
            rm.addEventListener('click', () => { p.targets.splice(ti, 1); markDirty(); refreshInspector(); });
            selectField(box, 'Scene', levelOpts, () => t.level || currentId, v => { t.level = v; delete t.oid; markDirty(); refreshInspector(); });
            const list = targetableList(t.level || currentId);
            const objOpts = [{ v: '', t: '(choose object…)' }].concat(list.map(o => ({ v: o.key, t: o.label })));
            const cur = (t.oid != null) ? list.find(o => o.ref.oid === t.oid) : null;
            selectField(box, 'Object', objOpts, () => cur ? cur.key : '', v => {
              if (!v) { delete t.oid; markDirty(); refreshInspector(); return; }
              const item = list.find(o => o.key === v);
              if (item) { t.oid = ensureOid(t.level || currentId, item.ref); markDirty(); refreshInspector(); }
            });
            if (t.oid != null && !cur) el('div', { class: 'insNote', style: 'color:#e88' }, box, '⚠ object not found (id ' + t.oid + ') — was it deleted?');
            selectField(box, 'Set to', [{ v: 'on', t: 'Active (show / enable)' }, { v: 'off', t: 'Inactive (hide / disable)' }],
              () => (t.state === 'off' || t.state === false) ? 'off' : 'on', v => { t.state = v; markDirty(); });
          });
          const add = el('button', { class: 'tbtn play', style: 'margin-top:2px' }, body, '＋ Add target');
          add.addEventListener('click', () => { p.targets.push({ level: currentId, state: 'on' }); markDirty(); refreshInspector(); });
          break;
        }
        case 'decor': {
          const kinds = [...G.World.DECOR_KINDS.standing, ...G.World.DECOR_KINDS.hanging];
          selectField(body, 'Kind', kinds.map(k => ({ v: k, t: k })), () => p.kind, v => { p.kind = v; });
          selectField(body, 'Depth', [
            { v: '-0.3', t: 'gameplay layer' }, { v: '-9', t: 'background near' },
            { v: '-18', t: 'background mid' }, { v: '-30', t: 'background far' }, { v: '5', t: 'foreground' }
          ], () => String(p.z !== undefined ? p.z : -0.3), v => { p.z = parseFloat(v); });
          numField(body, 'Scale', () => p.scale || 1, v => { p.scale = Math.max(0.1, v); }, 0.1);
          checkField(body, 'Flip', () => p.flip, v => { p.flip = v; });
          numField(body, 'Seed', () => p.seed || 1, v => { p.seed = Math.round(v); }, 1);
          colorField(body, 'Colour', () => p.color, v => { p.color = v || undefined; });
          checkField(body, 'Has collision', () => p.solid, v => { p.solid = v; });
          if (p.solid) {
            numField(body, 'Collider W', () => p.cw || 2, v => { p.cw = v; });
            numField(body, 'Collider H', () => p.chh || 2, v => { p.chh = v; });
            el('div', { class: 'insNote' }, body, 'Collision only applies on the gameplay layer.');
          }
          break;
        }
        case 'light':
          colorField(body, 'Colour', () => p.color || '#ffeecc', v => { p.color = v || '#ffeecc'; });
          numField(body, 'Size', () => p.scale || 8, v => { p.scale = Math.max(1, v); }, 1);
          numField(body, 'Intensity', () => p.opacity !== undefined ? p.opacity : 0.3, v => { p.opacity = U.clamp(v, 0, 1); }, 0.05);
          checkField(body, 'Flicker', () => p.flicker, v => { p.flicker = v; });
          break;
        case 'ray':
          numField(body, 'W', () => p.w || 5, v => { p.w = v; });
          numField(body, 'H', () => p.h || 18, v => { p.h = v; });
          numField(body, 'Tilt', () => p.rot || -0.15, v => { p.rot = v; }, 0.05);
          numField(body, 'Intensity', () => p.opacity || 0.1, v => { p.opacity = U.clamp(v, 0, 1); }, 0.02);
          break;
        case 'gate':
          numField(body, 'Gate id', () => p.id || 0, v => { p.id = Math.round(v); }, 1);
          el('div', { class: 'insNote' }, body, 'Gates slam shut when a boss trigger fires and open when the boss dies.');
          break;
        case 'bossTrigger':
          selectField(body, 'Boss', G.Bosses.LIST.map(b2 => ({ v: b2.id, t: b2.label })), () => p.boss || 'mossSovereign', v => { p.boss = v; });
          numField(body, 'Trigger radius', () => p.r || 6, v => { p.r = Math.max(2, v); }, 1);
          el('div', { class: 'insNote' }, body, 'Walking within the radius starts the fight and closes all gates in the room. The ghost shows the boss.');
          break;
        case 'charmPickup': {
          const chOpts = (G.Charms ? G.Charms.LIST : []).map(c => ({ v: c.id, t: c.name + ' (' + c.cost + ')' }));
          if (!chOpts.length) chOpts.push({ v: 'stoneheart', t: 'stoneheart' });
          if (!p.charm) p.charm = chOpts[0].v;
          selectField(body, 'Charm', chOpts, () => p.charm || chOpts[0].v, v => { p.charm = v; });
          el('div', { class: 'insNote' }, body, 'The player picks this charm up once and keeps it. It then vanishes for that save.');
          break;
        }
        case 'vendor':
          el('div', { class: 'insNote' }, body, 'A cloaked vendor. Interact (E / ↑) to open the charm shop — the player buys charms with Glimmer dropped by enemies.');
          break;
      }
    }
    if (it.kind === 'spawn') {
      el('div', { class: 'insNote' }, body, `Spawn point "${it.key}" — transitions arriving here use this id. "P" is the default/new-game spawn.`);
      textField(body, 'Rename id', () => it.key, v => {
        const L = lvl();
        if (v && !L.spawns[v]) { L.spawns[v] = L.spawns[it.key]; delete L.spawns[it.key]; sel = { kind: 'spawn', key: v }; }
      });
    }
    const btns = el('div', { class: 'frow', style: 'margin-top:10px' }, body);
    el('button', { class: 'tbtn', onclick: duplicateSelected }, btns, 'Duplicate');
    el('button', { class: 'tbtn dangerBtn', onclick: deleteSelected }, btns, 'Delete');
  }

  function resizeLevel(nw, nh) {
    const L = lvl();
    const dh = nh - L.h;
    // keep bottom anchored: add/remove rows at the TOP
    if (dh > 0) for (let i = 0; i < dh; i++) L.tiles.unshift('#'.repeat(nw));
    else if (dh < 0) L.tiles.splice(0, -dh);
    L.tiles = L.tiles.map(row => row.padEnd(nw, ' ').slice(0, nw));
    // shift y of everything by dh (world y measured from bottom, unchanged) — only clamp
    L.w = nw; L.h = nh;
    const cl = o => { o.x = U.clamp(o.x, 0, nw); o.y = U.clamp(o.y, 0, nh); };
    (L.props || []).forEach(cl);
    (L.enemies || []).forEach(cl);
    Object.values(L.spawns || {}).forEach(cl);
  }

  // ---------------- hierarchy ----------------
  function refreshHierarchy() {
    const h = $('hierarchy');
    h.innerHTML = '';
    const L = lvl();
    if (!L) return;
    const item = selectedItem();
    const mk = (label, kind, i, key) => {
      const isSel = item && item.kind === kind && (kind === 'spawn' ? item.key === key : item.i === i);
      const d = el('div', { class: 'hitem' + (isSel ? ' sel' : '') }, null, label);
      d.addEventListener('click', () => { sel = kind === 'spawn' ? { kind, key } : { kind, i }; multi = []; refreshHierarchy(); refreshInspector(); });
      d.addEventListener('dblclick', () => {
        const it2 = selectedItem();
        if (it2) { camX = it2.kind === 'zone' && it2.ref.rect ? it2.ref.rect.x : it2.ref.x; camY = (it2.ref.y !== undefined ? it2.ref.y : (it2.ref.rect ? it2.ref.rect.y : camY)); }
      });
      return d;
    };
    el('div', { class: 'hgroup' }, h, `Props (${(L.props || []).length})`);
    (L.props || []).forEach((p, i) => h.appendChild(mk(`${p.type}${p.kind ? ':' + p.kind : ''}${p.boss ? ':' + p.boss : ''}  (${p.x.toFixed(0)}, ${p.y.toFixed(0)})`, 'prop', i)));
    el('div', { class: 'hgroup' }, h, `Enemies (${(L.enemies || []).length})`);
    (L.enemies || []).forEach((e, i) => h.appendChild(mk(`${e.type}  (${e.x.toFixed(0)}, ${e.y.toFixed(0)})`, 'enemy', i)));
    el('div', { class: 'hgroup' }, h, `Transitions (${(L.transitions || []).length})`);
    (L.transitions || []).forEach((t, i) => h.appendChild(mk(`${t.rect ? 'portal' : t.side} → ${t.to} @${t.spawn}`, 'zone', i)));
    el('div', { class: 'hgroup' }, h, `Spawn points (${Object.keys(L.spawns || {}).length})`);
    Object.keys(L.spawns || {}).forEach(k => h.appendChild(mk(`spawn "${k}"  (${L.spawns[k].x.toFixed(0)}, ${L.spawns[k].y.toFixed(0)})`, 'spawn', null, k)));
  }

  // ---------------- levels panel ----------------
  function refreshLevels() {
    const box = $('levels');
    box.innerHTML = '';
    const btns = el('div', { class: 'lvlbtns' }, box);
    el('button', { class: 'tbtn', onclick: () => newLevelModal() }, btns, '+ New level');
    el('button', {
      class: 'tbtn', onclick: () => {
        const L = lvl();
        let nid = currentId + '_copy', n = 2;
        while (G.LEVELS[nid]) nid = currentId + '_copy' + n++;
        G.LEVELS[nid] = JSON.parse(JSON.stringify(L));
        G.LEVELS[nid].id = nid;
        G.LEVELS[nid].title = (L.title || nid) + ' copy';
        G.LEVELS[nid].mapPos = { mx: (L.mapPos ? L.mapPos.mx : 0) + L.w + 6, my: L.mapPos ? L.mapPos.my : 0 };
        openLevel(nid);
        markDirty();
      }
    }, btns, 'Duplicate');
    el('button', {
      class: 'tbtn dangerBtn', onclick: () => {
        if (Object.keys(G.LEVELS).length <= 1) return alert('Cannot delete the last level.');
        if (!confirm(`Delete level "${currentId}"? Transitions pointing here will break.`)) return;
        delete G.LEVELS[currentId];
        openLevel(Object.keys(G.LEVELS)[0]);
        markDirty();
      }
    }, btns, 'Delete');
    for (const id in G.LEVELS) {
      const L = G.LEVELS[id];
      const d = el('div', { class: 'lvlitem' + (id === currentId ? ' cur' : '') }, box);
      el('div', {}, d, `${L.title || id}`);
      el('small', {}, d, `${id} · ${L.w}×${L.h} · ${L.biome} · ${(L.enemies || []).length} foes`);
      d.addEventListener('click', () => openLevel(id));
    }
  }
  function openLevel(id) {
    currentId = id;
    sel = null;
    undoStack.length = redoStack.length = 0;
    const L = lvl();
    camX = L.w / 2; camY = L.h / 2;
    camZ = Math.max(24, Math.min(80, L.w * 0.62));
    rebuild(false);
    refreshLevels();
    if (tab === 'map') mapView.zoom = mapView.zoom; // noop, map reads live
  }

  function newLevelModal() {
    const box = $('modalBox');
    box.innerHTML = '';
    el('h3', {}, box, 'New level');
    const f = {};
    const mkRow = (label, type, val) => {
      const r = el('div', { class: 'frow' }, box);
      el('label', {}, r, label);
      const inp = el('input', { type }, r);
      inp.value = val;
      return inp;
    };
    f.id = mkRow('Id (letters)', 'text', 'newroom');
    f.title = mkRow('Title', 'text', 'New Chamber');
    f.w = mkRow('Width', 'number', 50);
    f.h = mkRow('Height', 'number', 22);
    const r = el('div', { class: 'frow' }, box);
    el('label', {}, r, 'Biome');
    const bs = el('select', {}, r);
    for (const b2 of G.World.BIOMES) el('option', { value: b2 }, bs, G.World.PAL[b2].label);
    const btns = el('div', { id: 'modalBtns' }, box);
    el('button', { class: 'tbtn', onclick: () => { $('modal').style.display = 'none'; } }, btns, 'Cancel');
    el('button', {
      class: 'tbtn play', onclick: () => {
        const id = (f.id.value || 'room').replace(/[^a-zA-Z0-9_]/g, '');
        if (!id || G.LEVELS[id]) return alert('Pick a unique id.');
        const w = U.clamp(parseInt(f.w.value) || 50, 20, 200);
        const h = U.clamp(parseInt(f.h.value) || 22, 12, 100);
        const tiles = [];
        for (let r2 = 0; r2 < h; r2++) {
          let row = '';
          for (let c = 0; c < w; c++) {
            const border = r2 < 2 || r2 >= h - 2 || c < 2 || c >= w - 2;
            const floor = r2 >= h - 6 && c >= 2 && c < w - 2;
            row += (border || floor) ? '#' : ' ';
          }
          tiles.push(row);
        }
        // carve a starting area opening above the floor
        const maxMx = Math.max(0, ...Object.values(G.LEVELS).map(L2 => (L2.mapPos ? L2.mapPos.mx : 0) + L2.w));
        G.LEVELS[id] = {
          id, title: f.title.value || id, area: null, biome: bs.value,
          w, h, mapPos: { mx: maxMx + 8, my: 0 },
          tiles, spawns: { P: { x: 5.5, y: h - 6 + 0.5 } }, enemies: [], props: [],
          transitions: []
        };
        $('modal').style.display = 'none';
        openLevel(id);
        markDirty();
      }
    }, btns, 'Create');
    $('modal').style.display = 'flex';
  }

  // ---------------- asset browser ----------------
  const ASSET_CATS = [
    { id: 'props', label: 'Props' },
    { id: 'decor', label: 'Decor' },
    { id: 'lights', label: 'Lights' },
    { id: 'enemies', label: 'Enemies' },
    { id: 'bosses', label: 'Bosses' },
    { id: 'markers', label: 'Markers' },
    { id: 'prefabs', label: 'Prefabs' }
  ];
  let assetCat = 'props';
  function assetList() {
    switch (assetCat) {
      case 'props': return [
        { cat: 'prop', id: 'bench', label: 'Bench (rest & save)', ico: '🪑' },
        { cat: 'prop', id: 'sign', label: 'Sign / tutorial', ico: '🪧', defaults: { text: 'Hello, wanderer.' } },
        { cat: 'prop', id: 'readable', label: 'Lore readable', ico: '📜', defaults: { title: 'Old inscription', text: 'Words worn by time...', style: 'tablet' } },
        { cat: 'prop', id: 'textTrigger', label: 'Text trigger zone', ico: '💬', defaults: { w: 4, h: 4, text: 'Something stirs...', once: true } },
        { cat: 'prop', id: 'lamp', label: 'Lamp', ico: '🏮' },
        { cat: 'prop', id: 'crystal', label: 'Glow crystal', ico: '💎' },
        { cat: 'prop', id: 'wings', label: 'Moth Wings pickup', ico: '🦋' },
        { cat: 'prop', id: 'shrine', label: 'Ending shrine', ico: '🛕' },
        { cat: 'prop', id: 'gate', label: 'Boss gate', ico: '🚪', defaults: { id: 0 } },
        { cat: 'prop', id: 'vendor', label: 'Vendor (charm shop)', ico: '🧙' },
        { cat: 'prop', id: 'charmPickup', label: 'Charm pickup', ico: '🔆', defaults: { charm: 'stoneheart' } }
      ];
      case 'decor': {
        const out = [];
        for (const k of G.World.DECOR_KINDS.standing) out.push({ cat: 'prop', id: 'decor', kind: k, label: k + ' (standing)', ico: '🌿' });
        for (const k of G.World.DECOR_KINDS.hanging) out.push({ cat: 'prop', id: 'decor', kind: k, label: k + ' (hanging)', ico: '🪢' });
        return out;
      }
      case 'lights': return [
        { cat: 'prop', id: 'light', label: 'Glow light', ico: '✨', defaults: { color: '#ffeecc', scale: 8, opacity: 0.3, flicker: false } },
        { cat: 'prop', id: 'light', label: 'Flickering light', ico: '🔥', defaults: { color: '#ffc878', scale: 7, opacity: 0.35, flicker: true } },
        { cat: 'prop', id: 'ray', label: 'God ray', ico: '🌤', defaults: { w: 5, h: 18, rot: -0.15, opacity: 0.1 } }
      ];
      case 'enemies': return G.Enemies.TYPES.map(t => ({ cat: 'enemy', id: t.id, label: t.label, ico: '🐛' }));
      case 'bosses': return G.Bosses.LIST.map(b2 => ({ cat: 'prop', id: 'bossTrigger', boss: b2.id, label: b2.label, ico: '👑', defaults: { r: 6 } }));
      case 'markers': return [
        { cat: 'spawn', id: 'spawn', label: 'Spawn point', ico: '📍' },
        { cat: 'zone', id: 'portal', label: 'Portal / transition', ico: '🌀' },
        { cat: 'prop', id: 'cutsceneTrigger', label: 'Cutscene trigger', ico: '🎬', defaults: { w: 4, h: 4, once: true } },
        { cat: 'prop', id: 'setActiveTrigger', label: 'Set-active trigger', ico: '🎚️', defaults: { w: 5, h: 5, once: false, targets: [] } }
      ];
      case 'prefabs': return Object.keys(prefabs).map(name => ({ cat: 'prefab', prefab: name, label: name, ico: '🧩', n: (prefabs[name].items || []).length, del: true }));
    }
    return [];
  }
  function refreshAssets() {
    const tabs = $('assetTabs');
    tabs.innerHTML = '';
    for (const c of ASSET_CATS) {
      const t = el('div', { class: 'ptab' + (assetCat === c.id ? ' on' : '') }, tabs, c.label);
      t.addEventListener('click', () => { assetCat = c.id; refreshAssets(); });
    }
    const body = $('assetBody');
    body.innerHTML = '';
    if (assetCat === 'prefabs') {
      const save = el('div', { class: 'asset', style: 'border-style:dashed' }, body);
      el('div', { class: 'ico' }, save, '＋');
      el('div', { class: 'nm' }, save, 'Save selection (Ctrl+G)');
      save.addEventListener('click', savePrefab);
      if (!Object.keys(prefabs).length) { const note = el('div', { class: 'nm', style: 'width:100%;padding:8px;color:var(--txt2)' }, body, 'Marquee-drag or Shift-click objects, then save them as a reusable prefab.'); }
    }
    for (const a of assetList()) {
      const d = el('div', { class: 'asset' + (placing && placing.label === a.label ? ' on' : '') }, body);
      el('div', { class: 'ico' }, d, a.ico);
      el('div', { class: 'nm' }, d, a.label + (a.n ? ' (' + a.n + ')' : ''));
      d.addEventListener('click', () => setPlacing(placing && placing.label === a.label ? null : a));
      if (a.del) {
        const x = el('div', { class: 'nm', style: 'position:absolute;top:1px;right:4px;color:#c66;cursor:pointer', title: 'Delete prefab' }, d, '✕');
        x.addEventListener('click', ev => { ev.stopPropagation(); if (confirm('Delete prefab "' + a.prefab + '"?')) deletePrefab(a.prefab); });
      }
    }
  }
  function setPlacing(a) {
    placing = a;
    if (a) tool = 'select';
    refreshToolbar();
    refreshAssets();
    $('viewportHint').textContent = a ? `Click in the scene to place: ${a.label}` : '';
  }

  // ---------------- map tab ----------------
  const mapView = { pan: { x: 200, y: 10 }, zoom: 2.2 };
  let mapDrag = null;
  let lastMapTap = { t: 0, x: 0, y: 0 };
  function mapMouseDown(e) {
    const r = $('viewportWrap').getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    const view = { w: r.width, h: r.height, pan: mapView.pan, zoom: mapView.zoom };
    const hit = G.MapView.roomAt(px, py, view);
    const primary = e.pointerType === 'mouse' ? e.button === 0 : true;
    if (primary && hit) {
      // open on double-click (mouse) or double-tap (touch/pen) within ~350ms
      const now = performance.now();
      const dbl = (e.pointerType === 'mouse' && e.detail === 2) ||
        (now - lastMapTap.t < 350 && Math.abs(px - lastMapTap.x) < 24 && Math.abs(py - lastMapTap.y) < 24);
      lastMapTap = { t: now, x: px, y: py };
      if (dbl) { openLevel(hit); setTab('scene'); return; }
      pushUndo();
      const L = G.LEVELS[hit];
      mapDrag = { id: hit, sx: px, sy: py, mx: L.mapPos.mx, my: L.mapPos.my };
    } else {
      mapDrag = { pan: true, sx: px, sy: py, px: mapView.pan.x, py: mapView.pan.y };
    }
  }
  function mapMouseMove(e) {
    if (!mapDrag) return;
    const r = $('viewportWrap').getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    if (mapDrag.pan) {
      mapView.pan.x = mapDrag.px - (px - mapDrag.sx) / mapView.zoom;
      mapView.pan.y = mapDrag.py - (py - mapDrag.sy) / mapView.zoom;
    } else {
      const L = G.LEVELS[mapDrag.id];
      L.mapPos = L.mapPos || { mx: 0, my: 0 };
      let mx = mapDrag.mx + (px - mapDrag.sx) / mapView.zoom;
      let my = mapDrag.my - (py - mapDrag.sy) / mapView.zoom;
      L.mapPos.mx = Math.round(mx);
      L.mapPos.my = Math.round(my);
      markDirty();
    }
  }
  // cached per-room tile-shape thumbnails (1px/tile)
  const thumbCache = {};
  function roomThumb(lvl) {
    const key = lvl.id + ':' + lvl.w + 'x' + lvl.h + ':' + (lvl.tiles ? lvl.tiles.length : 0);
    if (thumbCache[lvl.id] && thumbCache[lvl.id].key === key) return thumbCache[lvl.id].c;
    const cv = document.createElement('canvas');
    cv.width = lvl.w; cv.height = lvl.h;
    const c = cv.getContext('2d');
    const pal = (G.World.PAL[lvl.biome] || G.World.PAL.verdant);
    const hx = '#' + ((pal.moss || 0x55b070).toString(16).padStart(6, '0'));
    const tiles = lvl.tiles || [];
    for (let r = 0; r < lvl.h; r++) {
      const row = tiles[r] || '';
      for (let col = 0; col < lvl.w; col++) {
        const ch = row[col];
        if (ch === '#') { c.fillStyle = hx; c.fillRect(col, r, 1, 1); }
        else if (ch === '=') { c.fillStyle = 'rgba(180,200,170,0.6)'; c.fillRect(col, r, 1, 1); }
        else if (ch === '^') { c.fillStyle = '#d06060'; c.fillRect(col, r, 1, 1); }
      }
    }
    thumbCache[lvl.id] = { key, c: cv };
    return cv;
  }

  // validate transitions across the whole world
  function validateWorld() {
    const warns = [], bad = {};
    for (const id in G.LEVELS) {
      const L = G.LEVELS[id];
      const trs = (L.transitions || []);
      for (const tz of trs) {
        const to = tz.to;
        if (!to || !G.LEVELS[to]) { warns.push({ id, msg: `${id}: exit points to missing level "${to || '∅'}"` }); bad[id] = 1; continue; }
        const sp = tz.spawn;
        if (sp && G.LEVELS[to].spawns && !G.LEVELS[to].spawns[sp]) { warns.push({ id, msg: `${id} → ${to}: arrival spawn "${sp}" not found in ${to}` }); bad[id] = 1; }
        const back = (G.LEVELS[to].transitions || []).some(t2 => t2.to === id);
        if (!back) { warns.push({ id, msg: `${id} → ${to}: no return exit from ${to} (one-way)` }); bad[id] = 1; bad[to] = 1; }
      }
    }
    return { warns, bad };
  }

  function drawMapTab() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    G.MapView.draw(mctx, {
      w: G.viewW, h: G.viewH, pan: mapView.pan, zoom: mapView.zoom,
      visitedOnly: false, current: null, selected: currentId, showLabels: true
    });
    const view = { w: G.viewW, h: G.viewH, pan: mapView.pan, zoom: mapView.zoom };
    // room thumbnails
    mctx.save();
    mctx.globalAlpha = 0.5;
    mctx.imageSmoothingEnabled = false;
    for (const id in G.LEVELS) {
      const L = G.LEVELS[id];
      const r = G.MapView.roomScreenRect(L, view);
      if (r.w < 6 || r.h < 6) continue;
      try { mctx.drawImage(roomThumb(L), r.x, r.y, r.w, r.h); } catch (e) { }
    }
    mctx.restore();
    // validation markers + summary
    const { warns, bad } = validateWorld();
    for (const id in bad) {
      const L = G.LEVELS[id]; if (!L) continue;
      const r = G.MapView.roomScreenRect(L, view);
      mctx.font = '16px Segoe UI'; mctx.textAlign = 'center'; mctx.fillStyle = '#ffcf4a';
      mctx.fillText('⚠', r.x + r.w - 10, r.y + 16);
    }
    mctx.textAlign = 'left';
    if (warns.length) {
      const pad = 8, lh = 15, n = Math.min(warns.length, 8);
      const bw = 420, bh = 24 + n * lh + (warns.length > n ? lh : 0);
      mctx.fillStyle = 'rgba(20,12,8,0.82)'; mctx.fillRect(10, 10, bw, bh);
      mctx.strokeStyle = 'rgba(255,200,80,0.5)'; mctx.strokeRect(10, 10, bw, bh);
      mctx.fillStyle = '#ffcf4a'; mctx.font = 'bold 12px Segoe UI';
      mctx.fillText(`⚠ ${warns.length} world issue${warns.length > 1 ? 's' : ''}`, 18, 28);
      mctx.font = '11px Segoe UI'; mctx.fillStyle = 'rgba(240,225,200,0.9)';
      for (let i = 0; i < n; i++) mctx.fillText('· ' + warns[i].msg, 18, 28 + (i + 1) * lh);
      if (warns.length > n) mctx.fillText(`  …and ${warns.length - n} more`, 18, 28 + (n + 1) * lh);
    } else {
      mctx.fillStyle = 'rgba(120,220,150,0.85)'; mctx.font = 'bold 12px Segoe UI';
      mctx.fillText('✓ world connections look valid', 14, 26);
    }
    mctx.font = '12px Segoe UI';
    mctx.fillStyle = 'rgba(200,215,210,0.6)';
    mctx.fillText('Drag rooms to arrange · double-click to open · wheel to zoom · ⚠ = transition issue', 12, G.viewH - 12);
  }

  function setTab(t) {
    if (csPreview) stopCsPreview();
    tab = t;
    $('tabScene').classList.toggle('on', t === 'scene');
    $('tabMap').classList.toggle('on', t === 'map');
    $('tabCutscene').classList.toggle('on', t === 'cutscene');
    mapCanvas.style.display = t === 'map' ? 'block' : 'none';
    glCanvas.style.display = t === 'scene' ? 'block' : 'none';
    $('csView').classList.toggle('on', t === 'cutscene');
    $('viewportHint').textContent = '';
    if (t === 'cutscene') { setLeftTab('S'); refreshCsTab(); }
  }

  // ---------------- cutscene editor ----------------
  function markCsDirty() { csDirty = true; markDirty(); }

  function refreshScenes() {
    const box = $('scenes');
    box.innerHTML = '';
    G.CUTSCENES = G.CUTSCENES || {};
    if (!csCurrent || !G.CUTSCENES[csCurrent]) csCurrent = Object.keys(G.CUTSCENES)[0] || null;
    const btns = el('div', { class: 'lvlbtns' }, box);
    el('button', { class: 'tbtn', onclick: newCutscene }, btns, '+ New');
    el('button', {
      class: 'tbtn', onclick: () => {
        if (!csCurrent) return;
        let nid = csCurrent + '_copy', n = 2;
        while (G.CUTSCENES[nid]) nid = csCurrent + '_copy' + n++;
        G.CUTSCENES[nid] = JSON.parse(JSON.stringify(G.CUTSCENES[csCurrent]));
        G.CUTSCENES[nid].id = nid;
        G.CUTSCENES[nid].name = (G.CUTSCENES[csCurrent].name || nid) + ' copy';
        csCurrent = nid; csSel = -1; markCsDirty(); refreshScenes(); refreshInspector();
      }
    }, btns, 'Duplicate');
    el('button', {
      class: 'tbtn dangerBtn', onclick: () => {
        if (!csCurrent) return;
        if (!confirm(`Delete cutscene "${csCurrent}"?`)) return;
        delete G.CUTSCENES[csCurrent];
        csCurrent = Object.keys(G.CUTSCENES)[0] || null;
        csSel = -1; markCsDirty(); refreshScenes(); refreshInspector();
      }
    }, btns, 'Delete');

    // cutscene list
    for (const id in G.CUTSCENES) {
      const c = G.CUTSCENES[id];
      const d = el('div', { class: 'lvlitem' + (id === csCurrent ? ' cur' : '') }, box);
      el('div', {}, d, c.name || id);
      el('small', {}, d, `${id} · ${(c.events || []).length} events · level ${c.level || '—'}`);
      d.addEventListener('click', () => { csCurrent = id; csSel = -1; refreshScenes(); refreshInspector(); });
    }
    el('div', { class: 'insNote', style: 'padding:8px' }, box,
      csCurrent ? 'Open the Cutscene tab (top) to edit the timeline.' : 'Make a cutscene to begin.');
    refreshCsTab();
  }

  // the big interactive timeline lives in the central "Cutscene" tab
  function refreshCsTab() {
    const box = $('csView');
    if (!box) return;
    box.innerHTML = '';
    if (!csCurrent || !G.CUTSCENES[csCurrent]) { el('div', { class: 'cshead' }, box, 'No cutscene selected — pick or make one in the Scenes panel (left).'); return; }
    const c = G.CUTSCENES[csCurrent];
    c.events = c.events || [];
    el('div', { class: 'cshead' }, box, '▦  ' + (c.name || csCurrent) + '  —  timeline  (' + c.events.length + ' events · plays over level "' + (c.level || '—') + '")');
    // add-event + preview row
    const addRow = el('div', { class: 'lvlbtns', style: 'padding:0 0 10px' }, box);
    const typeSel = el('select', { style: 'background:#15151a;color:#cfd2d6;border:1px solid #3c3c44;border-radius:3px;padding:4px;min-width:160px' }, addRow);
    for (const ty in CS_EVENTS) el('option', { value: ty }, typeSel, ty);
    el('button', {
      class: 'tbtn', onclick: () => {
        const spec = CS_EVENTS[typeSel.value];
        const lastEnd = c.events.reduce((m, e) => Math.max(m, e.t + (e.dur || 0)), 0);
        c.events.push(Object.assign({ t: +lastEnd.toFixed(2), dur: spec.dur, type: typeSel.value }, JSON.parse(JSON.stringify(spec.def))));
        csSel = c.events.length - 1;
        markCsDirty(); refreshCsTab(); refreshScenes(); refreshInspector();
      }
    }, addRow, '+ Add event');
    el('button', { class: 'tbtn play', onclick: () => startCsPreview(csCurrent) }, addRow, '▶ Preview');
    el('button', { class: 'tbtn', onclick: async () => { if (await save()) openPlay(); }, title: 'Save & run the whole cutscene inside the actual game' }, addRow, '▶ Playtest in game');

    // ---- visual timeline (drag blocks horizontally to retime) ----
    const SCALE = 64;            // px per second (roomy in the central view)
    const SCREEN = new Set(['fade', 'letterbox', 'blur', 'text', 'camera', 'cameraRestore', 'shakePulse', 'sfx', 'flash']);
    const total = Math.max(3, c.events.reduce((m, e) => Math.max(m, e.t + (e.dur || 0)), 0)) + 1;
    const evs = c.events.map((e, i) => ({ e, i })).sort((a, b) => a.e.t - b.e.t);
    const laneEnds = [], lane = {};
    for (const { e, i } of evs) {
      let ln = laneEnds.findIndex(end => end <= e.t + 1e-6);
      if (ln < 0) { ln = laneEnds.length; laneEnds.push(0); }
      laneEnds[ln] = e.t + Math.max(0.1, e.dur || 0.1);
      lane[i] = ln;
    }
    const lanes = Math.max(1, laneEnds.length);
    const LH = 30;
    const tl = el('div', { class: 'cstl', style: `height:${lanes * LH + 22}px` }, box);
    const inner = el('div', { style: `position:relative;width:${total * SCALE + 24}px;height:100%` }, tl);
    const ruler = el('div', { class: 'ruler', style: `width:${total * SCALE + 24}px;height:18px` }, inner);
    for (let s = 0; s <= total; s++) el('div', { class: 'tick', style: `left:${s * SCALE}px;width:${SCALE}px` }, ruler, s + 's');
    for (const { e, i } of evs) {
      const blk = el('div', {
        class: 'cstlblk ' + (SCREEN.has(e.type) ? 'screen' : 'actor') + (csSel === i ? ' sel' : ''),
        style: `left:${e.t * SCALE}px;top:${lane[i] * LH + 20}px;height:24px;line-height:24px;font-size:11px;width:${Math.max(16, (e.dur || 0.2) * SCALE)}px`,
        title: `${e.type} — ${e.t.toFixed(2)}s for ${(e.dur || 0)}s`
      }, inner, e.type);
      // Block-level drag start; the window-level handlers (set up once) continue
      // the drag even when the cursor leaves a narrow block.
      blk.addEventListener('pointerdown', ev => {
        ev.preventDefault();
        csSel = i; refreshInspector();
        document.querySelectorAll('#csView .cstlblk.sel').forEach(b => b.classList.remove('sel')); blk.classList.add('sel');
        csDrag = { e, blk, startX: ev.clientX, startT: e.t, scale: SCALE, moved: false };
      });
    }
    el('div', { class: 'insNote', style: 'margin-top:10px' }, box, 'Drag a block sideways to retime it · click to edit its fields in the Inspector → · screen events are blue, protagonist events green.');
  }

  function newCutscene() {
    let id = prompt('New cutscene id (letters/numbers):', 'scene' + (Object.keys(G.CUTSCENES || {}).length + 1));
    if (!id) return;
    id = id.replace(/[^a-zA-Z0-9_]/g, '');
    if (!id || G.CUTSCENES[id]) return alert('Pick a unique id.');
    G.CUTSCENES[id] = {
      id, name: id, level: currentId, skippable: true,
      events: [
        { t: 0, dur: 0.6, type: 'letterbox', from: 0, to: 1 },
        { t: 0, dur: 1, type: 'fade', from: 1, to: 0 },
        { t: 2, dur: 3, type: 'text', text: 'New cutscene.' },
        { t: 5, dur: 1, type: 'letterbox', from: 1, to: 0 }
      ]
    };
    csCurrent = id; csSel = -1; markCsDirty(); refreshScenes(); refreshInspector();
  }

  function refreshCsInspector() {
    const body = $('insBody');
    body.innerHTML = '';
    const c = csCur();
    if (!c) { el('div', { class: 'insNote' }, body, 'No cutscene. Create one in the Scenes panel →'); return; }
    if (csSel < 0 || !c.events[csSel]) {
      // cutscene-level settings
      $('stSel').textContent = `cutscene: ${csCurrent}`;
      el('div', { class: 'insNote' }, body, `CUTSCENE — ${csCurrent}`);
      textField(body, 'Name', () => c.name, v => { c.name = v; markCsDirty(); refreshScenes(); });
      selectField(body, 'Level', Object.keys(G.LEVELS).map(id => ({ v: id, t: id })), () => c.level || currentId, v => { c.level = v; markCsDirty(); });
      checkField(body, 'Skippable', () => c.skippable !== false, v => { c.skippable = v; markCsDirty(); });
      el('div', { class: 'insNote' }, body,
        'Edit the timeline above. "▶ Preview" plays it live here in the viewport with the real character rig; ' +
        '"▶ Playtest in game" runs it inside the actual game. ' +
        'To play it automatically, set it as a level\'s Intro cutscene (Hierarchy tab → deselect → Level settings).');
      const tot = (c.events || []).reduce((m, e) => Math.max(m, e.t + (e.dur || 0)), 0);
      el('div', { class: 'insNote' }, body, `Total duration: ${tot.toFixed(1)}s · ${(c.events || []).length} events`);
      return;
    }
    const ev = c.events[csSel];
    const spec = CS_EVENTS[ev.type] || { fields: [], hint: '' };
    $('stSel').textContent = `event: ${ev.type} @ ${ev.t}s`;
    el('div', { class: 'insNote' }, body, `EVENT — ${ev.type}`);
    if (spec.hint) el('div', { class: 'insNote' }, body, spec.hint);
    const csNum = (label, key, step) => {
      const r = el('div', { class: 'frow' }, body);
      el('label', {}, r, label);
      const inp = el('input', { type: 'number', step: step || 0.1 }, r);
      inp.value = ev[key] !== undefined ? ev[key] : 0;
      inp.addEventListener('change', () => { ev[key] = parseFloat(inp.value) || 0; markCsDirty(); refreshScenes(); });
    };
    const csText = (label, key) => {
      const r = el('div', { class: 'frow' }, body);
      el('label', {}, r, label);
      const inp = el('input', { type: 'text' }, r);
      inp.value = ev[key] || '';
      inp.addEventListener('change', () => { ev[key] = inp.value; markCsDirty(); refreshScenes(); });
    };
    const r0 = el('div', { class: 'frow' }, body);
    el('label', {}, r0, 'Type');
    const tsel = el('select', {}, r0);
    for (const ty in CS_EVENTS) el('option', { value: ty }, tsel, ty);
    tsel.value = ev.type;
    tsel.addEventListener('change', () => {
      const spec2 = CS_EVENTS[tsel.value];
      const keep = { t: ev.t, dur: ev.dur, type: tsel.value };
      c.events[csSel] = Object.assign(keep, JSON.parse(JSON.stringify(spec2.def)));
      markCsDirty(); refreshScenes(); refreshInspector();
    });
    csNum('Start (t)', 't', 0.1);
    csNum('Duration', 'dur', 0.1);
    for (const [key, kind] of spec.fields) {
      if (kind === 'num') csNum(key, key, 0.1);
      else csText(key, key);
    }
    const btns = el('div', { class: 'frow', style: 'margin-top:10px' }, body);
    el('button', {
      class: 'tbtn', onclick: () => {
        const copy = JSON.parse(JSON.stringify(ev));
        copy.t = +(copy.t + (copy.dur || 0)).toFixed(2);
        c.events.push(copy); csSel = c.events.length - 1;
        markCsDirty(); refreshScenes(); refreshInspector();
      }
    }, btns, 'Duplicate');
    el('button', {
      class: 'tbtn dangerBtn', onclick: () => {
        c.events.splice(csSel, 1); csSel = -1;
        markCsDirty(); refreshScenes(); refreshInspector();
      }
    }, btns, 'Delete');
  }

  // ---------------- toolbar ----------------
  function refreshToolbar() {
    document.querySelectorAll('.tool').forEach(b2 => b2.classList.toggle('on', b2.dataset.tool === tool && !placing));
    $('btnSnap').classList.toggle('on', snap);
    $('btnGizmos').classList.toggle('on', gizmos);
    $('btnScatter').classList.toggle('on', scatter);
  }
  document.querySelectorAll('.tool').forEach(b2 => {
    b2.addEventListener('click', () => { tool = b2.dataset.tool; setPlacing(null); refreshToolbar(); });
  });
  $('btnSnap').addEventListener('click', () => { snap = !snap; refreshToolbar(); });
  $('btnGizmos').addEventListener('click', () => { gizmos = !gizmos; refreshToolbar(); });
  $('btnScatter').addEventListener('click', () => { scatter = !scatter; refreshToolbar(); });
  $('btnUndo').addEventListener('click', doUndo);
  $('btnRedo').addEventListener('click', doRedo);
  $('tabScene').addEventListener('click', () => setTab('scene'));
  $('tabMap').addEventListener('click', () => setTab('map'));
  $('tabCutscene').addEventListener('click', () => setTab('cutscene'));
  function setLeftTab(which) {
    csMode = which === 'S';
    $('ltabH').classList.toggle('on', which === 'H');
    $('ltabL').classList.toggle('on', which === 'L');
    $('ltabS').classList.toggle('on', which === 'S');
    $('hierarchy').style.display = which === 'H' ? 'block' : 'none';
    $('levels').style.display = which === 'L' ? 'block' : 'none';
    $('scenes').style.display = which === 'S' ? 'block' : 'none';
    if (which === 'L') refreshLevels();
    if (which === 'S') { refreshScenes(); }
    refreshInspector();
  }
  $('ltabH').addEventListener('click', () => setLeftTab('H'));
  $('ltabL').addEventListener('click', () => setLeftTab('L'));
  $('ltabS').addEventListener('click', () => setLeftTab('S'));

  // ================= save destination: local server vs GitHub =================
  // Local mode posts to the Node server (writes files on this PC). GitHub mode commits
  // straight to the repo via the GitHub API — for when the editor is hosted statically
  // (e.g. opened on an iPad). The "local editor then push" workflow is unchanged.
  const GH_KEY = 'mossveil-gh';
  const MODE_KEY = 'mossveil-savemode';
  let serverPresent = false;                                   // is the local file-server here?
  let saveModeOverride = localStorage.getItem(MODE_KEY) || 'auto';   // 'auto' | 'local' | 'github'
  function ghConfig() {
    let c = {};
    try { c = JSON.parse(localStorage.getItem(GH_KEY)) || {}; } catch (_) { }
    return Object.assign({ owner: 'DylannFontus', repo: 'Mossveil', branch: 'main', token: '' }, c);
  }
  function setGhConfig(c) { localStorage.setItem(GH_KEY, JSON.stringify(c)); }
  function effectiveMode() {
    if (saveModeOverride === 'local' || saveModeOverride === 'github') return saveModeOverride;
    return serverPresent ? 'local' : 'github';                 // auto
  }
  let saveMsgTimer = null;
  function setSaveStatus(msg, ms) {
    const e2 = $('saveMsg'); if (!e2) return;
    e2.textContent = msg || '';
    if (saveMsgTimer) { clearTimeout(saveMsgTimer); saveMsgTimer = null; }
    if (ms) saveMsgTimer = setTimeout(() => { e2.textContent = ''; }, ms);
  }

  // exact mirror of the server's data/<name>.js generator (keeps git diffs clean)
  function jsonText(obj) { return JSON.stringify(obj, null, 1); }
  function mirrorJs(name, global, obj) {
    return `// generated from data/${name}.json - do not edit by hand (use the editor)\n` +
      'window.G = window.G || {};\nG.' + global + ' = ' + jsonText(obj) + ';\n';
  }

  // ---- GitHub REST helpers (atomic commit of all four data files via the Git Data API) ----
  async function gh(api, opts, cfg) {
    const c = cfg || ghConfig();
    const res = await fetch('https://api.github.com' + api, Object.assign({
      cache: 'no-store',                       // never read a stale branch tip
      headers: {
        'Authorization': 'Bearer ' + c.token,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json'
      }
    }, opts || {}));
    if (!res.ok) {
      let msg = 'HTTP ' + res.status;
      try { const j = await res.json(); if (j && j.message) msg = (j.status ? j.status + ' ' : '') + j.message; } catch (_) { }
      throw new Error(msg);
    }
    return res.status === 204 ? {} : res.json();
  }
  async function githubCommit(files, message) {
    const c = ghConfig();
    if (!c.token) throw new Error('No GitHub token set — open "→ …" to configure.');
    const base = `/repos/${c.owner}/${c.repo}`;
    const br = encodeURIComponent(c.branch);
    let lastErr;
    // re-read the tip and rebuild on it each attempt, so a tip that moved
    // under us (concurrent push / cache) self-heals instead of erroring
    for (let attempt = 0; attempt < 4; attempt++) {
      const ref = await gh(`${base}/git/ref/heads/${br}`);
      const baseSha = ref.object.sha;
      const baseCommit = await gh(`${base}/git/commits/${baseSha}`);
      const tree = await gh(`${base}/git/trees`, {
        method: 'POST',
        body: JSON.stringify({
          base_tree: baseCommit.tree.sha,
          tree: files.map(f => ({ path: f.path, mode: '100644', type: 'blob', content: f.content }))
        })
      });
      const commit = await gh(`${base}/git/commits`, {
        method: 'POST',
        body: JSON.stringify({ message, tree: tree.sha, parents: [baseSha] })
      });
      try {
        await gh(`${base}/git/refs/heads/${br}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false }) });
        return commit.sha;
      } catch (e) {
        lastErr = e;
        if (attempt < 3 && /fast forward|422|409|conflict/i.test(e.message)) {
          await new Promise(r => setTimeout(r, 350 * (attempt + 1)));
          continue;                            // someone moved the branch — re-read and redo
        }
        throw e;
      }
    }
    throw lastErr;
  }
  async function saveToGithub() {
    const files = [
      { path: 'data/levels.json', content: jsonText(G.LEVELS) },
      { path: 'data/levels.js', content: mirrorJs('levels', 'LEVELS', G.LEVELS) },
      { path: 'data/cutscenes.json', content: jsonText(G.CUTSCENES || {}) },
      { path: 'data/cutscenes.js', content: mirrorJs('cutscenes', 'CUTSCENES', G.CUTSCENES || {}) }
    ];
    const n = Object.keys(G.LEVELS).length;
    return githubCommit(files, `Edit levels & cutscenes (${n} levels) via MOSSVEIL editor`);
  }

  function refreshSaveTarget() {
    const btn = $('btnSaveTarget'); if (!btn) return;
    const c = ghConfig();
    if (effectiveMode() === 'github') {
      btn.textContent = '→ GitHub';
      btn.classList.toggle('warn', !c.token);
      btn.title = c.token
        ? `Save commits to ${c.owner}/${c.repo} @ ${c.branch}`
        : 'Save will commit to GitHub — no token set yet, click to configure';
    } else {
      btn.textContent = '→ local';
      btn.classList.remove('warn');
      btn.title = 'Save writes to your local project files (push to GitHub yourself)';
    }
  }
  function saveTargetModal() {
    const box = $('modalBox'); box.innerHTML = '';
    el('h3', {}, box, 'Save destination');
    el('div', { class: 'insNote' }, box, serverPresent
      ? 'A local editor server is running, so "Auto" saves to the project files on this PC.'
      : 'No local server detected, so "Auto" commits straight to GitHub.');
    const r0 = el('div', { class: 'frow' }, box);
    el('label', {}, r0, 'When I Save');
    const modeSel = el('select', {}, r0);
    [['auto', 'Auto (detect)'], ['local', 'Local files (server)'], ['github', 'GitHub commit']].forEach(([v, t]) => {
      const o = el('option', { value: v }, modeSel, t); if (v === saveModeOverride) o.selected = true;
    });
    el('div', { class: 'insNote', style: 'margin-top:10px;font-weight:600;color:var(--txt)' }, box, 'GitHub (for hosted / iPad use)');
    const c = ghConfig();
    const f = {};
    const mkRow = (label, type, val, ph) => {
      const r = el('div', { class: 'frow' }, box);
      el('label', {}, r, label);
      const inp = el('input', { type, placeholder: ph || '' }, r); inp.value = val || '';
      return inp;
    };
    f.owner = mkRow('Owner', 'text', c.owner, 'github username');
    f.repo = mkRow('Repo', 'text', c.repo, 'Mossveil');
    f.branch = mkRow('Branch', 'text', c.branch, 'main');
    f.token = mkRow('Token', 'password', c.token, 'fine-grained PAT · Contents: read/write');
    el('div', { class: 'insNote' }, box, 'The token is stored only in this browser on this device. Use a fine-grained token scoped to just this repo with Contents read/write.');
    const status = el('div', { class: 'insNote', style: 'min-height:16px' }, box);
    const read = () => ({ owner: f.owner.value.trim(), repo: f.repo.value.trim(), branch: f.branch.value.trim() || 'main', token: f.token.value.trim() });
    const btns = el('div', { id: 'modalBtns' }, box);
    el('button', {
      class: 'tbtn', onclick: async () => {
        const tmp = read(); status.textContent = 'Testing…';
        try {
          const repo = await gh(`/repos/${tmp.owner}/${tmp.repo}`, {}, tmp);
          status.textContent = (repo.permissions && repo.permissions.push)
            ? '✓ Connected — write access OK.'
            : '⚠ Connected, but this token may lack write access.';
        } catch (e) { status.textContent = '✗ ' + e.message; }
      }
    }, btns, 'Test connection');
    el('button', { class: 'tbtn', onclick: () => { $('modal').style.display = 'none'; } }, btns, 'Cancel');
    el('button', {
      class: 'tbtn play', onclick: () => {
        saveModeOverride = modeSel.value; localStorage.setItem(MODE_KEY, saveModeOverride);
        setGhConfig(read());
        $('modal').style.display = 'none';
        refreshSaveTarget();
      }
    }, btns, 'Save settings');
    $('modal').style.display = 'flex';
  }

  async function postData(api, obj) {
    const res = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });
    const j = await res.json().catch(() => ({ ok: false }));
    if (!j.ok) alert('Save failed: ' + (j.error || res.status));
    return j.ok;
  }
  let saving = false;
  async function save() {
    if (saving) return false;                  // ignore overlapping saves (prevents commit races)
    // nothing changed since the last save — don't make a redundant commit/redeploy.
    // (this is why "From Start" right after a Save no longer re-commits)
    if (!dirty && !csDirty) { setSaveStatus('already saved ✓', 1500); return true; }
    saving = true;
    try {
      if (effectiveMode() === 'github') {
        try {
          setSaveStatus('committing to GitHub…');
          await saveToGithub();
          dirty = false; csDirty = false; $('dirty').style.display = 'none';
          setSaveStatus('saved to GitHub ✓', 3000);
          return true;
        } catch (e) {
          setSaveStatus('');
          alert('GitHub save failed: ' + e.message + '\n\nCheck the token / repo / branch under "→ …".');
          return false;
        }
      }
      const a = await postData('/api/levels', G.LEVELS);
      const b = await postData('/api/cutscenes', G.CUTSCENES || {});
      if (a && b) { dirty = false; csDirty = false; $('dirty').style.display = 'none'; }
      return a && b;
    } finally {
      saving = false;
    }
  }
  $('btnSave').addEventListener('click', save);
  $('btnSaveTarget').addEventListener('click', saveTargetModal);
  $('btnTest').addEventListener('click', async () => {
    if (await save()) {
      // relative path (../index.html) so it works under a hosting subpath too (e.g. GitHub Pages /<repo>/)
      if (csMode && csCurrent) { window.open(`../index.html?cutscene=${csCurrent}`, 'mossveil-test'); return; }
      const L = lvl();
      const sp = L.spawns && (L.spawns.P ? 'P' : Object.keys(L.spawns)[0]);
      window.open(`../index.html?level=${currentId}${sp ? '&spawn=' + sp : ''}`, 'mossveil-test');
    }
  });
  $('btnTestStart').addEventListener('click', async () => {
    if (await save()) window.open('../index.html', 'mossveil-test');
  });

  // ---------------- in-editor playtest (iframe overlay) ----------------
  function playUrl() {
    if (csMode && csCurrent) return `../index.html?cutscene=${csCurrent}`;
    const L = lvl();
    const sp = L.spawns && (L.spawns.P ? 'P' : Object.keys(L.spawns)[0]);
    return `../index.html?level=${currentId}${sp ? '&spawn=' + sp : ''}`;
  }
  function openPlay() {
    $('playLabel').textContent = csMode && csCurrent ? '▶ Playtest — ' + csCurrent : '▶ Playtest — ' + currentId;
    $('playIframe').src = playUrl();
    $('playFrame').classList.add('on');
  }
  function closePlay() {
    $('playFrame').classList.remove('on');
    $('playIframe').src = 'about:blank';   // unload the game so it stops running
  }
  $('btnPlayHere').addEventListener('click', async () => { if (await save()) openPlay(); });
  $('playClose').addEventListener('click', closePlay);

  // ---------------- in-editor cutscene preview ----------------
  // Plays the cutscene live in the 3D viewport with a real player rig, so you can
  // watch the protagonist perform the animations without launching the whole game.
  let csBarEl = null, csBarLabel = null, csBarTime = null;
  function ensureCsBar() {
    if (csBarEl) return;
    csBarEl = el('div', {
      style: 'position:absolute;top:10px;left:50%;transform:translateX(-50%);z-index:23;display:none;' +
        'align-items:center;gap:10px;padding:7px 12px;background:rgba(8,12,14,0.86);border:1px solid #2a3a33;' +
        'border-radius:9px;color:#cfe7dc;font:600 12px system-ui;box-shadow:0 6px 22px rgba(0,0,0,0.5)'
    }, $('viewportWrap'));
    csBarLabel = el('span', {}, csBarEl, '▶ Preview');
    csBarTime = el('span', { style: 'color:#7fdcb0;min-width:78px;font-variant-numeric:tabular-nums' }, csBarEl, '');
    el('button', { class: 'tbtn', onclick: () => replayCsPreview() }, csBarEl, '⟲ Replay');
    el('button', { class: 'tbtn', onclick: () => stopCsPreview() }, csBarEl, '✕ Stop (Esc)');
  }
  function showCsBar(on, name) {
    ensureCsBar();
    csBarEl.style.display = on ? 'flex' : 'none';
    if (name !== undefined) csBarLabel.textContent = '▶ Previewing — ' + name;
  }

  function startCsPreview(id) {
    const cs = G.CUTSCENES && G.CUTSCENES[id];
    if (!cs || !cs.events || !cs.events.length) { alert('This cutscene has no events yet — add some in the timeline first.'); return; }
    if (csPreview) stopCsPreview();
    const lvId = (cs.level && G.LEVELS[cs.level]) ? cs.level : currentId;
    let sp;
    try { sp = G.World.load(lvId, 'P'); } catch (err) { console.error(err); alert('Could not load the level this cutscene plays over.'); return; }
    if (G.player && G.player.root) G.scene.remove(G.player.root);
    const p = G.Player.create(sp.x, sp.y);
    p.cinematic = true;
    csPreview = { id, restoreId: currentId, sx: sp.x, sy: sp.y, lastCam: { x: sp.x, y: sp.y + 1.4, z: 30 }, done: false };
    $('csView').classList.remove('on');   // reveal the GL viewport behind the timeline
    glCanvas.style.display = 'block';     // the cutscene tab normally hides it
    showCsBar(true, cs.name || id);
    runCsFromStart();
  }
  function runCsFromStart() {
    const cp = csPreview; if (!cp) return;
    if (G.player) { G.player.body.x = cp.sx; G.player.body.y = cp.sy; }
    cp.done = false;
    G.Cutscene.start(cp.id, {
      spawnX: cp.sx, spawnY: cp.sy,
      gameplayCam: () => ({ x: cp.sx + 1.7, y: cp.sy + 1.2, z: 30 }),
      onDone: () => { if (csPreview) csPreview.done = true; }
    });
  }
  function replayCsPreview() { if (csPreview) { if (G.Cutscene.active) G.Cutscene.finish(); runCsFromStart(); } }
  function stopCsPreview() {
    if (!csPreview) return;
    if (G.Cutscene.active) G.Cutscene.finish();
    if (G.player && G.player.root) G.scene.remove(G.player.root);
    G.player = null;
    if (G.renderer) G.renderer.domElement.style.filter = '';
    showCsBar(false);
    csPreview = null;
    rebuild();                       // restore the editor's working level
    glCanvas.style.display = (tab === 'scene') ? 'block' : 'none';
    if (tab === 'cutscene') $('csView').classList.add('on');
  }

  // ---------------- keyboard ----------------
  addEventListener('keydown', e => {
    if (csPreview) { if (e.code === 'Escape') stopCsPreview(); else if (e.code === 'KeyR') replayCsPreview(); return; }
    if ($('playFrame').classList.contains('on')) { if (e.code === 'Escape') closePlay(); return; }
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (e.ctrlKey && e.code === 'KeyS') { e.preventDefault(); save(); return; }
    if (typing) return;
    if (csMode || tab === 'cutscene') return; // cutscene editing: no level shortcuts
    if (e.ctrlKey && e.code === 'KeyZ') { e.preventDefault(); doUndo(); return; }
    if (e.ctrlKey && (e.code === 'KeyY' || (e.shiftKey && e.code === 'KeyZ'))) { e.preventDefault(); doRedo(); return; }
    if (e.ctrlKey && e.code === 'KeyD') { e.preventDefault(); duplicateSelected(); return; }
    if (e.ctrlKey && e.code === 'KeyC') { e.preventDefault(); copySelection(); return; }
    if (e.ctrlKey && e.code === 'KeyV') { e.preventDefault(); pasteClipboard(); return; }
    if (e.ctrlKey && e.code === 'KeyG') { e.preventDefault(); savePrefab(); return; }
    if (e.code === 'Delete' || e.code === 'Backspace') { deleteSelected(); return; }
    if (e.code === 'Escape') { setPlacing(null); sel = null; multi = []; marquee = null; refreshInspector(); refreshHierarchy(); return; }
    if (e.code === 'KeyG' && !e.ctrlKey) { gizmos = !gizmos; refreshToolbar(); return; }
    if (e.code === 'KeyL') { alignSelected(); return; }
    if (e.code === 'KeyF') {
      const it = selectedItem();
      if (it && it.ref) { camX = it.ref.x !== undefined ? it.ref.x : camX; camY = it.ref.y !== undefined ? it.ref.y : camY; }
      return;
    }
    const tools = { Digit1: 'select', Digit2: 'solid', Digit3: 'oneway', Digit4: 'spike', Digit5: 'erase' };
    if (tools[e.code]) { tool = tools[e.code]; setPlacing(null); refreshToolbar(); }
  });

  // ---------------- main loop ----------------
  let lastT = 0;
  function loop(t) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (t - lastT) / 1000) || 0.016;
    lastT = t;
    G.time += dt;

    if (needsRebuild && !csPreview) {
      rebuildTimer -= dt;
      if (rebuildTimer <= 0) {
        rebuildTimer = 0.12;
        needsRebuild = false;
        rebuild();
      }
    }

    if (csPreview) {
      // live cutscene playback in the viewport
      G.World.update(dt);
      if (G.room) {
        for (const e of G.room.entities) {
          if (e.type === 'lamp' || e.type === 'crystal' || e.type === 'shrine' || e.type === 'light' || e.type === 'ray' || e.type === 'gate')
            try { e.update(dt); } catch (_) { }
        }
      }
      if (G.Cutscene.active) { G.Cutscene.update(dt); csPreview.lastCam = { x: G.Cutscene.active.cam.x, y: G.Cutscene.active.cam.y, z: G.Cutscene.active.cam.z }; }
      G.FX.update(dt);
      const cam = csPreview.lastCam;
      camera.position.set(cam.x, cam.y, cam.z);
      if (postOn && G.Post && G.Post.enabled) G.Post.render(dt);
      else renderer.render(scene, camera);
      // cinematic HUD (letterbox / caption / fade) on the overlay
      const dpr = Math.min(2, devicePixelRatio || 1);
      octx.setTransform(dpr, 0, 0, dpr, 0, 0);
      octx.clearRect(0, 0, G.viewW, G.viewH);
      G.Cutscene.drawHUD(octx, G.viewW, G.viewH);
      const cur = G.Cutscene.active;
      if (csBarTime) csBarTime.textContent = cur ? cur.time.toFixed(1) + ' / ' + cur.total.toFixed(1) + 's' : 'done — ⟲ to replay';
    } else if (tab === 'scene') {
      // animate ambience but keep AI frozen: update only decorative entity types
      G.World.update(dt);
      if (G.room) {
        for (const e of G.room.entities) {
          if (e.type === 'lamp' || e.type === 'crystal' || e.type === 'shrine' || e.type === 'light' || e.type === 'ray' || e.type === 'gate')
            try { e.update(dt); } catch (_) { }
        }
      }
      G.FX.update(dt);
      const L = lvl();
      if (L) {
        camX = U.clamp(camX, -10, L.w + 10);
        camY = U.clamp(camY, -6, L.h + 10);
      }
      camera.position.set(camX, camY, camZ);
      if (postOn && G.Post && G.Post.enabled) G.Post.render(dt);
      else renderer.render(scene, camera);
      drawOverlay();
    } else if (tab === 'map') {
      drawMapTab();
    }
    // tab === 'cutscene' renders nothing in 3D — the #csView DOM covers the viewport
  }

  // ---------------- boot ----------------
  async function boot() {
    // detect the local file-saving server (absent when hosted statically)
    try {
      const p = await fetch('/api/ping', { cache: 'no-store' });
      const j = p.ok ? await p.json() : null;
      serverPresent = !!(j && j.app === 'mossveil-editor');
    } catch (_) { serverPresent = false; }
    try {
      const res = await fetch('/api/levels');
      if (res.ok) G.LEVELS = await res.json();
    } catch (_) { /* fall back to the script-loaded copy */ }
    try {
      const res2 = await fetch('/api/cutscenes');
      if (res2.ok) G.CUTSCENES = await res2.json();
    } catch (_) { /* fall back to cutscenes.js */ }
    G.CUTSCENES = G.CUTSCENES || {};
    csCurrent = Object.keys(G.CUTSCENES)[0] || null;
    resize();
    refreshToolbar();
    refreshSaveTarget();
    refreshAssets();
    refreshLevels();
    setTab('scene');
    openLevel(currentId);
    requestAnimationFrame(loop);
  }

  // small hook for headless tests
  G.__ed = {
    copySelection, pasteClipboard, savePrefab, stampPrefab, alignSelected, captureSelection, selectInBox,
    setSel: v => { sel = v; }, setMulti: v => { multi = v; }, getMulti: () => multi, getSel: () => sel,
    getClip: () => clipboard, getPrefabs: () => prefabs, setLastWorld: (x, y) => { lastWorld = { x, y }; },
    openLevel: id => openLevel(id), currentId: () => currentId, validateWorld: () => validateWorld(), setTab: t => setTab(t)
  };

  boot();
})();
