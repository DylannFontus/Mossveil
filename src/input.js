// MOSSVEIL — input.js : keyboard input with edge detection
(function () {
  const map = {
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
  const codeToActions = {};
  for (const a in map) for (const c of map[a]) (codeToActions[c] = codeToActions[c] || []).push(a);

  const isDown = {}, wasPressed = {}, wasReleased = {};
  let any = false;

  const prevent = new Set(['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

  addEventListener('keydown', e => {
    if (prevent.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    any = true;
    const as = codeToActions[e.code];
    if (as) for (const a of as) { isDown[a] = true; wasPressed[a] = true; }
  });
  addEventListener('keyup', e => {
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
    // call at end of frame
    update() {
      for (const a in wasPressed) wasPressed[a] = false;
      for (const a in wasReleased) wasReleased[a] = false;
      any = false;
    }
  };
})();
