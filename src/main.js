// MOSSVEIL — main.js : boot, camera, game states, transitions, save
(function () {
  const U = G.U;
  const Main = G.Main = { state: 'title', endingT: 0 };

  const CAM_Z = 30, FOV = 32;
  const SAVE_KEY = 'mossveil-save-v1';     // legacy single-save key (migrated on boot)
  const SLOT_PREFIX = 'mossveil-slot-';     // per-slot keys: mossveil-slot-0 .. -4
  const ACTIVE_KEY = 'mossveil-active-slot';
  const SLOT_COUNT = 5;

  let camX = 0, camY = 0, camLead = 0, zoomPunch = 0;
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
  Main.pauseIndex = 0;
  Main.pauseItems = ['Resume', 'Charms', 'Journal', 'Map', 'Settings', 'Quit to Title'];
  Main.pauseDescs = {
    'Resume': 'Return to the dream.',
    'Charms': 'Equip and inspect your charms.',
    'Journal': "The Hunter's record of the creatures you have slain.",
    'Map': "Open the wanderer's map.",
    'Settings': 'Sound, screen shake, visual quality.',
    'Quit to Title': 'Leave to the title screen.'
  };
  Main.charmIndex = 0;
  Main.journalIndex = 0;
  Main.ctrlIndex = 0; Main.ctrlListening = false;
  Main.settingsIndex = 0;

  // ---------------- settings ----------------
  const SETTINGS_KEY = 'mossveil-settings';
  // schema drives the menu, the adjust logic, and the saved keys
  const SETTINGS_DEFS = [
    { key: 'controls', label: 'Controls / key bindings', type: 'action' },
    { key: 'volume', label: 'Sound volume', type: 'slider' },
    { key: 'shake', label: 'Screen shake', type: 'toggle' },
    { key: 'quality', label: 'Visual quality', type: 'cycle', opts: ['low', 'medium', 'high'] },
    { key: 'tonemap', label: 'Tone mapping', type: 'cycle', opts: ['Off', 'ACES', 'AgX'] },
    { key: 'lighting', label: 'Dynamic lighting', type: 'toggle' },
    { key: 'bloom', label: 'Bloom glow', type: 'toggle' },
    { key: 'dof', label: 'Depth of field', type: 'toggle' },
    { key: 'reflections', label: 'Water reflections', type: 'toggle' },
    { key: 'weather', label: 'Weather effects', type: 'toggle' },
    { key: 'aberration', label: 'Chromatic aberration', type: 'toggle' },
    { key: 'motionblur', label: 'Motion blur', type: 'toggle' },
    { key: 'vignette', label: 'Vignette', type: 'toggle' }
  ];
  G.settings = { volume: 0.8, shake: true, quality: 'high', tonemap: 'ACES', lighting: true, bloom: true, dof: true, reflections: true, weather: true, aberration: true, motionblur: true, vignette: true };
  const fmtSetting = d => {
    if (d.type === 'action') return '▶';
    const v = G.settings[d.key];
    if (d.type === 'slider') return Math.round(v * 100) + '%';
    if (d.type === 'cycle') return ('' + v).charAt(0).toUpperCase() + ('' + v).slice(1);
    return v ? 'On' : 'Off';
  };
  Main.settingsCount = SETTINGS_DEFS.length;
  Main.settingsRows = () => SETTINGS_DEFS.map(d => ({ label: d.label, value: fmtSetting(d) }));
  function applySettings() {
    const s = G.settings;
    if (G.Audio && G.Audio.setVolume) G.Audio.setVolume(s.volume);
    if (G.Post) {
      G.Post.quality = s.quality;
      G.Post.tonemap = s.tonemap === 'AgX' ? 2 : (s.tonemap === 'Off' ? 0 : 1);
      G.Post.motion = s.motionblur === false ? 0 : 0.6;
      G.Post.lighting = s.lighting !== false;
      if (G.Post.setFX) G.Post.setFX({ bloom: s.bloom ? 1 : 0, dof: s.dof ? 1 : 0, reflections: s.reflections ? 1 : 0, aberr: s.aberration ? 1 : 0, vignette: s.vignette ? 1 : 0 });
    }
    if (G.Lights) G.Lights.enabled = s.lighting !== false;
    if (G.Weather) G.Weather.userEnabled = s.weather !== false;
  }
  function loadSettings() {
    try { const s = JSON.parse(localStorage.getItem(SETTINGS_KEY)); if (s && typeof s === 'object') Object.assign(G.settings, s); } catch (e) { }
    applySettings();
  }
  function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(G.settings)); } catch (e) { } }
  function openControls() { Main.ctrlIndex = 0; Main.ctrlListening = false; G.Input.cancelCapture(); menuGo('controls'); }
  function settingsAdjust(dir) {
    const d = SETTINGS_DEFS[Main.settingsIndex]; if (!d) return;
    if (d.type === 'action') { if (dir > 0 && d.key === 'controls') openControls(); return; }
    const s = G.settings;
    if (d.type === 'slider') s[d.key] = U.clamp(+(s[d.key] + dir * 0.1).toFixed(2), 0, 1);
    else if (d.type === 'cycle') s[d.key] = d.opts[(d.opts.indexOf(s[d.key]) + dir + d.opts.length) % d.opts.length];
    else s[d.key] = !s[d.key];
    applySettings(); saveSettings(); G.Audio.sfx('clink');
  }
  // Menu-to-menu transition: fire the bat sweep and DELAY the state swap until the swarm
  // has covered the screen (~SWP_COVER), so the new menu appears from behind the bats —
  // the same beat the gameplay→pause sweep uses. Input is held during the cover.
  Main.transLock = 0; Main.transTo = null;
  function menuGo(to) {
    if (Main.transLock > 0) return;
    if (G.UI.menuSweep) G.UI.menuSweep();
    Main.transTo = to; Main.transLock = 0.22;   // swap once the (faster) curtain has covered
  }
  function pauseSelect() {
    G.Audio.sfx('uiBell');
    const it = Main.pauseItems[Main.pauseIndex];
    if (it === 'Resume') { if (G.UI.closePause) G.UI.closePause(); Main.state = 'play'; }
    else if (it === 'Charms') { Main.charmIndex = 0; Main._charmReturn = 'pause'; menuGo('charms'); }
    else if (it === 'Journal') { Main.journalIndex = 0; Main._journalReturn = 'pause'; menuGo('journal'); }
    else if (it === 'Map') { Main.mapView = Main.mapView || { pan: { x: 0, y: 0 }, zoom: 3 }; G.MapView.centerOn(G.room.id, Main.mapView); menuGo('map'); }
    else if (it === 'Settings') { Main.settingsIndex = 0; Main._settingsReturn = 'pause'; menuGo('settings'); }
    else if (it === 'Quit to Title') { G.Audio.setBoss(false); G.UI.setBoss(null); Main.menuIndex = 0; menuGo('title'); }
  }

  Main.slotIndex = 0;
  Main.slots = [];

  function buildMenu() {
    Main.menuItems = [
      { label: 'New Game', enabled: true, action: menuNewGame },
      { label: 'Continue', enabled: anyOccupied(), action: continueGame },
      { label: 'Load Save', enabled: true, action: openSlots },
      { label: 'Settings', enabled: true, action: () => { Main.settingsIndex = 0; Main._settingsReturn = 'title'; menuGo('settings'); } },
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
  function hitButton(e, arr) { for (const b of (arr || [])) if (hitRect(e, b)) return b; return null; }
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
    G.slowMo = 0; G.slowScale = 0.3;

    G.FX.init(scene);
    G.UI.init();
    resize();
    if (G.Post) G.Post.init();
    loadSettings();
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
      if (transitioning) return;                  // ignore taps while a menu is fading to black
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
      } else if (Main.state === 'pause') {
        const b = hitButton(e, G.UI.pauseButtons);
        if (b) { Main.pauseIndex = b.index; pauseSelect(); }
      } else if (Main.state === 'charms') {
        const b = hitButton(e, G.UI.charmButtons);
        if (b) { Main.charmIndex = b.index; const ok = G.Charms.toggle(G.Charms.LIST[b.index].id); G.Audio.sfx(ok ? 'uiBell' : 'clink'); }
      } else if (Main.state === 'settings') {
        const b = hitButton(e, G.UI.settingsButtons);
        if (b) { Main.settingsIndex = b.index; settingsAdjust(1); }
      } else if (Main.state === 'controls') {
        if (Main.ctrlListening) return;
        const b = hitButton(e, G.UI.controlButtons);
        if (b) {
          Main.ctrlIndex = b.index;
          const items = G.Input.BINDABLE;
          if (b.index >= items.length) { G.Input.resetBindings(); G.Audio.sfx('uiBell'); }
          else { Main.ctrlListening = true; G.Audio.sfx('clink'); const action = items[b.index][0]; G.Input.captureKey(code => { if (code !== 'Escape') G.Input.rebind(action, code); Main.ctrlListening = false; }); }
        }
      } else if (Main.state === 'bench') {
        const b = hitButton(e, G.UI.benchButtons);
        if (b) { Main.benchIndex = b.index; benchSelect(); }
      } else if (Main.state === 'travel') {
        const b = hitButton(e, G.UI.travelButtons);
        if (b) { Main.travelIndex = b.index; travelTo(b.index); }
      } else if (Main.state === 'shop') {
        const b = hitButton(e, G.UI.shopButtons);
        if (b) { Main.shopIndex = b.index; shopBuy(); }
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
    if (G.Post) G.Post.resize();
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
    // fade to black on the way in (New Game / Continue / loading a save), keeping the
    // current menu on screen so it fades out cleanly; `transitioning` locks menu input
    transitioning = true;
    if (newGame && G.Prologue) {
      // a new game: fade to black, then open the prologue cinematic
      G.UI.setFade(1, 4, () => {
        transitioning = false;
        Main.state = 'prologue';
        G.UI.setFade(0, 99);              // clear the UI black; the prologue handles its own slow reveal
        G.Prologue.start(() => loadIntoWorld(true, true));
      });
      return;
    }
    G.UI.setFade(1, 3.2, () => { transitioning = false; loadIntoWorld(newGame, false); });
  }
  function loadIntoWorld(newGame, fromPrologue) {
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
      beginCutscene(def.intro, sx, sy);     // begins black (fadeAlpha 1) — seamless from the prologue
    } else {
      showAreaTitle();
      Main.state = 'play';
      G.UI.setFade(0, 4);
    }
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
    // remember this bench so it becomes a fast-travel destination
    G.save.benchList = G.save.benchList || [];
    const name = (G.LEVELS[G.room.id] && G.LEVELS[G.room.id].title) || G.room.id;
    if (!G.save.benchList.find(b => b.room === G.room.id))
      G.save.benchList.push({ room: G.room.id, x: bench.x, y: bench.y + 0.7, name });
    Main.persist();
    G.Audio.sfx('bench');
    G.FX.burst('healPop', bench.x, bench.y + 1);
    G.FX.ring(bench.x, bench.y + 1, { r1: 4, life: 0.6, color: 0xffe8c0, alpha: 0.6 });
    G.UI.onHeal();
    Main.benchIndex = 0;
    Main.state = 'bench';   // open the bench hub (rest / travel / charms)
  };

  // ---------------- economy: Glimmer ----------------
  Main.glimmer = () => (G.save && G.save.glimmer) || 0;
  Main.dropGlimmer = (x, y, n) => {
    if (!G.save || !n) return;
    G.save.glimmer = (G.save.glimmer || 0) + n;
    for (let i = 0; i < Math.min(n, 7); i++)
      G.FX.p(true, { x: x + U.rand(-.4, .4), y: y + U.rand(-.2, .5), vx: U.rand(-2, 2), vy: U.rand(1, 3.5), life: U.rand(.5, .95), size: U.rand(.14, .26), color: 0xffe28a, drag: 3, home: true, alpha: .95 });
    G.Audio.sfx('soul');
    if (Main.persist) Main.persist();
  };
  Main.spendGlimmer = n => { if (Main.glimmer() >= n) { G.save.glimmer -= n; Main.persist(); return true; } return false; };
  Main.charmPrice = id => { const c = G.Charms.get(id); return c ? c.cost * 60 : 0; };

  // ---------------- bench hub / fast-travel / vendor ----------------
  Main.benchIndex = 0;
  Main.benchItems = ['Travel', 'Charms', 'Leave'];
  Main.travelIndex = 0;
  Main.shopIndex = 0;
  Main.shopList = [];
  Main._charmReturn = 'pause';
  function benchSelect() {
    G.Audio.sfx('uiBell');
    const it = Main.benchItems[Main.benchIndex];
    if (it === 'Leave') Main.state = 'play';
    else if (it === 'Charms') { Main.charmIndex = 0; Main._charmReturn = 'bench'; Main.state = 'charms'; }
    else if (it === 'Travel') {
      const list = G.save.benchList || [];
      if (list.length <= 1) G.UI.toast('No other resting places discovered yet.');
      else { Main.travelIndex = 0; Main.state = 'travel'; }
    }
  }
  function travelTo(i) {
    const list = G.save.benchList || [];
    const b = list[i]; if (!b) return;
    if (b.room === G.room.id) { Main.state = 'play'; return; }
    G.Audio.sfx('uiBell');
    Main.state = 'transition';
    G.UI.setFade(1, 5, () => {
      const sp = G.World.load(b.room, 'P');
      G.player.reset(b.x !== undefined ? b.x : sp.x, b.y !== undefined ? b.y : sp.y);
      snapCamera();
      showAreaTitle();
      Main.state = 'play';
      G.UI.setFade(0, 4);
    });
  }
  Main.openShop = () => {
    Main.shopList = G.Charms.LIST.filter(c => !G.Charms.isOwned(c.id));
    if (!Main.shopList.length) { G.UI.toast('The vendor has nothing left to offer.'); return; }
    Main.shopIndex = 0; Main.state = 'shop'; G.Audio.sfx('uiBell');
  };
  function shopBuy() {
    const c = Main.shopList[Main.shopIndex]; if (!c) return;
    const price = Main.charmPrice(c.id);
    if (Main.glimmer() < price) { G.Audio.sfx('clink'); G.UI.toast('Not enough Glimmer.'); return; }
    Main.spendGlimmer(price);
    G.Charms.grant(c.id);
    G.Audio.sfx('pickup');
    G.UI.toast('Acquired: ' + c.name);
    Main.shopList = G.Charms.LIST.filter(x => !G.Charms.isOwned(x.id));
    if (!Main.shopList.length) { Main.state = 'play'; return; }
    Main.shopIndex = Math.min(Main.shopIndex, Main.shopList.length - 1);
  }
  Main.benchSelect = benchSelect; Main.travelTo = travelTo; Main.shopBuy = shopBuy;

  Main.onPlayerDeath = () => {
    if (Main.state === 'dead') return;
    Main.state = 'dead';
    G.UI.resetDeathText();
    G.Audio.setBoss(false);
    G.player.soul = Math.floor(G.player.soul / 2);
    // drop a shade where you fell, holding the Glimmer you lose — reclaim it by destroying the shade
    const carried = Main.glimmer();
    if (carried > 0 && G.room) {
      const sx = Math.max(2, Math.min((G.room.w || 100) - 2, G.player.body.x));
      const sy = Math.max(2, Math.min((G.room.h || 100) - 2, G.player.body.y));
      G.save.shade = { room: G.room.id, x: sx, y: sy, glimmer: carried };
      G.save.glimmer = 0;
      Main.persist();
    }
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

  // your shade was destroyed — give the Glimmer back and clear it from the save
  Main.recoverShade = (x, y, glimmer) => {
    if (glimmer > 0) G.save.glimmer = (G.save.glimmer || 0) + glimmer;
    G.save.shade = null;
    Main.persist();
    G.Audio.sfx('pickup');
    G.FX.ring(x, y + 0.3, { r1: 3, life: 0.5, color: 0x6cc6ff, alpha: 0.6 });
    G.FX.burst('soul', x, y + 0.3, { n: 12, color: 0x6cc6ff });
    if (G.UI.toast && glimmer > 0) G.UI.toast('Glimmer reclaimed: +' + glimmer);
  };

  // Hunter's Journal: tally kills per enemy type (drives bestiary discovery)
  Main.recordKill = (type) => {
    if (!type || type === 'shade' || type === 'projectile') return;
    G.save.kills = G.save.kills || {};
    const firstKill = !G.save.kills[type];
    G.save.kills[type] = (G.save.kills[type] || 0) + 1;
    if (firstKill && G.UI.toast) {                    // newly discovered → note it in the journal
      const t = (G.Enemies.TYPES || []).find(e => e.id === type);
      const nm = t ? t.label.replace(/\s*\(.*\)/, '') : type;
      G.UI.toast('Journal entry added — ' + nm);
      G.Audio.sfx('uiBell');
    }
    Main.persist();
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
    if (Main.state === 'prologue') return;   // the prologue drives its own camera
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
      // springy look-ahead: lead the camera toward where the player is heading/facing
      const leadTarget = p.facing * 2.1 + U.clamp(p.body.vx * 0.16, -2.2, 2.2);
      camLead = U.damp(camLead, leadTarget, 3, rdt);
      const lookX = p.body.x + camLead;
      const lookY = p.body.y + 1.2 + U.clamp(p.body.vy * 0.07, -1.4, 0.7);
      const c = clampCam(lookX, lookY);
      camX = U.damp(camX, c.x, 6.5, rdt);
      camY = U.damp(camY, c.y, 5.5, rdt);
    }
    zoomPunch = U.damp(zoomPunch, 0, 9, rdt);    // ease the punch back out
    const sh = G.FX.camOffset();
    G.camera.position.set(camX + sh.x, camY + sh.y, CAM_Z - zoomPunch);
  }
  // a quick camera "kick" (zoom-in) for impacts — hits, hard landings, dashes
  Main.camPunch = amt => { zoomPunch = Math.min(3.2, zoomPunch + (amt || 0.8)); };

  // ---------------- main loop ----------------
  function loop(t) {
    requestAnimationFrame(loop);
    let rdt = Math.min(0.033, Math.max(0.0001, (t - lastT) / 1000));
    lastT = t;
    const I = G.Input;
    if (G.Replay) rdt = G.Replay.frame(rdt);   // record/inject input + (on playback) override dt

    // global keys
    if (I.pressed('mute')) {
      const m = G.Audio.toggleMute();
      if (Main.state !== 'title') G.UI.toast(m ? 'muted' : 'sound on');
    }

    let dt = rdt;
    if (G.hitStop > 0) { G.hitStop -= rdt; dt = 0; }
    else if (G.slowMo > 0) { G.slowMo -= rdt; dt = rdt * (G.slowScale || 0.3); }   // cinematic slow-motion

    // mid menu-transition: hold input, wait for the swarm to cover, then swap behind it
    if (Main.transLock > 0) {
      Main.transLock -= rdt; dt = 0;
      if (Main.transLock <= 0 && Main.transTo) { Main.state = Main.transTo; Main.transTo = null; }
    } else switch (Main.state) {
      case 'title':
        dt = rdt * 0.6;
        buildMenu();
        if (transitioning) break;                 // fading to black after a selection — ignore input
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
        if (transitioning) break;                 // fading to black after a selection — ignore input
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
        if (I.pressed('up')) { Main.pauseIndex = (Main.pauseIndex - 1 + Main.pauseItems.length) % Main.pauseItems.length; G.Audio.sfx('clink'); }
        if (I.pressed('down')) { Main.pauseIndex = (Main.pauseIndex + 1) % Main.pauseItems.length; G.Audio.sfx('clink'); }
        if (I.pressed('confirm') || I.pressed('jump') || I.pressed('attack')) pauseSelect();
        else if (I.pressed('pause')) { if (G.UI.closePause) G.UI.closePause(); Main.state = 'play'; }
        break;
      case 'charms': {
        dt = 0;
        const n = G.Charms.LIST.length;
        if (I.pressed('up')) { Main.charmIndex = (Main.charmIndex - 1 + n) % n; G.Audio.sfx('clink'); }
        if (I.pressed('down')) { Main.charmIndex = (Main.charmIndex + 1) % n; G.Audio.sfx('clink'); }
        if (I.pressed('confirm') || I.pressed('jump') || I.pressed('attack')) { const ok = G.Charms.toggle(G.Charms.LIST[Main.charmIndex].id); G.Audio.sfx(ok ? 'uiBell' : 'clink'); }
        if (I.pressed('pause')) { G.Audio.sfx('clink'); menuGo(Main._charmReturn || 'pause'); }
        break;
      }
      case 'journal': {
        dt = 0;
        const n = (G.Enemies.TYPES || []).length || 1;
        if (I.pressed('up')) { Main.journalIndex = (Main.journalIndex - 1 + n) % n; G.Audio.sfx('clink'); }
        if (I.pressed('down')) { Main.journalIndex = (Main.journalIndex + 1) % n; G.Audio.sfx('clink'); }
        if (I.pressed('pause') || I.pressed('confirm')) { G.Audio.sfx('clink'); menuGo(Main._journalReturn || 'pause'); }
        break;
      }
      case 'bench':
        dt = 0;
        if (I.pressed('up')) { Main.benchIndex = (Main.benchIndex - 1 + Main.benchItems.length) % Main.benchItems.length; G.Audio.sfx('clink'); }
        if (I.pressed('down')) { Main.benchIndex = (Main.benchIndex + 1) % Main.benchItems.length; G.Audio.sfx('clink'); }
        if (I.pressed('confirm') || I.pressed('jump') || I.pressed('attack')) benchSelect();
        else if (I.pressed('pause')) Main.state = 'play';
        break;
      case 'travel': {
        dt = 0;
        const list = G.save.benchList || [];
        if (list.length) {
          if (I.pressed('up')) { Main.travelIndex = (Main.travelIndex - 1 + list.length) % list.length; G.Audio.sfx('clink'); }
          if (I.pressed('down')) { Main.travelIndex = (Main.travelIndex + 1) % list.length; G.Audio.sfx('clink'); }
          if (I.pressed('confirm') || I.pressed('jump') || I.pressed('attack')) travelTo(Main.travelIndex);
        }
        if (I.pressed('pause')) { Main.state = 'bench'; G.Audio.sfx('clink'); }
        break;
      }
      case 'shop': {
        dt = 0;
        const sl = Main.shopList || [];
        if (sl.length) {
          if (I.pressed('up')) { Main.shopIndex = (Main.shopIndex - 1 + sl.length) % sl.length; G.Audio.sfx('clink'); }
          if (I.pressed('down')) { Main.shopIndex = (Main.shopIndex + 1) % sl.length; G.Audio.sfx('clink'); }
          if (I.pressed('confirm') || I.pressed('jump') || I.pressed('attack')) shopBuy();
        }
        if (I.pressed('pause')) { Main.state = 'play'; G.Audio.sfx('clink'); }
        break;
      }
      case 'settings': {
        dt = 0;
        const n = Main.settingsCount || 3;
        if (I.pressed('up')) { Main.settingsIndex = (Main.settingsIndex - 1 + n) % n; G.Audio.sfx('clink'); }
        if (I.pressed('down')) { Main.settingsIndex = (Main.settingsIndex + 1) % n; G.Audio.sfx('clink'); }
        if (I.pressed('left')) settingsAdjust(-1);
        else if (I.pressed('right') || I.pressed('confirm') || I.pressed('jump') || I.pressed('attack')) settingsAdjust(1);
        if (I.pressed('pause')) { G.Audio.sfx('clink'); menuGo(Main._settingsReturn || 'pause'); }
        break;
      }
      case 'controls': {
        dt = 0;
        if (Main.ctrlListening) break;                 // waiting for a key — the input capture handles it
        const items = G.Input.BINDABLE, n = items.length + 1;   // +1 = "Reset to defaults" row
        if (I.pressed('up')) { Main.ctrlIndex = (Main.ctrlIndex - 1 + n) % n; G.Audio.sfx('clink'); }
        if (I.pressed('down')) { Main.ctrlIndex = (Main.ctrlIndex + 1) % n; G.Audio.sfx('clink'); }
        if (I.pressed('confirm') || I.pressed('jump') || I.pressed('attack')) {
          if (Main.ctrlIndex >= items.length) { G.Input.resetBindings(); G.Audio.sfx('uiBell'); }
          else {
            Main.ctrlListening = true; G.Audio.sfx('clink');
            const action = items[Main.ctrlIndex][0];
            G.Input.captureKey(code => { if (code !== 'Escape') G.Input.rebind(action, code); Main.ctrlListening = false; });
          }
        }
        if (I.pressed('pause')) { G.Audio.sfx('clink'); menuGo('settings'); }
        break;
      }
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
        if (I.pressed('jump')) {            // drop a pin at the view centre
          G.save.pins = G.save.pins || [];
          G.save.pins.push({ x: mv.pan.x, y: mv.pan.y });
          if (G.save.pins.length > 12) G.save.pins.shift();
          Main.persist(); G.Audio.sfx('uiBell');
        }
        if (I.pressed('attack') && (G.save.pins || []).length) {   // clear the nearest pin
          let bi = -1, bd = 1e9;
          G.save.pins.forEach((p, i) => { const d = Math.hypot(p.x - mv.pan.x, p.y - mv.pan.y); if (d < bd) { bd = d; bi = i; } });
          if (bi >= 0) { G.save.pins.splice(bi, 1); Main.persist(); G.Audio.sfx('clink'); }
        }
        break;
      }
      case 'play':
        if (I.pressed('pause')) { Main.state = 'pause'; if (G.UI.openPause) G.UI.openPause(); }
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
      case 'prologue':
        dt = rdt;
        if (I.pressed('pause') || I.pressed('confirm') || I.pressed('jump') || I.pressed('attack')) G.Prologue.skip();
        break;
    }

    if (dt > 0) {
      G.time += dt;
      G.World.update(dt);
      if (G.World.updateLook) G.World.updateLook(dt);
      if (G.Weather) G.Weather.update(dt);
      if (Main.state === 'cutscene') G.Cutscene.update(dt);
      else if (Main.state === 'prologue') G.Prologue.update(dt);
      else if (Main.state !== 'title' && Main.state !== 'prologue' && G.player) G.player.update(dt);
      G.FX.update(dt);
    }
    // adaptive music: only count enemies that can actually SEE the player (line of sight within
    // the vicinity), so aggro stops once nothing is engaging — not merely when something is near.
    if (G.Audio.setIntensity) {
      if (Main.state === 'play' && G.player && !G.player.dead && G.room) {
        const px = G.player.body.x, py = G.player.body.y, VIS = 14;
        let danger = 0;
        for (const e of G.room.entities) {
          if (!e.isEnemy || !e.alive || e.type === 'boss') continue;
          const d = Math.abs(e.body.x - px) + Math.abs(e.body.y - py) * 0.6;
          if (d > VIS) continue;
          const sees = e.aggro === true || (G.Physics.los ? G.Physics.los(e.body.x, e.body.y, px, py + 0.4) : true);
          if (sees) danger += (1 - d / VIS);
        }
        G.Audio.setIntensity(Math.min(1, danger * 0.6));
      } else G.Audio.setIntensity(0);
    }
    G.Audio.update(rdt);
    if (G.Lights) G.Lights.update(rdt, G.time);
    if (G.EventGraph) G.EventGraph.update(rdt);
    updateCamera(dt, rdt);

    if (G.Post && G.Post.enabled) G.Post.render(rdt);
    else G.renderer.render(G.scene, G.camera);
    G.UI.draw(rdt);
    I.update();
    if (G.Profiler) G.Profiler.tick();
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
