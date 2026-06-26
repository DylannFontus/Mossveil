// MOSSVEIL — theme.js : typography & iconography (G.Theme).
// The two font families the UI draws with (a serif body font and a heavy display font for menu
// titles) and the small vocabulary of glyph "icons" the game uses for currency and quest markers
// (Glimmer ✦, the filled/outline cost diamonds ◆/◇, the done check ✓) were hardcoded across src/ui.js
// (and one prompt in world.js). They live here as a data overlay (data/theme.js -> G.THEME_DATA) so the
// in-editor Typography & Iconography editor can reskin them — change the game's font or currency symbol
// in one place. Defaults are byte-identical to the old constants. No THREE/Audio at load (so gen-data
// can node-eval it). ui.js/world.js read these via G.Theme.* with literal fallbacks.
(function () {
  const Th = G.Theme = {};
  const clone = o => JSON.parse(JSON.stringify(o));
  const DEFAULTS = {
    fonts: {
      body: 'Georgia, "Times New Roman", serif',
      display: '"Arial Black", "Arial Bold", Impact, sans-serif'
    },
    icons: { glimmer: '✦', diamond: '◆', diamondOutline: '◇', check: '✓' }
  };
  let DATA = clone(DEFAULTS);
  const str = (v, d) => (typeof v === 'string' && v) ? v : d;

  function applyData(data) {
    const d = data || G.THEME_DATA || null;
    DATA = clone(DEFAULTS);
    if (d) {
      if (d.fonts) { DATA.fonts.body = str(d.fonts.body, DEFAULTS.fonts.body); DATA.fonts.display = str(d.fonts.display, DEFAULTS.fonts.display); }
      if (d.icons) for (const k in DEFAULTS.icons) DATA.icons[k] = str(d.icons[k], DEFAULTS.icons[k]);
    }
  }
  Th.applyData = applyData;
  Th.exportDefaults = () => clone(DEFAULTS);
  Th.exportCurrent = () => clone(DATA);
  Th.font = role => DATA.fonts[role] || DATA.fonts.body;
  Th.icon = name => (DATA.icons[name] != null ? DATA.icons[name] : '');
  Th.fonts = () => clone(DATA.fonts);
  Th.icons = () => clone(DATA.icons);

  applyData();
})();
