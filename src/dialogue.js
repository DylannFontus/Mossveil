// MOSSVEIL — dialogue.js : branching NPC dialogue runtime.
// A dialogue is { name, color, lines:[ { speaker, text, choices?:[ {label, goto, flag, quest, signal} ] } ] }.
// Flow is linear (line i -> i+1) until a line with choices; a choice jumps to `goto`
// (or ends if goto<0 / out of range) and may set a flag, start a quest, or fire a signal.
(function () {
  const D = G.Dialogue = { active: null };
  let cur = null, lineIdx = 0, charT = 0, shown = 0, onEnd = null;

  D.start = (dlg, opts) => {
    if (!dlg || !dlg.lines || !dlg.lines.length) return false;
    cur = dlg; lineIdx = 0; charT = 0; shown = 0; onEnd = (opts && opts.onEnd) || null;
    D.active = cur; if (G.Main) { G.Main.state = 'dialogue'; G.Main.dlgChoice = 0; }
    if (G.Audio && G.Audio.sfx) G.Audio.sfx('uiBell');
    return true;
  };
  D.line = () => cur ? cur.lines[lineIdx] : null;
  D.fullText = () => { const l = D.line(); return l ? (l.text || '') : ''; };
  D.shownText = () => D.fullText().slice(0, shown | 0);
  D.isTyping = () => shown < D.fullText().length;
  D.speaker = () => { const l = D.line(); return (l && l.speaker) || (cur && cur.name) || ''; };
  D.color = () => (cur && cur.color) || '#8fb0c8';
  D.choices = () => { const l = D.line(); return (l && l.choices && l.choices.length) ? l.choices : null; };

  D.update = (dt) => {
    if (!cur) return;
    const full = D.fullText();
    if (shown < full.length) {
      charT += dt; const cps = 42;
      while (charT > 1 / cps && shown < full.length) { charT -= 1 / cps; shown++; if (full[shown - 1] !== ' ' && (shown & 1) && G.Audio && G.Audio.sfx) G.Audio.sfx('talk'); }
    }
  };
  D.advance = () => {                                   // finish typing, then go to the next line / end
    if (!cur) return;
    if (D.isTyping()) { shown = D.fullText().length; return; }
    if (D.choices()) return;                            // a choice must be picked
    const l = D.line();
    if (l && l.end) { end(); return; }                  // branch terminator
    if (l && l.goto != null) { next(l.goto); return; }  // explicit jump on a plain line
    next(lineIdx + 1);
  };
  D.choose = (i) => {
    const ch = D.choices(); if (!ch || !ch[i]) return;
    const c = ch[i];
    if (c.flag) { G.save.flags = G.save.flags || {}; G.save.flags[c.flag] = true; if (G.Main && G.Main.persist) G.Main.persist(); }
    if (c.quest && G.Quests && G.Quests.start) G.Quests.start(c.quest);
    if (c.signal && G.EventGraph && G.EventGraph.signal) G.EventGraph.signal(c.signal);
    if (G.Audio && G.Audio.sfx) G.Audio.sfx('clink');
    next(c.goto != null ? c.goto : lineIdx + 1);
  };
  function next(idx) {
    if (idx == null || idx < 0 || idx >= cur.lines.length) { end(); return; }
    lineIdx = idx; charT = 0; shown = 0;
  }
  function end() {
    const cb = onEnd; cur = null; D.active = null; onEnd = null;
    if (G.Main) G.Main.state = 'play';
    if (cb) cb();
  }
  D.cancel = () => { if (cur) end(); };
})();
