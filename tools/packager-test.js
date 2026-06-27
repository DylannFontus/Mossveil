// Packager (tools/package.js, roadmap #97): builds the distributable and proves it works. Runs the
// node build (web + desktop), inspects both outputs (the single-file HTML inlines every script with NO
// external <script src>, the Electron scaffold is a valid buildable project), and then BOOTS the built
// mossveil.html in a real browser — with everything inlined it makes zero extra requests, so it must run
// with no console errors. Cleans up dist/ afterwards. Zero outbound network.
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const pkg = require('./package.js');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const out = {};
  let server, browser;
  try {
    // ---- node build (web + desktop) ----
    const w = pkg.writeWeb();
    const d = pkg.writeDesktop();
    const htmlPath = path.join(ROOT, w.out);
    const html = fs.readFileSync(htmlPath, 'utf8');
    out.built = fs.existsSync(htmlPath) && w.scripts > 50;
    out.inlined = html.indexOf('THREE') >= 0 && /G\.Main/.test(html) && /MOSSVEIL/.test(html);   // three + game code present
    out.noExternal = !/<script[^>]*\ssrc=/.test(html);                                            // every script is inline
    out.size = w.bytes > 500 * 1024 && w.bytes < 20 * 1024 * 1024;

    // ---- desktop scaffold ----
    const dd = path.join(ROOT, d.dir);
    let pj = null; try { pj = JSON.parse(fs.readFileSync(path.join(dd, 'package.json'), 'utf8')); } catch (e) { }
    const mainJs = fs.existsSync(path.join(dd, 'main.js')) ? fs.readFileSync(path.join(dd, 'main.js'), 'utf8') : '';
    out.desktopPkg = !!(pj && pj.main === 'main.js' && pj.scripts && pj.scripts.dist && pj.devDependencies && pj.devDependencies.electron && pj.build && pj.build.win);
    out.desktopMain = /BrowserWindow/.test(mainJs) && /mossveil\.html/.test(mainJs);
    out.desktopHtml = fs.existsSync(path.join(dd, 'mossveil.html'));
    out.desktopReadme = fs.existsSync(path.join(dd, 'README.md')) && fs.existsSync(path.join(dd, '.gitignore'));

    // ---- BOOT the single-file build in a browser (everything inlined -> zero extra requests) ----
    server = spawn(process.execPath, [path.join(ROOT, 'tools', 'editor-server.js')], { stdio: 'pipe' });
    await wait(800);
    browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
    const errs = []; let netHits = 0, extraReqs = 0;
    const game = await browser.newPage();
    await game.setViewport({ width: 1000, height: 620 });
    game.on('pageerror', e => errs.push('[game] ' + e.message));
    game.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });
    await game.setRequestInterception(true);
    game.on('request', r => {
      const u = r.url();
      if (/^https?:\/\//.test(u) && !u.includes('localhost') && !u.includes('127.0.0.1')) { netHits++; r.abort(); return; }
      if (/\.(js)(\?|$)/.test(u)) extraReqs++;   // a single-file build must load NO external .js
      r.continue();
    });
    await game.goto('http://localhost:7707/dist/mossveil.html?level=gloom&spawn=1', { waitUntil: 'load' });
    await wait(2600);
    const st = await game.evaluate(() => ({ main: !!(window.G && G.Main), player: !!(window.G && G.player), three: !!window.THREE, state: (window.G && G.Main) ? G.Main.state : null }));
    out.boots = st.main && st.player && st.three;
    out.noExtraJs = extraReqs === 0;             // proves it's truly self-contained
    out.noErrors = errs.length === 0;
    out.netZero = netHits === 0;

    console.log('PACKAGER:', JSON.stringify(Object.assign({ scripts: w.scripts, mb: +(w.bytes / 1024 / 1024).toFixed(2), bootState: st.state, extraJsRequests: extraReqs }, out), null, 1));
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
    const keys = ['built', 'inlined', 'noExternal', 'size', 'desktopPkg', 'desktopMain', 'desktopHtml', 'desktopReadme', 'boots', 'noExtraJs', 'noErrors', 'netZero'];
    const ok = keys.every(k => out[k]);
    console.log(ok ? 'PACKAGER TEST: PASS' : 'PACKAGER TEST: FAIL  (' + keys.filter(k => !out[k]).join(', ') + ')');
    process.exitCode = ok ? 0 : 2;
  } catch (e) { console.error('FAILED', e); process.exitCode = 1; }
  finally {
    if (browser) await browser.close();
    if (server) server.kill();
    try { fs.rmSync(DIST, { recursive: true, force: true }); } catch (e) { }
  }
})();
