// MOSSVEIL — tool-packager.js : Export / packaging (Edit ▸ Tools).  Roadmap #97.
// The game is 100% procedural (no binary assets), so a complete build is every script inlined into ONE
// self-contained HTML that plays offline by double-clicking. This tool builds that file IN THE BROWSER
// (it fetches the same scripts index.html loads, same-origin, and concatenates them) and downloads it;
// it also documents the desktop (.exe) route, which wraps that same HTML in an Electron shell via the
// node packager. The canonical builder is tools/package.js (offline); this is the one-click front-end.
(function () {
  const T = G.Tools;
  if (!T) return;

  // read index.html's script list, then fetch + inline each into a single self-contained HTML
  async function buildHtml() {
    const html = await (await fetch('../index.html')).text();
    const m = html.match(/var scripts\s*=\s*\[([\s\S]*?)\];/);
    if (!m) throw new Error('could not find the scripts array in index.html');
    const files = m[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(s => s && /\.js$/.test(s));
    let inlined = '';
    for (const f of files) {
      const code = (await (await fetch('../' + f)).text()).replace(/<\/script>/gi, '<\\/script>');
      inlined += '<script>\n/* ' + f + ' */\n' + code + '\n</script>\n';
    }
    const start = html.indexOf('<script>'), end = html.indexOf('</script>', start) + '</script>'.length;
    return { html: html.slice(0, start) + inlined + html.slice(end), files };
  }

  const API = T.packager = {
    async fileList() { const html = await (await fetch('../index.html')).text(); const m = html.match(/var scripts\s*=\s*\[([\s\S]*?)\];/); return m ? m[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(s => s && /\.js$/.test(s)) : []; },
    buildHtml,
    async download() {
      const { html } = await buildHtml();
      const blob = new Blob([html], { type: 'text/html' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'mossveil.html';
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      return html.length;
    },
    openInTool: () => T.openTool('packager')
  };

  let bodyEl = null, api = null;
  function el(t, a, p, x) { return api.el(t, a, p, x); }
  function code(parent, text) { return el('div', { style: 'font-family:monospace;font-size:12px;background:var(--bg3);border:1px solid var(--line);border-radius:5px;padding:7px 9px;white-space:pre-wrap;color:var(--txt);margin:4px 0' }, parent, text); }

  function render() {
    bodyEl.innerHTML = '';
    bodyEl.style.cssText = 'padding:14px 16px;display:flex;flex-direction:column;gap:14px;overflow:auto';

    el('div', { class: 'tc-mut', style: 'font-size:12px;line-height:1.5' }, bodyEl,
      'MOSSVEIL is all procedural — no images or audio files — so the whole game packs into a single self-contained HTML that runs offline with no install.');

    // ---- web build ----
    const web = el('div', { style: 'padding:12px;border:1px solid var(--line);border-radius:6px;display:flex;flex-direction:column;gap:8px' }, bodyEl);
    el('div', { style: 'font-size:13px;font-weight:600' }, web, '🌐 Single-file web build');
    el('div', { class: 'tc-mut', style: 'font-size:12px;line-height:1.45' }, web, 'One HTML file with every script inlined. Double-click it to play in any browser — no server, no internet, nothing to install. Hand it to anyone or host it anywhere.');
    const status = el('div', { class: 'tc-mut', style: 'font-size:11px;min-height:14px' }, web, '');
    const btn = el('button', { class: 'tbtn on', style: 'padding:9px 14px;align-self:flex-start' }, web, '⬇ Export mossveil.html');
    btn.addEventListener('click', async () => {
      btn.disabled = true; status.textContent = 'Building…';
      try { const n = await API.download(); status.textContent = 'Exported mossveil.html · ' + (n / 1024 / 1024).toFixed(2) + ' MB — check your downloads.'; }
      catch (e) { status.textContent = 'Export failed: ' + e.message; }
      btn.disabled = false;
    });
    el('div', { class: 'tc-mut', style: 'font-size:11px' }, web, 'Or from a terminal in the project root:');
    code(web, 'node tools/package.js');

    // ---- desktop / exe ----
    const ex = el('div', { style: 'padding:12px;border:1px solid var(--line);border-radius:6px;display:flex;flex-direction:column;gap:6px' }, bodyEl);
    el('div', { style: 'font-size:13px;font-weight:600' }, ex, '🖥 Desktop app (.exe)');
    el('div', { class: 'tc-mut', style: 'font-size:12px;line-height:1.45' }, ex,
      'A real desktop application via Electron — it bundles its own browser engine, so players need no browser and no install of anything; they just run the .exe. The node packager writes a ready-to-build Electron project:');
    code(ex, 'node tools/package.js --desktop');
    el('div', { class: 'tc-mut', style: 'font-size:12px' }, ex, 'then, one time (needs Node.js; downloads Electron ≈150 MB):');
    code(ex, 'cd dist/desktop\nnpm install\nnpm run dist');
    el('div', { class: 'tc-mut', style: 'font-size:12px;line-height:1.45' }, ex, 'The build lands in dist/desktop/build/ — a portable MOSSVEIL .exe (double-click to play) and a Setup installer. (macOS → .dmg, Linux → AppImage, built on that OS.)');
    el('div', { class: 'tc-mut', style: 'font-size:11px;opacity:0.8' }, ex, 'The .exe is compiled by Electron on your machine — it can’t be produced from inside the editor (a native build needs the Electron toolchain).');
  }

  T.registerTool({
    id: 'packager', label: 'Export / package', icon: '📦', group: 'Tools',
    sub: 'single-file HTML build · desktop .exe (Electron)',
    build(host, a) { api = a; bodyEl = host; render(); }
  });
  if (T.roadmapDone) T.roadmapDone(97);
})();
