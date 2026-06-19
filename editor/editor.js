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
  let snap = true, gizmos = true;
  let dirty = false;
  let sel = null;               // {kind:'prop'|'enemy'|'zone'|'spawn', i | key}
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
  G.FX.init(scene);

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
  }
  addEventListener('resize', resize);

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
    bossTrigger: [2, 2], decor: [1.6, 1.6], light: [1.4, 1.4], ray: [2, 2], textTrigger: [3, 3]
  };
  function propRect(p) {
    if (p.type === 'textTrigger' || p.type === 'cutsceneTrigger') return { x: p.x, y: p.y, w: p.w || 3, h: p.h || 3 };
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
    const it = selectedItem();
    if (!it) return;
    pushUndo();
    const L = lvl();
    if (it.kind === 'prop') L.props.splice(it.i, 1);
    else if (it.kind === 'enemy') L.enemies.splice(it.i, 1);
    else if (it.kind === 'zone') L.transitions.splice(it.i, 1);
    else if (it.kind === 'spawn') delete L.spawns[it.key];
    sel = null;
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
    if (placing) { placeAsset(w.x, w.y); return; }
    if (tool === 'select') {
      const hit = pickAt(w.x, w.y);
      if (hit) {
        sel = hit.kind === 'spawn' ? { kind: 'spawn', key: hit.key } : { kind: hit.kind, i: hit.i };
        pushUndo();
        dragging = { off: { x: hit.ref.x - w.x, y: hit.ref.y - w.y } };
      } else sel = null;
      refreshHierarchy(); refreshInspector();
    } else {
      pushUndo();
      painting = true;
      paintAt(w);
    }
  });
  addEventListener('pointermove', e => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (gesturing && pointers.size >= 2) { updateGesture(); return; }
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
    if (!overViewport && !dragging && !painting) return;
    const w = mouseWorld(e);
    const t = worldToTile(w.x, w.y);
    $('stMouse').textContent = `x ${w.x.toFixed(1)}  y ${w.y.toFixed(1)}  ·  tile ${t.c},${t.r}`;
    if (dragging) {
      const it = selectedItem();
      if (it) {
        let nx = w.x + dragging.off.x, ny = w.y + dragging.off.y;
        if (snap) { nx = Math.round(nx * 2) / 2; ny = Math.round(ny * 2) / 2; }
        it.ref.x = +nx.toFixed(2); it.ref.y = +ny.toFixed(2);
        queueRebuild();
        refreshInspector();
      }
    } else if (painting) paintAt(w);
  });
  function endPointer(e) {
    pointers.delete(e.pointerId);
    try { vpEl.releasePointerCapture(e.pointerId); } catch (_) { }
    if (pointers.size < 2) { pinch = null; gesturing = false; }
    if (pointers.size === 0) {
      panning = false;
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
      let col = '#7fb2e8';
      if (it.kind === 'enemy') col = '#e87f7f';
      if (it.kind === 'zone') col = '#7fe8c0';
      if (it.kind === 'spawn') col = '#a0e87f';
      if (it.ref.type === 'textTrigger') col = '#e8b85f';
      if (it.ref.type === 'bossTrigger') col = '#e85fd0';
      if (it.ref.type === 'cutsceneTrigger') col = '#5fd0e8';
      octx.strokeStyle = isSel ? '#ffd887' : col + 'aa';
      octx.lineWidth = isSel ? 2.5 : 1.2;
      if (it.kind === 'zone' || it.ref.type === 'textTrigger' || it.ref.type === 'bossTrigger' || it.ref.type === 'cutsceneTrigger') octx.setLineDash([4, 4]);
      octx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
      octx.setLineDash([]);
      // label
      const name = it.kind === 'enemy' ? it.ref.type
        : it.kind === 'zone' ? `→ ${it.ref.to}`
        : it.kind === 'spawn' ? `spawn ${it.key}`
        : it.ref.type + (it.ref.kind ? ':' + it.ref.kind : '');
      octx.font = '10px Segoe UI';
      octx.fillStyle = isSel ? '#ffd887' : col;
      octx.fillText(name, p1.x + 2, p1.y - 3);
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
      return;
    }
    const p = it.ref;
    el('div', { class: 'insNote' }, body, `${it.kind.toUpperCase()} — ${p.type || (it.kind === 'zone' ? 'transition' : '') || it.key || ''}`);
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
      d.addEventListener('click', () => { sel = kind === 'spawn' ? { kind, key } : { kind, i }; refreshHierarchy(); refreshInspector(); });
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
    { id: 'markers', label: 'Markers' }
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
        { cat: 'prop', id: 'gate', label: 'Boss gate', ico: '🚪', defaults: { id: 0 } }
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
        { cat: 'prop', id: 'cutsceneTrigger', label: 'Cutscene trigger', ico: '🎬', defaults: { w: 4, h: 4, once: true } }
      ];
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
    for (const a of assetList()) {
      const d = el('div', { class: 'asset' + (placing && placing.label === a.label ? ' on' : '') }, body);
      el('div', { class: 'ico' }, d, a.ico);
      el('div', { class: 'nm' }, d, a.label);
      d.addEventListener('click', () => setPlacing(placing && placing.label === a.label ? null : a));
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
  function drawMapTab() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    G.MapView.draw(mctx, {
      w: G.viewW, h: G.viewH, pan: mapView.pan, zoom: mapView.zoom,
      visitedOnly: false, current: null, selected: currentId, showLabels: true
    });
    mctx.font = '12px Segoe UI';
    mctx.textAlign = 'left';
    mctx.fillStyle = 'rgba(200,215,210,0.6)';
    mctx.fillText('Drag rooms to arrange the world map · double-click to open · wheel to zoom · drag empty space to pan', 12, G.viewH - 12);
  }

  function setTab(t) {
    tab = t;
    $('tabScene').classList.toggle('on', t === 'scene');
    $('tabMap').classList.toggle('on', t === 'map');
    mapCanvas.style.display = t === 'map' ? 'block' : 'none';
    glCanvas.style.display = t === 'scene' ? 'block' : 'none';
    $('viewportHint').textContent = '';
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
    if (!csCurrent) return;

    // event timeline for the current cutscene
    const c = G.CUTSCENES[csCurrent];
    c.events = c.events || [];
    el('div', { class: 'hgroup' }, box, 'Timeline (events)');
    const addRow = el('div', { class: 'lvlbtns' }, box);
    const typeSel = el('select', { style: 'flex:1;background:#15151a;color:#cfd2d6;border:1px solid #3c3c44;border-radius:3px;padding:3px' }, addRow);
    for (const ty in CS_EVENTS) el('option', { value: ty }, typeSel, ty);
    el('button', {
      class: 'tbtn', onclick: () => {
        const ty = typeSel.value;
        const spec = CS_EVENTS[ty];
        const lastEnd = c.events.reduce((m, e) => Math.max(m, e.t + (e.dur || 0)), 0);
        const ev = Object.assign({ t: +lastEnd.toFixed(2), dur: spec.dur, type: ty }, JSON.parse(JSON.stringify(spec.def)));
        c.events.push(ev);
        csSel = c.events.length - 1;
        markCsDirty(); refreshScenes(); refreshInspector();
      }
    }, addRow, '+ Add event');

    const sorted = c.events.map((e, i) => ({ e, i })).sort((a, b) => a.e.t - b.e.t);
    for (const { e, i } of sorted) {
      const d = el('div', { class: 'hitem' + (csSel === i ? ' sel' : '') }, box);
      d.textContent = `${e.t.toFixed(1)}s +${(e.dur || 0)}s  ${e.type}`;
      d.addEventListener('click', () => { csSel = i; refreshScenes(); refreshInspector(); });
    }
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
        'Add events in the Scenes panel, then click one to edit it here. "▶ Test" previews this cutscene in the game. ' +
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
  }
  document.querySelectorAll('.tool').forEach(b2 => {
    b2.addEventListener('click', () => { tool = b2.dataset.tool; setPlacing(null); refreshToolbar(); });
  });
  $('btnSnap').addEventListener('click', () => { snap = !snap; refreshToolbar(); });
  $('btnGizmos').addEventListener('click', () => { gizmos = !gizmos; refreshToolbar(); });
  $('btnUndo').addEventListener('click', doUndo);
  $('btnRedo').addEventListener('click', doRedo);
  $('tabScene').addEventListener('click', () => setTab('scene'));
  $('tabMap').addEventListener('click', () => setTab('map'));
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

  // ---------------- keyboard ----------------
  addEventListener('keydown', e => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (e.ctrlKey && e.code === 'KeyS') { e.preventDefault(); save(); return; }
    if (typing) return;
    if (csMode) return; // Scenes tab: edit events via the inspector, not level shortcuts
    if (e.ctrlKey && e.code === 'KeyZ') { e.preventDefault(); doUndo(); return; }
    if (e.ctrlKey && (e.code === 'KeyY' || (e.shiftKey && e.code === 'KeyZ'))) { e.preventDefault(); doRedo(); return; }
    if (e.ctrlKey && e.code === 'KeyD') { e.preventDefault(); duplicateSelected(); return; }
    if (e.code === 'Delete' || e.code === 'Backspace') { deleteSelected(); return; }
    if (e.code === 'Escape') { setPlacing(null); sel = null; refreshInspector(); refreshHierarchy(); return; }
    if (e.code === 'KeyG') { gizmos = !gizmos; refreshToolbar(); return; }
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

    if (needsRebuild) {
      rebuildTimer -= dt;
      if (rebuildTimer <= 0) {
        rebuildTimer = 0.12;
        needsRebuild = false;
        rebuild();
      }
    }

    if (tab === 'scene') {
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
      renderer.render(scene, camera);
      drawOverlay();
    } else {
      drawMapTab();
    }
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
  boot();
})();
