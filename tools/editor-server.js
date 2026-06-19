// MOSSVEIL Editor server — serves the project + save API for the level editor.
// Run: node tools/editor-server.js   (or double-click "MOSSVEIL Editor.cmd")
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 7707;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

// generic save: writes data/<name>.json + a window.G.<global> mirror, with rolling backups
function saveData(name, global, obj) {
  const json = JSON.stringify(obj, null, 1);
  const bdir = path.join(ROOT, 'data', 'backups');
  fs.mkdirSync(bdir, { recursive: true });
  const cur = path.join(ROOT, 'data', name + '.json');
  if (fs.existsSync(cur)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.copyFileSync(cur, path.join(bdir, `${name}-${stamp}.json`));
    const old = fs.readdirSync(bdir).filter(f => f.startsWith(name + '-')).sort();
    while (old.length > 12) fs.unlinkSync(path.join(bdir, old.shift()));
  }
  fs.writeFileSync(cur, json);
  fs.writeFileSync(path.join(ROOT, 'data', name + '.js'),
    `// generated from data/${name}.json - do not edit by hand (use the editor)\n` +
    'window.G = window.G || {};\nG.' + global + ' = ' + json + ';\n');
}
function saveLevels(levels) { saveData('levels', 'LEVELS', levels); }
function saveCutscenes(cs) { saveData('cutscenes', 'CUTSCENES', cs); }

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  if (url.pathname === '/api/levels' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(fs.readFileSync(path.join(ROOT, 'data', 'levels.json')));
    return;
  }
  if (url.pathname === '/api/cutscenes' && req.method === 'GET') {
    const f = path.join(ROOT, 'data', 'cutscenes.json');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(fs.existsSync(f) ? fs.readFileSync(f) : '{}');
    return;
  }
  if ((url.pathname === '/api/levels' || url.pathname === '/api/cutscenes') && req.method === 'POST') {
    const isCut = url.pathname === '/api/cutscenes';
    let body = '';
    req.on('data', d => { body += d; if (body.length > 50e6) req.destroy(); });
    req.on('end', () => {
      try {
        const obj = JSON.parse(body);
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('bad payload');
        if (isCut) saveCutscenes(obj); else saveLevels(obj);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
        console.log(`[saved] ${Object.keys(obj).length} ${isCut ? 'cutscenes' : 'levels'}`);
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }
  // static files
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/editor/editor.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(fs.readFileSync(file));
});

server.listen(PORT, () => {
  console.log('MOSSVEIL Editor running.');
  console.log(`  Editor:  http://localhost:${PORT}/editor/editor.html`);
  console.log(`  Game:    http://localhost:${PORT}/index.html`);
  console.log('Close this window to stop.');
});
