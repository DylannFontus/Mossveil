// One-off: generate data/music.json + data/music.js from music.js's built-in defaults, so the
// soundtrack dataset exists as an editable file (the Music editor overwrites it thereafter).
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const code = fs.readFileSync(path.join(ROOT, 'src', 'music.js'), 'utf8');
const sandbox = { window: {}, G: {}, Math, JSON, console, setTimeout: () => { }, clearTimeout: () => { } };
sandbox.window.G = sandbox.G;
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const data = sandbox.G.Music.exportDefaults();
const json = JSON.stringify(data, null, 1);
fs.writeFileSync(path.join(ROOT, 'data', 'music.json'), json);
fs.writeFileSync(path.join(ROOT, 'data', 'music.js'),
  '// generated from data/music.json - do not edit by hand (use the editor: Edit ▸ Audio ▸ Soundtracks)\n' +
  'window.G = window.G || {};\nG.MUSIC = ' + json + ';\n');
console.log('wrote data/music.json + data/music.js -', Object.keys(data.tracks).length, 'tracks,', Object.keys(data.biome).length, 'biome maps');
