// MOSSVEIL — input.js : keyboard input with edge detection + rebindable, saved bindings
(function () {
  const DEFAULT_MAP = {
    left: ['ArrowLeft', 'KeyA', 'Pad14'],
    right: ['ArrowRight', 'KeyD', 'Pad15'],
    up: ['ArrowUp', 'KeyW', 'Pad12'],
    down: ['ArrowDown', 'KeyS', 'Pad13'],
    jump: ['KeyZ', 'Space', 'Pad0'],
    attack: ['KeyX', 'KeyJ', 'Pad2'],
    dash: ['KeyC', 'KeyK', 'ShiftLeft', 'ShiftRight', 'Pad1', 'Pad5'],
    cast: ['KeyF', 'KeyL', 'Pad3'],
    interact: ['KeyE', 'Pad7'],
    pause: ['Escape', 'KeyP', 'Pad9'],
    map: ['KeyM', 'Pad8'],
    mute: ['KeyU'],
    zoomIn: ['Equal', 'NumpadAdd', 'Pad5'],
    zoomOut: ['Minus', 'NumpadSubtract', 'Pad4'],
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
  // gamepad button glyphs (index -> label), auto-switched for Xbox vs PlayStation pads
  const XBOX = { 0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT', 8: 'Back', 9: 'Start', 10: 'L3', 11: 'R3', 12: 'D↑', 13: 'D↓', 14: 'D←', 15: 'D→', 16: 'Guide' };
  const PS = { 0: '✕', 1: '○', 2: '□', 3: '△', 4: 'L1', 5: 'R1', 6: 'L2', 7: 'R2', 8: 'Share', 9: 'Options', 10: 'L3', 11: 'R3', 12: 'D↑', 13: 'D↓', 14: 'D←', 15: 'D→', 16: 'PS' };
  let padGlyphs = XBOX;
  function keyLabel(code) {
    if (!code) return '—';
    if (code.indexOf('Pad') === 0) { const g = padGlyphs[+code.slice(3)]; return g ? ('🎮' + g) : ('🎮' + code.slice(3)); }
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

  // ---- gamepad: polled once per frame; buttons feed the same action edges as keys,
  // the left stick reads live for movement (so it never fights held keys/d-pad) ----
  let padIndex = -1, lastAxX = 0, lastAxY = 0;
  const padPrev = [], stickPrev = {};
  const STICK = 0.5;
  function detectGlyphs(id) {
    id = id || '';
    if (/xbox|xinput|045e/i.test(id)) return XBOX;
    return /playstation|dualshock|dualsense|054c|wireless controller/i.test(id) ? PS : XBOX;
  }
  function stickEdge(a, on) { if (on && !stickPrev[a]) { wasPressed[a] = true; any = true; } else if (!on && stickPrev[a]) { wasReleased[a] = true; } stickPrev[a] = on; }
  function pollGamepad() {
    if (playbackMode || typeof navigator === 'undefined' || !navigator.getGamepads) return;
    let gp = null; const pads = navigator.getGamepads();
    for (const p of pads) if (p && p.connected) { gp = p; break; }
    if (!gp) { padIndex = -1; return; }
    if (padIndex !== gp.index) { padIndex = gp.index; padGlyphs = detectGlyphs(gp.id); }
    for (let i = 0; i < gp.buttons.length; i++) {
      const pressed = gp.buttons[i].pressed || gp.buttons[i].value > 0.5, was = padPrev[i];
      if (pressed && !was) {
        if (captureCb) { const cb = captureCb; captureCb = null; cb('Pad' + i); }
        else { const as = codeToActions['Pad' + i]; if (as) for (const a of as) { isDown[a] = true; wasPressed[a] = true; any = true; } }
      } else if (!pressed && was) {
        const as = codeToActions['Pad' + i]; if (as) for (const a of as) { isDown[a] = false; wasReleased[a] = true; }
      }
      padPrev[i] = pressed;
    }
    lastAxX = gp.axes[0] || 0; lastAxY = gp.axes[1] || 0;
    stickEdge('left', lastAxX < -STICK); stickEdge('right', lastAxX > STICK);
    stickEdge('up', lastAxY < -STICK); stickEdge('down', lastAxY > STICK);
  }
  // held state including the live analog stick (stick never mutates isDown — read fresh here)
  function held(a) {
    if (isDown[a]) return true;
    if (a === 'left') return lastAxX < -STICK; if (a === 'right') return lastAxX > STICK;
    if (a === 'up') return lastAxY < -STICK; if (a === 'down') return lastAxY > STICK;
    return false;
  }
  function rumble(strong, weak, ms) {
    if (typeof navigator === 'undefined' || !navigator.getGamepads || padIndex < 0) return;
    const gp = navigator.getGamepads()[padIndex];
    const act = gp && (gp.vibrationActuator || (gp.hapticActuators && gp.hapticActuators[0]));
    if (act && act.playEffect) { try { act.playEffect('dual-rumble', { duration: ms || 120, strongMagnitude: Math.min(1, strong || 0.4), weakMagnitude: Math.min(1, weak != null ? weak : strong || 0.4) }); } catch (e) { } }
  }

  G.Input = {
    down: held,
    pressed: a => !!wasPressed[a],
    released: a => !!wasReleased[a],
    axisX: () => (held('right') ? 1 : 0) - (held('left') ? 1 : 0),
    anyPressed: () => any,
    pollGamepad, rumble,
    padConnected: () => padIndex >= 0,
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
