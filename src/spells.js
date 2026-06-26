// MOSSVEIL — spells.js : the spell / ability tree as data (extracted from main.js so both the game
// and the editor can read it). Each spell has id, name, cast hint, optional element flag, three tier
// descriptions and three Glimmer costs. The CAST MECHANICS stay in code, keyed by the built-in ids
// (bolt / scream / dive) and elements (ember / frost / gale); this tool tunes names, descriptions,
// costs and the element flag, and can add metadata for new ids. Overlaid by data/spells.js.
(function () {
  const S = G.Spells = {};
  const clone = o => JSON.parse(JSON.stringify(o));
  const DEFAULT_TREE = [
    { id: 'bolt', name: 'Soul Bolt', cast: 'Cast', tiers: ['', 'A bolt of soul flung forward.', 'Shade Soul — a greater, faster bolt.'], cost: [0, 0, 130] },
    { id: 'scream', name: 'Wraith Cry', cast: 'Hold ↑ + Cast', tiers: ['Not yet learned.', 'Howling Wraiths — spirits burst upward.', 'Abyss Shriek — a greater, wider cry.'], cost: [0, 80, 170] },
    { id: 'dive', name: 'Abyss Dive', cast: 'Hold ↓ + Cast (airborne)', tiers: ['Not yet learned.', 'Desolate Dive — slam down with a shockwave.', 'Descending Dark — a darker, wider dive.'], cost: [0, 110, 190] },
    { id: 'ember', name: 'Ember Bolt', cast: 'attunes Soul Bolt', element: true, tiers: ['Soul Bolt carries no flame.', 'Ember Bolt — bolts set grass alight and sear foes over time.', 'Cinder Bolt — hotter still: bigger flames, longer burn & sear.'], cost: [0, 90, 160] },
    { id: 'frost', name: 'Frost Bolt', cast: 'attunes Soul Bolt', element: true, tiers: ['Soul Bolt carries no chill.', 'Frost Bolt — snuffs fire, and freezes foes solid on hit.', 'Rime Bolt — a deeper, longer freeze.'], cost: [0, 90, 160] },
    { id: 'gale', name: 'Gale Bolt', cast: 'attunes Soul Bolt', element: true, tiers: ['Soul Bolt carries no wind.', 'Gale Bolt — hurls foes back, fans fire and blows away gas.', 'Tempest Bolt — a fiercer gust.'], cost: [0, 110, 180] }
  ];
  let TREE = [];
  function normSpell(s) {
    return {
      id: String(s.id), name: s.name || s.id, cast: s.cast || 'Cast', element: !!s.element,
      tiers: (s.tiers && s.tiers.length === 3) ? s.tiers.slice() : ['', '', ''],
      cost: (s.cost && s.cost.length === 3) ? s.cost.map(n => n | 0) : [0, 0, 0]
    };
  }
  function applyData(data) {
    const d = data || G.SPELLS_DATA || null;
    TREE = ((d && Array.isArray(d.tree) && d.tree.length) ? d.tree : DEFAULT_TREE).map(normSpell);
    S.TREE = TREE;
    S.ELEMENTS = TREE.filter(s => s.element).map(s => s.id);
    if (G.Main) { G.Main.SPELL_TREE = S.TREE; G.Main.ELEMENTS = S.ELEMENTS; }   // keep the game alias fresh after a hot edit
  }
  S.applyData = applyData;
  S.exportDefaults = () => ({ tree: clone(DEFAULT_TREE) });
  S.exportCurrent = () => ({ tree: clone(TREE) });
  applyData();
})();
