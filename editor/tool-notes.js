// MOSSVEIL — tool-notes.js : Design notes / TODO list (Edit ▸ Project).
// A persistent checklist for building the game — jot tasks, tick them off, and optionally tag a note
// to the level you're on so you can find it later. Stored in this browser (localStorage). Editor-only.
(function () {
  const T = G.Tools;
  if (!T) return;
  const KEY = 'mossveil-notes';
  const ED = () => G.__ed || {};
  function read() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (_) { return []; } }
  function write(l) { try { localStorage.setItem(KEY, JSON.stringify(l)); } catch (_) { } }

  let bodyEl = null, api = null, filter = 'open';
  const MT = T.notes = {
    list() { return read(); },
    add(text, level) { if (!text) return false; const l = read(); l.unshift({ text: String(text), done: false, level: level || null, ts: Date.now() }); write(l); if (bodyEl) render(); return true; },
    toggle(ts) { const l = read(); const n = l.find(x => x.ts === ts); if (n) n.done = !n.done; write(l); if (bodyEl) render(); },
    remove(ts) { write(read().filter(x => x.ts !== ts)); if (bodyEl) render(); },
    clearDone() { write(read().filter(x => !x.done)); if (bodyEl) render(); },
    openInTool() { return T.openTool('notes'); }
  };

  function el(t, a, p, x) { return api.el(t, a, p, x); }
  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = '';
    const curLevel = ED().currentId ? ED().currentId() : null;
    const add = el('div', { style: 'display:flex;gap:6px;margin-bottom:6px' }, bodyEl);
    const inp = el('input', { type: 'text', placeholder: 'Add a task… (Enter)', style: 'flex:1;background:var(--bg3);color:var(--txt);border:1px solid #45454d;border-radius:5px;padding:7px 9px;font-size:14px' }, add);
    let tagLevel = false;
    const tagBtn = el('button', { class: 'tbtn', title: 'Tag this note to the current level' }, add, '📍 ' + (curLevel || 'level'));
    tagBtn.addEventListener('click', () => { tagLevel = !tagLevel; tagBtn.classList.toggle('on', tagLevel); });
    const fire = () => { if (inp.value.trim()) { MT.add(inp.value.trim(), tagLevel ? curLevel : null); inp.value = ''; } };
    el('button', { class: 'tbtn play', onclick: fire }, add, '+ Add');
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') fire(); });
    // filters
    const fr = el('div', { style: 'display:flex;gap:4px;margin:8px 0' }, bodyEl);
    [['open', 'Open'], ['all', 'All'], ['done', 'Done'], ['level', 'This level']].forEach(([id, lab]) => el('button', { class: 'tbtn' + (filter === id ? ' on' : ''), onclick: () => { filter = id; render(); } }, fr, lab));
    el('div', { style: 'flex:1' }, fr);
    el('button', { class: 'tbtn', onclick: () => { if (confirm('Clear all completed notes?')) MT.clearDone(); } }, fr, '🧹 Clear done');
    // list
    let list = read();
    if (filter === 'open') list = list.filter(n => !n.done);
    else if (filter === 'done') list = list.filter(n => n.done);
    else if (filter === 'level') list = list.filter(n => n.level === curLevel);
    if (!list.length) { el('div', { class: 'tc-mut', style: 'padding:12px 0' }, bodyEl, 'No notes here. Add tasks as you build — they persist on this device.'); return; }
    list.forEach(n => {
      const card = el('div', { class: 'tc-card', style: 'display:flex;align-items:center;gap:10px;margin:5px 0' }, bodyEl);
      const cb = el('input', { type: 'checkbox' }, card); cb.checked = n.done;
      cb.addEventListener('change', () => MT.toggle(n.ts));
      el('span', { style: 'flex:1;' + (n.done ? 'text-decoration:line-through;color:var(--txt2)' : '') }, card, n.text);
      if (n.level) { const lb = el('span', { class: 'tc-pill planned', title: 'tagged to level', style: 'cursor:pointer' }, card, '📍 ' + n.level); if (ED().openLevel) lb.addEventListener('click', () => { ED().openLevel(n.level); api.toast('Opened ' + n.level); }); }
      el('span', { class: 'tc-mut', style: 'font-size:11px' }, card, new Date(n.ts).toLocaleDateString());
      el('button', { class: 'tbtn', onclick: () => MT.remove(n.ts) }, card, '🗑');
    });
  }

  T.registerTool({
    id: 'notes', label: 'Design notes / TODO', icon: '📝', group: 'Project',
    sub: 'a persistent build checklist',
    build(host, a) { api = a; bodyEl = host; render(); }
  });
  if (T.roadmapDone) T.roadmapDone(56);
})();
