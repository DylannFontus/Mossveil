// One-time converter: emits data/levels.json + data/levels.js from the original room DSL.
const fs = require('fs');
const path = require('path');

function Grid(w, h) {
  const g = [];
  for (let r = 0; r < h; r++) g.push(new Array(w).fill(' '));
  const markers = [];
  return {
    w, h, g, markers,
    rect(ch, c0, r0, c1, r1) {
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++)
        if (r >= 0 && r < h && c >= 0 && c < w) g[r][c] = ch;
    },
    F(c0, c1, top) { this.rect('#', c0, top, c1, h - 1); },
    C(c0, c1, bot) { this.rect('#', c0, 0, c1, bot); },
    B(c0, r0, c1, r1) { this.rect('#', c0, r0, c1, r1); },
    OW(c0, c1, r) { this.rect('=', c0, r, c1, r); },
    SP(c0, c1, r) { this.rect('^', c0, r, c1, r); },
    clear(c0, r0, c1, r1) { this.rect(' ', c0, r0, c1, r1); },
    put(ch, c, r) { markers.push({ ch, c, r }); },
    border() { this.rect('#', 0, 0, w - 1, 1); this.rect('#', 0, h - 2, w - 1, h - 1); this.rect('#', 0, 0, 1, h - 1); this.rect('#', w - 2, 0, w - 1, h - 1); }
  };
}

const DEFS = {
  steps: {
    w: 56, h: 22, pal: 'verdant', title: 'The Sunken Steps', area: 'M O S S V E I L',
    signs: ['← →  or  A D — walk', 'Z or SPACE — jump\nhold to leap higher', 'X — strike  ·  C — dash\ndown-strike in the air to bounce off foes'],
    trans: [{ side: 'R', to: 'glade', spawn: '1' }],
    mapPos: { mx: 0, my: 0 },
    build(m) {
      m.border();
      m.clear(54, 13, 55, 16);
      m.F(2, 9, 7); m.F(10, 15, 9); m.F(16, 22, 11); m.F(23, 28, 13); m.F(29, 36, 15); m.F(37, 55, 17);
      m.C(20, 23, 3); m.C(38, 41, 4);
      m.put('P', 4, 6); m.put('s', 7, 6); m.put('s', 18, 10); m.put('s', 33, 14);
      m.put('t', 32, 14); m.put('t', 44, 16);
      m.put('2', 52, 16);
    }
  },
  glade: {
    w: 80, h: 26, pal: 'verdant', title: 'Verdant Deep',
    signs: ['The walls remember\nthose who climb.'],
    trans: [
      { side: 'L', to: 'steps', spawn: '2' },
      { side: 'R', to: 'rest', spawn: '1' },
      { side: 'T', x0: 55, x1: 60, to: 'dusk', spawn: '4' }
    ],
    mapPos: { mx: 58, my: -2 },
    build(m) {
      m.border();
      m.clear(0, 16, 1, 19);
      m.clear(78, 14, 79, 17);
      m.clear(56, 0, 58, 1);
      m.F(2, 30, 20);
      m.F(31, 36, 23); m.SP(31, 36, 22);
      m.F(37, 55, 20);
      m.F(56, 61, 23); m.SP(56, 61, 22);
      m.B(57, 19, 59, 19);
      m.F(62, 79, 18);
      m.OW(32, 35, 18);
      m.OW(20, 23, 17); m.OW(24, 27, 14);
      m.OW(40, 43, 17); m.B(44, 13, 47, 14);
      m.B(52, 2, 55, 15); m.B(59, 2, 62, 15);
      m.C(12, 16, 4); m.C(36, 39, 5); m.C(70, 74, 4);
      m.put('1', 4, 19); m.put('2', 75, 17); m.put('3', 57, 13);
      m.put('s', 54, 19);
      m.put('t', 10, 19); m.put('t', 48, 19);
      m.put('g', 25, 12); m.put('g', 43, 13); m.put('g', 68, 14);
      m.put('b', 52, 19); m.put('b', 70, 17);
    }
  },
  rest: {
    w: 44, h: 18, pal: 'warm', title: "Wayfarer's Rest",
    signs: ['Rest, wanderer —\nyour path is remembered.', 'F (hold) — focus reaped soul, mend a mask\nF (tap) — loose a wisp of soul'],
    trans: [
      { side: 'L', to: 'glade', spawn: '2' },
      { side: 'R', to: 'shaft', spawn: '1' }
    ],
    mapPos: { mx: 140, my: 2 },
    build(m) {
      m.border();
      m.clear(0, 12, 1, 15); m.clear(42, 12, 43, 15);
      m.F(2, 43, 16);
      m.C(10, 13, 4); m.C(30, 34, 5);
      m.put('1', 4, 15); m.put('2', 40, 15);
      m.put('B', 20, 15);
      m.put('L', 16, 15); m.put('L', 25, 15);
      m.put('s', 12, 15); m.put('s', 29, 15);
    }
  },
  shaft: {
    w: 40, h: 34, pal: 'verdant', title: 'The Climbing Dark',
    signs: [],
    trans: [
      { side: 'L', to: 'rest', spawn: '2' },
      { side: 'R', to: 'gloom', spawn: '1' }
    ],
    mapPos: { mx: 186, my: -12 },
    build(m) {
      m.border();
      m.clear(0, 28, 1, 31);
      m.clear(38, 4, 39, 7);
      m.B(10, 29, 15, 29);
      m.B(19, 26, 24, 26);
      m.B(27, 23, 32, 23); m.SP(28, 29, 22);
      m.B(16, 20, 21, 20);
      m.B(8, 17, 13, 17);
      m.B(16, 14, 21, 14);
      m.B(24, 11, 29, 11);
      m.B(33, 8, 39, 9);
      m.B(0, 14, 4, 18);
      m.B(35, 20, 39, 24);
      m.put('1', 4, 31); m.put('2', 36, 7);
      m.put('g', 20, 18); m.put('g', 14, 24); m.put('g', 28, 8);
    }
  },
  gloom: {
    w: 70, h: 24, pal: 'gloom', title: 'Gloomroot Cavern',
    signs: ['The dark gnaws.\nFollow the crystal-glow.'],
    trans: [
      { side: 'L', to: 'shaft', spawn: '2' },
      { side: 'R', to: 'approach', spawn: '1' }
    ],
    mapPos: { mx: 228, my: -2 },
    build(m) {
      m.border();
      m.clear(0, 4, 1, 7); m.clear(68, 16, 69, 19);
      m.F(2, 10, 8); m.F(11, 16, 11); m.F(17, 24, 14); m.F(25, 30, 17); m.F(31, 69, 20);
      m.SP(42, 46, 19);
      m.OW(36, 39, 17); m.OW(45, 48, 14);
      m.C(32, 35, 6); m.C(44, 48, 8); m.C(56, 59, 5);
      m.put('1', 4, 7); m.put('2', 66, 19);
      m.put('K', 20, 13); m.put('K', 34, 19); m.put('K', 47, 19); m.put('K', 60, 19);
      m.put('s', 33, 19);
      m.put('t', 28, 16);
      m.put('c', 38, 19); m.put('c', 56, 19);
      m.put('b', 50, 19);
      m.put('g', 40, 12); m.put('g', 52, 11);
    }
  },
  approach: {
    w: 50, h: 20, pal: 'pale', title: "The Sovereign's Walk",
    signs: ["TURN BACK.\nThe glade's heart is claimed."],
    trans: [
      { side: 'L', to: 'gloom', spawn: '2' },
      { side: 'R', to: 'arena', spawn: '1' }
    ],
    mapPos: { mx: 300, my: 0 },
    build(m) {
      m.border();
      m.clear(0, 12, 1, 15); m.clear(48, 12, 49, 15);
      m.F(2, 49, 16);
      m.SP(18, 20, 15); m.SP(26, 28, 15);
      m.C(22, 25, 4);
      m.put('1', 4, 15); m.put('2', 46, 15);
      m.put('s', 10, 15);
      m.put('L', 14, 15); m.put('L', 24, 15); m.put('L', 38, 15);
    }
  },
  arena: {
    w: 54, h: 22, pal: 'pale', title: 'Heart of the Glade',
    signs: [],
    trans: [
      { side: 'L', to: 'approach', spawn: '2' },
      { side: 'R', to: 'crown', spawn: '1' }
    ],
    mapPos: { mx: 352, my: -1 },
    build(m) {
      m.border();
      m.clear(0, 14, 1, 17); m.clear(52, 14, 53, 17);
      m.F(2, 53, 18);
      m.OW(7, 10, 15); m.OW(43, 46, 15);
      m.put('1', 4, 17); m.put('2', 50, 17);
      m.put('G', 8, 17); m.put('G', 45, 17);
      m.put('M', 27, 15);
    }
  },
  crown: {
    w: 48, h: 20, pal: 'crown', title: 'The Verdant Crown',
    signs: ['The glade breathes again.\nThank you, little wanderer.'],
    trans: [{ side: 'L', to: 'arena', spawn: '2' }],
    mapPos: { mx: 408, my: 0 },
    build(m) {
      m.border();
      m.clear(0, 12, 1, 15);
      m.F(2, 47, 16);
      m.put('1', 4, 15);
      m.put('B', 16, 15);
      m.put('s', 24, 15);
      m.put('R', 30, 15);
      m.put('L', 12, 15); m.put('L', 36, 15);
    }
  },
  dusk: {
    w: 36, h: 20, pal: 'dusk', title: 'The Duskveil',
    signs: ['Wings of the pale moth,\nshed in shadow. Take them.'],
    trans: [{ side: 'B', x0: 15, x1: 19, to: 'glade', spawn: '3' }],
    mapPos: { mx: 72, my: -26 },
    build(m) {
      m.border();
      m.F(2, 15, 17); m.F(19, 35, 17);
      m.clear(16, 17, 18, 19);
      m.B(27, 15, 29, 16);
      m.put('W', 28, 13);
      m.put('4', 21, 16);
      m.put('s', 8, 16);
      m.put('g', 12, 10); m.put('g', 24, 9);
    }
  }
};

const ENEMY_CH = { t: 'tumblebug', g: 'gnatling', b: 'bulbil', c: 'bramblehog' };
const levels = {};

for (const id in DEFS) {
  const def = DEFS[id];
  const m = Grid(def.w, def.h);
  def.build(m);
  const H = def.h;
  // sort markers row-major to keep sign order identical to the old parser
  m.markers.sort((a, b) => a.r - b.r || a.c - b.c);
  const spawns = {}, enemies = [], props = [];
  let signI = 0, gateI = 0;
  for (const mk of m.markers) {
    const x = mk.c + 0.5, yMid = H - mk.r - 0.5, yGround = H - mk.r - 1;
    if (mk.ch === 'P' || '12345'.includes(mk.ch)) spawns[mk.ch] = { x, y: yMid };
    else if (ENEMY_CH[mk.ch]) enemies.push({ type: ENEMY_CH[mk.ch], x, y: yMid });
    else if (mk.ch === 's') props.push({ type: 'sign', x, y: yGround, text: def.signs[signI++] || '...' });
    else if (mk.ch === 'B') props.push({ type: 'bench', x, y: yGround });
    else if (mk.ch === 'L') props.push({ type: 'lamp', x, y: yGround });
    else if (mk.ch === 'K') props.push({ type: 'crystal', x, y: yGround });
    else if (mk.ch === 'R') props.push({ type: 'shrine', x, y: yGround });
    else if (mk.ch === 'W') props.push({ type: 'wings', x, y: yMid });
    else if (mk.ch === 'G') props.push({ type: 'gate', x, y: yGround, id: gateI++ });
    else if (mk.ch === 'M') props.push({ type: 'bossTrigger', x, y: yMid, boss: 'mossSovereign' });
  }
  levels[id] = {
    id, title: def.title, area: def.area || null, biome: def.pal,
    w: def.w, h: def.h, mapPos: def.mapPos,
    tiles: m.g.map(row => row.join('')),
    spawns, enemies, props,
    transitions: def.trans
  };
}

const ROOT = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
const json = JSON.stringify(levels, null, 1);
fs.writeFileSync(path.join(ROOT, 'data', 'levels.json'), json);
fs.writeFileSync(path.join(ROOT, 'data', 'levels.js'),
  '// generated from data/levels.json - do not edit by hand (use the editor)\n' +
  'window.G = window.G || {};\nG.LEVELS = ' + json + ';\n');
console.log('wrote', Object.keys(levels).length, 'levels');
