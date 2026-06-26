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
  let brushSize = 1, brushShape = 'pencil', paintStart = null;   // tile brush: pencil|rect|line|fill
  let terrainMat = '#';          // solid-tile material char (see G.World.TERRAIN_MATS)
  let terrainSmooth = false;     // paint the curvy (smooth) variant of the material
  let autoTile = false;          // rule-tile: auto smooth/hard by neighbours while painting
  let dirty = false;
  let sel = null;               // {kind:'prop'|'enemy'|'zone'|'spawn', i | key}
  let multi = [];               // additional multi-selection (array of sel descriptors)
  let marquee = null;           // rubber-band box {x0,y0,x1,y1} in world coords
  let clipboard = null;         // copied cluster {items,ox,oy}
  let lastWorld = { x: 0, y: 0 };
  let hierFilter = '';          // Hierarchy 2.0: live text filter
  let hierCollapsed = {};       // Hierarchy 2.0: { groupKey: true } collapsed groups
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
    music: { dur: 0.1, def: { track: '', intensity: -1 }, fields: [['track', 'sel', () => ['', ...(G.Music ? G.Music.TRACK_IDS : [])]], ['intensity', 'num']], hint: 'crossfade the score to a track (blank = keep current); intensity 0–1 sets the swell, -1 = leave it' },
    stinger: { dur: 0.1, def: { name: 'item' }, fields: [['name', 'sel', () => ['boss', 'item', 'secret']]], hint: 'one-shot musical sting over the score (boss / item / secret)' },
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
    const lc = $('logicCanvas'); if (lc) { lc.width = r.width; lc.height = r.height; }
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
    refreshLint();
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
    vendor: [1.2, 2], charmPickup: [1, 1], smith: [1.9, 2.2], spellwell: [2.2, 1.9]
  };
  function propRect(p) {
    if (p.type === 'textTrigger' || p.type === 'cutsceneTrigger') return { x: p.x, y: p.y, w: p.w || 3, h: p.h || 3 };
    if (p.type === 'setActiveTrigger' || p.type === 'lookTrigger') return { x: p.x, y: p.y, w: p.w || 4, h: p.h || 4 };
    if (p.type === 'audio') return { x: p.x, y: p.y, w: p.w || 8, h: p.h || 6 };
    if (p.type === 'windzone') return { x: p.x, y: p.y, w: p.w || 6, h: p.h || 9 };
    if (p.type === 'spiketrap') return { x: p.x, y: p.y + 0.35, w: p.w || 2.4, h: 1 };
    if (p.type === 'platform' || p.type === 'crusher' || p.type === 'conveyor' || p.type === 'fallfloor') return { x: p.x, y: p.y, w: p.w || 4, h: p.h || 1 };
    if (p.type === 'mire' || p.type === 'pool') return { x: p.x, y: p.y, w: p.w || 6, h: p.h || 1.5 };
    if (p.type === 'gas') return { x: p.x, y: p.y, w: p.w || 6, h: p.h || 4 };
    if (p.type === 'bioflora') return { x: p.x, y: p.y + 0.55, w: 0.95, h: 1.4 };
    if (p.type === 'powerup') return { x: p.x, y: p.y + 0.5, w: 1, h: 1.2 };
    if (p.type === 'breakable') return { x: p.x, y: p.y, w: p.w || 2, h: p.h || 4 };
    if (p.type === 'door') return { x: p.x, y: p.y + (p.h || 5) / 2, w: p.w || 1.2, h: p.h || 5 };
    if (p.type === 'npc') return { x: p.x, y: p.y + 1, w: 1.1 * (p.scale || 1), h: 2.1 * (p.scale || 1) };
    if (p.type === 'lever') return { x: p.x, y: p.y + 0.7, w: 1, h: 1.6 };
    if (p.type === 'plate') return { x: p.x, y: p.y + 0.12, w: p.w || 1.8, h: 0.5 };
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
      let qx = wx, qy = wy;
      const rot = (it.kind === 'prop' || it.kind === 'enemy') ? (it.ref.rot || 0) : 0;
      if (rot && it.ref.x != null) {                  // inverse-rotate the click into the prop's unrotated frame
        const ox = it.ref.x, oy = it.ref.y, cs = Math.cos(-rot), sn = Math.sin(-rot), lx = wx - ox, ly = wy - oy;
        qx = ox + lx * cs - ly * sn; qy = oy + lx * sn + ly * cs;
      }
      if (Math.abs(qx - r.x) * 2 <= r.w && Math.abs(qy - r.y) * 2 <= r.h) {
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
  function stampCapture(cap, wx, wy, _seen) {
    if (!cap || !cap.items || !cap.items.length) return;
    const L = lvl(); if (!_seen) multi = [];
    const seen = _seen || {};
    for (const it of cap.items) {
      const nx = +(wx + (it.x - cap.ox)).toFixed(2), ny = +(wy + (it.y - cap.oy)).toFixed(2);
      if (it.kind === 'prefab') {                       // nested prefab — expand it recursively (cycle-guarded)
        const name = it.data && it.data.prefab;
        if (name && prefabs[name] && !seen[name]) stampCapture(prefabs[name], nx, ny, Object.assign({}, seen, { [name]: 1 }));
        continue;
      }
      const d = JSON.parse(JSON.stringify(it.data));
      if (it.kind === 'prop') { d.x = nx; d.y = ny; L.props = L.props || []; L.props.push(d); multi.push({ kind: 'prop', i: L.props.length - 1 }); }
      else if (it.kind === 'enemy') { d.x = nx; d.y = ny; L.enemies = L.enemies || []; L.enemies.push(d); multi.push({ kind: 'enemy', i: L.enemies.length - 1 }); }
      else if (it.kind === 'zone') { if (d.rect) { d.rect.x = nx; d.rect.y = ny; } else { d.x = nx; d.y = ny; } L.transitions = L.transitions || []; L.transitions.push(d); multi.push({ kind: 'zone', i: L.transitions.length - 1 }); }
    }
    if (!_seen) sel = multi[0] || null;
  }
  // compose prefabs: embed `child` inside `parent` at an offset (creates a nested prefab)
  function nestPrefab(parent, child, dx, dy) {
    if (!prefabs[parent] || !prefabs[child] || parent === child) return false;
    prefabs[parent].items.push({ kind: 'prefab', data: { prefab: child }, x: (prefabs[parent].ox || 0) + (dx || 0), y: (prefabs[parent].oy || 0) + (dy || 0) });
    try { localStorage.setItem('mossveil-ed-prefabs', JSON.stringify(prefabs)); } catch (e) { }
    refreshAssets();
    return true;
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
    if (tab === 'cutscene' || tab === 'logic' || tab === 'models' || $('playFrame').classList.contains('on')) return;
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
      const st = worldToTile(w.x, w.y);
      if (brushShape === 'fill') { pushUndo(); floodFill(st.c, st.r); needsRebuild = true; }
      else if (brushShape === 'rect' || brushShape === 'line') { paintStart = st; painting = true; }   // preview now, commit on release
      else { pushUndo(); painting = true; paintAt(w); }                                                // freehand pencil
    }
  });
  addEventListener('pointermove', e => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (gesturing && pointers.size >= 2) { updateGesture(); return; }
    if (tab === 'cutscene' || tab === 'logic' || tab === 'models') return;
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
    } else if (painting && brushShape !== 'rect' && brushShape !== 'line') paintAt(w);
    // rect/line just track the end (lastWorld) and draw a preview in the overlay
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
      if (painting && paintStart && (brushShape === 'rect' || brushShape === 'line')) {
        pushUndo();
        const endT = worldToTile(lastWorld.x, lastWorld.y), ch = paintCh();
        if (brushShape === 'rect') fillRectTiles(paintStart, endT, ch); else lineTiles(paintStart, endT, ch);
      }
      paintStart = null;
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
    if (tab === 'logic' || tab === 'models') return;   // those tabs handle their own zoom
    e.preventDefault();
    if (tab === 'map') {
      mapView.zoom = U.clamp(mapView.zoom * (e.deltaY > 0 ? 0.88 : 1.14), 0.4, 12);
      return;
    }
    camZ = U.clamp(camZ * (e.deltaY > 0 ? 1.1 : 0.9), 8, 110);
  }, { passive: false });

  function paintCh() {
    if (tool !== 'solid') return tool === 'oneway' ? '=' : tool === 'spike' ? '^' : ' ';
    return terrainSmooth ? ((G.World.SMOOTH_CHAR && G.World.SMOOTH_CHAR[terrainMat]) || terrainMat) : terrainMat;
  }
  // ---- rule-tile autotiling: exposed terrain edges become the smooth (curvy) variant,
  //      buried interior stays hard. Re-evaluated on every paint/erase incl. the border. ----
  function tileCh(c, r) { const L = lvl(); if (!L || c < 0 || r < 0 || c >= L.w || r >= L.h) return ' '; return (L.tiles[r] || '')[c] || ' '; }
  function isSolidTerrain(ch) { return G.World.SOLID_SET ? G.World.SOLID_SET.has(ch) : '#dkspGDKSP'.indexOf(ch) >= 0; }
  function autotileAt(c, r) {
    const ch = tileCh(c, r);
    if (!isSolidTerrain(ch)) return;
    const fam = (G.World.HARD_CHAR && G.World.HARD_CHAR[ch]) || ch;     // hard base char of this family
    const edge = !isSolidTerrain(tileCh(c, r - 1)) || !isSolidTerrain(tileCh(c, r + 1)) ||
                 !isSolidTerrain(tileCh(c - 1, r)) || !isSolidTerrain(tileCh(c + 1, r));
    const want = edge ? ((G.World.SMOOTH_CHAR && G.World.SMOOTH_CHAR[fam]) || fam) : fam;
    if (want !== ch) setTile(c, r, want);
  }
  function autotileRegion(c0, r0, c1, r1) {
    if (!autoTile || (tool !== 'solid' && tool !== 'erase')) return;
    for (let r = r0 - 1; r <= r1 + 1; r++) for (let c = c0 - 1; c <= c1 + 1; c++) autotileAt(c, r);
  }
  function retileWholeLevel() {                    // apply the autotile rule across the whole level
    const L = lvl(); if (!L) return;
    const pt = tool, pa = autoTile; tool = 'solid'; autoTile = true;
    for (let r = 0; r < L.h; r++) for (let c = 0; c < L.w; c++) autotileAt(c, r);
    tool = pt; autoTile = pa; queueRebuild();
  }
  function brushStamp(c, r, ch) {                 // a brushSize×brushSize square
    const h0 = Math.floor((brushSize - 1) / 2);
    for (let dy = 0; dy < brushSize; dy++) for (let dx = 0; dx < brushSize; dx++) setTile(c - h0 + dx, r - h0 + dy, ch);
    autotileRegion(c - h0, r - h0, c - h0 + brushSize - 1, r - h0 + brushSize - 1);
  }
  function paintAt(w) { const t = worldToTile(w.x, w.y); brushStamp(t.c, t.r, paintCh()); }
  function fillRectTiles(a, b, ch) {
    const c0 = Math.min(a.c, b.c), c1 = Math.max(a.c, b.c), r0 = Math.min(a.r, b.r), r1 = Math.max(a.r, b.r);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) setTile(c, r, ch);
    autotileRegion(c0, r0, c1, r1);
  }
  function lineTiles(a, b, ch) {                   // Bresenham, stamped with the brush
    let x0 = a.c, y0 = a.r; const x1 = b.c, y1 = b.r;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy, guard = 0;
    while (guard++ < 4000) { brushStamp(x0, y0, ch); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
  }
  function floodFill(sc, sr) {                      // 4-way flood of the contiguous same-tile region
    const L = lvl(), ch = paintCh();
    const at = (c, r) => (r < 0 || r >= L.h || c < 0 || c >= L.w) ? null : (L.tiles[r] || '').padEnd(L.w, ' ')[c];
    const target = at(sc, sr);
    if (target === null || target === ch) return;
    const stack = [[sc, sr]]; let guard = 0;
    while (stack.length && guard++ < L.w * L.h * 4 + 50) {
      const [c, r] = stack.pop();
      if (at(c, r) !== target) continue;
      setTile(c, r, ch);
      stack.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]);
    }
    if (autoTile && (tool === 'solid' || tool === 'erase')) autotileRegion(0, 0, L.w - 1, L.h - 1);
  }

  function placeAsset(wx, wy) {
    pushUndo();
    const L = lvl();
    let x = wx, y = wy;
    if (snap) { x = Math.round(x * 2) / 2; y = Math.round(y * 2) / 2; }
    x = +x.toFixed(2); y = +y.toFixed(2);
    const a = placing;
    if (a.cat === 'none') { setPlacing(null); return; }
    // prefab: stamp a saved cluster of objects
    if (a.cat === 'prefab') { stampPrefab(a.prefab, x, y); if (!keepPlacing) setPlacing(null); queueRebuild(); refreshHierarchy(); refreshInspector(); return; }
    // building generator: stamp a procedural Victorian building (walls/floors as tiles + furniture as props)
    if (a.cat === 'build' && G.World.genBuilding) {
      const w = (a.defaults && a.defaults.w) || 30, h = (a.defaults && a.defaults.h) || 46, seed = (a.defaults && a.defaults.seed) || (Math.random() * 9999 | 0);
      G.World.genBuilding(L, { x: Math.max(0, Math.floor(x - w / 2)), y: Math.max(0, Math.floor(y)), w, h, seed });
      if (!keepPlacing) setPlacing(null);
      queueRebuild(); refreshHierarchy(); refreshInspector(); markDirty();
      return;
    }
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
      L.enemies.push(Object.assign({ type: a.id, x, y }, JSON.parse(JSON.stringify(a.defaults || {}))));
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
      if (a.id === 'furniture') p.kind = a.kind || 'sofa';
      if (a.id === 'model') p.model = a.model || '';
      if (a.kind && p.kind === undefined) p.kind = a.kind;   // mire / pool / etc. carry their kind
      L.props.push(p);
      sel = { kind: 'prop', i: L.props.length - 1 };
    }
    ensureAllOids(L);                       // give the newly-placed object an id
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

    if (G.Weather) G.Weather.draw(octx, G.viewW, G.viewH);   // live weather preview

    // tile-paint brush / shape preview
    if (tool !== 'select') {
      const tileRect = (c, r) => { const A = U.toScreen(c, L.h - r), B = U.toScreen(c + 1, L.h - 1 - r); return { x: A.x, y: A.y, w: B.x - A.x, h: B.y - A.y }; };
      const col = tool === 'solid' ? '#7fb2e8' : tool === 'oneway' ? '#7fe8c0' : tool === 'spike' ? '#e8b85f' : '#e87f7f';
      octx.strokeStyle = col; octx.fillStyle = col + '33'; octx.lineWidth = 1.5;
      if (painting && paintStart && (brushShape === 'rect' || brushShape === 'line')) {
        const e = worldToTile(lastWorld.x, lastWorld.y);
        if (brushShape === 'rect') {
          const c0 = Math.min(paintStart.c, e.c), c1 = Math.max(paintStart.c, e.c), r0 = Math.min(paintStart.r, e.r), r1 = Math.max(paintStart.r, e.r);
          const A = U.toScreen(c0, L.h - r0), B = U.toScreen(c1 + 1, L.h - 1 - r1);
          octx.fillRect(A.x, A.y, B.x - A.x, B.y - A.y); octx.strokeRect(A.x, A.y, B.x - A.x, B.y - A.y);
        } else {
          let x0 = paintStart.c, y0 = paintStart.r; const x1 = e.c, y1 = e.r;
          const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let err = dx + dy, g = 0;
          while (g++ < 2000) { const rr = tileRect(x0, y0); octx.fillRect(rr.x, rr.y, rr.w, rr.h); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
        }
      } else if (brushShape !== 'fill') {
        const t = worldToTile(lastWorld.x, lastWorld.y), h0 = Math.floor((brushSize - 1) / 2);
        const A = tileRect(t.c - h0, t.r - h0), B = tileRect(t.c - h0 + brushSize - 1, t.r - h0 + brushSize - 1);
        octx.strokeRect(A.x, A.y, (B.x + B.w) - A.x, (B.y + B.h) - A.y);
      }
    }

    if (!gizmos) return;
    const item = selectedItem();
    for (const it of pickables()) {
      const r = it.rect;
      // box corners, rotated about the model's origin so the outline tracks a rotated prop
      const rot = (it.kind === 'prop' || it.kind === 'enemy') ? (it.ref.rot || 0) : 0;
      const _ox = (rot && it.ref.x != null) ? it.ref.x : r.x, _oy = (rot && it.ref.y != null) ? it.ref.y : r.y;
      const _cs = Math.cos(rot), _sn = Math.sin(rot);
      const corner = (dx, dy) => { const lx = (r.x + dx) - _ox, ly = (r.y + dy) - _oy; return U.toScreen(_ox + lx * _cs - ly * _sn, _oy + lx * _sn + ly * _cs); };
      const c0 = corner(-r.w / 2, r.h / 2), c1 = corner(r.w / 2, r.h / 2), c2 = corner(r.w / 2, -r.h / 2), c3 = corner(-r.w / 2, -r.h / 2);
      const p1 = c3;   // top-left corner — label anchor (matches the old axis-aligned anchor when unrotated)
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
      if (it.ref.type === 'lookTrigger') col = '#5fe0a8';
      if (it.ref.type === 'audio') col = '#8fd0ff';
      if (it.ref.type === 'windzone') col = '#9fe0ff';
      if (it.ref.type === 'platform' || it.ref.type === 'conveyor') col = '#8fb0ff';
      if (it.ref.type === 'crusher' || it.ref.type === 'spiketrap') col = '#ff8f8f';
      if (it.ref.type === 'fallfloor') col = '#d8b070';
      if (it.ref.type === 'breakable') col = '#b0a090';
      if (it.ref.type === 'lever' || it.ref.type === 'plate') col = '#ffd060';
      if (it.ref.type === 'mire') col = '#a07850';
      if (it.ref.type === 'pool') col = it.ref.kind === 'acid' ? '#9fe060' : '#ff7040';
      if (it.ref.type === 'gas') col = '#9fd070';
      if (it.ref.type === 'bioflora') col = '#ff9ad8';
      if (it.ref.type === 'powerup') col = '#b0f0ff';
      if (it.ref.type === 'door') col = '#a0b0c0';
      if (it.ref.type === 'npc') col = '#9fe8c0';
      // moving-platform travel path
      if (it.ref.type === 'platform' && (it.ref.dx || it.ref.dy)) {
        const a = U.toScreen(it.ref.x, it.ref.y), b = U.toScreen(it.ref.x + it.ref.dx, it.ref.y + it.ref.dy);
        octx.save(); octx.strokeStyle = 'rgba(143,176,255,0.5)'; octx.setLineDash([5, 4]); octx.lineWidth = 1.5;
        octx.beginPath(); octx.moveTo(a.x, a.y); octx.lineTo(b.x, b.y); octx.stroke();
        octx.beginPath(); octx.arc(b.x, b.y, 4, 0, 6.28); octx.stroke(); octx.restore();
      }
      const inactive = it.ref.active === false;
      octx.globalAlpha = inactive ? 0.4 : 1;        // dim objects that are switched off
      octx.strokeStyle = isSel ? '#ffd887' : (inMulti ? '#7fe8ff' : col + 'aa');
      octx.lineWidth = (isSel || inMulti) ? 2.5 : 1.2;
      if (inactive || it.kind === 'zone' || it.ref.type === 'textTrigger' || it.ref.type === 'bossTrigger' || it.ref.type === 'cutsceneTrigger' || it.ref.type === 'setActiveTrigger' || it.ref.type === 'lookTrigger' || it.ref.type === 'audio' || it.ref.type === 'windzone') octx.setLineDash([4, 4]);
      octx.beginPath(); octx.moveTo(c0.x, c0.y); octx.lineTo(c1.x, c1.y); octx.lineTo(c2.x, c2.y); octx.lineTo(c3.x, c3.y); octx.closePath(); octx.stroke();
      octx.setLineDash([]);
      // label
      const name = (it.kind === 'enemy' ? it.ref.type
        : it.kind === 'zone' ? `→ ${it.ref.to}`
        : it.kind === 'spawn' ? `spawn ${it.key}`
        : it.ref.type + (it.ref.kind ? ':' + it.ref.kind : '')) + (inactive ? '  (off)' : '');
      octx.font = '10px Segoe UI';
      octx.fillStyle = isSel ? '#ffd887' : col;
      octx.fillText(name, p1.x + 2, p1.y - 3);
      // custom collision box (red, dashed) — the solid the player actually hits (props)
      if (it.ref.col && it.kind === 'prop') {
        const cb = it.ref.col, ccx = it.ref.x + (cb.ox || 0), ccy = it.ref.y + (cb.oy || 0);
        const kc = (dx, dy) => { const lx = (ccx + dx) - _ox, ly = (ccy + dy) - _oy; return U.toScreen(_ox + lx * _cs - ly * _sn, _oy + lx * _sn + ly * _cs); };
        const k0 = kc(-cb.w / 2, cb.h / 2), k1 = kc(cb.w / 2, cb.h / 2), k2 = kc(cb.w / 2, -cb.h / 2), k3 = kc(-cb.w / 2, -cb.h / 2);
        octx.strokeStyle = isSel ? '#ff6a5a' : 'rgba(255,106,90,0.5)'; octx.lineWidth = isSel ? 2 : 1.1; octx.setLineDash([3, 3]);
        octx.beginPath(); octx.moveTo(k0.x, k0.y); octx.lineTo(k1.x, k1.y); octx.lineTo(k2.x, k2.y); octx.lineTo(k3.x, k3.y); octx.closePath(); octx.stroke(); octx.setLineDash([]);
      }
      // attack hit area / hurtbox (green, dashed) — axis-aligned, tracks the foe in-game (enemies + boss triggers)
      if (it.ref.hurtBox && (it.kind === 'enemy' || it.ref.type === 'bossTrigger')) {
        const hbx = it.ref.hurtBox, hx = it.ref.x + (hbx.ox || 0), hy = it.ref.y + (hbx.oy || 0);
        const ha = U.toScreen(hx - hbx.w / 2, hy + hbx.h / 2), hb2 = U.toScreen(hx + hbx.w / 2, hy - hbx.h / 2);
        octx.strokeStyle = isSel ? '#7cff9a' : 'rgba(124,255,154,0.5)'; octx.lineWidth = isSel ? 2 : 1.1; octx.setLineDash([3, 3]);
        octx.strokeRect(ha.x, ha.y, hb2.x - ha.x, hb2.y - ha.y); octx.setLineDash([]);
      }
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
  // custom collision box on any placed object (obj.col = { w, h, ox, oy }) — a solid that blocks the player
  function collisionFields(parent, p, kind) {
    el('div', { class: 'hgroup' }, parent, 'Collision box');
    checkField(parent, 'Solid box', () => !!p.col, v => {
      if (v) { const r = kind === 'enemy' ? { x: p.x, y: p.y, w: 1.2, h: 1.2 } : propRect(p); p.col = { w: +r.w.toFixed(2), h: +r.h.toFixed(2), ox: +(r.x - p.x).toFixed(2), oy: +(r.y - p.y).toFixed(2) }; }
      else delete p.col;
      refreshInspector();
    });
    if (p.col) {
      numField(parent, 'Col W', () => p.col.w, v => { p.col.w = Math.max(0.1, v); }, 0.5);
      numField(parent, 'Col H', () => p.col.h, v => { p.col.h = Math.max(0.1, v); }, 0.5);
      numField(parent, 'Col off X', () => p.col.ox || 0, v => { p.col.ox = +(+v).toFixed(2); }, 0.5);
      numField(parent, 'Col off Y', () => p.col.oy || 0, v => { p.col.oy = +(+v).toFixed(2); }, 0.5);
      el('div', { class: 'insNote', style: 'opacity:.55' }, parent, 'A solid box (red outline) that blocks the player and rotates with the object. Doors / breakables / platforms already collide via their Width/Height.');
    }
  }
  // resizable attack hit area (hurtbox) for a foe / boss — the area your attacks must touch to land
  function hurtboxFields(parent, p, kind) {
    el('div', { class: 'hgroup' }, parent, kind === 'boss' ? 'Boss hit area' : 'Hit area (hurtbox)');
    checkField(parent, 'Custom hit area', () => !!p.hurtBox, v => {
      if (v) p.hurtBox = kind === 'boss' ? { w: 3.4, h: 3.2, ox: 0, oy: 0 } : { w: 1.6, h: 1.6, ox: 0, oy: 0 };
      else delete p.hurtBox;
      refreshInspector();
    });
    if (p.hurtBox) {
      numField(parent, 'Hit W', () => p.hurtBox.w, v => { p.hurtBox.w = Math.max(0.1, v); }, 0.5);
      numField(parent, 'Hit H', () => p.hurtBox.h, v => { p.hurtBox.h = Math.max(0.1, v); }, 0.5);
      numField(parent, 'Hit off X', () => p.hurtBox.ox || 0, v => { p.hurtBox.ox = +(+v).toFixed(2); }, 0.5);
      numField(parent, 'Hit off Y', () => p.hurtBox.oy || 0, v => { p.hurtBox.oy = +(+v).toFixed(2); }, 0.5);
      el('div', { class: 'insNote', style: 'opacity:.55' }, parent, kind === 'boss'
        ? 'The area your attacks must overlap to hit the boss (green outline). It tracks the boss body in-game; offset is relative to the boss.'
        : 'The area your attacks must overlap to hit this foe (green outline). It tracks the foe in-game.');
    }
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
  // auto-assign a stable numeric oid to EVERY placed object in a level (props/enemies/zones)
  function ensureAllOids(L) {
    if (!L) return;
    let mx = 0;
    const scan = o => { if (o && typeof o.oid === 'number' && o.oid > mx) mx = o.oid; };
    (L.props || []).forEach(scan); (L.enemies || []).forEach(scan); (L.transitions || []).forEach(scan);
    let changed = false;
    const give = o => { if (o && typeof o.oid !== 'number') { o.oid = ++mx; changed = true; } };
    (L.props || []).forEach(give); (L.enemies || []).forEach(give); (L.transitions || []).forEach(give);
    return changed;
  }
  // every placed object across the whole game (for the id picker) — each gets an oid on demand
  function allGameObjects() {
    const out = [];
    for (const lid in G.LEVELS) {
      const L = G.LEVELS[lid]; ensureAllOids(L);
      (L.props || []).forEach((r, i) => out.push({ level: lid, kind: 'prop', i, ref: r, oid: r.oid, name: (r.type || 'prop') + (r.kind ? ':' + r.kind : '') + (r.boss ? ':' + r.boss : '') }));
      (L.enemies || []).forEach((r, i) => out.push({ level: lid, kind: 'enemy', i, ref: r, oid: r.oid, name: 'enemy · ' + (r.type || '') }));
      (L.transitions || []).forEach((r, i) => out.push({ level: lid, kind: 'zone', i, ref: r, oid: r.oid, name: 'portal → ' + (r.to || '?') }));
    }
    return out;
  }
  function objLabel(kind, ref, i) {
    const x = Math.round(ref.x != null ? ref.x : (ref.rect ? ref.rect.x : 0));
    const y = Math.round(ref.y != null ? ref.y : (ref.rect ? ref.rect.y : 0));
    if (kind === 'enemy') return `enemy ${ref.type} #${i} @(${x},${y})`;
    if (kind === 'zone') return `portal → ${ref.to} #${i}`;
    return `${ref.type}${ref.kind ? ':' + ref.kind : ''} #${i} @(${x},${y})`;
  }
  // ---- premium id picker: a searchable popup of every object / level in the game ----
  function pickRef(onPick, opts) {
    opts = opts || {};
    let m = document.getElementById('idPicker');
    if (!m) {
      m = el('div', { id: 'idPicker' }, document.body);
      m.innerHTML = '<div class="idpBox"><div class="idpHead"><input id="idpSearch" placeholder="Search…" autocomplete="off" spellcheck="false"><button id="idpClose" title="Close (Esc)">✕</button></div><div class="idpTitle" id="idpTitle"></div><div id="idpList"></div></div>';
      m.addEventListener('pointerdown', e => { if (e.target === m) m.style.display = 'none'; });
      document.getElementById('idpClose').addEventListener('click', () => m.style.display = 'none');
      document.getElementById('idpSearch').addEventListener('keydown', e => { if (e.key === 'Escape') m.style.display = 'none'; });
    }
    const listEl = document.getElementById('idpList'), search = document.getElementById('idpSearch');
    document.getElementById('idpTitle').textContent = opts.levels ? 'Pick a level' : 'Pick an object  ·  click to insert its id';
    const items = opts.levels
      ? Object.keys(G.LEVELS).map(id => ({ name: G.LEVELS[id].title || id, level: id, oid: id, isLevel: true, w: G.LEVELS[id].w, h: G.LEVELS[id].h, biome: G.LEVELS[id].biome }))
      : allGameObjects();
    function render() {
      listEl.innerHTML = '';
      const f = (search.value || '').toLowerCase().trim();
      let n = 0;
      for (const it of items) {
        const hay = (it.name + ' ' + it.oid + ' ' + it.level).toLowerCase();
        if (f && !hay.includes(f)) continue;
        if (n++ > 500) break;
        const row = el('div', { class: 'idpRow' + (it.level === currentId ? ' here' : '') }, listEl);
        el('div', { class: 'idpName' }, row, it.name);
        el('div', { class: 'idpSub' }, row, it.isLevel ? ('level "' + it.level + '"  ·  ' + it.w + '×' + it.h + '  ·  ' + it.biome) : ('id ' + it.oid + '   ·   in “' + (G.LEVELS[it.level] ? (G.LEVELS[it.level].title || it.level) : it.level) + '”'));
        row.addEventListener('click', () => { m.style.display = 'none'; onPick(it); });
      }
      if (!n) el('div', { class: 'idpEmpty' }, listEl, 'No matches.');
    }
    search.value = ''; render();
    search.oninput = render;
    m.style.display = 'flex'; setTimeout(() => search.focus(), 20);
  }
  // a number field with a ⌖ scope button that opens the object picker
  function idField(body, label, getV, setV, onPick) {
    const r = el('div', { class: 'frow idrow' }, body);
    el('label', {}, r, label);
    const inp = el('input', { type: 'number', step: 1 }, r);
    inp.value = (getV() != null && getV() !== '') ? getV() : '';
    inp.addEventListener('change', () => setV(inp.value === '' ? undefined : parseInt(inp.value)));
    const btn = el('button', { class: 'scopeBtn', title: 'Find an object by name / id' }, r, '⌖');
    btn.addEventListener('click', () => pickRef(it => { inp.value = it.oid; setV(it.oid); if (onPick) onPick(it); }));
    return inp;
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
    if (tab === 'logic') return refreshLogicInspector(body);
    if (tab === 'models') return refreshModelInspector(body);
    const it = selectedItem();
    $('stSel').textContent = it ? `selected: ${it.kind} ${it.ref.type || it.ref.to || it.key || ''}` : '';
    if (!it) {
      // level settings
      const L = lvl();
      el('div', { class: 'insNote' }, body, 'Level settings (nothing selected)');
      textField(body, 'Title', () => L.title, v => { L.title = v; });
      textField(body, 'Area text', () => L.area, v => { L.area = v || null; });
      selectField(body, 'Biome', G.World.BIOMES.map(b2 => ({ v: b2, t: G.World.PAL[b2].label })), () => L.biome, v => { L.biome = v; });
      const musicOpts = [{ v: '', t: 'Auto (by biome)' }].concat((G.Audio.musicTracks ? G.Audio.musicTracks() : []).map(t => ({ v: t, t: t.charAt(0).toUpperCase() + t.slice(1) })));
      selectField(body, 'Music (Score)', musicOpts, () => L.music || '', v => { if (v) L.music = v; else delete L.music; });
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

      // ---- weather & reflective water ----
      el('div', { class: 'hgroup' }, body, 'Weather & water');
      const wKinds = (G.Weather ? G.Weather.KINDS : ['none']);
      selectField(body, 'Weather', wKinds.map(k => ({ v: k, t: (G.Weather && G.Weather.LABELS[k]) || k })),
        () => L.weather || 'none', v => { if (v && v !== 'none') L.weather = v; else delete L.weather; });
      checkField(body, 'Reflective water', () => !!L.water,
        v => { if (v) L.water = L.water || { y: Math.round(L.h * 0.16), strength: 0.5, color: '#9ec8e6' }; else delete L.water; });
      if (L.water) {
        numField(body, 'Water level Y', () => L.water.y, v => { L.water.y = v; }, 0.5);
        numField(body, 'Reflectivity', () => L.water.strength !== undefined ? L.water.strength : 0.5, v => { L.water.strength = U.clamp(v, 0, 1); if (G.Post) G.Post.setWater(L.water); }, 0.05);
        numField(body, 'Caustics', () => L.water.caustics !== undefined ? L.water.caustics : 0.5, v => { L.water.caustics = U.clamp(v, 0, 2); if (G.Post) G.Post.setWater(L.water); }, 0.05);
        colorField(body, 'Water tint', () => L.water.color || '#9ec8e6', v => { L.water.color = v || '#9ec8e6'; if (G.Post) G.Post.setWater(L.water); });
        el('div', { class: 'insNote' }, body, 'Everything below the water line mirrors the scene above (ripple + tint). Low reflectivity = wet floor; higher = a pool.');
      }
      el('div', { class: 'insNote' }, body, 'Weather draws over the world (rain, snow, wind, fog, embers…) and nudges the look — storms/blizzards add lightning. Shown live in the viewport.');

      // ---- per-level dynamic lighting ----
      el('div', { class: 'hgroup' }, body, 'Dynamic lighting');
      numField(body, 'Intensity', () => L.lightStrength !== undefined ? L.lightStrength : 1,
        v => { const n = U.clamp(v, 0, 1); if (n >= 0.999) delete L.lightStrength; else L.lightStrength = +n.toFixed(2); if (G.Post) G.Post.lightStrength = n; markDirty(); }, 0.05);
      numField(body, 'Edge glow', () => L.lightRim !== undefined ? L.lightRim : 0.55,
        v => { const n = U.clamp(v, 0, 1.5); if (Math.abs(n - 0.55) < 0.001) delete L.lightRim; else L.lightRim = +n.toFixed(2); if (G.Post) G.Post.lightRim = n; markDirty(); }, 0.05);
      checkField(body, 'Soft shadows', () => L.shadows !== false,
        v => { if (v) delete L.shadows; else L.shadows = false; if (G.Post) G.Post.shadows = v; markDirty(); });
      el('div', { class: 'insNote' }, body, 'Scales the real-time lighting for THIS room. Turn it down where the painted biome art already sets the mood — 0 = no dynamic lighting here. Place light sources from the Lights tab; each lamp / crystal / glow light also casts light.');
      return;
    }
    const p = it.ref;
    el('div', { class: 'insNote' }, body, `${it.kind.toUpperCase()} — ${p.type || (it.kind === 'zone' ? 'transition' : '') || it.key || ''}`);
    // Active toggle — works for every placeable object (prop/decor/light/boss/marker/enemy/portal).
    // When off, the object isn't built into the game (it doesn't show or work). A Set-active
    // trigger can flip it on/off at runtime. Shown dimmed with "(off)" in the viewport.
    if (it.kind === 'prop' || it.kind === 'enemy' || it.kind === 'zone') {
      if (typeof p.oid !== 'number') { p.oid = ensureOid(currentId, p); markDirty(); }
      const idr = el('div', { class: 'frow idrow', style: 'align-items:center' }, body);
      el('label', {}, idr, 'Object id');
      const idIn = el('input', { type: 'text', readonly: 'readonly', style: 'flex:1;opacity:.85' }, idr); idIn.value = p.oid + '  ·  ' + currentId;
      const cpy = el('button', { class: 'scopeBtn', title: 'Copy id' }, idr, '⧉');
      cpy.addEventListener('click', () => { try { navigator.clipboard.writeText(String(p.oid)); } catch (e) { } idIn.value = 'copied: ' + p.oid; setTimeout(() => { idIn.value = p.oid + '  ·  ' + currentId; }, 900); });
      el('div', { class: 'insNote', style: 'opacity:.55' }, body, 'Reference this object from the Logic graph (Set Active) or triggers by this id.');
      checkField(body, 'Active', () => p.active !== false, v => { if (v) delete p.active; else p.active = false; });
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
        // rotation for any placed object/asset/prop (radians stored; shown in degrees, snaps by 15°)
        numField(body, 'Rotation°', () => +(((p.rot || 0) * 180 / Math.PI).toFixed(1)),
          v => { const r = v * Math.PI / 180; if (Math.abs(r) < 1e-4) delete p.rot; else p.rot = +r.toFixed(4); }, 15);
      }
    }
    // enemies / bosses: resize the attack hit area (hurtbox); other props: a solid collision box
    if (it.kind === 'enemy') hurtboxFields(body, p, 'enemy');
    else if (it.kind === 'prop' && p.type === 'bossTrigger') hurtboxFields(body, p, 'boss');
    else if (it.kind === 'prop') collisionFields(body, p, 'prop');
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
      const types = G.Enemies.TYPES.map(t2 => ({ v: t2.id, t: t2.label })).concat([{ v: 'custom', t: 'Custom (behavior)' }]);
      selectField(body, 'Type', types, () => p.type, v => { p.type = v; if (v === 'custom' && !p.spec) p.spec = { hp: 3, speed: 2, sight: 9, fly: false, color: '#8a5a7a', size: 0.8, idle: 'patrol', onSight: 'chase', attack: 'contact', shootCd: 2 }; refreshInspector(); });
      if (p.type === 'custom') {
        const sp = p.spec = p.spec || {};
        el('div', { class: 'hgroup' }, body, 'Behavior');
        numField(body, 'Health', () => sp.hp || 3, v => { sp.hp = Math.max(1, Math.round(v)); }, 1);
        numField(body, 'Speed', () => sp.speed || 2, v => { sp.speed = Math.max(0.2, v); }, 0.5);
        numField(body, 'Sight range', () => sp.sight || 9, v => { sp.sight = Math.max(1, v); }, 1);
        numField(body, 'Size', () => sp.size || 0.8, v => { sp.size = Math.max(0.3, v); }, 0.1);
        colorField(body, 'Colour', () => sp.color || '#8a5a7a', v => { sp.color = v || '#8a5a7a'; });
        checkField(body, 'Flies', () => sp.fly, v => { sp.fly = v; });
        selectField(body, 'Idle', [{ v: 'patrol', t: 'Patrol (walk & turn)' }, { v: 'wander', t: 'Wander near home' }, { v: 'still', t: 'Stay still' }], () => sp.idle || 'patrol', v => { sp.idle = v; });
        selectField(body, 'On sight', [{ v: 'chase', t: 'Chase the player' }, { v: 'flee', t: 'Flee' }], () => sp.onSight || 'chase', v => { sp.onSight = v; });
        selectField(body, 'Attack', [{ v: 'contact', t: 'Contact damage' }, { v: 'shoot', t: 'Shoot projectiles' }, { v: 'leap', t: 'Leap at player' }], () => sp.attack || 'contact', v => { sp.attack = v; refreshInspector(); });
        if (sp.attack === 'shoot') numField(body, 'Shoot every (s)', () => sp.shootCd || 2, v => { sp.shootCd = Math.max(0.3, v); }, 0.5);
        el('div', { class: 'insNote' }, body, 'A data-driven creature: pick how it idles, reacts to the player, and attacks. No code needed.');
      }
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
        case 'lookTrigger': {
          numField(body, 'W', () => p.w || 5, v => { p.w = Math.max(0.5, v); });
          numField(body, 'H', () => p.h || 5, v => { p.h = Math.max(0.5, v); });
          numField(body, 'Fade in (s)', () => p.fade !== undefined ? p.fade : 2, v => { p.fade = Math.max(0, v); }, 0.25);
          el('div', { class: 'insNote' }, body, 'Walk into this zone to re-theme the room. Tick a section to override it; left unticked, it stays as-is. Grade/weather/water fade over the time above; a biome change always fades the background to black for 1.5s each way.');

          // ---- biome ----
          el('div', { class: 'hgroup' }, body, 'Biome');
          checkField(body, 'Change biome', () => p.biome !== undefined, v => { if (v) p.biome = lvl().biome; else delete p.biome; refreshInspector(); });
          if (p.biome !== undefined)
            selectField(body, 'To biome', G.World.BIOMES.map(b2 => ({ v: b2, t: G.World.PAL[b2].label })), () => p.biome, v => { p.biome = v; });

          // ---- colour grade ----
          el('div', { class: 'hgroup' }, body, 'Colour grade');
          checkField(body, 'Override grade', () => !!p.grade, v => { if (v) p.grade = {}; else delete p.grade; refreshInspector(); });
          if (p.grade) {
            const gd = p.grade, gset = (k, dv) => v => { gd[k] = +v.toFixed(2); };
            numField(body, 'Exposure', () => gd.exposure !== undefined ? gd.exposure : 1.05, gset('exposure'), 0.05);
            numField(body, 'Bloom', () => gd.bloom !== undefined ? gd.bloom : 0.6, gset('bloom'), 0.05);
            numField(body, 'Vignette', () => gd.vignette !== undefined ? gd.vignette : 0.46, gset('vignette'), 0.05);
            numField(body, 'Saturation', () => gd.saturation !== undefined ? gd.saturation : 1.14, gset('saturation'), 0.05);
            numField(body, 'Contrast', () => gd.contrast !== undefined ? gd.contrast : 1.05, gset('contrast'), 0.05);
            colorField(body, 'Tint', () => gd.tint || '#ffffff', v => { if (!v || v.toLowerCase() === '#ffffff') delete gd.tint; else gd.tint = v; });
          }

          // ---- weather ----
          el('div', { class: 'hgroup' }, body, 'Weather');
          checkField(body, 'Override weather', () => p.weather !== undefined, v => { if (v) p.weather = 'none'; else delete p.weather; refreshInspector(); });
          if (p.weather !== undefined) {
            const wK = (G.Weather ? G.Weather.KINDS : ['none']);
            selectField(body, 'Weather', wK.map(k => ({ v: k, t: (G.Weather && G.Weather.LABELS[k]) || k })), () => p.weather || 'none', v => { p.weather = v; });
          }

          // ---- water ----
          el('div', { class: 'hgroup' }, body, 'Reflective water');
          checkField(body, 'Override water', () => p.water !== undefined, v => { if (v) p.water = { y: Math.round(lvl().h * 0.16), strength: 0.5, color: '#9ec8e6' }; else delete p.water; refreshInspector(); });
          if (p.water) {
            numField(body, 'Water level Y', () => p.water.y, v => { p.water.y = v; }, 0.5);
            numField(body, 'Reflectivity', () => p.water.strength !== undefined ? p.water.strength : 0.5, v => { p.water.strength = U.clamp(v, 0, 1); }, 0.05);
            colorField(body, 'Water tint', () => p.water.color || '#9ec8e6', v => { p.water.color = v || '#9ec8e6'; });
          } else if (p.water !== undefined) {
            el('div', { class: 'insNote' }, body, 'Water OFF (removes any reflective water).');
          }
          break;
        }
        case 'audio': {
          selectField(body, 'Mode', [
            { v: 'emitter', t: 'Ambient emitter (positional)' },
            { v: 'reverbZone', t: 'Reverb zone' },
            { v: 'musicTrigger', t: 'Music trigger' }
          ], () => p.mode || 'emitter', v => { p.mode = v; refreshInspector(); });
          if (p.mode !== 'emitter') {
            numField(body, 'Zone W', () => p.w || 8, v => { p.w = Math.max(1, v); });
            numField(body, 'Zone H', () => p.h || 6, v => { p.h = Math.max(1, v); });
          }
          if (p.mode === 'emitter') {
            selectField(body, 'Sound', (G.Audio.sfxNames || ['drop']).map(s => ({ v: s, t: s })), () => p.sound || 'drop', v => { p.sound = v; });
            numField(body, 'Every (s)', () => p.every !== undefined ? p.every : 4, v => { p.every = Math.max(0.2, v); }, 0.5);
            el('div', { class: 'insNote' }, body, 'Plays the sound on a loose timer, panned + attenuated by distance to the player.');
          } else if (p.mode === 'reverbZone') {
            numField(body, 'Wet', () => p.wet !== undefined ? p.wet : 0.55, v => { p.wet = U.clamp(v, 0, 1); }, 0.05);
            numField(body, 'Tail (s)', () => p.tail || 3.4, v => { p.tail = Math.max(0.3, v); }, 0.1);
            el('div', { class: 'insNote' }, body, 'While the player is inside, the room reverb switches to these settings; it reverts on exit. Great for big halls vs tight tunnels.');
          } else {
            selectField(body, 'Music', [{ v: 'tense', t: 'Tense / combat' }, { v: 'calm', t: 'Calm' }, { v: 'boss', t: 'Boss' }], () => p.music || 'tense', v => { p.music = v; });
            el('div', { class: 'insNote' }, body, 'Sets the adaptive-music state when the player enters the zone (reverts to calm on exit).');
          }
          break;
        }
        case 'platform': {
          numField(body, 'Width', () => p.w || 4, v => { p.w = Math.max(1, v); }, 0.5);
          numField(body, 'Height', () => p.h || 0.8, v => { p.h = Math.max(0.3, v); }, 0.1);
          numField(body, 'Travel X', () => p.dx || 0, v => { p.dx = v; }, 0.5);
          numField(body, 'Travel Y', () => p.dy || 0, v => { p.dy = v; }, 0.5);
          numField(body, 'Speed', () => p.speed || 2.5, v => { p.speed = Math.max(0.2, v); }, 0.5);
          selectField(body, 'Mode', [{ v: 'pingpong', t: 'Ping-pong' }, { v: 'loop', t: 'Loop' }], () => p.mode || 'pingpong', v => { p.mode = v; });
          el('div', { class: 'insNote' }, body, 'Carries the player while they ride it. The dashed line shows its travel.');
          break;
        }
        case 'crusher': {
          numField(body, 'Width', () => p.w || 2.6, v => { p.w = Math.max(1, v); }, 0.5);
          numField(body, 'Height', () => p.h || 2, v => { p.h = Math.max(0.5, v); }, 0.5);
          numField(body, 'Slam distance', () => p.dist || 4, v => { p.dist = Math.max(0.5, v); }, 0.5);
          numField(body, 'Period (s)', () => p.period || 2.6, v => { p.period = Math.max(0.5, v); }, 0.2);
          el('div', { class: 'insNote' }, body, 'Slams straight down on a timer and crushes the player.');
          break;
        }
        case 'conveyor': {
          numField(body, 'Width', () => p.w || 5, v => { p.w = Math.max(1, v); }, 0.5);
          numField(body, 'Height', () => p.h || 0.7, v => { p.h = Math.max(0.3, v); }, 0.1);
          numField(body, 'Speed (±)', () => p.speed !== undefined ? p.speed : 3, v => { p.speed = v; }, 0.5);
          el('div', { class: 'insNote' }, body, 'Pushes whoever stands on it. Negative speed = left.');
          break;
        }
        case 'windzone': {
          numField(body, 'Width', () => p.w || 6, v => { p.w = Math.max(1, v); }, 0.5);
          numField(body, 'Height', () => p.h || 9, v => { p.h = Math.max(1, v); }, 0.5);
          numField(body, 'Force X', () => p.fx || 0, v => { p.fx = v; }, 1);
          numField(body, 'Force Y (+up)', () => p.fy !== undefined ? p.fy : 14, v => { p.fy = v; }, 1);
          el('div', { class: 'insNote' }, body, 'Pushes the player while inside — e.g. an updraft to ride upward.');
          break;
        }
        case 'fallfloor': {
          numField(body, 'Width', () => p.w || 3, v => { p.w = Math.max(1, v); }, 0.5);
          numField(body, 'Height', () => p.h || 0.7, v => { p.h = Math.max(0.3, v); }, 0.1);
          numField(body, 'Shake delay (s)', () => p.delay !== undefined ? p.delay : 0.55, v => { p.delay = Math.max(0, v); }, 0.1);
          numField(body, 'Respawn (s)', () => p.respawn || 3, v => { p.respawn = Math.max(0.5, v); }, 0.5);
          el('div', { class: 'insNote' }, body, 'Shakes then drops when stood on, and respawns.');
          break;
        }
        case 'spiketrap': {
          numField(body, 'Width', () => p.w || 2.4, v => { p.w = Math.max(0.5, v); }, 0.5);
          numField(body, 'Period (s)', () => p.period || 2, v => { p.period = Math.max(0.3, v); }, 0.2);
          numField(body, 'Out time (s)', () => p.onTime !== undefined ? p.onTime : 0.9, v => { p.onTime = Math.max(0.1, v); }, 0.1);
          numField(body, 'Phase (s)', () => p.phase || 0, v => { p.phase = v; }, 0.2);
          el('div', { class: 'insNote' }, body, 'Extends and retracts on a timer — only dangerous while out. Offset Phase to alternate several.');
          break;
        }
        case 'mire': {
          selectField(body, 'Kind', [{ v: 'mud', t: 'Mud (slow)' }, { v: 'quicksand', t: 'Quicksand (sink)' }, { v: 'ash', t: 'Ash drift (slow)' }], () => p.kind || 'mud', v => { p.kind = v; });
          numField(body, 'Width', () => p.w || 6, v => { p.w = Math.max(1, v); }, 0.5);
          numField(body, 'Height', () => p.h || 1.4, v => { p.h = Math.max(0.5, v); }, 0.2);
          el('div', { class: 'insNote' }, body, 'Soft ground: slows you (quicksand also drags you down). Place over walkable terrain.');
          break;
        }
        case 'pool': {
          selectField(body, 'Kind', [{ v: 'lava', t: 'Lava (heat haze)' }, { v: 'acid', t: 'Acid (eats breakables)' }], () => p.kind || 'lava', v => { p.kind = v; });
          numField(body, 'Width', () => p.w || 6, v => { p.w = Math.max(1, v); }, 0.5);
          numField(body, 'Height', () => p.h || 1.7, v => { p.h = Math.max(0.5, v); }, 0.2);
          numField(body, 'Damage', () => p.dmg || 1, v => { p.dmg = Math.max(1, Math.round(v)); }, 1);
          el('div', { class: 'insNote' }, body, 'Hazard pool: sears on contact and bounces you out. Lava radiates heat; acid dissolves breakable walls.');
          break;
        }
        case 'gas': {
          numField(body, 'Width', () => p.w || 6, v => { p.w = Math.max(1, v); }, 0.5);
          numField(body, 'Height', () => p.h || 4, v => { p.h = Math.max(1, v); }, 0.5);
          numField(body, 'Damage', () => p.dmg || 1, v => { p.dmg = Math.max(1, Math.round(v)); }, 1);
          el('div', { class: 'insNote' }, body, 'A drifting poison cloud: damages you over time, disperses in strong wind, and ignites in a flash when hit by an Ember Bolt.');
          break;
        }
        case 'breakable': {
          numField(body, 'Width', () => p.w || 2, v => { p.w = Math.max(0.5, v); }, 0.5);
          numField(body, 'Height', () => p.h || 4, v => { p.h = Math.max(0.5, v); }, 0.5);
          numField(body, 'Hits to break', () => p.hp || 3, v => { p.hp = Math.max(1, Math.round(v)); }, 1);
          colorField(body, 'Colour', () => p.color || '#3a4047', v => { p.color = v || undefined; });
          flagField(body, 'Stays-broken flag', () => p.flag || '', v => { p.flag = v || undefined; });
          textField(body, 'Signal on break', () => p.signal || '', v => { p.signal = v || undefined; });
          el('div', { class: 'insNote' }, body, 'Break it with the nail to reveal a passage. A flag keeps it broken across visits; a signal can drive the Logic graph.');
          break;
        }
        case 'lever': {
          textField(body, 'Switch / signal name', () => p.signal || '', v => { p.signal = v || undefined; });
          flagField(body, 'Saved flag (optional)', () => p.flag || '', v => { p.flag = v || undefined; });
          el('div', { class: 'insNote' }, body, 'Interact to toggle. Doors with the same switch name open/close; the name also fires as a Logic signal.');
          break;
        }
        case 'plate': {
          numField(body, 'Width', () => p.w || 1.8, v => { p.w = Math.max(0.5, v); }, 0.5);
          textField(body, 'Switch / signal name', () => p.signal || '', v => { p.signal = v || undefined; });
          checkField(body, 'Latch (stay pressed)', () => p.latch, v => { p.latch = v; });
          flagField(body, 'Saved flag (optional)', () => p.flag || '', v => { p.flag = v || undefined; });
          el('div', { class: 'insNote' }, body, 'On while stood on (or latches). Drives doors/Logic with the same switch name.');
          break;
        }
        case 'door': {
          numField(body, 'Width', () => p.w || 1.2, v => { p.w = Math.max(0.5, v); }, 0.5);
          numField(body, 'Height', () => p.h || 5, v => { p.h = Math.max(1, v); }, 0.5);
          textField(body, 'Opens on switch', () => p.signal || '', v => { p.signal = v || undefined; });
          flagField(body, 'Or saved flag', () => p.flag || '', v => { p.flag = v || undefined; });
          checkField(body, 'Invert (open by default)', () => p.invert, v => { p.invert = v; });
          el('div', { class: 'insNote' }, body, 'Opens when a lever/plate with this switch name is on (or the flag is set). Solid while closed.');
          break;
        }
        case 'npc': {
          textField(body, 'Name', () => p.name || '', v => { p.name = v; });
          colorField(body, 'Colour', () => p.color || '#6a7a8a', v => { p.color = v || '#6a7a8a'; });
          numField(body, 'Scale', () => p.scale || 1, v => { p.scale = Math.max(0.3, v); }, 0.1);
          const dlgHd = el('div', { class: 'hgroup', style: 'display:flex;align-items:center;justify-content:space-between' }, body);
          el('span', {}, dlgHd, 'Dialogue');
          if (G.Tools && G.Tools.dialogue) el('button', { class: 'tbtn', style: 'padding:1px 8px', title: 'Edit this dialogue as a visual node graph' }, dlgHd, '💬 Graph editor').addEventListener('click', () => G.Tools.dialogue.editNPC(currentId, sel.i));
          p.dialogue = p.dialogue || { lines: [] };
          const lines = p.dialogue.lines;
          lines.forEach((ln, li) => {
            const card = el('div', { style: 'border:1px solid #3a3a44;border-radius:5px;padding:6px;margin:5px 0' }, body);
            const hd = el('div', { class: 'frow', style: 'justify-content:space-between;align-items:center' }, card);
            el('div', { style: 'color:#9bbcb0;font-size:11px' }, hd, 'Line ' + li);
            el('button', { class: 'tbtn dangerBtn', style: 'padding:1px 7px' }, hd, '✕').addEventListener('click', () => { lines.splice(li, 1); refreshInspector(); });
            textField(card, 'Speaker', () => ln.speaker || '', v => { ln.speaker = v; });
            const ta = el('textarea', { style: 'width:100%;min-height:42px;margin-top:3px;background:var(--bg2);color:var(--txt);border:1px solid #3c3c44;border-radius:4px;font:12px sans-serif;padding:4px' }, card);
            ta.value = ln.text || ''; ta.addEventListener('input', () => { ln.text = ta.value; });
            checkField(card, 'End dialogue after this line', () => ln.end, v => { if (v) ln.end = true; else delete ln.end; });
            ln.choices = ln.choices || [];
            if (ln.choices.length) el('div', { style: 'color:#86a89c;font-size:10px;margin-top:5px' }, card, 'Choices → goto line (-1 ends):');
            ln.choices.forEach((c, ci) => {
              const crow = el('div', { class: 'frow', style: 'gap:4px;align-items:center;margin-top:2px' }, card);
              const lab = el('input', { type: 'text', placeholder: 'label', value: c.label || '', style: 'flex:1;min-width:0' }, crow); lab.addEventListener('change', () => c.label = lab.value);
              const go = el('input', { type: 'number', title: 'goto line (-1 = end)', value: c.goto != null ? c.goto : -1, style: 'width:42px' }, crow); go.addEventListener('change', () => c.goto = parseInt(go.value));
              const fl = el('input', { type: 'text', placeholder: 'flag', value: c.flag || '', style: 'width:62px' }, crow); fl.addEventListener('change', () => c.flag = fl.value || undefined);
              el('button', { class: 'tbtn', style: 'padding:0 6px' }, crow, '✕').addEventListener('click', () => { ln.choices.splice(ci, 1); refreshInspector(); });
              const qrow = el('div', { class: 'frow', style: 'gap:4px;margin:2px 0 4px 12px' }, card);
              el('div', { style: 'color:#86a89c;font-size:10px;align-self:center' }, qrow, 'quest');
              const qt = el('input', { type: 'text', placeholder: 'title (starts quest)', value: (c.quest && c.quest.title) || '', style: 'flex:1;min-width:0' }, qrow);
              const qo = el('input', { type: 'text', placeholder: 'objective', value: (c.quest && c.quest.objective) || '', style: 'flex:1;min-width:0' }, qrow);
              const setQ = () => { const t = qt.value.trim(); if (t) c.quest = { id: t.toLowerCase().replace(/[^a-z0-9]+/g, '-'), title: t, objective: qo.value.trim() || t }; else delete c.quest; };
              qt.addEventListener('change', setQ); qo.addEventListener('change', setQ);
            });
            el('button', { class: 'tbtn', style: 'margin-top:4px;padding:1px 7px' }, card, '+ choice').addEventListener('click', () => { ln.choices.push({ label: '...', goto: -1 }); refreshInspector(); });
          });
          el('button', { class: 'tbtn', style: 'margin-top:6px' }, body, '+ Add line').addEventListener('click', () => { lines.push({ speaker: p.name || '', text: '' }); refreshInspector(); });
          el('div', { class: 'insNote' }, body, 'Interact to talk. Lines play in order; a choice jumps to its goto line (-1 ends) and can set a flag.');
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
        case 'model': {
          selectField(body, 'Model', (G.Models ? G.Models.list() : []).map(m => ({ v: m, t: m })), () => p.model || '', v => { p.model = v; p.clip = ''; refreshInspector(); });
          const md = G.Models && p.model ? G.Models.get(p.model) : null;
          const clipNames = md && md.clips ? Object.keys(md.clips) : [];
          selectField(body, 'Animation', [{ v: '', t: '(rest pose)' }].concat(clipNames.map(c => ({ v: c, t: c }))), () => p.clip || '', v => { p.clip = v; });
          selectField(body, 'Depth', [{ v: '0', t: 'gameplay layer' }, { v: '-0.3', t: 'just behind' }, { v: '-9', t: 'background' }, { v: '5', t: 'foreground' }], () => String(p.z !== undefined ? p.z : 0), v => { p.z = parseFloat(v); });
          numField(body, 'Scale', () => p.scale || 1, v => { p.scale = Math.max(0.1, v); }, 0.1);
          checkField(body, 'Flip', () => p.flip, v => { p.flip = v; });
          el('div', { class: 'insNote' }, body, 'A custom model from the Models tab. Edit the model there; changes apply on reload.');
          break;
        }
        case 'wall': {
          selectField(body, 'Style', (G.World.WALL_STYLES || ['wood', 'brick', 'wallpaper']).map(k => ({ v: k, t: k })), () => p.style || 'wood', v => { p.style = v; });
          numField(body, 'Width', () => p.w || 16, v => { p.w = Math.max(1, v); }, 1);
          numField(body, 'Height', () => p.h || 18, v => { p.h = Math.max(1, v); }, 1);
          numField(body, 'Depth (z)', () => p.z !== undefined ? p.z : -2, v => { p.z = v; }, 0.5);
          el('div', { class: 'insNote' }, body, 'Interior wall backdrop (centred on its position). Put it behind a building to hide the biome. More negative depth = further back.');
          break;
        }
        case 'furniture': {
          selectField(body, 'Kind', Object.keys(G.World.FURN || {}).map(k => ({ v: k, t: k })), () => p.kind, v => { p.kind = v; });
          selectField(body, 'Depth', [
            { v: '-0.2', t: 'gameplay layer' }, { v: '-0.32', t: 'just behind' }, { v: '-9', t: 'background near' }, { v: '5', t: 'foreground' }
          ], () => String(p.z !== undefined ? p.z : -0.2), v => { p.z = parseFloat(v); });
          numField(body, 'Scale', () => p.scale || 1, v => { p.scale = Math.max(0.2, v); }, 0.1);
          checkField(body, 'Flip', () => p.flip, v => { p.flip = v; });
          numField(body, 'Seed', () => p.seed || 1, v => { p.seed = Math.round(v); }, 1);
          el('div', { class: 'insNote' }, body, 'Full-colour Victorian furniture (detailed, not silhouette).');
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
          numField(body, 'Intensity', () => p.opacity || 0.1, v => { p.opacity = U.clamp(v, 0, 1); }, 0.02);
          break;
        case 'powerup': {
          const gopts = [
            { v: 'wings', t: 'Moth Wings (double jump)' }, { v: 'bolt', t: 'Soul Bolt (max)' },
            { v: 'ember', t: 'Ember Bolt' }, { v: 'frost', t: 'Frost Bolt' }, { v: 'gale', t: 'Gale Bolt' },
            { v: 'scream', t: 'Wraith Cry' }, { v: 'dive', t: 'Abyss Dive' },
            { v: 'soul', t: 'Fill Soul' }, { v: 'glimmer', t: '+200 Glimmer' }, { v: 'all', t: 'Everything' }
          ].concat((G.Charms && G.Charms.LIST ? G.Charms.LIST : []).map(c => ({ v: 'charm:' + c.id, t: 'Charm: ' + c.name })));
          selectField(body, 'Grants', gopts, () => p.grant || 'wings', v => { p.grant = v; });
          el('div', { class: 'insNote' }, body, 'A dev pickup: walk into it to instantly gain the chosen power (re-usable) — handy for testing spells, bolt elements, charms and the dynamic environment.');
          break;
        }
        case 'bioflora':
          selectField(body, 'Kind', [{ v: 'flower', t: 'Flower' }, { v: 'mushroom', t: 'Mushroom' }], () => p.kind || 'flower', v => { p.kind = v; });
          colorField(body, 'Glow colour', () => p.color || (p.kind === 'mushroom' ? '#7ce0ff' : '#ff7ad0'), v => { p.color = v || undefined; });
          checkField(body, 'Destructible (can die)', () => !!p.mortal, v => { if (v) p.mortal = true; else delete p.mortal; });
          el('div', { class: 'insNote' }, body, 'Bioluminescent flora — brightens as you pass. Destructible: the nail can cut it down and nearby fire withers it. Otherwise it’s permanent.');
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
  // Hierarchy 2.0 — icon per object kind/type for quick visual scanning
  const HIER_ICONS = { enemy: '☠', spawn: '⚑', zone: '⛬',
    npc: '🗣', door: '🚪', lever: '🎚', plate: '⏺', breakable: '🧱', charmPickup: '💠', powerup: '✦',
    bossTrigger: '☠', cutsceneTrigger: '🎬', textTrigger: '💬', setActiveTrigger: '🔀', lookTrigger: '👁',
    audio: '🔊', windzone: '🌬', spiketrap: '⚊', platform: '▭', crusher: '⬇', conveyor: '➡', fallfloor: '▱',
    mire: '🟤', pool: '💧', gas: '☁', bioflora: '🌿', decor: '🌾', custom: '◆' };
  const hierIcon = (kind, p) => kind === 'prop' ? (HIER_ICONS[p.type] || '▦') : (HIER_ICONS[kind] || '•');
  function refreshHierarchy() {
    const h = $('hierarchy');
    h.innerHTML = '';
    const L = lvl();
    if (!L) return;
    const item = selectedItem();

    // ---- toolbar: live filter + collapse/expand all (no full re-render on type → no focus loss) ----
    const bar = el('div', { class: 'hbar' }, h);
    const f = el('input', { type: 'text', placeholder: 'Filter objects…', value: hierFilter }, bar);
    el('button', { title: 'Collapse all', onclick: () => { ['prop', 'enemy', 'zone', 'spawn'].forEach(g => hierCollapsed[g] = true); refreshHierarchy(); } }, bar, '⊟');
    el('button', { title: 'Expand all', onclick: () => { hierCollapsed = {}; refreshHierarchy(); } }, bar, '⊞');

    const groups = {};   // groupKey -> { headerEl, rows:[{el, text}] }
    const mk = (kind, i, key, ico, label) => {
      const isSel = item && item.kind === kind && (kind === 'spawn' ? item.key === key : item.i === i);
      const d = el('div', { class: 'hitem' + (isSel ? ' sel' : '') });
      el('span', { class: 'hico' }, d, ico);
      el('span', { class: 'hlabel' }, d, label);
      const focusIt = () => { sel = kind === 'spawn' ? { kind, key } : { kind, i }; multi = []; const it2 = selectedItem(); if (it2) { camX = it2.kind === 'zone' && it2.ref.rect ? it2.ref.rect.x : it2.ref.x; camY = (it2.ref.y !== undefined ? it2.ref.y : (it2.ref.rect ? it2.ref.rect.y : camY)); } };
      const frame = el('span', { class: 'hact', title: 'Frame in view' }, d, '🎯');
      frame.addEventListener('click', ev => { ev.stopPropagation(); focusIt(); refreshHierarchy(); refreshInspector(); });
      const del = el('span', { class: 'hact del', title: 'Delete' }, d, '✕');
      del.addEventListener('click', ev => { ev.stopPropagation(); sel = kind === 'spawn' ? { kind, key } : { kind, i }; multi = []; deleteSelected(); });
      d.addEventListener('click', () => { sel = kind === 'spawn' ? { kind, key } : { kind, i }; multi = []; refreshHierarchy(); refreshInspector(); });
      d.addEventListener('dblclick', () => { focusIt(); });
      return d;
    };
    const addGroup = (key, title, rows) => {
      const collapsed = !!hierCollapsed[key];
      const head = el('div', { class: 'hgroup' + (collapsed ? ' collapsed' : '') }, h);
      el('span', { class: 'htri' }, head, '▾');
      el('span', {}, head, title);
      const cnt = el('span', { class: 'hcount' }, head, String(rows.length));
      head.addEventListener('click', () => { hierCollapsed[key] = !hierCollapsed[key]; refreshHierarchy(); });
      const g = groups[key] = { head, cnt, total: rows.length, rows: [] };
      rows.forEach(r => { const d = mk(r.kind, r.i, r.key, r.ico, r.label); d.style.display = collapsed ? 'none' : ''; h.appendChild(d); g.rows.push({ el: d, text: (r.label + ' ' + r.ico).toLowerCase(), collapsed }); });
    };

    addGroup('prop', 'Props', (L.props || []).map((p, i) => ({ kind: 'prop', i, ico: hierIcon('prop', p), label: `${p.type}${p.kind ? ':' + p.kind : ''}${p.boss ? ':' + p.boss : ''}  (${p.x.toFixed(0)}, ${p.y.toFixed(0)})` })));
    addGroup('enemy', 'Enemies', (L.enemies || []).map((e, i) => ({ kind: 'enemy', i, ico: hierIcon('enemy', e), label: `${e.type}  (${e.x.toFixed(0)}, ${e.y.toFixed(0)})` })));
    addGroup('zone', 'Transitions', (L.transitions || []).map((t, i) => ({ kind: 'zone', i, ico: hierIcon('zone', t), label: `${t.rect ? 'portal' : t.side} → ${t.to} @${t.spawn}` })));
    addGroup('spawn', 'Spawn points', Object.keys(L.spawns || {}).map(k => ({ kind: 'spawn', key: k, ico: hierIcon('spawn'), label: `spawn "${k}"  (${L.spawns[k].x.toFixed(0)}, ${L.spawns[k].y.toFixed(0)})` })));

    // ---- live filtering: toggle row visibility + group counts in place (keeps input focus) ----
    function applyFilter() {
      const q = hierFilter.trim().toLowerCase();
      let anyShown = false;
      for (const key in groups) {
        const g = groups[key]; let shown = 0;
        g.rows.forEach(r => { const match = !q || r.text.includes(q); r.el.dataset.match = match ? '1' : '0'; r.el.style.display = (match && !hierCollapsed[key]) ? '' : 'none'; if (match) shown++; });
        g.cnt.textContent = q ? (shown + '/' + g.total) : String(g.total);
        g.head.style.display = (q && !shown) ? 'none' : '';
        if (shown) anyShown = true;
      }
      let empty = h.querySelector('.hempty');
      if (q && !anyShown) { if (!empty) { empty = el('div', { class: 'hempty' }, h, 'No objects match the filter.'); } }
      else if (empty) empty.remove();
    }
    f.addEventListener('input', () => { hierFilter = f.value; applyFilter(); });
    applyFilter();
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
    if (ensureAllOids(L)) markDirty();     // backfill ids for everything in this level
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
    { id: 'furniture', label: 'Furniture' },
    { id: 'mymodels', label: 'My Models' },
    { id: 'build', label: 'Build' },
    { id: 'dynamic', label: 'Dynamic' },
    { id: 'lights', label: 'Lights' },
    { id: 'enemies', label: 'Enemies' },
    { id: 'bosses', label: 'Bosses' },
    { id: 'markers', label: 'Markers' },
    { id: 'prefabs', label: 'Prefabs' }
  ];
  let assetCat = 'props';
  function assetListFor(cat) {   // the asset list for ANY category, without disturbing the open tab (Companion KB)
    const s = assetCat; assetCat = cat;
    let r = []; try { r = assetList() || []; } catch (e) { r = []; } finally { assetCat = s; }
    return r;
  }
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
        { cat: 'prop', id: 'smith', label: 'Nailsmith (forge)', ico: '⚒️' },
        { cat: 'prop', id: 'spellwell', label: 'Soul well (spells)', ico: '🔮' },
        { cat: 'prop', id: 'charmPickup', label: 'Charm pickup', ico: '🔆', defaults: { charm: 'stoneheart' } },
        { cat: 'prop', id: 'npc', label: 'NPC (dialogue)', ico: '🧝', defaults: { name: 'Wanderer', color: '#6a7a8a', dialogue: { lines: [{ speaker: 'Wanderer', text: 'These tunnels remember more than they tell.' }] } } },
        { cat: 'prop', id: 'powerup', label: 'Power-up (test)', ico: '⚡', defaults: { grant: 'wings' } }
      ];
      case 'decor': {
        const out = [];
        for (const k of G.World.DECOR_KINDS.standing) out.push({ cat: 'prop', id: 'decor', kind: k, label: k + ' (standing)', ico: '🌿' });
        for (const k of G.World.DECOR_KINDS.hanging) out.push({ cat: 'prop', id: 'decor', kind: k, label: k + ' (hanging)', ico: '🪢' });
        return out;
      }
      case 'furniture': return Object.keys(G.World.FURN || {}).map(k => ({ cat: 'prop', id: 'furniture', kind: k, label: k, ico: '🛋️' }));
      case 'mymodels': { const ms = (G.Models ? G.Models.list() : []); return ms.length ? ms.map(name => ({ cat: 'prop', id: 'model', model: name, label: name, ico: '🧍' })) : [{ cat: 'none', label: '(build models in the Models tab)', ico: '🧱' }]; }
      case 'build': return [
        { cat: 'build', id: 'building', label: 'House (small)', ico: '🏠', defaults: { w: 22, h: 28, seed: 3 } },
        { cat: 'build', id: 'building', label: 'House', ico: '🏠', defaults: { w: 30, h: 46, seed: 5 } },
        { cat: 'build', id: 'building', label: 'Manor / Tower', ico: '🏰', defaults: { w: 40, h: 70, seed: 7 } },
        { cat: 'prop', id: 'wall', label: 'Wall — wood panel', ico: '🟫', defaults: { style: 'wood', w: 20, h: 22, z: -2 } },
        { cat: 'prop', id: 'wall', label: 'Wall — brick', ico: '🧱', defaults: { style: 'brick', w: 20, h: 22, z: -2 } },
        { cat: 'prop', id: 'wall', label: 'Wall — wallpaper', ico: '🟥', defaults: { style: 'wallpaper', w: 20, h: 22, z: -2 } }
      ];
      case 'dynamic': return [
        { cat: 'prop', id: 'platform', label: 'Moving platform', ico: '⬛', defaults: { w: 4, h: 0.8, dx: 6, dy: 0, speed: 2.5, mode: 'pingpong' } },
        { cat: 'prop', id: 'crusher', label: 'Crusher', ico: '🔻', defaults: { w: 2.6, h: 2, dist: 4, period: 2.6 } },
        { cat: 'prop', id: 'conveyor', label: 'Conveyor belt', ico: '➡️', defaults: { w: 5, h: 0.7, speed: 3 } },
        { cat: 'prop', id: 'windzone', label: 'Wind current', ico: '🌬️', defaults: { w: 6, h: 9, fx: 0, fy: 14 } },
        { cat: 'prop', id: 'fallfloor', label: 'Collapsing floor', ico: '🧱', defaults: { w: 3, h: 0.7, delay: 0.55, respawn: 3 } },
        { cat: 'prop', id: 'spiketrap', label: 'Timed spikes', ico: '🔺', defaults: { w: 2.4, period: 2, onTime: 0.9, phase: 0 } },
        { cat: 'prop', id: 'mire', kind: 'mud', label: 'Mud', ico: '🟤', defaults: { w: 6, h: 1.4 } },
        { cat: 'prop', id: 'mire', kind: 'quicksand', label: 'Quicksand', ico: '🟫', defaults: { w: 6, h: 1.6 } },
        { cat: 'prop', id: 'mire', kind: 'ash', label: 'Ash drift', ico: '🌫️', defaults: { w: 6, h: 1.2 } },
        { cat: 'prop', id: 'pool', kind: 'lava', label: 'Lava pool', ico: '🌋', defaults: { w: 6, h: 1.8, dmg: 1 } },
        { cat: 'prop', id: 'pool', kind: 'acid', label: 'Acid pool', ico: '🧪', defaults: { w: 6, h: 1.6, dmg: 1 } },
        { cat: 'prop', id: 'gas', label: 'Poison gas', ico: '☣️', defaults: { w: 6, h: 4, dmg: 1 } },
        { cat: 'prop', id: 'breakable', label: 'Breakable wall', ico: '🧱', defaults: { w: 2, h: 4, hp: 3 } },
        { cat: 'prop', id: 'lever', label: 'Lever', ico: '🎚️', defaults: { signal: '' } },
        { cat: 'prop', id: 'plate', label: 'Pressure plate', ico: '⏺️', defaults: { w: 1.8, signal: '', latch: false } },
        { cat: 'prop', id: 'door', label: 'Door (switch)', ico: '🚪', defaults: { w: 1.2, h: 5, signal: '', invert: false } }
      ];
      case 'lights': return [
        { cat: 'prop', id: 'light', label: 'Glow light', ico: '✨', defaults: { color: '#ffeecc', scale: 8, opacity: 0.3, flicker: false } },
        { cat: 'prop', id: 'light', label: 'Flickering light', ico: '🔥', defaults: { color: '#ffc878', scale: 7, opacity: 0.35, flicker: true } },
        { cat: 'prop', id: 'ray', label: 'God ray', ico: '🌤', defaults: { w: 5, h: 18, rot: -0.15, opacity: 0.1 } },
        { cat: 'prop', id: 'bioflora', kind: 'flower', label: 'Glow flower', ico: '🌸', defaults: { color: '#ff7ad0' } },
        { cat: 'prop', id: 'bioflora', kind: 'mushroom', label: 'Glow mushroom', ico: '🍄', defaults: { color: '#7ce0ff' } }
      ];
      case 'enemies': return G.Enemies.TYPES.map(t => ({ cat: 'enemy', id: t.id, label: t.label, ico: '🐛' }))
        .concat([{ cat: 'enemy', id: 'custom', label: 'Custom (behavior)', ico: '🧠', defaults: { spec: { hp: 3, speed: 2, sight: 9, fly: false, color: '#8a5a7a', size: 0.8, idle: 'patrol', onSight: 'chase', attack: 'contact', shootCd: 2 } } }]);
      case 'bosses': return G.Bosses.LIST.map(b2 => ({ cat: 'prop', id: 'bossTrigger', boss: b2.id, label: b2.label, ico: '👑', defaults: { r: 6 } }));
      case 'markers': return [
        { cat: 'spawn', id: 'spawn', label: 'Spawn point', ico: '📍' },
        { cat: 'zone', id: 'portal', label: 'Portal / transition', ico: '🌀' },
        { cat: 'prop', id: 'cutsceneTrigger', label: 'Cutscene trigger', ico: '🎬', defaults: { w: 4, h: 4, once: true } },
        { cat: 'prop', id: 'setActiveTrigger', label: 'Set-active trigger', ico: '🎚️', defaults: { w: 5, h: 5, once: false, targets: [] } },
        { cat: 'prop', id: 'lookTrigger', label: 'Biome / look changer', ico: '🌗', defaults: { w: 5, h: 5, fade: 2 } },
        { cat: 'prop', id: 'audio', label: 'Audio zone', ico: '🔊', defaults: { mode: 'emitter', w: 8, h: 6, sound: 'drop', every: 4 } }
      ];
      case 'prefabs': return Object.keys(prefabs).map(name => ({ cat: 'prefab', prefab: name, label: name, ico: '🧩', n: (prefabs[name].items || []).length, del: true }));
    }
    return [];
  }

  // ---- 3D asset thumbnails: render each asset's real mesh into a tiny canvas (cached) ----
  let thumbR = null, thumbScene = null, thumbCam = null;
  const assetThumbCache = {};
  function thumbInit() {
    if (thumbR !== null) return !!thumbR;
    try {
      const c = document.createElement('canvas'); c.width = c.height = 96;
      thumbR = new THREE.WebGLRenderer({ canvas: c, alpha: true, antialias: true, preserveDrawingBuffer: true });
      thumbR.setSize(96, 96, false); thumbR.setClearColor(0x000000, 0);
      thumbScene = new THREE.Scene();
      thumbCam = new THREE.PerspectiveCamera(30, 1, 0.05, 200);
    } catch (e) { thumbR = false; return false; }
    return true;
  }
  function buildAssetObject(a) {
    const pal = G.World.PAL.verdant;
    try {
      if (a.cat === 'enemy') { return (G.Enemies.preview ? G.Enemies.preview(a.id) : (G.Enemies.make(a.id, 0, 0) || {}).group) || null; }
      if (a.id === 'bossTrigger') return G.Bosses.preview(a.boss || 'mossSovereign');
      if (a.cat === 'prop' && G.World.mkProp && G.World.mkProp[a.id]) {
        const params = Object.assign({ x: 0, y: 0, kind: a.kind, boss: a.boss, model: a.model }, JSON.parse(JSON.stringify(a.defaults || {})));
        const e = G.World.mkProp[a.id](params, pal);
        return e && e.group ? e.group : null;
      }
    } catch (e) { return null; }
    return null;
  }
  function assetThumb(a) {
    const key = a.cat + ':' + a.id + ':' + (a.kind || a.boss || a.label || '');
    if (assetThumbCache[key] !== undefined) return assetThumbCache[key];
    if (!thumbInit()) return (assetThumbCache[key] = null);
    let url = null;
    const obj = buildAssetObject(a);
    if (obj) {
      try {
        const box = new THREE.Box3().setFromObject(obj);
        if (!box.isEmpty() && isFinite(box.min.x)) {
          const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
          obj.position.x -= c.x; obj.position.y -= c.y; obj.position.z -= c.z;   // centre on origin
          const rad = Math.max(s.x, s.y, 0.5) * 0.5;
          thumbScene.add(obj);
          const dist = rad / Math.tan(THREE.MathUtils.degToRad(15)) * 1.3 + 1.5;
          thumbCam.position.set(0, 0, dist + Math.max(0, s.z)); thumbCam.lookAt(0, 0, 0); thumbCam.updateProjectionMatrix();
          thumbR.render(thumbScene, thumbCam);
          url = thumbR.domElement.toDataURL('image/png');
          thumbScene.remove(obj);
        }
      } catch (e) { url = null; }
      try { U.disposeDeep(obj); } catch (e) { }
    }
    return (assetThumbCache[key] = url);
  }

  function refreshAssets() {
    if (!refreshAssets._wired) {                          // attach the static search-row listeners once
      refreshAssets._wired = true;
      const si = $('assetSearch'), ft = $('assetFavToggle');
      if (si) si.addEventListener('input', () => { assetQuery = si.value; refreshAssets(); });
      if (ft) ft.addEventListener('click', () => { assetFavOnly = !assetFavOnly; ft.classList.toggle('on', assetFavOnly); refreshAssets(); });
    }
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
    // filter by the search query and the favourites toggle
    const q = (assetQuery || '').trim().toLowerCase();
    let items = assetList();
    if (q) items = items.filter(a => (a.label || '').toLowerCase().includes(q));
    if (assetFavOnly) items = items.filter(a => assetFavs[assetKey(a)]);
    items = items.slice().sort((a, b) => (assetFavs[assetKey(b)] ? 1 : 0) - (assetFavs[assetKey(a)] ? 1 : 0));  // favourites first
    if (!items.length) el('div', { class: 'nm', style: 'width:100%;padding:10px;color:var(--txt2)' }, body, q ? 'No assets match “' + assetQuery + '”.' : 'No favourites yet — click a ☆ on any asset.');
    for (const a of items) {
      const d = el('div', { class: 'asset' + (placing && placing.label === a.label ? ' on' : '') }, body);
      const url = assetThumb(a);                         // a rendered 3D preview, when available
      if (url) el('img', { class: 'ico', src: url, style: 'width:42px;height:42px;object-fit:contain;image-rendering:auto' }, d);
      else el('div', { class: 'ico' }, d, a.ico);        // markers / prefabs fall back to the emoji
      el('div', { class: 'nm' }, d, a.label + (a.n ? ' (' + a.n + ')' : ''));
      d.addEventListener('click', () => setPlacing(placing && placing.label === a.label ? null : a));
      const key = assetKey(a);
      const star = el('div', { class: 'favstar' + (assetFavs[key] ? ' on' : ''), title: 'Favourite' }, d, assetFavs[key] ? '★' : '☆');
      star.addEventListener('click', ev => { ev.stopPropagation(); if (assetFavs[key]) delete assetFavs[key]; else assetFavs[key] = 1; saveFavs(); refreshAssets(); });
      if (a.del) {
        const x = el('div', { class: 'nm', style: 'position:absolute;top:1px;right:4px;color:#c66;cursor:pointer', title: 'Delete prefab' }, d, '✕');
        x.addEventListener('click', ev => { ev.stopPropagation(); if (confirm('Delete prefab "' + a.prefab + '"?')) deletePrefab(a.prefab); });
      }
      if (a.cat === 'prefab') {
        const nb = el('div', { class: 'nm', style: 'position:absolute;bottom:1px;right:4px;color:#7fb3ff;cursor:pointer', title: 'Embed another prefab inside this one (nested prefab)' }, d, '⊕');
        nb.addEventListener('click', ev => {
          ev.stopPropagation();
          const names = Object.keys(prefabs).filter(n => n !== a.prefab);
          if (!names.length) { alert('Create another prefab first, then you can nest it inside this one.'); return; }
          const child = prompt('Embed which prefab inside “' + a.prefab + '”?\n(' + names.join(', ') + ')', names[0]);
          if (child && prefabs[child]) nestPrefab(a.prefab, child, 2, 0);
        });
      }
    }
  }
  // asset search + favourites state
  let assetQuery = '', assetFavOnly = false;
  let assetFavs = {};
  try { assetFavs = JSON.parse(localStorage.getItem('mossveil-ed-favs')) || {}; } catch (e) { assetFavs = {}; }
  function saveFavs() { try { localStorage.setItem('mossveil-ed-favs', JSON.stringify(assetFavs)); } catch (e) { } }
  function assetKey(a) { return a.cat + ':' + a.id + ':' + (a.kind || a.boss || a.model || a.prefab || a.label || ''); }
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
    const MATS = (G.World && G.World.TERRAIN_MATS) || {};
    const matHx = ch => { const m = MATS[ch]; if (!m) return null; const col = m.col(pal); return '#' + (col >>> 0).toString(16).padStart(6, '0'); };
    const tiles = lvl.tiles || [];
    for (let r = 0; r < lvl.h; r++) {
      const row = tiles[r] || '';
      for (let col = 0; col < lvl.w; col++) {
        const ch = row[col];
        if (ch === '#') { c.fillStyle = hx; c.fillRect(col, r, 1, 1); }
        else if (MATS[ch]) { c.fillStyle = matHx(ch) || hx; c.fillRect(col, r, 1, 1); }
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
    const cs = G.CUTSCENES || {};
    const charmIds = new Set((G.Charms && G.Charms.LIST ? G.Charms.LIST : []).map(c => c.id));
    const bossIds = new Set((G.Bosses && G.Bosses.LIST ? G.Bosses.LIST : []).map(b => b.id));
    const flag = (id, msg, sev, sel) => { warns.push({ id, msg, sev: sev || 'warn', sel }); bad[id] = Math.max(bad[id] || 0, sev === 'error' ? 2 : 1); };
    const incoming = {};
    for (const id in G.LEVELS) for (const tz of (G.LEVELS[id].transitions || [])) if (tz.to) incoming[tz.to] = (incoming[tz.to] || 0) + 1;
    // reachability: BFS over transitions from the start room (true reachability, not just incoming links)
    const startId = Object.keys(G.LEVELS)[0];
    const reachable = {}; if (startId) { reachable[startId] = true; const q = [startId];
      while (q.length) { const cur = q.shift(); for (const tz of (G.LEVELS[cur].transitions || [])) { const to = tz.to; if (to && G.LEVELS[to] && !reachable[to]) { reachable[to] = true; q.push(to); } } } }

    for (const id in G.LEVELS) {
      const L = G.LEVELS[id];
      // transitions
      (L.transitions || []).forEach((tz, i) => {
        const to = tz.to;
        if (!to || !G.LEVELS[to]) { flag(id, `${id}: exit points to missing level "${to || '∅'}"`, 'error', { kind: 'zone', i }); return; }
        if (tz.spawn && G.LEVELS[to].spawns && !G.LEVELS[to].spawns[tz.spawn]) flag(id, `${id} → ${to}: arrival spawn "${tz.spawn}" not found in ${to}`, 'error', { kind: 'zone', i });
        if (!(G.LEVELS[to].transitions || []).some(t2 => t2.to === id)) { flag(id, `${id} → ${to}: no return exit (one-way)`, 'warn', { kind: 'zone', i }); bad[to] = Math.max(bad[to] || 0, 1); }
      });
      // props
      (L.props || []).forEach((p, i) => {
        const sel = { kind: 'prop', i };
        if (p.type === 'cutsceneTrigger' && p.cutscene && !cs[p.cutscene]) flag(id, `${id}: cutscene trigger references missing cutscene "${p.cutscene}"`, 'error', sel);
        if (p.type === 'charmPickup' && p.charm && charmIds.size && !charmIds.has(p.charm)) flag(id, `${id}: charm pickup has unknown charm "${p.charm}"`, 'error', sel);
        if (p.type === 'bossTrigger' && p.boss && bossIds.size && !bossIds.has(p.boss)) flag(id, `${id}: boss trigger has unknown boss "${p.boss}"`, 'error', sel);
        if (p.type === 'setActiveTrigger') {
          if (!p.targets || !p.targets.length) flag(id, `${id}: set-active trigger has no targets`, 'warn', sel);
          for (const t of (p.targets || [])) {
            if (!t.level || !G.LEVELS[t.level]) { flag(id, `${id}: set-active target points to missing scene "${t.level || '∅'}"`, 'error', sel); continue; }
            if (t.oid == null) { flag(id, `${id}: a set-active target has no object chosen`, 'warn', sel); continue; }
            const TL = G.LEVELS[t.level];
            const found = (TL.props || []).some(o => o.oid === t.oid) || (TL.enemies || []).some(o => o.oid === t.oid) || (TL.transitions || []).some(o => o.oid === t.oid);
            if (!found) flag(id, `${id}: set-active target object (id ${t.oid}) no longer exists in ${t.level}`, 'error', sel);
          }
        }
      });
      // level-level
      if (L.intro && !cs[L.intro]) flag(id, `${id}: intro cutscene "${L.intro}" doesn't exist`, 'error');
      if (L.water && (L.water.y < 0 || L.water.y > L.h)) flag(id, `${id}: water level Y (${L.water.y}) is outside the room`, 'warn');
      if (!(L.transitions || []).length) flag(id, `${id}: has no exits (dead-end room)`, 'warn');
      if (incoming[id] && !(L.spawns && Object.keys(L.spawns).length)) flag(id, `${id}: rooms link here but it has no spawn points`, 'warn');
      if (id !== startId && !reachable[id]) flag(id, `${id}: unreachable from the start room "${startId}"`, 'warn', null);
    }
    return { warns, bad, reachable, startId };
  }

  // live count badge on the Lint left-panel tab (+ refresh the panel if it's open)
  // status-bar lint summary (bottom bar): shows the last issue; click to expand the full panel
  function refreshLint() {
    const s = $('lintStatus'); if (!s) return;
    const { warns } = validateWorld();
    const errs = warns.filter(w => w.sev === 'error').length;
    if (!warns.length) { s.textContent = '✓ Lint'; s.classList.remove('warn', 'err'); s.title = 'No world issues found'; }
    else {
      const last = warns[warns.length - 1];
      s.textContent = '⚠ ' + warns.length + ' issue' + (warns.length > 1 ? 's' : '') + ' · ' + last.msg;
      s.classList.toggle('err', errs > 0); s.classList.toggle('warn', errs === 0);
      s.title = warns.length + ' world issue' + (warns.length > 1 ? 's' : '') + ' — click for the full list';
    }
    if ($('lintPanel') && $('lintPanel').classList.contains('on')) refreshLintPanel();
  }
  function openLintPanel() { const p = $('lintPanel'); if (!p) return; p.classList.add('on'); refreshLintPanel(); }
  function closeLintPanel() { const p = $('lintPanel'); if (p) p.classList.remove('on'); }
  // clickable list of every world issue, grouped by level — rendered into the bottom Lint panel
  function refreshLintPanel() {
    const box = $('lintPanelBody'); if (!box) return; box.innerHTML = '';
    const { warns } = validateWorld();
    if (!warns.length) { el('div', { class: 'insNote', style: 'color:#7fd89a;padding:12px 10px' }, box, '✓ No issues found — every link, reference and exit checks out.'); return; }
    const errs = warns.filter(w => w.sev === 'error').length;
    el('div', { class: 'insNote', style: 'padding:8px 10px 4px' }, box, `${warns.length} issue${warns.length > 1 ? 's' : ''} · ${errs} error${errs !== 1 ? 's' : ''}, ${warns.length - errs} warning${(warns.length - errs) !== 1 ? 's' : ''} — click to jump to it.`);
    const byId = {};
    for (const w of warns) (byId[w.id] = byId[w.id] || []).push(w);
    for (const id in byId) {
      el('div', { style: 'color:#9fd8b8;font-size:12px;margin:9px 10px 2px;font-weight:600' }, box, (G.LEVELS[id] ? (G.LEVELS[id].title || id) : id));
      for (const w of byId[id]) {
        const row = el('div', { class: 'lintRow' }, box);
        el('span', { style: 'color:' + (w.sev === 'error' ? '#ff7a6a' : '#ffcf4a'), title: w.sev }, row, w.sev === 'error' ? '✕' : '⚠');
        el('span', { style: 'color:#d8d2c8' }, row, w.msg);
        row.addEventListener('click', () => {
          if (!G.LEVELS[w.id]) return;
          closeLintPanel();
          if (w.id !== currentId) openLevel(w.id);
          if (w.sel) setTimeout(() => { sel = w.sel; multi = []; const it = selectedItem(); if (it && it.ref) { camX = it.ref.x != null ? it.ref.x : (it.ref.rect ? it.ref.rect.x : camX); camY = it.ref.y != null ? it.ref.y : (it.ref.rect ? it.ref.rect.y : camY); } refreshInspector(); refreshHierarchy(); }, 200);
        });
      }
    }
  }

  // ---- Guide / dictionary: documents every Logic node + engine concept ----
  const NODE_DESC = {
    onRoomEnter: 'Fires once when the player enters this room.',
    onTimer: 'Fires once, N seconds after the room loads.',
    onZone: 'Fires when the player walks into the rectangle (x,y,w,h). “once” = only the first time.',
    onSignal: 'Fires when an Emit Signal action broadcasts a matching name.',
    onBossDeath: 'Fires when a boss dies (blank id = any boss).',
    onInterval: 'Fires repeatedly every N seconds while in the room.',
    onHpBelow: 'Fires when the player’s health drops below the threshold (re-arms when it rises again).',
    ifFlag: 'Branch: “true” if the flag is set, else “false”.',
    ifNotFlag: 'Branch: “unset” if the flag is NOT set, else “set”.',
    chance: 'Random branch — “hit” with the given % chance, else “miss”.',
    gate: 'Passes through only the FIRST time it’s reached this room session, then blocks.',
    setActive: 'Show or hide an object by its id + level. Use the ⌖ picker to choose the object.',
    setFlag: 'Set a saved flag on or off.',
    signal: 'Broadcast a signal name — every On Signal node with that name fires.',
    wait: 'Pause this chain for N seconds, then continue.',
    sound: 'Play a sound effect (pick from the list).',
    shake: 'Shake the camera.',
    hitstop: 'Briefly freeze the game for impact (seconds).',
    flash: 'Flash the whole screen a colour.',
    fx: 'Spawn a particle burst at the player (+ dx/dy offset).',
    heal: 'Restore player health.',
    hurt: 'Damage the player.',
    weather: 'Change the room’s weather.',
    toast: 'Show a small italic notice near the bottom (custom text).',
    areaTitle: 'Show a big centred area title (custom text).',
    cutscene: 'Play a cutscene.',
    text: 'Show custom text — choose placement: default area-title, top / centre / bottom, or toast.',
    log: 'Print a message to the browser console (debugging).'
  };
  const CONCEPTS = [
    ['Companion (🤖 Ask)', 'An offline assistant in the toolbar: ask in plain language ("how do I make a door open with a lever?", "add lava", "connect two rooms") and it gives exact, current steps with buttons that switch tabs and arm placement for you. It reads the editor live (every asset, this Guide, your scene), so its answers always match the current UI. Fully offline — no account, no network.'],
    ['Object id', 'Every placed prop, enemy and portal gets an automatic numeric id (shown in its inspector). Reference it from the Logic graph or triggers; the ⌖ scope button searches and inserts ids.'],
    ['Flag', 'A saved on/off switch the game remembers (e.g. “door1_opened”). Set it with Set Flag; branch on it with If Flag / If Not Flag.'],
    ['Signal', 'A one-off message inside the running graph. Emit Signal broadcasts a name; On Signal nodes with the same name fire. Good for fanning one event out to many actions.'],
    ['Active system', 'Objects can be toggled active/inactive (Set Active). Inactive objects are hidden and inert until a trigger flips them on.'],
    ['Building generator', 'Build tab → House / Manor: stamps a procedural multi-storey building (stone shell + wood floors as terrain, randomised Victorian furniture as props).'],
    ['Wall backdrop', 'Build tab → Wall (wood / brick / wallpaper): a tileable interior wall placed behind a building to hide the biome. Not affected by dynamic lighting.'],
    ['Furniture', 'Furniture tab: full-colour Victorian furniture — sofa, fireplace (live fire), bookshelf, table, chandelier, painting, plant, chair, rug.'],
    ['Biomes', '20 biome looks (verdant, gloom, City of Tears, forge, mine, village, archive, garden, tombs…). Set per level in Level settings; backgrounds + decor follow.'],
    ['Dynamic lighting', 'Real-time 2D lights (lamps, fires, player lantern) with soft shadows + edge glow. Per-room Intensity / Edge glow / Soft shadows in Level settings; on/off in the in-game Settings.'],
    ['Audio markers', 'Markers → Audio zone, in three modes: Ambient emitter (a positional looping sound, panned + attenuated by distance), Reverb zone (swaps the room reverb while the player is inside, reverts on exit), and Music trigger (sets the adaptive-music mood: calm / tense / boss).'],
    ['Model editor', 'Models tab: build characters or props from primitives, parent parts into a rig, set pivots, and author animation clips. “🦴 Auto-rig (humanoid)” guesses a torso/head/arms/legs skeleton from the layout and generates idle + walk clips. Place a saved model in a level from Props → Model (with an Animation dropdown).'],
    ['Hunter’s Journal', 'In-game bestiary (pause → Journal) that fills as you defeat each creature: kill counts, lore and a live 3D portrait. The first kill of a type pops a “Journal entry added” notice.'],
    ['Shade', 'On death you drop your Glimmer and a shade spawns where you fell (saved to the file). Return to that room and destroy the shade to reclaim the Glimmer.'],
    ['Map pins & compass', 'On the in-game map: Z drops a pin, X clears the nearest one; the header shows exploration %. In play, an edge arrow points to the nearest bench when it’s off-screen.'],
    ['Dynamic elements', 'Dynamic category: moving platforms (carry the rider), crushers, conveyors, wind currents, collapsing floors and timed spikes — interactive hazards/traversal that bring rooms to life.'],
    ['Switches & doors', 'Breakable walls (nail them to reveal secrets), levers (interact) and pressure plates (stand-on / latch) toggle a named switch — doors with that name open/close, and the name also fires as a Logic signal; both can save a flag.'],
    ['NPCs & dialogue', 'Place an NPC (Props) and author its branching dialogue right in the inspector: lines (speaker + text), per-line choices (label / goto line / set flag / start quest), and an “end here” terminator. Interact to talk; the box shows a portrait + typewriter text.'],
    ['Quests', 'Dialogue choices can start a quest (title + objective, optional done-flag). Active quests show an on-screen objective and appear in the pause → Quests log; a quest auto-completes when its done-flag is set.'],
    ['Progression', 'Glimmer sinks: a Nailsmith forges the nail (+damage), and a Soul well learns/empowers spells. Charms can pair into synergies, and the player can overcharm (one over notches) for double damage taken.'],
    ['Custom enemies', 'Enemies → Custom (behavior): author a creature from a spec (health/speed/sight/size/colour, flies or walks, idle pattern, on-sight reaction, attack type) — data-driven AI with no code.'],
    ['Soundtrack', 'A composed adaptive “Score” (per-biome themes that intensify with on-screen danger) plays by default; in-game Settings → Soundtrack switches to the original “Classic” drones. Per level, the “Music (Score)” field picks a specific theme or Auto-by-biome. Boss fights are automatic: the biome theme full-stops, a dedicated boss theme plays the fight, and the biome fades back in on the boss’s death.'],
    ['Rotate objects', 'Every placed object/asset/prop has a Rotation° field in the Inspector (degrees, snaps by 15°). In the viewport, [ and ] rotate the selection by 15° (Shift = fine 1°), multi-selection aware. The selection box and click hit-test rotate to match the model, and static solid props (door, breakable, fall-floor, gate) carry their collision through the rotation. Moving platforms/crushers keep an axis-aligned collider.'],
    ['Collision box', 'Any prop can carry a custom Solid box: tick “Solid box” in the Inspector, then set its W / H and offset X/Y. It blocks the player, rotates with the object, toggles with the active/inactive system, and shows as a red dashed outline. Use it to make decorative pieces solid. Doors / breakables / platforms already collide via their own Width/Height.'],
    ['Hit area (hurtbox)', 'Enemies and bosses get a Hit area instead of a solid box: tick “Custom hit area”, then set W / H + offset. It’s the region your attacks must overlap to land a hit (green dashed outline), separate from the body — so you change how easily a foe is struck without altering its physics or contact damage. Enlarge it when a foe feels like it should have been hit but wasn’t. Boss hit areas are set on the boss trigger that spawns them.'],
    ['Dynamic environment', 'Grass is flammable: an Ember Bolt (Soul well) sets it alight in the thrown direction. Fire burns ~10s (flame/ember/smoke/heat-haze) then leaves scorched grass for ~2h of gameplay. Weather rules it: rain/snow/blizzard douse it (steam where fire meets water), wet ground won’t catch until it dries, embers burn ~20s, wind spreads it and pushes the player. Reflective water (Level settings) freezes to mirror-ice; deep snow accumulates in blizzards (slows you); frost edges the screen.'],
    ['Hazard blocks (Dynamic)', 'Placeable, resizable zones: Mud / Quicksand / Ash drift (soft ground — slow, quicksand sinks you); Lava / Acid pools (sear on contact + bounce you out; lava radiates heat, acid eats breakable walls); Poison gas (drifts, damages over time, disperses in wind, and ignites in a flash from an Ember Bolt); Glow flower / mushroom (bioluminescent flora that brightens as you pass — tick “Destructible” to let the nail cut it / fire wither it).'],
    ['Bolt elements', 'At a Soul well, attune the Soul Bolt to Ember (ignite grass + sear), Frost (snuff fire + freeze foes) or Gale (hurl foes back, fan fire, blow gas away). One element at a time — confirm a learned-but-inactive element to switch to it.']
  ];
  const TOOLS = [
    ['Auto-tile (⊞ Auto)', 'While painting terrain, exposed edges become the smooth/curvy variant and buried interior stays hard. Shift+click the button retiles the whole level.'],
    ['Profiler (F3)', 'Toggle the performance overlay: FPS + frame-time graph, draw calls, triangles, light count, active post passes.'],
    ['Record & replay (F6 / F7 / F8)', 'F6 records a run, F7 replays it deterministically, F8 stops. Great for demos and debugging a death.'],
    ['Tone mapping', 'In-game Settings → Tone mapping: Off / ACES / AgX filmic curves. Also Motion blur, Dynamic lighting toggles.'],
    ['Tabs', 'The ☰ File menu (top-left) holds the views — Scene (paint & place), Map, Cutscene, Logic (visual scripting), Models — plus Save and GitHub / Save destination. Left panel: Hierarchy, Levels, Scenes, Guide. Lint lives in the bottom status bar.'],
    ['Lint', 'Validates the world — broken links, missing references, dead-end rooms, BFS reachability (rooms you can’t walk to from the start) and targets with no spawn points. The bottom status bar shows the latest issue; click it to expand the full list over the asset browser (✕ to collapse), and click any issue to jump straight to it.'],
    ['Asset tabs', 'Props, Decor, Furniture, Build, Lights, Enemies, Bosses, Markers, Prefabs. Shift+click to keep placing.'],
    ['Asset browser', 'Every prop / model / enemy renders a live 3D thumbnail. Search assets by name, and ★ favourite the ones you use most (favourites sort to the front; the ★ toggle shows favourites only).'],
    ['World graph (Map tab)', 'The Map tab doubles as a connection graph: room thumbnails + door links, a ▶START badge on the entry room, dimmed unreachable rooms, and red/amber outlines on rooms with lint errors/warnings.'],
    ['Nested prefabs', 'A saved prefab can embed other prefabs — click ⊕ on a prefab card to nest one inside. Stamping expands them recursively (cycle-guarded); edit the stamped copies freely for per-instance variants.'],
    ['Hot-reload (↻)', 'In the ▶ Play-here overlay, the ↻ Reload button saves your latest edits and reloads the running room in place — no need to stop and relaunch.'],
    ['Model editor (Models tab)', 'Build & animate custom models from primitives; “🦴 Auto-rig (humanoid)” auto-builds a skeleton + idle/walk clips. Flat-shaded by default to match the art; place results from Props → Model.'],
    ['Debug inspector (F4)', 'In ▶ Play here, press F4 for a live entity inspector — click any entity to read its state (hp/aggro/pos/vel…); [T] teleports it to the player, [`] kills it.'],
    ['Controls & gamepad', 'In-game Settings → Controls rebinds every action to a key OR gamepad button (Xbox/PS glyphs auto-detected); bindings persist. Controllers rumble on impacts.']
  ];
  function buildGuide() {
    const box = $('guide'); if (!box) return; box.innerHTML = '';
    const sb = el('input', { id: 'guideSearch', placeholder: 'Search the guide…', spellcheck: 'false' }, box);
    const content = el('div', {}, box);
    const T = (G.EventGraph && G.EventGraph.TYPES) || {};
    const mkSec = title => { const s = el('div', { class: 'gSec' }, content); el('div', { class: 'gHead' }, s, title); return s; };
    const mkEntry = (s, name, desc) => { const e = el('div', { class: 'gEntry' }, s); el('div', { class: 'gName' }, e, name); el('div', { class: 'gDesc' }, e, desc); };
    const ev = mkSec('Logic — Events'), cn = mkSec('Logic — Conditions'), ac = mkSec('Logic — Actions');
    for (const k in T) { const def = T[k]; const s = def.kind === 'event' ? ev : def.kind === 'cond' ? cn : ac; mkEntry(s, def.title, NODE_DESC[k] || ''); }
    const cc = mkSec('Concepts'); for (const [a, b2] of CONCEPTS) mkEntry(cc, a, b2);
    const tt = mkSec('Tools & shortcuts'); for (const [a, b2] of TOOLS) mkEntry(tt, a, b2);
    sb.addEventListener('input', () => {
      const f = sb.value.toLowerCase();
      content.querySelectorAll('.gEntry').forEach(e => { e.style.display = e.textContent.toLowerCase().includes(f) ? '' : 'none'; });
      content.querySelectorAll('.gSec').forEach(s => { s.style.display = [...s.querySelectorAll('.gEntry')].some(e => e.style.display !== 'none') ? '' : 'none'; });
    });
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
    // validation markers + summary (world-graph diagnostic overlay)
    const { warns, bad, reachable, startId } = validateWorld();
    for (const id in G.LEVELS) {
      const L = G.LEVELS[id]; const r = G.MapView.roomScreenRect(L, view);
      if (r.w < 6 || r.h < 6) continue;
      if (startId && !reachable[id]) { mctx.fillStyle = 'rgba(6,5,10,0.5)'; mctx.fillRect(r.x, r.y, r.w, r.h); }   // dim unreachable
      const sev = bad[id];
      if (sev) {
        mctx.strokeStyle = sev >= 2 ? 'rgba(255,90,80,0.95)' : 'rgba(255,200,80,0.9)';
        mctx.lineWidth = 2; mctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
        mctx.font = '16px Segoe UI'; mctx.textAlign = 'center'; mctx.fillStyle = sev >= 2 ? '#ff6a5a' : '#ffcf4a';
        mctx.fillText(sev >= 2 ? '✕' : '⚠', r.x + r.w - 10, r.y + 16);
      }
      if (id === startId) {
        mctx.textAlign = 'left'; mctx.font = 'bold 10px Segoe UI'; mctx.fillStyle = 'rgba(130,230,160,0.95)';
        mctx.fillText('▶ START', r.x + 5, r.y + 14);
      }
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
    $('tabLogic').classList.toggle('on', t === 'logic');
    mapCanvas.style.display = t === 'map' ? 'block' : 'none';
    glCanvas.style.display = (t === 'scene' || t === 'models') ? 'block' : 'none';
    overlay.style.display = (t === 'models') ? 'none' : 'block';   // overlay sits over #gl; hide it for the model viewport
    $('csView').classList.toggle('on', t === 'cutscene');
    $('logicCanvas').classList.toggle('on', t === 'logic');
    $('logicPalette').classList.toggle('on', t === 'logic');
    $('tabModels').classList.toggle('on', t === 'models');
    $('modelPanel').classList.toggle('on', t === 'models');
    $('modelBar').classList.toggle('on', t === 'models');
    if (t === 'models') $('modelBar').textContent = 'left-drag part = move · drag empty = orbit · right-drag = pan · wheel = zoom · Del = delete part';
    $('viewportHint').textContent = '';
    if (t === 'cutscene') { setLeftTab('S'); refreshCsTab(); }
    if (t === 'logic') { resize(); buildLogicPalette(); refreshInspector(); }
    if (t === 'models') { resize(); rebuildModelMeshes(); refreshModelPanel(); refreshInspector(); }
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
    const SCREEN = new Set(['fade', 'letterbox', 'blur', 'text', 'camera', 'cameraRestore', 'shakePulse', 'sfx', 'music', 'stinger', 'flash']);
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

  const EASE_EVENTS = new Set(['fade', 'letterbox', 'blur', 'camera', 'cameraRestore']);
  const EASE_PRESETS = [['Linear', 'linear'], ['Ease In', 'inQuad'], ['Ease Out', 'outQuad'], ['Ease In-Out', 'inOutQuad'], ['Cubic In-Out', 'inOutCubic'], ['Back In', 'inBack'], ['Back Out', 'outBack'], ['Elastic Out', 'outElastic'], ['Custom curve', 'custom']];
  // easing picker + a draggable cubic-bezier curve editor for one cutscene event
  function addEaseControl(body, ev) {
    const CW = 172, CH = 112, PAD = 12, W = CW - 2 * PAD, H = CH - 2 * PAD;
    const r = el('div', { class: 'frow' }, body); el('label', {}, r, 'Easing');
    const sel = el('select', {}, r);
    for (const [lab, val] of EASE_PRESETS) el('option', { value: val }, sel, lab);
    sel.value = Array.isArray(ev.ease) ? 'custom' : (ev.ease || 'inOutQuad');
    const cnv = el('canvas', { width: CW, height: CH, style: 'display:block;margin:6px 0 2px;background:#0c1014;border:1px solid rgba(120,200,180,.25);border-radius:5px;cursor:pointer' }, body);
    const cx = cnv.getContext('2d');
    function fn() { return Array.isArray(ev.ease) ? U.cubicBezier(ev.ease[0], ev.ease[1], ev.ease[2], ev.ease[3]) : (U.ease[ev.ease || 'inOutQuad'] || U.ease.inOutQuad); }
    function draw() {
      cx.clearRect(0, 0, CW, CH); cx.fillStyle = '#0c1014'; cx.fillRect(0, 0, CW, CH);
      cx.strokeStyle = 'rgba(255,255,255,.06)'; cx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) { const x = PAD + W * i / 4, y = PAD + H * i / 4; cx.beginPath(); cx.moveTo(x, PAD); cx.lineTo(x, PAD + H); cx.stroke(); cx.beginPath(); cx.moveTo(PAD, y); cx.lineTo(PAD + W, y); cx.stroke(); }
      const f = fn(); cx.strokeStyle = '#6fd6a8'; cx.lineWidth = 2; cx.beginPath();
      for (let i = 0; i <= 48; i++) { const t = i / 48, y = f(t), X = PAD + W * t, Y = PAD + H * (1 - y); i ? cx.lineTo(X, Y) : cx.moveTo(X, Y); }
      cx.stroke();
      if (Array.isArray(ev.ease)) {
        const e = ev.ease, h1 = { x: PAD + W * e[0], y: PAD + H * (1 - e[1]) }, h2 = { x: PAD + W * e[2], y: PAD + H * (1 - e[3]) };
        cx.strokeStyle = 'rgba(180,210,200,.4)'; cx.beginPath(); cx.moveTo(PAD, PAD + H); cx.lineTo(h1.x, h1.y); cx.stroke(); cx.beginPath(); cx.moveTo(PAD + W, PAD); cx.lineTo(h2.x, h2.y); cx.stroke();
        for (const h of [h1, h2]) { cx.fillStyle = '#ffd887'; cx.beginPath(); cx.arc(h.x, h.y, 5, 0, 6.2832); cx.fill(); }
      }
    }
    draw();
    sel.addEventListener('change', () => {
      if (sel.value === 'custom') ev.ease = [0.42, 0, 0.58, 1]; else ev.ease = sel.value;
      delete ev._ef; delete ev._efKey; markCsDirty(); refreshScenes(); draw();
    });
    let drag = null;
    cnv.addEventListener('pointerdown', e => {
      if (!Array.isArray(ev.ease)) return;
      const rc = cnv.getBoundingClientRect(), mx = e.clientX - rc.left, my = e.clientY - rc.top, ee = ev.ease;
      const h1 = { x: PAD + W * ee[0], y: PAD + H * (1 - ee[1]) }, h2 = { x: PAD + W * ee[2], y: PAD + H * (1 - ee[3]) };
      if (Math.hypot(h1.x - mx, h1.y - my) < 13) drag = 0; else if (Math.hypot(h2.x - mx, h2.y - my) < 13) drag = 1; else return;
      cnv.setPointerCapture(e.pointerId);
    });
    cnv.addEventListener('pointermove', e => {
      if (drag === null) return;
      const rc = cnv.getBoundingClientRect();
      let x = (e.clientX - rc.left - PAD) / W, y = 1 - (e.clientY - rc.top - PAD) / H;
      x = Math.max(0, Math.min(1, x)); y = Math.max(-0.6, Math.min(1.6, y));
      ev.ease[drag * 2] = +x.toFixed(3); ev.ease[drag * 2 + 1] = +y.toFixed(3);
      delete ev._ef; delete ev._efKey; markCsDirty(); draw();
    });
    cnv.addEventListener('pointerup', () => { if (drag !== null) { drag = null; refreshScenes(); } });
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
    const csSelect = (label, key, opts) => {
      const r = el('div', { class: 'frow' }, body);
      el('label', {}, r, label);
      const sel = el('select', {}, r);
      (typeof opts === 'function' ? opts() : opts).forEach(o => el('option', { value: o }, sel, o === '' ? '(keep)' : o));
      sel.value = ev[key] !== undefined ? ev[key] : '';
      sel.addEventListener('change', () => { ev[key] = sel.value; markCsDirty(); refreshScenes(); });
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
    if (EASE_EVENTS.has(ev.type)) addEaseControl(body, ev);
    for (const [key, kind, opts] of spec.fields) {
      if (kind === 'num') csNum(key, key, 0.1);
      else if (kind === 'sel') csSelect(key, key, opts);
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
    $('btnSmooth').classList.toggle('on', terrainSmooth);
    $('btnAutotile').classList.toggle('on', autoTile);
  }
  document.querySelectorAll('.tool').forEach(b2 => {
    b2.addEventListener('click', () => { tool = b2.dataset.tool; setPlacing(null); refreshToolbar(); });
  });
  $('btnSnap').addEventListener('click', () => { snap = !snap; refreshToolbar(); });
  $('btnGizmos').addEventListener('click', () => { gizmos = !gizmos; refreshToolbar(); });
  $('btnScatter').addEventListener('click', () => { scatter = !scatter; refreshToolbar(); });
  $('brushShape').addEventListener('change', e => { brushShape = e.target.value; });
  $('brushSize').addEventListener('change', e => { brushSize = parseInt(e.target.value) || 1; });
  (function () {                                   // populate the terrain-material picker (hard chars)
    const sel = $('terrainMat'); const M = (G.World && G.World.TERRAIN_MATS) || { '#': { label: 'Grassy' } };
    for (const ch in M) { if (M[ch].smooth) continue; el('option', { value: ch }, sel, M[ch].label); }
    sel.value = terrainMat;
    sel.addEventListener('change', e => { terrainMat = e.target.value; if (tool !== 'solid') { tool = 'solid'; refreshToolbar(); } });
  })();
  $('btnSmooth').addEventListener('click', () => { terrainSmooth = !terrainSmooth; if (tool !== 'solid') tool = 'solid'; refreshToolbar(); });
  $('btnAutotile').addEventListener('click', (e) => {
    if (e.shiftKey) { pushUndo(); retileWholeLevel(); return; }   // shift+click = retile the whole level now
    autoTile = !autoTile; if (autoTile && tool !== 'solid' && tool !== 'erase') tool = 'solid'; refreshToolbar();
  });
  $('btnUndo').addEventListener('click', doUndo);
  $('btnRedo').addEventListener('click', doRedo);
  $('tabScene').addEventListener('click', () => setTab('scene'));
  $('tabMap').addEventListener('click', () => setTab('map'));
  $('tabCutscene').addEventListener('click', () => setTab('cutscene'));
  $('tabLogic').addEventListener('click', () => setTab('logic'));
  $('tabModels').addEventListener('click', () => setTab('models'));
  // File / view dropdown: toggle open, close on pick or click-outside
  (function () {
    const fb = $('btnFile'), fm = $('fileMenu'); if (!fb || !fm) return;
    fb.addEventListener('click', e => {
      e.stopPropagation();
      if (!fm.classList.contains('on')) { const r = fb.getBoundingClientRect(); fm.style.left = r.left + 'px'; fm.style.top = (r.bottom + 3) + 'px'; }
      fm.classList.toggle('on');
    });
    fm.addEventListener('click', () => fm.classList.remove('on'));
    document.addEventListener('click', e => { if (!fb.contains(e.target) && !fm.contains(e.target)) fm.classList.remove('on'); });
  })();
  function setLeftTab(which) {
    csMode = which === 'S';
    $('ltabH').classList.toggle('on', which === 'H');
    $('ltabL').classList.toggle('on', which === 'L');
    $('ltabS').classList.toggle('on', which === 'S');
    $('ltabG').classList.toggle('on', which === 'G');
    $('hierarchy').style.display = which === 'H' ? 'block' : 'none';
    $('levels').style.display = which === 'L' ? 'block' : 'none';
    $('scenes').style.display = which === 'S' ? 'block' : 'none';
    $('guide').style.display = which === 'G' ? 'block' : 'none';
    if (which === 'L') refreshLevels();
    if (which === 'S') { refreshScenes(); }
    if (which === 'G') buildGuide();
    refreshInspector();
  }
  $('ltabH').addEventListener('click', () => setLeftTab('H'));
  $('ltabL').addEventListener('click', () => setLeftTab('L'));
  $('ltabS').addEventListener('click', () => setLeftTab('S'));
  $('ltabG').addEventListener('click', () => setLeftTab('G'));
  // bottom-bar lint: click the summary to expand/collapse the issue panel over the assets
  $('lintStatus').addEventListener('click', () => { const p = $('lintPanel'); p.classList.contains('on') ? closeLintPanel() : openLintPanel(); });
  $('lintClose').addEventListener('click', closeLintPanel);

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
  // hot-reload: save the latest edits and reload the running room in place
  $('playReload').addEventListener('click', async () => {
    const btn = $('playReload'), was = btn.textContent; btn.textContent = '↻ …';
    if (await save()) $('playIframe').src = playUrl();
    setTimeout(() => { btn.textContent = was; }, 600);
  });

  // ---------------- in-editor cutscene preview ----------------
  // Plays the cutscene live in the 3D viewport with a real player rig, so you can
  // watch the protagonist perform the animations without launching the whole game.
  let csBarEl = null, csBarLabel = null, csBarTime = null, csPlayBtn = null, csScrubTrack = null, csScrubHead = null, csScrubbing = false;
  function ensureCsBar() {
    if (csBarEl) return;
    csBarEl = el('div', {
      style: 'position:absolute;top:10px;left:50%;transform:translateX(-50%);z-index:23;display:none;' +
        'align-items:center;gap:10px;padding:7px 12px;background:rgba(8,12,14,0.86);border:1px solid #2a3a33;' +
        'border-radius:9px;color:#cfe7dc;font:600 12px system-ui;box-shadow:0 6px 22px rgba(0,0,0,0.5)'
    }, $('viewportWrap'));
    csBarLabel = el('span', {}, csBarEl, '▶ Preview');
    csPlayBtn = el('button', { class: 'tbtn', title: 'Play / pause (Space)', onclick: () => toggleCsPlay() }, csBarEl, '⏸');
    // scrub track — drag the playhead to seek anywhere in the cutscene
    csScrubTrack = el('div', { title: 'Drag to scrub', style: 'position:relative;width:280px;height:10px;background:#26303a;border-radius:5px;cursor:pointer' }, csBarEl);
    csScrubHead = el('div', { style: 'position:absolute;top:-3px;left:0;width:4px;height:16px;background:#ffd887;border-radius:2px;pointer-events:none;box-shadow:0 0 6px #ffd887' }, csScrubTrack);
    csScrubTrack.addEventListener('pointerdown', e => { e.preventDefault(); csScrubbing = true; csScrubTo(e.clientX); });
    csBarTime = el('span', { style: 'color:#7fdcb0;min-width:82px;font-variant-numeric:tabular-nums' }, csBarEl, '');
    el('button', { class: 'tbtn', title: 'Restart', onclick: () => replayCsPreview() }, csBarEl, '⟲');
    el('button', { class: 'tbtn', onclick: () => stopCsPreview() }, csBarEl, '✕ Stop (Esc)');
  }
  function csScrubTo(clientX) {
    if (!csPreview || !G.Cutscene.active || !csScrubTrack) return;
    const r = csScrubTrack.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    csPreview.scrub = true;
    if (csPlayBtn) csPlayBtn.textContent = '▶';
    G.Cutscene.debugSeek(frac * (G.Cutscene.active.total || 1));
  }
  function toggleCsPlay() {
    if (!csPreview) return;
    if (csPreview.done || !G.Cutscene.active) { runCsFromStart(); csPreview.scrub = false; }
    else csPreview.scrub = !csPreview.scrub;
    if (csPlayBtn) csPlayBtn.textContent = csPreview.scrub ? '▶' : '⏸';
  }
  // global scrub drag
  addEventListener('pointermove', e => { if (csScrubbing) csScrubTo(e.clientX); });
  addEventListener('pointerup', () => { csScrubbing = false; });
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
    cp.done = false; cp.scrub = false;
    if (csPlayBtn) csPlayBtn.textContent = '⏸';
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
    glCanvas.style.display = (tab === 'scene' || tab === 'models') ? 'block' : 'none';
    if (tab === 'cutscene') $('csView').classList.add('on');
  }

  // ================= LOGIC (event-graph) node editor =================
  const logicCanvas = $('logicCanvas'), lctx = logicCanvas.getContext('2d');
  const ETYPES = (G.EventGraph && G.EventGraph.TYPES) || {};
  const NODE_W = 152;
  let logicCam = { x: 0, y: 0, zoom: 1 }, logicSel = null, logicDrag = null, logicWire = null, logicPan = null;

  function graphOf() { const L = lvl(); if (!L) return null; if (!L.graph) L.graph = { nodes: [], links: [] }; return L.graph; }
  function nodeById(id) { const g = graphOf(); return g ? g.nodes.find(n => n.id === id) : null; }
  function nodeOuts(n) { const t = ETYPES[n.type] || {}; return t.outs || 0; }
  function nodeH(n) { const t = ETYPES[n.type] || {}; return 26 + Math.max(1, t.outs || 1) * 14 + ((t.params || []).length ? 14 : 4); }
  function kindCol(k) { return k === 'event' ? '#2f6e50' : k === 'cond' ? '#6e5c2f' : '#2f4d6e'; }
  function L2S(x, y) { return { x: (x - logicCam.x) * logicCam.zoom + logicCanvas.width / 2, y: (y - logicCam.y) * logicCam.zoom + logicCanvas.height / 2 }; }
  function S2L(x, y) { return { x: (x - logicCanvas.width / 2) / logicCam.zoom + logicCam.x, y: (y - logicCanvas.height / 2) / logicCam.zoom + logicCam.y }; }
  function inPin(n) { return L2S(n.x, n.y + 11); }
  function outPin(n, i) { return L2S(n.x + NODE_W, n.y + 26 + i * 14 + 7); }

  function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function wire(ctx, x0, y0, x1, y1, col) { ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0, y0); const dx = Math.max(30, Math.abs(x1 - x0) * 0.5); ctx.bezierCurveTo(x0 + dx, y0, x1 - dx, y1, x1, y1); ctx.stroke(); }
  function pinDot(ctx, x, y, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 5, 0, 6.2832); ctx.fill(); ctx.strokeStyle = '#0b0f12'; ctx.lineWidth = 1.5; ctx.stroke(); }

  function drawLogic() {
    const cv = logicCanvas, ctx = lctx, z = logicCam.zoom; const g = graphOf();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#0c1014'; ctx.fillRect(0, 0, cv.width, cv.height);
    const gs = 38 * z, ox = ((cv.width / 2 - logicCam.x * z) % gs + gs) % gs, oy = ((cv.height / 2 - logicCam.y * z) % gs + gs) % gs;
    ctx.strokeStyle = 'rgba(255,255,255,.035)'; ctx.lineWidth = 1;
    for (let x = ox; x < cv.width; x += gs) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, cv.height); ctx.stroke(); }
    for (let y = oy; y < cv.height; y += gs) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cv.width, y); ctx.stroke(); }
    if (!g) return;
    for (const l of g.links) { const a = nodeById(l.from), b = nodeById(l.to); if (!a || !b) continue; const p0 = outPin(a, l.fp | 0), p1 = inPin(b); wire(ctx, p0.x, p0.y, p1.x, p1.y, 'rgba(111,214,168,.85)'); }
    if (logicWire) { const a = nodeById(logicWire.from); if (a) { const p0 = outPin(a, logicWire.fp); wire(ctx, p0.x, p0.y, logicWire.mx, logicWire.my, '#cfe'); } }
    ctx.textBaseline = 'middle';
    for (const n of g.nodes) {
      const t = ETYPES[n.type] || {}, s = L2S(n.x, n.y), w = NODE_W * z, h = nodeH(n) * z, sel = logicSel === n.id;
      ctx.fillStyle = 'rgba(16,22,26,.97)'; rrect(ctx, s.x, s.y, w, h, 6 * z); ctx.fill();
      ctx.save(); rrect(ctx, s.x, s.y, w, 22 * z, 6 * z); ctx.clip(); ctx.fillStyle = kindCol(t.kind); ctx.fillRect(s.x, s.y, w, 22 * z); ctx.restore();
      ctx.fillStyle = '#eafffb'; ctx.font = (12 * z | 0) + 'px ui-monospace,Consolas,monospace'; ctx.textAlign = 'left';
      ctx.fillText(t.title || n.type, s.x + 7 * z, s.y + 11 * z);
      ctx.strokeStyle = sel ? '#9fe6c8' : 'rgba(120,180,160,.25)'; ctx.lineWidth = sel ? 2 : 1; rrect(ctx, s.x, s.y, w, h, 6 * z); ctx.stroke();
      if ((t.ins || 0) > 0) { const p = inPin(n); pinDot(ctx, p.x, p.y, '#bfe6ff'); }
      for (let i = 0; i < (t.outs || 0); i++) { const p = outPin(n, i); pinDot(ctx, p.x, p.y, '#6fd6a8'); if (t.outLabels) { ctx.fillStyle = '#9eccb8'; ctx.font = (9 * z | 0) + 'px ui-monospace'; ctx.textAlign = 'right'; ctx.fillText(t.outLabels[i], p.x - 8 * z, p.y); ctx.textAlign = 'left'; } }
      const sum = (t.params || []).map(pp => pp.k + '=' + ((n.p && n.p[pp.k] !== undefined) ? n.p[pp.k] : (pp.def !== undefined ? pp.def : ''))).join('  ');
      if (sum) { ctx.fillStyle = 'rgba(170,205,195,.75)'; ctx.font = (9 * z | 0) + 'px ui-monospace'; ctx.fillText(sum.slice(0, 26), s.x + 6 * z, s.y + 30 * z); }
    }
    ctx.fillStyle = 'rgba(160,200,180,.45)'; ctx.font = '12px ui-monospace,Consolas,monospace'; ctx.textAlign = 'left';
    ctx.fillText('left-drag node = move · drag output→input pin = wire · click input pin = disconnect · right-drag = pan · wheel = zoom · Del = delete', 12, cv.height - 12);
  }

  function pointAt(e) { const r = logicCanvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function addLogicNode(type, atScreen) {
    const g = graphOf(); if (!g || !ETYPES[type]) return;
    let mid = 0; for (const n of g.nodes) mid = Math.max(mid, n.id || 0);
    const c = atScreen ? S2L(atScreen.x, atScreen.y) : S2L(logicCanvas.width / 2, logicCanvas.height / 2);
    const p = {}; for (const pp of (ETYPES[type].params || [])) p[pp.k] = pp.def;
    g.nodes.push({ id: mid + 1, type, x: Math.round(c.x - NODE_W / 2), y: Math.round(c.y - 20), p });
    logicSel = mid + 1; markDirty(); refreshInspector();
  }
  function logicDeleteSelected() {
    const g = graphOf(); if (!g || logicSel == null) return;
    g.nodes = g.nodes.filter(n => n.id !== logicSel);
    g.links = g.links.filter(l => l.from !== logicSel && l.to !== logicSel);
    logicSel = null; markDirty(); refreshInspector();
  }
  function buildLogicPalette() {
    const pal = $('logicPalette'); pal.innerHTML = '';
    const groups = [['event', 'Events'], ['cond', 'Conditions'], ['action', 'Actions']];
    for (const [gk, glabel] of groups) {
      el('div', { class: 'plabel' }, pal, glabel);
      for (const tk in ETYPES) { if (ETYPES[tk].kind !== gk) continue; const btn = el('button', {}, pal, ETYPES[tk].title); btn.addEventListener('click', () => addLogicNode(tk)); }
    }
  }
  // dynamic option lists for graph 'select' fields
  function graphOpts(src) {
    if (src === 'sounds') return ((G.Audio && G.Audio.sfxNames) || []).map(s => ({ v: s, t: s }));
    if (src === 'cutscenes') return [{ v: '', t: '(none)' }].concat(Object.keys(G.CUTSCENES || {}).map(id => ({ v: id, t: (G.CUTSCENES[id].name || id) })));
    if (src === 'weather') return ((G.Weather && G.Weather.KINDS) || ['none']).map(k => ({ v: k, t: (G.Weather.LABELS && G.Weather.LABELS[k]) || k }));
    if (src === 'fx') return ((G.FX && G.FX.BURSTS) || []).map(f => ({ v: f, t: f }));
    if (src === 'placement') return [{ v: '', t: 'default (area title)' }, { v: 'top', t: 'top' }, { v: 'center', t: 'centre' }, { v: 'bottom', t: 'bottom' }, { v: 'toast', t: 'toast (corner)' }];
    if (src === 'bosses') {                  // every boss actually placed (bossTrigger) across the game
      const seen = new Map(), label = id => { const b2 = G.Bosses && G.Bosses.LIST.find(x => x.id === id); return b2 ? b2.label : id; };
      for (const lid in G.LEVELS) for (const p of (G.LEVELS[lid].props || [])) if (p.type === 'bossTrigger' && p.boss && !seen.has(p.boss)) seen.set(p.boss, label(p.boss) + '  ·  ' + (G.LEVELS[lid].title || lid));
      const out = [{ v: '', t: '(any boss)' }];
      for (const [v, t] of seen) out.push({ v, t });
      return out;
    }
    return [];
  }
  function collectFlags() {
    const set = new Set();
    for (const lid in G.LEVELS) { const g = G.LEVELS[lid].graph; if (!g) continue; for (const nn of (g.nodes || [])) { if (/Flag$/i.test(nn.type) && nn.p && nn.p.flag) set.add(nn.p.flag); } }
    return [...set];
  }
  // flag = a saved on/off switch the game remembers. combobox: existing flags + free text for a new one
  function flagField(body, label, getV, setV) {
    const r = el('div', { class: 'frow' }, body); el('label', {}, r, label);
    const inp = el('input', { type: 'text', list: 'flagList', spellcheck: 'false', style: 'flex:1;min-width:0' }, r);
    inp.value = getV() || '';
    inp.addEventListener('change', () => setV(inp.value.trim()));
    let dl = document.getElementById('flagList'); if (!dl) dl = el('datalist', { id: 'flagList' }, document.body);
    dl.innerHTML = ''; for (const f of collectFlags()) el('option', { value: f }, dl);
    el('div', { class: 'insNote', style: 'opacity:.5' }, body, 'A flag is a saved on/off switch (e.g. “door1_opened”). Pick one or type a new name to create it.');
  }
  function refreshLogicInspector(body) {
    const n = logicSel != null ? nodeById(logicSel) : null;
    if (!n) {
      const g = graphOf();
      el('div', { class: 'insNote' }, body, 'Event-graph logic for this room. Add nodes from the palette (top-left of the canvas); select a node to edit its fields.');
      if (g) el('div', { class: 'insNote', style: 'opacity:.6' }, body, g.nodes.length + ' nodes · ' + g.links.length + ' links');
      return;
    }
    const t = ETYPES[n.type] || {};
    el('div', { class: 'insNote' }, body, 'NODE — ' + (t.title || n.type));
    n.p = n.p || {};
    for (const pp of (t.params || [])) {
      const label = pp.label || pp.k, def = pp.def;
      if (pp.type === 'objref') idField(body, label, () => n.p[pp.k], v => { n.p[pp.k] = v; markDirty(); }, it => { n.p[pp.k] = it.oid; if ((t.params || []).some(q => q.k === 'level')) n.p.level = it.level; markDirty(); refreshInspector(); });
      else if (pp.type === 'levelref') selectField(body, label, [{ v: '', t: '(this room)' }].concat(Object.keys(G.LEVELS).map(id => ({ v: id, t: G.LEVELS[id].title || id }))), () => n.p[pp.k] || '', v => { n.p[pp.k] = v || ''; markDirty(); });
      else if (pp.type === 'select') selectField(body, label, graphOpts(pp.src), () => n.p[pp.k] !== undefined ? n.p[pp.k] : def, v => { n.p[pp.k] = v; markDirty(); });
      else if (pp.type === 'flag') flagField(body, label, () => n.p[pp.k] || '', v => { n.p[pp.k] = v; markDirty(); });
      else if (pp.type === 'bool') checkField(body, label, () => n.p[pp.k] !== undefined ? n.p[pp.k] : def, v => { n.p[pp.k] = v; markDirty(); });
      else if (pp.type === 'color') colorField(body, label, () => n.p[pp.k] || def, v => { n.p[pp.k] = v || def; markDirty(); });
      else if (typeof def === 'number') numField(body, label, () => n.p[pp.k] !== undefined ? n.p[pp.k] : def, v => { n.p[pp.k] = v; markDirty(); }, (pp.k === 'oid' || pp.k === 'pct') ? 1 : 0.1);
      else textField(body, label, () => n.p[pp.k] !== undefined ? n.p[pp.k] : def, v => { n.p[pp.k] = v; markDirty(); });
    }
    el('div', { class: 'insNote', style: 'opacity:.6' }, body, 'Del to delete · drag pins to (re)wire.');
  }

  logicCanvas.addEventListener('contextmenu', e => { if (tab === 'logic') e.preventDefault(); });
  logicCanvas.addEventListener('pointerdown', e => {
    if (tab !== 'logic') return;
    const m = pointAt(e), g = graphOf(); if (!g) return;
    const cap = () => { try { logicCanvas.setPointerCapture(e.pointerId); } catch (_) { } };
    // right / middle button (or space-less middle) drags to pan
    if (e.button === 1 || e.button === 2) { logicPan = { mx: m.x, my: m.y, cx: logicCam.x, cy: logicCam.y }; cap(); return; }
    if (e.button !== 0) return;
    for (const n of g.nodes) for (let i = 0; i < nodeOuts(n); i++) { const p = outPin(n, i); if (Math.hypot(p.x - m.x, p.y - m.y) < 11) { logicWire = { from: n.id, fp: i, mx: m.x, my: m.y }; cap(); return; } }
    for (const n of g.nodes) { const t = ETYPES[n.type] || {}; if ((t.ins || 0) > 0 && g.links.some(l => l.to === n.id)) { const p = inPin(n); if (Math.hypot(p.x - m.x, p.y - m.y) < 9) { g.links = g.links.filter(l => l.to !== n.id); markDirty(); return; } } }
    for (let k = g.nodes.length - 1; k >= 0; k--) { const n = g.nodes[k], s = L2S(n.x, n.y), w = NODE_W * logicCam.zoom, h = nodeH(n) * logicCam.zoom; if (m.x >= s.x && m.x <= s.x + w && m.y >= s.y && m.y <= s.y + h) { logicSel = n.id; const lp = S2L(m.x, m.y); logicDrag = { id: n.id, ox: lp.x - n.x, oy: lp.y - n.y }; cap(); refreshInspector(); return; } }
    logicSel = null; refreshInspector();    // empty left-click just deselects (pan = right/middle drag)
  });
  logicCanvas.addEventListener('pointermove', e => {
    if (tab !== 'logic') return; const m = pointAt(e);
    if (logicWire) { logicWire.mx = m.x; logicWire.my = m.y; }
    else if (logicDrag) { const lp = S2L(m.x, m.y), n = nodeById(logicDrag.id); if (n) { n.x = Math.round(lp.x - logicDrag.ox); n.y = Math.round(lp.y - logicDrag.oy); markDirty(); } }
    else if (logicPan) { logicCam.x = logicPan.cx - (m.x - logicPan.mx) / logicCam.zoom; logicCam.y = logicPan.cy - (m.y - logicPan.my) / logicCam.zoom; }
  });
  logicCanvas.addEventListener('pointerup', e => {
    if (tab !== 'logic') return; const m = pointAt(e);
    if (logicWire) { const g = graphOf(); for (const n of g.nodes) { const t = ETYPES[n.type] || {}; if ((t.ins || 0) > 0 && n.id !== logicWire.from) { const p = inPin(n); if (Math.hypot(p.x - m.x, p.y - m.y) < 14) { g.links = g.links.filter(l => !(l.from === logicWire.from && (l.fp | 0) === logicWire.fp && l.to === n.id)); g.links.push({ from: logicWire.from, fp: logicWire.fp, to: n.id, tp: 0 }); markDirty(); break; } } } }
    logicWire = null; logicDrag = null; logicPan = null;
  });
  logicCanvas.addEventListener('wheel', e => { if (tab !== 'logic') return; e.preventDefault(); logicCam.zoom = Math.max(0.4, Math.min(2.2, logicCam.zoom * (e.deltaY > 0 ? 0.9 : 1.1))); }, { passive: false });

  // ================= MODEL editor (build character / object models from primitives) =================
  let modelScene = null, modelCam = null, modelGroup = null, modelRig = null, modelMeshes = [];
  let modelDoc = { name: 'untitled', parts: [], clips: {}, shaded: false }, modelSel = -1;
  const modelOrbit = { theta: 0, phi: 1.5, radius: 7, tx: 0, ty: 1, tz: 0 };   // front-view default
  let modelDrag = null, modelOrbiting = null, modelPan = null;
  let modelClip = '', modelTime = 0, modelPlaying = false;
  const _ray = new THREE.Raycaster(), _ndc = new THREE.Vector2();
  const PART_COLORS = ['#c9cdd6', '#7a8aa0', '#c08a5a', '#9a5a5a', '#5a8a6a', '#caa24a', '#7a5a8a', '#2e3540'];

  function ensureModelScene() {
    if (modelScene) return;
    modelScene = new THREE.Scene(); modelScene.background = new THREE.Color(0x0e141a);
    modelCam = new THREE.PerspectiveCamera(42, 1.6, 0.05, 200);
    G.Models.ensureLight(modelScene);
    const grid = new THREE.GridHelper(12, 12, 0x2a3a44, 0x18242c); modelScene.add(grid);
    const ax = new THREE.AxesHelper(1.4); ax.position.y = 0.002; modelScene.add(ax);
    modelGroup = new THREE.Group(); modelScene.add(modelGroup);
  }
  function rebuildModelMeshes() {
    ensureModelScene();
    while (modelGroup.children.length) modelGroup.remove(modelGroup.children[0]);
    modelRig = G.Models.buildRig(modelDoc);   // bones start at the doc/working pose so inspector edits preview live
    modelGroup.add(modelRig.group);
    modelMeshes = Object.values(modelRig.meshes);
    highlightModelSel();
  }
  // pull the keyed pose at time t into the working doc (so the playhead pose is editable & visible)
  function syncPoseFromClip(t) {
    if (!modelClip) return;
    const pose = G.Models.clipPose(modelDoc, modelClip, t);
    for (const p of modelDoc.parts) { const v = pose[p.id]; if (v) { p.rx = +(+v.rx).toFixed(1); p.ry = +(+v.ry).toFixed(1); p.rz = +(+v.rz).toFixed(1); } }
  }
  let modelSelBox = null;
  function selMesh() { const p = modelDoc.parts[modelSel]; return p && modelRig ? modelRig.meshes[p.id] : null; }
  function highlightModelSel() {
    if (!modelScene) return;
    if (!modelSelBox) { modelSelBox = new THREE.BoxHelper(new THREE.Object3D(), 0x6fe6b0); modelSelBox.material.depthTest = false; modelScene.add(modelSelBox); }
    const m = selMesh();
    if (m) { m.updateWorldMatrix(true, false); modelSelBox.visible = true; modelSelBox.setFromObject(m); } else modelSelBox.visible = false;
  }
  function updateModelCam() {
    const o = modelOrbit, sp = Math.sin(o.phi), cp = Math.cos(o.phi);
    modelCam.position.set(o.tx + o.radius * sp * Math.sin(o.theta), o.ty + o.radius * cp, o.tz + o.radius * sp * Math.cos(o.theta));
    modelCam.lookAt(o.tx, o.ty, o.tz);
    modelCam.aspect = (G.viewW || 1) / (G.viewH || 1); modelCam.updateProjectionMatrix();
  }
  let _mLast = 0;
  function drawModels() {
    ensureModelScene();
    const now = performance.now(), dt = _mLast ? Math.min(0.05, (now - _mLast) / 1000) : 0.016; _mLast = now;
    if (modelPlaying && modelClip && modelDoc.clips[modelClip]) { modelTime += dt; refreshClipScrub(); applyClipPose(); }
    if (modelSelBox && modelSelBox.visible) { const m = selMesh(); if (m) modelSelBox.setFromObject(m); }
    updateModelCam(); renderer.render(modelScene, modelCam);
  }
  function newPartId() { let mx = 0; for (const p of modelDoc.parts) if (typeof p.id === 'number' && p.id > mx) mx = p.id; return mx + 1; }

  function modelAdd(shape) {
    const c = PART_COLORS[modelDoc.parts.length % PART_COLORS.length];
    let mx = 0; for (const p of modelDoc.parts) if (typeof p.id === 'number' && p.id > mx) mx = p.id;
    modelDoc.parts.push({ id: mx + 1, shape, parent: null, x: 0, y: 1, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1, ox: 0, oy: 0, oz: 0, color: c, name: shape });
    modelSel = modelDoc.parts.length - 1; rebuildModelMeshes(); refreshModelPanel(); refreshInspector();
  }
  function isDescendant(id, ofId) { let p = modelDoc.parts.find(q => q.id === id); let g = 0; while (p && p.parent != null && g++ < 99) { if (p.parent === ofId) return true; p = modelDoc.parts.find(q => q.id === p.parent); } return false; }
  function modelDeletePart(i) { const id = modelDoc.parts[i].id; modelDoc.parts.splice(i, 1); for (const q of modelDoc.parts) if (q.parent === id) q.parent = null; if (modelSel >= modelDoc.parts.length) modelSel = modelDoc.parts.length - 1; rebuildModelMeshes(); refreshModelPanel(); refreshInspector(); }
  function modelDupPart(i) { const p = JSON.parse(JSON.stringify(modelDoc.parts[i])); p.id = newPartId(); p.x += 0.4; modelDoc.parts.splice(i + 1, 0, p); modelSel = i + 1; rebuildModelMeshes(); refreshModelPanel(); refreshInspector(); }
  function modelMirrorPart(i) { const p = JSON.parse(JSON.stringify(modelDoc.parts[i])); p.id = newPartId(); p.x = -p.x; p.ox = -(p.ox || 0); p.ry = -p.ry; p.rz = -p.rz; p.name = (p.name || p.shape) + ' (mirror)'; modelDoc.parts.push(p); modelSel = modelDoc.parts.length - 1; rebuildModelMeshes(); refreshModelPanel(); refreshInspector(); }

  // ---- humanoid auto-rig: guess a skeleton from part layout, set pivots, generate idle + walk ----
  function autoRigHumanoid() {
    const parts = modelDoc.parts;
    if (parts.length < 3) { alert('Add at least a torso, head and a couple of limbs first, then auto-rig.'); return; }
    // 1) flatten to model space (read each part's current world joint position, drop parenting/rotation)
    rebuildModelMeshes();
    const MP = {};
    for (const p of parts) {
      const b = modelRig.bones[p.id];
      if (b) { b.updateWorldMatrix(true, false); const v = new THREE.Vector3().setFromMatrixPosition(b.matrixWorld); MP[p.id] = { x: v.x, y: v.y, z: v.z }; }
      else MP[p.id] = { x: p.x || 0, y: p.y || 0, z: p.z || 0 };
      p.parent = null; p.rx = 0; p.ry = 0; p.rz = 0; p.ox = 0; p.oy = 0; p.oz = 0;
    }
    const halfH = p => Math.max(0.05, (p.sy || 1) * 0.5);
    const vol = p => (p.sx || 1) * (p.sy || 1) * (p.sz || 1);
    // 2) torso = biggest part; classify the rest by position relative to it
    let torso = parts.reduce((a, b) => vol(b) > vol(a) ? b : a, parts[0]);
    const tx = MP[torso.id].x, ty = MP[torso.id].y, halfW = Math.max(0.25, (torso.sx || 1) * 0.5);
    const role = { [torso.id]: 'torso' };
    const arms = { L: [], R: [] }, legs = { L: [], R: [] }; let head = null;
    for (const p of parts) {
      if (p === torso) continue;
      const dx = MP[p.id].x - tx, dy = MP[p.id].y - ty, side = dx < 0 ? 'L' : 'R';
      if (dy > 0 && Math.abs(dx) < halfW * 0.9) { if (!head || MP[p.id].y > MP[head.id].y) head = p; }
      else if (dy >= -halfW * 0.4 && Math.abs(dx) >= halfW * 0.4) arms[side].push(p);
      else if (dy < 0) legs[side].push(p);
      else role[p.id] = 'torso-child';      // unclassified → hangs off the torso
    }
    if (head) role[head.id] = 'head';
    // 3) parent chains (closest-to-torso segment first), with pivots at the joint (top of each limb)
    const bonePos = {};
    bonePos[torso.id] = { x: tx, y: ty, z: MP[torso.id].z };
    if (head) bonePos[head.id] = { ...MP[head.id] };
    const chain = (group, roleName) => {
      group.sort((a, b) => MP[b.id].y - MP[a.id].y);   // top (shoulder/hip) first
      group.forEach((p, i) => {
        role[p.id] = roleName;
        p.parent = i === 0 ? torso.id : group[i - 1].id;
        bonePos[p.id] = { x: MP[p.id].x, y: MP[p.id].y + halfH(p), z: MP[p.id].z };  // joint at the top
        p.oy = -halfH(p);                              // mesh hangs below the joint
      });
    };
    chain(arms.L, 'armL'); chain(arms.R, 'armR'); chain(legs.L, 'legL'); chain(legs.R, 'legR');
    if (head) head.parent = torso.id;
    for (const p of parts) if (role[p.id] === 'torso-child') { p.parent = torso.id; bonePos[p.id] = { ...MP[p.id] }; }
    // 4) convert every bone position to parent-local
    for (const p of parts) {
      const bp = bonePos[p.id] || MP[p.id];
      const par = p.parent != null ? bonePos[p.parent] : null;
      p.x = +(bp.x - (par ? par.x : 0)).toFixed(3);
      p.y = +(bp.y - (par ? par.y : 0)).toFixed(3);
      p.z = +(bp.z - (par ? par.z : 0)).toFixed(3);
    }
    // 5) generate clips by role
    const idTrack = (pred, keys) => { const t = {}; for (const p of parts) if (pred(role[p.id])) t[p.id] = keys.map(k => ({ t: k.t, rx: k.rx || 0, ry: k.ry || 0, rz: k.rz || 0 })); return t; };
    const merge = (...objs) => Object.assign({}, ...objs);
    modelDoc.clips = modelDoc.clips || {};
    modelDoc.clips.walk = { dur: 0.8, loop: true, tracks: merge(
      idTrack(r => r === 'legL', [{ t: 0, rx: 24 }, { t: 0.4, rx: -24 }, { t: 0.8, rx: 24 }]),
      idTrack(r => r === 'legR', [{ t: 0, rx: -24 }, { t: 0.4, rx: 24 }, { t: 0.8, rx: -24 }]),
      idTrack(r => r === 'armL', [{ t: 0, rx: -18 }, { t: 0.4, rx: 18 }, { t: 0.8, rx: -18 }]),
      idTrack(r => r === 'armR', [{ t: 0, rx: 18 }, { t: 0.4, rx: -18 }, { t: 0.8, rx: 18 }]),
      idTrack(r => r === 'torso', [{ t: 0, rz: 2 }, { t: 0.4, rz: -2 }, { t: 0.8, rz: 2 }])
    ) };
    modelDoc.clips.idle = { dur: 2.6, loop: true, tracks: merge(
      idTrack(r => r === 'armL' || r === 'armR', [{ t: 0, rz: 4 }, { t: 1.3, rz: -4 }, { t: 2.6, rz: 4 }]),
      idTrack(r => r === 'torso', [{ t: 0, rx: 0 }, { t: 1.3, rx: 3 }, { t: 2.6, rx: 0 }]),
      idTrack(r => r === 'head', [{ t: 0, ry: -4 }, { t: 1.3, ry: 4 }, { t: 2.6, ry: -4 }])
    ) };
    modelClip = 'walk'; modelTime = 0; modelPlaying = true;
    markDirty();
    rebuildModelMeshes(); refreshModelPanel(); refreshInspector();
    const n = arms.L.length + arms.R.length, l = legs.L.length + legs.R.length;
    $('viewportHint') && ($('viewportHint').textContent = `Auto-rigged: torso + ${head ? 'head, ' : ''}${n} arm part(s), ${l} leg part(s). Idle & Walk clips generated — tweak as needed.`);
  }

  function newModel() { modelDoc = { name: uniqueModelName('model'), parts: [], clips: {}, shaded: false }; modelSel = -1; modelClip = ''; modelPlaying = false; modelTime = 0; rebuildModelMeshes(); refreshModelPanel(); refreshInspector(); }
  function uniqueModelName(base) { let n = base, i = 2; while (G.Models.get(n)) n = base + i++; return n; }
  function saveModel() { if (!modelDoc.name) modelDoc.name = uniqueModelName('model'); G.Models.save(modelDoc.name, modelDoc); refreshModelPanel(); }
  function loadModel(name) { const m = G.Models.get(name); if (!m) return; modelDoc = JSON.parse(JSON.stringify(m)); modelDoc.name = name; modelDoc.clips = modelDoc.clips || {}; modelSel = -1; modelClip = ''; modelPlaying = false; modelTime = 0; rebuildModelMeshes(); refreshModelPanel(); refreshInspector(); }
  function applyClipPose() { if (modelRig && modelClip && modelDoc.clips[modelClip]) G.Models.applyClip(modelDoc, modelRig.bones, modelClip, modelTime); }
  function clipDur() { const c = modelDoc.clips[modelClip]; return c ? (c.dur || 1) : 1; }
  // animation authoring: snapshot every part's current rest rotation into the clip at modelTime
  function addClipKey() {
    if (!modelClip) return; const clip = modelDoc.clips[modelClip]; clip.tracks = clip.tracks || {};
    const t = +Math.min(modelTime, clip.dur || 1).toFixed(3);
    for (const p of modelDoc.parts) {
      const tr = clip.tracks[p.id] = clip.tracks[p.id] || [];
      let k = tr.find(x => Math.abs(x.t - t) < 0.001);
      if (!k) { k = { t }; tr.push(k); tr.sort((a, b) => a.t - b.t); }
      k.rx = p.rx || 0; k.ry = p.ry || 0; k.rz = p.rz || 0;
    }
    markDirty(); refreshModelPanel();
  }
  function clipKeyTimes() { const c = modelDoc.clips[modelClip]; if (!c || !c.tracks) return []; const s = new Set(); for (const id in c.tracks) for (const k of c.tracks[id]) s.add(+k.t.toFixed(3)); return [...s].sort((a, b) => a - b); }
  function refreshClipScrub() { const sl = document.getElementById('mScrub'); if (sl && modelClip) { const d = clipDur(); sl.value = ((modelTime % d) / d * 1000) | 0; } }

  function partDepth(p) { let d = 0, q = p, g = 0; while (q && q.parent != null && g++ < 99) { d++; q = modelDoc.parts.find(x => x.id === q.parent); } return d; }
  function refreshModelPanel() {
    const box = $('modelPanel'); if (!box) return; box.innerHTML = '';
    el('div', { class: 'mlabel' }, box, 'MODEL');
    const nameRow = el('div', { class: 'mrow' }, box);
    const nin = el('input', { type: 'text', value: modelDoc.name, style: 'flex:1;min-width:0' }, nameRow);
    nin.addEventListener('change', () => { modelDoc.name = nin.value.trim() || 'model'; });
    const libRow = el('div', { class: 'mrow' }, box);
    const sel = el('select', { style: 'flex:1;min-width:0' }, libRow);
    el('option', { value: '' }, sel, '— load saved —');
    for (const n of G.Models.list()) el('option', { value: n }, sel, n);
    sel.addEventListener('change', () => { if (sel.value) loadModel(sel.value); });
    const ctl = el('div', { class: 'mrow' }, box);
    el('button', {}, ctl, '＋ New').addEventListener('click', newModel);
    el('button', {}, ctl, '💾 Save').addEventListener('click', saveModel);
    el('button', { class: 'danger' }, ctl, '🗑 Delete').addEventListener('click', () => { if (G.Models.get(modelDoc.name) && confirm('Delete saved model “' + modelDoc.name + '”?')) { G.Models.remove(modelDoc.name); refreshModelPanel(); } });
    // shading mode
    const shRow = el('div', { class: 'mrow' }, box);
    const flatB = el('button', {}, shRow, 'Flat'); const shB = el('button', {}, shRow, 'Shaded');
    (modelDoc.shaded ? shB : flatB).style.background = '#1d3a30';
    flatB.addEventListener('click', () => { modelDoc.shaded = false; rebuildModelMeshes(); refreshModelPanel(); });
    shB.addEventListener('click', () => { modelDoc.shaded = true; rebuildModelMeshes(); refreshModelPanel(); });
    el('div', { class: 'mlabel' }, box, 'ADD PART');
    const grid = el('div', { class: 'mrow' }, box);
    for (const s of G.Models.SHAPES) el('button', { title: 'Add ' + s }, grid, s).addEventListener('click', () => modelAdd(s));
    el('div', { class: 'mlabel' }, box, 'PARTS (' + modelDoc.parts.length + ')');
    const list = el('div', { class: 'mparts' }, box);
    modelDoc.parts.forEach((p, i) => {
      const row = el('div', { class: 'mpart' + (i === modelSel ? ' sel' : '') }, list);
      row.style.paddingLeft = (6 + partDepth(p) * 12) + 'px';
      const sw = el('div', { class: 'mswatch' }, row); sw.style.background = p.color || '#ccc';
      el('div', { style: 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis' }, row, (p.name || p.shape));
      row.addEventListener('click', () => { modelSel = i; highlightModelSel(); refreshModelPanel(); refreshInspector(); });
    });
    // ---- auto-rig ----
    const arRow = el('div', { class: 'mrow' }, box);
    el('button', { title: 'Guess a humanoid skeleton (torso/head/arms/legs), set pivots, and generate idle + walk clips' }, arRow, '🦴 Auto-rig (humanoid)')
      .addEventListener('click', autoRigHumanoid);
    // ---- animation ----
    el('div', { class: 'mlabel' }, box, 'ANIMATION');
    const clipRow = el('div', { class: 'mrow' }, box);
    const csel = el('select', { style: 'flex:1;min-width:0' }, clipRow);
    el('option', { value: '' }, csel, '— rest pose —');
    for (const cn in (modelDoc.clips || {})) el('option', { value: cn }, csel, cn);
    csel.value = modelClip; csel.addEventListener('change', () => { modelClip = csel.value; modelPlaying = false; modelTime = 0; syncPoseFromClip(0); rebuildModelMeshes(); refreshModelPanel(); refreshInspector(); });
    el('button', { title: 'New clip' }, clipRow, '＋').addEventListener('click', () => { const n = prompt('Clip name', 'idle'); if (!n) return; modelDoc.clips = modelDoc.clips || {}; modelDoc.clips[n] = modelDoc.clips[n] || { dur: 1, loop: true, tracks: {} }; modelClip = n; modelTime = 0; markDirty(); refreshModelPanel(); refreshInspector(); });
    if (modelClip && modelDoc.clips[modelClip]) {
      const clip = modelDoc.clips[modelClip];
      const dRow = el('div', { class: 'mrow' }, box); el('label', { style: 'color:#9bbcb0;font-size:10px;align-self:center' }, dRow, 'dur'); const din = el('input', { type: 'number', step: 0.1, value: clip.dur || 1, style: 'width:48px' }, dRow); din.addEventListener('change', () => { clip.dur = Math.max(0.1, parseFloat(din.value) || 1); markDirty(); });
      const lk = el('label', { style: 'color:#9bbcb0;font-size:10px;align-self:center;display:flex;gap:3px' }, dRow); const lc = el('input', { type: 'checkbox' }, lk); lc.checked = clip.loop !== false; lk.append('loop'); lc.addEventListener('change', () => { clip.loop = lc.checked; markDirty(); });
      const pRow = el('div', { class: 'mrow' }, box);
      el('button', {}, pRow, modelPlaying ? '⏸ Stop' : '▶ Play').addEventListener('click', () => { modelPlaying = !modelPlaying; if (!modelPlaying) { syncPoseFromClip(modelTime); rebuildModelMeshes(); } refreshModelPanel(); });
      el('button', { title: 'Snapshot the current pose as a keyframe at the scrub time' }, pRow, '◉ Add Key').addEventListener('click', addClipKey);
      el('button', { class: 'danger', title: 'Delete clip' }, pRow, '🗑').addEventListener('click', () => { if (confirm('Delete clip “' + modelClip + '”?')) { delete modelDoc.clips[modelClip]; modelClip = ''; modelPlaying = false; rebuildModelMeshes(); markDirty(); refreshModelPanel(); refreshInspector(); } });
      const scr = el('input', { type: 'range', id: 'mScrub', min: 0, max: 1000, value: 0, style: 'width:100%' }, box);
      scr.addEventListener('input', () => { modelPlaying = false; modelTime = (scr.value / 1000) * (clip.dur || 1); syncPoseFromClip(modelTime); rebuildModelMeshes(); refreshInspector(); });
      const kt = clipKeyTimes(); if (kt.length) el('div', { style: 'color:#86a89c;font-size:10px;margin-top:2px' }, box, 'keys: ' + kt.map(t => t.toFixed(2)).join('  '));
      el('div', { class: 'insNote', style: 'opacity:.5;font-size:10px' }, box, 'Pose the parts (rotation), then Add Key at a few scrub times → Play.');
    }
  }
  function refreshModelInspector(body) {
    const p = modelSel >= 0 ? modelDoc.parts[modelSel] : null;
    if (!p) { el('div', { class: 'insNote' }, body, 'Model editor — add primitive parts from the panel (top-left), then select one to shape it. Left-drag a part to move it; drag empty space to orbit; wheel to zoom; right-drag to pan. Build it facing you (front view) — that’s how it appears in-game.'); return; }
    el('div', { class: 'insNote' }, body, 'PART — ' + (p.shape) + (modelClip ? '   ·   clip “' + modelClip + '”: pose & Add Key' : ''));
    textField(body, 'Name', () => p.name || p.shape, v => { p.name = v; refreshModelPanel(); });
    selectField(body, 'Shape', G.Models.SHAPES.map(s => ({ v: s, t: s })), () => p.shape, v => { p.shape = v; rebuildModelMeshes(); refreshModelPanel(); });
    const popts = [{ v: '', t: '(root)' }];
    for (const q of modelDoc.parts) if (q.id !== p.id && !isDescendant(q.id, p.id)) popts.push({ v: String(q.id), t: (q.name || q.shape) });
    selectField(body, 'Parent', popts, () => p.parent != null ? String(p.parent) : '', v => { p.parent = v === '' ? null : parseInt(v); rebuildModelMeshes(); refreshModelPanel(); });
    const v3 = (lbl, kx, ky, kz, step) => { el('div', { class: 'mlabel', style: 'color:#7fb39c;margin-top:6px' }, body, lbl);
      numField(body, 'X', () => p[kx] || 0, v => { p[kx] = v; rebuildModelMeshes(); }, step);
      numField(body, 'Y', () => p[ky] || 0, v => { p[ky] = v; rebuildModelMeshes(); }, step);
      numField(body, 'Z', () => p[kz] || 0, v => { p[kz] = v; rebuildModelMeshes(); }, step); };
    v3('Position / joint', 'x', 'y', 'z', 0.1);
    v3('Rotation°  (pose this)', 'rx', 'ry', 'rz', 5);
    v3('Pivot offset (mesh)', 'ox', 'oy', 'oz', 0.1);
    v3('Scale', 'sx', 'sy', 'sz', 0.1);
    colorField(body, 'Colour', () => p.color || '#c8c8c8', v => { p.color = v || '#c8c8c8'; rebuildModelMeshes(); refreshModelPanel(); });
    const btns = el('div', { class: 'frow', style: 'margin-top:10px;gap:5px' }, body);
    el('button', { class: 'tbtn' }, btns, 'Duplicate').addEventListener('click', () => modelDupPart(modelSel));
    el('button', { class: 'tbtn' }, btns, 'Mirror X').addEventListener('click', () => modelMirrorPart(modelSel));
    el('button', { class: 'tbtn dangerBtn' }, btns, 'Delete').addEventListener('click', () => modelDeletePart(modelSel));
  }

  // ---- model viewport interaction (on the gl canvas while the Models tab is active) ----
  function modelPick(mx, my) {
    const r = glCanvas.getBoundingClientRect();
    _ndc.set((mx / r.width) * 2 - 1, -(my / r.height) * 2 + 1);
    _ray.setFromCamera(_ndc, modelCam);
    const hits = _ray.intersectObjects(modelMeshes, false);
    if (!hits.length) return -1;
    const pid = hits[0].object.userData.partId;       // map mesh -> part index by stable id
    return modelDoc.parts.findIndex(p => p.id === pid);
  }
  // world-space position of a part's bone (parts may be nested under a parent)
  function bonePos(p) {
    const b = modelRig && modelRig.bones[p.id];
    if (b) { b.updateWorldMatrix(true, false); return new THREE.Vector3().setFromMatrixPosition(b.matrixWorld); }
    return new THREE.Vector3(p.x || 0, p.y || 0, p.z || 0);
  }
  function modelPlaneHit(mx, my, point) {
    const r = glCanvas.getBoundingClientRect();
    _ndc.set((mx / r.width) * 2 - 1, -(my / r.height) * 2 + 1);
    _ray.setFromCamera(_ndc, modelCam);
    const nrm = new THREE.Vector3(); modelCam.getWorldDirection(nrm);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(nrm, point);
    const hit = new THREE.Vector3();
    return _ray.ray.intersectPlane(plane, hit) ? hit : null;
  }
  glCanvas.addEventListener('pointerdown', e => {
    if (tab !== 'models') return;
    const r = glCanvas.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    try { glCanvas.setPointerCapture(e.pointerId); } catch (_) { }
    if (e.button === 1 || e.button === 2) { modelPan = { mx, my, tx: modelOrbit.tx, ty: modelOrbit.ty, tz: modelOrbit.tz }; return; }
    const i = modelPick(mx, my);
    if (i >= 0) {
      modelSel = i; highlightModelSel(); refreshModelPanel(); refreshInspector();
      const p = modelDoc.parts[i], pos = bonePos(p), hit = modelPlaneHit(mx, my, pos);
      modelDrag = { i, off: hit ? pos.clone().sub(hit) : new THREE.Vector3(), moved: false };
    } else { modelOrbiting = { mx, my, theta: modelOrbit.theta, phi: modelOrbit.phi }; }
  });
  glCanvas.addEventListener('pointermove', e => {
    if (tab !== 'models') return;
    const r = glCanvas.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    if (modelDrag) {
      const p = modelDoc.parts[modelDrag.i], hit = modelPlaneHit(mx, my, bonePos(p));
      if (hit) {
        const world = hit.add(modelDrag.off);                       // desired world position of the bone
        const par = (p.parent != null && modelRig.bones[p.parent]) ? modelRig.bones[p.parent] : modelRig.group;
        par.updateWorldMatrix(true, false);
        const local = par.worldToLocal(world.clone());              // -> coords in the parent's frame
        p.x = +local.x.toFixed(2); p.y = +local.y.toFixed(2); p.z = +local.z.toFixed(2);
        modelDrag.moved = true;
        const b = modelRig.bones[p.id]; if (b) { b.position.set(p.x, p.y, p.z); if (b.userData.base) { b.userData.base.x = p.x; b.userData.base.y = p.y; b.userData.base.z = p.z; } }
        if (modelSelBox) modelSelBox.update();
        refreshInspectorThrottled();
      }
    } else if (modelOrbiting) {
      modelOrbit.theta = modelOrbiting.theta - (mx - modelOrbiting.mx) * 0.01;
      modelOrbit.phi = Math.max(0.12, Math.min(3.0, modelOrbiting.phi - (my - modelOrbiting.my) * 0.01));
    } else if (modelPan) {
      const k = modelOrbit.radius * 0.0016;
      const right = new THREE.Vector3(Math.cos(modelOrbit.theta), 0, -Math.sin(modelOrbit.theta));
      modelOrbit.tx = modelPan.tx - (mx - modelPan.mx) * k * right.x;
      modelOrbit.tz = modelPan.tz - (mx - modelPan.mx) * k * right.z;
      modelOrbit.ty = modelPan.ty + (my - modelPan.my) * k;
    }
  });
  glCanvas.addEventListener('pointerup', e => { if (tab !== 'models') return; modelDrag = null; modelOrbiting = null; modelPan = null; });
  glCanvas.addEventListener('contextmenu', e => { if (tab === 'models') e.preventDefault(); });
  glCanvas.addEventListener('wheel', e => { if (tab !== 'models') return; e.preventDefault(); modelOrbit.radius = Math.max(1.2, Math.min(40, modelOrbit.radius * (e.deltaY > 0 ? 1.1 : 0.9))); }, { passive: false });
  let _insThrottle = 0;
  function refreshInspectorThrottled() { const now = performance.now(); if (now - _insThrottle > 120) { _insThrottle = now; refreshInspector(); } }

  // ---------------- keyboard ----------------
  addEventListener('keydown', e => {
    if (csPreview) { if (e.code === 'Escape') stopCsPreview(); else if (e.code === 'KeyR') replayCsPreview(); else if (e.code === 'Space') { e.preventDefault(); toggleCsPlay(); } return; }
    if ($('playFrame').classList.contains('on')) { if (e.code === 'Escape') closePlay(); return; }
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (e.ctrlKey && e.code === 'KeyS') { e.preventDefault(); save(); return; }
    if (typing) return;
    if (tab === 'logic') { if (e.code === 'Delete' || e.code === 'Backspace') { e.preventDefault(); logicDeleteSelected(); } return; }
    if (tab === 'models') { if ((e.code === 'Delete' || e.code === 'Backspace') && modelSel >= 0) { e.preventDefault(); modelDeletePart(modelSel); } else if (e.code === 'KeyD' && e.ctrlKey && modelSel >= 0) { e.preventDefault(); modelDupPart(modelSel); } return; }
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
    // [ / ] rotate the selected object(s) by 15° (Shift = fine 1°); about the screen-facing axis
    if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
      const refs = selAll().map(s => s.kind === 'prop' ? lvl().props[s.i] : s.kind === 'enemy' ? lvl().enemies[s.i] : null).filter(r => r && r.x !== undefined);
      if (refs.length) {
        const d = (e.code === 'BracketRight' ? 1 : -1) * (e.shiftKey ? 1 : 15) * Math.PI / 180;
        pushUndo();
        refs.forEach(r => { const nr = (r.rot || 0) + d; if (Math.abs(nr) < 1e-4) delete r.rot; else r.rot = +nr.toFixed(4); });
        queueRebuild(); refreshInspector();
      }
      return;
    }
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
    if (G.Weather) G.Weather.update(dt);   // animate the live weather preview

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
      if (G.Cutscene.active) {
        if (!csPreview.scrub) G.Cutscene.update(dt);     // scrubbing holds the frame
        csPreview.lastCam = { x: G.Cutscene.active.cam.x, y: G.Cutscene.active.cam.y, z: G.Cutscene.active.cam.z };
      }
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
      if (csScrubHead && cur) csScrubHead.style.left = ((cur.time / (cur.total || 1)) * 100) + '%';
      if (csBarTime) csBarTime.textContent = cur ? cur.time.toFixed(1) + ' / ' + cur.total.toFixed(1) + 's' : 'done — ⟲ to replay';
      if (cur && csPreview.done && csPlayBtn && csPlayBtn.textContent !== '▶') csPlayBtn.textContent = '▶';
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
    } else if (tab === 'logic') {
      drawLogic();
    } else if (tab === 'models') {
      drawModels();
    }
    // tab === 'cutscene' renders nothing in 3D — the #csView DOM covers the viewport
    if (G.Profiler) G.Profiler.tick();
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
    nestPrefab: (parent, child, dx, dy) => nestPrefab(parent, child, dx, dy), stampPrefab: (n, x, y) => stampPrefab(n, x, y),
    savePrefabAs: (n) => savePrefab(n), playUrl: () => playUrl(),
    // prefab library store for the Prefab 2.0 manager: mutate get(), then persist() to save + refresh the asset browser
    prefabsAPI: { get: () => prefabs, persist: () => { try { localStorage.setItem('mossveil-ed-prefabs', JSON.stringify(prefabs)); } catch (e) { } refreshAssets(); } },
    openLevel: id => openLevel(id), currentId: () => currentId, validateWorld: () => validateWorld(), setTab: t => setTab(t),
    pickAt: (x, y) => pickAt(x, y),
    retileAll: () => retileWholeLevel(),
    logicAdd: (type) => addLogicNode(type), logicSelect: (id) => { logicSel = id; refreshInspector(); },
    logicLink: (from, fp, to) => { const g = graphOf(); g.links.push({ from, fp: fp | 0, to, tp: 0 }); markDirty(); },
    logicGraph: () => graphOf(), logicDelete: () => logicDeleteSelected(),
    csSelect: (id, idx) => { csMode = true; csCurrent = id; csSel = idx; refreshCsTab(); refreshInspector(); },
    modelAdd: s => modelAdd(s), modelDoc: () => modelDoc, modelSave: () => saveModel(), modelSetSel: i => { modelSel = i; },
    modelRebuild: () => rebuildModelMeshes(), modelRig: () => modelRig, modelSetClip: c => { modelClip = c; },
    modelSyncPose: t => { modelTime = t; syncPoseFromClip(t); rebuildModelMeshes(); },
    modelAutoRig: () => autoRigHumanoid(),
    // ---- shared hooks for the authoring-tools framework (tools-core.js) ----
    isDirty: () => dirty || csDirty,
    save: () => save(),
    serverPresent: () => serverPresent,
    effectiveMode: () => effectiveMode(),
    ghConfig: () => ghConfig(),
    setSaveStatus: (m, ms) => setSaveStatus(m, ms),
    // commit one authoring-tool dataset (data/<name>.json + .js mirror) straight to GitHub
    commitData: (name, global, obj) => githubCommit(
      [{ path: 'data/' + name + '.json', content: jsonText(obj) },
       { path: 'data/' + name + '.js', content: mirrorJs(name, global, obj) }],
      'Edit ' + name + ' dataset via MOSSVEIL editor'),
    // mark the world dirty + refresh panels (used by in-place authoring tools, e.g. the dialogue graph)
    markDirty: () => markDirty(),
    refreshInspector: () => refreshInspector(),
    selectedItem: () => selectedItem(),
    selectProp: (id, i) => { if (id && id !== currentId && G.LEVELS[id]) openLevel(id); sel = { kind: 'prop', i }; multi = []; refreshHierarchy(); refreshInspector(); },
    // full-world snapshot / restore for autosave + crash recovery
    snapshot: () => ({ levels: G.LEVELS, cutscenes: G.CUTSCENES || {}, id: currentId, ts: Date.now() }),
    loadWorld: (levels, cutscenes, id) => {
      if (levels && typeof levels === 'object') G.LEVELS = levels;
      if (cutscenes && typeof cutscenes === 'object') G.CUTSCENES = cutscenes;
      const target = (id && G.LEVELS[id]) ? id : (currentId && G.LEVELS[currentId]) ? currentId : Object.keys(G.LEVELS)[0];
      markDirty(); openLevel(target);
    },
    // core editor actions the command palette / keybinds can invoke
    actions: () => [
      { id: 'save', label: 'Save all', run: () => save() },
      { id: 'undo', label: 'Undo', run: () => doUndo() },
      { id: 'redo', label: 'Redo', run: () => doRedo() },
      { id: 'playHere', label: 'Play here', run: () => $('btnPlayHere').click() },
      { id: 'playStart', label: 'Play from start', run: () => $('btnTestStart').click() },
      { id: 'tab.scene', label: 'View: Scene', run: () => setTab('scene') },
      { id: 'tab.map', label: 'View: Map', run: () => setTab('map') },
      { id: 'tab.cutscene', label: 'View: Cutscene', run: () => setTab('cutscene') },
      { id: 'tab.logic', label: 'View: Logic', run: () => setTab('logic') },
      { id: 'tab.models', label: 'View: Models', run: () => setTab('models') },
      { id: 'left.hierarchy', label: 'Panel: Hierarchy', run: () => setLeftTab('H') },
      { id: 'left.levels', label: 'Panel: Levels', run: () => setLeftTab('L') },
      { id: 'left.guide', label: 'Panel: Guide', run: () => setLeftTab('G') },
      { id: 'lint', label: 'Open Lint / issues', run: () => openLintPanel() },
      { id: 'saveTarget', label: 'GitHub / Save destination…', run: () => saveTargetModal() },
      { id: 'gizmos', label: 'Toggle gizmos', run: () => { gizmos = !gizmos; refreshToolbar(); } },
      { id: 'retile', label: 'Auto-tile whole level', run: () => retileWholeLevel() }
    ],
    // ---- Companion (offline editor assistant) API ----
    companion: {
      assetCats: () => ASSET_CATS.slice(),
      assets: cat => assetListFor(cat),
      allAssets: () => ASSET_CATS.map(c => ({ cat: c.id, label: c.label, items: assetListFor(c.id) })),
      guide: () => ({ concepts: CONCEPTS, tools: TOOLS, nodes: (G.EventGraph && G.EventGraph.TYPES) || {}, nodeDesc: NODE_DESC }),
      csEvents: () => CS_EVENTS,
      level: () => { try { return lvl(); } catch (e) { return null; } },
      currentId: () => currentId,
      openAssetCat: cat => { setTab('scene'); setLeftTab('H'); assetCat = cat; refreshAssets(); },
      openGuide: () => { setLeftTab('G'); },
      openLint: () => { openLintPanel(); },
      lint: () => { try { return validateWorld(); } catch (e) { return { warns: [] }; } },
      gotoTab: t => setTab(t),
      focusSel: s => { try { sel = s; multi = []; const it = selectedItem(); if (it && it.ref) { if (it.ref.x != null) { camX = it.ref.x; camY = it.ref.y; } else if (it.ref.rect) { camX = it.ref.rect.x; camY = it.ref.rect.y; } } setTab('scene'); refreshInspector(); refreshHierarchy(); } catch (e) { } },
      armPlace: (cat, id, kind) => {
        const a = assetListFor(cat).find(x => x.id === id && (kind == null || x.kind === kind || x.boss === kind || x.model === kind || x.label === kind));
        if (!a) return false;
        setTab('scene'); assetCat = cat; setPlacing(a); return true;
      }
    }
  };

  // Inline-panel "2.0" overhauls (not standalone tools) mark themselves on the roadmap once
  // tools-core.js has loaded — it runs after editor.js in the script list.  (#33 Hierarchy 2.0)
  setTimeout(() => { try { if (G.Tools && G.Tools.roadmapDone) G.Tools.roadmapDone(33); } catch (_) { } }, 0);

  boot();
})();
