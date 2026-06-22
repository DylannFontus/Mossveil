// MOSSVEIL — eventgraph.js : a small visual-scripting runtime. Each level may carry a
// `graph` { nodes, links } authored in the editor's Logic tab. Event nodes (room enter,
// zone, timer, signal, boss death) start exec chains that flow through condition and
// action nodes. The interpreter runs only during gameplay; the editor uses EG.TYPES to
// build the node palette. No data flow yet — just exec flow (one output -> many inputs).
(function () {
  const W = G.World;
  const EG = G.EventGraph = {
    nodes: [], links: [], _by: {}, _pending: [], _t: 0,
    _zoneState: {}, _fired: {}, _roomEnter: false
  };

  // ---- node type registry (shared by runtime + editor palette) ----
  // kind: event | cond | action ; ins/outs = exec pin counts ; params = editable fields
  const T = EG.TYPES = {
    onRoomEnter: { kind: 'event', title: 'On Room Enter', outs: 1, params: [] },
    onTimer:     { kind: 'event', title: 'On Timer', outs: 1, params: [{ k: 'delay', label: 'Delay s', def: 1 }] },
    onZone:      { kind: 'event', title: 'On Enter Zone', outs: 1, params: [{ k: 'x', def: 0 }, { k: 'y', def: 0 }, { k: 'w', def: 4 }, { k: 'h', def: 4 }, { k: 'once', type: 'bool', def: true }] },
    onSignal:    { kind: 'event', title: 'On Signal', outs: 1, params: [{ k: 'name', def: 'sig' }] },
    onBossDeath: { kind: 'event', title: 'On Boss Death', outs: 1, params: [{ k: 'id', def: '' }] },

    ifFlag:      { kind: 'cond', title: 'If Flag', ins: 1, outs: 2, outLabels: ['true', 'false'], params: [{ k: 'flag', def: '' }] },
    chance:      { kind: 'cond', title: 'Chance %', ins: 1, outs: 2, outLabels: ['hit', 'miss'], params: [{ k: 'pct', def: 50 }] },

    setActive:   { kind: 'action', title: 'Set Active', ins: 1, outs: 1, params: [{ k: 'oid', def: 0 }, { k: 'level', def: '' }, { k: 'on', type: 'bool', def: true }] },
    setFlag:     { kind: 'action', title: 'Set Flag', ins: 1, outs: 1, params: [{ k: 'flag', def: '' }, { k: 'on', type: 'bool', def: true }] },
    signal:      { kind: 'action', title: 'Emit Signal', ins: 1, outs: 1, params: [{ k: 'name', def: 'sig' }] },
    wait:        { kind: 'action', title: 'Wait', ins: 1, outs: 1, params: [{ k: 'secs', def: 1 }] },
    sound:       { kind: 'action', title: 'Play Sound', ins: 1, outs: 1, params: [{ k: 'name', def: 'clink' }] },
    shake:       { kind: 'action', title: 'Camera Shake', ins: 1, outs: 1, params: [{ k: 'amount', def: 0.6 }] },
    flash:       { kind: 'action', title: 'Screen Flash', ins: 1, outs: 1, params: [{ k: 'amount', def: 0.4 }, { k: 'color', type: 'color', def: '#ffffff' }] },
    cutscene:    { kind: 'action', title: 'Play Cutscene', ins: 1, outs: 1, params: [{ k: 'id', def: '' }] },
    text:        { kind: 'action', title: 'Show Text', ins: 1, outs: 1, params: [{ k: 'text', def: '' }, { k: 'secs', def: 2.5 }] }
  };

  function param(n, k, d) { const p = n.p || {}; return (p[k] !== undefined && p[k] !== '') ? p[k] : d; }

  EG.load = function (graph) {
    EG.nodes = (graph && graph.nodes) ? graph.nodes : [];
    EG.links = (graph && graph.links) ? graph.links : [];
    EG._by = {}; for (const n of EG.nodes) EG._by[n.id] = n;
    EG._pending = []; EG._t = 0; EG._zoneState = {}; EG._fired = {};
    EG._roomEnter = EG.nodes.length > 0;
  };

  // follow every exec link from node `n`'s output pin `op` and run the targets
  function execOut(n, op) {
    const links = EG.links;
    for (let i = 0; i < links.length; i++) {
      const l = links[i];
      if (l.from === n.id && (l.fp | 0) === (op | 0)) { const t = EG._by[l.to]; if (t) runNode(t); }
    }
  }

  function runNode(n) {
    const def = T[n.type]; if (!def) return;
    switch (n.type) {
      case 'ifFlag': { const f = G.save && G.save.flags && G.save.flags[param(n, 'flag', '')]; execOut(n, f ? 0 : 1); return; }
      case 'chance': { execOut(n, (Math.random() * 100 < param(n, 'pct', 50)) ? 0 : 1); return; }
      case 'wait': { EG._pending.push({ id: n.id, t: +param(n, 'secs', 1) || 0 }); return; }
      default: break;
    }
    doAction(n);
    if (def.kind === 'action') execOut(n, 0);
  }

  function doAction(n) {
    const P = G.Post, S = G.save || (G.save = {});
    try {
      switch (n.type) {
        case 'setActive':
          if (W && W.applyActiveTargets)
            W.applyActiveTargets([{ level: param(n, 'level', '') || (G.room && G.room.id), oid: param(n, 'oid', 0) | 0, state: param(n, 'on', true) ? 'on' : 'off' }]);
          break;
        case 'setFlag':
          S.flags = S.flags || {}; S.flags[param(n, 'flag', '')] = !!param(n, 'on', true);
          if (G.Main && G.Main.persist) G.Main.persist();
          break;
        case 'signal': EG.signal(param(n, 'name', 'sig')); break;
        case 'sound': if (G.Audio && G.Audio.sfx) G.Audio.sfx(param(n, 'name', 'clink')); break;
        case 'shake':
          if (G.FX && G.FX.shake) G.FX.shake(+param(n, 'amount', 0.6));
          else if (P && P.punch) P.punch(+param(n, 'amount', 0.6));
          break;
        case 'flash': if (P && P.flash) P.flash(+param(n, 'amount', 0.4), param(n, 'color', '#ffffff')); break;
        case 'cutscene': {
          const id = param(n, 'id', '');
          if (id && G.Cutscene && G.CUTSCENES && G.CUTSCENES[id] && G.Cutscene.play) G.Cutscene.play(G.CUTSCENES[id]);
          break;
        }
        case 'text': if (G.UI && G.UI.banner) G.UI.banner(param(n, 'text', ''), +param(n, 'secs', 2.5)); break;
      }
    } catch (e) { /* never let a graph action crash the frame */ }
  }

  // ---- external event entry points ----
  EG.signal = function (name) {
    for (const n of EG.nodes) if (n.type === 'onSignal' && param(n, 'name', 'sig') === name) execOut(n, 0);
  };
  EG.bossDeath = function (id) {
    for (const n of EG.nodes) if (n.type === 'onBossDeath') { const want = param(n, 'id', ''); if (!want || want === id) execOut(n, 0); }
  };

  EG.update = function (dt) {
    if (!EG.nodes.length) return;
    if (!(G.Main && G.Main.state === 'play')) return;   // gameplay only
    // room enter (first gameplay frame after a load)
    if (EG._roomEnter) {
      EG._roomEnter = false; EG._t = 0;
      for (const n of EG.nodes) if (n.type === 'onRoomEnter') execOut(n, 0);
    }
    EG._t += dt;
    // timers (one-shot per room session)
    for (const n of EG.nodes) {
      if (n.type === 'onTimer' && !EG._fired['t' + n.id] && EG._t >= +param(n, 'delay', 1)) {
        EG._fired['t' + n.id] = true; execOut(n, 0);
      }
    }
    // zone enters
    const pl = G.player;
    if (pl && pl.body && !pl.dead) {
      for (const n of EG.nodes) {
        if (n.type !== 'onZone') continue;
        const z = { x: +param(n, 'x', 0), y: +param(n, 'y', 0), w: +param(n, 'w', 4), h: +param(n, 'h', 4) };
        const over = G.U ? G.U.overlap(pl.body, z) : aabb(pl.body, z);
        if (over && !EG._zoneState[n.id]) {
          EG._zoneState[n.id] = true;
          if (!(param(n, 'once', true) && EG._fired['z' + n.id])) { EG._fired['z' + n.id] = true; execOut(n, 0); }
        } else if (!over) EG._zoneState[n.id] = false;
      }
    }
    // pending waits
    for (let i = EG._pending.length - 1; i >= 0; i--) {
      const w = EG._pending[i]; w.t -= dt;
      if (w.t <= 0) { EG._pending.splice(i, 1); const nn = EG._by[w.id]; if (nn) execOut(nn, 0); }
    }
  };

  function aabb(a, b) {
    return Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;
  }
})();
