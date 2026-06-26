// MOSSVEIL — settings.js : the player-facing Settings menu schema & defaults (G.Settings).
// The game already has a full Settings screen (sound, screen shake, visual quality, ...) driven by a
// SETTINGS_DEFS schema and a G.settings defaults object that were hardcoded in main.js. Those live
// here as a data overlay (data/settings.js -> G.SETTINGS_DATA) so the in-editor Settings menu editor
// can author them: relabel rows, reorder them, hide ones a build doesn't want, edit the option lists
// of the cycle settings, and set what value a new game starts with. The key-specific APPLY logic
// (volume -> Audio, quality -> Post, ...) stays keyed in main.js — only the schema & defaults are data.
// `defs` carries the full row list (incl. hidden) in author order; `values` carries a default for
// every key so applySettings always has them even when a row is hidden. Defaults are byte-identical to
// the old constants. No THREE/Audio at load (so gen-data can node-eval it). main.js reads via
// G.Settings.* with a literal fallback, so the game still runs even if this module is ever absent.
(function () {
  const S = G.Settings = {};
  const clone = o => JSON.parse(JSON.stringify(o));
  const DEFAULTS = {
    defs: [
      { key: 'controls', label: 'Controls / key bindings', type: 'action', show: true },
      { key: 'volume', label: 'Sound volume', type: 'slider', min: 0, max: 1, step: 0.1, show: true },
      { key: 'soundtrack', label: 'Soundtrack', type: 'cycle', opts: ['Score', 'Classic'], show: true },
      { key: 'shake', label: 'Screen shake', type: 'toggle', show: true },
      { key: 'rumble', label: 'Controller rumble', type: 'toggle', show: true },
      { key: 'quality', label: 'Visual quality', type: 'cycle', opts: ['low', 'medium', 'high'], show: true },
      { key: 'tonemap', label: 'Tone mapping', type: 'cycle', opts: ['Off', 'ACES', 'AgX'], show: true },
      { key: 'lighting', label: 'Dynamic lighting', type: 'toggle', show: true },
      { key: 'bloom', label: 'Bloom glow', type: 'toggle', show: true },
      { key: 'dof', label: 'Depth of field', type: 'toggle', show: true },
      { key: 'reflections', label: 'Water reflections', type: 'toggle', show: true },
      { key: 'weather', label: 'Weather effects', type: 'toggle', show: true },
      { key: 'aberration', label: 'Chromatic aberration', type: 'toggle', show: true },
      { key: 'motionblur', label: 'Motion blur', type: 'toggle', show: true },
      { key: 'vignette', label: 'Vignette', type: 'toggle', show: true }
    ],
    values: { volume: 0.8, soundtrack: 'Score', shake: true, rumble: true, quality: 'high', tonemap: 'ACES', lighting: true, bloom: true, dof: true, reflections: true, weather: true, aberration: true, motionblur: true, vignette: true }
  };
  const TYPES = { action: 1, slider: 1, cycle: 1, toggle: 1 };
  let DATA = clone(DEFAULTS);
  const num = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : d;
  const str = (v, d) => (typeof v === 'string' && v) ? v : d;

  // field order matches DEFAULTS exactly (key,label,type,[opts|min,max,step],show) so a full overlay
  // round-trips byte-identically — show stays last.
  function normDef(d, base) {
    base = base || {};
    const key = str(d && d.key, base.key);
    if (!key) return null;
    const type = (d && TYPES[d.type]) ? d.type : (TYPES[base.type] ? base.type : 'toggle');
    const out = { key, label: str(d && d.label, base.label || key), type };
    if (type === 'cycle') { const o = Array.isArray(d && d.opts) ? d.opts.filter(x => typeof x === 'string') : null; out.opts = (o && o.length) ? o.slice() : (base.opts ? base.opts.slice() : ['A', 'B']); }
    if (type === 'slider') { out.min = num(d && d.min, base.min != null ? base.min : 0); out.max = num(d && d.max, base.max != null ? base.max : 1); out.step = num(d && d.step, base.step != null ? base.step : 0.1); if (out.max <= out.min) out.max = out.min + 1; }
    out.show = (d && d.show === false) ? false : true;
    return out;
  }

  function applyData(data) {
    const d = data || G.SETTINGS_DATA || null;
    DATA = clone(DEFAULTS);
    if (d) {
      if (Array.isArray(d.defs)) {
        const baseByKey = {}; DEFAULTS.defs.forEach(x => baseByKey[x.key] = x);
        const defs = d.defs.map(x => normDef(x, baseByKey[x && x.key])).filter(Boolean);
        if (defs.length) DATA.defs = defs;
      }
      if (d.values && typeof d.values === 'object') {
        DATA.values = clone(DEFAULTS.values);
        for (const k in DEFAULTS.values) if (k in d.values) {
          const base = DEFAULTS.values[k], v = d.values[k];
          DATA.values[k] = (typeof base === 'boolean') ? !!v : (typeof base === 'number') ? num(v, base) : str(v, base);
        }
      }
    }
  }
  S.applyData = applyData;
  S.exportDefaults = () => clone(DEFAULTS);
  S.exportCurrent = () => clone(DATA);

  // ---- live reads (main.js calls these at init) ----
  S.defs = () => clone(DATA.defs.filter(d => d.show !== false));   // visible rows, in author order — drives the menu
  S.allDefs = () => clone(DATA.defs);                              // full list incl. hidden — for the editor
  S.defaults = () => clone(DATA.values);                          // the value object a new game seeds G.settings from

  applyData();
})();
