// Export / packaging tool (roadmap #97): the editor half. The Export tool builds the single-file HTML
// in the browser (fetching the same scripts index.html loads, same-origin) and downloads it; it also
// documents the desktop (.exe) route. This asserts register / palette / #97-done / API, that fileList()
// + buildHtml() inline every script into a self-contained HTML (markers present, NO external <script
// src>), and that the UI renders the web-export button + the Electron/.exe instructions. Zero outbound
// network (every fetch is localhost).
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');
const path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.resolve(__dirname, '..');
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const server = spawn(process.execPath, [path.join(ROOT, 'tools', 'editor-server.js')], { stdio: 'pipe' });
  await wait(800);
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const errs = [];
  let netHits = 0;
  try {
    const ed = await browser.newPage();
    ed.on('pageerror', e => errs.push('[editor] ' + e.message));
    ed.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });
    await ed.setRequestInterception(true);
    ed.on('request', r => { const u = r.url(); if (/^https?:\/\//.test(u) && !u.includes('localhost') && !u.includes('127.0.0.1')) { netHits++; r.abort(); } else r.continue(); });
    await ed.goto('http://localhost:7707/editor/editor.html', { waitUntil: 'load' });
    await wait(2800);

    const o = await ed.evaluate(async () => {
      const T = G.Tools, MT = T.packager, out = {};
      out.registered = T._test.toolIds().includes('packager');
      out.inPalette = T._test.paletteSearch('export').some(l => /export|packag|build/i.test(l));
      out.roadmap = T.ROADMAP.some(g => g.items.some(i => i[0] === 97 && i[2] === 'done'));
      out.api = !!(MT && MT.buildHtml && MT.fileList && MT.download);

      const files = await MT.fileList();
      out.fileList = Array.isArray(files) && files.length > 50 && files.indexOf('src/main.js') >= 0 && files.some(f => /three/.test(f));

      const built = await MT.buildHtml();
      out.inlined = typeof built.html === 'string' && built.html.indexOf('THREE') >= 0 && /G\.Main/.test(built.html);
      out.noExternal = !/<script[^>]*\ssrc=/.test(built.html);
      out.selfContained = built.files.length === files.length && built.html.length > 500 * 1024;

      // UI
      out.opened = T.openTool('packager');
      const host = document.querySelector('.tc-host');
      out.webSection = /Single-file web build/.test(host.textContent) && Array.prototype.slice.call(host.querySelectorAll('button')).some(b => /Export/.test(b.textContent));
      out.desktopSection = /Desktop app/.test(host.textContent) && /package\.js --desktop/.test(host.textContent) && /npm run dist/.test(host.textContent);
      T.closeTool();
      return out;
    });

    console.log('PACKAGER-TOOL:', JSON.stringify(o, null, 1));
    console.log('outbound network blocked-hits:', netHits);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['registered', 'inPalette', 'roadmap', 'api', 'fileList', 'inlined', 'noExternal', 'selfContained', 'opened', 'webSection', 'desktopSection'];
    const ok = keys.every(k => o[k]) && netHits === 0 && !errs.length;
    console.log(ok ? 'PACKAGER-TOOL TEST: PASS' : 'PACKAGER-TOOL TEST: FAIL  (' + keys.filter(k => !o[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally { await browser.close(); server.kill(); }
})();
