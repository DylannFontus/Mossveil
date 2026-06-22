// MOSSVEIL — profiler.js : an in-engine performance overlay (toggle with F3, works in
// both the game and the editor). Shows FPS / frame time with a rolling graph, WebGL draw
// calls + triangles + resource counts, the active post-processing passes, dynamic light
// count, and JS heap. Driven by G.Profiler.tick(), called once per frame from each loop.
(function () {
  const P = G.Profiler = { enabled: false };
  let el, txt, cv, ctx, lastT = 0, acc = 0, frames = 0, fps = 0, redrawAcc = 0;
  const ftHist = [], GRAPH_W = 200, GRAPH_H = 40, MAXMS = 50;

  function ensure() {
    if (el) return;
    el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:8px;top:8px;z-index:99999;font:11px/1.4 ui-monospace,Consolas,monospace;' +
      'color:#a8f0d6;background:rgba(6,12,12,.82);border:1px solid rgba(120,200,180,.28);border-radius:7px;' +
      'padding:8px 10px;pointer-events:none;white-space:pre;text-shadow:0 1px 2px #000;min-width:' + GRAPH_W + 'px';
    txt = document.createElement('div');
    cv = document.createElement('canvas'); cv.width = GRAPH_W; cv.height = GRAPH_H;
    cv.style.cssText = 'display:block;margin-top:6px;border-radius:3px';
    el.appendChild(txt); el.appendChild(cv);
    document.body.appendChild(el);
    ctx = cv.getContext('2d');
  }

  function fmt(n) { return n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : '' + n; }

  function redraw() {
    const r = G.renderer, info = r ? r.info : null;
    const ft = ftHist.length ? ftHist[ftHist.length - 1] : 0;
    let mn = 1e9, mx = 0, sum = 0;
    for (const v of ftHist) { mn = Math.min(mn, v); mx = Math.max(mx, v); sum += v; }
    const avg = ftHist.length ? sum / ftHist.length : 0;
    const lines = [];
    lines.push('FPS ' + fps.toFixed(0).padStart(3) + '   ' + ft.toFixed(1) + ' ms');
    lines.push('avg ' + avg.toFixed(1) + '  peak ' + mx.toFixed(1) + ' ms');
    if (info) {
      lines.push('draws ' + info.render.calls + '   tris ' + fmt(info.render.triangles));
      lines.push('geo ' + info.memory.geometries + '  tex ' + info.memory.textures +
        '  prog ' + (info.programs ? info.programs.length : '?'));
    }
    if (G.Lights) lines.push('lights ' + G.Lights.list.length + (G.Lights.sdfTex ? '  sdf✓' : ''));
    if (G.Post) {
      const fx = [];
      if (G.Post.lighting) fx.push('light');
      if (G.Post.shadows) fx.push('shadow');
      if (G.Post.ssao > 0) fx.push('ssao');
      if (G.Post.motion > 0) fx.push('mblur');
      const tm = ['none', 'aces', 'agx'][G.Post.tonemap | 0];
      lines.push('post ' + (G.Post.enabled ? fx.join(' ') : 'off'));
      lines.push('tone ' + tm + '  quality ' + (G.Post.quality || '?'));
    }
    if (performance.memory) lines.push('heap ' + (performance.memory.usedJSHeapSize / 1048576).toFixed(0) + ' mb');
    txt.textContent = lines.join('\n');

    // rolling frame-time graph
    ctx.clearRect(0, 0, GRAPH_W, GRAPH_H);
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, 0, GRAPH_W, GRAPH_H);
    // 60fps (16.7ms) and 30fps (33.3ms) reference lines
    for (const ms of [16.7, 33.3]) {
      const y = GRAPH_H - (ms / MAXMS) * GRAPH_H;
      ctx.strokeStyle = ms < 20 ? 'rgba(120,210,160,.35)' : 'rgba(210,170,90,.3)';
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(GRAPH_W, y); ctx.stroke();
    }
    ctx.strokeStyle = '#6fe6b0'; ctx.lineWidth = 1; ctx.beginPath();
    const n = ftHist.length;
    for (let i = 0; i < n; i++) {
      const x = (i / (180 - 1)) * GRAPH_W;
      const y = GRAPH_H - Math.min(1, ftHist[i] / MAXMS) * GRAPH_H;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  }

  // called once per frame from the game / editor render loop (after the render)
  P.tick = function () {
    if (!P.enabled) return;
    const now = performance.now();
    const dt = lastT ? now - lastT : 16; lastT = now;
    ftHist.push(dt); if (ftHist.length > 180) ftHist.shift();
    acc += dt; frames++; redrawAcc += dt;
    if (acc >= 500) { fps = frames / acc * 1000; frames = 0; acc = 0; }
    if (redrawAcc >= 250) { redrawAcc = 0; redraw(); }     // reads this frame's renderer.info
    if (G.renderer && G.renderer.info) G.renderer.info.reset();   // ...then reset for next frame
  };

  P.toggle = function () {
    P.enabled = !P.enabled;
    ensure();
    el.style.display = P.enabled ? 'block' : 'none';
    if (G.renderer && G.renderer.info) {
      G.renderer.info.autoReset = !P.enabled;   // we reset manually per frame while profiling
      if (P.enabled) G.renderer.info.reset();
    }
    lastT = performance.now();
  };

  window.addEventListener('keydown', function (e) {
    if (e.key === 'F3') { e.preventDefault(); P.toggle(); }
  });
})();
