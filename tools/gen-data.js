// Reusable: (re)generate a data/<name>.js + .json overlay from a src module's exportDefaults(),
// for datasets that have been externalised from code (charms, biomes, ...). Run with no args to
// regenerate everything registered below, or `node tools/gen-data.js charms` for one.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');

// each: { name, global, srcs:[files loaded in order], pick(G) -> serialisable data }
const DATASETS = [
  { name: 'charms', global: 'CHARMS', srcs: ['src/charms.js'], pick: G => G.Charms.exportDefaults() },
  { name: 'sfx', global: 'SFX_DATA', srcs: ['src/audio.js'], pick: G => G.Audio.sfxExportDefaults() }
];

function evalModule(srcs) {
  const sb = { window: {}, G: {}, Math, JSON, console, Date, setTimeout: () => { }, clearTimeout: () => { } };
  sb.window.G = sb.G; vm.createContext(sb);
  for (const f of srcs) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sb);
  return sb.G;
}
function gen(ds) {
  const data = ds.pick(evalModule(ds.srcs));
  const json = JSON.stringify(data, null, 1);
  fs.writeFileSync(path.join(ROOT, 'data', ds.name + '.json'), json);
  fs.writeFileSync(path.join(ROOT, 'data', ds.name + '.js'),
    `// generated from data/${ds.name}.json - do not edit by hand (use the editor)\n` +
    'window.G = window.G || {};\nG.' + ds.global + ' = ' + json + ';\n');
  console.log('wrote data/' + ds.name + '.js +.json');
}

const only = process.argv[2];
DATASETS.filter(d => !only || d.name === only).forEach(gen);
