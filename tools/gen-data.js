// Reusable: (re)generate a data/<name>.js + .json overlay from a src module's exportDefaults(),
// for datasets that have been externalised from code (charms, biomes, ...). Run with no args to
// regenerate everything registered below, or `node tools/gen-data.js charms` for one.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');

// each: { name, global, srcs:[files loaded in order], pick(G) -> serialisable data }
const DATASETS = [
  { name: 'charms', global: 'CHARMS', srcs: ['src/charms.js'], pick: G => G.Charms.exportDefaults() },
  { name: 'sfx', global: 'SFX_DATA', srcs: ['src/audio.js'], pick: G => G.Audio.sfxExportDefaults() },
  { name: 'weather', global: 'WEATHER_DATA', srcs: ['src/weather.js'], pick: G => G.Weather.exportDefaults() },
  { name: 'difficulty', global: 'DIFFICULTY_DATA', srcs: ['src/difficulty.js'], pick: G => G.Difficulty.exportDefaults() },
  { name: 'achievements', global: 'ACHIEVEMENTS_DATA', srcs: ['src/achievements.js'], pick: G => G.Achievements.exportDefaults() },
  { name: 'quests', global: 'QUESTS_DATA', srcs: ['src/quests.js'], pick: G => G.Quests.exportDefaults() },
  { name: 'ambience', global: 'AMBIENCE_DATA', srcs: ['src/audio.js'], pick: G => G.Audio.ambExportDefaults() },
  { name: 'economy', global: 'ECONOMY_DATA', srcs: ['src/economy.js'], pick: G => G.Economy.exportDefaults() },
  { name: 'hud', global: 'HUD_DATA', srcs: ['src/hud.js'], pick: G => G.HUD.exportDefaults() },
  { name: 'theme', global: 'THEME_DATA', srcs: ['src/theme.js'], pick: G => G.Theme.exportDefaults() },
  { name: 'drops', global: 'DROPS_DATA', srcs: ['src/drops.js'], pick: G => G.Drops.exportDefaults() },
  { name: 'settings', global: 'SETTINGS_DATA', srcs: ['src/settings.js'], pick: G => G.Settings.exportDefaults() },
  { name: 'loadout', global: 'LOADOUT_DATA', srcs: ['src/loadout.js'], pick: G => G.Loadout.exportDefaults() },
  { name: 'credits', global: 'CREDITS_DATA', srcs: ['src/credits.js'], pick: G => G.Credits.exportDefaults() },
  { name: 'saves', global: 'SAVES_DATA', srcs: ['src/saves.js'], pick: G => G.Saves.exportDefaults() }
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
