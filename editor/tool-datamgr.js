// MOSSVEIL — tool-datamgr.js : the Unified Data Manager (Edit ▸ Project).
// One place to see every dataset that used to live in code — soundtracks, SFX, charms, spells,
// enemies, bosses, biomes, weather, materials, player feel, … — with live counts, its data file and
// a one-click Open into the right authoring tool. Editor-only, no engine change, fully offline.
(function () {
  const T = G.Tools;
  if (!T) return;
  const safe = fn => { try { const n = fn(); return n == null ? '—' : n; } catch (e) { return '—'; } };
  const keys = o => o ? Object.keys(o).length : 0;

  // dataset registry: label, group, the data/<name>.js file, the tool to open, and a live count
  function DATASETS() {
    const M = G.Music, A = G.Audio, C = G.Charms, S = G.Spells, E = G.Enemies, B = G.Bosses, W = G.World, F = G.FX, Wx = G.Weather, P = G.Player;
    return [
      ['Audio', [
        ['Soundtracks', 'music.js', 'music', () => keys(M.exportCurrent().tracks) + ' tracks'],
        ['Sound effects', 'sfx.js', 'sfx', () => keys(A.sfxExportCurrent().sfx) + ' sounds'],
        ['Reverb spaces', 'reverb.js', 'reverb', () => keys(W.exportReverbCurrent().reverb) + ' spaces'],
        ['Mixer levels', 'mixer.js', 'mixer', () => keys(A.mixExportCurrent()) + ' buses']
      ]],
      ['Content', [
        ['Charms', 'charms.js', 'charms', () => C.exportCurrent().list.length + ' charms'],
        ['Spells', 'spells.js', 'spells', () => S.exportCurrent().tree.length + ' spells'],
        ['Custom enemies', 'enemies-lib.js', 'enemies', () => keys(E.exportLibCurrent().enemies) + ' custom'],
        ['Bosses', 'bosses.js', 'bosses', () => keys(B.exportBossCurrent().configs) + ' bosses'],
        ['Bestiary lore', 'bestiary.js', 'bestiary', () => keys(E.exportBestiaryCurrent().lore) + ' entries'],
        ['Player feel', 'player.js', 'player', () => keys(P.tune()) + ' params']
      ]],
      ['World', [
        ['Biomes', 'biomes.js', 'biomes', () => keys(W.exportBiomeCurrent().palettes) + ' biomes'],
        ['Colour grades', 'biomes.js', 'grade', () => Object.values(W.exportBiomeCurrent().palettes).filter(p => p.grade).length + ' overrides'],
        ['Weather presets', 'weather.js', 'weather', () => keys(Wx.exportCurrent().presets) + ' presets'],
        ['Terrain materials', 'materials.js', 'materials', () => new Set(Object.values(W.exportMaterialCurrent().materials).map(m => m.id)).size + ' materials'],
        ['Particle effects', 'fx.js', 'fx', () => keys(F.exportCurrent().bursts) + ' custom']
      ]]
    ];
  }

  let bodyEl = null, api = null;
  const MT = T.datamgr = {
    datasets: DATASETS,
    openInTool() { return T.openTool('datamgr'); }
  };

  function el(t, a, p, x) { return api.el(t, a, p, x); }
  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = '';
    el('div', { class: 'tc-mut', style: 'margin-bottom:12px' }, bodyEl, 'Every dataset that used to be hard-coded is now an editable data file. This is the map of them — counts are live; click Open to jump straight into the authoring tool. (Save in each tool writes its data/<file>.)');
    const known = new Set();
    DATASETS().forEach(([group, rows]) => {
      el('h4', { style: 'margin:14px 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:var(--txt2)' }, bodyEl, group);
      rows.forEach(([label, file, toolId, countFn]) => {
        known.add(toolId);
        const card = el('div', { class: 'tc-card', style: 'display:flex;align-items:center;gap:12px;margin:6px 0' }, bodyEl);
        el('span', { style: 'font-weight:600;min-width:150px' }, card, label);
        el('span', { class: 'tc-pill done' }, card, safe(countFn));
        el('span', { class: 'tc-mut' }, card, 'data/' + file);
        el('div', { style: 'flex:1' }, card);
        const t = T.tools.find(x => x.id === toolId);
        const b = el('button', { class: 'tbtn', onclick: () => T.openTool(toolId) }, card, 'Open ' + (t ? t.label : toolId));
        if (!t) b.disabled = true;
      });
    });
    // any registered tool not covered above (keeps the manager complete as tools are added)
    const extra = T.tools.filter(t => !known.has(t.id));
    if (extra.length) {
      el('h4', { style: 'margin:14px 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:var(--txt2)' }, bodyEl, 'Other tools');
      extra.forEach(t => {
        const card = el('div', { class: 'tc-card', style: 'display:flex;align-items:center;gap:12px;margin:6px 0' }, bodyEl);
        el('span', { style: 'font-weight:600;min-width:150px' }, card, (t.icon ? t.icon + ' ' : '') + t.label);
        el('span', { class: 'tc-mut' }, card, t.sub || '');
        el('div', { style: 'flex:1' }, card);
        el('button', { class: 'tbtn', onclick: () => T.openTool(t.id) }, card, 'Open');
      });
    }
  }

  T.registerTool({
    id: 'datamgr', label: 'Data manager', icon: '🗂', group: 'Project',
    sub: 'every dataset in one place',
    build(host, a) { api = a; bodyEl = host; render(); }
  });
  if (T.roadmapDone) T.roadmapDone(95);
})();
