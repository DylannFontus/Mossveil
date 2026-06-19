// MOSSVEIL — touch.js : on-screen controls for touch devices (e.g. iPad gameplay).
// Builds a DOM overlay of buttons that feed G.Input via virtualDown/virtualUp, so the
// game plays identically to keyboard. Hidden entirely on non-touch devices.
(function () {
  const isTouch = (window.matchMedia && matchMedia('(pointer: coarse)').matches)
    || ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0;
  if (!isTouch) return;

  const I = G.Input;

  const css = document.createElement('style');
  css.textContent = `
    #touch { position:fixed; inset:0; z-index:40; pointer-events:none;
      font-family:Georgia,serif; -webkit-user-select:none; user-select:none; }
    #touch .b { position:absolute; pointer-events:auto; touch-action:none; -webkit-user-select:none;
      display:none; align-items:center; justify-content:center; text-align:center; color:#e7f2ec;
      background:rgba(18,30,26,0.40); border:1px solid rgba(150,200,170,0.34); border-radius:50%;
      box-shadow:0 2px 12px rgba(0,0,0,0.4); -webkit-backdrop-filter:blur(2px); backdrop-filter:blur(2px);
      transition:background .05s, transform .05s; }
    #touch .b.show { display:flex; }
    #touch .b.on { background:rgba(74,150,104,0.62); border-color:rgba(210,245,220,0.85); transform:scale(0.94); }
    #touch .dir { width:72px; height:72px; font-size:32px; }
    #touch .act { width:88px; height:88px; font-size:13px; flex-direction:column; line-height:1.05; }
    #touch .act .g { font-size:27px; }
    #touch .mini { width:54px; height:54px; border-radius:15px; font-size:23px; }
    #touch .ctx { width:auto; height:auto; padding:14px 30px; border-radius:30px; font-size:20px; }
    @media (max-height:520px){ #touch .dir{width:60px;height:60px} #touch .act{width:74px;height:74px} }
  `;
  document.head.appendChild(css);

  const root = document.createElement('div');
  root.id = 'touch';
  document.body.appendChild(root);

  // a button: held actions use `action` (down on press, up on release);
  // momentary actions use `tap` (a single edge press).
  function btn(opt) {
    const b = document.createElement('div');
    b.className = 'b ' + (opt.cls || '');
    b.innerHTML = opt.html;
    for (const k in (opt.css || {})) b.style[k] = opt.css[k];
    root.appendChild(b);
    const down = e => {
      e.preventDefault();
      b.classList.add('on');
      try { b.setPointerCapture(e.pointerId); } catch (_) { }
      if (opt.action) I.virtualDown(opt.action);
      if (opt.tap) { I.virtualDown(opt.tap); I.virtualUp(opt.tap); }
    };
    const up = e => { b.classList.remove('on'); if (opt.action) I.virtualUp(opt.action); try { b.releasePointerCapture(e.pointerId); } catch (_) { } };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('contextmenu', e => e.preventDefault());
    b._show = opt.show;          // fn(state) -> bool
    b._label = opt.label;        // optional fn(state) -> html
    return b;
  }

  const PLAY = s => s === 'play';
  const buttons = [];
  const add = o => buttons.push(btn(o));

  // ---- D-pad (bottom-left) ----
  const dShow = s => s === 'play' || s === 'map';
  add({ cls: 'dir', html: '▲', action: 'up', show: dShow, css: { left: '82px', bottom: '144px' } });
  add({ cls: 'dir', html: '◀', action: 'left', show: dShow, css: { left: '14px', bottom: '76px' } });
  add({ cls: 'dir', html: '▶', action: 'right', show: dShow, css: { left: '150px', bottom: '76px' } });
  add({ cls: 'dir', html: '▼', action: 'down', show: dShow, css: { left: '82px', bottom: '8px' } });

  // ---- action cluster (bottom-right) ----
  add({ cls: 'act', html: '<span class="g">⤒</span><span>JUMP</span>', action: 'jump', show: PLAY, css: { right: '22px', bottom: '22px' } });
  add({ cls: 'act', html: '<span class="g">✦</span><span>STRIKE</span>', action: 'attack', show: PLAY, css: { right: '118px', bottom: '58px' } });
  add({ cls: 'act', html: '<span class="g">»</span><span>DASH</span>', action: 'dash', show: PLAY, css: { right: '30px', bottom: '124px' } });
  add({ cls: 'act', html: '<span class="g">✺</span><span>FOCUS</span>', action: 'cast', show: PLAY, css: { right: '126px', bottom: '160px' } });

  // ---- top-right: pause + map ----
  add({ cls: 'mini', html: '⏸', tap: 'pause', show: s => s === 'play' || s === 'pause', css: { right: '14px', top: '14px' } });
  add({ cls: 'mini', html: '🗺', tap: 'map', show: s => s === 'play' || s === 'map', css: { right: '80px', top: '14px' } });

  // ---- context button (top-right corner): skip a cutscene / advance the ending ----
  add({
    cls: 'ctx', html: 'Skip ⏭', tap: 'confirm', css: { top: '16px', right: '16px' },
    show: s => s === 'cutscene' || s === 'ending',
    label: s => s === 'ending' ? 'Continue' : 'Skip ⏭'
  });

  // visibility follows the game state
  function tick() {
    const s = (G.Main && G.Main.state) || 'title';
    for (const b of buttons) {
      const on = b._show(s);
      b.classList.toggle('show', on);
      if (on && b._label) b.innerHTML = b._label(s);
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  G.Touch = { active: true };
})();
