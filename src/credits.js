// MOSSVEIL — credits.js : the ending / credits roll (G.Credits).
// When the game is finished it fades to a pale screen and fades in a few lines of credits text, then
// waits for a key. Those lines, their sizes & fade-in delays, the colours, the layout and the "hold
// before you can dismiss" time were hardcoded in ui.js drawEnding() and main.js. They live here as a
// data overlay (data/credits.js -> G.CREDITS_DATA) so the in-editor Credits editor can author them.
// Defaults are byte-identical to the old constants. No THREE/Audio at load (so gen-data can node-eval
// it). ui.js / main.js read these via G.Credits.* with a literal fallback, so the game still runs even
// if this module is ever absent.
(function () {
  const C = G.Credits = {};
  const clone = o => JSON.parse(JSON.stringify(o));
  const DEFAULTS = {
    bg: '#f0f8f4',          // the pale wash that fades over the screen
    textColor: '#1c2a24',
    startY: 0.36,           // first line's y as a fraction of screen height
    lineGap: 18,            // extra px after each line (added to its font size)
    dismissAfter: 4.5,      // seconds before a key press returns to play
    lines: [
      { text: 'M O S S V E I L', size: 46, delay: 0.5, italic: false },
      { text: 'the glade remembers you', size: 22, delay: 1.6, italic: true },
      { text: '', size: 10, delay: 0, italic: true },
      { text: 'woven from code alone — every shape, sound and shadow', size: 16, delay: 2.8, italic: true },
      { text: '', size: 10, delay: 0, italic: true },
      { text: 'press any key to wander on', size: 17, delay: 4.0, italic: true }
    ]
  };
  let DATA = clone(DEFAULTS);
  const num = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : d;
  const hex = (v, d) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)) ? v : d;

  function normLine(l, i) {
    l = l || {};
    return {
      text: (typeof l.text === 'string') ? l.text : '',
      size: Math.max(1, Math.round(num(l.size, 16))),
      delay: Math.max(0, num(l.delay, 0)),
      italic: l.italic == null ? (Math.round(num(l.size, 16)) !== 46) : !!l.italic
    };
  }

  function applyData(data) {
    const d = data || G.CREDITS_DATA || null;
    DATA = clone(DEFAULTS);
    if (d) {
      DATA.bg = hex(d.bg, DEFAULTS.bg);
      DATA.textColor = hex(d.textColor, DEFAULTS.textColor);
      DATA.startY = Math.max(0, Math.min(1, num(d.startY, DEFAULTS.startY)));
      DATA.lineGap = Math.max(0, num(d.lineGap, DEFAULTS.lineGap));
      DATA.dismissAfter = Math.max(0, num(d.dismissAfter, DEFAULTS.dismissAfter));
      if (Array.isArray(d.lines)) DATA.lines = d.lines.map(normLine);
    }
  }
  C.applyData = applyData;
  C.exportDefaults = () => clone(DEFAULTS);
  C.exportCurrent = () => clone(DATA);

  function rgb(h) { return parseInt(h.slice(1, 3), 16) + ',' + parseInt(h.slice(3, 5), 16) + ',' + parseInt(h.slice(5, 7), 16); }

  // ---- live reads (ui.js / main.js call these) ----
  C.bg = () => DATA.bg;
  C.bgStyle = alpha => 'rgba(' + rgb(DATA.bg) + ',' + alpha + ')';
  C.textColor = () => DATA.textColor;
  C.startY = () => DATA.startY;
  C.lineGap = () => DATA.lineGap;
  C.dismissAfter = () => DATA.dismissAfter;
  C.lines = () => clone(DATA.lines);

  applyData();
})();
