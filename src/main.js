// MOSSVEIL — main.js : boot, camera, game states, transitions, save
(function () {
  const U = G.U;
  const Main = G.Main = { state: 'title', endingT: 0 };

  const CAM_Z = 30, FOV = 32;
  const SAVE_KEY = 'mossveil-save-v1';     // legacy single-save key (migrated on boot)
  const SLOT_PREFIX = 'mossveil-slot-';     // per-slot keys: mossveil-slot-0 .. -4
  const ACTIVE_KEY = 'mossveil-active-slot';
  const SLOT_COUNT = 5;

  let camX = 0, camY = 0;
  let titleDrift = 0;
  let transitioning = false;
  let seenRooms = {};
  let lastT = 0;

  // ---------------- save slots ----------------
  // Up to SLOT_COUNT independent saves live in localStorage. G.save is the active
  // slot's data in memory; G.activeSlot is the index it persists back to.
  G.activeSlot = null;

  const slotKey = i => SLOT_PREFIX + i;

  function readSlot(i) {
    try {
      const raw = localStorage.getItem(slotKey(i));
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (s && typeof s === 'object' && s.data && typeof s.data === 'object') return s;
    } catch (e) { /* corrupted slot -> treat as empty */ }
    return null;
  }
  function readSlots() {
    const out = [];
    for (let i = 0; i < SLOT_COUNT; i++) out.push(readSlot(i));
    return out;
  }
  function writeSlot(i, data, createdAt) {
    const slot = { data, updatedAt: Date.now(), createdAt: createdAt || Date.now() };
    try { localStorage.setItem(slotKey(i), JSON.stringify(slot)); } catch (e) { }
    return slot;
  }
  function deleteSlot(i) {
    try { localStorage.removeItem(slotKey(i)); } catch (e) { }
    if (G.activeSlot === i) { G.activeSlot = null; try { localStorage.removeItem(ACTIVE_KEY); } catch (e) { } }
  }
  function setActiveSlot(i) {
    G.activeSlot = i;
    try { localStorage.setItem(ACTIVE_KEY, String(i)); } catch (e) { }
  }
  function firstEmptySlot() {
    for (let i = 0; i < SLOT_COUNT; i++) if (!readSlot(i)) return i;
    return -1;
  }
  function latestSlotIndex() {
    let best = -1, bestT = -1;
    for (let i = 0; i < SLOT_COUNT; i++) {
      const s = readSlot(i);
      if (s && s.updatedAt > bestT) { bestT = s.updatedAt; best = i; }
    }
    return best;
  }
  function anyOccupied() { return latestSlotIndex() >= 0; }

  // boot-time setup: migrate any legacy single save into slot 0, then load the active slot
  function initSaves() {
    if (!anyOccupied()) {
      try {
        const legacy = JSON.parse(localStorage.getItem(SAVE_KEY));
        if (legacy && typeof legacy === 'object') {
          writeSlot(0, legacy);
          localStorage.removeItem(SAVE_KEY);
        }
      } catch (e) { /* no/invalid legacy save */ }
    }
    let ai = parseInt(localStorage.getItem(ACTIVE_KEY), 10);
    if (!(ai >= 0 && ai < SLOT_COUNT) || !readSlot(ai)) ai = latestSlotIndex();
    if (ai >= 0) { G.activeSlot = ai; G.save = readSlot(ai).data; }
    else { G.activeSlot = null; G.save = {}; }
  }

  Main.persist = () => {
    if (G.activeSlot == null) return;            // title backdrop / editor preview: nothing to write
    const prev = readSlot(G.activeSlot);
    writeSlot(G.activeSlot, G.save, prev && prev.createdAt);
  };

  // a friendly one-line summary of a slot, for the slots screen
  Main.slotInfo = slot => {
    if (!slot) return null;
    const d = slot.data || {};
    const roomId = d.bench ? d.bench.room : 'steps';
    const def = G.LEVELS[roomId];
    const place = (def && def.title) ? def.title : 'The Awakening';
    let bosses = 0;
    if (d.bosses) for (const k in d.bosses) { if (d.bosses[k]) bosses++; }
    else if (d.bossDead) bosses = 1;
    const parts = [];
    if (d.wings) parts.push('Moth Wings');
    parts.push(bosses + (bosses === 1 ? ' boss felled' : ' bosses felled'));
    return { place, detail: parts.join('  ·  '), when: relTime(slot.updatedAt) };
  };
  function relTime(ms) {
    if (!ms) return '';
    const s = Math.max(0, (Date.now() - ms) / 1000);
    if (s < 60) return 'moments ago';
    if (s < 3600) { const m = Math.round(s / 60); return m + (m === 1 ? ' minute ago' : ' minutes ago'); }
    if (s < 86400) { const hr = Math.round(s / 3600); return hr + (hr === 1 ? ' hour ago' : ' hours ago'); }
    const d = new Date(ms);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  // ---------------- main menu ----------------
  Main.menuIndex = 0;
  Main.menuItems = [];
  Main.confirm = null;   // { message, onYes, sel }

  Main.slotIndex = 0;
  Main.slots = [];

  function buildMenu() {
    Main.menuItems = [
      { label: 'New Game', enabled: true, action: menuNewGame },
      { label: 'Continue', enabled: anyOccupied(), action: continueGame },
      { label: 'Load Save', enabled: true, action: openSlots },
      { label: 'Exit', enabled: true, action: exitGame }
    ];
    if (!Main.menuItems[Main.menuIndex] || !Main.menuItems[Main.menuIndex].enabled)
      Main.menuIndex = Main.menuItems.findIndex(i => i.enabled);
    return Main.menuItems;
  }
  function menuStep(dir) {
    const items = Main.menuItems;
    let i = Main.menuIndex;
    for (let n = 0; n < items.length; n++) {
      i = (i + dir + items.length) % items.length;
      if (items[i].enabled) { Main.menuIndex = i; G.Audio.sfx('clink'); break; }
    }
  }
  function menuActivate() {
    const it = Main.menuItems[Main.menuIndex];
    if (it && it.enabled) { G.Audio.sfx('uiBell'); it.action(); }
  }
  // resume the most recently saved slot
  function continueGame() {
    const i = latestSlotIndex();
    if (i < 0) { menuNewGame(); return; }
    setActiveSlot(i);
    G.save = readSlot(i).data;
    startGame(false);
  }
  // quick new game: drop into the first free slot, or send to the slots screen if full
  function menuNewGame() {
    const i = firstEmptySlot();
    if (i < 0) {
      openSlots();
      G.UI.toast('All slots full — delete one to begin anew');
      return;
    }
    setActiveSlot(i);
    G.save = {};
    startGame(true);
  }

  function exitGame() {
    try { window.close(); } catch (e) { }
    Main.state = 'exited';
  }

  // ---------------- save-slot screen ----------------
  function openSlots() {
    Main.slots = readSlots();
    const last = latestSlotIndex();
    Main.slotIndex = last >= 0 ? last : 0;
    Main.state = 'slots';
    G.Audio.sfx('uiBell');
  }
  function slotActivate(i) {
    const s = Main.slots[i];
    G.Audio.sfx('uiBell');
    setActiveSlot(i);
    if (s) { G.save = s.data || {}; startGame(false); }     // load existing
    else { G.save = {}; startGame(true); }                  // begin a fresh run in this slot
  }
  function slotDelete(i) {
    if (!Main.slots[i]) { G.Audio.sfx('clink'); return; }
    Main.confirm = {
      message: 'Delete this vessel forever? This cannot be undone.',
      sel: 1,                          // default to "No"
      onYes: () => { deleteSlot(i); Main.slots = readSlots(); G.Audio.sfx('quake'); }
    };
  }

  // shared confirm-dialog input; returns true while a dialog is up (consuming input)
  function handleConfirm(I) {
    if (!Main.confirm) return false;
    if (I.pressed('left') || I.pressed('right') || I.pressed('up') || I.pressed('down')) {
      Main.confirm.sel ^= 1; G.Audio.sfx('clink');
    }
    if (I.pressed('confirm') || I.pressed('jump') || I.pressed('attack')) {
      const c = Main.confirm; Main.confirm = null; G.Audio.sfx('uiBell');
      if (c.sel === 0) c.onYes();
    } else if (I.pressed('pause')) Main.confirm = null;
    return true;
  }

  // ---------------- pointer helpers (title / confirm / slots) ----------------
  function hitRect(e, b) { return e.clientX >= b.x && e.clientX <= b.x + b.w && e.clientY >= b.y && e.clientY <= b.y + b.h; }
  function pointerToConfirm(e) {
    for (const b of (G.UI.confirmButtons || [])) if (hitRect(e, b)) return { confirm: b.yes };
    return null;
  }
  function pointerToMenu(e) {
    for (const b of (G.UI.titleButtons || [])) if (b.enabled && hitRect(e, b)) return { index: b.index };
    return null;
  }
  function pointerToSlot(e) {
    for (const b of (G.UI.slotTrashButtons || [])) if (hitRect(e, b)) return { trash: b.index };
    for (const b of (G.UI.slotButtons || [])) if (hitRect(e, b)) return { index: b.index };
    if (G.UI.slotBack && hitRect(e, G.UI.slotBack)) return { back: true };
    return null;
  }

  // ---------------- boot ----------------
  function boot() {
    if (!window.THREE) throw new Error('three.js failed to load');
    const canvas = document.getElementById('game');
    const renderer = G.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    const scene = G.scene = new THREE.Scene();
    const camera = G.camera = new THREE.PerspectiveCamera(FOV, innerWidth / innerHeight, 1, 300);
    camera.position.set(0, 0, CAM_Z);

    initSaves();
    G.time = 0;
    G.hitStop = 0;

    G.FX.init(scene);
    G.UI.init();
    resize();
    addEventListener('resize', resize);

    // audio must be created inside a user gesture
    const gesture = () => { G.Audio.init(); removeEventListener('keydown', gesture); removeEventListener('pointerdown', gesture); };
    addEventListener('keydown', gesture);
    addEventListener('pointerdown', gesture);

    // menu / slots: hover to highlight (desktop), tap/click to choose.
    // Uses pointer events for the tap so it works with touch on iPad (iOS does not
    // reliably synthesize mouse events for taps on the canvas).
    addEventListener('mousemove', e => {
      if (Main.confirm) return;
      if (Main.state === 'title') {
        const hit = pointerToMenu(e);
        if (hit && hit.index !== undefined) Main.menuIndex = hit.index;
      } else if (Main.state === 'slots') {
        const hit = pointerToSlot(e);
        if (hit && hit.index !== undefined) Main.slotIndex = hit.index;
      }
    });
    addEventListener('pointerdown', e => {
      if (e.button && e.button !== 0) return;
      if (Main.confirm) {
        const hit = pointerToConfirm(e);
        if (hit) { const ok = hit.confirm; const c = Main.confirm; Main.confirm = null; if (ok) c.onYes(); }
        return;
      }
      if (Main.state === 'exited') { Main.state = 'title'; return; }
      if (Main.state === 'title') {
        const hit = pointerToMenu(e);
        if (hit && hit.index !== undefined) { Main.menuIndex = hit.index; menuActivate(); }
      } else if (Main.state === 'slots') {
        const hit = pointerToSlot(e);
        if (!hit) return;
        if (hit.back) { Main.state = 'title'; G.Audio.sfx('clink'); }
        else if (hit.trash !== undefined) slotDelete(hit.trash);
        else if (hit.index !== undefined) slotActivate(hit.index);
      }
    });

    renderer.localClippingEnabled = true;

    // direct cutscene preview from the editor: index.html?cutscene=<id>
    const q = new URLSearchParams(location.search);
    const csParam = q.get('cutscene');
    const startLevel = q.get('level');
    if (csParam && G.CUTSCENES && G.CUTSCENES[csParam]) {
      const cs = G.CUTSCENES[csParam];
      const lv = cs.level && G.LEVELS[cs.level] ? cs.level : 'steps';
      const sp = G.World.load(lv, 'P');
      G.Player.create(sp.x, sp.y);
      seenRooms[lv] = true; // suppress area title during preview
      beginCutscene(csParam, sp.x, sp.y);
    } else if (startLevel && G.LEVELS[startLevel]) {
      const sp = G.World.load(startLevel, q.get('spawn') || 'P');
      G.Player.create(sp.x, sp.y);
      snapCamera();
      showAreaTitle();
      Main.state = 'play';
      G.UI.setFade(0, 3);
    } else {
      // backdrop room behind the title
      const sp = G.World.load('steps', 'P');
      G.Player.create(sp.x, sp.y);
      camX = sp.x + 6; camY = sp.y + 2;
      G.UI.setFade(0, 1.2);
      // index.html?new=1 — wipe the save and begin a fresh run (used by reset-save.html)
      if (q.get('new')) startGame(true);
    }

    requestAnimationFrame(loop);
  }

  function resize() {
    G.renderer.setSize(innerWidth, innerHeight);
    G.camera.aspect = innerWidth / innerHeight;
    G.camera.updateProjectionMatrix();
    G.pxScale = (G.renderer.domElement.height / 2) / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    G.FX.resize(G.renderer.domElement.height, FOV);
    G.UI.resize();
  }

  // ---------------- state flow ----------------
  // a save with no recorded progress is effectively a brand-new player. ("visited" is
  // ignored because the title screen's backdrop room already marks the start as visited.)
  function isNewSave() {
    const s = G.save || {};
    return !s.bench && !s.wings && !s.bossDead && !(s.bosses && Object.keys(s.bosses).length);
  }

  function startGame(fresh) {
    // any start from an empty save is a new game, so the intro plays even without pressing N
    const newGame = fresh || isNewSave();
    if (newGame) {
      // a fresh run needs a slot to live in (e.g. ?new=1 or an editor preview with none set)
      if (G.activeSlot == null) { const e = firstEmptySlot(); setActiveSlot(e >= 0 ? e : 0); }
      G.save = {};
      Main.persist();                 // create the save file immediately so the slot is occupied
    }
    Main.state = 'transition';
    G.UI.setFade(1, 6, () => {
      let roomId = 'steps', sx, sy;
      if (!newGame && G.save.bench) {
        roomId = G.save.bench.room;
        sx = G.save.bench.x; sy = G.save.bench.y;
      }
      const sp = G.World.load(roomId, 'P');
      if (sx === undefined) { sx = sp.x; sy = sp.y; }
      G.player.reset(sx, sy);
      snapCamera();
      const def = G.LEVELS[roomId];
      if (newGame && def.intro && G.CUTSCENES && G.CUTSCENES[def.intro]) {
        beginCutscene(def.intro, sx, sy);
      } else {
        showAreaTitle();
        Main.state = 'play';
        G.UI.setFade(0, 4);
      }
    });
  }

  // play a cutscene over the already-loaded room, then drop into gameplay seamlessly
  function beginCutscene(id, sx, sy) {
    G.UI.setFade(0, 99);
    Main.state = 'cutscene';
    G.player.cinematic = true;
    snapCamera();
    G.Cutscene.start(id, {
      spawnX: sx !== undefined ? sx : G.player.body.x,
      spawnY: sy !== undefined ? sy : G.player.body.y,
      // where gameplay will frame the camera once it takes over (clamped to the room),
      // so the cutscene can dolly back to exactly that spot for a seamless handoff
      gameplayCam: () => {
        const p = G.player;
        const c = clampCam(p.body.x + p.facing * 1.7, p.body.y + 1.2);
        return { x: c.x, y: c.y, z: CAM_Z };
      },
      onDone: () => {
        G.player.cinematic = false;
        showAreaTitle();
        Main.state = 'play';
      }
    });
  }
  Main.beginCutscene = beginCutscene;

  // play a cutscene in the current room without moving/reloading — for cutscene triggers.
  // the player stays where they are; control returns afterward at the (possibly walked) spot.
  function playCutsceneInPlace(id) {
    if (Main.state !== 'play' || !G.player || G.player.dead) return;
    if (!G.CUTSCENES || !G.CUTSCENES[id]) return;
    Main.state = 'cutscene';
    G.player.cinematic = true;
    const startCam = { x: camX, y: camY, z: CAM_Z };
    G.Cutscene.start(id, {
      spawnX: G.player.body.x, spawnY: G.player.body.y,
      facing: G.player.facing, startCam, inPlace: true,
      gameplayCam: () => {
        const p = G.player;
        const c = clampCam(p.body.x + p.facing * 1.7, p.body.y + 1.2);
        return { x: c.x, y: c.y, z: CAM_Z };
      },
      onDone: () => { G.player.cinematic = false; Main.state = 'play'; }
    });
  }
  Main.playCutsceneInPlace = playCutsceneInPlace;

  function showAreaTitle() {
    const def = G.room.def;
    if (!seenRooms[G.room.id] && def.title) {
      seenRooms[G.room.id] = true;
      G.UI.areaTitle(def.title);
    }
  }

  // hp/soul carry through doors (player.reset refills them — restore after)
  Main.transition = (to, spawn) => {
    if (transitioning) return;
    const hp = G.player.hp, soul = G.player.soul;
    transitioning = true;
    Main.state = 'transition';
    G.UI.setFade(1, 9, () => {
      const sp = G.World.load(to, spawn);
      G.player.reset(sp.x, sp.y);
      G.player.hp = hp;
      G.player.soul = soul;
      G.player.invulnT = 0.3;
      G.Audio.setBoss(false);
      snapCamera();
      showAreaTitle();
      Main.state = 'play';
      transitioning = false;
      G.UI.setFade(0, 5);
    });
  };

  // instant room change (debug / testing)
  Main.warp = (to, spawn) => {
    const sp = G.World.load(to, spawn || '1');
    G.player.reset(sp.x, sp.y);
    G.Audio.setBoss(false);
    snapCamera();
    transitioning = false;
    Main.state = 'play';
    G.UI.setFade(0, 99);
  };

  Main.benchRest = (bench) => {
    const p = G.player;
    p.hp = p.maxHp;
    G.save.bench = { room: G.room.id, x: bench.x, y: bench.y + 0.7 };
    Main.persist();
    G.Audio.sfx('bench');
    G.FX.burst('healPop', bench.x, bench.y + 1);
    G.FX.ring(bench.x, bench.y + 1, { r1: 4, life: 0.6, color: 0xffe8c0, alpha: 0.6 });
    G.UI.onHeal();
    G.UI.toast('Rested. Your journey is recorded.');
  };

  Main.onPlayerDeath = () => {
    if (Main.state === 'dead') return;
    Main.state = 'dead';
    G.UI.resetDeathText();
    G.Audio.setBoss(false);
    G.player.soul = Math.floor(G.player.soul / 2);
    setTimeout(() => {
      G.UI.setFade(1, 3, () => {
        let roomId = 'steps', sx, sy;
        if (G.save.bench) { roomId = G.save.bench.room; sx = G.save.bench.x; sy = G.save.bench.y; }
        const sp = G.World.load(roomId, 'P');
        if (sx === undefined) { sx = sp.x; sy = sp.y; }
        const soul = G.player.soul;
        G.player.reset(sx, sy);
        G.player.soul = soul;
        snapCamera();
        Main.state = 'play';
        G.UI.setFade(0, 4);
      });
    }, 1500);
  };

  Main.startEnding = () => {
    if (Main.state !== 'play') return;
    Main.state = 'ending';
    Main.endingT = 0;
    G.Audio.sfx('bench');
  };

  // ---------------- camera ----------------
  function viewHalf() {
    const hh = Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * CAM_Z;
    return { hw: hh * G.camera.aspect, hh };
  }

  function clampCam(x, y) {
    const { hw, hh } = viewHalf();
    const r = G.room;
    if (!r) return { x, y };
    x = r.w > hw * 2 ? U.clamp(x, hw, r.w - hw) : r.w / 2;
    y = r.h > hh * 2 ? U.clamp(y, hh, r.h - hh) : r.h / 2;
    return { x, y };
  }

  function snapCamera() {
    const p = G.player;
    const c = clampCam(p.body.x, p.body.y + 1.2);
    camX = c.x; camY = c.y;
  }

  function updateCamera(dt, rdt) {
    const p = G.player;
    if (Main.state === 'cutscene' && G.Cutscene.active) {
      const c = G.Cutscene.active.cam;
      const sh = G.FX.camOffset();
      camX = c.x; camY = c.y;
      G.camera.position.set(c.x + sh.x, c.y + sh.y, c.z);
      return;
    }
    if (Main.state === 'title') {
      titleDrift += rdt;
      const c = clampCam(p.body.x + 6 + Math.sin(titleDrift * 0.1) * 3, p.body.y + 2 + Math.sin(titleDrift * 0.07) * 1.5);
      camX = U.damp(camX, c.x, 0.6, rdt);
      camY = U.damp(camY, c.y, 0.6, rdt);
    } else if (p) {
      const lookX = p.body.x + p.facing * 1.7 + p.body.vx * 0.06;
      const lookY = p.body.y + 1.2 + U.clamp(p.body.vy * 0.06, -1.2, 0.6);
      const c = clampCam(lookX, lookY);
      camX = U.damp(camX, c.x, 6, rdt);
      camY = U.damp(camY, c.y, 5, rdt);
    }
    const sh = G.FX.camOffset();
    G.camera.position.set(camX + sh.x, camY + sh.y, CAM_Z);
  }

  // ---------------- main loop ----------------
  function loop(t) {
    requestAnimationFrame(loop);
    const rdt = Math.min(0.033, Math.max(0.0001, (t - lastT) / 1000));
    lastT = t;
    const I = G.Input;

    // global keys
    if (I.pressed('mute')) {
      const m = G.Audio.toggleMute();
      if (Main.state !== 'title') G.UI.toast(m ? 'muted' : 'sound on');
    }

    let dt = rdt;
    if (G.hitStop > 0) { G.hitStop -= rdt; dt = 0; }

    switch (Main.state) {
      case 'title':
        dt = rdt * 0.6;
        buildMenu();
        if (!handleConfirm(I)) {
          if (I.pressed('up')) menuStep(-1);
          if (I.pressed('down')) menuStep(1);
          if (I.pressed('confirm') || I.pressed('jump') || I.pressed('attack')) menuActivate();
          if (I.pressed('newgame')) menuNewGame();
        }
        break;
      case 'slots':
        dt = rdt * 0.6;
        Main.slots = readSlots();
        if (!handleConfirm(I)) {
          if (I.pressed('up')) { Main.slotIndex = (Main.slotIndex - 1 + SLOT_COUNT) % SLOT_COUNT; G.Audio.sfx('clink'); }
          if (I.pressed('down')) { Main.slotIndex = (Main.slotIndex + 1) % SLOT_COUNT; G.Audio.sfx('clink'); }
          if (I.pressed('confirm') || I.pressed('jump') || I.pressed('attack')) slotActivate(Main.slotIndex);
          if (I.pressed('del')) slotDelete(Main.slotIndex);
          if (I.pressed('pause')) { Main.state = 'title'; G.Audio.sfx('clink'); }
        }
        break;
      case 'exited':
        dt = 0;
        if (I.anyPressed()) Main.state = 'title';
        break;
      case 'pause':
        dt = 0;
        if (I.pressed('pause')) Main.state = 'play';
        break;
      case 'map': {
        dt = 0;
        if (I.pressed('map') || I.pressed('pause')) Main.state = 'play';
        const mv = Main.mapView;
        const panSpd = 60 / mv.zoom * rdt;
        if (I.down('left')) mv.pan.x -= panSpd;
        if (I.down('right')) mv.pan.x += panSpd;
        if (I.down('up')) mv.pan.y -= panSpd;
        if (I.down('down')) mv.pan.y += panSpd;
        if (I.down('zoomIn')) mv.zoom = Math.min(8, mv.zoom * (1 + rdt * 2));
        if (I.down('zoomOut')) mv.zoom = Math.max(0.8, mv.zoom * (1 - rdt * 2));
        break;
      }
      case 'play':
        if (I.pressed('pause')) { Main.state = 'pause'; }
        else if (I.pressed('map')) {
          Main.state = 'map';
          Main.mapView = Main.mapView || { pan: { x: 0, y: 0 }, zoom: 3 };
          G.MapView.centerOn(G.room.id, Main.mapView);
          G.Audio.sfx('uiBell');
        }
        break;
      case 'ending':
        dt = rdt * 0.3;
        Main.endingT += rdt;
        if (Main.endingT > 4.5 && I.anyPressed()) {
          Main.state = 'play';
          if (!G.save.endingSeen) { G.save.endingSeen = true; Main.persist(); }
        }
        break;
      case 'cutscene':
        dt = rdt;
        if (I.pressed('jump') || I.pressed('attack') || I.pressed('interact') || I.pressed('pause') || I.pressed('confirm')) {
          G.Cutscene.skip();
        }
        break;
    }

    if (dt > 0) {
      G.time += dt;
      G.World.update(dt);
      if (Main.state === 'cutscene') G.Cutscene.update(dt);
      else if (Main.state !== 'title' && G.player) G.player.update(dt);
      G.FX.update(dt);
    }
    G.Audio.update(rdt);
    updateCamera(dt, rdt);

    G.renderer.render(G.scene, G.camera);
    G.UI.draw(rdt);
    I.update();
  }

  // ---------------- go ----------------
  try {
    boot();
  } catch (e) {
    const el = document.getElementById('err');
    el.style.display = 'block';
    el.innerHTML = '<h2>Could not start</h2><p>' + (e && e.message ? e.message : e) + '</p><p>This game needs WebGL. Try a recent Chrome, Edge or Firefox.</p>';
    console.error(e);
  }
})();
