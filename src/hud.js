// MOSSVEIL — hud.js : HUD layout & colours (G.HUD).
// Where the on-screen HUD pieces sit and what colour they are — the soul orb (top-left), the row of
// masks, and the Glimmer counter — were baked as magic numbers inside src/ui.js drawHud(). They live
// here as a data overlay (data/hud.js -> G.HUD_DATA) so the in-editor HUD editor can reposition and
// recolour them. Defaults are byte-identical to the old constants. No THREE/Audio at load (so gen-data
// can node-eval it). ui.js reads these via G.HUD.* with a literal fallback, so the game still draws if
// this module is ever absent.
(function () {
  const H = G.HUD = {};
  const clone = o => JSON.parse(JSON.stringify(o));
  const DEFAULTS = {
    soul: { x: 64, y: 64, r: 30, fillTop: '#eef8ff', fillBot: '#9fcfe0' },
    masks: { x: 122, y: 52, spacing: 38, size: 13, color: '#e9e4d4' },
    glimmer: { x: 38, y: 110, dotR: 6, textX: 52, textY: 111, dotColor: '#ffe28a', textColor: 'rgba(240,230,200,0.92)', fontSize: 16 }
  };
  let DATA = clone(DEFAULTS);
  const num = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : d;
  const str = (v, d) => (typeof v === 'string' && v) ? v : d;

  function applyData(data) {
    const d = data || G.HUD_DATA || null;
    DATA = clone(DEFAULTS);
    if (d) {
      if (d.soul) { const s = d.soul, D0 = DEFAULTS.soul; DATA.soul = { x: num(s.x, D0.x), y: num(s.y, D0.y), r: Math.max(4, num(s.r, D0.r)), fillTop: str(s.fillTop, D0.fillTop), fillBot: str(s.fillBot, D0.fillBot) }; }
      if (d.masks) { const m = d.masks, D0 = DEFAULTS.masks; DATA.masks = { x: num(m.x, D0.x), y: num(m.y, D0.y), spacing: num(m.spacing, D0.spacing), size: Math.max(2, num(m.size, D0.size)), color: str(m.color, D0.color) }; }
      if (d.glimmer) { const g = d.glimmer, D0 = DEFAULTS.glimmer; DATA.glimmer = { x: num(g.x, D0.x), y: num(g.y, D0.y), dotR: Math.max(0, num(g.dotR, D0.dotR)), textX: num(g.textX, D0.textX), textY: num(g.textY, D0.textY), dotColor: str(g.dotColor, D0.dotColor), textColor: str(g.textColor, D0.textColor), fontSize: Math.max(6, num(g.fontSize, D0.fontSize)) }; }
    }
  }
  H.applyData = applyData;
  H.exportDefaults = () => clone(DEFAULTS);
  H.exportCurrent = () => clone(DATA);
  H.soul = () => DATA.soul;
  H.masks = () => DATA.masks;
  H.glimmer = () => DATA.glimmer;

  applyData();
})();
