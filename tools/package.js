// MOSSVEIL — package.js : build a distributable from the project. The game is 100% procedural (no
// binary assets), so a complete build is just every script inlined into ONE self-contained HTML.
//   node tools/package.js            -> dist/mossveil.html         (double-click to play, fully offline)
//   node tools/package.js --desktop  -> dist/desktop/              (an Electron app — npm run dist => .exe)
// Offline, no dependencies. The script list is read live from index.html, so new modules are picked up
// automatically.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

// ---- read index.html, inline every <script> it loads into one self-contained HTML ----
function buildHtml() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const m = html.match(/var scripts\s*=\s*\[([\s\S]*?)\];/);
  if (!m) throw new Error('could not find the scripts array in index.html');
  const files = m[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(s => s && /\.js$/.test(s));
  let inlined = '';
  for (const f of files) {
    const abs = path.join(ROOT, f);
    if (!fs.existsSync(abs)) throw new Error('missing script: ' + f);
    // a literal </script> inside a JS string would close the tag early; neutralise it (equivalent in JS)
    const code = fs.readFileSync(abs, 'utf8').replace(/<\/script>/gi, '<\\/script>');
    inlined += '<script>\n/* ' + f + ' */\n' + code + '\n</script>\n';
  }
  const start = html.indexOf('<script>');
  const end = html.indexOf('</script>', start) + '</script>'.length;
  if (start < 0 || end < start) throw new Error('could not find the loader <script> in index.html');
  const out = html.slice(0, start) + inlined + html.slice(end);
  return { html: out, files };
}

function writeWeb() {
  const { html, files } = buildHtml();
  const dir = path.join(ROOT, 'dist');
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, 'mossveil.html');
  fs.writeFileSync(out, html);
  return { out: path.relative(ROOT, out), bytes: Buffer.byteLength(html), scripts: files.length };
}

// ---- Electron scaffold: a real desktop app (bundles its own Chromium -> no browser needed) ----
const PKG_JSON = JSON.stringify({
  name: 'mossveil',
  version: '1.0.0',
  description: 'MOSSVEIL — Echoes Beneath',
  author: 'MOSSVEIL',
  main: 'main.js',
  scripts: {
    start: 'electron .',
    // default build: @electron/packager -> a runnable app folder. No code signing, no admin/symlinks.
    // --electron-version is pinned (matches the electron devDependency) so the version is never ambiguous.
    dist: 'electron-packager . MOSSVEIL --out=build --overwrite --electron-version=31.7.7 --app-copyright=MOSSVEIL',
    // optional installer (NSIS + single portable .exe). Needs Windows Developer Mode or admin — see README.
    'dist:installer': 'electron-builder'
  },
  devDependencies: { electron: '31.7.7', '@electron/packager': '^18.3.6', 'electron-builder': '^24.13.3' },
  build: {
    appId: 'com.mossveil.game',
    productName: 'MOSSVEIL',
    files: ['main.js', 'mossveil.html'],
    directories: { output: 'build' },
    win: { target: ['portable', 'nsis'] },
    mac: { target: ['dmg'] },
    linux: { target: ['AppImage'] }
  }
}, null, 2) + '\n';

const MAIN_JS = `// MOSSVEIL desktop shell (Electron). Loads the self-contained game in a frameless-ish window.
const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 640, minHeight: 400,
    backgroundColor: '#04070a', autoHideMenuBar: true,
    webPreferences: { contextIsolation: true }
  });
  win.loadFile(path.join(__dirname, 'mossveil.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
`;

const README = `# MOSSVEIL — desktop app

This folder is a self-contained [Electron](https://www.electronjs.org/) wrapper around the game
(\`mossveil.html\`). Building it produces a real desktop application that bundles its own browser
engine, so players need **no browser and no install of anything** — just run the executable.

You need [Node.js](https://nodejs.org/) installed. First, one time:

\`\`\`
npm install        # downloads Electron + the packager (~150 MB)
\`\`\`

## Build the app  (recommended)

\`\`\`
npm run dist
\`\`\`

This uses [@electron/packager](https://github.com/electron/packager) and lands a ready-to-run folder in
**build/MOSSVEIL-win32-x64/** (on Windows). Inside is **MOSSVEIL.exe** — double-click it to play. To hand
the game to someone else, zip that whole folder and send it; they just unzip and run the .exe. No code
signing, no administrator rights, nothing to install.

## Optional: an installer / single portable .exe

\`\`\`
npm run dist:installer
\`\`\`

This uses electron-builder to produce an NSIS **installer** (Start-menu shortcut + uninstaller) and a
**portable single .exe** in \`build/\`. It unpacks a code-signing toolkit that contains symlinks, and on
Windows creating symlinks needs a privilege normal accounts lack — so do **one** of these first:

- turn on **Settings → Privacy & security → For developers → Developer Mode**, or
- run the terminal **as Administrator**.

Otherwise it fails with *"Cannot create symbolic link … a required privilege is not held"*. (The default
\`npm run dist\` above avoids this entirely.) macOS → \`.dmg\`, Linux → \`AppImage\` (build on that OS).

## Run without building

\`\`\`
npm start
\`\`\`

## Updating

Re-run \`node tools/package.js --desktop\` from the project root to refresh \`mossveil.html\`
with the latest game, then \`npm run dist\` again.
`;

function writeDesktop() {
  const { html } = buildHtml();
  const dir = path.join(ROOT, 'dist', 'desktop');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'mossveil.html'), html);
  fs.writeFileSync(path.join(dir, 'package.json'), PKG_JSON);
  fs.writeFileSync(path.join(dir, 'main.js'), MAIN_JS);
  fs.writeFileSync(path.join(dir, 'README.md'), README);
  fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\nbuild/\n');
  return { dir: path.relative(ROOT, dir) };
}

module.exports = { buildHtml, writeWeb, writeDesktop };

if (require.main === module) {
  const desktop = process.argv.indexOf('--desktop') >= 0;
  const w = writeWeb();
  console.log('web   : ' + w.out + '  (' + (w.bytes / 1024 / 1024).toFixed(2) + ' MB, ' + w.scripts + ' scripts inlined)');
  if (desktop) {
    const d = writeDesktop();
    console.log('desktop: ' + d.dir + '  ->  cd ' + d.dir + ' && npm install && npm run dist   (=> build/*.exe)');
  }
  console.log('done.');
}
