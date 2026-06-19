// Verifies the editor's save-destination logic:
//  1) served by the local server -> auto-detects "local" (writes files)
//  2) GitHub mode -> commits the four data files via the Git Data API (mocked, no real repo writes)
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');
const path = require('path');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.resolve(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(a.join(' '));

(async () => {
  const server = spawn(process.execPath, [path.join(ROOT, 'tools', 'editor-server.js')], { stdio: 'pipe' });
  await sleep(900);
  const browser = await puppeteer.launch({
    executablePath: EDGE, headless: 'new',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox']
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 820 });
    const errs = [];
    page.on('pageerror', e => errs.push('[err] ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push('[con] ' + m.text()); });

    // ---- phase 1: local auto-detect ----
    await page.goto('http://localhost:7707/editor/editor.html', { waitUntil: 'load' });
    await page.evaluate(() => { localStorage.removeItem('mossveil-savemode'); localStorage.removeItem('mossveil-gh'); });
    await page.reload({ waitUntil: 'load' });
    await sleep(2200);
    const localBtn = await page.evaluate(() => document.getElementById('btnSaveTarget').textContent.trim());
    log('LOCAL MODE target button:', JSON.stringify(localBtn), localBtn === '→ local' ? 'OK' : 'FAIL');

    // ---- phase 2: GitHub mode (mocked api.github.com) ----
    const ghCalls = [];
    let patchCount = 0;
    await page.setRequestInterception(true);
    page.on('request', req => {
      const url = req.url();
      if (url.startsWith('https://api.github.com')) {
        const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS', 'Access-Control-Allow-Headers': '*' };
        if (req.method() === 'OPTIONS') { req.respond({ status: 204, headers }); return; }
        const p = url.replace('https://api.github.com', '');
        ghCalls.push({ method: req.method(), path: p, body: req.postData() });
        let status = 200, body = {};
        if (req.method() === 'GET' && /\/git\/ref\/heads\//.test(p)) body = { object: { sha: 'BASE_SHA' } };
        else if (req.method() === 'GET' && /\/git\/commits\/BASE_SHA$/.test(p)) body = { tree: { sha: 'BASE_TREE' } };
        else if (req.method() === 'POST' && /\/git\/trees$/.test(p)) body = { sha: 'NEW_TREE' };
        else if (req.method() === 'POST' && /\/git\/commits$/.test(p)) body = { sha: 'NEW_COMMIT' };
        else if (req.method() === 'PATCH' && /\/git\/refs\/heads\//.test(p)) {
          // fail the first PATCH like a real "branch moved" conflict, succeed on retry
          if (patchCount++ === 0) { status = 422; body = { message: 'Update is not a fast forward' }; }
          else body = { ref: 'refs/heads/main', object: { sha: 'NEW_COMMIT' } };
        }
        else if (req.method() === 'GET' && /^\/repos\/[^/]+\/[^/]+$/.test(p)) body = { permissions: { push: true } };
        req.respond({ status, contentType: 'application/json', headers, body: JSON.stringify(body) });
        return;
      }
      req.continue();
    });
    await page.evaluate(() => {
      localStorage.setItem('mossveil-savemode', 'github');
      localStorage.setItem('mossveil-gh', JSON.stringify({ owner: 'DylannFontus', repo: 'Mossveil', branch: 'main', token: 'faketoken123' }));
    });
    await page.reload({ waitUntil: 'load' });
    await sleep(2200);
    const ghBtn = await page.evaluate(() => document.getElementById('btnSaveTarget').textContent.trim());
    log('GITHUB MODE target button:', JSON.stringify(ghBtn), ghBtn === '→ GitHub' ? 'OK' : 'FAIL');

    await page.click('#btnSave');
    await sleep(2500);   // allow the 422 retry + backoff

    const seq = ghCalls.map(c => c.method + ' ' + c.path.replace(/\/repos\/[^/]+\/[^/]+/, ''));
    log('GITHUB API SEQUENCE:');
    seq.forEach(s => log('   ' + s));
    const treeCall = ghCalls.find(c => c.method === 'POST' && /\/git\/trees$/.test(c.path));
    let filePaths = [];
    if (treeCall && treeCall.body) { try { filePaths = JSON.parse(treeCall.body).tree.map(t => t.path); } catch (_) { } }
    log('FILES IN COMMIT:', JSON.stringify(filePaths));

    const expectFiles = ['data/levels.json', 'data/levels.js', 'data/cutscenes.json', 'data/cutscenes.js'];
    const filesOk = expectFiles.every(f => filePaths.includes(f)) && filePaths.length === 4;
    const flowOk = seq.includes('GET /git/ref/heads/main') && seq.includes('POST /git/trees') &&
      seq.includes('POST /git/commits') && seq.includes('PATCH /git/refs/heads/main');
    // the first PATCH was forced to 422 — verify it retried (2 PATCH + 2 ref re-reads) and still won
    const patchN = seq.filter(s => s === 'PATCH /git/refs/heads/main').length;
    const refReads = seq.filter(s => s === 'GET /git/ref/heads/main').length;
    const retryOk = patchN >= 2 && refReads >= 2;
    log('RETRY ON 422:', `${patchN} PATCH / ${refReads} ref-reads`, retryOk ? 'OK (self-healed)' : 'FAIL');
    const msg = await page.evaluate(() => document.getElementById('saveMsg').textContent.trim());
    log('SAVE STATUS:', JSON.stringify(msg));
    log('COMMIT FLOW:', flowOk ? 'OK' : 'FAIL', ' FILES:', filesOk ? 'OK' : 'FAIL', ' STATUS:', /saved to GitHub/.test(msg) ? 'OK' : 'FAIL');

    log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO PAGE ERRORS');
  } finally {
    await browser.close();
    server.kill();
  }
})().catch(e => { console.error('GITHUB TEST FAILED', e); process.exit(1); });
