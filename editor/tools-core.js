// MOSSVEIL — tools-core.js : the authoring-tools framework (editor-only).
// This is the backbone for the "self-sufficient editor" roadmap. It adds:
//   • an "Edit" menu (mirrors the File menu) that lists every registered authoring tool
//   • an "Editor Settings" panel (opened from File, like Save destination) of preference sections
//   • a reusable full-screen tool-overlay host that each authoring tool draws itself into
//   • registries:  G.Tools.registerTool(...)  and  G.Tools.registerSettings(...)
//   • a data layer:  G.Tools.data.load/save  — every dataset that used to live in code
//       becomes data/<name>.json (+ a window.G mirror) editable forever without touching code
//   • built-ins: command palette (Ctrl+K), keybind editor, theme/appearance, autosave +
//       crash recovery, and a live roadmap/changelog viewer
// Fully offline, editor-only. Players who open the game never load this file.
(function () {
  const T = G.Tools = G.Tools || {};
  const ED = () => G.__ed || {};

  // ---------------- tiny DOM helpers ----------------
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
  const $ = id => document.getElementById(id);

  // ---------------- styles ----------------
  el('style', {}, document.head).textContent = `
  .tc-mw { position:relative; display:inline-block; }
  .tc-overlay { position:fixed; inset:0; z-index:300; display:none; background:rgba(8,9,12,.62); }
  .tc-overlay.on { display:flex; }
  .tc-host { margin:auto; width:min(1180px,94vw); height:min(86vh,820px); background:var(--bg1);
    border:1px solid var(--line); border-radius:10px; box-shadow:0 18px 60px rgba(0,0,0,.6);
    display:flex; flex-direction:column; overflow:hidden; }
  .tc-head { display:flex; align-items:center; gap:10px; padding:9px 12px; background:var(--bg2);
    border-bottom:1px solid var(--line); }
  .tc-head .tc-title { font-weight:600; font-size:14px; }
  .tc-head .tc-sub { color:var(--txt2); font-size:11px; }
  .tc-head .tc-spacer { flex:1; }
  .tc-x { background:var(--bg3); border:1px solid #45454d; color:var(--txt); border-radius:5px;
    width:26px; height:24px; cursor:pointer; font-size:14px; line-height:1; }
  .tc-x:hover { background:#5a2230; border-color:#7a2e3e; }
  .tc-body { flex:1; overflow:auto; padding:14px; }
  /* settings panel */
  .tc-set { margin:auto; width:min(900px,92vw); height:min(78vh,680px); background:var(--bg1);
    border:1px solid var(--line); border-radius:10px; display:flex; overflow:hidden;
    box-shadow:0 18px 60px rgba(0,0,0,.6); }
  .tc-set-tabs { width:210px; background:var(--bg2); border-right:1px solid var(--line);
    padding:8px; overflow:auto; flex-shrink:0; }
  .tc-set-tab { display:flex; gap:8px; align-items:center; padding:8px 10px; border-radius:6px;
    cursor:pointer; color:var(--txt2); font-size:13px; }
  .tc-set-tab:hover { background:var(--bg3); color:var(--txt); }
  .tc-set-tab.on { background:var(--acc); color:#0c1014; }
  .tc-set-main { flex:1; display:flex; flex-direction:column; overflow:hidden; }
  .tc-set-head { padding:11px 14px; border-bottom:1px solid var(--line); display:flex; align-items:center; }
  .tc-set-head h3 { margin:0; font-size:15px; }
  .tc-set-body { flex:1; overflow:auto; padding:14px 16px; }
  .tc-set-body h4 { margin:14px 0 6px; font-size:12px; text-transform:uppercase; letter-spacing:1px; color:var(--txt2); }
  /* command palette */
  .tc-pal { margin:11vh auto auto; width:min(620px,92vw); height:max-content; max-height:64vh;
    background:var(--bg1); border:1px solid var(--line); border-radius:10px; overflow:hidden;
    box-shadow:0 18px 60px rgba(0,0,0,.6); display:flex; flex-direction:column; }
  .tc-pal input { background:var(--bg2); border:none; border-bottom:1px solid var(--line); color:var(--txt);
    font-size:15px; padding:13px 15px; outline:none; }
  .tc-pal-list { overflow:auto; padding:6px; }
  .tc-pal-item { display:flex; align-items:center; gap:10px; padding:8px 11px; border-radius:6px; cursor:pointer; }
  .tc-pal-item .pal-hint { margin-left:auto; color:var(--txt2); font-size:11px; }
  .tc-pal-item.sel, .tc-pal-item:hover { background:var(--bg3); }
  .tc-pal-item.sel { outline:1px solid var(--acc); }
  .tc-pal-empty { padding:18px; color:var(--txt2); text-align:center; }
  /* toast */
  .tc-toast { position:fixed; left:50%; bottom:54px; transform:translateX(-50%); z-index:400;
    background:var(--bg2); border:1px solid var(--line); color:var(--txt); padding:9px 16px;
    border-radius:7px; box-shadow:0 8px 28px rgba(0,0,0,.5); font-size:13px; opacity:0;
    transition:opacity .18s, transform .18s; pointer-events:none; }
  .tc-toast.on { opacity:1; transform:translateX(-50%) translateY(-4px); }
  /* generic tool widgets reused by authoring tools */
  .tc-grid { display:grid; gap:8px; }
  .tc-card { background:var(--bg2); border:1px solid var(--line); border-radius:8px; padding:10px 12px; }
  .tc-row { display:flex; gap:8px; align-items:center; margin:5px 0; }
  .tc-row label { width:150px; color:var(--txt2); font-size:12px; flex-shrink:0; }
  .tc-row input[type=text], .tc-row input[type=number], .tc-row select, .tc-row textarea {
    background:var(--bg3); color:var(--txt); border:1px solid #45454d; border-radius:5px; padding:5px 7px;
    font-size:13px; flex:1; min-width:0; }
  .tc-row input[type=range] { flex:1; }
  .tc-mut { color:var(--txt2); font-size:12px; line-height:1.5; }
  .tc-kbd { display:inline-block; background:var(--bg3); border:1px solid #45454d; border-bottom-width:2px;
    border-radius:4px; padding:1px 6px; font-size:11px; font-family:monospace; }
  .tc-pill { display:inline-block; font-size:10px; padding:1px 7px; border-radius:9px; margin-left:6px;
    text-transform:uppercase; letter-spacing:.6px; }
  .tc-pill.done { background:#1f4d2a; color:#7fe0a0; }
  .tc-pill.planned { background:#33343a; color:var(--txt2); }
  .tc-pill.skip { background:#4d3320; color:#e0b07f; }
  `;

  // ---------------- registries ----------------
  T.tools = [];      // { id, label, icon, group, sub, hotkey, build(host, api) }
  T.settings = [];   // { id, label, icon, build(container, api) }
  T.registerTool = def => {
    if (!def || !def.id) return;
    const i = T.tools.findIndex(t => t.id === def.id);
    if (i >= 0) T.tools[i] = def; else T.tools.push(def);
    if (editMenuBuilt) buildEditMenu();
    return def;
  };
  T.registerSettings = def => {
    if (!def || !def.id) return;
    const i = T.settings.findIndex(t => t.id === def.id);
    if (i >= 0) T.settings[i] = def; else T.settings.push(def);
    return def;
  };

  // ---------------- toast ----------------
  let toastEl, toastTimer;
  T.toast = (msg, ms) => {
    if (!toastEl) toastEl = el('div', { class: 'tc-toast' }, document.body);
    toastEl.textContent = msg;
    toastEl.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('on'), ms || 2200);
  };

  // ---------------- data layer ----------------
  // load(name, fallback): the editable copy lives in data/<name>.json. Prefer the server's
  // current file; else any already-loaded window.G mirror; else the in-code fallback.
  T.data = {
    async load(name, fallback) {
      try {
        const r = await fetch('/api/data/' + name, { cache: 'no-store' });
        if (r.ok) { const j = await r.json(); if (j && Object.keys(j).length) return j; }
      } catch (_) { }
      return fallback;
    },
    // save(name, global, obj): server mode writes the files; github mode commits them.
    async save(name, global, obj) {
      const mode = (ED().effectiveMode && ED().effectiveMode()) || 'local';
      if (mode === 'github') {
        if (!ED().commitData) throw new Error('GitHub data commit unavailable');
        await ED().commitData(name, global, obj);
        return true;
      }
      const r = await fetch('/api/data', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, global, data: obj })
      });
      const j = await r.json().catch(() => ({ ok: false }));
      if (!j.ok) throw new Error(j.error || ('HTTP ' + r.status));
      return true;
    }
  };

  // ================= Edit menu (mirrors the File menu) =================
  let editBtn, editMenu, editMenuBuilt = false;
  function injectEditMenu() {
    const fileBtn = $('btnFile'); if (!fileBtn) return;
    const wrap = el('div', { class: 'menuWrap tc-mw' });
    fileBtn.parentNode.parentNode.insertBefore(wrap, fileBtn.parentNode.nextSibling);
    editBtn = el('button', { class: 'tbtn', id: 'btnEdit', title: 'Authoring tools (E)' }, wrap, '✎ Edit ▾');
    editMenu = el('div', { class: 'ddmenu', id: 'editMenu' }, wrap);
    editBtn.addEventListener('click', e => {
      e.stopPropagation();
      const open = editMenu.classList.contains('on');
      closeAllMenus();
      if (!open) { const r = editBtn.getBoundingClientRect(); editMenu.style.left = r.left + 'px'; editMenu.style.top = (r.bottom + 3) + 'px'; editMenu.classList.add('on'); }
    });
    editMenu.addEventListener('click', () => editMenu.classList.remove('on'));
    document.addEventListener('click', e => { if (editBtn && !editBtn.contains(e.target) && !editMenu.contains(e.target)) editMenu.classList.remove('on'); });
    editMenuBuilt = true;
    buildEditMenu();
  }
  function closeAllMenus() {
    if (editMenu) editMenu.classList.remove('on');
    const fm = $('fileMenu'); if (fm) fm.classList.remove('on');
  }
  function buildEditMenu() {
    if (!editMenu) return;
    editMenu.innerHTML = '';
    // group registered tools
    const groups = {};
    T.tools.forEach(t => { (groups[t.group || 'Tools'] = groups[t.group || 'Tools'] || []).push(t); });
    const order = ['Audio', 'Content', 'World', 'Narrative', 'Systems', 'Tools'];
    const names = Object.keys(groups).sort((a, b) => {
      const ia = order.indexOf(a), ib = order.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    if (!T.tools.length) {
      el('div', { class: 'ddlabel' }, editMenu, 'Authoring tools');
      el('div', { class: 'tc-mut', style: 'padding:4px 11px 8px' }, editMenu, 'Tools appear here as they ship.');
    }
    names.forEach(g => {
      el('div', { class: 'ddlabel' }, editMenu, g);
      groups[g].forEach(t => {
        const b = el('button', { class: 'tbtn ddrow' }, editMenu, (t.icon ? t.icon + ' ' : '') + t.label);
        b.addEventListener('click', () => T.openTool(t.id));
      });
    });
    el('div', { class: 'ddsep' }, editMenu);
    el('div', { class: 'ddlabel' }, editMenu, 'General');
    const pal = el('button', { class: 'tbtn ddrow' }, editMenu, '⌨ Command palette  ·  Ctrl+K');
    pal.addEventListener('click', () => T.openPalette());
    const setb = el('button', { class: 'tbtn ddrow' }, editMenu, '⚙ Editor settings…');
    setb.addEventListener('click', () => T.openSettings());
    const road = el('button', { class: 'tbtn ddrow' }, editMenu, '🗺 Roadmap & changelog');
    road.addEventListener('click', () => T.openSettings('roadmap'));
  }
  // also drop an "Editor settings" row into the File menu, per the requested layout
  function injectFileSettingsRow() {
    const fm = $('fileMenu'); if (!fm) return;
    el('div', { class: 'ddsep' }, fm);
    el('div', { class: 'ddlabel' }, fm, 'Editor');
    const b = el('button', { class: 'tbtn ddrow', id: 'btnEditorSettings' }, fm, '⚙ Editor settings…');
    b.addEventListener('click', () => T.openSettings());
  }

  // ================= tool-overlay host =================
  let host, hostTitle, hostSub, hostBody, hostCurrent = null;
  function ensureHost() {
    if (host) return;
    host = el('div', { class: 'tc-overlay', id: 'toolHost' }, document.body);
    const win = el('div', { class: 'tc-host' }, host);
    const head = el('div', { class: 'tc-head' }, win);
    hostTitle = el('div', { class: 'tc-title' }, head, 'Tool');
    hostSub = el('div', { class: 'tc-sub' }, head, '');
    el('div', { class: 'tc-spacer' }, head);
    el('button', { class: 'tc-x', title: 'Close (Esc)', onclick: () => T.closeTool() }, head, '✕');
    hostBody = el('div', { class: 'tc-body' }, win);
    host.addEventListener('mousedown', e => { if (e.target === host) T.closeTool(); });
  }
  T.openTool = id => {
    const t = T.tools.find(x => x.id === id); if (!t) return false;
    ensureHost();
    hostCurrent = id;
    hostTitle.textContent = (t.icon ? t.icon + '  ' : '') + t.label;
    hostSub.textContent = t.sub || '';
    hostBody.innerHTML = '';
    host.classList.add('on');
    try { t.build(hostBody, T.toolApi(t)); }
    catch (e) { hostBody.innerHTML = ''; el('div', { class: 'tc-mut' }, hostBody, 'Tool error: ' + e.message); console.error(e); }
    return true;
  };
  T.closeTool = () => { if (host) host.classList.remove('on'); hostCurrent = null; };
  // the per-tool API handed to build(): helpers so each tool stays small
  T.toolApi = t => ({
    el, host: () => hostBody, close: () => T.closeTool(), toast: T.toast,
    data: T.data, ed: ED(),
    setSub: s => { if (hostSub) hostSub.textContent = s; }
  });

  // ================= Editor Settings panel =================
  let setOverlay, setTabsEl, setHeadEl, setBodyEl, setCurrent = null;
  function ensureSettings() {
    if (setOverlay) return;
    setOverlay = el('div', { class: 'tc-overlay', id: 'settingsHost' }, document.body);
    const box = el('div', { class: 'tc-set' }, setOverlay);
    setTabsEl = el('div', { class: 'tc-set-tabs' }, box);
    const main = el('div', { class: 'tc-set-main' }, box);
    const head = el('div', { class: 'tc-set-head' }, main);
    setHeadEl = el('h3', {}, head, 'Editor settings');
    el('div', { style: 'flex:1' }, head);
    el('button', { class: 'tc-x', title: 'Close (Esc)', onclick: () => T.closeSettings() }, head, '✕');
    setBodyEl = el('div', { class: 'tc-set-body' }, main);
    setOverlay.addEventListener('mousedown', e => { if (e.target === setOverlay) T.closeSettings(); });
  }
  T.openSettings = sectionId => {
    ensureSettings();
    setOverlay.classList.add('on');
    showSettingsSection(sectionId || setCurrent || (T.settings[0] && T.settings[0].id));
    return true;
  };
  T.closeSettings = () => { if (setOverlay) setOverlay.classList.remove('on'); };
  function showSettingsSection(id) {
    const sec = T.settings.find(s => s.id === id) || T.settings[0];
    if (!sec) return;
    setCurrent = sec.id;
    setTabsEl.innerHTML = '';
    T.settings.forEach(s => {
      const tab = el('div', { class: 'tc-set-tab' + (s.id === sec.id ? ' on' : '') }, setTabsEl,
        (s.icon ? s.icon + '  ' : '') + s.label);
      tab.addEventListener('click', () => showSettingsSection(s.id));
    });
    setHeadEl.textContent = sec.label;
    setBodyEl.innerHTML = '';
    try { sec.build(setBodyEl, { el, toast: T.toast, prefs: T.prefs }); }
    catch (e) { el('div', { class: 'tc-mut' }, setBodyEl, 'Section error: ' + e.message); console.error(e); }
  }

  // ================= preferences store =================
  const PREF_KEY = 'mossveil-editor-prefs';
  const DEFAULT_PREFS = { theme: 'dark', accent: '#4fa3ff', autosave: true, autosaveSec: 90, reduceMotion: false };
  T.prefs = Object.assign({}, DEFAULT_PREFS);
  try { Object.assign(T.prefs, JSON.parse(localStorage.getItem(PREF_KEY)) || {}); } catch (_) { }
  T.savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(T.prefs)); } catch (_) { } };

  // ---- theme/appearance ----
  const THEMES = {
    dark: { '--bg0': '#1b1b1f', '--bg1': '#242428', '--bg2': '#2d2d33', '--bg3': '#37373e', '--line': '#121215', '--txt': '#cfd2d6', '--txt2': '#8a8e96' },
    midnight: { '--bg0': '#0f1117', '--bg1': '#161a23', '--bg2': '#1d2330', '--bg3': '#283142', '--line': '#0a0c12', '--txt': '#d3dae6', '--txt2': '#7e8aa0' },
    slate: { '--bg0': '#23262b', '--bg1': '#2c3036', '--bg2': '#363b43', '--bg3': '#434954', '--line': '#191b1f', '--txt': '#dde1e6', '--txt2': '#969ca6' },
    contrast: { '--bg0': '#000', '--bg1': '#0c0c0e', '--bg2': '#16161a', '--bg3': '#26262c', '--line': '#000', '--txt': '#fff', '--txt2': '#b9bdc6' }
  };
  function applyTheme() {
    const t = THEMES[T.prefs.theme] || THEMES.dark;
    const r = document.documentElement.style;
    for (const k in t) r.setProperty(k, t[k]);
    if (T.prefs.accent) r.setProperty('--acc', T.prefs.accent);
    document.body.classList.toggle('tc-reduce', !!T.prefs.reduceMotion);
  }
  applyTheme();

  T.registerSettings({
    id: 'appearance', label: 'Appearance', icon: '🎨', build(c, a) {
      a.el('div', { class: 'tc-mut' }, c, 'Theme and accent for the editor UI. Saved on this device — it never changes the game itself.');
      a.el('h4', {}, c, 'Theme');
      const r1 = a.el('div', { class: 'tc-row' }, c); a.el('label', {}, r1, 'Base theme');
      const sel = a.el('select', {}, r1);
      [['dark', 'Dark (default)'], ['midnight', 'Midnight'], ['slate', 'Slate'], ['contrast', 'High contrast']].forEach(([v, t]) => {
        const o = a.el('option', { value: v }, sel, t); if (v === T.prefs.theme) o.selected = true;
      });
      sel.addEventListener('change', () => { T.prefs.theme = sel.value; applyTheme(); T.savePrefs(); });
      const r2 = a.el('div', { class: 'tc-row' }, c); a.el('label', {}, r2, 'Accent colour');
      const col = a.el('input', { type: 'color', value: T.prefs.accent }, r2);
      col.addEventListener('input', () => { T.prefs.accent = col.value; applyTheme(); });
      col.addEventListener('change', T.savePrefs);
      const reset = a.el('button', { class: 'tbtn' }, r2, 'Reset');
      reset.addEventListener('click', () => { T.prefs.accent = '#4fa3ff'; col.value = T.prefs.accent; applyTheme(); T.savePrefs(); });
      a.el('h4', {}, c, 'Motion');
      const r3 = a.el('div', { class: 'tc-row' }, c);
      const cb = a.el('input', { type: 'checkbox' }, r3); cb.checked = !!T.prefs.reduceMotion;
      a.el('label', { style: 'width:auto' }, r3, 'Reduce UI animation');
      cb.addEventListener('change', () => { T.prefs.reduceMotion = cb.checked; applyTheme(); T.savePrefs(); });
    }
  });

  // ---- editor preferences (autosave + recovery) ----
  T.registerSettings({
    id: 'editor', label: 'Editor', icon: '⚙', build(c, a) {
      a.el('div', { class: 'tc-mut' }, c, 'Autosave keeps an in-browser snapshot of unsaved work so a crash or accidental close does not lose it. It does NOT commit to GitHub on its own.');
      a.el('h4', {}, c, 'Autosave & crash recovery');
      const r1 = a.el('div', { class: 'tc-row' }, c);
      const cb = a.el('input', { type: 'checkbox' }, r1); cb.checked = !!T.prefs.autosave;
      a.el('label', { style: 'width:auto' }, r1, 'Keep a recovery snapshot of unsaved changes');
      cb.addEventListener('change', () => { T.prefs.autosave = cb.checked; T.savePrefs(); });
      const r2 = a.el('div', { class: 'tc-row' }, c); a.el('label', {}, r2, 'Snapshot every');
      const num = a.el('input', { type: 'number', min: '15', max: '600', step: '15', value: String(T.prefs.autosaveSec) }, r2);
      a.el('span', { class: 'tc-mut' }, r2, 'seconds');
      num.addEventListener('change', () => { T.prefs.autosaveSec = Math.max(15, Math.min(600, +num.value || 90)); num.value = T.prefs.autosaveSec; T.savePrefs(); });
      const stat = a.el('div', { class: 'tc-mut', style: 'margin-top:8px' }, c);
      const snap = readSnapshot();
      stat.textContent = snap ? ('Recovery snapshot on file from ' + new Date(snap.ts).toLocaleString() + '.') : 'No recovery snapshot stored right now.';
      const r3 = a.el('div', { class: 'tc-row', style: 'margin-top:8px' }, c);
      const rec = a.el('button', { class: 'tbtn' }, r3, 'Restore last snapshot'); rec.disabled = !snap;
      rec.addEventListener('click', () => { if (recoverSnapshot()) { T.closeSettings(); T.toast('Recovered unsaved work — review and Save.'); } });
      const clr = a.el('button', { class: 'tbtn' }, r3, 'Discard snapshot'); clr.disabled = !snap;
      clr.addEventListener('click', () => { clearSnapshot(); stat.textContent = 'No recovery snapshot stored right now.'; rec.disabled = clr.disabled = true; });
    }
  });

  // ================= autosave / crash recovery engine =================
  const SNAP_KEY = 'mossveil-recovery';
  function readSnapshot() { try { return JSON.parse(localStorage.getItem(SNAP_KEY)); } catch (_) { return null; } }
  function clearSnapshot() { try { localStorage.removeItem(SNAP_KEY); } catch (_) { } }
  function writeSnapshot() {
    if (!ED().snapshot) return;
    try { localStorage.setItem(SNAP_KEY, JSON.stringify(ED().snapshot())); }
    catch (_) { /* quota — skip silently, the project is too big to keep in localStorage */ }
  }
  function recoverSnapshot() {
    const s = readSnapshot(); if (!s || !ED().loadWorld) return false;
    ED().loadWorld(s.levels, s.cutscenes, s.id);
    return true;
  }
  let lastSnapTs = 0;
  function autosaveTick() {
    if (!ED().isDirty) return;
    if (ED().isDirty()) {
      if (T.prefs.autosave && Date.now() - lastSnapTs > (T.prefs.autosaveSec * 1000 - 200)) { writeSnapshot(); lastSnapTs = Date.now(); }
    } else {
      // saved (or never dirtied) — clear any stale recovery snapshot
      if (readSnapshot()) clearSnapshot();
    }
  }
  setInterval(autosaveTick, 5000);
  // offer recovery on load if a snapshot survived a previous session
  function offerRecoveryOnLoad() {
    const s = readSnapshot(); if (!s) return;
    // wait until the editor has booted a level
    setTimeout(() => {
      T.toast('Unsaved work from a previous session is available — Editor settings ▸ Editor ▸ Restore.', 5200);
    }, 1500);
  }

  // ================= command palette =================
  let pal, palInput, palList, palItems = [], palSel = 0;
  function paletteCommands() {
    const cmds = [];
    T.tools.forEach(t => cmds.push({ label: (t.icon ? t.icon + ' ' : '') + t.label, hint: 'tool', run: () => T.openTool(t.id) }));
    T.settings.forEach(s => cmds.push({ label: 'Settings: ' + s.label, hint: 'settings', run: () => T.openSettings(s.id) }));
    (ED().actions ? ED().actions() : []).forEach(act => cmds.push({ label: act.label, hint: 'action', run: act.run }));
    cmds.push({ label: 'Command palette', hint: 'Ctrl+K', run: () => T.openPalette() });
    return cmds;
  }
  function scoreMatch(q, s) {
    s = s.toLowerCase(); q = q.toLowerCase();
    if (!q) return 1;
    if (s.includes(q)) return 100 - s.indexOf(q);
    let i = 0, sc = 0;
    for (const ch of s) { if (i < q.length && ch === q[i]) { i++; sc++; } }
    return i === q.length ? sc : -1;
  }
  function ensurePalette() {
    if (pal) return;
    pal = el('div', { class: 'tc-overlay', id: 'cmdPalette' }, document.body);
    const box = el('div', { class: 'tc-pal' }, pal);
    palInput = el('input', { type: 'text', placeholder: 'Type a command or tool…  (Esc to close)' }, box);
    palList = el('div', { class: 'tc-pal-list' }, box);
    pal.addEventListener('mousedown', e => { if (e.target === pal) T.closePalette(); });
    palInput.addEventListener('input', renderPalette);
    palInput.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); palSel = Math.min(palItems.length - 1, palSel + 1); paintSel(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); palSel = Math.max(0, palSel - 1); paintSel(); }
      else if (e.key === 'Enter') { e.preventDefault(); runPaletteSel(); }
      else if (e.key === 'Escape') { e.preventDefault(); T.closePalette(); }
    });
  }
  function renderPalette() {
    const q = palInput.value.trim();
    const all = paletteCommands().map(c => ({ c, s: scoreMatch(q, c.label) })).filter(x => x.s >= 0);
    all.sort((a, b) => b.s - a.s);
    palItems = all.map(x => x.c).slice(0, 40);
    palSel = 0;
    palList.innerHTML = '';
    if (!palItems.length) { el('div', { class: 'tc-pal-empty' }, palList, 'No matching commands'); return; }
    palItems.forEach((c, i) => {
      const it = el('div', { class: 'tc-pal-item' + (i === palSel ? ' sel' : '') }, palList);
      el('span', {}, it, c.label);
      el('span', { class: 'pal-hint' }, it, c.hint || '');
      it.addEventListener('mousemove', () => { if (palSel !== i) { palSel = i; paintSel(); } });
      it.addEventListener('click', () => { palSel = i; runPaletteSel(); });
    });
  }
  function paintSel() {
    [...palList.children].forEach((ch, i) => ch.classList.toggle('sel', i === palSel));
    const cur = palList.children[palSel]; if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' });
  }
  function runPaletteSel() {
    const c = palItems[palSel]; if (!c) return;
    T.closePalette();
    try { c.run(); } catch (e) { console.error(e); }
  }
  T.openPalette = () => { ensurePalette(); closeAllMenus(); pal.classList.add('on'); palInput.value = ''; renderPalette(); palInput.focus(); };
  T.closePalette = () => { if (pal) pal.classList.remove('on'); };

  // ================= keybinds =================
  const KEY_KEY = 'mossveil-keys';
  const DEFAULT_KEYS = { palette: 'Ctrl+K', editMenu: 'E' };
  T.keys = Object.assign({}, DEFAULT_KEYS);
  try { Object.assign(T.keys, JSON.parse(localStorage.getItem(KEY_KEY)) || {}); } catch (_) { }
  function saveKeys() { try { localStorage.setItem(KEY_KEY, JSON.stringify(T.keys)); } catch (_) { } }
  function comboOf(e) {
    const p = [];
    if (e.ctrlKey || e.metaKey) p.push('Ctrl');
    if (e.shiftKey) p.push('Shift');
    if (e.altKey) p.push('Alt');
    let k = e.key;
    if (k === ' ') k = 'Space';
    if (k.length === 1) k = k.toUpperCase();
    if (!['Control', 'Shift', 'Alt', 'Meta'].includes(k)) p.push(k);
    return p.join('+');
  }
  const KEY_CMDS = {
    palette: { label: 'Open command palette', run: () => T.openPalette() },
    editMenu: { label: 'Open Edit menu', run: () => { if (editBtn) editBtn.click(); } }
  };
  // built-in editor shortcuts, shown read-only for reference
  const BUILTIN_KEYS = [
    ['Ctrl+S', 'Save all'], ['Ctrl+Z', 'Undo'], ['Ctrl+Y', 'Redo'], ['Ctrl+D', 'Duplicate'],
    ['Ctrl+C / Ctrl+V', 'Copy / paste'], ['Ctrl+G', 'Make prefab'], ['Delete', 'Delete selection'],
    ['Esc', 'Deselect / cancel'], ['G', 'Toggle gizmos'], ['L', 'Align'], ['[ / ]', 'Rotate 15°  (Shift = 1°)'],
    ['F', 'Frame selection'], ['1–5', 'Select / Solid / One-way / Spikes / Erase']
  ];
  addEventListener('keydown', e => {
    // don't steal keys while typing in a field, except the palette which is global
    const typing = /INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '');
    const combo = comboOf(e);
    for (const id in KEY_CMDS) {
      if (T.keys[id] && T.keys[id] === combo) {
        if (typing && id !== 'palette') return;
        // single-letter binds shouldn't fire while typing
        if (typing && !/Ctrl|Alt|Meta/.test(combo)) return;
        e.preventDefault(); KEY_CMDS[id].run(); return;
      }
    }
  }, true);

  T.registerSettings({
    id: 'keybinds', label: 'Keyboard', icon: '⌨', build(c, a) {
      a.el('div', { class: 'tc-mut' }, c, 'Shortcuts for the new authoring tools. Click a binding, then press the keys you want. Built-in editor shortcuts are listed below for reference.');
      a.el('h4', {}, c, 'Tool shortcuts');
      Object.keys(KEY_CMDS).forEach(id => {
        const row = a.el('div', { class: 'tc-row' }, c);
        a.el('label', {}, row, KEY_CMDS[id].label);
        const b = a.el('button', { class: 'tbtn', style: 'min-width:120px' }, row, T.keys[id] || '—');
        b.addEventListener('click', () => {
          b.textContent = 'press keys…'; b.classList.add('on');
          const cap = ev => {
            ev.preventDefault(); ev.stopPropagation();
            if (ev.key === 'Escape') { b.textContent = T.keys[id] || '—'; }
            else { T.keys[id] = comboOf(ev); b.textContent = T.keys[id]; saveKeys(); }
            b.classList.remove('on'); removeEventListener('keydown', cap, true);
          };
          addEventListener('keydown', cap, true);
        });
        const rst = a.el('button', { class: 'tbtn' }, row, 'Reset');
        rst.addEventListener('click', () => { T.keys[id] = DEFAULT_KEYS[id]; b.textContent = T.keys[id]; saveKeys(); });
      });
      a.el('h4', {}, c, 'Built-in shortcuts (reference)');
      const grid = a.el('div', { class: 'tc-grid', style: 'grid-template-columns:1fr 1fr' }, c);
      BUILTIN_KEYS.forEach(([k, lab]) => {
        const card = a.el('div', { class: 'tc-row', style: 'margin:0' }, grid);
        a.el('span', { class: 'tc-kbd' }, card, k);
        a.el('span', { class: 'tc-mut' }, card, lab);
      });
    }
  });

  // ================= roadmap / changelog (#100) =================
  // The living self-sufficiency roadmap. Each authoring tool flips its line to "done" as it ships,
  // so the Companion and you can always see what exists vs what is planned. 70 & 77 are intentionally cut.
  T.ROADMAP = [
    { group: 'A · Content creators', items: [
      [1, 'Music / soundtrack editor', 'planned'], [2, 'Per-track layer mixer', 'planned'], [3, 'Adaptive-music rules', 'planned'],
      [4, 'SFX designer', 'planned'], [5, 'Ambience / soundscape', 'planned'], [6, 'Reverb / space', 'planned'], [7, 'Audio mixer + buses', 'planned'],
      [8, 'Enemy designer', 'planned'], [9, 'Boss designer', 'planned'], [10, 'Attack / move editor', 'planned'], [11, 'Charm designer', 'planned'],
      [12, 'Spell / ability designer', 'planned'], [13, 'Player loadout / abilities', 'planned'], [14, 'Biome / palette editor', 'planned'],
      [15, 'Colour-grade editor', 'planned'], [16, 'Weather preset editor', 'planned'], [17, 'Particle / FX editor', 'planned'],
      [18, 'Decor / foliage editor', 'planned'], [19, 'Furniture & building kit', 'planned'], [20, 'Terrain-material / tileset', 'planned'],
      [21, 'Pickup / item editor', 'planned'], [22, 'Dialogue graph editor', 'planned'], [23, 'Quest editor', 'planned'],
      [24, 'Cutscene editor + audio', 'planned'], [25, 'Animation editor 2.0', 'planned'], [26, 'Journal / bestiary', 'planned'],
      [27, 'Shop / economy editor', 'planned'], [28, 'Lighting editor', 'planned'], [29, 'UI / HUD editor', 'planned'], [30, 'Iconography / font editor', 'planned'] ] },
    { group: 'B · Overhauls', items: [
      [31, 'Logic graph 2.0', 'planned'], [32, 'Inspector 2.0', 'planned'], [33, 'Hierarchy 2.0', 'planned'], [34, 'Asset browser 2.0', 'planned'],
      [35, 'Prefab system 2.0', 'planned'], [36, 'Terrain brushes', 'planned'], [37, 'World / Map editor 2.0', 'planned'], [38, 'Models tab 2.0', 'planned'],
      [39, 'Cutscene timeline 2.0', 'planned'], [40, 'Lint 2.0', 'planned'] ] },
    { group: 'C · Workflow & UX', items: [
      [41, 'Multi-room editing', 'planned'], [42, 'Cross-room copy/paste', 'planned'], [43, 'Smart snapping/align', 'planned'], [44, 'Rulers / guides', 'planned'],
      [45, 'Undo history panel', 'planned'], [46, 'Versioning / snapshots', 'planned'], [47, 'Autosave + crash recovery', 'done'], [48, 'Search everything', 'planned'],
      [49, 'Saved cameras / bookmarks', 'planned'], [50, 'Dockable panels + themes', 'done'], [51, 'Keybind editor', 'done'], [52, 'Command palette', 'done'],
      [53, 'Starter templates', 'planned'], [54, 'Batch find-replace', 'planned'], [55, 'Localization editor', 'planned'], [56, 'Design notes / TODO pins', 'planned'],
      [57, 'Context menus everywhere', 'planned'], [58, 'Touch / iPad parity', 'planned'] ] },
    { group: 'D · Testing / QA', items: [
      [59, 'Spawn-at-click / play-from-cursor', 'planned'], [60, 'Editor debug overlays', 'planned'], [61, 'Live value tweaking', 'planned'],
      [62, 'Time controls in play', 'planned'], [63, 'Cheats panel', 'planned'], [64, 'Level regression record/assert', 'planned'],
      [65, 'Encounter / DPS simulator', 'planned'], [66, 'Death / path heatmaps', 'planned'], [67, 'Per-room perf budgets', 'planned'], [68, 'Screenshot / GIF capture', 'planned'] ] },
    { group: 'E · Rendering', items: [
      [69, 'Dynamic 2.5D lighting + shadows', 'planned'], [70, 'Day/night & time-of-day', 'skip'], [71, 'Volumetric light shafts', 'planned'],
      [72, 'Decals & wet/snow masks', 'planned'], [73, 'Parallax-layer editor', 'planned'], [74, 'Post-stack editor', 'planned'],
      [75, 'Real heat-haze / refraction', 'planned'], [76, 'Camera-system authoring', 'planned'], [77, 'Room-transition / wipe editor', 'skip'], [78, 'Shader / material graph', 'planned'] ] },
    { group: 'F · Audio depth', items: [
      [79, 'Waveform / spectrum visualizers', 'planned'], [80, 'Synth preset library', 'planned'], [81, 'Combat-stem layering', 'planned'],
      [82, 'Music-transition rules', 'planned'], [83, 'Positional / 3D audio', 'planned'], [84, 'Sidechain / ducking', 'planned'], [85, 'SFX randomization pools', 'planned'] ] },
    { group: 'G · Game systems', items: [
      [86, 'Save-slot / checkpoint editor', 'planned'], [87, 'Settings-menu editor', 'planned'], [88, 'Achievements / trophies', 'planned'],
      [89, 'Progression gates / world-state', 'planned'], [90, 'Inventory / equipment', 'planned'], [91, 'Drop-tables editor', 'planned'],
      [92, 'Difficulty / accessibility', 'planned'], [93, 'Tutorial / onboarding', 'planned'], [94, 'Credits-sequence editor', 'planned'] ] },
    { group: 'H · Project / shipping', items: [
      [95, 'Unified Data Manager', 'planned'], [96, 'Dependency view + safe-delete', 'planned'], [97, 'Build / export packager', 'planned'],
      [98, 'Mod / plugin API', 'planned'], [99, 'Data validation + migration', 'planned'], [100, 'Companion auto-docs + changelog', 'planned'] ] }
  ];
  // mark a roadmap item done (called by each tool when it registers)
  T.roadmapDone = (...nums) => {
    const set = new Set(nums);
    T.ROADMAP.forEach(g => g.items.forEach(it => { if (set.has(it[0]) && it[2] !== 'skip') it[2] = 'done'; }));
  };
  T.roadmapStats = () => {
    let done = 0, planned = 0, skip = 0;
    T.ROADMAP.forEach(g => g.items.forEach(it => { it[2] === 'done' ? done++ : it[2] === 'skip' ? skip++ : planned++; }));
    return { done, planned, skip, total: done + planned + skip };
  };
  T.registerSettings({
    id: 'roadmap', label: 'Roadmap', icon: '🗺', build(c, a) {
      const s = T.roadmapStats();
      a.el('div', { class: 'tc-mut' }, c, `The plan to make this editor fully self-sufficient — ${s.done} shipped · ${s.planned} planned · ${s.skip} cut, ${s.total} total. Tools mark themselves done here as they land.`);
      T.ROADMAP.forEach(g => {
        a.el('h4', {}, c, g.group);
        g.items.forEach(([n, title, st]) => {
          const row = a.el('div', { class: 'tc-row', style: 'margin:2px 0' }, c);
          a.el('span', { class: 'tc-mut', style: 'width:30px;text-align:right' }, row, '#' + n);
          a.el('span', { style: 'flex:1' }, row, title);
          a.el('span', { class: 'tc-pill ' + st }, row, st === 'done' ? 'shipped' : st === 'skip' ? 'cut' : 'planned');
        });
      });
    }
  });

  // ================= test / external API =================
  T._test = {
    toolIds: () => T.tools.map(t => t.id),
    settingIds: () => T.settings.map(s => s.id),
    openTool: id => T.openTool(id),
    openSettings: id => T.openSettings(id),
    paletteSearch: q => { ensurePalette(); palInput.value = q; renderPalette(); return palItems.map(c => c.label); },
    roadmapStats: () => T.roadmapStats(),
    saveData: (name, global, obj) => T.data.save(name, global, obj),
    loadData: (name, fb) => T.data.load(name, fb)
  };

  // ================= boot =================
  function init() {
    injectEditMenu();
    injectFileSettingsRow();
    offerRecoveryOnLoad();
  }
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', init);
  else init();
})();
