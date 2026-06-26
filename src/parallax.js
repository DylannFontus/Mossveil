// MOSSVEIL — parallax.js : backdrop / parallax-layer depths & silhouette tuning (G.Parallax).
// The room backdrop is a gradient sky plane (z=-80), a textured wall (z=-48) and three receding
// SILHOUETTE layers (z=-30/-18/-9) built by world.js buildLayer(). Because the camera is a real
// perspective camera looking at the z=0 gameplay plane, those depths ARE the parallax — a layer at
// -9 slides under the camera faster than one at -30. All of that (the plane depths, the layer list,
// and the per-depth silhouette derivation: margin, ground bias, scale, hump height, decoration
// density & size) was hardcoded. It lives here as a data overlay (data/parallax.js -> G.PARALLAX_DATA)
// so the in-editor Parallax editor can add/move/retune layers. A FULL default overlay reproduces every
// literal exactly, so a fresh room is byte-identical. No THREE at load (gen-data node-evals it);
// world.js reads these via G.Parallax.* with a literal fallback at room-build time.
(function () {
  const P = G.Parallax = {};
  const clone = o => JSON.parse(JSON.stringify(o));
  const num = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : d;
  const clamp = (v, lo, hi, d) => Math.max(lo, Math.min(hi, num(v, d)));

  const DEFAULTS = {
    sky: -80,      // gradient sky plane depth
    wall: -48,     // textured wall plane depth
    // the receding silhouette layers (nearest last). z = depth; density scales decoration spacing
    // (>1 = denser), scale scales silhouette size. density/scale of 1 = byte-identical to the old code.
    layers: [
      { z: -30, density: 1, scale: 1 },
      { z: -18, density: 1, scale: 1 },
      { z: -9, density: 1, scale: 1 }
    ],
    // per-depth silhouette derivation coefficients (advanced) — each value below reproduces the
    // exact literal the old buildLayer() used, e.g. margin = (-z)*marginPer + marginBase.
    shape: {
      marginBase: 14, marginPer: 0.9,
      baseYBase: 1.2, baseYPer: 0.1,
      scaleBase: 1, scalePer: 0.05,
      humpBase: 3.2, humpPer: 0.22,
      topYPer: 0.12,
      hangChance: 0.55, stalactiteChance: 0.35,
      hangGapMin: 3, hangGapMax: 9, hangScaleMin: 0.7, hangScaleMax: 1.6,
      standGapMin: 4, standGapMax: 11, standScaleMin: 0.8, standScaleMax: 2
    }
  };
  let DATA = clone(DEFAULTS);

  function cleanLayer(L, d) {
    L = L || {};
    return {
      z: clamp(L.z, -400, -0.5, d.z),
      density: clamp(L.density, 0.1, 6, 1),
      scale: clamp(L.scale, 0.05, 6, 1)
    };
  }

  function applyData(data) {
    const d = data || G.PARALLAX_DATA || null;
    DATA = clone(DEFAULTS);
    if (!d) return;
    DATA.sky = clamp(d.sky, -400, -1, DEFAULTS.sky);
    DATA.wall = clamp(d.wall, -400, -1, DEFAULTS.wall);
    if (Array.isArray(d.layers)) {
      // keep author order; cap the count so a runaway overlay can't flood the scene
      DATA.layers = d.layers.slice(0, 12).map(L => cleanLayer(L, { z: -12 }));
    }
    if (d.shape && typeof d.shape === 'object') {
      const s = d.shape, S = DATA.shape;   // reassign in DEFAULT key order -> byte-identical round-trip
      S.marginBase = Math.max(0, num(s.marginBase, S.marginBase));
      S.marginPer = Math.max(0, num(s.marginPer, S.marginPer));
      S.baseYBase = num(s.baseYBase, S.baseYBase);
      S.baseYPer = num(s.baseYPer, S.baseYPer);
      S.scaleBase = Math.max(0.01, num(s.scaleBase, S.scaleBase));
      S.scalePer = num(s.scalePer, S.scalePer);
      S.humpBase = Math.max(0, num(s.humpBase, S.humpBase));
      S.humpPer = num(s.humpPer, S.humpPer);
      S.topYPer = num(s.topYPer, S.topYPer);
      S.hangChance = clamp(s.hangChance, 0, 1, S.hangChance);
      S.stalactiteChance = clamp(s.stalactiteChance, 0, 1, S.stalactiteChance);
      S.hangGapMin = Math.max(0.5, num(s.hangGapMin, S.hangGapMin));
      S.hangGapMax = Math.max(S.hangGapMin, num(s.hangGapMax, S.hangGapMax));
      S.hangScaleMin = Math.max(0.05, num(s.hangScaleMin, S.hangScaleMin));
      S.hangScaleMax = Math.max(S.hangScaleMin, num(s.hangScaleMax, S.hangScaleMax));
      S.standGapMin = Math.max(0.5, num(s.standGapMin, S.standGapMin));
      S.standGapMax = Math.max(S.standGapMin, num(s.standGapMax, S.standGapMax));
      S.standScaleMin = Math.max(0.05, num(s.standScaleMin, S.standScaleMin));
      S.standScaleMax = Math.max(S.standScaleMin, num(s.standScaleMax, S.standScaleMax));
    }
  }
  P.applyData = applyData;
  P.exportDefaults = () => clone(DEFAULTS);
  P.exportCurrent = () => clone(DATA);
  P.cleanLayer = L => cleanLayer(L, { z: -12 });

  // ---- live reads (world.js calls these at room-build time) ----
  P.skyZ = () => DATA.sky;
  P.wallZ = () => DATA.wall;
  P.layers = () => clone(DATA.layers);
  P.shape = () => clone(DATA.shape);

  applyData();
})();
