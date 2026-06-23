// MOSSVEIL — input.js : keyboard input with edge detection + rebindable, saved bindings
(function () {
  const DEFAULT_MAP = {
    left: ['ArrowLeft', 'KeyA'],
    right: ['ArrowRight', 'KeyD'],
    up: ['ArrowUp', 'KeyW'],
    down: ['ArrowDown', 'KeyS'],
    jump: ['KeyZ', 'Space'],
    attack: ['KeyX', 'KeyJ'],
    dash: ['KeyC', 'KeyK', 'ShiftLeft', 'ShiftRight'],
    cast: ['KeyF', 'KeyL'],
    interact: ['KeyE'],
    pause: ['Escape', 'KeyP'],
    map: ['KeyM'],
    mute: ['KeyU'],
    zoomIn: ['Equal', 'NumpadAdd'],
    zoomOut: ['Minus', 'NumpadSubtract'],
    confirm: ['Enter'],
    newgame: ['KeyN'],
    del: ['Delete', 'Backspace']
  };
  // the actions the player can rebind in the Controls menu (ordered), with friendly labels
  const BINDABLE = [
    ['left', 'Move left'], ['right', 'Move right'], ['up', 'Up / look up'], ['down', 'Down / drop'],
    ['jump', 'Jump'], ['attack', 'Strike'], ['dash', 'Dash'], ['cast', 'Focus / cast'],
    ['interact', 'Interact'], ['pause', 'Pause'], ['map', 'World map'], ['mute', 'Mute'],
    ['zoomIn', 'Map zoom in'], ['zoomOut', 'Map zoom out']
  ];
  const BIND_KEY = 'mossveil-keybinds';

  let map = clone(DEFAULT_MAP);
  loadBinds();
  const codeToActions = {};
  rebuildCodes();

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function rebuildCodes() {
    for (const k in codeToActions) delete codeToActions[k];
    for (const a in map) for (const c of map[a]) (codeToActions[c] = codeToActions[c] || []).push(a);
  }
  function loadBinds() {
    try {
      const s = JSON.parse(localStorage.getItem(BIND_KEY));
      if (s && typeof s === 'object') for (const a in DEFAULT_MAP) if (Array.isArray(s[a])) map[a] = s[a].slice();
    } catch (e) { }
  }
  function saveBinds() { try { localStorage.setItem(BIND_KEY, JSON.stringify(map)); } catch (e) { } }

  // pretty label for a key code, e.g. KeyX -> "X", ArrowLeft -> "←", ShiftLeft -> "L-Shift"
  const PRETTY = {
    ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: 'Space',
    ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl',
    Escape: 'Esc', Enter: 'Enter', Backspace: 'Backspace', Delete: 'Del', Tab: 'Tab',
    Equal: '=', Minus: '−', NumpadAdd: 'Num +', NumpadSubtract: 'Num −', Backquote: '`',
    Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: '\'', BracketLeft: '[', BracketRight: ']', Backslash: '\\'
  };
  function keyLabel(code) {
    if (!code) return '—';
    if (PRETTY[code]) return PRETTY[code];
    if (code.indexOf('Key') === 0) return code.slice(3);
    if (code.indexOf('Digit') === 0) return code.slice(5);
    if (code.indexOf('Numpad') === 0) return 'Num ' + code.slice(6);
    return code;
  }

  const isDown = {}, wasPressed = {}, wasReleased = {};
  let any = false, playbackMode = false;   // playbackMode: real keys ignored, input injected (Replay)
  let captureCb = null;                    // when set, the next keydown is captured (for rebinding)

  const prevent = new Set(['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

  addEventListener('keydown', e => {
    if (captureCb) { e.preventDefault(); if (e.repeat) return; const cb = captureCb; captureCb = null; cb(e.code); return; }
    const as = codeToActions[e.code];
    if (prevent.has(e.code) || as) e.preventDefault();
    if (e.repeat || playbackMode) return;
    any = true;
    if (as) for (const a of as) { isDown[a] = true; wasPressed[a] = true; }
  });
  addEventListener('keyup', e => {
    if (playbackMode) return;
    const as = codeToActions[e.code];
    if (as) for (const a of as) { isDown[a] = false; wasReleased[a] = true; }
  });
  addEventListener('blur', () => { for (const a in isDown) isDown[a] = false; });

  G.Input = {
    down: a => !!isDown[a],
    pressed: a => !!wasPressed[a],
    released: a => !!wasReleased[a],
    axisX: () => (isDown.right ? 1 : 0) - (isDown.left ? 1 : 0),
    anyPressed: () => any,
    // on-screen touch controls feed input through these (mirror keydown/keyup)
    virtualDown(a) { if (!isDown[a]) { isDown[a] = true; wasPressed[a] = true; any = true; } },
    virtualUp(a) { if (isDown[a]) { isDown[a] = false; wasReleased[a] = true; } },

    // ---- rebindable key bindings (Controls menu) ----
    BINDABLE,
    binding: a => (map[a] || []).slice(),                 // current key codes for an action
    keyLabel,                                             // pretty-print a code
    bindingLabel: a => ((map[a] || []).map(keyLabel).join('  /  ') || '—'),
    capturing: () => !!captureCb,
    captureKey(cb) { captureCb = cb; },                   // next keydown -> cb(code); Esc should cancel in cb
    cancelCapture() { captureCb = null; },
    rebind(action, code) {                                // assign `code` to `action`, freeing it from others
      if (!map[action] || !code) return;
      for (const a in map) map[a] = map[a].filter(c => c !== code);
      map[action] = [code];
      rebuildCodes(); saveBinds();
    },
    resetBindings() { map = clone(DEFAULT_MAP); rebuildCodes(); saveBinds(); },

    // ---- record & replay (G.Replay) ----
    snapshot() { const s = {}; for (const a in map) if (isDown[a]) s[a] = 1; return s; },
    inject(snap) {                                   // set held state from a recorded snapshot, deriving edges
      for (const a in map) {
        const now = !!(snap && snap[a]), before = !!isDown[a];
        if (now && !before) wasPressed[a] = true;
        if (!now && before) wasReleased[a] = true;
        isDown[a] = now;
      }
      any = true;
    },
    playback(on) { playbackMode = !!on; if (!on) for (const a in isDown) isDown[a] = false; },
    // call at end of frame
    update() {
      for (const a in wasPressed) wasPressed[a] = false;
      for (const a in wasReleased) wasReleased[a] = false;
      any = false;
    }
  };
})();
