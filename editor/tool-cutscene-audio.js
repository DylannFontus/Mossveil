// MOSSVEIL — tool-cutscene-audio.js : Cutscene audio cues (Edit ▸ Narrative).  Roadmap #24.
// Cutscenes are authored on the Cutscene tab; this tool adds the AUDIO layer to that workflow:
//   • documents the three timeline audio cues — sfx (one-shot sound), music (crossfade a track /
//     set the intensity swell) and stinger (a short musical sting) — with the live, valid values
//     pulled from the engine (track ids, stinger names, sfx names) so you never guess a name.
//   • audits every cutscene in G.CUTSCENES for how many audio cues it has, and deep-links straight
//     to the Cutscene tab to edit one.
// The cues themselves live in CS_EVENTS (editor) + cutscene.js HANDLERS (runtime). Editor-only, offline.
(function () {
  const T = G.Tools; if (!T) return;
  const ED = () => G.__ed || {};

  function el(tag, attrs, parent, text) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'style') e.style.cssText = attrs[k];
      else if (k.startsWith('on') && typeof attrs[k] === 'function') e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    }
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }

  const tracks = () => (G.Music && G.Music.TRACK_IDS) ? G.Music.TRACK_IDS.slice() : [];
  const stingers = () => ['boss', 'item', 'secret'];
  const sfxNames = () => { try { return (G.Audio && G.Audio.sfxNames) ? G.Audio.sfxNames.slice() : []; } catch (_) { return []; } };
  const AUDIO_TYPES = ['sfx', 'music', 'stinger'];
  function cueTypes() {
    return [
      { type: 'sfx', desc: 'Play a one-shot sound effect at this beat.', params: 'name', options: sfxNames() },
      { type: 'music', desc: 'Crossfade the score to a track (blank = keep current) and/or set the intensity swell (0–1; -1 leaves it).', params: 'track, intensity', options: tracks() },
      { type: 'stinger', desc: 'Layer a short musical sting over the score.', params: 'name', options: stingers() }
    ];
  }
  // audit every cutscene for audio cue usage
  function audit() {
    const out = [], CS = G.CUTSCENES || {};
    for (const id in CS) {
      const evs = (CS[id] && CS[id].events) || [];
      const counts = { sfx: 0, music: 0, stinger: 0 };
      evs.forEach(e => { if (counts[e.type] != null) counts[e.type]++; });
      out.push({ id, name: (CS[id] && CS[id].name) || id, total: evs.length, audio: counts.sfx + counts.music + counts.stinger, counts });
    }
    return out;
  }

  let bodyEl = null, api = null;
  const MT = T.cutsceneAudio = {
    cueTypes, audit, tracks, stingers, sfxNames,
    openCutscene(id) { if (ED().setTab) ED().setTab('cutscene'); if (id && ED().csSelect) ED().csSelect(id, -1); T.closeTool(); },
    openInTool() { return T.openTool('cutsceneAudio'); }
  };

  function render() {
    bodyEl.innerHTML = '';
    el('div', { class: 'tc-mut', style: 'margin-bottom:8px' }, bodyEl,
      'Add these on the Cutscene tab (timeline ▸ + Add event). The values below are pulled live from the engine, so they are always valid.');

    cueTypes().forEach(c => {
      const card = el('div', { class: 'tc-card', style: 'margin:8px 0' }, bodyEl);
      const hd = el('div', { style: 'display:flex;align-items:center;gap:8px' }, card);
      el('span', { style: 'font-weight:600' }, hd, (c.type === 'music' ? '🎵 ' : c.type === 'stinger' ? '✨ ' : '🔊 ') + c.type);
      el('span', { class: 'tc-mut', style: 'font-size:11px' }, hd, 'params: ' + c.params);
      el('div', { class: 'tc-mut', style: 'margin:4px 0 6px' }, card, c.desc);
      const wrap = el('div', { style: 'display:flex;flex-wrap:wrap;gap:4px' }, card);
      if (!c.options.length) el('span', { class: 'tc-mut' }, wrap, '(no named values)');
      c.options.forEach(o => el('span', { style: 'font-size:11px;background:var(--bg3);border:1px solid #45454d;border-radius:6px;padding:1px 7px;font-family:monospace' }, wrap, o));
    });

    el('h4', { style: 'margin:14px 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:var(--txt2)' }, bodyEl, 'Cutscenes');
    const rows = audit();
    if (!rows.length) { el('div', { class: 'tc-mut' }, bodyEl, 'No cutscenes yet — create one on the Cutscene tab.'); return; }
    rows.forEach(r => {
      const row = el('div', { class: 'tc-row', style: 'margin:3px 0' }, bodyEl);
      el('span', { style: 'flex:1' }, row, '▦ ' + r.name);
      el('span', { class: 'tc-pill ' + (r.audio ? 'done' : 'planned') }, row, r.audio + ' audio / ' + r.total + ' events');
      el('button', { class: 'tbtn', onclick: () => MT.openCutscene(r.id) }, row, 'Open');
    });
  }

  T.registerTool({
    id: 'cutsceneAudio', label: 'Cutscene audio', icon: '🎬', group: 'Narrative',
    sub: 'score / sfx / stinger cues for cinematics',
    build(host, a) { api = a; bodyEl = host; render(); }
  });
  if (T.roadmapDone) T.roadmapDone(24);
})();
