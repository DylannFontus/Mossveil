// MOSSVEIL — main.js : boot, camera, game states, transitions, save
(function () {
  const U = G.U;
  const Main = G.Main = { state: 'title', endingT: 0 };

  const CAM_Z = 30, FOV = 32;
  const SAVE_KEY = 'mossveil-save-v1';

  let camX = 0, camY = 0;
  let titleDrift = 0;
  let transitioning = false;
  let seenRooms = {};
  let lastT = 0;

  // ---------------- save ----------------
  function loadSave() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (s && typeof s === 'object') return s;
    } catch (e) { /* corrupted save -> fresh */ }
    return {};
  }
  Main.persist = () => {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(G.save)); } catch (e) { }
  };
  function eraseSave() {
    G.save = {};
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { }
  }

  // ---------------- main menu ----------------
  Main.menuIndex = 0;
  Main.menuItems = [];
  Main.confirm = null;   // { message, onYes, sel }

  function buildMenu() {
    Main.menuItems = [
      { label: 'New Game', enabled: true, action: menuNewGame },
      { label: 'Continue', enabled: !isNewSave(), action: () => startGame(false) },
      { label: 'Load Save', enabled: true, action: loadSaveFromFile },
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
  function menuNewGame() {
    if (isNewSave()) { startGame(true); return; }
    Main.confirm = {
      message: 'Overwrite your existing save and start anew?',
      sel: 1,                          // default to "No" for safety
      onYes: () => startGame(true)
    };
  }

  function exitGame() {
    try { window.close(); } catch (e) { }
    Main.state = 'exited';
  }

  let fileInput = null;
  function loadSaveFromFile() {
    if (!fileInput) {
      fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = '.json,application/json';
      fileInput.style.display = 'none';
      document.body.appendChild(fileInput);
      fileInput.addEventListener('change', () => {
        const f = fileInput.files && fileInput.files[0];
        fileInput.value = '';
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const data = JSON.parse(reader.result);
            if (!data || typeof data !== 'object' || Array.isArray(data)) throw 0;
            G.save = data;
            Main.persist();
            startGame(false);
          } catch (e) { alert('That does not look like a valid MOSSVEIL save file.'); }
        };
        reader.readAsText(f);
      });
    }
    fileInput.click();
  }

  // pointer support for the title menu / confirm dialog
  function pointerToMenu(e) {
    if (Main.confirm) {
      const btns = G.UI.confirmButtons || [];
      for (const b of btns) if (e.clientX >= b.x && e.clientX <= b.x + b.w && e.clientY >= b.y && e.clientY <= b.y + b.h) return { confirm: b.yes };
      return null;
    }
    const btns = G.UI.titleButtons || [];
    for (const b of btns) if (b.enabled && e.clientX >= b.x && e.clientX <= b.x + b.w && e.clientY >= b.y && e.clientY <= b.y + b.h) return { index: b.index };
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

    G.save = loadSave();
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

    // title-menu mouse: hover to highlight, click to choose
    addEventListener('mousemove', e => {
      if (Main.state !== 'title' || Main.confirm) return;
      const hit = pointerToMenu(e);
      if (hit && hit.index !== undefined) Main.menuIndex = hit.index;
    });
    addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      if (Main.state === 'exited') { Main.state = 'title'; return; }
      if (Main.state !== 'title') return;
      const hit = pointerToMenu(e);
      if (!hit) return;
      if (Main.confirm) {
        const ok = hit.confirm; const c = Main.confirm; Main.confirm = null;
        if (ok) c.onYes();
      } else if (hit.index !== undefined) {
        Main.menuIndex = hit.index;
        menuActivate();
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
    if (newGame) eraseSave();
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
        if (Main.confirm) {
          if (I.pressed('left') || I.pressed('right') || I.pressed('up') || I.pressed('down')) {
            Main.confirm.sel ^= 1; G.Audio.sfx('clink');
          }
          if (I.pressed('confirm') || I.pressed('jump') || I.pressed('attack')) {
            const c = Main.confirm; Main.confirm = null;
            G.Audio.sfx('uiBell');
            if (c.sel === 0) c.onYes();
          } else if (I.pressed('pause')) Main.confirm = null;
        } else {
          if (I.pressed('up')) menuStep(-1);
          if (I.pressed('down')) menuStep(1);
          if (I.pressed('confirm') || I.pressed('jump') || I.pressed('attack')) menuActivate();
          if (I.pressed('newgame')) menuNewGame();
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
